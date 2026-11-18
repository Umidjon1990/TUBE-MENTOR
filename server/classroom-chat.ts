// Sinfxona chati: guruh chati + shaxsiy yozishmalar (o'qituvchi bilan har doim; o'quvchilar o'rtasida
// faqat o'qituvchi ruxsat bersa). Shikoyat, bloklash, ovozsiz qilish, o'chirish.
// Yangi xabarlar oddiy so'rov (polling) orqali olinadi: ?after=<oxirgi id>.
import type { Express, Request } from "express";
import { z } from "zod";
import { pool } from "./db";
import { requireAuth } from "./auth";
import { ClassError, groupRole, groupStaff, membership, notifyUsers, route, uuid } from "./classroom";
import { classStore } from "./class-storage";

const fail = (status: number, message: string): never => {
  throw new ClassError(status, message);
};
const userOf = (req: Request) => String(req.session.userId);
const peerId = z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);

/** Ikki kishi o'rtasida yozishish mumkinmi? */
async function canDm(groupId: string, me: string, other: string, teacher: boolean, group: any) {
  if (me === other) return false;
  const target = (await pool.query("SELECT 1 FROM users WHERE id=$1", [other])).rows[0];
  if (!target) return false;
  const otherTeacher = !!(await groupRole(groupId, other));
  const otherMember = (await pool.query("SELECT 1 FROM cls_members WHERE group_id=$1 AND user_id=$2 AND status='active'", [groupId, other])).rowCount;
  if (!otherTeacher && !otherMember) return false;
  if (teacher || otherTeacher) return true; // o'qituvchi bilan yozishish har doim ochiq
  if (!group.allow_peer_dm) return false;
  const blocked = (await pool.query("SELECT 1 FROM cls_blocks WHERE (user_id=$1 AND blocked_id=$2) OR (user_id=$2 AND blocked_id=$1)", [me, other])).rowCount;
  return !blocked;
}

function shape(r: any, me: string) {
  return {
    id: Number(r.id),
    senderId: r.sender_id,
    senderName: r.sender_name,
    teacher: !!r.sender_staff,
    staffRole: r.sender_staff || null,
    kind: r.kind || "text",
    file: r.file_key && !r.deleted_at ? { name: r.file_name, mime: r.file_mime, size: r.file_size, seconds: r.audio_seconds } : null,
    mine: r.sender_id === me,
    body: r.deleted_at ? "" : r.body,
    deleted: !!r.deleted_at,
    replyTo: r.reply_to ? { id: Number(r.reply_to), body: r.reply_deleted ? "" : String(r.reply_body || "").slice(0, 140), name: r.reply_name } : null,
    createdAt: r.created_at,
  };
}
const SELECT = `SELECT m.*, COALESCE(NULLIF(cm.display_name,''), u.full_name) AS sender_name, u.role AS sender_role,
                       CASE WHEN sgs.role IS NOT NULL THEN sgs.role WHEN u.role='admin' THEN 'teacher' END AS sender_staff,
                       r.body AS reply_body, r.deleted_at AS reply_deleted, COALESCE(NULLIF(rcm.display_name,''), ru.full_name) AS reply_name
                  FROM cls_messages m JOIN users u ON u.id=m.sender_id
                  LEFT JOIN cls_members cm ON cm.group_id=m.group_id AND cm.user_id=m.sender_id
                  LEFT JOIN cls_group_staff sgs ON sgs.group_id=m.group_id AND sgs.user_id=m.sender_id
                  LEFT JOIN cls_messages r ON r.id=m.reply_to
                  LEFT JOIN users ru ON ru.id=r.sender_id
                  LEFT JOIN cls_members rcm ON rcm.group_id=r.group_id AND rcm.user_id=r.sender_id`;

