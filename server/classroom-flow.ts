// Dars jarayoni va o'quv yo'li (oferta shartlari bo'yicha):
// • Zoom'dagi haqiqiy qatnashish (kirish-chiqish webhooklari) → yakuniy davomat: Keldi (vaqtning ≥70%),
//   Kechikdi (15 daqiqadan keyin kirgan), Uzrli, Kelmadi.
// • Dars boshlanib 10 daqiqa o'tsa kirmaganlarga eslatma; kelmaganlarga 3 ball, kechikkanga 1 ball.
// • Uzr: darsdan oldin (o'quvchi so'raydi yoki o'qituvchi belgilaydi) yoki keyin.
// • Darsga kirmagan o'quvchi: jarima balli yoziladi; dars yozuvini ko'radi (≥90%) → tezkor va qolgan topshiriqlar ochiladi (muddat — 1 kun).
// • Jarima ballari oyiga: 6 → 1-ogohlantirish, 10 → 2-ogohlantirish, 12 → chetlatish to'g'risida o'qituvchiga xabar.
// • Dars bosqichlari: oldindan → jonli dars → tezkor topshiriq (24 soat) → yozuvni ko'rish (≥90%) → asosiy topshiriq.
//   Tezkor topshiriqdan ≥85% olgan o'quvchi yozuvni ko'rmasdan asosiy topshiriqqa o'tadi.
import type { Express, Request } from "express";
import { z } from "zod";
import { pool } from "./db";
import { requireAuth } from "./auth";
import { ClassError, answersSchema, grade, groupStaff, isTestUser, leaderboard, lessonStates, makeLayout, membership, needGroup, notifyUsers, present, questionSchema, requireStaff, route, uuid } from "./classroom";

const P = "/api/platform/class";
const userOf = (req: Request) => String(req.session.userId);
const fail = (status: number, message: string): never => {
  throw new ClassError(status, message);
};
const TZ = 5 * 3600e3;
export const monthKey = (d = new Date()) => new Date(d.getTime() + TZ).toISOString().slice(0, 7);
const H = 3600e3;

export const POINTS = { absent: 3, late: 1, quick: 1, main: 2, conduct: 3 } as const;
const LEVELS = [
  { level: 6, student: "1-ogohlantirish: bu oy 6 jarima balli", staff: "6 ball: 1-ogohlantirish, o‘quvchi bilan suhbatlashing" },
  { level: 10, student: "2-ogohlantirish: bu oy 10 jarima balli", staff: "10 ball: 2-ogohlantirish" },
  { level: 12, student: "12 jarima balli: kursdan chetlatish masalasi ko‘riladi", staff: "12 ball: oferta bo‘yicha chetlatish to‘g‘risida qaror qiling" },
];

/* ---------------- Jarima ballari ---------------- */
export async function monthPoints(groupId: string, userId: string, month = monthKey()) {
  return Number(
    (await pool.query(
      "SELECT COALESCE(sum(points),0)::int AS n FROM cls_penalties WHERE group_id=$1 AND user_id=$2 AND NOT cancelled AND to_char(created_at + interval '5 hours','YYYY-MM')=$3",
      [groupId, userId, month],
    )).rows[0].n,
  );
}
export async function addPenalty(groupId: string, userId: string, kind: keyof typeof POINTS, ref: string, note = "") {
  const g = (await pool.query("SELECT discipline,name FROM cls_groups WHERE id=$1", [groupId])).rows[0];
  if (!g?.discipline || (await isTestUser(userId))) return false;
  const r = await pool.query(
    "INSERT INTO cls_penalties(group_id,user_id,points,kind,ref,note) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(group_id,user_id,kind,ref) DO NOTHING RETURNING id",
    [groupId, userId, POINTS[kind], kind, ref, note],
  );
  if (!r.rowCount) return false;
  await checkThresholds(groupId, userId, g.name);
  return true;
}
async function checkThresholds(groupId: string, userId: string, groupName: string) {
  const month = monthKey(), n = await monthPoints(groupId, userId, month);
  for (const L of LEVELS) {
    if (n < L.level) continue;
    const fresh = await pool.query("INSERT INTO cls_warnings(group_id,user_id,month,level) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING", [groupId, userId, month, L.level]);
    if (!fresh.rowCount) continue;
    const name = (await pool.query("SELECT COALESCE(NULLIF(m.display_name,''),u.full_name) AS n FROM cls_members m JOIN users u ON u.id=m.user_id WHERE m.group_id=$1 AND m.user_id=$2", [groupId, userId])).rows[0]?.n || "O‘quvchi";
    await notifyUsers([userId], groupId, { title: L.student, body: `${groupName}: darslarga qatnashing va topshiriqlarni o‘z vaqtida bajaring.`, path: "intizom", ref: `warn-${groupId}-${userId}-${month}-${L.level}`, urgent: true });
    const staff = (await groupStaff(groupId)).map((s: any) => s.user_id);
    if (staff.length) await notifyUsers(staff, groupId, { title: L.staff, body: `${name} — ${groupName}`, path: "", ref: `warn-staff-${groupId}-${userId}-${month}-${L.level}` });
  }
}

/* ---------------- Zoom: kirish-chiqish ---------------- */
/** Webhook qatnashchisini guruh a'zosiga bog'laydi: avval customer_key (= foydalanuvchi id), keyin ism bo'yicha. */
async function participantUser(groupId: string, p: any) {
  const key = String(p?.customer_key || "");
  if (key && (await pool.query("SELECT 1 FROM cls_members WHERE group_id=$1 AND user_id=$2 AND status='active'", [groupId, key])).rowCount) return key;
  const name = String(p?.user_name || "").trim().toLowerCase();
  if (!name) return null;
  const rows = (await pool.query(
    "SELECT m.user_id FROM cls_members m JOIN users u ON u.id=m.user_id WHERE m.group_id=$1 AND m.status='active' AND lower(COALESCE(NULLIF(m.display_name,''),u.full_name))=$2",
    [groupId, name],
  )).rows;
  return rows.length === 1 ? rows[0].user_id : null;
}
export async function onParticipant(session: any, event: string, p: any) {
  const userId = await participantUser(session.group_id, p);
  if (!userId) return;
  if (event === "meeting.participant_joined") {
    const at = p.join_time ? new Date(p.join_time) : new Date();
    await pool.query(
      `INSERT INTO cls_presence(session_id,user_id,first_seen,open_since) VALUES($1,$2,$3,$3)
       ON CONFLICT(session_id,user_id) DO UPDATE SET open_since=COALESCE(cls_presence.open_since,EXCLUDED.open_since), first_seen=LEAST(cls_presence.first_seen,EXCLUDED.first_seen)`,
      [session.id, userId, at],
    );
  } else if (event === "meeting.participant_left") {
    const at = p.leave_time ? new Date(p.leave_time) : new Date();
    await pool.query(
      `UPDATE cls_presence SET seconds=seconds+GREATEST(0,EXTRACT(EPOCH FROM ($3::timestamptz-open_since))::int), open_since=NULL
        WHERE session_id=$1 AND user_id=$2 AND open_since IS NOT NULL`,
      [session.id, userId, at],
    );
  }
}

