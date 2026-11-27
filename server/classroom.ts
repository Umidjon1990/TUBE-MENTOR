// Sinfxona (online kurs): kurs → darslar (+test), guruh → a'zolar, jadval, e'lonlar, natijalar.
// Rollar: admin (hamma narsa), o'qituvchi (o'z guruhlari va kurslari), yordamchi (biriktirilgan guruhda chat va
// vazifalarni ko'radi, sozlamalarni o'zgartirmaydi). O'quvchi guruhga taklif havolasi orqali qo'shiladi.
import type { Express, NextFunction, Request, Response } from "express";
import { randomBytes, randomInt } from "node:crypto";
import { z } from "zod";
import { pool } from "./db";
import { requireAuth } from "./auth";
import { currentOffer, isPreapproved, recordAgreement } from "./classroom-enroll";
import { mainGate } from "./classroom-flow";
import { OFFER_CONSENTS } from "./offer-draft";

export class ClassError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
const fail = (status: number, message: string): never => {
  throw new ClassError(status, message);
};
type Handler = (req: Request, res: Response) => Promise<unknown>;
export const route = (fn: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.set("Cache-Control", "no-store");
    const out = await fn(req, res);
    if (!res.headersSent) res.json(out ?? { ok: true });
  } catch (error) {
    if (error instanceof ClassError) return res.status(error.status).json({ message: error.message });
    if (error instanceof z.ZodError) return res.status(400).json({ message: "Ma’lumot noto‘g‘ri kiritildi" });
    next(error);
  }
};
export const uuid = z.string().uuid();
const userOf = (req: Request) => String(req.session.userId);

/* ------------------------------------------------------------------ */
/* Schemas                                                             */
/* ------------------------------------------------------------------ */
const choiceSchema = z.object({
  q: z.string().trim().min(1).max(2000),
  options: z.array(z.string().trim().min(1).max(500)).min(2).max(6),
  correct: z.number().int().min(0),
  explanation: z.string().trim().max(2000).optional().default(""),
  topic: z.string().trim().max(80).optional(),
  /** Savol rasmi (cls_media xeshi). So'z imtihonida imgWord — so'z raqami, import paytida xeshga aylanadi. */
  img: z.string().regex(/^[a-f0-9]{40}$/).optional(),
  imgWord: z.number().int().min(1).max(80).optional(),
}).refine((q) => q.correct < q.options.length, "To‘g‘ri javob varianti noto‘g‘ri");
/** So'zlardan gap tuzish: words — to'g'ri tartibda; o'quvchiga aralashtirib ko'rsatiladi. */
const orderSchema = z.object({
  type: z.literal("order"),
  q: z.string().trim().min(1).max(2000),
  words: z.array(z.string().trim().min(1).max(120)).min(2).max(14),
  explanation: z.string().trim().max(2000).optional().default(""),
  topic: z.string().trim().max(80).optional(),
});
/** Moslashtirish: pairs — to'g'ri juftliklar (a ↔ b); o'quvchiga b tomoni aralashtirib ko'rsatiladi. */
const matchSchema = z.object({
  type: z.literal("match"),
  q: z.string().trim().min(1).max(2000),
  pairs: z.array(z.object({ a: z.string().trim().min(1).max(200), b: z.string().trim().min(1).max(200) })).min(2).max(8),
  explanation: z.string().trim().max(2000).optional().default(""),
  topic: z.string().trim().max(80).optional(),
});
export const questionSchema = z.union([orderSchema, matchSchema, choiceSchema]);
export const answersSchema = z.object({ answers: z.array(z.union([z.number().int().min(0).max(10), z.array(z.number().int().min(0).max(20)).max(20)]).nullable()).max(100) });
export const quizSchema = z.object({
  questions: z.array(questionSchema).min(1).max(100),
  timeLimitMinutes: z.number().int().min(1).max(240).nullable().optional(),
  maxAttempts: z.number().int().min(1).max(20).optional(),
});
const lessonSchema = z.object({
  title: z.string().trim().min(1).max(200),
  kind: z.enum(["lesson", "midterm", "final"]).default("lesson"),
  body: z.string().max(50000).optional().default(""),
  videoUrl: z.string().trim().max(1000).optional().default(""),
  passPercent: z.number().int().min(0).max(100).optional().default(60),
});
const groupSettings = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  inviteActive: z.boolean().optional(),
  autoApprove: z.boolean().optional(),
  allowPeerDm: z.boolean().optional(),
  leaderboardMode: z.enum(["top10", "all"]).optional(),
  latePenalty: z.number().int().min(0).max(100).optional(),
  archived: z.boolean().optional(),
  offerRequired: z.boolean().optional(),
  discipline: z.boolean().optional(),
});
export const inviteCode = () => randomBytes(9).toString("base64url");

