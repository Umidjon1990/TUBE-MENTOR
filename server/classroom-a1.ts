// A1 kursi (kitob asosidagi darslar): asosiy topshiriqning qo'shimcha qismlari, so'z boyligi, ovoz va import.
// • Qism (cls_parts): kind "quiz" — mustahkamlash yoki tarjima testi (savollar data.questions da);
//   kind "vocab" — so'zlar (data.words). O'quvchi avval so'zlarni yodlaydi, keyin so'z imtihoni ochiladi.
// • Har urinishda savollar to'liq nusxasi (va tartibi) urinishning o'zida saqlanadi: to'g'ri javob o'quvchiga
//   yuborilmaydi, tekshiruv faqat serverda.
// • Ovoz: so'zlar, namunaviy gaplar va og'zaki matn gaplari ElevenLabs'dagi klon ovozda BIR MARTA yaratiladi va
//   omborda saqlanadi (cls_tts). Kalit sozlanmagan bo'lsa 503 — sayt brauzer ovoziga o'tadi.
// • Sinov hisobi (users.is_test) o'z natijalarini tozalab, darsni boshidan sinab ko'ra oladi.
// • Import: kurs darsini tayyor kontent bilan yaratadi yoki yangilaydi (source_key bo'yicha). Kitob matni bu ochiq
//   repoda saqlanmaydi — uni sayt serveri yopiq repodan yuboradi.
import type { Express, Request } from "express";
import { createHash, randomInt } from "node:crypto";
import { z } from "zod";
import { pool } from "./db";
import { requireAuth } from "./auth";
import { classStore } from "./class-storage";
import { ClassError, answersSchema, grade, isTestUser, lessonStates, makeLayout, membership, needCourse, present, questionSchema, requireStaff, route, uuid } from "./classroom";
import { mainGate } from "./classroom-flow";

const P = "/api/platform/class";
const userOf = (req: Request) => String(req.session.userId);
const fail = (status: number, message: string): never => {
  throw new ClassError(status, message);
};

export const wordSchema = z.object({
  ar: z.string().trim().min(1).max(200),
  plural: z.string().trim().max(200).optional().default(""),
  uz: z.string().trim().min(1).max(200),
  exAr: z.string().trim().max(500).optional().default(""),
  exUz: z.string().trim().max(500).optional().default(""),
});
const partSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("quiz"),
    title: z.string().trim().min(1).max(200),
    passPercent: z.number().int().min(0).max(100).default(80),
    maxAttempts: z.number().int().min(1).max(20).default(3),
    questions: z.array(questionSchema).min(1).max(100),
  }),
  z.object({
    kind: z.literal("vocab"),
    title: z.string().trim().min(1).max(200),
    passPercent: z.number().int().min(0).max(100).default(80),
    maxAttempts: z.number().int().min(1).max(20).default(3),
    words: z.array(wordSchema).min(4).max(80),
  }),
]);

/* ---------------- So'z imtihoni savollari ---------------- */
function pick<T>(list: T[], n: number, not: T) {
  const pool = list.filter((x) => x !== not);
  const out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(randomInt(pool.length), 1)[0]);
  return out;
}
/** Har so'zga bitta savol: arabcha → ma'no, ma'no → arabcha yoki birlik → ko'plik (navbatma-navbat, tasodifiy). */
export function vocabQuestions(words: z.infer<typeof wordSchema>[]) {
  const uz = [...new Set(words.map((w) => w.uz))];
  const ar = [...new Set(words.map((w) => w.ar))];
  const plurals = [...new Set(words.map((w) => w.plural).filter(Boolean))];
  return words.map((w, i) => {
    const kinds = ["ar-uz", "uz-ar", ...(w.plural && plurals.length >= 4 ? ["plural"] : [])];
    const kind = kinds[(i + randomInt(kinds.length)) % kinds.length];
    if (kind === "uz-ar") {
      const options = [w.ar, ...pick(ar, 3, w.ar)];
      return { q: `«${w.uz}» arabchada qanday?`, options, correct: 0, explanation: w.exAr ? `${w.exAr} — ${w.exUz}` : "", topic: "so‘z" };
    }
    if (kind === "plural") {
      const options = [w.plural, ...pick(plurals, 3, w.plural)];
      return { q: `«${w.ar}» so‘zining ko‘pligi qaysi?`, options, correct: 0, explanation: `${w.ar} — ${w.plural}`, topic: "so‘z" };
    }
    const options = [w.uz, ...pick(uz, 3, w.uz)];
    return { q: `«${w.ar}» so‘zining ma’nosi?`, options, correct: 0, explanation: w.exAr ? `${w.exAr} — ${w.exUz}` : "", topic: "so‘z" };
  });
}