/* ---------------- Yakuniy davomat ---------------- */
const sessionWindow = (s: any) => {
  const start = new Date(s.started_at || s.starts_at).getTime();
  const end = s.ended_at ? new Date(s.ended_at).getTime() : new Date(s.starts_at).getTime() + s.duration_minutes * 60000;
  return { start, end, seconds: Math.max(60, Math.round((end - start) / 1000)) };
};
async function setMark(s: any, userId: string, status: string, seconds: number, manual = false) {
  await pool.query(
    `INSERT INTO cls_marks(session_id,user_id,status,seconds,manual) VALUES($1,$2,$3,$4,$5)
     ON CONFLICT(session_id,user_id) DO UPDATE SET status=EXCLUDED.status, seconds=EXCLUDED.seconds, manual=EXCLUDED.manual, decided_at=now()`,
    [s.id, userId, status, seconds, manual],
  );
  await pool.query("UPDATE cls_penalties SET cancelled=true WHERE group_id=$1 AND user_id=$2 AND kind IN ('absent','late') AND ref=$3", [s.group_id, userId, s.id]);
  if (status === "absent" || status === "late") {
    // Bekor qilingan ballni qayta tiklash yoki yangisini yozish.
    const back = await pool.query("UPDATE cls_penalties SET cancelled=false WHERE group_id=$1 AND user_id=$2 AND kind=$3 AND ref=$4 RETURNING id", [s.group_id, userId, status, s.id]);
    if (!back.rowCount) await addPenalty(s.group_id, userId, status, s.id, s.title);
  }
}
export async function finalizeSessions(now = Date.now()) {
  const due = (await pool.query(
    `SELECT * FROM cls_live_sessions WHERE finalized_at IS NULL AND status<>'cancelled'
       AND ((status='ended' AND ended_at < $1::timestamptz - interval '2 minutes') OR (starts_at + make_interval(mins=>duration_minutes+60) < $1::timestamptz))
       AND starts_at > $1::timestamptz - interval '2 days'`,
    [new Date(now)],
  )).rows;
  for (const s of due) {
    const claimed = await pool.query("UPDATE cls_live_sessions SET finalized_at=now() WHERE id=$1 AND finalized_at IS NULL", [s.id]);
    if (!claimed.rowCount) continue;
    const w = sessionWindow(s);
    await pool.query(
      "UPDATE cls_presence SET seconds=seconds+GREATEST(0,EXTRACT(EPOCH FROM ($2::timestamptz-open_since))::int), open_since=NULL WHERE session_id=$1 AND open_since IS NOT NULL",
      [s.id, new Date(w.end)],
    );
    const presence = new Map<string, any>((await pool.query("SELECT * FROM cls_presence WHERE session_id=$1", [s.id])).rows.map((r: any) => [r.user_id, r]));
    const clicks = new Set((await pool.query("SELECT user_id FROM cls_attendance WHERE session_id=$1", [s.id])).rows.map((r: any) => r.user_id));
    const excuses = new Map<string, string>((await pool.query("SELECT user_id,status FROM cls_excuses WHERE session_id=$1", [s.id])).rows.map((r: any) => [r.user_id, r.status]));
    const manual = new Set((await pool.query("SELECT user_id FROM cls_marks WHERE session_id=$1 AND manual", [s.id])).rows.map((r: any) => r.user_id));
    const members = (await pool.query("SELECT user_id FROM cls_members WHERE group_id=$1 AND status='active' AND joined_at < $2", [s.group_id, new Date(w.end)])).rows;
    const tracked = presence.size > 0; // Zoom kirish-chiqish ma'lumoti keldimi (Zoom Pro + webhook)
    for (const { user_id: u } of members) {
      if (manual.has(u)) continue;
      const p = presence.get(u), ex = excuses.get(u);
      let status: string;
      if (ex === "approved") status = "excused";
      else if (tracked && p && p.seconds >= 0.7 * w.seconds) status = new Date(p.first_seen).getTime() > w.start + 15 * 60000 ? "late" : "present";
      else if (!tracked && (clicks.has(u) || p)) status = "present";
      else status = ex === "pending" ? "pending" : "absent";
      if (status === "pending") {
        await pool.query("INSERT INTO cls_marks(session_id,user_id,status,seconds) VALUES($1,$2,'pending',$3) ON CONFLICT DO NOTHING", [s.id, u, p?.seconds || 0]);
        continue;
      }
      await setMark(s, u, status, p?.seconds || 0);
      if (status === "absent")
        await notifyUsers([u], s.group_id, { title: "Darsga kelmadingiz", body: `${s.title}: ${POINTS.absent} jarima balli yozildi. Yozuvni ko‘rish uchun o‘qituvchidan ruxsat so‘rang.`, path: "darslar", ref: `absent-${s.id}-${u}` });
    }
  }
  return due.length;
}

/** Dars boshlanib 10 daqiqa o'tsa ham kirmaganlarga eslatma (bir marta). */
export async function warnLateJoiners(now = Date.now()) {
  const due = (await pool.query(
    `UPDATE cls_live_sessions SET warned_at=now()
      WHERE warned_at IS NULL AND finalized_at IS NULL AND status='live'
        AND COALESCE(started_at,starts_at) <= $1::timestamptz - interval '10 minutes' AND starts_at > $1::timestamptz - interval '2 hours'
      RETURNING id,group_id,title`,
    [new Date(now)],
  )).rows;
  for (const s of due) {
    const ids = (await pool.query(
      `SELECT m.user_id FROM cls_members m WHERE m.group_id=$1 AND m.status='active'
         AND NOT EXISTS(SELECT 1 FROM cls_presence p WHERE p.session_id=$2 AND p.user_id=m.user_id)
         AND NOT EXISTS(SELECT 1 FROM cls_attendance a WHERE a.session_id=$2 AND a.user_id=m.user_id)
         AND NOT EXISTS(SELECT 1 FROM cls_excuses e WHERE e.session_id=$2 AND e.user_id=m.user_id AND e.status<>'rejected')`,
      [s.group_id, s.id],
    )).rows.map((r: any) => r.user_id);
    if (ids.length) await notifyUsers(ids, s.group_id, { title: "Dars boshlandi — siz hali kirmadingiz", body: `${s.title}: hoziroq qo‘shiling, aks holda «Kelmadi» deb belgilanadi.`, path: "jonli", ref: `late-${s.id}`, urgent: true });
  }
}