/* ------------------------------------------------------------------ */
/* Access                                                              */
/* ------------------------------------------------------------------ */
export async function isAdmin(userId: string) {
  return (await pool.query("SELECT role FROM users WHERE id=$1", [userId])).rows[0]?.role === "admin";
}
export type StaffRole = "admin" | "teacher" | "assistant";
/** Platformadagi o'qituvchilik roli (guruhdan qat'i nazar). */
export async function staffRole(userId: string): Promise<StaffRole | null> {
  const r = (await pool.query("SELECT u.role, s.role AS staff, s.active FROM users u LEFT JOIN cls_staff s ON s.user_id=u.id WHERE u.id=$1", [userId])).rows[0];
  if (!r) return null;
  if (r.role === "admin") return "admin";
  return r.staff && r.active ? (r.staff as StaffRole) : null;
}
/** Shu guruhdagi roli: admin hamma guruhda; o'qituvchi/yordamchi faqat biriktirilgan guruhida. */
export async function groupRole(groupId: string, userId: string): Promise<StaffRole | null> {
  const r = (
    await pool.query(
      `SELECT u.role, gs.role AS grole, s.active FROM users u
         LEFT JOIN cls_group_staff gs ON gs.user_id=u.id AND gs.group_id=$1
         LEFT JOIN cls_staff s ON s.user_id=u.id
        WHERE u.id=$2`,
      [groupId, userId],
    )
  ).rows[0];
  if (!r) return null;
  if (r.role === "admin") return "admin";
  return r.grole && r.active !== false ? (r.grole as StaffRole) : null;
}
/** Guruh bo'yicha ruxsat: "view" — o'qituvchi va yordamchi; "manage" — faqat admin va o'qituvchi. */
export async function needGroup(groupId: string, userId: string, level: "view" | "manage" = "manage") {
  const g = (await pool.query("SELECT g.*, c.title AS course_title FROM cls_groups g JOIN cls_courses c ON c.id=g.course_id WHERE g.id=$1", [groupId])).rows[0];
  if (!g) fail(404, "Guruh topilmadi");
  const role = await groupRole(groupId, userId);
  if (!role || (level === "manage" && role === "assistant")) fail(role ? 403 : 404, role ? "Bu amal faqat o‘qituvchi uchun" : "Guruh topilmadi");
  return { group: g, role: role as StaffRole };
}
/** Kurs bo'yicha ruxsat: admin; kurs egasi; yoki shu kurs bo'yicha guruhning o'qituvchisi. */
export async function needCourse(courseId: string, userId: string, level: "view" | "manage" = "manage") {
  const c = (await pool.query("SELECT * FROM cls_courses WHERE id=$1", [courseId])).rows[0];
  if (!c) fail(404, "Kurs topilmadi");
  const role = await staffRole(userId);
  if (role === "admin") return c;
  if (role && c.owner_id === userId) return c;
  const via = (
    await pool.query("SELECT gs.role FROM cls_group_staff gs JOIN cls_groups g ON g.id=gs.group_id WHERE g.course_id=$1 AND gs.user_id=$2", [courseId, userId])
  ).rows.map((r: any) => r.role);
  if (via.includes("teacher") || (level === "view" && via.length)) return c;
  return fail(404, "Kurs topilmadi");
}
export async function needLesson(lessonId: string, userId: string, level: "view" | "manage" = "manage") {
  const l = (await pool.query("SELECT * FROM cls_lessons WHERE id=$1", [lessonId])).rows[0];
  if (!l) fail(404, "Dars topilmadi");
  await needCourse(l.course_id, userId, level);
  return l;
}
/** Guruh xodimlari (o'qituvchi + yordamchi) — bildirishnoma va "O'qituvchi" kontakti uchun. */
export async function groupStaff(groupId: string) {
  return (
    await pool.query(
      `SELECT gs.user_id, gs.role, u.full_name FROM cls_group_staff gs JOIN users u ON u.id=gs.user_id
        LEFT JOIN cls_staff s ON s.user_id=gs.user_id
        WHERE gs.group_id=$1 AND u.is_active AND (u.role='admin' OR s.active) ORDER BY (gs.role='teacher') DESC, gs.created_at`,
      [groupId],
    )
  ).rows as { user_id: string; role: string; full_name: string }[];
}
/** Kirgan foydalanuvchi o'qituvchi/yordamchi/admin bo'lishi shart. */
export const requireStaff = (req: Request, res: Response, next: NextFunction) =>
  requireAuth(req, res, async (err?: unknown) => {
    if (err) return next(err);
    try {
      const role = await staffRole(String(req.session.userId));
      if (!role) return res.status(403).json({ message: "Faqat o‘qituvchilar uchun" });
      res.locals.staffRole = role;
      next();
    } catch (e) {
      next(e);
    }
  });
/** Guruhga kirish: guruh xodimi har doim; o'quvchi faqat faol a'zo bo'lsa. */
export async function membership(groupId: string, userId: string) {
  const g = (await pool.query("SELECT * FROM cls_groups WHERE id=$1", [groupId])).rows[0];
  if (!g) fail(404, "Guruh topilmadi");
  const role = await groupRole(groupId, userId);
  if (role) return { group: g, teacher: true, role, manage: role !== "assistant", member: null as any };
  const m = (await pool.query("SELECT * FROM cls_members WHERE group_id=$1 AND user_id=$2", [groupId, userId])).rows[0];
  if (!m || m.status !== "active") fail(403, m?.status === "pending" ? "A’zoligingiz o‘qituvchi tasdig‘ini kutmoqda" : "Bu guruhga kirish huquqingiz yo‘q");
  if (g.archived) fail(403, "Guruh yopilgan");
  return { group: g, teacher: false, role: null as StaffRole | null, manage: false, member: m };
}

/* ------------------------------------------------------------------ */
/* Lesson state (ochilish qoidasi)                                     */
/* ------------------------------------------------------------------ */
type LessonRow = { id: string; position: number; kind: string; title: string; pass_percent: number; has_quiz: boolean; opens_at: Date | null; due_at: Date | null; question_count: number; max_attempts: number | null; task_count: number };
export type LessonState = LessonRow & { unlocked: boolean; reason: "open" | "date" | "previous" | "unscheduled"; best: number | null; attempts: number; passed: boolean };

/** Sinov hisobi (admin "O'quvchi sifatida kirish"): barcha qulflar ochiq, urinishlar cheklanmaydi, jarima yozilmaydi. */
export async function isTestUser(userId: string) {
  return !!(await pool.query("SELECT is_test FROM users WHERE id=$1", [userId])).rows[0]?.is_test;
}
export async function lessonStates(groupId: string, userId: string, teacher = false, now = new Date()): Promise<LessonState[]> {
  if (!teacher && (await isTestUser(userId))) teacher = true;
  const lessons: LessonRow[] = (
    await pool.query(
      `SELECT l.id,l.position,l.kind,l.title,l.pass_percent,(q.lesson_id IS NOT NULL) AS has_quiz,
              COALESCE(jsonb_array_length(q.questions),0)::int AS question_count, q.max_attempts,
              gl.opens_at, gl.due_at,
              (SELECT count(*)::int FROM cls_tasks t WHERE t.lesson_id=l.id) AS task_count
         FROM cls_groups g JOIN cls_lessons l ON l.course_id=g.course_id
         LEFT JOIN cls_quizzes q ON q.lesson_id=l.id
         LEFT JOIN cls_group_lessons gl ON gl.group_id=g.id AND gl.lesson_id=l.id
        WHERE g.id=$1 ORDER BY l.position, l.created_at`,
      [groupId],
    )
  ).rows;
  const best = new Map<string, { best: number; attempts: number }>(
    (
      await pool.query(
        `SELECT lesson_id, max(effective_percent)::int AS best, count(*)::int AS attempts
           FROM cls_attempts WHERE group_id=$1 AND user_id=$2 AND submitted_at IS NOT NULL GROUP BY lesson_id`,
        [groupId, userId],
      )
    ).rows.map((r: any) => [r.lesson_id, { best: r.best, attempts: r.attempts }]),
  );
  const manual = new Set(
    (await pool.query("SELECT lesson_id FROM cls_unlocks WHERE group_id=$1 AND user_id=$2", [groupId, userId])).rows.map((r: any) => r.lesson_id),
  );
  let previousPassed = true;
  return lessons.map((l) => {
    const b = best.get(l.id);
    const passed = l.has_quiz ? (b?.best ?? -1) >= l.pass_percent : true;
    let reason: LessonState["reason"] = "open";
    if (!teacher && !manual.has(l.id)) {
      if (!l.opens_at) reason = "unscheduled";
      else if (new Date(l.opens_at) > now) reason = "date";
      else if (!previousPassed) reason = "previous";
    }
    const unlocked = reason === "open";
    previousPassed = unlocked && passed;
    return { ...l, unlocked, reason, best: b?.best ?? null, attempts: b?.attempts ?? 0, passed };
  });
}

