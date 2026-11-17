// Sinfxona chati: guruh chati + shaxsiy yozishmalar (o'qituvchi bilan har doim; o'quvchilar o'rtasida
// faqat o'qituvchi ruxsat bersa). Shikoyat, bloklash, ovozsiz qilish, o'chirish.
// Yangi xabarlar oddiy so'rov (polling) orqali olinadi: ?after=<oxirgi id>.
import type { Express, Request } from "express";
import { z } from "zod";
import { pool } from "./db";
import { requireAuth } from "./auth";
import { ClassError, membership, notifyUsers, route, uuid } from "./classroom";

const fail = (status: number, message: string): never => {
  throw new ClassError(status, message);
};
const userOf = (req: Request) => String(req.session.userId);
const peerId = z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);

/** Ikki kishi o'rtasida yozishish mumkinmi? */
async function canDm(groupId: string, me: string, other: string, teacher: boolean, group: any) {
  if (me === other) return false;
  const target = (await pool.query("SELECT role FROM users WHERE id=$1", [other])).rows[0];
  if (!target) return false;
  const otherTeacher = target.role === "admin";
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
    teacher: r.sender_role === "admin",
    mine: r.sender_id === me,
    body: r.deleted_at ? "" : r.body,
    deleted: !!r.deleted_at,
    replyTo: r.reply_to ? { id: Number(r.reply_to), body: r.reply_deleted ? "" : String(r.reply_body || "").slice(0, 140), name: r.reply_name } : null,
    createdAt: r.created_at,
  };
}
const SELECT = `SELECT m.*, COALESCE(NULLIF(cm.display_name,''), u.full_name) AS sender_name, u.role AS sender_role,
                       r.body AS reply_body, r.deleted_at AS reply_deleted, COALESCE(NULLIF(rcm.display_name,''), ru.full_name) AS reply_name
                  FROM cls_messages m JOIN users u ON u.id=m.sender_id
                  LEFT JOIN cls_members cm ON cm.group_id=m.group_id AND cm.user_id=m.sender_id
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
    const teacherRow = group.teacher_id
      ? (await pool.query("SELECT id, full_name AS name FROM users WHERE id=$1 AND role='admin'", [group.teacher_id])).rows[0]
      : (await pool.query("SELECT id, full_name AS name FROM users WHERE role='admin' AND is_active=true ORDER BY created_at LIMIT 1")).rows[0];
    if (!teacher && teacherRow) addPerson(teacherRow, true);
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
        if (u) addPerson(u, u.role === "admin");
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
    return { messages: rows.map((r) => shape(r, me)), canSend, mutedUntil, blocked, teacher };
  }));

  app.post(P + "/groups/:id/chat", requireAuth, route(async (req) => {
    const id = uuid.parse(req.params.id), me = userOf(req);
    const { group, teacher } = await membership(id, me);
    const b = z.object({ body: z.string().trim().min(1).max(2000), to: peerId.optional().nullable(), replyTo: z.number().int().positive().optional().nullable() }).parse(req.body);
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
    const row = (
      await pool.query("INSERT INTO cls_messages(group_id,sender_id,recipient_id,reply_to,body) VALUES($1,$2,$3,$4,$5) RETURNING id", [id, me, b.to || null, b.replyTo || null, b.body])
    ).rows[0];
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
        await notifyUsers([b.to], id, { title: `${name} sizga yozdi`, body: b.body.slice(0, 140), path: `chat?with=${encodeURIComponent(me)}`, ref: `dm-${id}-${me}-${slot}`, tag: `dm-${me}` });
    } else if (teacher) {
      const ids = (await pool.query("SELECT user_id FROM cls_members WHERE group_id=$1 AND status='active' AND user_id<>$2", [id, me])).rows.map((r: any) => r.user_id);
      await notifyUsers(ids, id, { title: `${group.name}: o‘qituvchi yozdi`, body: b.body.slice(0, 140), path: "chat", ref: `gc-${id}-${slot}`, tag: `chat-${id}` });
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
    const target = (await pool.query("SELECT role FROM users WHERE id=$1", [b.userId])).rows[0] || fail(404, "Foydalanuvchi topilmadi");
    if (target.role === "admin") fail(400, "O‘qituvchini bloklab bo‘lmaydi");
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
}