/* ---------------- Dars bosqichlari ---------------- */
type Timing = { sessionId: string | null; finalized: boolean; recordingReady: boolean; quickOpens: number | null; quickDue: number | null; mainDue: number | null; ended: boolean };
/** Har dars uchun: bog'langan jonli dars, tezkor topshiriq ochilishi/muddati, asosiy topshiriq muddati. */
async function timings(groupId: string) {
  const rows = (await pool.query(
    `SELECT l.id, l.position, gl.opens_at, gl.due_at, g.task_hours,
            (SELECT row_to_json(s) FROM (SELECT id,starts_at,started_at,ended_at,duration_minutes,status,finalized_at,recording_state FROM cls_live_sessions s
               WHERE s.group_id=$1 AND s.lesson_id=l.id AND s.status<>'cancelled' ORDER BY s.starts_at DESC LIMIT 1) s) AS session
       FROM cls_groups g JOIN cls_lessons l ON l.course_id=g.course_id LEFT JOIN cls_group_lessons gl ON gl.group_id=g.id AND gl.lesson_id=l.id
      WHERE g.id=$1 ORDER BY l.position, l.created_at`,
    [groupId],
  )).rows;
  const map = new Map<string, Timing>();
  rows.forEach((r: any, i: number) => {
    const s = r.session;
    const ended = !!s && (s.status === "ended" || !!s.finalized_at);
    const quickOpens = s ? (ended ? new Date(s.ended_at || s.starts_at).getTime() + (s.ended_at ? 0 : s.duration_minutes * 60000) : null) : r.opens_at ? new Date(r.opens_at).getTime() : null;
    const next = rows.slice(i + 1).find((x: any) => x.opens_at);
    // Jonli darsdan keyin: tezkor topshiriq — 1 soat, qolgan vazifalar — guruh muddati (standart 24 soat).
    const mainDue = s && quickOpens ? quickOpens + (r.task_hours || 48) * H : next ? new Date(next.opens_at).getTime() : r.due_at ? new Date(r.due_at).getTime() : quickOpens ? quickOpens + 7 * 24 * H : null;
    map.set(r.id, { sessionId: s?.id || null, finalized: !!s?.finalized_at, recordingReady: s?.recording_state === "ready", quickOpens, quickDue: quickOpens ? quickOpens + (s ? 1 : 24) * H : null, mainDue, ended });
  });
  return map;
}
async function quickBest(groupId: string, userId: string) {
  return new Map<string, number>((await pool.query(
    "SELECT lesson_id, max(percent)::int AS p FROM cls_quick_attempts WHERE group_id=$1 AND user_id=$2 AND submitted_at IS NOT NULL GROUP BY lesson_id",
    [groupId, userId],
  )).rows.map((r: any) => [r.lesson_id, r.p]));
}

/** Yozuvni ko'rish huquqi: dars tugagach guruhning har bir o'quvchisi; dars davomida — qatnashgan yoki uzrli o'quvchi. */
export async function canWatch(session: any, userId: string, teacher: boolean) {
  if (teacher || (await isTestUser(userId))) return { ok: true as const };
  // Darsga kirmagan o'quvchi ham dars tugagach yozuvni ko'radi (jarima balli baribir yoziladi), so'ng topshiriqlar ochiladi.
  // (Guruh sozlamasi «free_recording» o'chirilgan bo'lsa — avvalgidek o'qituvchidan ruxsat so'raydi.)
  if (session.status === "ended" || session.finalized_at) {
    const free = (await pool.query("SELECT free_recording FROM cls_groups WHERE id=$1", [session.group_id])).rows[0]?.free_recording;
    if (free !== false) return { ok: true as const };
  }
  const mark = (await pool.query("SELECT status FROM cls_marks WHERE session_id=$1 AND user_id=$2", [session.id, userId])).rows[0]?.status;
  if (["present", "late", "excused"].includes(mark)) return { ok: true as const };
  const ex = (await pool.query("SELECT status FROM cls_excuses WHERE session_id=$1 AND user_id=$2", [session.id, userId])).rows[0]?.status;
  if (ex === "approved") return { ok: true as const };
  if (!session.finalized_at) {
    const seen = (await pool.query("SELECT 1 FROM cls_attendance WHERE session_id=$1 AND user_id=$2 UNION SELECT 1 FROM cls_presence WHERE session_id=$1 AND user_id=$2", [session.id, userId])).rowCount;
    if (seen) return { ok: true as const };
  }
  return { ok: false as const, request: ex || null };
}

/** Darsga kirmagan (yakuniy davomatda «Kelmadi») o'quvchi: tezkor topshiriq yozuvni ≥90% ko'rgach ochiladi, muddati — asosiy topshiriq bilan bir xil. */
async function absentInfo(sessionId: string | null, userId: string) {
  if (!sessionId) return { absent: false, watched: 0 };
  const mark = (await pool.query("SELECT status FROM cls_marks WHERE session_id=$1 AND user_id=$2", [sessionId, userId])).rows[0]?.status;
  const watched = (await pool.query("SELECT percent FROM cls_watch WHERE session_id=$1 AND user_id=$2", [sessionId, userId])).rows[0]?.percent || 0;
  return { absent: mark === "absent", watched };
}

/** Asosiy topshiriq ochiqmi: jonli darsi bo'lmagan dars, yozuv ≥90% ko'rilgan, tezkor ≥85%, qo'lda ochilgan yoki yozuv 24 soatda tayyor bo'lmagan. */
export async function mainGate(groupId: string, lessonId: string, userId: string) {
  if (await isTestUser(userId)) return { ok: true, reason: "test" };
  const t = (await timings(groupId)).get(lessonId);
  if (!t?.sessionId) return { ok: true, reason: "no-live" };
  if ((await pool.query("SELECT 1 FROM cls_unlocks WHERE group_id=$1 AND user_id=$2 AND lesson_id=$3", [groupId, userId, lessonId])).rowCount) return { ok: true, reason: "manual" };
  const watched = (await pool.query("SELECT percent FROM cls_watch WHERE session_id=$1 AND user_id=$2", [t.sessionId, userId])).rows[0]?.percent || 0;
  if (watched >= 90) return { ok: true, reason: "watched" };
  if (!(await absentInfo(t.sessionId, userId)).absent && ((await quickBest(groupId, userId)).get(lessonId) ?? 0) >= 85) return { ok: true, reason: "skip" };
  if (t.ended && !t.recordingReady && t.quickOpens && Date.now() > t.quickOpens + 24 * H) return { ok: true, reason: "no-recording" };
  return { ok: false, reason: t.ended ? "watch" : "live" };
}

