// Qo'llanmalar (kitoblar) uchun raqamli kirish:
// - kitob ichidagi bir martalik kod (stiker) yoki admin/sotuvchi telefon raqam orqali biriktiradi;
// - admin o'qituvchiga qo'llanma biriktiradi (bepul yoki Pro);
// - o'qituvchi materiallari (ish dasturi, PDF testlar, javoblar) faqat biriktirilgan o'qituvchiga beriladi.
import express, { type Express, type Request } from "express";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { pool } from "./db";
import { requireAdmin, requireAuth } from "./auth";
import { classStore } from "./class-storage";
import { ClassError, route } from "./classroom";

const fail = (status: number, message: string): never => {
  throw new ClassError(status, message);
};
const guideId = z.string().regex(/^[A-Za-z][A-Za-z0-9-]{0,39}$/);
const userOf = (req: Request) => String(req.session.userId);

/** Chalkash belgilarsiz alifbo (0/O, 1/I/L yo'q): stikerdan qo'lda terish oson. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function makeCode() {
  const bytes = randomBytes(8);
  let s = "";
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return `ZT-${s.slice(0, 4)}-${s.slice(4)}`;
}
/** Foydalanuvchi kiritgan kodni bir xil ko'rinishga keltiradi: bo'sh joy, kichik harf, chiziqlar farq qilmaydi. */
export function normalizeCode(raw: string) {
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^ZT/, "");
  return s.length === 8 ? `ZT-${s.slice(0, 4)}-${s.slice(4)}` : null;
}
export const normPhone = (raw: unknown) => {
  const d = String(raw || "").replace(/\D/g, "");
  const local = d.length === 12 && d.startsWith("998") ? d.slice(3) : d.length === 9 ? d : "";
  return /^[1-9]\d{8}$/.test(local) ? "+998" + local : null;
};

/** Kodni taxmin qilib terishga qarshi: bir foydalanuvchiga soatiga 10 ta noto'g'ri urinish. */
const misses = new Map<string, number[]>();
function tooManyMisses(user: string) {
  const now = Date.now(),
    list = (misses.get(user) || []).filter((t) => now - t < 3600_000);
  misses.set(user, list);
  return list.length >= 10;
}
function miss(user: string) {
  misses.set(user, [...(misses.get(user) || []), Date.now()]);
}

async function userByPhone(raw: unknown) {
  const phone = normPhone(raw) || fail(400, "Telefon raqamni to‘liq yozing, masalan +998 90 123 45 67");
  const u = (await pool.query("SELECT id, full_name, phone FROM users WHERE phone=$1 AND is_active", [phone])).rows[0];
  return u || fail(404, "Bu raqam bilan ro‘yxatdan o‘tgan foydalanuvchi topilmadi. Avval saytda ro‘yxatdan o‘tsin.");
}
/**
 * O'qituvchiga ochiq qo'llanmalar: admin to'g'ridan-to'g'ri biriktirganlari + a'zo bo'lgan o'qituvchilar guruhlariga
 * biriktirilganlari (Bepul; admin tanlagan a'zoga Pro). Guruhdan chiqarilsa yoki guruh yopilsa — kirish ham yopiladi.
 * Bir nechta manba bo'lsa, yuqorisi olinadi ('pro' > 'free').
 */