/* ------------------------------------------------------------------ */
/* Quiz attempts                                                       */
/* ------------------------------------------------------------------ */
function shuffle<T>(items: T[]) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
/** Savollar va variantlar tartibi har urinishda aralashtiriladi; layout = asl indekslar. */
const items = (q: any): string[] => (q.type === "order" ? q.words : q.type === "match" ? q.pairs : q.options);
export function makeLayout(questions: any[]) {
  return shuffle(questions.map((_, i) => i)).map((qi) => {
    let o = shuffle(items(questions[qi]).map((_, j) => j));
    // Gap tuzishda aralashtirilgan tartib tasodifan to'g'ri chiqmasin.
    if ((questions[qi].type === "order" || questions[qi].type === "match") && o.every((v, i) => v === i)) o = [...o.slice(1), o[0]];
    return { q: qi, o };
  });
}
export function present(questions: any[], layout: { q: number; o: number[] }[]) {
  return layout.map((l) => {
    const q = questions[l.q];
    if (q.type === "match") return { type: "match", q: q.q, left: q.pairs.map((p: any) => p.a), right: l.o.map((j) => q.pairs[j].b) };
    return q.type === "order" ? { type: "order", q: q.q, words: l.o.map((j) => q.words[j]) } : { q: q.q, options: l.o.map((j) => q.options[j]), ...(q.img ? { img: q.img } : {}) };
  });
}
/** answers[i]: variant raqami (test) yoki ko'rsatilgan so'zlar tartibi (gap tuzish). */
export function grade(questions: any[], layout: { q: number; o: number[] }[], answers: (number | number[] | null)[]) {
  let score = 0;
  const review = layout.map((l, i) => {
    const q = questions[l.q], chosen = answers[i] ?? null;
    if (q.type === "match") {
      // chosen[i] = chap tomondagi i-element uchun tanlangan (ko'rsatilgan) o'ng element raqami.
      const ok = Array.isArray(chosen) && chosen.length === q.pairs.length && chosen.every((d, i) => l.o[d] === i);
      if (ok) score++;
      return { type: "match", q: q.q, left: q.pairs.map((p: any) => p.a), side: l.o.map((j) => q.pairs[j].b), chosen, answer: q.pairs.map((p: any) => `${p.a} — ${p.b}`).join("; "), right: ok, explanation: q.explanation || "", topic: q.topic || null };
    }
    if (q.type === "order") {
      const seq = Array.isArray(chosen) ? chosen.map((d) => l.o[d]) : [];
      const right = seq.length === q.words.length && seq.every((v, k) => v === k);
      if (right) score++;
      return { type: "order", q: q.q, words: l.o.map((j) => q.words[j]), chosen, answer: q.words.join(" "), right, explanation: q.explanation || "", topic: q.topic || null };
    }
    const original = typeof chosen === "number" ? l.o[chosen] : null;
    const right = original === q.correct;
    if (right) score++;
    return { q: q.q, options: l.o.map((j) => q.options[j]), chosen, correct: l.o.indexOf(q.correct), right, explanation: q.explanation || "", topic: q.topic || null };
  });
  return { score, max: layout.length, review };
}

/* ------------------------------------------------------------------ */
/* Leaderboard                                                         */
/* ------------------------------------------------------------------ */
export async function leaderboard(groupId: string) {
  return (
    await pool.query(
      `WITH best AS (
         SELECT user_id, lesson_id, max(effective_percent) AS p FROM cls_attempts
          WHERE group_id=$1 AND submitted_at IS NOT NULL GROUP BY user_id, lesson_id),
       tasks AS (
         SELECT user_id, sum(best)::int AS t FROM (
           SELECT s.user_id, max(COALESCE(s.score,0)) AS best FROM cls_submissions s
            WHERE s.group_id=$1 AND s.status='graded' GROUP BY s.user_id, s.task_id) x GROUP BY user_id)
       SELECT m.user_id, COALESCE(NULLIF(m.display_name,''), u.full_name) AS name,
              (COALESCE((SELECT sum(p) FROM best b WHERE b.user_id=m.user_id),0) + COALESCE((SELECT t FROM tasks t WHERE t.user_id=m.user_id),0))::int AS points,
              (SELECT count(*) FROM best b WHERE b.user_id=m.user_id)::int AS done
         FROM cls_members m JOIN users u ON u.id=m.user_id
        WHERE m.group_id=$1 AND m.status='active'
        ORDER BY points DESC, name`,
      [groupId],
    )
  ).rows.map((r: any, i: number) => ({ ...r, rank: i + 1 }));
}