/** Muddati o'tgan tezkor va asosiy topshiriqlar uchun ball (faqat yangi tizimda yakunlangan darslar, 48 soat ichida). */
export async function penalizeOverdue(now = Date.now()) {
  const groups = (await pool.query("SELECT id FROM cls_groups WHERE NOT archived AND discipline")).rows;
  for (const g of groups) {
    const t = await timings(g.id);
    const quick = new Set((await pool.query("SELECT q.lesson_id FROM cls_quick_quizzes q JOIN cls_lessons l ON l.id=q.lesson_id JOIN cls_groups gg ON gg.course_id=l.course_id WHERE gg.id=$1 AND jsonb_array_length(q.questions)>0", [g.id])).rows.map((r: any) => r.lesson_id));
    const main = new Set((await pool.query("SELECT q.lesson_id FROM cls_quizzes q JOIN cls_lessons l ON l.id=q.lesson_id JOIN cls_groups gg ON gg.course_id=l.course_id WHERE gg.id=$1", [g.id])).rows.map((r: any) => r.lesson_id));
    for (const [lessonId, x] of t) {
      if (!x.finalized || !x.sessionId) continue;
      const excused = `SELECT 1 FROM cls_marks mk WHERE mk.session_id=$4 AND mk.user_id=m.user_id AND mk.status IN ('excused','pending')`;
      if (quick.has(lessonId) && x.quickDue && x.quickDue < now && x.quickDue > now - 48 * H) {
        const late = (await pool.query(
          `SELECT m.user_id FROM cls_members m WHERE m.group_id=$1 AND m.status='active' AND NOT EXISTS(${excused})
             AND NOT EXISTS(SELECT 1 FROM cls_marks mk WHERE mk.session_id=$4 AND mk.user_id=m.user_id AND mk.status='absent')
             AND NOT EXISTS(SELECT 1 FROM cls_quick_attempts a WHERE a.group_id=$1 AND a.lesson_id=$2 AND a.user_id=m.user_id AND a.submitted_at <= $3)`,
          [g.id, lessonId, new Date(x.quickDue), x.sessionId],
        )).rows;
        for (const r of late) await addPenalty(g.id, r.user_id, "quick", lessonId, "Tezkor topshiriq muddatida (dars tugagach 1 soatda) bajarilmadi");
      }
      if (main.has(lessonId) && x.mainDue && x.mainDue < now && x.mainDue > now - 48 * H) {
        const late = (await pool.query(
          `SELECT m.user_id FROM cls_members m WHERE m.group_id=$1 AND m.status='active' AND NOT EXISTS(${excused})
             AND NOT EXISTS(SELECT 1 FROM cls_attempts a WHERE a.group_id=$1 AND a.lesson_id=$2 AND a.user_id=m.user_id AND a.submitted_at <= $3)`,
          [g.id, lessonId, new Date(x.mainDue), x.sessionId],
        )).rows;
        for (const r of late) await addPenalty(g.id, r.user_id, "main", lessonId, "Asosiy topshiriq muddatida topshirilmadi");
      }
    }
  }
}

export async function runClassFlow(now = Date.now()) {
  await warnLateJoiners(now);
  await finalizeSessions(now);
  await penalizeOverdue(now);
}

/** Asosiy topshiriqning qo'shimcha qismlari (mustahkamlash, tarjima, so'zlar): nechtasi o'tish balidan o'tilgan. */
async function partProgress(groupId: string, userId: string) {
  return new Map<string, { total: number; done: number }>((await pool.query(
    `SELECT p.lesson_id, count(*)::int AS total,
            count(*) FILTER (WHERE (SELECT max(a.percent) FROM cls_part_attempts a WHERE a.part_id=p.id AND a.group_id=$1 AND a.user_id=$2 AND a.submitted_at IS NOT NULL) >= p.pass_percent)::int AS done
       FROM cls_parts p JOIN cls_lessons l ON l.id=p.lesson_id JOIN cls_groups g ON g.course_id=l.course_id WHERE g.id=$1 GROUP BY p.lesson_id`,
    [groupId, userId],
  )).rows.map((r: any) => [r.lesson_id, { total: r.total, done: r.done }]));
}