export async function teacherGuides(user: string): Promise<{ guideId: string; tier: string }[]> {
  const r = await pool.query(
    `SELECT x.guide_id AS "guideId", max(x.tier) AS tier, min(x.since) AS since FROM (
       SELECT t.guide_id, t.tier, t.created_at AS since FROM guide_teachers t WHERE t.user_id=$1
       UNION ALL
       SELECT gg.guide_id, CASE WHEN p.user_id IS NULL THEN 'free' ELSE 'pro' END, gg.created_at
         FROM cls_members m
         JOIN cls_groups g ON g.id=m.group_id AND g.audience='teachers' AND NOT g.archived
         JOIN cls_group_guides gg ON gg.group_id=g.id
         LEFT JOIN cls_group_pro p ON p.group_id=g.id AND p.user_id=m.user_id AND p.guide_id=gg.guide_id
        WHERE m.user_id=$1 AND m.status='active'
     ) x JOIN users u ON u.id=$1 AND u.is_active GROUP BY x.guide_id ORDER BY min(x.since)`,
    [user],
  );
  return r.rows.map((x) => ({ guideId: x.guideId, tier: x.tier }));
}
async function isTeacherOf(user: string, guide: string) {
  return (await teacherGuides(user)).find((g) => g.guideId === guide)?.tier;
}
async function isAdmin(user: string) {
  return (await pool.query("SELECT 1 FROM users WHERE id=$1 AND role='admin' AND is_active", [user])).rowCount! > 0;
}

const MATERIAL_KINDS = ["program", "test", "answers", "other"] as const;