/* ---------------- O'quvchi: dars qismlari ---------------- */
export async function partsFor(lessonId: string, groupId: string, userId: string) {
  const rows = (
    await pool.query(
      `SELECT p.id,p.kind,p.title,p.pass_percent,p.max_attempts,
              CASE WHEN p.kind='vocab' THEN jsonb_array_length(p.data->'words') ELSE jsonb_array_length(p.data->'questions') END AS count,
              (SELECT max(a.percent) FROM cls_part_attempts a WHERE a.part_id=p.id AND a.group_id=$2 AND a.user_id=$3 AND a.submitted_at IS NOT NULL)::int AS best,
              (SELECT count(*) FROM cls_part_attempts a WHERE a.part_id=p.id AND a.group_id=$2 AND a.user_id=$3 AND a.submitted_at IS NOT NULL)::int AS attempts,
              EXISTS(SELECT 1 FROM cls_vocab_progress v WHERE v.part_id=p.id AND v.group_id=$2 AND v.user_id=$3) AS learned
         FROM cls_parts p WHERE p.lesson_id=$1 ORDER BY p.position, p.created_at`,
      [lessonId, groupId, userId],
    )
  ).rows;
  return rows.map((r: any) => ({
    id: r.id, kind: r.kind, title: r.title, passPercent: r.pass_percent, maxAttempts: r.max_attempts, count: r.count,
    best: r.best, attempts: r.attempts, passed: r.best !== null && r.best >= r.pass_percent, learned: r.learned,
  }));
}

async function partContext(groupId: string, partId: string, userId: string) {
  const { teacher } = await membership(groupId, userId);
  const part = (await pool.query("SELECT * FROM cls_parts WHERE id=$1", [partId])).rows[0] || fail(404, "Topshiriq topilmadi");
  const state = (await lessonStates(groupId, userId, teacher)).find((s) => s.id === part.lesson_id) || fail(404, "Topshiriq bu guruhga tegishli emas");
  if (!state.unlocked) fail(403, "Bu dars hali ochilmagan");
  const test = !teacher && (await isTestUser(userId));
  return { part, teacher, test, state };
}