/** O'quvchi uchun bitta darsning 5 bosqichi va cheklisti. */
async function lessonFlow(groupId: string, userId: string, teacher: boolean) {
  const test = !teacher && (await isTestUser(userId));
  const states = await lessonStates(groupId, userId, teacher);
  const parts = await partProgress(groupId, userId);
  const t = await timings(groupId);
  const quickQ = new Map<string, number>((await pool.query(
    "SELECT q.lesson_id, jsonb_array_length(q.questions)::int AS n FROM cls_quick_quizzes q JOIN cls_lessons l ON l.id=q.lesson_id JOIN cls_groups g ON g.course_id=l.course_id WHERE g.id=$1",
    [groupId],
  )).rows.map((r: any) => [r.lesson_id, r.n]));
  const quick = await quickBest(groupId, userId);
  const sessionIds = [...t.values()].map((x) => x.sessionId).filter(Boolean);
  const marks = new Map<string, string>((await pool.query("SELECT session_id,status FROM cls_marks WHERE user_id=$1 AND session_id = ANY($2::uuid[])", [userId, sessionIds])).rows.map((r: any) => [r.session_id, r.status]));
  const watch = new Map<string, number>((await pool.query("SELECT session_id,percent FROM cls_watch WHERE user_id=$1 AND session_id = ANY($2::uuid[])", [userId, sessionIds])).rows.map((r: any) => [r.session_id, r.percent]));
  const excuses = new Map<string, string>((await pool.query("SELECT session_id,status FROM cls_excuses WHERE user_id=$1 AND session_id = ANY($2::uuid[])", [userId, sessionIds])).rows.map((r: any) => [r.session_id, r.status]));
  const late = new Set((await pool.query("SELECT DISTINCT lesson_id FROM cls_attempts WHERE group_id=$1 AND user_id=$2 AND submitted_at IS NOT NULL AND NOT late", [groupId, userId])).rows.map((r: any) => r.lesson_id));
  const tasks = new Map<string, { total: number; done: number }>((await pool.query(
    `SELECT t.lesson_id, count(*)::int AS total, count(*) FILTER (WHERE EXISTS(SELECT 1 FROM cls_submissions s WHERE s.task_id=t.id AND s.group_id=$1 AND s.user_id=$2 AND s.status IN ('submitted','graded')))::int AS done
       FROM cls_tasks t JOIN cls_lessons l ON l.id=t.lesson_id JOIN cls_groups g ON g.course_id=l.course_id WHERE g.id=$1 GROUP BY t.lesson_id`,
    [groupId, userId],
  )).rows.map((r: any) => [r.lesson_id, { total: r.total, done: r.done }]));
  const now = Date.now();
  return states.map((s) => {
    const x = t.get(s.id)!;
    const mark = x.sessionId ? marks.get(x.sessionId) || null : null;
    const quickPct = quick.get(s.id) ?? null;
    const hasQuick = (quickQ.get(s.id) || 0) > 0;
    const watched = x.sessionId ? watch.get(x.sessionId) || 0 : 0;
    const skip = (quickPct ?? 0) >= 85 && mark !== "absent";
    const task = tasks.get(s.id) || { total: 0, done: 0 };
    const pp = parts.get(s.id) || { total: 0, done: 0 };
    const mainHas = s.has_quiz || task.total > 0 || pp.total > 0;
    const mainDone = (!s.has_quiz || s.attempts > 0) && task.done >= task.total && pp.done >= pp.total && mainHas;
    const state = (done: boolean, open: boolean, due: number | null) => (done ? "done" : !open ? "locked" : due && due < now ? "overdue" : "todo");
    const liveItem = x.sessionId
      ? { key: "live", state: ["present", "late", "excused"].includes(mark || "") ? "done" : mark === "absent" ? "overdue" : mark === "pending" ? "todo" : x.ended ? "todo" : "locked", mark, excuse: excuses.get(x.sessionId) || null }
      : null;
    const absent = mark === "absent";
    const quickOpen = test || (!!x.quickOpens && x.quickOpens <= now && s.unlocked && (!absent || watched >= 90));
    const quickDue = absent ? x.mainDue : x.quickDue;
    const quickItem = hasQuick ? { key: "quick", state: state(quickPct !== null, quickOpen, quickDue), percent: quickPct, opensAt: x.quickOpens, dueAt: quickDue, afterWatch: absent && watched < 90 } : null;
    const watchItem = x.sessionId ? { key: "watch", state: state(watched >= 90 || skip, x.ended && x.recordingReady, x.mainDue), percent: watched, skipped: skip && watched < 90, ready: x.recordingReady } : null;
    const mainOpen = test || s.unlocked && (!x.sessionId || watched >= 90 || skip || (x.ended && !x.recordingReady && !!x.quickOpens && now > x.quickOpens + 24 * H));
    const mainItem = mainHas ? { key: "main", state: state(mainDone, mainOpen, x.mainDue), best: s.best, passed: s.passed, dueAt: x.mainDue, tasks: task, parts: pp } : null;
    const stars = !s.unlocked ? 0 : (hasQuick ? quickPct !== null : ["present", "late", "excused"].includes(mark || "") || !x.sessionId) ? 1 + ((s.best ?? 0) >= 70 ? 1 : 0) + ((s.best ?? 0) >= 90 && late.has(s.id) ? 1 : 0) : 0;
    return {
      id: s.id, position: s.position, title: s.title, kind: s.kind, unlocked: s.unlocked, reason: s.reason, opensAt: s.opens_at,
      month: Math.floor((s.position - 1) / 12) + 1, sessionId: x.sessionId, stars: Math.min(3, stars),
      steps: [liveItem, quickItem, watchItem, mainItem].filter(Boolean),
    };
  });
}

