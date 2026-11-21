// Onlayn kursga qabul: birdan tasdiqlash, oldindan ruxsat berilgan telefonlar, ommaviy oferta va roziliklar.
// Oferta yuz rasmisiz qabul qilinadi (biometrik ma'lumot chet el serverida saqlanmaydi): rozilik vaqti, IP,
// qurilma, hisob va oferta versiyasi yoziladi — bu harakat bilan qabul qilish (aksept) dalili.
import type { Express, Request } from "express";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { pool } from "./db";
import { requireAuth } from "./auth";
import { ClassError, needGroup, requireStaff, route, uuid } from "./classroom";
import { OFFER_CONSENTS, OFFER_DRAFT } from "./offer-draft";

const P = "/api/platform/class";
const userOf = (req: Request) => String(req.session.userId);
const fail = (status: number, message: string): never => {
  throw new ClassError(status, message);
};

/** Telefon raqami: oxirgi 9 raqam (O'zbekiston), boshqa formatda — barcha raqamlar. */
export const phoneKey = (raw: string) => {
  const d = String(raw || "").replace(/\D/g, "");
  return d.length >= 9 && (d.length === 9 || d.startsWith("998")) ? d.slice(-9) : d;
};

/** Faol oferta (eng oxirgi versiya). Jadval bo'sh bo'lsa — qoralama birinchi versiya sifatida yoziladi. */
export async function currentOffer(): Promise<{ version: number; body: string }> {
  let row = (await pool.query("SELECT version, body FROM cls_offers ORDER BY version DESC LIMIT 1")).rows[0];
  if (!row) {
    await pool.query("INSERT INTO cls_offers(body) SELECT $1 WHERE NOT EXISTS (SELECT 1 FROM cls_offers)", [OFFER_DRAFT]);
    row = (await pool.query("SELECT version, body FROM cls_offers ORDER BY version DESC LIMIT 1")).rows[0];
  }
  return row;
}

/** Saytdan kelgan so'rovda haqiqiy mijoz IP si (xizmat kaliti tekshirilgan BFF orqali). */
function clientIp(req: Request) {
  const forwarded = req.get("x-platform-key") ? req.get("x-platform-client-ip") : "";
  return String(forwarded || req.ip || "").slice(0, 64);
}

export const agreementSchema = z.object({
  offerVersion: z.number().int().min(1),
  birthYear: z.number().int().min(1930).max(new Date().getFullYear() - 5),
  guardianName: z.string().trim().max(80).optional(),
  guardianPhone: z.string().trim().max(20).optional(),
  consents: z.record(z.literal(true)),
});

/** Qo'shilishda rozilikni tekshiradi va yozadi; guruhga oferta kerak bo'lmasa null. */
export async function recordAgreement(req: Request, group: { id: string; offer_required: boolean }, name: string, phone: string, raw: unknown) {
  if (!group.offer_required) return null;
  if (!raw) fail(400, "Shartlarga rozilik bering");
  const a = agreementSchema.parse(raw);
  const offer = await currentOffer();
  if (a.offerVersion !== offer.version) fail(409, "Shartlar yangilandi. Sahifani yangilab, qayta o‘qing.");
  for (const c of OFFER_CONSENTS) if (a.consents[c.key] !== true) fail(400, "Barcha bandlarga rozilik belgisini qo‘ying");
  const age = new Date().getFullYear() - a.birthYear;
  if (age < 18 && (!a.guardianName || a.guardianName.length < 3 || phoneKey(a.guardianPhone || "").length < 9))
    fail(400, "18 yoshdan kichik o‘quvchi uchun ota-onasining ismi va telefoni kerak");
  const stamp = new Date().toISOString().slice(2, 7).replace("-", "");
  for (let i = 0; i < 5; i++) {
    const number = `ZT-${stamp}-${randomInt(100000, 999999)}`;
    const r = await pool.query(
      `INSERT INTO cls_agreements(number,group_id,user_id,offer_version,full_name,phone,birth_year,guardian_name,guardian_phone,consents,ip,user_agent)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(number) DO NOTHING RETURNING id,number`,
      [number, group.id, userOf(req), offer.version, name, phone, a.birthYear, age < 18 ? a.guardianName : null, age < 18 ? a.guardianPhone : null,
        JSON.stringify(Object.fromEntries(OFFER_CONSENTS.map((c) => [c.key, true]))), clientIp(req), String(req.get("x-platform-user-agent") || req.get("user-agent") || "").slice(0, 300)],
    );
    if (r.rowCount) return r.rows[0] as { id: string; number: string };
  }
  return fail(500, "Shartnoma raqamini yaratib bo‘lmadi");
}

/** Oldindan ruxsat berilgan raqam bo'lsa — darhol qabul qilinadi. */
export async function isPreapproved(groupId: string, phone: string) {
  return !!(await pool.query("SELECT 1 FROM cls_preapproved WHERE group_id=$1 AND phone=$2", [groupId, phoneKey(phone)])).rowCount;
}

