// O'qituvchi xonasi (/ustoz) uchun API: o'qituvchilar boshqaruvi, "Bugun", barcha guruhlar bo'yicha xabarlar,
// bir nechta guruhga e'lon, tayyor javoblar, o'quvchi kartasi va eslatmalar, taqvim, vazifalar ro'yxati.
// Har bir so'rov faqat foydalanuvchi xodim bo'lgan guruhlar ichida ishlaydi (admin — hamma guruhda).
import type { Express, Request } from "express";
import { z } from "zod";
import { pool } from "./db";
import { requireAdmin } from "./auth";
import { ClassError, groupRole, needGroup, notifyGroup, requireStaff, route, staffRole, uuid } from "./classroom";

const fail = (status: number, message: string): never => {
  throw new ClassError(status, message);
};
const userOf = (req: Request) => String(req.session.userId);
const digits = (v: string) => v.replace(/\D/g, "");
const TASHKENT = 5 * 3600e3;

/** Foydalanuvchi xodim bo'lgan guruhlar (admin — barcha faol guruhlar). */
export async function myGroups(userId: string) {
  const role = await staffRole(userId);
  if (!role) return [];
  return (
    await pool.query(
      `SELECT g.id, g.name, g.course_id, c.title AS course_title, COALESCE(gs.role, 'admin') AS my_role
         FROM cls_groups g JOIN cls_courses c ON c.id=g.course_id
         LEFT JOIN cls_group_staff gs ON gs.group_id=g.id AND gs.user_id=$1
        WHERE NOT g.archived AND ($2 OR gs.user_id IS NOT NULL) ORDER BY g.created_at DESC`,
      [userId, role === "admin"],
    )
  ).rows as { id: string; name: string; course_id: string; course_title: string; my_role: string }[];
}

/** Ikki kishi kamida bitta guruhda (biri xodim, biri o'quvchi) bo'lsa — o'quvchi kartasini ochish mumkin. */
async function needStudent(staffId: string, studentId: string) {
  const groups = (await myGroups(staffId)).map((g) => g.id);
  if (!groups.length) fail(404, "O‘quvchi topilmadi");
  const shared = (await pool.query("SELECT group_id FROM cls_members WHERE user_id=$1 AND group_id = ANY($2::uuid[]) AND status<>'removed'", [studentId, groups])).rows.map((r: any) => r.group_id);
  if (!shared.length) fail(404, "O‘quvchi topilmadi");
  return shared as string[];
}

const SMSG = `SELECT m.id, m.group_id, m.sender_id, m.recipient_id, m.body, m.kind, m.deleted_at, m.created_at,
                     COALESCE(NULLIF(cm.display_name,''), u.full_name) AS sender_name
                FROM cls_messages m JOIN users u ON u.id=m.sender_id
                LEFT JOIN cls_members cm ON cm.group_id=m.group_id AND cm.user_id=m.sender_id`;
const preview = (r: any) =>
  !r ? null : { id: Number(r.id), senderId: r.sender_id, senderName: r.sender_name, body: r.deleted_at ? "" : r.body, kind: r.kind, deleted: !!r.deleted_at, createdAt: r.created_at };