/* ---------------- Marshrutlar ---------------- */
export function registerClassroomFlow(app: Express) {
  // O'quvchi: oylik xarita + har dars bosqichlari + bu oygi jarima ballari.
  app.get(P + "/groups/:id/flow", requireAuth, route(async (req) => {
    const id = uuid.parse(req.params.id), uid = userOf(req);
    const { teacher } = await membership(id, uid);
    const lessons = await lessonFlow(id, uid, teacher);
    const penalties = teacher ? [] : (await pool.query(
      "SELECT points,kind,note,created_at FROM cls_penalties WHERE group_id=$1 AND user_id=$2 AND NOT cancelled AND to_char(created_at + interval '5 hours','YYYY-MM')=$3 ORDER BY created_at DESC",
      [id, uid, monthKey()],
    )).rows;
    const steps = lessons.flatMap((l) => l.steps as any[]);
    return {
      lessons,
      points: penalties.reduce((a: number, p: any) => a + p.points, 0),
      penalties,
      week: { done: steps.filter((s) => s.state === "done").length, overdue: steps.filter((s) => s.state === "overdue").length },
    };
  }));

  // Uzr: darsdan oldin ("kira olmayman") yoki keyin (yozuvni ko'rishga ruxsat so'rash).
  app.post(P + "/live/:id/excuse", requireAuth, route(async (req) => {
    const id = uuid.parse(req.params.id), uid = userOf(req);
    const b = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body);
    const s = (await pool.query("SELECT * FROM cls_live_sessions WHERE id=$1", [id])).rows[0] || fail(404, "Dars topilmadi");
    const { teacher } = await membership(s.group_id, uid);
    if (teacher) fail(400, "O‘qituvchi uchun emas");
    const phase = Date.now() < new Date(s.starts_at).getTime() ? "before" : "after";
    const r = await pool.query(
      `INSERT INTO cls_excuses(session_id,user_id,phase,reason) VALUES($1,$2,$3,$4)
       ON CONFLICT(session_id,user_id) DO UPDATE SET reason=EXCLUDED.reason, phase=EXCLUDED.phase, created_at=now() WHERE cls_excuses.status='pending' RETURNING id,status`,
      [id, uid, phase, b.reason],
    );
    if (!r.rowCount) fail(409, "Bu dars bo‘yicha so‘rovingiz allaqachon ko‘rib chiqilgan");
    const staff = (await groupStaff(s.group_id)).map((x: any) => x.user_id);
    const name = (await pool.query("SELECT full_name FROM users WHERE id=$1", [uid])).rows[0]?.full_name || "O‘quvchi";
    if (staff.length) await notifyUsers(staff, s.group_id, { title: phase === "before" ? "Darsga kira olmayman" : "Yozuvga ruxsat so‘rovi", body: `${name} — ${s.title}: ${b.reason}`, path: "", ref: `excuse-${r.rows[0].id}` });
    return { status: "pending", phase };
  }));

  // Yozuvni ko'rish: 10 soniyalik bo'laklar; ≥90% ko'rilsa asosiy topshiriq ochiladi.
  app.post(P + "/live/:id/watch", requireAuth, route(async (req) => {
    const id = uuid.parse(req.params.id), uid = userOf(req);
    const b = z.object({ from: z.number().min(0).max(36000), to: z.number().min(0).max(36000), duration: z.number().min(1).max(36000) }).parse(req.body);
    const s = (await pool.query("SELECT * FROM cls_live_sessions WHERE id=$1", [id])).rows[0] || fail(404, "Dars topilmadi");
    const { teacher } = await membership(s.group_id, uid);
    if (!(await canWatch(s, uid, teacher)).ok) fail(403, "Yozuvni ko‘rishga ruxsat yo‘q");
    if (b.to - b.from > 45 || b.to < b.from) return { percent: null };
    const row = (await pool.query("SELECT buckets,duration FROM cls_watch WHERE session_id=$1 AND user_id=$2", [id, uid])).rows[0];
    const set = new Set<number>(row?.buckets || []);
    for (let k = Math.floor(b.from / 10); k <= Math.floor(Math.max(b.from, b.to - 1) / 10); k++) set.add(k);
    const duration = Math.max(row?.duration || 0, Math.round(b.duration));
    const total = Math.max(1, Math.ceil(duration / 10));
    const percent = Math.min(100, Math.round(([...set].filter((k) => k < total).length / total) * 100));
    await pool.query(
      `INSERT INTO cls_watch(session_id,user_id,buckets,duration,percent) VALUES($1,$2,$3,$4,$5)
       ON CONFLICT(session_id,user_id) DO UPDATE SET buckets=EXCLUDED.buckets,duration=EXCLUDED.duration,percent=EXCLUDED.percent,updated_at=now()`,
      [id, uid, JSON.stringify([...set].sort((a, c) => a - c)), duration, percent],
    );
    return { percent };
  }));

  // Tezkor topshiriq: dars tugagach ochiladi, bitta urinish.
  app.post(P + "/groups/:id/lessons/:lessonId/quick", requireAuth, route(async (req) => {
    const id = uuid.parse(req.params.id), lessonId = uuid.parse(req.params.lessonId), uid = userOf(req);
    const { teacher } = await membership(id, uid);
    const quiz = (await pool.query("SELECT questions FROM cls_quick_quizzes WHERE lesson_id=$1", [lessonId])).rows[0];
    if (!quiz?.questions?.length) fail(404, "Bu darsda tezkor topshiriq yo‘q");
    const state = (await lessonStates(id, uid, teacher)).find((s) => s.id === lessonId) || fail(404, "Dars topilmadi");
    const t = (await timings(id)).get(lessonId);
    const test = !teacher && (await isTestUser(uid));
    if (!teacher && !test && (!state.unlocked || !t?.quickOpens || t.quickOpens > Date.now())) fail(403, "Tezkor topshiriq dars tugagach ochiladi");
    const ab = await absentInfo(t?.sessionId || null, uid);
    if (!teacher && !test && ab.absent && ab.watched < 90) fail(403, "Darsga kirmagansiz: avval dars yozuvini oxirigacha ko‘ring, so‘ng tezkor topshiriq ochiladi");
    const done = (await pool.query("SELECT id FROM cls_quick_attempts WHERE group_id=$1 AND lesson_id=$2 AND user_id=$3 AND submitted_at IS NOT NULL LIMIT 1", [id, lessonId, uid])).rowCount;
    // Bajarilgan bo'lsa ham qayta ishlash mumkin (mustahkamlash); eng yaxshi natija hisoblanadi.
    void done;
    const open = (await pool.query("SELECT * FROM cls_quick_attempts WHERE group_id=$1 AND lesson_id=$2 AND user_id=$3 AND submitted_at IS NULL ORDER BY started_at DESC LIMIT 1", [id, lessonId, uid])).rows[0];
    if (open) return { attemptId: open.id, questions: present(quiz.questions, open.layout), dueAt: t?.quickDue };
    const layout = makeLayout(quiz.questions);
    const a = (await pool.query("INSERT INTO cls_quick_attempts(group_id,lesson_id,user_id,layout,max_score) VALUES($1,$2,$3,$4,$5) RETURNING id", [id, lessonId, uid, JSON.stringify(layout), layout.length])).rows[0];
    return { attemptId: a.id, questions: present(quiz.questions, layout), dueAt: t?.quickDue };
  }));
  app.post(P + "/quick-attempts/:id/submit", requireAuth, route(async (req) => {
    const id = uuid.parse(req.params.id), uid = userOf(req);
    const answers = answersSchema.parse(req.body).answers;
    const a = (await pool.query("SELECT * FROM cls_quick_attempts WHERE id=$1 AND user_id=$2", [id, uid])).rows[0] || fail(404, "Urinish topilmadi");
    if (a.submitted_at) fail(409, "Allaqachon yuborilgan");
    const quiz = (await pool.query("SELECT questions FROM cls_quick_quizzes WHERE lesson_id=$1", [a.lesson_id])).rows[0] || fail(404, "Topshiriq topilmadi");
    const g = grade(quiz.questions, a.layout, a.layout.map((_: unknown, i: number) => answers[i] ?? null));
    const percent = Math.round((g.score / Math.max(1, g.max)) * 100);
    const r = await pool.query("UPDATE cls_quick_attempts SET answers=$2,score=$3,percent=$4,submitted_at=now() WHERE id=$1 AND submitted_at IS NULL", [id, JSON.stringify(answers), g.score, percent]);
    if (!r.rowCount) fail(409, "Allaqachon yuborilgan");
    return { score: g.score, max: g.max, percent, skip: percent >= 85, review: g.review };
  }));

  /* ---------- O'qituvchi ---------- */
  app.get(P + "/admin/lessons/:id/quick", requireStaff, route(async (req) => ({
    questions: (await pool.query("SELECT questions FROM cls_quick_quizzes WHERE lesson_id=$1", [uuid.parse(req.params.id)])).rows[0]?.questions || [],
  })));
  app.put(P + "/admin/lessons/:id/quick", requireStaff, route(async (req) => {
    const id = uuid.parse(req.params.id);
    const b = z.object({ questions: z.array(questionSchema).max(30) }).parse(req.body);
    if (!b.questions.length) await pool.query("DELETE FROM cls_quick_quizzes WHERE lesson_id=$1", [id]);
    else await pool.query("INSERT INTO cls_quick_quizzes(lesson_id,questions) VALUES($1,$2) ON CONFLICT(lesson_id) DO UPDATE SET questions=EXCLUDED.questions, updated_at=now()", [id, JSON.stringify(b.questions)]);
    return { count: b.questions.length };
  }));

  // Davomat va uzrlar.
  app.get(P + "/admin/live/:id/marks", requireStaff, route(async (req) => {
    const id = uuid.parse(req.params.id);
    const s = (await pool.query("SELECT * FROM cls_live_sessions WHERE id=$1", [id])).rows[0] || fail(404, "Dars topilmadi");
    await needGroup(s.group_id, userOf(req), "view");
    const w = sessionWindow(s);
    return {
      finalized: !!s.finalized_at,
      lessonSeconds: w.seconds,
      people: (await pool.query(
        `SELECT m.user_id, COALESCE(NULLIF(m.display_name,''),u.full_name) AS name, mk.status, mk.manual, p.seconds, p.first_seen,
                (SELECT row_to_json(e) FROM (SELECT id,reason,status,phase FROM cls_excuses e WHERE e.session_id=$1 AND e.user_id=m.user_id) e) AS excuse
           FROM cls_members m JOIN users u ON u.id=m.user_id
           LEFT JOIN cls_marks mk ON mk.session_id=$1 AND mk.user_id=m.user_id
           LEFT JOIN cls_presence p ON p.session_id=$1 AND p.user_id=m.user_id
          WHERE m.group_id=$2 AND m.status='active' ORDER BY name`,
        [id, s.group_id],
      )).rows,
    };
  }));
  app.post(P + "/admin/live/:id/mark", requireStaff, route(async (req) => {
    const id = uuid.parse(req.params.id);
    const b = z.object({ userId: z.string().min(1).max(100), status: z.enum(["present", "late", "excused", "absent"]) }).parse(req.body);
    const s = (await pool.query("SELECT * FROM cls_live_sessions WHERE id=$1", [id])).rows[0] || fail(404, "Dars topilmadi");
    await needGroup(s.group_id, userOf(req));
    await setMark(s, b.userId, b.status, 0, true);
  }));
  // O'qituvchi oldindan "Uzrli" deb belgilaydi.
  app.post(P + "/admin/live/:id/excuse", requireStaff, route(async (req) => {
    const id = uuid.parse(req.params.id);
    const b = z.object({ userId: z.string().min(1).max(100), reason: z.string().trim().max(500).default("") }).parse(req.body);
    const s = (await pool.query("SELECT * FROM cls_live_sessions WHERE id=$1", [id])).rows[0] || fail(404, "Dars topilmadi");
    await needGroup(s.group_id, userOf(req));
    await pool.query(
      `INSERT INTO cls_excuses(session_id,user_id,phase,reason,status,decided_by,decided_at) VALUES($1,$2,'before',$3,'approved',$4,now())
       ON CONFLICT(session_id,user_id) DO UPDATE SET status='approved', decided_by=EXCLUDED.decided_by, decided_at=now()`,
      [id, b.userId, b.reason || "O‘qituvchi belgiladi", userOf(req)],
    );
    if (s.finalized_at) await setMark(s, b.userId, "excused", 0, true);
  }));
  app.get(P + "/admin/groups/:id/excuses", requireStaff, route(async (req) => {
    const id = uuid.parse(req.params.id);
    await needGroup(id, userOf(req), "view");
    return {
      excuses: (await pool.query(
        `SELECT e.*, s.title, s.starts_at, COALESCE(NULLIF(m.display_name,''),u.full_name) AS name FROM cls_excuses e
           JOIN cls_live_sessions s ON s.id=e.session_id JOIN users u ON u.id=e.user_id LEFT JOIN cls_members m ON m.group_id=s.group_id AND m.user_id=e.user_id
          WHERE s.group_id=$1 AND e.status='pending' ORDER BY e.created_at`,
        [id],
      )).rows,
    };
  }));
  app.post(P + "/admin/excuses/:id", requireStaff, route(async (req) => {
    const id = uuid.parse(req.params.id);
    const b = z.object({ approve: z.boolean() }).parse(req.body);
    const e = (await pool.query("SELECT e.*, s.group_id FROM cls_excuses e JOIN cls_live_sessions s ON s.id=e.session_id WHERE e.id=$1", [id])).rows[0] || fail(404, "So‘rov topilmadi");
    await needGroup(e.group_id, userOf(req));
    await pool.query("UPDATE cls_excuses SET status=$2, decided_by=$3, decided_at=now() WHERE id=$1", [id, b.approve ? "approved" : "rejected", userOf(req)]);
    const s = (await pool.query("SELECT * FROM cls_live_sessions WHERE id=$1", [e.session_id])).rows[0];
    const mark = (await pool.query("SELECT status FROM cls_marks WHERE session_id=$1 AND user_id=$2", [s.id, e.user_id])).rows[0]?.status;
    if (b.approve && s.finalized_at && mark !== "present" && mark !== "late") await setMark(s, e.user_id, "excused", 0, true);
    if (!b.approve && mark === "pending") await setMark(s, e.user_id, "absent", 0);
    await notifyUsers([e.user_id], e.group_id, {
      title: b.approve ? "So‘rovingiz qabul qilindi" : "So‘rovingiz rad etildi",
      body: b.approve ? `${s.title}: dars uzrli deb belgilandi, yozuv ochiq.` : `${s.title}: o‘qituvchi so‘rovni rad etdi.`,
      path: "darslar",
      ref: `excuse-decided-${id}`,
    });
  }));

  // Jarima ballari: ko'rinish, qo'lda (chat odobi) qo'shish, bekor qilish.
  app.get(P + "/admin/groups/:id/discipline", requireStaff, route(async (req) => {
    const id = uuid.parse(req.params.id);
    await needGroup(id, userOf(req), "view");
    const month = monthKey();
    return {
      month,
      students: (await pool.query(
        `SELECT m.user_id, COALESCE(NULLIF(m.display_name,''),u.full_name) AS name,
                COALESCE((SELECT sum(points) FROM cls_penalties p WHERE p.group_id=m.group_id AND p.user_id=m.user_id AND NOT p.cancelled AND to_char(p.created_at + interval '5 hours','YYYY-MM')=$2),0)::int AS points,
                (SELECT COALESCE(json_agg(row_to_json(x) ORDER BY x.created_at DESC),'[]') FROM (SELECT id,points,kind,note,created_at FROM cls_penalties p WHERE p.group_id=m.group_id AND p.user_id=m.user_id AND NOT p.cancelled AND to_char(p.created_at + interval '5 hours','YYYY-MM')=$2) x) AS items
           FROM cls_members m JOIN users u ON u.id=m.user_id WHERE m.group_id=$1 AND m.status='active' ORDER BY points DESC, name`,
        [id, month],
      )).rows,
    };
  }));
  app.post(P + "/admin/groups/:id/penalties", requireStaff, route(async (req) => {
    const id = uuid.parse(req.params.id);
    await needGroup(id, userOf(req));
    const b = z.object({ userId: z.string().min(1).max(100), note: z.string().trim().min(3).max(300) }).parse(req.body);
    const ok = await addPenalty(id, b.userId, "conduct", `conduct-${Date.now()}`, b.note);
    if (!ok) fail(409, "Bu guruhda jarima ballari o‘chirilgan");
  }));
  app.delete(P + "/admin/penalties/:id", requireStaff, route(async (req) => {
    const id = uuid.parse(req.params.id);
    const p = (await pool.query("SELECT group_id FROM cls_penalties WHERE id=$1", [id])).rows[0] || fail(404, "Ball topilmadi");
    await needGroup(p.group_id, userOf(req));
    await pool.query("UPDATE cls_penalties SET cancelled=true WHERE id=$1", [id]);
  }));

  // O'qituvchi cheklisti: o'quvchilar × darslar.
  app.get(P + "/admin/groups/:id/checklist", requireStaff, route(async (req) => {
    const id = uuid.parse(req.params.id);
    await needGroup(id, userOf(req), "view");
    const members = (await pool.query("SELECT m.user_id, COALESCE(NULLIF(m.display_name,''),u.full_name) AS name FROM cls_members m JOIN users u ON u.id=m.user_id WHERE m.group_id=$1 AND m.status='active' ORDER BY name", [id])).rows;
    const rows = [];
    let lessons: any[] = [];
    for (const m of members) {
      const flow = await lessonFlow(id, m.user_id, false);
      if (!lessons.length) lessons = flow.filter((l) => l.unlocked).map((l) => ({ id: l.id, position: l.position, title: l.title }));
      const cells = flow.filter((l) => l.unlocked).map((l) => {
        const st = (l.steps as any[]).map((s) => s.state);
        return st.includes("overdue") ? "overdue" : st.length && st.every((x) => x === "done") ? "done" : "todo";
      });
      rows.push({ userId: m.user_id, name: m.name, cells, overdue: cells.filter((c) => c === "overdue").length });
    }
    rows.sort((a, b) => b.overdue - a.overdue || a.name.localeCompare(b.name));
    return { lessons, rows };
  }));

  // O'qituvchi hisoboti: tanlangan dars bo'yicha har o'quvchi — davomat, tezkor, asosiy test, qismlar, vazifalar, jarima; umumiy reyting.
  app.get(P + "/admin/groups/:id/report", requireStaff, route(async (req) => {
    const id = uuid.parse(req.params.id);
    await needGroup(id, userOf(req), "view");
    const members = (await pool.query("SELECT m.user_id, COALESCE(NULLIF(m.display_name,''),u.full_name) AS name FROM cls_members m JOIN users u ON u.id=m.user_id WHERE m.group_id=$1 AND m.status='active' ORDER BY name", [id])).rows;
    const flows = await Promise.all(members.map(async (m: any) => ({ m, flow: await lessonFlow(id, m.user_id, false) })));
    const lessons = (await lessonStates(id, userOf(req), true)).map((l) => ({ id: l.id, position: l.position, title: l.title, kind: l.kind, opened: flows.some((f) => f.flow.find((x) => x.id === l.id)?.unlocked) }));
    const wanted = typeof req.query.lessonId === "string" ? uuid.parse(req.query.lessonId) : null;
    const lesson = (wanted && lessons.find((l) => l.id === wanted)) || [...lessons].reverse().find((l) => l.opened) || lessons[0] || null;
    const pen = lesson
      ? new Map<string, number>((await pool.query(
          `SELECT p.user_id, sum(p.points)::int AS n FROM cls_penalties p WHERE p.group_id=$1 AND NOT p.cancelled
              AND (p.ref=$2 OR p.ref IN (SELECT s.id::text FROM cls_live_sessions s WHERE s.group_id=$1 AND s.lesson_id=$2::uuid)) GROUP BY p.user_id`,
          [id, lesson.id],
        )).rows.map((r: any) => [r.user_id, r.n]))
      : new Map<string, number>();
    const rows = lesson
      ? flows.map(({ m, flow }) => {
          const l = flow.find((x) => x.id === lesson.id)!;
          const step = (k: string) => (l.steps as any[]).find((x) => x.key === k) || null;
          const live = step("live"), quick = step("quick"), watch = step("watch"), main = step("main");
          const states = (l.steps as any[]).map((x) => x.state);
          return {
            userId: m.user_id, name: m.name, unlocked: l.unlocked,
            mark: live?.mark || null, quick: quick ? quick.percent : null, watched: watch ? watch.percent : null,
            main: main ? main.best : null, parts: main?.parts || null, tasks: main?.tasks || null,
            status: !l.unlocked ? "locked" : states.length && states.every((x) => x === "done") ? "done" : states.includes("overdue") ? "overdue" : "todo",
            penalties: pen.get(m.user_id) || 0,
          };
        })
      : [];
    const order = { overdue: 0, todo: 1, locked: 2, done: 3 } as Record<string, number>;
    rows.sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
    const ranking = (await leaderboard(id)).map((r: any) => ({ rank: r.rank, userId: r.user_id, name: r.name, points: r.points, done: r.done, penalties: r.penalties }));
    return { lessons, lesson, rows, ranking };
  }));

  // Mavzu bo'yicha xatolar: guruhning yarmidan ko'pi xato qilgan mavzular — qayta tushuntirish kerak.
  app.get(P + "/admin/groups/:id/topics", requireStaff, route(async (req) => {
    const id = uuid.parse(req.params.id);
    await needGroup(id, userOf(req), "view");
    const attempts = (await pool.query(
      `SELECT a.lesson_id, a.layout, a.answers, q.questions, l.title FROM cls_attempts a JOIN cls_quizzes q ON q.lesson_id=a.lesson_id JOIN cls_lessons l ON l.id=a.lesson_id
        WHERE a.group_id=$1 AND a.submitted_at IS NOT NULL
       UNION ALL
       SELECT a.lesson_id, a.layout, a.answers, q.questions, l.title FROM cls_quick_attempts a JOIN cls_quick_quizzes q ON q.lesson_id=a.lesson_id JOIN cls_lessons l ON l.id=a.lesson_id
        WHERE a.group_id=$1 AND a.submitted_at IS NOT NULL`,
      [id],
    )).rows;
    const stat = new Map<string, { topic: string; lesson: string; wrong: number; total: number }>();
    for (const a of attempts) {
      const g = grade(a.questions, a.layout, a.layout.map((_: unknown, i: number) => a.answers?.[i] ?? null));
      g.review.forEach((r: any) => {
        if (!r.topic) return;
        const k = a.lesson_id + "|" + r.topic;
        const v = stat.get(k) || { topic: r.topic, lesson: a.title, wrong: 0, total: 0 };
        v.total++;
        if (!r.right) v.wrong++;
        stat.set(k, v);
      });
    }
    return {
      topics: [...stat.values()].map((v) => ({ ...v, errorPercent: Math.round((v.wrong / v.total) * 100), reexplain: v.total >= 3 && v.wrong / v.total > 0.5 })).sort((a, b) => b.errorPercent - a.errorPercent),
    };
  }));
}