export function registerClassChat(app: Express) {
  const P = "/api/platform/class";

  /** Suhbatlar ro'yxati: guruh chati, o'qituvchi, (ruxsat bo'lsa) guruhdoshlar; o'qilmaganlar soni bilan. */
  app.get(P + "/groups/:id/chat/threads", requireAuth, route(async (req) => {
    const id = uuid.parse(req.params.id), me = userOf(req);
    const { group, teacher } = await membership(id, me);
    const reads = new Map<string, number>(
      (await pool.query("SELECT thread,last_id FROM cls_chat_reads WHERE group_id=$1 AND user_id=$2", [id, me])).rows.map((r: any) => [r.thread, Number(r.last_id)]),
    );
    const groupLast = (await pool.query(`${SELECT} WHERE m.group_id=$1 AND m.recipient_id IS NULL ORDER BY m.id DESC LIMIT 1`, [id])).rows[0];
    const groupUnread = (
      await pool.query("SELECT count(*)::int AS n FROM cls_messages WHERE group_id=$1 AND recipient_id IS NULL AND sender_id<>$2 AND id>$3 AND deleted_at IS NULL", [id, me, reads.get("group") || 0])
    ).rows[0].n;
    // Shaxsiy suhbatlar: yozishgan odamlar + o'qituvchi (o'quvchi uchun) + guruhdoshlar (ruxsat bo'lsa).
    const dms = (
      await pool.query(
        `SELECT other, max(id) AS last_id FROM (
           SELECT CASE WHEN sender_id=$2 THEN recipient_id ELSE sender_id END AS other, id
             FROM cls_messages WHERE group_id=$1 AND recipient_id IS NOT NULL AND (sender_id=$2 OR recipient_id=$2)) x
          GROUP BY other`,
        [id, me],
      )
    ).rows;
    const people = new Map<string, any>();
    const addPerson = (row: any, teacherFlag: boolean) => people.set(row.id, { userId: row.id, name: row.name, teacher: teacherFlag });
    const staff = await groupStaff(id);
    if (staff.length) for (const st of staff) if (st.user_id !== me) addPerson({ id: st.user_id, name: st.full_name }, true);
    if (!staff.length && !teacher) {
      const admin = (await pool.query("SELECT id, full_name AS name FROM users WHERE role='admin' AND is_active=true ORDER BY created_at LIMIT 1")).rows[0];
      if (admin) addPerson(admin, true);
    }
    if (teacher || group.allow_peer_dm) {
      const blocked = new Set((await pool.query("SELECT blocked_id FROM cls_blocks WHERE user_id=$1", [me])).rows.map((r: any) => r.blocked_id));
      for (const m of (
        await pool.query(
          "SELECT m.user_id AS id, COALESCE(NULLIF(m.display_name,''), u.full_name) AS name FROM cls_members m JOIN users u ON u.id=m.user_id WHERE m.group_id=$1 AND m.status='active' AND m.user_id<>$2 ORDER BY name",
          [id, me],
        )
      ).rows)
        if (!blocked.has(m.id)) addPerson(m, false);
    }
    for (const d of dms)
      if (!people.has(d.other)) {
        const u = (await pool.query("SELECT u.id, COALESCE(NULLIF(m.display_name,''), u.full_name) AS name, u.role FROM users u LEFT JOIN cls_members m ON m.group_id=$1 AND m.user_id=u.id WHERE u.id=$2", [id, d.other])).rows[0];
        if (u) addPerson(u, !!(await groupRole(id, u.id)));
      }
    const threads = [];
    for (const p of people.values()) {
      const last = (
        await pool.query(
          `${SELECT} WHERE m.group_id=$1 AND ((m.sender_id=$2 AND m.recipient_id=$3) OR (m.sender_id=$3 AND m.recipient_id=$2)) ORDER BY m.id DESC LIMIT 1`,
          [id, me, p.userId],
        )
      ).rows[0];
      const unread = (
        await pool.query("SELECT count(*)::int AS n FROM cls_messages WHERE group_id=$1 AND sender_id=$2 AND recipient_id=$3 AND id>$4 AND deleted_at IS NULL", [id, p.userId, me, reads.get(p.userId) || 0])
      ).rows[0].n;
      threads.push({ ...p, last: last ? shape(last, me) : null, unread });
    }
    threads.sort((a, b) => Number(b.teacher) - Number(a.teacher) || (b.last?.id || 0) - (a.last?.id || 0) || String(a.name).localeCompare(String(b.name)));
    return {
      group: { thread: "group", name: group.name, last: groupLast ? shape(groupLast, me) : null, unread: groupUnread },
      people: threads,
      allowPeerDm: group.allow_peer_dm,
      teacher,
    };
  }));

  /** Umumiy o'qilmaganlar soni (pastki menyudagi belgi uchun). */
  app.get(P + "/groups/:id/chat/unread", requireAuth, route(async (req) => {
    const id = uuid.parse(req.params.id), me = userOf(req);
    await membership(id, me);
    const n = (
      await pool.query(
        `SELECT count(*)::int AS n FROM cls_messages m
          WHERE m.group_id=$1 AND m.sender_id<>$2 AND m.deleted_at IS NULL
            AND (m.recipient_id IS NULL OR m.recipient_id=$2)
            AND m.id > COALESCE((SELECT last_id FROM cls_chat_reads r WHERE r.group_id=$1 AND r.user_id=$2 AND r.thread = CASE WHEN m.recipient_id IS NULL THEN 'group' ELSE m.sender_id END),0)
            AND NOT EXISTS(SELECT 1 FROM cls_blocks b WHERE b.user_id=$2 AND b.blocked_id=m.sender_id)`,
        [id, me],
      )
    ).rows[0].n;
    return { unread: n };
  }));

  /** Xabarlar: ?with=<userId> shaxsiy suhbat, bo'lmasa guruh chati. ?after=<id> faqat yangilari. */
  app.get(P + "/groups/:id/chat", requireAuth, route(async (req) => {
    const id = uuid.parse(req.params.id), me = userOf(req);
    const { group, teacher } = await membership(id, me);
    const q = z.object({ with: peerId.optional(), after: z.coerce.number().int().min(0).optional(), before: z.coerce.number().int().min(1).optional() }).parse(req.query);
    let where: string, params: unknown[];
    if (q.with) {
      if (!(await canDm(id, me, q.with, teacher, group))) {
        // Avvalgi yozishma bo'lsa ham o'qish mumkin (masalan, ruxsat keyin o'chirilgan bo'lsa).
        const had = (await pool.query("SELECT 1 FROM cls_messages WHERE group_id=$1 AND ((sender_id=$2 AND recipient_id=$3) OR (sender_id=$3 AND recipient_id=$2)) LIMIT 1", [id, me, q.with])).rowCount;
        if (!had) fail(403, "Bu odam bilan yozishish yopiq");
      }
      where = "m.group_id=$1 AND ((m.sender_id=$2 AND m.recipient_id=$3) OR (m.sender_id=$3 AND m.recipient_id=$2))";
      params = [id, me, q.with];
    } else {
      where = "m.group_id=$1 AND m.recipient_id IS NULL AND NOT EXISTS(SELECT 1 FROM cls_blocks b WHERE b.user_id=$2 AND b.blocked_id=m.sender_id)";
      params = [id, me];
    }
    let rows: any[];
    if (q.after !== undefined)
      rows = (await pool.query(`${SELECT} WHERE ${where} AND m.id>$${params.length + 1} ORDER BY m.id LIMIT 200`, [...params, q.after])).rows;
    else
      rows = (
        await pool.query(`${SELECT} WHERE ${where} ${q.before ? `AND m.id<$${params.length + 1}` : ""} ORDER BY m.id DESC LIMIT 50`, q.before ? [...params, q.before] : params)
      ).rows.reverse();
    const thread = q.with || "group";
    const lastId = rows.length ? Number(rows[rows.length - 1].id) : 0;
    if (lastId)
      await pool.query(
        `INSERT INTO cls_chat_reads(group_id,user_id,thread,last_id) VALUES($1,$2,$3,$4)
         ON CONFLICT(group_id,user_id,thread) DO UPDATE SET last_id=GREATEST(cls_chat_reads.last_id,EXCLUDED.last_id)`,
        [id, me, thread, lastId],
      );
    const member = teacher ? null : (await pool.query("SELECT muted_until FROM cls_members WHERE group_id=$1 AND user_id=$2", [id, me])).rows[0];
    const mutedUntil = member?.muted_until && new Date(member.muted_until) > new Date() ? member.muted_until : null;
    const blocked = q.with ? !!(await pool.query("SELECT 1 FROM cls_blocks WHERE user_id=$1 AND blocked_id=$2", [me, q.with])).rowCount : false;
    const canSend = !mutedUntil && (!q.with || (await canDm(id, me, q.with, teacher, group)));
    const pinnedRow = !q.with && group.pinned_message_id ? (await pool.query(`${SELECT} WHERE m.id=$1 AND m.deleted_at IS NULL`, [group.pinned_message_id])).rows[0] : null;
    return { messages: rows.map((r) => shape(r, me)), canSend, mutedUntil, blocked, teacher, pinned: pinnedRow ? shape(pinnedRow, me) : null };
  }));

  app.post(P + "/groups/:id/chat", requireAuth, route(async (req) => {
    const id = uuid.parse(req.params.id), me = userOf(req);
    const { group, teacher } = await membership(id, me);
    const b = z
      .object({
        body: z.string().trim().max(2000).optional().default(""),
        to: peerId.optional().nullable(),
        replyTo: z.number().int().positive().optional().nullable(),
        file: z.object({ data: z.string().min(50).max(14_000_000), mime: z.string().max(100), name: z.string().trim().max(200).optional().default(""), seconds: z.number().min(0).max(120).optional() }).optional().nullable(),
      })
      .parse(req.body);
    const attachment = b.file ? checkAttachment(Buffer.from(b.file.data, "base64"), b.file.mime, b.file.name, b.file.seconds) : null;
    if (!b.body && !attachment) fail(400, "Xabar bo‘sh");
    if (!teacher) {
      const m = (await pool.query("SELECT muted_until FROM cls_members WHERE group_id=$1 AND user_id=$2", [id, me])).rows[0];
      if (m?.muted_until && new Date(m.muted_until) > new Date()) fail(403, "O‘qituvchi sizga vaqtincha yozishni cheklagan");
      const recent = (await pool.query("SELECT count(*)::int AS n FROM cls_messages WHERE sender_id=$1 AND created_at > now()-interval '1 minute'", [me])).rows[0].n;
      if (recent >= 20) fail(429, "Juda tez yozyapsiz. Bir daqiqadan so‘ng urinib ko‘ring");
    }
    if (b.to && !(await canDm(id, me, b.to, teacher, group))) fail(403, "Bu odam bilan yozishish yopiq");
    if (b.replyTo) {
      const r = (await pool.query("SELECT group_id, recipient_id, sender_id FROM cls_messages WHERE id=$1", [b.replyTo])).rows[0];
      const sameThread = r && r.group_id === id && (b.to ? [r.sender_id, r.recipient_id].includes(b.to) && [r.sender_id, r.recipient_id].includes(me) : !r.recipient_id);
      if (!sameThread) fail(400, "Javob berilayotgan xabar topilmadi");
    }
    let fileKey: string | null = null;
    if (attachment) {
      fileKey = `class/chat/${id}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${attachment.ext}`;
      await classStore().put(fileKey, attachment.data, attachment.mime);
    }
    const row = (
      await pool.query(
        `INSERT INTO cls_messages(group_id,sender_id,recipient_id,reply_to,body,kind,file_key,file_mime,file_name,file_size,audio_seconds)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [id, me, b.to || null, b.replyTo || null, b.body, attachment?.kind || "text", fileKey, attachment?.mime || null, attachment?.name || null, attachment?.data.length || null, attachment?.seconds ?? null],
      )
    ).rows[0];
    const preview = b.body || (attachment?.kind === "voice" ? "🎤 Ovozli xabar" : attachment?.kind === "image" ? "🖼 Rasm" : "📎 " + (attachment?.name || "Fayl"));
    await pool.query(
      `INSERT INTO cls_chat_reads(group_id,user_id,thread,last_id) VALUES($1,$2,$3,$4)
       ON CONFLICT(group_id,user_id,thread) DO UPDATE SET last_id=GREATEST(cls_chat_reads.last_id,EXCLUDED.last_id)`,
      [id, me, b.to || "group", row.id],
    );
    const name = (await pool.query("SELECT COALESCE(NULLIF(m.display_name,''),u.full_name) AS n FROM users u LEFT JOIN cls_members m ON m.group_id=$1 AND m.user_id=u.id WHERE u.id=$2", [id, me])).rows[0]?.n || "";
    // Bildirishnoma: shaxsiy xabar — qabul qiluvchiga; guruhda — faqat o'qituvchi yozganda hammaga.
    // Bir suhbat uchun 10 daqiqada bittadan ortiq xabar yuborilmaydi (ref bo'yicha takror bo'lmaydi).
    const slot = Math.floor(Date.now() / 600000);
    if (b.to) {
      const blockedByTarget = (await pool.query("SELECT 1 FROM cls_blocks WHERE user_id=$1 AND blocked_id=$2", [b.to, me])).rowCount;
      if (!blockedByTarget)
        await notifyUsers([b.to], id, { title: `${name} sizga yozdi`, body: preview.slice(0, 140), path: `chat?with=${encodeURIComponent(me)}`, ref: `dm-${id}-${me}-${slot}`, tag: `dm-${me}` });
    } else if (teacher) {
      const ids = (await pool.query("SELECT user_id FROM cls_members WHERE group_id=$1 AND status='active' AND user_id<>$2", [id, me])).rows.map((r: any) => r.user_id);
      await notifyUsers(ids, id, { title: `${group.name}: o‘qituvchi yozdi`, body: preview.slice(0, 140), path: "chat", ref: `gc-${id}-${slot}`, tag: `chat-${id}` });
    }
    const full = (await pool.query(`${SELECT} WHERE m.id=$1`, [row.id])).rows[0];
    return { message: shape(full, me) };
  }));

  app.delete(P + "/messages/:id", requireAuth, route(async (req) => {
    const id = z.coerce.number().int().positive().parse(req.params.id), me = userOf(req);
    const m = (await pool.query("SELECT * FROM cls_messages WHERE id=$1", [id])).rows[0] || fail(404, "Xabar topilmadi");
    const { teacher } = await membership(m.group_id, me);
    if (m.sender_id !== me && !teacher) fail(403, "Faqat o‘z xabaringizni o‘chira olasiz");
    await pool.query("UPDATE cls_messages SET deleted_at=now() WHERE id=$1 AND deleted_at IS NULL", [id]);
  }));

  app.post(P + "/messages/:id/report", requireAuth, route(async (req) => {
    const id = z.coerce.number().int().positive().parse(req.params.id), me = userOf(req);
    const m = (await pool.query("SELECT * FROM cls_messages WHERE id=$1", [id])).rows[0] || fail(404, "Xabar topilmadi");
    await membership(m.group_id, me);
    if (m.recipient_id && ![m.recipient_id, m.sender_id].includes(me)) fail(404, "Xabar topilmadi");
    await pool.query("INSERT INTO cls_message_reports(message_id,reporter_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [id, me]);
  }));

  app.post(P + "/groups/:id/block", requireAuth, route(async (req) => {
    const id = uuid.parse(req.params.id), me = userOf(req);
    await membership(id, me);
    const b = z.object({ userId: peerId, blocked: z.boolean() }).parse(req.body);
    if (b.userId === me) fail(400, "O‘zingizni bloklab bo‘lmaydi");
    (await pool.query("SELECT 1 FROM users WHERE id=$1", [b.userId])).rows[0] || fail(404, "Foydalanuvchi topilmadi");
    if (await groupRole(id, b.userId)) fail(400, "O‘qituvchini bloklab bo‘lmaydi");
    if (b.blocked) await pool.query("INSERT INTO cls_blocks(user_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [me, b.userId]);
    else await pool.query("DELETE FROM cls_blocks WHERE user_id=$1 AND blocked_id=$2", [me, b.userId]);
  }));

  /** O'qituvchi: shikoyat qilingan xabarlar. */
  app.get(P + "/groups/:id/chat/reports", requireAuth, route(async (req) => {
    const id = uuid.parse(req.params.id), me = userOf(req);
    const { teacher } = await membership(id, me);
    if (!teacher) fail(403, "Faqat o‘qituvchi uchun");
    const rows = (
      await pool.query(
        `SELECT q.*, rep.reports FROM (${SELECT} WHERE m.group_id=$1) q
           JOIN LATERAL (SELECT count(*)::int AS reports, max(created_at) AS last_report FROM cls_message_reports WHERE message_id=q.id) rep ON rep.reports > 0
          ORDER BY rep.last_report DESC LIMIT 100`,
        [id],
      )
    ).rows;
    return { reports: rows.map((r) => ({ ...shape(r, me), body: r.body, reports: r.reports, recipientId: r.recipient_id })) };
  }));
  app.post(P + "/groups/:id/chat/reports/:messageId/dismiss", requireAuth, route(async (req) => {
    const id = uuid.parse(req.params.id), me = userOf(req);
    const { teacher } = await membership(id, me);
    if (!teacher) fail(403, "Faqat o‘qituvchi uchun");
    await pool.query("DELETE FROM cls_message_reports r USING cls_messages m WHERE r.message_id=m.id AND m.group_id=$1 AND m.id=$2", [id, z.coerce.number().int().parse(req.params.messageId)]);
  }));

  /** Ilova qilingan fayl (ovoz, rasm, hujjat): faqat shu suhbat ishtirokchilari. */
  app.get(P + "/messages/:id/file", requireAuth, async (req, res, next) => {
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id), me = userOf(req);
      const m = (await pool.query("SELECT * FROM cls_messages WHERE id=$1 AND deleted_at IS NULL", [id])).rows[0];
      if (!m?.file_key) return res.status(404).json({ message: "Fayl topilmadi" });
      const { teacher, member } = await membership(m.group_id, me);
      if (!teacher && (!member || (m.recipient_id && ![m.recipient_id, m.sender_id].includes(me)))) return res.status(404).json({ message: "Fayl topilmadi" });
      const file = await classStore().get(m.file_key);
      if (!file) return res.status(404).json({ message: "Fayl topilmadi" });
      const safeName = String(m.file_name || "fayl").replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 120);
      // Safari ovozli xabarni faqat Range (206) javobi bilan o'ynatadi.
      const size = file.data.length, range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ""));
      let body = file.data;
      if (range && (range[1] || range[2])) {
        const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
        const end = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
        if (start > end || start >= size) return res.status(416).set("Content-Range", `bytes */${size}`).end();
        body = file.data.subarray(start, end + 1);
        res.status(206).set("Content-Range", `bytes ${start}-${end}/${size}`);
      }
      res.set({
        "Content-Type": m.file_mime || file.mime,
        "Content-Length": String(body.length),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=86400",
        "Content-Disposition": `${m.kind === "file" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(safeName)}`,
        "X-Content-Type-Options": "nosniff",
      });
      res.end(body);
    } catch (error) {
      if (error instanceof ClassError) return res.status(error.status).json({ message: error.message });
      next(error);
    }
  });

  /** Guruh chatining tepasiga xabarni qadash (o'qituvchi). */
  app.post(P + "/groups/:id/chat/pin", requireAuth, route(async (req) => {
    const id = uuid.parse(req.params.id), me = userOf(req);
    const { teacher } = await membership(id, me);
    if (!teacher) fail(403, "Faqat o‘qituvchi uchun");
    const b = z.object({ messageId: z.number().int().positive().nullable() }).parse(req.body);
    if (b.messageId) {
      const m = (await pool.query("SELECT 1 FROM cls_messages WHERE id=$1 AND group_id=$2 AND recipient_id IS NULL AND deleted_at IS NULL", [b.messageId, id])).rowCount;
      if (!m) fail(404, "Xabar topilmadi");
    }
    await pool.query("UPDATE cls_groups SET pinned_message_id=$2 WHERE id=$1", [id, b.messageId]);
  }));
}

/** Chat ilovasi: turi faylning o'zidan aniqlanadi (nomi yoki brauzer aytgani emas). */
const LIMITS = { voice: 3 * 1024 * 1024, image: 6 * 1024 * 1024, file: 10 * 1024 * 1024 };
export function checkAttachment(data: Buffer, declared: string, name: string, seconds?: number) {
  const head = data.subarray(0, 16).toString("latin1");
  let kind: "voice" | "image" | "file", mime: string, ext: string;
  if (head.startsWith("OggS")) [kind, mime, ext] = ["voice", "audio/ogg", "ogg"];
  else if (data[0] === 0x1a && data[1] === 0x45 && data[2] === 0xdf && data[3] === 0xa3) [kind, mime, ext] = ["voice", "audio/webm", "webm"];
  else if (head.slice(4, 8) === "ftyp" && declared.startsWith("audio")) [kind, mime, ext] = ["voice", "audio/mp4", "m4a"];
  else if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) [kind, mime, ext] = ["image", "image/jpeg", "jpg"];
  else if (head.startsWith("\x89PNG")) [kind, mime, ext] = ["image", "image/png", "png"];
  else if (head.startsWith("RIFF") && head.slice(8, 12) === "WEBP") [kind, mime, ext] = ["image", "image/webp", "webp"];
  else if (head.startsWith("%PDF")) [kind, mime, ext] = ["file", "application/pdf", "pdf"];
  else return fail(415, "Bu turdagi faylni yuborib bo‘lmaydi (ovoz, rasm yoki PDF)");
  if (data.length > LIMITS[kind]) fail(413, kind === "voice" ? "Ovozli xabar juda uzun (1 daqiqagacha)" : "Fayl juda katta (rasm 6 MB, PDF 10 MB gacha)");
  if (kind === "voice" && (seconds ?? 0) > 125) fail(400, "Ovozli xabar 2 daqiqadan oshmasin");
  return { kind, mime, ext, data, name: (name || (kind === "voice" ? "ovoz" : kind === "image" ? "rasm" : "hujjat") + "." + ext).slice(0, 200), seconds: kind === "voice" ? Math.round(seconds ?? 0) : undefined };
}