/* ---------------- Ovoz (klon) ---------------- */
async function ttsUrl(text: string) {
  const key = process.env.ELEVENLABS_API_KEY, voice = process.env.ELEVENLABS_VOICE_ID;
  const model = process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2";
  const hash = createHash("sha256").update(`${voice}|${model}|${text}`).digest("hex").slice(0, 40);
  const cached = (await pool.query("SELECT hash FROM cls_tts WHERE hash=$1", [hash])).rows[0];
  if (cached) return `${P}/tts-file/${hash}`;
  if (!key || !voice) fail(503, "Ovoz xizmati sozlanmagan");
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice!)}?output_format=mp3_44100_64`, {
    method: "POST",
    headers: { "xi-api-key": key!, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: model, voice_settings: { stability: 0.6, similarity_boost: 0.85 } }),
  }).catch(() => null);
  if (!r?.ok) fail(502, "Ovoz tayyorlanmadi, birozdan keyin urinib ko‘ring");
  const data = Buffer.from(await r!.arrayBuffer());
  const storageKey = `class/tts/${hash}.mp3`;
  await classStore().put(storageKey, data, "audio/mpeg");
  await pool.query("INSERT INTO cls_tts(hash,storage_key) VALUES($1,$2) ON CONFLICT DO NOTHING", [hash, storageKey]);
  return `${P}/tts-file/${hash}`;
}
/** Og'zaki matnni gaplarga bo'lish (shadowing uchun). Sayt ham xuddi shu qoidadan foydalanadi. */
export function splitSentences(text: string) {
  return text.split(/(?<=[.!?؟])\s+/).map((x) => x.trim()).filter(Boolean);
}

/* ---------------- Import ---------------- */
const importSchema = z.object({
  key: z.string().trim().min(1).max(60),
  position: z.number().int().min(1).max(500),
  title: z.string().trim().min(1).max(200),
  kind: z.enum(["lesson", "midterm", "final"]).default("lesson"),
  body: z.string().max(50000).default(""),
  passPercent: z.number().int().min(0).max(100).default(80),
  quiz: z.object({ questions: z.array(questionSchema).min(1).max(100), maxAttempts: z.number().int().min(1).max(20).default(3), timeLimitMinutes: z.number().int().min(1).max(240).nullable().default(null) }).nullable().default(null),
  quick: z.object({ questions: z.array(questionSchema).min(1).max(100) }).nullable().default(null),
  parts: z.array(partSchema).max(10).default([]),
  tasks: z.array(z.object({
    title: z.string().trim().min(1).max(200),
    textAr: z.string().trim().min(1).max(5000),
    maxSeconds: z.number().int().min(10).max(300).default(120),
    maxScore: z.number().int().min(1).max(100).default(10),
    proctor: z.enum(["off", "warn", "required"]).default("required"),
    passPercent: z.number().int().min(10).max(100).default(80),
    shadow: z.boolean().default(true),
  })).max(10).default([]),
});

export function registerClassroomA1(app: Express) {
  // Qism: so'zlar ro'yxati (yodlash uchun — o'quv materiali, maxfiy emas).
  app.get(P + "/groups/:id/parts/:partId/words", requireAuth, route(async (req) => {
    const { part } = await partContext(uuid.parse(req.params.id), uuid.parse(req.params.partId), userOf(req));
    if (part.kind !== "vocab") fail(400, "Bu so‘z topshirig‘i emas");
    return { title: part.title, words: part.data.words };
  }));
  // So'zlar yodlandi: imtihon ochiladi.
  app.post(P + "/groups/:id/parts/:partId/learned", requireAuth, route(async (req) => {
    const groupId = uuid.parse(req.params.id), uid = userOf(req);
    const { part } = await partContext(groupId, uuid.parse(req.params.partId), uid);
    if (part.kind !== "vocab") fail(400, "Bu so‘z topshirig‘i emas");
    await pool.query("INSERT INTO cls_vocab_progress(part_id,group_id,user_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [part.id, groupId, uid]);
    return { learned: true };
  }));
  // Urinishni boshlash.
  app.post(P + "/groups/:id/parts/:partId/attempts", requireAuth, route(async (req) => {
    const groupId = uuid.parse(req.params.id), uid = userOf(req);
    const { part, teacher, test } = await partContext(groupId, uuid.parse(req.params.partId), uid);
    if (part.kind === "quiz" && !teacher && !test) {
      const gate = await mainGate(groupId, part.lesson_id, uid);
      if (!gate.ok) fail(403, "Avval dars yozuvini ko‘ring (yoki tezkor topshiriqdan 85% oling)");
    }
    if (part.kind === "vocab" && !teacher && !test) {
      const learned = (await pool.query("SELECT 1 FROM cls_vocab_progress WHERE part_id=$1 AND group_id=$2 AND user_id=$3", [part.id, groupId, uid])).rowCount;
      if (!learned) fail(403, "Avval so‘zlarni yodlash bo‘limidan o‘ting");
    }
    const open = (await pool.query("SELECT * FROM cls_part_attempts WHERE part_id=$1 AND group_id=$2 AND user_id=$3 AND submitted_at IS NULL ORDER BY started_at DESC LIMIT 1", [part.id, groupId, uid])).rows[0];
    if (open) return { attemptId: open.id, title: part.title, kind: part.kind, questions: present(open.layout.q, open.layout.l) };
    const used = (await pool.query("SELECT count(*)::int AS n FROM cls_part_attempts WHERE part_id=$1 AND group_id=$2 AND user_id=$3 AND submitted_at IS NOT NULL", [part.id, groupId, uid])).rows[0].n;
    if (!teacher && !test && used >= part.max_attempts) fail(409, "Urinishlar soni tugadi. O‘qituvchingizga yozing");
    const questions = part.kind === "vocab" ? vocabQuestions(part.data.words) : part.data.questions;
    const layout = makeLayout(questions);
    const a = (await pool.query(
      "INSERT INTO cls_part_attempts(part_id,group_id,user_id,layout,max_score) VALUES($1,$2,$3,$4,$5) RETURNING id",
      [part.id, groupId, uid, JSON.stringify({ q: questions, l: layout }), layout.length],
    )).rows[0];
    return { attemptId: a.id, title: part.title, kind: part.kind, questions: present(questions, layout) };
  }));
  app.post(P + "/part-attempts/:id/submit", requireAuth, route(async (req) => {
    const id = uuid.parse(req.params.id), uid = userOf(req);
    const answers = answersSchema.parse(req.body).answers;
    const a = (await pool.query("SELECT a.*, p.pass_percent FROM cls_part_attempts a JOIN cls_parts p ON p.id=a.part_id WHERE a.id=$1 AND a.user_id=$2", [id, uid])).rows[0] || fail(404, "Urinish topilmadi");
    if (a.submitted_at) fail(409, "Bu urinish allaqachon yuborilgan");
    const g = grade(a.layout.q, a.layout.l, a.layout.l.map((_: unknown, i: number) => answers[i] ?? null));
    const percent = Math.round((g.score / Math.max(1, g.max)) * 100);
    const r = await pool.query("UPDATE cls_part_attempts SET answers=$2,score=$3,percent=$4,submitted_at=now() WHERE id=$1 AND submitted_at IS NULL", [id, JSON.stringify(answers), g.score, percent]);
    if (!r.rowCount) fail(409, "Bu urinish allaqachon yuborilgan");
    return { score: g.score, max: g.max, percent, passed: percent >= a.pass_percent, passPercent: a.pass_percent, review: g.review };
  }));

  // Ovoz: faqat bazadagi matnlar uchun (ixtiyoriy matn qabul qilinmaydi).
  app.post(P + "/groups/:id/tts", requireAuth, route(async (req) => {
    const groupId = uuid.parse(req.params.id), uid = userOf(req);
    const b = z.object({ source: z.enum(["word", "example", "task"]), id: uuid, index: z.number().int().min(0).max(200) }).parse(req.body);
    let text = "";
    if (b.source === "task") {
      const t = (await pool.query("SELECT lesson_id,text_ar FROM cls_tasks WHERE id=$1", [b.id])).rows[0] || fail(404, "Matn topilmadi");
      const { teacher } = await membership(groupId, uid);
      const state = (await lessonStates(groupId, uid, teacher)).find((s) => s.id === t.lesson_id) || fail(404, "Matn topilmadi");
      if (!state.unlocked) fail(403, "Bu dars hali ochilmagan");
      text = splitSentences(t.text_ar)[b.index] || fail(404, "Gap topilmadi");
    } else {
      const { part } = await partContext(groupId, b.id, uid);
      const w = part.kind === "vocab" ? part.data.words[b.index] : null;
      text = (b.source === "word" ? w?.ar : w?.exAr) || fail(404, "So‘z topilmadi");
    }
    return { url: await ttsUrl(text) };
  }));
  app.get(P + "/tts-file/:hash", requireAuth, async (req, res, next) => {
    try {
      const hash = z.string().regex(/^[a-f0-9]{40}$/).parse(req.params.hash);
      const row = (await pool.query("SELECT storage_key FROM cls_tts WHERE hash=$1", [hash])).rows[0];
      const file = row ? await classStore().get(row.storage_key) : null;
      if (!file) return res.status(404).json({ message: "Topilmadi" });
      res.set({ "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=604800", "Content-Length": String(file.data.length) });
      res.end(file.data);
    } catch (e) {
      next(e);
    }
  });

  // Sinov hisobi: shu guruhdagi barcha natijalarini tozalash (darsni boshidan sinash uchun).
  app.post(P + "/groups/:id/test-reset", requireAuth, route(async (req) => {
    const groupId = uuid.parse(req.params.id), uid = userOf(req);
    if (!(await isTestUser(uid))) fail(403, "Faqat sinov hisobi uchun");
    await membership(groupId, uid);
    for (const sql of [
      "DELETE FROM cls_attempts WHERE group_id=$1 AND user_id=$2",
      "DELETE FROM cls_quick_attempts WHERE group_id=$1 AND user_id=$2",
      "DELETE FROM cls_part_attempts WHERE group_id=$1 AND user_id=$2",
      "DELETE FROM cls_vocab_progress WHERE group_id=$1 AND user_id=$2",
      "DELETE FROM cls_submissions WHERE group_id=$1 AND user_id=$2",
      "DELETE FROM cls_penalties WHERE group_id=$1 AND user_id=$2",
      "DELETE FROM cls_watch WHERE user_id=$2 AND session_id IN (SELECT id FROM cls_live_sessions WHERE group_id=$1)",
    ]) await pool.query(sql, [groupId, uid]);
    return { reset: true };
  }));

  // Import: kurs darsini tayyor kontent bilan yaratish yoki yangilash.
  app.post(P + "/admin/courses/:id/import-lesson", requireStaff, route(async (req) => {
    const courseId = uuid.parse(req.params.id), uid = userOf(req);
    await needCourse(courseId, uid);
    const b = importSchema.parse(req.body);
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const old = (await c.query("SELECT id FROM cls_lessons WHERE course_id=$1 AND source_key=$2", [courseId, b.key])).rows[0];
      let lessonId: string;
      if (old) {
        lessonId = old.id;
        await c.query("UPDATE cls_lessons SET title=$2,kind=$3,body=$4,pass_percent=$5,position=$6 WHERE id=$1", [lessonId, b.title, b.kind, b.body, b.passPercent, b.position]);
      } else {
        lessonId = (await c.query(
          "INSERT INTO cls_lessons(course_id,position,kind,title,body,pass_percent,source_key) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
          [courseId, b.position, b.kind, b.title, b.body, b.passPercent, b.key],
        )).rows[0].id;
      }
      if (b.quiz) {
        await c.query(
          `INSERT INTO cls_quizzes(lesson_id,questions,time_limit_minutes,max_attempts) VALUES($1,$2,$3,$4)
           ON CONFLICT(lesson_id) DO UPDATE SET questions=EXCLUDED.questions,time_limit_minutes=EXCLUDED.time_limit_minutes,max_attempts=EXCLUDED.max_attempts,updated_at=now()`,
          [lessonId, JSON.stringify(b.quiz.questions), b.quiz.timeLimitMinutes, b.quiz.maxAttempts],
        );
      }
      if (b.quick) {
        await c.query(
          `INSERT INTO cls_quick_quizzes(lesson_id,questions) VALUES($1,$2) ON CONFLICT(lesson_id) DO UPDATE SET questions=EXCLUDED.questions, updated_at=now()`,
          [lessonId, JSON.stringify(b.quick.questions)],
        );
      }
      // Qismlar va og'zaki vazifalar sarlavha bo'yicha yangilanadi (bor natijalar saqlanib qoladi).
      const keepParts: string[] = [];
      for (const [i, p] of b.parts.entries()) {
        const data = p.kind === "vocab" ? { words: p.words } : { questions: p.questions };
        const ex = (await c.query("SELECT id FROM cls_parts WHERE lesson_id=$1 AND title=$2", [lessonId, p.title])).rows[0];
        const id = ex
          ? (await c.query("UPDATE cls_parts SET kind=$2,position=$3,data=$4,pass_percent=$5,max_attempts=$6 WHERE id=$1 RETURNING id", [ex.id, p.kind, i, JSON.stringify(data), p.passPercent, p.maxAttempts])).rows[0].id
          : (await c.query("INSERT INTO cls_parts(lesson_id,kind,position,title,data,pass_percent,max_attempts) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id", [lessonId, p.kind, i, p.title, JSON.stringify(data), p.passPercent, p.maxAttempts])).rows[0].id;
        keepParts.push(id);
      }
      await c.query("DELETE FROM cls_parts WHERE lesson_id=$1 AND NOT (id = ANY($2::uuid[]))", [lessonId, keepParts]);
      for (const t of b.tasks) {
        const ex = (await c.query("SELECT id FROM cls_tasks WHERE lesson_id=$1 AND title=$2", [lessonId, t.title])).rows[0];
        if (ex) await c.query("UPDATE cls_tasks SET text_ar=$2,max_seconds=$3,max_score=$4,proctor=$5,pass_percent=$6,shadow=$7 WHERE id=$1", [ex.id, t.textAr, t.maxSeconds, t.maxScore, t.proctor, t.passPercent, t.shadow]);
        else await c.query("INSERT INTO cls_tasks(lesson_id,kind,title,text_ar,max_seconds,max_score,proctor,pass_percent,shadow) VALUES($1,'recitation',$2,$3,$4,$5,$6,$7,$8)", [lessonId, t.title, t.textAr, t.maxSeconds, t.maxScore, t.proctor, t.passPercent, t.shadow]);
      }
      await c.query("COMMIT");
      return { lessonId, created: !old };
    } catch (e) {
      await c.query("ROLLBACK").catch(() => undefined);
      throw e;
    } finally {
      c.release();
    }
  }));
}