export function registerClassStaff(app: Express) {
  const P = "/api/platform/class";

  /* ================= Admin: o'qituvchilar ================= */
  app.get(P + "/admin/staff", requireAdmin, route(async () => ({
    staff: (
      await pool.query(
        `SELECT s.user_id, s.role, s.active, s.created_at, u.full_name, u.username, u.email,
                COALESCE((SELECT json_agg(json_build_object('id',g.id,'name',g.name,'role',gs.role) ORDER BY g.name)
                            FROM cls_group_staff gs JOIN cls_groups g ON g.id=gs.group_id WHERE gs.user_id=s.user_id AND NOT g.archived),'[]') AS groups
           FROM cls_staff s JOIN users u ON u.id=s.user_id ORDER BY s.active DESC, u.full_name`,
      )
    ).rows,
  })));
  /** Foydalanuvchini login, email yoki guruhda yozgan telefon raqami bo'yicha topib, rol berish. */
  app.post(P + "/admin/staff", requireAdmin, route(async (req) => {
    const b = z.object({ login: z.string().trim().min(3).max(200), role: z.enum(["teacher", "assistant"]) }).parse(req.body);
    const phone = digits(b.login);
    const u =
      (await pool.query("SELECT id, full_name, role FROM users WHERE lower(username)=lower($1) OR lower(email)=lower($1) LIMIT 1", [b.login])).rows[0] ||
      (phone.length >= 9
        ? (await pool.query("SELECT u.id, u.full_name, u.role FROM cls_members m JOIN users u ON u.id=m.user_id WHERE right(regexp_replace(m.phone,'\\D','','g'),9)=right($1,9) ORDER BY m.joined_at DESC LIMIT 1", [phone])).rows[0]
        : null);
    if (!u) fail(404, "Bunday foydalanuvchi topilmadi. Avval u saytda ro‘yxatdan o‘tsin (login, email yoki guruhdagi telefon raqami bilan qidiriladi)");
    if (u.role === "admin") fail(400, "Bu foydalanuvchi admin — unga alohida rol kerak emas");
    await pool.query(
      "INSERT INTO cls_staff(user_id,role,active) VALUES($1,$2,true) ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role, active=true",
      [u.id, b.role],
    );
    return { user: { id: u.id, name: u.full_name }, role: b.role };
  }));
  app.patch(P + "/admin/staff/:userId", requireAdmin, route(async (req) => {
    const b = z.object({ role: z.enum(["teacher", "assistant"]).optional(), active: z.boolean().optional() }).parse(req.body);
    const r = await pool.query("UPDATE cls_staff SET role=COALESCE($2,role), active=COALESCE($3,active) WHERE user_id=$1", [req.params.userId, b.role ?? null, b.active ?? null]);
    if (!r.rowCount) fail(404, "O‘qituvchi topilmadi");
  }));

  /** Guruhga o'qituvchi yoki yordamchi biriktirish (admin yoki shu guruh o'qituvchisi). */
  app.put(P + "/admin/groups/:id/staff", requireStaff, route(async (req) => {
    const id = uuid.parse(req.params.id), me = userOf(req);
    await needGroup(id, me);
    const b = z.object({ userId: z.string().min(1).max(100), role: z.enum(["teacher", "assistant"]).nullable() }).parse(req.body);
    if (b.role === null) {
      const left = (await pool.query("SELECT count(*)::int AS n FROM cls_group_staff WHERE group_id=$1 AND role='teacher' AND user_id<>$2", [id, b.userId])).rows[0].n;
      const target = (await pool.query("SELECT role FROM cls_group_staff WHERE group_id=$1 AND user_id=$2", [id, b.userId])).rows[0];
      if (target?.role === "teacher" && !left) fail(400, "Guruhda kamida bitta o‘qituvchi qolishi kerak");
      await pool.query("DELETE FROM cls_group_staff WHERE group_id=$1 AND user_id=$2", [id, b.userId]);
      return { ok: true };
    }
    const role = await staffRole(b.userId);
    if (!role) fail(400, "Bu foydalanuvchi o‘qituvchi emas. Admin avval unga rol bersin");
    await pool.query(
      "INSERT INTO cls_group_staff(group_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(group_id,user_id) DO UPDATE SET role=EXCLUDED.role",
      [id, b.userId, b.role],
    );
    return { ok: true };
  }));
  /** Guruhga qo'shish mumkin bo'lgan xodimlar ro'yxati. */
  app.get(P + "/staff/colleagues", requireStaff, route(async () => ({
    people: (
      await pool.query(
        `SELECT u.id, u.full_name, CASE WHEN u.role='admin' THEN 'admin' ELSE s.role END AS role
           FROM users u LEFT JOIN cls_staff s ON s.user_id=u.id
          WHERE u.is_active AND (u.role='admin' OR s.active) ORDER BY u.full_name`,
      )
    ).rows,
  })));

  /* ================= Men va guruhlarim ================= */
  app.get(P + "/staff/me", requireStaff, route(async (req, res) => {
    const me = userOf(req);
    const u = (await pool.query("SELECT id, full_name FROM users WHERE id=$1", [me])).rows[0];
    return { id: u.id, name: u.full_name, role: res.locals.staffRole, groups: await myGroups(me) };
  }));

  /* ================= Bugun ================= */
  app.get(P + "/staff/today", requireStaff, route(async (req) => {
    const me = userOf(req);
    const groups = await myGroups(me);
    const ids = groups.map((g) => g.id);
    if (!ids.length) return { groups: [], live: [], pending: [], waitingReview: 0, unread: 0, attention: [], lessonsToday: [] };
    const local = new Date(Date.now() + TASHKENT);
    const dayStart = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - TASHKENT);
    const dayEnd = new Date(dayStart.getTime() + 86400e3);
    const live = (
      await pool.query(
        `SELECT s.id, s.group_id, g.name AS group_name, s.title, s.starts_at, s.duration_minutes, s.status
           FROM cls_live_sessions s JOIN cls_groups g ON g.id=s.group_id
          WHERE s.group_id = ANY($1::uuid[]) AND s.status IN ('scheduled','live')
            AND (s.status='live' OR (s.starts_at >= $2 AND s.starts_at < $3) OR (s.starts_at < now() AND s.starts_at + make_interval(mins => s.duration_minutes + 30) > now()))
          ORDER BY s.starts_at`,
        [ids, dayStart, dayEnd],
      )
    ).rows;
    const lessonsToday = (
      await pool.query(
        `SELECT gl.group_id, g.name AS group_name, l.id AS lesson_id, l.title, gl.opens_at, gl.due_at
           FROM cls_group_lessons gl JOIN cls_lessons l ON l.id=gl.lesson_id JOIN cls_groups g ON g.id=gl.group_id
          WHERE gl.group_id = ANY($1::uuid[]) AND ((gl.opens_at >= $2 AND gl.opens_at < $3) OR (gl.due_at >= $2 AND gl.due_at < $3))
          ORDER BY COALESCE(gl.opens_at, gl.due_at)`,
        [ids, dayStart, dayEnd],
      )
    ).rows;
    const pending = (
      await pool.query(
        `SELECT m.group_id, g.name AS group_name, m.user_id, COALESCE(NULLIF(m.display_name,''),u.full_name) AS name, m.phone, m.joined_at
           FROM cls_members m JOIN users u ON u.id=m.user_id JOIN cls_groups g ON g.id=m.group_id
          WHERE m.group_id = ANY($1::uuid[]) AND m.status='pending' ORDER BY m.joined_at`,
        [ids],
      )
    ).rows;
    const waitingReview = (await pool.query("SELECT count(*)::int AS n FROM cls_submissions WHERE group_id = ANY($1::uuid[]) AND status='submitted'", [ids])).rows[0].n;
    const unread = (
      await pool.query(
        `SELECT count(*)::int AS n FROM cls_messages m
          WHERE m.group_id = ANY($1::uuid[]) AND m.sender_id<>$2 AND m.deleted_at IS NULL AND (m.recipient_id IS NULL OR m.recipient_id=$2)
            AND m.id > COALESCE((SELECT last_id FROM cls_chat_reads r WHERE r.group_id=m.group_id AND r.user_id=$2 AND r.thread = CASE WHEN m.recipient_id IS NULL THEN 'group' ELSE m.sender_id END),0)`,
        [ids, me],
      )
    ).rows[0].n;
    // Diqqat talab qiladi: muddati o'tgan, testdan o'tilmagan dars; ketma-ket 2 ta jonli darsni o'tkazib yuborish.
    const overdue = (
      await pool.query(
        `SELECT m.group_id, g.name AS group_name, m.user_id, COALESCE(NULLIF(m.display_name,''),u.full_name) AS name, count(*)::int AS n
           FROM cls_members m JOIN users u ON u.id=m.user_id JOIN cls_groups g ON g.id=m.group_id
           JOIN cls_group_lessons gl ON gl.group_id=m.group_id AND gl.due_at < now()
           JOIN cls_lessons l ON l.id=gl.lesson_id JOIN cls_quizzes q ON q.lesson_id=l.id
          WHERE m.group_id = ANY($1::uuid[]) AND m.status='active'
            AND NOT EXISTS(SELECT 1 FROM cls_attempts a WHERE a.group_id=m.group_id AND a.user_id=m.user_id AND a.lesson_id=l.id AND a.submitted_at IS NOT NULL AND a.effective_percent >= l.pass_percent)
          GROUP BY m.group_id, g.name, m.user_id, m.display_name, u.full_name ORDER BY n DESC LIMIT 20`,
        [ids],
      )
    ).rows;
    const missed = (
      await pool.query(
        `SELECT m.group_id, g.name AS group_name, m.user_id, COALESCE(NULLIF(m.display_name,''),u.full_name) AS name
           FROM cls_members m JOIN users u ON u.id=m.user_id JOIN cls_groups g ON g.id=m.group_id
          WHERE m.group_id = ANY($1::uuid[]) AND m.status='active'
            AND (SELECT count(*) FROM (SELECT s.id FROM cls_live_sessions s WHERE s.group_id=m.group_id AND s.status='ended' AND s.starts_at > m.joined_at ORDER BY s.starts_at DESC LIMIT 2) last2) = 2
            AND NOT EXISTS(SELECT 1 FROM (SELECT s.id FROM cls_live_sessions s WHERE s.group_id=m.group_id AND s.status='ended' AND s.starts_at > m.joined_at ORDER BY s.starts_at DESC LIMIT 2) last2
                           JOIN cls_attendance a ON a.session_id=last2.id AND a.user_id=m.user_id)
          LIMIT 20`,
        [ids],
      )
    ).rows;
    const attention = [
      ...overdue.map((r: any) => ({ groupId: r.group_id, groupName: r.group_name, userId: r.user_id, name: r.name, reason: `${r.n} ta dars testi muddati o‘tgan` })),
      ...missed.map((r: any) => ({ groupId: r.group_id, groupName: r.group_name, userId: r.user_id, name: r.name, reason: "Oxirgi 2 jonli darsga kelmadi" })),
    ].slice(0, 20);
    const counts = (
      await pool.query(
        `SELECT g.id, (SELECT count(*)::int FROM cls_members m WHERE m.group_id=g.id AND m.status='active') AS members,
                (SELECT count(*)::int FROM cls_members m WHERE m.group_id=g.id AND m.status='pending') AS pending
           FROM cls_groups g WHERE g.id = ANY($1::uuid[])`,
        [ids],
      )
    ).rows;
    const byId = new Map(counts.map((c: any) => [c.id, c]));
    return {
      groups: groups.map((g) => ({ ...g, members: byId.get(g.id)?.members ?? 0, pending: byId.get(g.id)?.pending ?? 0 })),
      live,
      lessonsToday,
      pending,
      waitingReview,
      unread,
      attention,
    };
  }));

  /* ================= Xabarlar markazi ================= */
  app.get(P + "/staff/inbox", requireStaff, route(async (req) => {
    const me = userOf(req);
    const q = z.object({ filter: z.enum(["all", "unread", "dm", "groups"]).default("all"), group: uuid.optional() }).parse(req.query);
    let groups = await myGroups(me);
    if (q.group) groups = groups.filter((g) => g.id === q.group);
    const ids = groups.map((g) => g.id);
    if (!ids.length) return { threads: [], unread: 0 };
    const names = new Map(groups.map((g) => [g.id, g.name]));
    const threads: any[] = [];
    if (q.filter !== "dm") {
      const rows = (
        await pool.query(
          `SELECT g.id AS group_id,
                  (SELECT max(m.id) FROM cls_messages m WHERE m.group_id=g.id AND m.recipient_id IS NULL) AS last_id,
                  (SELECT count(*)::int FROM cls_messages m WHERE m.group_id=g.id AND m.recipient_id IS NULL AND m.sender_id<>$2 AND m.deleted_at IS NULL
                     AND m.id > COALESCE((SELECT last_id FROM cls_chat_reads r WHERE r.group_id=g.id AND r.user_id=$2 AND r.thread='group'),0)) AS unread
             FROM cls_groups g WHERE g.id = ANY($1::uuid[])`,
          [ids, me],
        )
      ).rows;
      for (const r of rows) {
        const last = r.last_id ? (await pool.query(`${SMSG} WHERE m.id=$1`, [r.last_id])).rows[0] : null;
        threads.push({ type: "group", groupId: r.group_id, groupName: names.get(r.group_id), title: names.get(r.group_id), last: preview(last), unread: r.unread, sortId: Number(r.last_id || 0) });
      }
    }
    if (q.filter !== "groups") {
      const rows = (
        await pool.query(
          `SELECT x.group_id, x.other, max(x.id) AS last_id,
                  count(*) FILTER (WHERE x.sender_id=x.other AND x.deleted_at IS NULL
                     AND x.id > COALESCE((SELECT last_id FROM cls_chat_reads r WHERE r.group_id=x.group_id AND r.user_id=$2 AND r.thread=x.other),0))::int AS unread
             FROM (SELECT m.*, CASE WHEN m.sender_id=$2 THEN m.recipient_id ELSE m.sender_id END AS other
                     FROM cls_messages m WHERE m.group_id = ANY($1::uuid[]) AND m.recipient_id IS NOT NULL AND (m.sender_id=$2 OR m.recipient_id=$2)) x
            GROUP BY x.group_id, x.other`,
          [ids, me],
        )
      ).rows;
      for (const r of rows) {
        const last = (await pool.query(`${SMSG} WHERE m.id=$1`, [r.last_id])).rows[0];
        const person = (
          await pool.query("SELECT COALESCE(NULLIF(m.display_name,''),u.full_name) AS name, m.phone FROM users u LEFT JOIN cls_members m ON m.group_id=$1 AND m.user_id=u.id WHERE u.id=$2", [r.group_id, r.other])
        ).rows[0];
        threads.push({
          type: "dm", groupId: r.group_id, groupName: names.get(r.group_id), userId: r.other, title: person?.name || "—", phone: person?.phone || null,
          staff: !!(await groupRole(r.group_id, r.other)), last: preview(last), unread: r.unread, sortId: Number(r.last_id),
        });
      }
    }
    const list = threads.filter((t) => q.filter !== "unread" || t.unread > 0).sort((a, b) => b.sortId - a.sortId);
    return { threads: list, unread: threads.reduce((n, t) => n + t.unread, 0) };
  }));

  /** Bitta xabarni bir nechta guruhga birdan yuborish. */
  app.post(P + "/staff/broadcast", requireStaff, route(async (req) => {
    const me = userOf(req);
    const b = z.object({ groupIds: z.array(uuid).min(1).max(50), body: z.string().trim().min(1).max(2000), pin: z.boolean().optional().default(false) }).parse(req.body);
    const mine = new Set((await myGroups(me)).map((g) => g.id));
    const broadcastId = (await pool.query("SELECT gen_random_uuid() AS id")).rows[0].id;
    let sent = 0;
    for (const gid of [...new Set(b.groupIds)]) {
      if (!mine.has(gid)) continue;
      const row = (await pool.query("INSERT INTO cls_messages(group_id,sender_id,body,broadcast_id) VALUES($1,$2,$3,$4) RETURNING id", [gid, me, b.body, broadcastId])).rows[0];
      if (b.pin) await pool.query("UPDATE cls_groups SET pinned_message_id=$2 WHERE id=$1", [gid, row.id]);
      await pool.query(
        `INSERT INTO cls_chat_reads(group_id,user_id,thread,last_id) VALUES($1,$2,'group',$3)
         ON CONFLICT(group_id,user_id,thread) DO UPDATE SET last_id=GREATEST(cls_chat_reads.last_id,EXCLUDED.last_id)`,
        [gid, me, row.id],
      );
      await notifyGroup(gid, { title: "O‘qituvchidan e’lon", body: b.body.slice(0, 140), path: "chat", ref: `bc-${broadcastId}-${gid}` });
      sent++;
    }
    if (!sent) fail(404, "Guruh topilmadi");
    return { sent };
  }));

  /* ================= Tayyor javoblar ================= */
  app.get(P + "/staff/quick-replies", requireStaff, route(async (req) => ({
    replies: (await pool.query("SELECT id, body FROM cls_quick_replies WHERE user_id=$1 ORDER BY created_at", [userOf(req)])).rows,
  })));
  app.post(P + "/staff/quick-replies", requireStaff, route(async (req) => {
    const b = z.object({ body: z.string().trim().min(1).max(1000) }).parse(req.body);
    const n = (await pool.query("SELECT count(*)::int AS n FROM cls_quick_replies WHERE user_id=$1", [userOf(req)])).rows[0].n;
    if (n >= 30) fail(400, "Tayyor javoblar 30 tadan oshmasin");
    return { reply: (await pool.query("INSERT INTO cls_quick_replies(user_id,body) VALUES($1,$2) RETURNING id, body", [userOf(req), b.body])).rows[0] };
  }));
  app.delete(P + "/staff/quick-replies/:id", requireStaff, route(async (req) => {
    await pool.query("DELETE FROM cls_quick_replies WHERE id=$1 AND user_id=$2", [uuid.parse(req.params.id), userOf(req)]);
  }));

  /* ================= O'quvchilar ================= */
  /** Ro'yxatdan o'tgan o'quvchini telefon raqami bo'yicha topib, guruhga darhol qo'shish. */
  app.post(P + "/admin/groups/:id/add-member", requireStaff, route(async (req) => {
    const id = uuid.parse(req.params.id), me = userOf(req);
    await needGroup(id, me);
    const b = z.object({ phone: z.string().trim().min(9).max(30), name: z.string().trim().max(120).optional().default("") }).parse(req.body);
    const phone = digits(b.phone);
    if (phone.length < 9) fail(400, "Telefon raqami noto‘g‘ri");
    const found = (
      await pool.query(
        "SELECT m.user_id, m.phone, m.display_name FROM cls_members m WHERE right(regexp_replace(m.phone,'\\D','','g'),9)=right($1,9) ORDER BY m.joined_at DESC LIMIT 1",
        [phone],
      )
    ).rows[0];
    if (!found) fail(404, "Bu raqam bilan o‘quvchi topilmadi. Unga taklif havolasini yuboring — u o‘zi ro‘yxatdan o‘tib qo‘shiladi");
    if (await groupRole(id, found.user_id)) fail(400, "Bu foydalanuvchi shu guruhning o‘qituvchisi");
    await pool.query(
      `INSERT INTO cls_members(group_id,user_id,status,phone,display_name) VALUES($1,$2,'active',$3,$4)
       ON CONFLICT(group_id,user_id) DO UPDATE SET status='active'`,
      [id, found.user_id, found.phone, b.name || found.display_name || ""],
    );
    const u = (await pool.query("SELECT full_name FROM users WHERE id=$1", [found.user_id])).rows[0];
    return { member: { userId: found.user_id, name: b.name || found.display_name || u?.full_name, phone: found.phone } };
  }));

  /** O'quvchi kartasi: aloqa, guruhlar, davomat, test va vazifa natijalari, eslatmalar. */
  app.get(P + "/staff/students/:userId", requireStaff, route(async (req) => {
    const me = userOf(req), sid = z.string().min(1).max(100).parse(req.params.userId);
    const shared = await needStudent(me, sid);
    const u = (await pool.query("SELECT id, full_name, username, email, telegram_id, created_at FROM users WHERE id=$1", [sid])).rows[0] || fail(404, "O‘quvchi topilmadi");
    const groups = [];
    for (const gid of shared) {
      const m = (
        await pool.query(
          "SELECT m.*, g.name, g.course_id FROM cls_members m JOIN cls_groups g ON g.id=m.group_id WHERE m.group_id=$1 AND m.user_id=$2",
          [gid, sid],
        )
      ).rows[0];
      const lessons = (
        await pool.query(
          `SELECT count(*)::int AS total,
                  count(*) FILTER (WHERE EXISTS(SELECT 1 FROM cls_attempts a WHERE a.group_id=$1 AND a.user_id=$3 AND a.lesson_id=l.id AND a.submitted_at IS NOT NULL AND a.effective_percent >= l.pass_percent))::int AS passed
             FROM cls_lessons l JOIN cls_quizzes q ON q.lesson_id=l.id WHERE l.course_id=$2`,
          [gid, m.course_id, sid],
        )
      ).rows[0];
      const quiz = (
        await pool.query(
          `SELECT l.title, l.position, max(a.effective_percent)::int AS best, count(*)::int AS attempts
             FROM cls_attempts a JOIN cls_lessons l ON l.id=a.lesson_id WHERE a.group_id=$1 AND a.user_id=$2 AND a.submitted_at IS NOT NULL
            GROUP BY l.id, l.title, l.position ORDER BY l.position`,
          [gid, sid],
        )
      ).rows;
      const tasks = (
        await pool.query(
          `SELECT t.title, max(s.score)::int AS score, t.max_score, max(s.final_percent)::int AS percent, count(*)::int AS attempts
             FROM cls_submissions s JOIN cls_tasks t ON t.id=s.task_id WHERE s.group_id=$1 AND s.user_id=$2 AND s.status='graded'
            GROUP BY t.id, t.title, t.max_score ORDER BY t.title`,
          [gid, sid],
        )
      ).rows;
      const att = (
        await pool.query(
          `SELECT count(*)::int AS total, count(a.user_id)::int AS attended FROM cls_live_sessions s
             LEFT JOIN cls_attendance a ON a.session_id=s.id AND a.user_id=$2
            WHERE s.group_id=$1 AND s.status='ended' AND s.starts_at > $3`,
          [gid, sid, m.joined_at],
        )
      ).rows[0];
      groups.push({
        id: gid, name: m.name, status: m.status, joinedAt: m.joined_at, mutedUntil: m.muted_until,
        lessons, quiz, tasks, attendance: att, canManage: (await groupRole(gid, me)) !== "assistant",
      });
    }
    const phone = groups.length ? (await pool.query("SELECT phone FROM cls_members WHERE user_id=$1 AND phone<>'' ORDER BY joined_at DESC LIMIT 1", [sid])).rows[0]?.phone : null;
    const displayName = (await pool.query("SELECT display_name FROM cls_members WHERE user_id=$1 AND display_name<>'' ORDER BY joined_at DESC LIMIT 1", [sid])).rows[0]?.display_name;
    const notes = (
      await pool.query(
        "SELECT n.id, n.body, n.created_at, n.author_id, u.full_name AS author FROM cls_student_notes n JOIN users u ON u.id=n.author_id WHERE n.student_id=$1 ORDER BY n.id DESC LIMIT 100",
        [sid],
      )
    ).rows.map((n: any) => ({ ...n, id: Number(n.id), mine: n.author_id === me }));
    return {
      student: { id: u.id, name: displayName || u.full_name, fullName: u.full_name, username: u.username, email: u.email, phone: phone || null, telegramId: u.telegram_id || null, since: u.created_at },
      groups,
      notes,
    };
  }));
  app.post(P + "/staff/students/:userId/notes", requireStaff, route(async (req) => {
    const me = userOf(req), sid = z.string().min(1).max(100).parse(req.params.userId);
    await needStudent(me, sid);
    const b = z.object({ body: z.string().trim().min(1).max(2000) }).parse(req.body);
    const n = (await pool.query("INSERT INTO cls_student_notes(student_id,author_id,body) VALUES($1,$2,$3) RETURNING id, body, created_at", [sid, me, b.body])).rows[0];
    return { note: { ...n, id: Number(n.id), mine: true } };
  }));
  app.delete(P + "/staff/notes/:id", requireStaff, route(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const r = await pool.query("DELETE FROM cls_student_notes WHERE id=$1 AND (author_id=$2 OR $3)", [id, userOf(req), res.locals.staffRole === "admin"]);
    if (!r.rowCount) fail(404, "Eslatma topilmadi");
  }));
  /** Barcha guruhlarim bo'yicha o'quvchilarni qidirish (ism yoki telefon). */
  app.get(P + "/staff/students", requireStaff, route(async (req) => {
    const me = userOf(req);
    const q = z.object({ q: z.string().trim().max(80).optional().default("") }).parse(req.query);
    const ids = (await myGroups(me)).map((g) => g.id);
    if (!ids.length) return { students: [] };
    const like = "%" + q.q.toLowerCase() + "%";
    return {
      students: (
        await pool.query(
          `SELECT m.user_id, COALESCE(NULLIF(m.display_name,''),u.full_name) AS name, m.phone, m.status, g.id AS group_id, g.name AS group_name
             FROM cls_members m JOIN users u ON u.id=m.user_id JOIN cls_groups g ON g.id=m.group_id
            WHERE m.group_id = ANY($1::uuid[]) AND m.status IN ('active','pending')
              AND ($2 = '%%' OR lower(COALESCE(NULLIF(m.display_name,''),u.full_name)) LIKE $2 OR ($3::text IS NOT NULL AND regexp_replace(m.phone,'\\D','','g') LIKE $3))
            ORDER BY name LIMIT 200`,
          [ids, like, digits(q.q).length >= 3 ? "%" + digits(q.q) + "%" : null],
        )
      ).rows,
    };
  }));

  /* ================= Taqvim va vazifalar ================= */
  app.get(P + "/staff/calendar", requireStaff, route(async (req) => {
    const me = userOf(req);
    const q = z.object({ from: z.string().datetime({ offset: true }), to: z.string().datetime({ offset: true }) }).parse(req.query);
    if (Date.parse(q.to) - Date.parse(q.from) > 62 * 86400e3) fail(400, "Oraliq juda katta");
    const groups = await myGroups(me);
    const ids = groups.map((g) => g.id);
    if (!ids.length) return { live: [], lessons: [] };
    const live = (
      await pool.query(
        `SELECT s.id, s.group_id, g.name AS group_name, s.title, s.starts_at, s.duration_minutes, s.status, s.recording_state,
                (SELECT count(*)::int FROM cls_attendance a WHERE a.session_id=s.id) AS attendance
           FROM cls_live_sessions s JOIN cls_groups g ON g.id=s.group_id
          WHERE s.group_id = ANY($1::uuid[]) AND s.status<>'cancelled' AND s.starts_at >= $2 AND s.starts_at < $3 ORDER BY s.starts_at`,
        [ids, q.from, q.to],
      )
    ).rows;
    const lessons = (
      await pool.query(
        `SELECT gl.group_id, g.name AS group_name, l.id AS lesson_id, l.title, l.kind, gl.opens_at, gl.due_at
           FROM cls_group_lessons gl JOIN cls_lessons l ON l.id=gl.lesson_id JOIN cls_groups g ON g.id=gl.group_id
          WHERE gl.group_id = ANY($1::uuid[]) AND ((gl.opens_at >= $2 AND gl.opens_at < $3) OR (gl.due_at >= $2 AND gl.due_at < $3)) ORDER BY gl.opens_at`,
        [ids, q.from, q.to],
      )
    ).rows;
    return { live, lessons };
  }));
  /** Barcha guruhlarim bo'yicha vazifa natijalari: avtomatik baholangan, e'tibor talab qiladigan, qo'lda tekshiriladigan. */
  app.get(P + "/staff/submissions", requireStaff, route(async (req) => {
    const me = userOf(req);
    const q = z.object({ view: z.enum(["attention", "graded", "submitted", "rejected"]).default("attention"), group: uuid.optional() }).parse(req.query);
    let groups = await myGroups(me);
    if (q.group) groups = groups.filter((g) => g.id === q.group);
    const ids = groups.map((g) => g.id);
    if (!ids.length) return { items: [], counts: {} };
    const where =
      q.view === "attention"
        ? `s.status='graded' AND s.auto AND (s.flagged OR COALESCE(s.final_percent,0) < t.pass_percent OR COALESCE(jsonb_array_length(s.proctor->'events'),0) > 0)`
        : `s.status='${q.view}'`;
    const rows = (
      await pool.query(
        `SELECT s.id, s.group_id, g.name AS group_name, s.user_id, COALESCE(NULLIF(m.display_name,''),u.full_name) AS name, s.audio_seconds, s.ai_percent, s.ai_diff,
                s.final_percent, s.pauses, s.proctor, s.snapshots, s.auto, s.score, s.comment, s.status, s.late, s.created_at, s.flagged, (s.sampled IS NOT NULL) AS sampled,
                (s.video_key IS NOT NULL AND s.video_deleted_at IS NULL) AS video, (s.video_deleted_at IS NOT NULL) AS video_expired,
                t.id AS task_id, t.title, t.text_ar, t.max_score, t.pass_percent
           FROM cls_submissions s JOIN cls_tasks t ON t.id=s.task_id JOIN cls_groups g ON g.id=s.group_id
           JOIN users u ON u.id=s.user_id LEFT JOIN cls_members m ON m.group_id=s.group_id AND m.user_id=s.user_id
          WHERE s.group_id = ANY($1::uuid[]) AND ${where} ORDER BY s.created_at DESC LIMIT 100`,
        [ids],
      )
    ).rows;
    const counts = (
      await pool.query(
        `SELECT count(*) FILTER (WHERE s.status='submitted')::int AS submitted,
                count(*) FILTER (WHERE s.status='graded' AND s.auto AND (s.flagged OR COALESCE(s.final_percent,0) < t.pass_percent OR COALESCE(jsonb_array_length(s.proctor->'events'),0) > 0))::int AS attention
           FROM cls_submissions s JOIN cls_tasks t ON t.id=s.task_id WHERE s.group_id = ANY($1::uuid[])`,
        [ids],
      )
    ).rows[0];
    return { items: rows.map((r: any) => ({ ...r, suggested: r.score ?? (r.ai_percent === null ? null : Math.round((r.max_score * r.ai_percent) / 100)) })), counts };
  }));
}