export function registerGuideAccess(app: Express) {
  const G = "/api/platform/guides";
  const A = "/api/platform/admin/guides";

  /* ---------------- O'quvchi va o'qituvchi ---------------- */
  app.get(G + "/access", requireAuth, route(async (req) => {
    const user = userOf(req);
    const [owned, teacher] = await Promise.all([
      pool.query("SELECT guide_id AS \"guideId\", source, created_at AS \"createdAt\" FROM guide_access WHERE user_id=$1 ORDER BY created_at DESC", [user]),
      teacherGuides(user),
    ]);
    return { owned: owned.rows, teacher };
  }));

  app.post(G + "/redeem", requireAuth, route(async (req) => {
    const user = userOf(req);
    if (tooManyMisses(user)) fail(429, "Juda ko‘p noto‘g‘ri urinish. Bir soatdan keyin qayta urinib ko‘ring.");
    const code = normalizeCode(z.object({ code: z.string().max(40) }).parse(req.body).code);
    if (!code) {
      miss(user);
      fail(400, "Kod ZT-XXXX-XXXX ko‘rinishida bo‘ladi. Stikerdagi kodni tekshiring.");
    }
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const row = (await c.query("SELECT * FROM guide_codes WHERE code=$1 FOR UPDATE", [code])).rows[0];
      if (!row) {
        await c.query("ROLLBACK");
        miss(user);
        fail(404, "Bunday kod topilmadi. Harflarni qayta tekshiring.");
      }
      if (row.used_by && row.used_by !== user) {
        await c.query("ROLLBACK");
        fail(409, "Bu kod allaqachon boshqa hisobda faollashtirilgan.");
      }
      if (!row.used_by) await c.query("UPDATE guide_codes SET used_by=$2, used_at=now() WHERE code=$1", [code, user]);
      await c.query(
        "INSERT INTO guide_access(user_id,guide_id,source,ref) VALUES($1,$2,'code',$3) ON CONFLICT(user_id,guide_id) DO NOTHING",
        [user, row.guide_id, code],
      );
      await c.query("INSERT INTO platform_saved_guides(user_id,guide_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [user, row.guide_id]);
      await c.query("COMMIT");
      return { guideId: row.guide_id };
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  }));

  /** O'qituvchi kabineti: biriktirilgan qo'llanmalar va ularning materiallari (fayl o'zi emas, ro'yxat). */
  app.get(G + "/teacher", requireAuth, route(async (req) => {
    const user = userOf(req);
    const guides = await teacherGuides(user);
    const groups = (
      await pool.query(
        `SELECT g.id, g.name,
                (SELECT json_build_object('id',l.id,'title',l.title,'startsAt',l.starts_at,'status',l.status) FROM cls_live_sessions l
                  WHERE l.group_id=g.id AND l.status<>'cancelled' AND l.starts_at+make_interval(mins=>l.duration_minutes) > now()
                  ORDER BY l.starts_at LIMIT 1) AS live
           FROM cls_members m JOIN cls_groups g ON g.id=m.group_id
          WHERE m.user_id=$1 AND m.status='active' AND g.audience='teachers' AND NOT g.archived ORDER BY m.joined_at`,
        [user],
      )
    ).rows;
    const ids = guides.map((g) => g.guideId);
    const mats = ids.length
      ? (await pool.query(
          "SELECT id, guide_id, kind, title, size, content_type FROM guide_materials WHERE guide_id = ANY($1) ORDER BY position, created_at",
          [ids],
        )).rows
      : [];
    return {
      groups,
      guides: guides.map((g) => ({
        ...g,
        materials: mats.filter((m) => m.guide_id === g.guideId).map((m) => ({ id: m.id, kind: m.kind, title: m.title, size: m.size, type: m.content_type })),
      })),
    };
  }));

  /** Material fayli: faqat shu qo'llanmaga biriktirilgan o'qituvchi yoki admin. O'quvchilar hech qachon ololmaydi. */
  app.get(G + "/:id/materials/:mid", requireAuth, async (req, res, next) => {
    try {
      const guide = guideId.parse(req.params.id), user = userOf(req);
      const m = (await pool.query("SELECT * FROM guide_materials WHERE id=$1 AND guide_id=$2", [z.string().uuid().parse(req.params.mid), guide])).rows[0];
      if (!m || !((await isTeacherOf(user, guide)) || (await isAdmin(user)))) return res.status(404).json({ message: "Material topilmadi" });
      const file = await classStore().get(m.storage_key);
      if (!file) return res.status(404).json({ message: "Fayl topilmadi" });
      const name = encodeURIComponent(m.title.replace(/[\\/:*?"<>|]+/g, " ").trim() || "material") + (m.content_type === "application/pdf" ? ".pdf" : "");
      res.set({ "Content-Type": m.content_type, "Cache-Control": "private, no-store", "Content-Disposition": `inline; filename*=UTF-8''${name}` });
      res.send(file.data);
    } catch (e) {
      if (e instanceof z.ZodError) return res.status(404).json({ message: "Material topilmadi" });
      next(e);
    }
  });

  /* ---------------- O'qituvchilar guruhi: qo'llanma biriktirish va Pro (faqat admin) ---------------- */
  const C = "/api/platform/class/admin/groups";
  const teacherGroup = async (raw: unknown) => {
    const id = z.string().uuid().parse(raw);
    const g = (await pool.query("SELECT id, audience FROM cls_groups WHERE id=$1", [id])).rows[0];
    if (!g) fail(404, "Guruh topilmadi");
    if (g.audience !== "teachers") fail(400, "Qo‘llanma faqat o‘qituvchilar guruhiga biriktiriladi");
    return id;
  };
  app.put(C + "/:id/guides", requireAdmin, route(async (req) => {
    const id = await teacherGroup(req.params.id);
    const guides = z.object({ guides: z.array(guideId).max(100) }).parse(req.body).guides;
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("DELETE FROM cls_group_guides WHERE group_id=$1 AND NOT (guide_id = ANY($2))", [id, guides]);
      await c.query("DELETE FROM cls_group_pro WHERE group_id=$1 AND NOT (guide_id = ANY($2))", [id, guides]);
      for (const g of guides) await c.query("INSERT INTO cls_group_guides(group_id,guide_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [id, g]);
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      c.release();
    }
    return { guides };
  }));
  app.put(C + "/:id/pro", requireAdmin, route(async (req) => {
    const id = await teacherGroup(req.params.id);
    const b = z.object({ userId: z.string().min(1).max(100), guideId, on: z.boolean() }).parse(req.body);
    if (b.on) {
      const ok = (await pool.query(
        "SELECT 1 FROM cls_members m JOIN cls_group_guides gg ON gg.group_id=m.group_id AND gg.guide_id=$3 WHERE m.group_id=$1 AND m.user_id=$2 AND m.status='active'",
        [id, b.userId, b.guideId],
      )).rowCount;
      if (!ok) fail(400, "Pro faqat guruhning faol a’zosiga va guruhga biriktirilgan qo‘llanma bo‘yicha beriladi");
      await pool.query("INSERT INTO cls_group_pro(group_id,user_id,guide_id,granted_by) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING", [id, b.userId, b.guideId, userOf(req)]);
    } else await pool.query("DELETE FROM cls_group_pro WHERE group_id=$1 AND user_id=$2 AND guide_id=$3", [id, b.userId, b.guideId]);
    return { ok: true };
  }));

  /* ---------------- Admin ---------------- */
  app.get(A + "/summary", requireAdmin, route(async () => {
    const q = (sql: string) => pool.query(sql).then((r) => r.rows);
    const [codes, access, teachers, materials] = await Promise.all([
      q("SELECT guide_id, count(*)::int AS total, count(used_by)::int AS used FROM guide_codes GROUP BY guide_id"),
      q("SELECT guide_id, count(*)::int AS n FROM guide_access GROUP BY guide_id"),
      q("SELECT guide_id, count(*)::int AS n FROM guide_teachers GROUP BY guide_id"),
      q("SELECT guide_id, count(*)::int AS n FROM guide_materials GROUP BY guide_id"),
    ]);
    const out: Record<string, { codes: number; used: number; learners: number; teachers: number; materials: number }> = {};
    const at = (id: string) => (out[id] ??= { codes: 0, used: 0, learners: 0, teachers: 0, materials: 0 });
    for (const r of codes) Object.assign(at(r.guide_id), { codes: r.total, used: r.used });
    for (const r of access) at(r.guide_id).learners = r.n;
    for (const r of teachers) at(r.guide_id).teachers = r.n;
    for (const r of materials) at(r.guide_id).materials = r.n;
    return { guides: out };
  }));

  app.get(A + "/:id", requireAdmin, route(async (req) => {
    const guide = guideId.parse(req.params.id);
    const [batches, access, teachers, materials] = await Promise.all([
      pool.query("SELECT batch, count(*)::int AS total, count(used_by)::int AS used, min(created_at) AS created_at FROM guide_codes WHERE guide_id=$1 GROUP BY batch ORDER BY min(created_at) DESC", [guide]),
      pool.query("SELECT a.user_id, u.full_name, u.phone, a.source, a.created_at FROM guide_access a JOIN users u ON u.id=a.user_id WHERE a.guide_id=$1 ORDER BY a.created_at DESC LIMIT 300", [guide]),
      pool.query("SELECT t.user_id, u.full_name, u.phone, t.tier, t.created_at FROM guide_teachers t JOIN users u ON u.id=t.user_id WHERE t.guide_id=$1 ORDER BY t.created_at", [guide]),
      pool.query("SELECT id, kind, title, size, content_type, created_at FROM guide_materials WHERE guide_id=$1 ORDER BY position, created_at", [guide]),
    ]);
    return { batches: batches.rows, access: access.rows, teachers: teachers.rows, materials: materials.rows };
  }));

  app.post(A + "/:id/codes", requireAdmin, route(async (req) => {
    const guide = guideId.parse(req.params.id);
    const b = z.object({ count: z.number().int().min(1).max(2000), batch: z.string().trim().max(60).optional() }).parse(req.body);
    const batch = b.batch || new Date().toISOString().slice(0, 10) + " · " + b.count + " ta";
    const codes: string[] = [];
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      while (codes.length < b.count) {
        const code = makeCode();
        const r = await c.query("INSERT INTO guide_codes(code,guide_id,batch,created_by) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING", [code, guide, batch, userOf(req)]);
        if (r.rowCount) codes.push(code);
      }
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      c.release();
    }
    return { batch, codes };
  }));

  /** Bosmaxona/stiker uchun ro'yxat (CSV). Ishlatilganlar ham belgilanadi. */
  app.get(A + "/:id/codes.csv", requireAdmin, route(async (req, res) => {
    const guide = guideId.parse(req.params.id);
    const batch = typeof req.query.batch === "string" ? req.query.batch : null;
    const rows = (await pool.query(
      "SELECT code, batch, used_at FROM guide_codes WHERE guide_id=$1 AND ($2::text IS NULL OR batch=$2) ORDER BY created_at, code",
      [guide, batch],
    )).rows;
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = ["kod,qo'llanma,partiya,ishlatilgan", ...rows.map((r) => [r.code, guide, esc(r.batch), r.used_at ? "ha" : ""].join(","))].join("\n");
    res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${guide}-kodlar.csv"` });
    res.send("﻿" + csv);
  }));

  app.post(A + "/:id/grant", requireAdmin, route(async (req) => {
    const guide = guideId.parse(req.params.id);
    const u = await userByPhone(req.body?.phone);
    await pool.query("INSERT INTO guide_access(user_id,guide_id,source,ref) VALUES($1,$2,'admin',$3) ON CONFLICT(user_id,guide_id) DO NOTHING", [u.id, guide, userOf(req)]);
    await pool.query("INSERT INTO platform_saved_guides(user_id,guide_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [u.id, guide]);
    return { userId: u.id, name: u.full_name };
  }));
  app.delete(A + "/:id/access/:userId", requireAdmin, route(async (req) => {
    await pool.query("DELETE FROM guide_access WHERE guide_id=$1 AND user_id=$2", [guideId.parse(req.params.id), String(req.params.userId)]);
  }));

  app.post(A + "/:id/teachers", requireAdmin, route(async (req) => {
    const guide = guideId.parse(req.params.id);
    const tier = z.enum(["free", "pro"]).default("free").parse(req.body?.tier);
    const u = await userByPhone(req.body?.phone);
    await pool.query(
      "INSERT INTO guide_teachers(user_id,guide_id,tier,assigned_by) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,guide_id) DO UPDATE SET tier=excluded.tier",
      [u.id, guide, tier, userOf(req)],
    );
    return { userId: u.id, name: u.full_name, tier };
  }));
  app.delete(A + "/:id/teachers/:userId", requireAdmin, route(async (req) => {
    await pool.query("DELETE FROM guide_teachers WHERE guide_id=$1 AND user_id=$2", [guideId.parse(req.params.id), String(req.params.userId)]);
  }));

  /** Material yuklash: tana — faylning o'zi (PDF), nomi va turi so'rov qatorida. */
  app.post(
    A + "/:id/materials",
    requireAdmin,
    express.raw({ type: ["application/pdf", "application/octet-stream"], limit: "20mb" }),
    route(async (req) => {
      const guide = guideId.parse(req.params.id);
      const q = z.object({ title: z.string().trim().min(2).max(160), kind: z.enum(MATERIAL_KINDS) }).parse(req.query);
      const data = req.body as Buffer;
      if (!Buffer.isBuffer(data) || data.length < 5 || data.subarray(0, 5).toString() !== "%PDF-") fail(400, "Faqat PDF fayl yuklang");
      const id = randomUUID(), key = `guides/${guide}/${id}.pdf`;
      await classStore().put(key, data, "application/pdf");
      const pos = (await pool.query("SELECT coalesce(max(position),0)+1 AS p FROM guide_materials WHERE guide_id=$1", [guide])).rows[0].p;
      await pool.query(
        "INSERT INTO guide_materials(id,guide_id,kind,title,storage_key,content_type,size,position) VALUES($1,$2,$3,$4,$5,'application/pdf',$6,$7)",
        [id, guide, q.kind, q.title, key, data.length, pos],
      );
      return { id };
    }),
  );
  app.delete(A + "/:id/materials/:mid", requireAdmin, route(async (req) => {
    const m = (await pool.query("DELETE FROM guide_materials WHERE id=$1 AND guide_id=$2 RETURNING storage_key", [z.string().uuid().parse(req.params.mid), guideId.parse(req.params.id)])).rows[0];
    if (m) await classStore().remove(m.storage_key).catch(() => {});
  }));
}