/** O'qituvchilar guruhlari uchun yagona ichki kurs (darslarsiz, kurslar ro'yxatida ko'rinmaydi). */
async function teachersCourse(): Promise<string> {
  const found = (await pool.query("SELECT id FROM cls_courses WHERE level='teachers' ORDER BY created_at LIMIT 1")).rows[0];
  if (found) return found.id;
  return (await pool.query("INSERT INTO cls_courses(title,description,level) VALUES('O‘qituvchilar guruhi','Zoom uchrashuvlar, chat va qo‘llanma materiallari','teachers') RETURNING id")).rows[0].id;
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */
export function registerClassroom(app: Express) {
  const P = "/api/platform/class";

  /* ---------- Admin: kurslar va darslar ---------- */
  app.get(P + "/admin/courses", requireStaff, route(async (req, res) => ({
    courses: (
      await pool.query(
        `SELECT c.*, (SELECT count(*)::int FROM cls_lessons l WHERE l.course_id=c.id) AS lessons,
                (SELECT count(*)::int FROM cls_groups g WHERE g.course_id=c.id AND NOT g.archived) AS groups
           FROM cls_courses c WHERE NOT c.archived AND c.level<>'teachers'
            AND ($1 OR c.owner_id=$2 OR EXISTS(SELECT 1 FROM cls_groups g JOIN cls_group_staff gs ON gs.group_id=g.id WHERE g.course_id=c.id AND gs.user_id=$2))
          ORDER BY c.created_at DESC`,
        [res.locals.staffRole === "admin", userOf(req)],
      )
    ).rows,
  })));
  app.post(P + "/admin/courses", requireStaff, route(async (req, res) => {
    if (res.locals.staffRole === "assistant") fail(403, "Kursni faqat o‘qituvchi yaratadi");
    const b = z.object({ title: z.string().trim().min(1).max(200), description: z.string().max(5000).optional().default(""), level: z.string().max(40).optional().default("") }).parse(req.body);
    return { course: (await pool.query("INSERT INTO cls_courses(title,description,level,owner_id) VALUES($1,$2,$3,$4) RETURNING *", [b.title, b.description, b.level, userOf(req)])).rows[0] };
  }));
  app.patch(P + "/admin/courses/:id", requireStaff, route(async (req) => {
    const id = uuid.parse(req.params.id);
    await needCourse(id, userOf(req));
    const b = z.object({ title: z.string().trim().min(1).max(200).optional(), description: z.string().max(5000).optional(), level: z.string().max(40).optional(), archived: z.boolean().optional() }).parse(req.body);
    const c = (await pool.query(
      "UPDATE cls_courses SET title=COALESCE($2,title),description=COALESCE($3,description),level=COALESCE($4,level),archived=COALESCE($5,archived) WHERE id=$1 RETURNING *",
      [id, b.title ?? null, b.description ?? null, b.level ?? null, b.archived ?? null],
    )).rows[0];
    return c ? { course: c } : fail(404, "Kurs topilmadi");
  }));
  app.get(P + "/admin/courses/:id", requireStaff, route(async (req) => {
    const id = uuid.parse(req.params.id);
    const course = await needCourse(id, userOf(req), "view");
    const lessons = (
      await pool.query(
        `SELECT l.*, q.questions, q.time_limit_minutes, q.max_attempts,
                COALESCE((SELECT json_agg(t ORDER BY t.created_at) FROM cls_tasks t WHERE t.lesson_id=l.id),'[]') AS tasks
           FROM cls_lessons l LEFT JOIN cls_quizzes q ON q.lesson_id=l.id WHERE l.course_id=$1 ORDER BY l.position, l.created_at`,
        [id],
      )
    ).rows;
    return { course, lessons };
  }));
  app.post(P + "/admin/courses/:id/lessons", requireStaff, route(async (req) => {
    const id = uuid.parse(req.params.id);
    await needCourse(id, userOf(req));
    const b = lessonSchema.parse(req.body);
    const pos = (await pool.query("SELECT COALESCE(max(position),0)+1 AS p FROM cls_lessons WHERE course_id=$1", [id])).rows[0].p;
    const l = (await pool.query(
      "INSERT INTO cls_lessons(course_id,position,kind,title,body,video_url,pass_percent) SELECT $1,$2,$3,$4,$5,$6,$7 WHERE EXISTS(SELECT 1 FROM cls_courses WHERE id=$1) RETURNING *",
      [id, pos, b.kind, b.title, b.body, b.videoUrl, b.passPercent],
    )).rows[0];
    return l ? { lesson: l } : fail(404, "Kurs topilmadi");
  }));
  app.patch(P + "/admin/lessons/:id", requireStaff, route(async (req) => {
    const id = uuid.parse(req.params.id);
    await needLesson(id, userOf(req));
    const b = lessonSchema.partial().extend({ position: z.number().int().min(1).max(1000).optional() }).parse(req.body);
    const l = (await pool.query(
      `UPDATE cls_lessons SET title=COALESCE($2,title),kind=COALESCE($3,kind),body=COALESCE($4,body),video_url=COALESCE($5,video_url),
              pass_percent=COALESCE($6,pass_percent),position=COALESCE($7,position) WHERE id=$1 RETURNING *`,
      [id, b.title ?? null, b.kind ?? null, b.body ?? null, b.videoUrl ?? null, b.passPercent ?? null, b.position ?? null],
    )).rows[0];
    return l ? { lesson: l } : fail(404, "Dars topilmadi");
  }));
  app.delete(P + "/admin/lessons/:id", requireStaff, route(async (req) => {
    const id = uuid.parse(req.params.id);
    await needLesson(id, userOf(req));
    const used = (await pool.query("SELECT 1 FROM cls_attempts WHERE lesson_id=$1 LIMIT 1", [id])).rowCount;
    if (used) fail(409, "Bu dars bo‘yicha natijalar bor, uni o‘chirib bo‘lmaydi");
    await pool.query("DELETE FROM cls_lessons WHERE id=$1", [id]);
  }));
  app.put(P + "/admin/lessons/:id/quiz", requireStaff, route(async (req) => {
    const id = uuid.parse(req.params.id);
    await needLesson(id, userOf(req));
    const b = quizSchema.parse(req.body);
    const q = (await pool.query(
      `INSERT INTO cls_quizzes(lesson_id,questions,time_limit_minutes,max_attempts) SELECT $1,$2,$3,$4 WHERE EXISTS(SELECT 1 FROM cls_lessons WHERE id=$1)
       ON CONFLICT(lesson_id) DO UPDATE SET questions=EXCLUDED.questions,time_limit_minutes=EXCLUDED.time_limit_minutes,max_attempts=EXCLUDED.max_attempts,updated_at=now() RETURNING *`,
      [id, JSON.stringify(b.questions), b.timeLimitMinutes ?? null, b.maxAttempts ?? 2],
    )).rows[0];
    return q ? { quiz: q } : fail(404, "Dars topilmadi");
  }));
  app.delete(P + "/admin/lessons/:id/quiz", requireStaff, route(async (req) => {
    const id = uuid.parse(req.params.id);
    await needLesson(id, userOf(req));
    await pool.query("DELETE FROM cls_quizzes WHERE lesson_id=$1", [id]);
  }));

  /* ---------- Admin: guruhlar ---------- */
  app.get(P + "/admin/groups", requireStaff, route(async (req, res) => ({
    groups: (
      await pool.query(
        `SELECT g.*, c.title AS course_title, COALESCE(gs.role, CASE WHEN $1 THEN 'admin' END) AS my_role,
                (SELECT count(*)::int FROM cls_members m WHERE m.group_id=g.id AND m.status='active') AS members,
                (SELECT count(*)::int FROM cls_members m WHERE m.group_id=g.id AND m.status='pending') AS pending
           FROM cls_groups g JOIN cls_courses c ON c.id=g.course_id
           LEFT JOIN cls_group_staff gs ON gs.group_id=g.id AND gs.user_id=$2
          WHERE (g.archived = $3) AND ($1 OR gs.user_id IS NOT NULL) ORDER BY g.created_at DESC`,
        [res.locals.staffRole === "admin", userOf(req), req.query.archived === "1"],
      )
    ).rows,
  })));
  app.post(P + "/admin/groups", requireStaff, route(async (req) => {
    const b = z.object({ courseId: uuid.optional(), name: z.string().trim().min(1).max(120), audience: z.enum(["students", "teachers"]).default("students") }).parse(req.body);
    // O'qituvchilar guruhi darslarga bog'lanmaydi: ichki «O'qituvchilar» kursi ishlatiladi, oferta va intizom o'chiq.
    const teachers = b.audience === "teachers";
    const courseId = teachers ? await teachersCourse() : b.courseId || fail(400, "Kursni tanlang");
    if (!teachers) await needCourse(courseId, userOf(req));
    const g = (await pool.query(
      "INSERT INTO cls_groups(course_id,name,invite_code,teacher_id,audience,offer_required,discipline,leaderboard_mode) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
      [courseId, b.name, inviteCode(), userOf(req), b.audience, !teachers, !teachers, "top10"],
    )).rows[0];
    await pool.query("INSERT INTO cls_group_staff(group_id,user_id,role) VALUES($1,$2,'teacher') ON CONFLICT DO NOTHING", [g.id, userOf(req)]);
    return { group: g };
  }));
  app.patch(P + "/admin/groups/:id", requireStaff, route(async (req) => {
    const id = uuid.parse(req.params.id);
    await needGroup(id, userOf(req));
    const b = groupSettings.parse(req.body);
    const g = (await pool.query(
      `UPDATE cls_groups SET name=COALESCE($2,name),invite_active=COALESCE($3,invite_active),auto_approve=COALESCE($4,auto_approve),
              allow_peer_dm=COALESCE($5,allow_peer_dm),leaderboard_mode=COALESCE($6,leaderboard_mode),late_penalty=COALESCE($7,late_penalty),archived=COALESCE($8,archived),
              offer_required=COALESCE($9,offer_required), discipline=COALESCE($10,discipline)
        WHERE id=$1 RETURNING *`,
      [id, b.name ?? null, b.inviteActive ?? null, b.autoApprove ?? null, b.allowPeerDm ?? null, b.leaderboardMode ?? null, b.latePenalty ?? null, b.archived ?? null, b.offerRequired ?? null, b.discipline ?? null],
    )).rows[0];
    return g ? { group: g } : fail(404, "Guruh topilmadi");
  }));
  app.post(P + "/admin/groups/:id/invite", requireStaff, route(async (req) => {
    await needGroup(uuid.parse(req.params.id), userOf(req));
    const g = (await pool.query("UPDATE cls_groups SET invite_code=$2, invite_active=true WHERE id=$1 RETURNING *", [uuid.parse(req.params.id), inviteCode()])).rows[0];
    return g ? { group: g } : fail(404, "Guruh topilmadi");
  }));
  app.get(P + "/admin/groups/:id", requireStaff, route(async (req) => {
    const id = uuid.parse(req.params.id);
    const { group, role } = await needGroup(id, userOf(req), "view");
    const members = (
      await pool.query(
        `SELECT m.user_id,m.status,m.phone,m.display_name,m.joined_at,m.muted_until,u.full_name,u.username,
                (SELECT a.id FROM cls_agreements a WHERE a.group_id=m.group_id AND a.user_id=m.user_id ORDER BY a.accepted_at DESC LIMIT 1) AS agreement_id
           FROM cls_members m JOIN users u ON u.id=m.user_id WHERE m.group_id=$1 AND m.status<>'removed' ORDER BY m.status DESC, m.joined_at`,
        [id],
      )
    ).rows;
    const schedule = (
      await pool.query(
        `SELECT l.id AS lesson_id,l.position,l.title,l.kind,gl.opens_at,gl.due_at FROM cls_lessons l
           LEFT JOIN cls_group_lessons gl ON gl.lesson_id=l.id AND gl.group_id=$1 WHERE l.course_id=$2 ORDER BY l.position`,
        [id, group.course_id],
      )
    ).rows;
    const announcements = (await pool.query("SELECT * FROM cls_announcements WHERE group_id=$1 ORDER BY pinned DESC, created_at DESC LIMIT 50", [id])).rows;
    const staff = await groupStaff(id);
    const guides = (await pool.query("SELECT guide_id FROM cls_group_guides WHERE group_id=$1 ORDER BY created_at", [id])).rows.map((r) => r.guide_id);
    const pro = (await pool.query("SELECT user_id, guide_id FROM cls_group_pro WHERE group_id=$1", [id])).rows;
    return { group, members, schedule, announcements, staff, myRole: role, guides, pro };
  }));
  app.post(P + "/admin/groups/:id/members/:userId", requireStaff, route(async (req) => {
    await needGroup(uuid.parse(req.params.id), userOf(req));
    const b = z.object({ action: z.enum(["approve", "remove", "mute", "unmute"]), hours: z.number().int().min(1).max(720).optional() }).parse(req.body);
    const args = [uuid.parse(req.params.id), z.string().min(1).max(100).parse(req.params.userId)];
    const sql = {
      approve: "UPDATE cls_members SET status='active' WHERE group_id=$1 AND user_id=$2",
      remove: "UPDATE cls_members SET status='removed' WHERE group_id=$1 AND user_id=$2",
      mute: "UPDATE cls_members SET muted_until=now()+make_interval(hours=>$3) WHERE group_id=$1 AND user_id=$2",
      unmute: "UPDATE cls_members SET muted_until=NULL WHERE group_id=$1 AND user_id=$2",
    }[b.action];
    const r = await pool.query(sql, b.action === "mute" ? [...args, b.hours ?? 24] : args);
    if (!r.rowCount) fail(404, "A’zo topilmadi");
  }));
  /** Jadval: har bir dars uchun ochilish va muddat; yoki boshlanish sanasi + hafta kunlari bilan avtomatik. */
  app.put(P + "/admin/groups/:id/schedule", requireStaff, route(async (req) => {
    const id = uuid.parse(req.params.id);
    await needGroup(id, userOf(req));
    const b = z.union([
      z.object({ items: z.array(z.object({ lessonId: uuid, opensAt: z.string().datetime({ offset: true }).nullable(), dueAt: z.string().datetime({ offset: true }).nullable() })).max(500) }),
      z.object({
        auto: z.object({
          startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
          openTime: z.string().regex(/^\d{2}:\d{2}$/),
          dueHours: z.number().int().min(1).max(24 * 14),
        }),
      }),
    ]).parse(req.body);
    const g = (await pool.query("SELECT course_id FROM cls_groups WHERE id=$1", [id])).rows[0] || fail(404, "Guruh topilmadi");
    let items: { lessonId: string; opensAt: string | null; dueAt: string | null }[];
    if ("items" in b) items = b.items;
    else {
      const lessons = (await pool.query("SELECT id FROM cls_lessons WHERE course_id=$1 ORDER BY position", [g.course_id])).rows;
      items = [];
      const d = new Date(b.auto.startDate + "T" + b.auto.openTime + ":00+05:00");
      for (const l of lessons) {
        // Hafta kuni Toshkent vaqti bo'yicha: 1 = dushanba ... 7 = yakshanba.
        const weekday = () => ((new Date(d.getTime() + 5 * 3600e3).getUTCDay() + 6) % 7) + 1;
        while (!b.auto.weekdays.includes(weekday())) d.setTime(d.getTime() + 86400e3);
        items.push({ lessonId: l.id, opensAt: d.toISOString(), dueAt: new Date(d.getTime() + b.auto.dueHours * 3600e3).toISOString() });
        d.setTime(d.getTime() + 86400e3);
      }
    }
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      for (const it of items)
        await c.query(
          `INSERT INTO cls_group_lessons(group_id,lesson_id,opens_at,due_at) SELECT $1,$2,$3,$4 WHERE EXISTS(SELECT 1 FROM cls_lessons WHERE id=$2 AND course_id=$5)
           ON CONFLICT(group_id,lesson_id) DO UPDATE SET opens_at=EXCLUDED.opens_at,due_at=EXCLUDED.due_at,
             notified_at=CASE WHEN cls_group_lessons.opens_at IS DISTINCT FROM EXCLUDED.opens_at THEN NULL ELSE cls_group_lessons.notified_at END`,
          [id, it.lessonId, it.opensAt, it.dueAt, g.course_id],
        );
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
    return { items };
  }));
  app.post(P + "/admin/groups/:id/unlock", requireStaff, route(async (req) => {
    await needGroup(uuid.parse(req.params.id), userOf(req));
    const b = z.object({ userId: z.string().min(1).max(100), lessonId: uuid }).parse(req.body);
    await pool.query("INSERT INTO cls_unlocks(group_id,user_id,lesson_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [uuid.parse(req.params.id), b.userId, b.lessonId]);
  }));
  app.post(P + "/admin/groups/:id/announcements", requireStaff, route(async (req) => {
    await needGroup(uuid.parse(req.params.id), userOf(req));
    const b = z.object({ body: z.string().trim().min(1).max(4000), pinned: z.boolean().optional().default(false) }).parse(req.body);
    const a = (await pool.query("INSERT INTO cls_announcements(group_id,body,pinned) SELECT $1,$2,$3 WHERE EXISTS(SELECT 1 FROM cls_groups WHERE id=$1) RETURNING *", [uuid.parse(req.params.id), b.body, b.pinned])).rows[0];
    if (!a) fail(404, "Guruh topilmadi");
    await notifyGroup(a.group_id, { title: "Yangi e’lon", body: b.body.slice(0, 140), path: "" });
    return { announcement: a };
  }));
  app.delete(P + "/admin/announcements/:id", requireStaff, route(async (req) => {
    const a = (await pool.query("SELECT group_id FROM cls_announcements WHERE id=$1", [uuid.parse(req.params.id)])).rows[0] || fail(404, "E’lon topilmadi");
    await needGroup(a.group_id, userOf(req));
    await pool.query("DELETE FROM cls_announcements WHERE id=$1", [uuid.parse(req.params.id)]);
  }));
  app.get(P + "/admin/groups/:id/gradebook", requireStaff, route(async (req) => {
    const id = uuid.parse(req.params.id);
    const { group: g } = await needGroup(id, userOf(req), "view");
    const columns = (
      await pool.query(
        `SELECT l.id,l.position,l.title,l.kind,'quiz' AS type FROM cls_lessons l JOIN cls_quizzes q ON q.lesson_id=l.id WHERE l.course_id=$1
         UNION ALL SELECT t.id,l.position,t.title,'task','task' FROM cls_tasks t JOIN cls_lessons l ON l.id=t.lesson_id WHERE l.course_id=$1
         ORDER BY position`,
        [g.course_id],
      )
    ).rows;
    const cells = (
      await pool.query(
        `SELECT user_id, lesson_id AS id, max(effective_percent)::int AS value FROM cls_attempts WHERE group_id=$1 AND submitted_at IS NOT NULL GROUP BY user_id, lesson_id
         UNION ALL SELECT user_id, task_id, max(score)::int FROM cls_submissions WHERE group_id=$1 AND status='graded' GROUP BY user_id, task_id`,
        [id],
      )
    ).rows;
    return { columns, cells, ranking: await leaderboard(id) };
  }));

  /* ---------- Taklif havolasi ---------- */
  app.get(P + "/invite/:code", route(async (req) => {
    const code = z.string().min(6).max(40).parse(req.params.code);
    const g = (await pool.query(
      "SELECT g.id,g.name,g.invite_active,g.archived,g.offer_required,g.audience,c.title AS course_title,c.description FROM cls_groups g JOIN cls_courses c ON c.id=g.course_id WHERE g.invite_code=$1",
      [code],
    )).rows[0];
    if (!g || !g.invite_active || g.archived) fail(404, "Taklif havolasi eskirgan yoki noto‘g‘ri");
    let status: string | null = null;
    if (req.session.userId)
      status = (await pool.query("SELECT status FROM cls_members WHERE group_id=$1 AND user_id=$2", [g.id, req.session.userId])).rows[0]?.status || null;
    const offer = g.offer_required ? await currentOffer() : null;
    return {
      group: { id: g.id, name: g.name, courseTitle: g.course_title, description: g.description, audience: g.audience },
      status,
      offer: offer && { version: offer.version, body: offer.body, consents: OFFER_CONSENTS },
    };
  }));
  app.post(P + "/invite/:code/join", requireAuth, route(async (req) => {
    const code = z.string().min(6).max(40).parse(req.params.code);
    const b = z.object({
      phone: z.string().trim().transform((v) => v.replace(/[\s()-]/g, "")).pipe(z.string().regex(/^\+?\d{9,15}$/, "Telefon raqami noto‘g‘ri")),
      name: z.string().trim().min(2).max(80),
      agreement: z.unknown().optional(),
    }).parse(req.body);
    const g = (await pool.query("SELECT * FROM cls_groups WHERE invite_code=$1", [code])).rows[0];
    if (!g || !g.invite_active || g.archived) fail(404, "Taklif havolasi eskirgan yoki noto‘g‘ri");
    // Oferta: rozilik yozilmasa qo'shilib bo'lmaydi (guruh sozlamasida o'chirilmagan bo'lsa).
    const existing = (await pool.query("SELECT status FROM cls_members WHERE group_id=$1 AND user_id=$2", [g.id, userOf(req)])).rows[0];
    const agreement = existing && existing.status !== "removed" ? null : await recordAgreement(req, g, b.name, b.phone, b.agreement);
    const status = g.auto_approve || (await isPreapproved(g.id, b.phone)) ? "active" : "pending";
    const m = (await pool.query(
      `INSERT INTO cls_members(group_id,user_id,status,phone,display_name) VALUES($1,$2,$3,$4,$5)
       ON CONFLICT(group_id,user_id) DO UPDATE SET phone=EXCLUDED.phone, display_name=EXCLUDED.display_name,
         status=CASE WHEN cls_members.status='removed' THEN EXCLUDED.status ELSE cls_members.status END
       RETURNING status`,
      [g.id, userOf(req), status, b.phone, b.name],
    )).rows[0];
    const staffIds = (await groupStaff(g.id)).map((x) => x.user_id);
    if (staffIds.length)
      await notifyUsers(staffIds, g.id, {
        title: m.status === "pending" ? "Guruhga qo‘shilish so‘rovi" : "Guruhga yangi o‘quvchi qo‘shildi",
        body: `${b.name} — ${g.name}`,
        path: "",
        ref: `join-${g.id}-${userOf(req)}`,
      });
    return { groupId: g.id, status: m.status, agreementId: agreement?.id || null };
  }));

  /* ---------- O'quvchi ---------- */
  app.get(P + "/my", requireAuth, route(async (req) => {
    const uid = userOf(req);
    const role = await staffRole(uid);
    const groups = (
      await pool.query(
        role
          ? `SELECT g.id,g.name,c.title AS course_title,'active' AS status FROM cls_groups g JOIN cls_courses c ON c.id=g.course_id
              WHERE NOT g.archived AND ($2 OR EXISTS(SELECT 1 FROM cls_group_staff gs WHERE gs.group_id=g.id AND gs.user_id=$1)) ORDER BY g.created_at DESC`
          : `SELECT g.id,g.name,c.title AS course_title,m.status,g.audience FROM cls_members m JOIN cls_groups g ON g.id=m.group_id JOIN cls_courses c ON c.id=g.course_id
              WHERE m.user_id=$1 AND m.status IN ('active','pending') AND NOT g.archived ORDER BY m.joined_at DESC`,
        role ? [uid, role === "admin"] : [uid],
      )
    ).rows;
    return { teacher: !!role, role, groups };
  }));
  app.get(P + "/groups/:id/home", requireAuth, route(async (req) => {
    const id = uuid.parse(req.params.id), uid = userOf(req);
    const { group, teacher } = await membership(id, uid);
    const states = await lessonStates(id, uid, teacher);
    const now = Date.now();
    const todo = teacher
      ? []
      : states
          .filter((s) => s.unlocked && ((s.has_quiz && !s.passed && s.attempts < (s.max_attempts ?? 2)) || s.task_count > 0))
          .slice(0, 5)
          .map((s) => ({ lessonId: s.id, title: s.title, kind: s.kind, hasQuiz: s.has_quiz, dueAt: s.due_at, overdue: !!s.due_at && new Date(s.due_at).getTime() < now }));
    const nextLesson = states.find((s) => !s.unlocked && s.opens_at);
    const live = (
      await pool.query("SELECT id,title,starts_at,duration_minutes,status FROM cls_live_sessions WHERE group_id=$1 AND starts_at+make_interval(mins=>duration_minutes) > now() AND status<>'cancelled' ORDER BY starts_at LIMIT 1", [id])
    ).rows[0] || null;
    const announcements = (await pool.query("SELECT id,body,pinned,created_at FROM cls_announcements WHERE group_id=$1 ORDER BY pinned DESC, created_at DESC LIMIT 3", [id])).rows;
    const pendingReview = teacher
      ? (await pool.query("SELECT count(*)::int AS n FROM cls_submissions WHERE group_id=$1 AND status='submitted'", [id])).rows[0].n
      : 0;
    return {
      group: { id: group.id, name: group.name, allowPeerDm: group.allow_peer_dm, audience: group.audience },
      teacher,
      todo,
      live,
      nextLesson: nextLesson ? { id: nextLesson.id, title: nextLesson.title, opensAt: nextLesson.opens_at } : null,
      progress: { done: states.filter((s) => s.unlocked && s.passed).length, total: states.length },
      announcements,
      pendingReview,
      billing: teacher ? null : await (await import("./classroom-billing")).billingInfo(id, uid),
    };
  }));
  app.get(P + "/groups/:id/lessons", requireAuth, route(async (req) => {
    const id = uuid.parse(req.params.id), uid = userOf(req);
    const { teacher } = await membership(id, uid);
    return {
      teacher,
      lessons: (await lessonStates(id, uid, teacher)).map((s) => ({
        id: s.id, position: s.position, kind: s.kind, title: s.title, unlocked: s.unlocked, reason: s.reason, opensAt: s.opens_at, dueAt: s.due_at,
        hasQuiz: s.has_quiz, passPercent: s.pass_percent, best: s.best, passed: s.passed, attempts: s.attempts, maxAttempts: s.max_attempts, tasks: s.task_count,
      })),
    };
  }));
  app.get(P + "/groups/:id/lessons/:lessonId", requireAuth, route(async (req) => {
    const id = uuid.parse(req.params.id), lessonId = uuid.parse(req.params.lessonId), uid = userOf(req);
    const { teacher } = await membership(id, uid);
    const state = (await lessonStates(id, uid, teacher)).find((s) => s.id === lessonId) || fail(404, "Dars topilmadi");
    if (!state.unlocked) fail(403, state.reason === "previous" ? "Avval oldingi dars testidan o‘ting" : "Bu dars hali ochilmagan");
    const l = (await pool.query("SELECT id,title,kind,body,video_url,pass_percent FROM cls_lessons WHERE id=$1", [lessonId])).rows[0];
    const q = (await pool.query("SELECT jsonb_array_length(questions)::int AS n,time_limit_minutes,max_attempts FROM cls_quizzes WHERE lesson_id=$1", [lessonId])).rows[0];
    const tasks = (
      await pool.query(
        `SELECT t.id,t.kind,t.title,t.text_ar,t.max_seconds,t.max_score,t.proctor,t.pass_percent,t.shadow,t.prompt_ar,t.prompt_uz,t.text_uz,t.video,
                (SELECT row_to_json(s) FROM (SELECT id,status,score,ai_percent,final_percent,comment,created_at,auto,flagged FROM cls_submissions s WHERE s.task_id=t.id AND s.group_id=$2 AND s.user_id=$3 AND s.status IN ('graded','submitted') ORDER BY (s.status='graded') DESC, s.score DESC NULLS LAST, s.created_at DESC LIMIT 1) s) AS submission,
                (SELECT count(*)::int FROM cls_submissions s WHERE s.task_id=t.id AND s.group_id=$2 AND s.user_id=$3 AND s.status<>'rejected') AS attempts
           FROM cls_tasks t WHERE t.lesson_id=$1 ORDER BY t.created_at`,
        [lessonId, id, uid],
      )
    ).rows;
    return {
      parts: await (await import("./classroom-a1")).partsFor(lessonId, id, uid), // aylanma importdan qochish
      lesson: { ...l, dueAt: state.due_at },
      quiz: q ? { questions: q.n, timeLimitMinutes: q.time_limit_minutes, maxAttempts: q.max_attempts, attempts: state.attempts, best: state.best, passed: state.passed } : null,
      tasks,
    };
  }));
  app.post(P + "/groups/:id/lessons/:lessonId/attempts", requireAuth, route(async (req) => {
    const id = uuid.parse(req.params.id), lessonId = uuid.parse(req.params.lessonId), uid = userOf(req);
    const { teacher } = await membership(id, uid);
    const state = (await lessonStates(id, uid, teacher)).find((s) => s.id === lessonId) || fail(404, "Dars topilmadi");
    if (!state.unlocked) fail(403, "Bu dars hali ochilmagan");
    if (!teacher && !(await isTestUser(uid))) {
      const gate = await mainGate(id, lessonId, uid);
      if (!gate.ok) fail(403, gate.reason === "live" ? "Asosiy topshiriq jonli darsdan keyin ochiladi" : "Avval dars yozuvini ko‘ring (yoki tezkor topshiriqdan 85% oling)");
    }
    const quiz = (await pool.query("SELECT * FROM cls_quizzes WHERE lesson_id=$1", [lessonId])).rows[0] || fail(404, "Bu darsda test yo‘q");
    const open = (await pool.query("SELECT * FROM cls_attempts WHERE group_id=$1 AND lesson_id=$2 AND user_id=$3 AND submitted_at IS NULL ORDER BY started_at DESC LIMIT 1", [id, lessonId, uid])).rows[0];
    if (open) return { attemptId: open.id, questions: present(quiz.questions, open.layout), timeLimitMinutes: quiz.time_limit_minutes, startedAt: open.started_at };
    if (!teacher && state.attempts >= quiz.max_attempts && !(await isTestUser(uid))) fail(409, "Urinishlar soni tugadi");
    const layout = makeLayout(quiz.questions);
    const a = (await pool.query(
      "INSERT INTO cls_attempts(group_id,lesson_id,user_id,layout,max_score) VALUES($1,$2,$3,$4,$5) RETURNING id,started_at",
      [id, lessonId, uid, JSON.stringify(layout), layout.length],
    )).rows[0];
    return { attemptId: a.id, questions: present(quiz.questions, layout), timeLimitMinutes: quiz.time_limit_minutes, startedAt: a.started_at };
  }));
  app.post(P + "/attempts/:id/submit", requireAuth, route(async (req) => {
    const id = uuid.parse(req.params.id), uid = userOf(req);
    const answers = answersSchema.parse(req.body).answers;
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const a = (await c.query("SELECT a.*, g.late_penalty, gl.due_at FROM cls_attempts a JOIN cls_groups g ON g.id=a.group_id LEFT JOIN cls_group_lessons gl ON gl.group_id=a.group_id AND gl.lesson_id=a.lesson_id WHERE a.id=$1 AND a.user_id=$2 FOR UPDATE OF a", [id, uid])).rows[0] || fail(404, "Urinish topilmadi");
      if (a.submitted_at) fail(409, "Bu urinish allaqachon yuborilgan");
      const quiz = (await c.query("SELECT questions FROM cls_quizzes WHERE lesson_id=$1", [a.lesson_id])).rows[0] || fail(404, "Test topilmadi");
      const g = grade(quiz.questions, a.layout, a.layout.map((_: unknown, i: number) => answers[i] ?? null));
      const percent = Math.round((g.score / Math.max(1, g.max)) * 100);
      const late = !!a.due_at && new Date(a.due_at).getTime() < Date.now();
      const effective = late ? Math.round(percent * (1 - a.late_penalty / 100)) : percent;
      await c.query("UPDATE cls_attempts SET answers=$2,score=$3,percent=$4,effective_percent=$5,late=$6,submitted_at=now() WHERE id=$1", [id, JSON.stringify(answers), g.score, percent, effective, late]);
      const pass = (await c.query("SELECT pass_percent FROM cls_lessons WHERE id=$1", [a.lesson_id])).rows[0].pass_percent;
      await c.query("COMMIT");
      // To'g'ri javoblar faqat muddat tugagach yoki test o'tilgandan keyin ko'rsatiladi (ko'chirishga qarshi).
      const reveal = effective >= pass || !a.due_at || new Date(a.due_at).getTime() < Date.now();
      return { score: g.score, max: g.max, percent, effectivePercent: effective, late, passed: effective >= pass, passPercent: pass, review: reveal ? g.review : null };
    } catch (e) {
      await c.query("ROLLBACK").catch(() => undefined);
      throw e;
    } finally {
      c.release();
    }
  }));
  app.get(P + "/groups/:id/results", requireAuth, route(async (req) => {
    const id = uuid.parse(req.params.id), uid = userOf(req);
    const { group, teacher } = await membership(id, uid);
    const board = await leaderboard(id);
    const me = board.find((r: any) => r.user_id === uid) || null;
    const visible = teacher || group.leaderboard_mode === "all" ? board : board.slice(0, 10);
    const lessons = (await lessonStates(id, uid, teacher)).filter((s) => s.has_quiz).map((s) => ({ id: s.id, title: s.title, kind: s.kind, best: s.best, passed: s.passed, attempts: s.attempts }));
    const tasks = (
      await pool.query(
        `SELECT DISTINCT ON (s.task_id) t.title, s.score, t.max_score, s.status, s.comment, s.ai_percent, s.created_at FROM cls_submissions s JOIN cls_tasks t ON t.id=s.task_id
          WHERE s.group_id=$1 AND s.user_id=$2 AND s.status IN ('graded','submitted')
          ORDER BY s.task_id, (s.status='graded') DESC, s.score DESC NULLS LAST, s.created_at DESC LIMIT 50`,
        [id, uid],
      )
    ).rows;
    return {
      me,
      total: board.length,
      leaderboard: visible.map((r: any) => ({ rank: r.rank, name: r.name, points: r.points, me: r.user_id === uid })),
      lessons,
      tasks,
    };
  }));
}

/* ------------------------------------------------------------------ */
/* Bildirishnomalar: keyingi bosqichda push qo'shiladi; hozir Telegram  */
/* ------------------------------------------------------------------ */
export type ClassNotice = { title: string; body: string; path: string; ref?: string; urgent?: boolean; tag?: string };
let notifier: (userIds: string[], groupId: string, notice: ClassNotice) => Promise<void> = async () => undefined;
export function setClassNotifier(fn: typeof notifier) {
  notifier = fn;
}
export async function notifyGroup(groupId: string, notice: ClassNotice, exceptUserId?: string) {
  try {
    const ids = (await pool.query("SELECT user_id FROM cls_members WHERE group_id=$1 AND status='active'", [groupId])).rows
      .map((r: any) => r.user_id)
      .filter((u: string) => u !== exceptUserId);
    if (ids.length) await notifier(ids, groupId, notice);
  } catch {
    console.error("Class notification failed");
  }
}
export async function notifyUsers(userIds: string[], groupId: string, notice: ClassNotice) {
  try {
    if (userIds.length) await notifier(userIds, groupId, notice);
  } catch {
    console.error("Class notification failed");
  }
}