const agreementView = (row: any) => row && {
  id: row.id, number: row.number, groupId: row.group_id, groupName: row.group_name, offerVersion: row.offer_version, offerBody: row.body,
  fullName: row.full_name, phone: row.phone, birthYear: row.birth_year, guardianName: row.guardian_name, guardianPhone: row.guardian_phone,
  consents: OFFER_CONSENTS.filter((c) => row.consents?.[c.key]).map((c) => c.label), ip: row.ip, acceptedAt: row.accepted_at,
};
const AGREEMENT_SQL = `SELECT a.*, o.body, g.name AS group_name FROM cls_agreements a JOIN cls_offers o ON o.version=a.offer_version JOIN cls_groups g ON g.id=a.group_id`;

export function registerClassroomEnroll(app: Express) {
  // Taklif sahifasi uchun: joriy oferta va majburiy bandlar.
  app.get(P + "/offer", route(async () => {
    const o = await currentOffer();
    return { version: o.version, body: o.body, consents: OFFER_CONSENTS };
  }));
  // Admin: oferta matnini yangilash (yangi versiya).
  app.get(P + "/admin/offer", requireStaff, route(async () => {
    const o = await currentOffer();
    const history = (await pool.query("SELECT version, created_at, (SELECT count(*)::int FROM cls_agreements a WHERE a.offer_version=o.version) AS signed FROM cls_offers o ORDER BY version DESC LIMIT 20")).rows;
    return { version: o.version, body: o.body, history };
  }));
  app.put(P + "/admin/offer", requireStaff, route(async (req, res) => {
    if (res.locals.staffRole !== "admin") fail(403, "Ofertani faqat admin o‘zgartiradi");
    const b = z.object({ body: z.string().trim().min(200).max(60000) }).parse(req.body);
    const cur = await currentOffer();
    if (cur.body === b.body) return { version: cur.version };
    const r = await pool.query("INSERT INTO cls_offers(body,created_by) VALUES($1,$2) RETURNING version", [b.body, userOf(req)]);
    return { version: r.rows[0].version };
  }));

  // Birdan tasdiqlash / rad etish (ko'pi bilan 200 ta).
  app.post(P + "/admin/groups/:id/members/bulk", requireStaff, route(async (req) => {
    const id = uuid.parse(req.params.id);
    await needGroup(id, userOf(req));
    const b = z.object({ action: z.enum(["approve", "remove"]), userIds: z.array(z.string().min(1).max(100)).min(1).max(200) }).parse(req.body);
    const r = await pool.query(
      `UPDATE cls_members SET status=$3 WHERE group_id=$1 AND user_id = ANY($2::varchar[]) AND status='pending' RETURNING user_id`,
      [id, b.userIds, b.action === "approve" ? "active" : "removed"],
    );
    return { changed: r.rowCount };
  }));

  // Oldindan ruxsat berilgan raqamlar (to'lov qilganlar): shu raqam bilan kelgan o'quvchi darhol qabul qilinadi.
  app.get(P + "/admin/groups/:id/preapproved", requireStaff, route(async (req) => {
    const id = uuid.parse(req.params.id);
    await needGroup(id, userOf(req), "view");
    return { phones: (await pool.query("SELECT phone FROM cls_preapproved WHERE group_id=$1 ORDER BY created_at", [id])).rows.map((r) => "+998" + r.phone) };
  }));
  app.put(P + "/admin/groups/:id/preapproved", requireStaff, route(async (req) => {
    const id = uuid.parse(req.params.id);
    await needGroup(id, userOf(req));
    const b = z.object({ phones: z.array(z.string().max(30)).max(500) }).parse(req.body);
    const keys = [...new Set(b.phones.map(phoneKey).filter((k) => k.length === 9))];
    await pool.query("DELETE FROM cls_preapproved WHERE group_id=$1 AND NOT (phone = ANY($2::text[]))", [id, keys]);
    if (keys.length) await pool.query("INSERT INTO cls_preapproved(group_id,phone) SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING", [id, keys]);
    // Shu raqamlar bilan kutib turganlar ham darhol qabul qilinadi.
    const approved = keys.length
      ? (await pool.query("UPDATE cls_members SET status='active' WHERE group_id=$1 AND status='pending' AND right(regexp_replace(phone,'\\D','','g'),9) = ANY($2::text[]) RETURNING user_id", [id, keys])).rowCount
      : 0;
    return { phones: keys.map((k) => "+998" + k), approved };
  }));

  // Shartnoma nusxalari: o'quvchi o'zinikini, o'qituvchi guruhidagilarnikini ko'radi.
  app.get(P + "/my/agreements", requireAuth, route(async (req) => ({
    agreements: (await pool.query(AGREEMENT_SQL + " WHERE a.user_id=$1 ORDER BY a.accepted_at DESC", [userOf(req)])).rows.map(agreementView),
  })));
  app.get(P + "/agreements/:id", requireAuth, route(async (req) => {
    const row = (await pool.query(AGREEMENT_SQL + " WHERE a.id=$1", [uuid.parse(req.params.id)])).rows[0];
    if (!row) fail(404, "Shartnoma topilmadi");
    if (row.user_id !== userOf(req)) await needGroup(row.group_id, userOf(req), "view");
    return { agreement: agreementView(row) };
  }));
}
