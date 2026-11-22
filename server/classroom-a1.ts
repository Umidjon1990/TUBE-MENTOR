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
import { createHash, randomBytes, randomInt } from "node:crypto";
import { z } from "zod";
import { pool } from "./db";
import { hashPassword, requireAuth } from "./auth";
import { platformKeyMatches } from "./platform-bridge";
import { classStore } from "./class-storage";
import { ClassError, answersSchema, grade, inviteCode, isTestUser, lessonStates, makeLayout, membership, needCourse, present, questionSchema, requireStaff, route, uuid } from "./classroom";
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
  /** Arabcha ta'rif (التعريف). */
  def: z.string().trim().max(500).optional().default(""),
  /** Rasm: bazadagi xesh (import paytida imageData'dan yaratiladi). */
  img: z.string().regex(/^[a-f0-9]{40}$/).optional(),
  imageData: z.string().max(400_000).optional(),
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
    const kinds = ["ar-uz", "uz-ar", ...(w.plural && plurals.length >= 4 ? ["plural"] : []), ...(w.def ? ["def", "def"] : [])];
    const kind = kinds[(i + randomInt(kinds.length)) % kinds.length];
    if (kind === "uz-ar") {
      const options = [w.ar, ...pick(ar, 3, w.ar)];
      return { q: `«${w.uz}» arabchada qanday?`, options, correct: 0, explanation: w.exAr ? `${w.exAr}${w.exUz ? " — " + w.exUz : ""}` : "", topic: "so‘z" };
    }
    if (kind === "def") {
      const options = [w.ar, ...pick(ar, 3, w.ar)];
      return { q: `Ta’rifga mos so‘zni toping: «${w.def}»`, options, correct: 0, explanation: `${w.ar} — ${w.uz}`, topic: "so‘z" };
    }
    if (kind === "plural") {
      const options = [w.plural, ...pick(plurals, 3, w.plural)];
      return { q: `«${w.ar}» so‘zining ko‘pligi qaysi?`, options, correct: 0, explanation: `${w.ar} — ${w.plural}`, topic: "so‘z" };
    }
    const options = [w.uz, ...pick(uz, 3, w.uz)];
    return { q: `«${w.ar}» so‘zining ma’nosi?`, options, correct: 0, explanation: w.exAr ? `${w.exAr}${w.exUz ? " — " + w.exUz : ""}` : "", topic: "so‘z" };
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
  // Sinfxona ovozlari uchun barqaror model: ifodali modellar (v3/v4) qisqa so'zlarga nafas, kulgi kabi ortiqcha
  // tovushlar qo'shishi mumkin. Model nomi xeshga kiradi — model almashsa, ovozlar qayta yaratiladi.
  const model = process.env.CLASS_TTS_MODEL || "eleven_multilingual_v2";
  const hash = createHash("sha256").update(`${voice}|${model}|${text}`).digest("hex").slice(0, 40);
  const cached = (await pool.query("SELECT hash FROM cls_tts WHERE hash=$1", [hash])).rows[0];
  if (cached) return `${P}/tts-file/${hash}`;
  if (!key || !voice) fail(503, "Ovoz xizmati sozlanmagan");
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice!)}?output_format=mp3_44100_64`, {
    method: "POST",
    headers: { "xi-api-key": key!, "content-type": "application/json", accept: "audio/mpeg" },
    // Barqaror, toza ovoz: yuqori o'xshashlik, fon tovushlarisiz (style 0, speaker boost).
    body: JSON.stringify({ text, model_id: model, voice_settings: { stability: 0.7, similarity_boost: 0.9, style: 0, use_speaker_boost: true } }),
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
  version: z.number().int().min(1).max(10000).default(1),
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
    /** Savol-javob: o'quvchiga beriladigan savol; textAr — yodlanadigan javob. */
    promptAr: z.string().trim().max(1000).optional().default(""),
    maxSeconds: z.number().int().min(10).max(300).default(120),
    maxScore: z.number().int().min(1).max(100).default(10),
    proctor: z.enum(["off", "warn", "required"]).default("required"),
    passPercent: z.number().int().min(10).max(100).default(80),
    shadow: z.boolean().default(true),
  })).max(10).default([]),
});

type ImportLesson = z.infer<typeof importSchema>;
/** So'z rasmlarini omborga yozadi (bir xil rasm bir marta) va so'zga xeshini qo'yadi. Tranzaksiyadan oldin chaqiriladi. */
async function storeWordImages(b: ImportLesson) {
  for (const p of b.parts)
    if (p.kind === "vocab")
      for (const w of p.words) {
        if (!w.imageData) continue;
        const data = Buffer.from(w.imageData, "base64");
        const type = data[0] === 0xff && data[1] === 0xd8 ? "image/jpeg" : data[0] === 0x89 && data[1] === 0x50 ? "image/png" : data[0] === 0x52 && data[8] === 0x57 ? "image/webp" : null;
        if (!type || data.length > 300_000) fail(400, "So‘z rasmi noto‘g‘ri");
        const hash = createHash("sha256").update(data).digest("hex").slice(0, 40);
        if (!(await pool.query("SELECT 1 FROM cls_media WHERE hash=$1", [hash])).rowCount) {
          const key = `class/media/${hash}.${type!.split("/")[1]}`;
          await classStore().put(key, data, type!);
          await pool.query("INSERT INTO cls_media(hash,storage_key,content_type) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [hash, key, type]);
        }
        w.img = hash;
        delete w.imageData;
      }
}
type Db = { query: (sql: string, params?: unknown[]) => Promise<any> };
/** Darsni tayyor kontent bilan yaratadi yoki yangilaydi (source_key bo'yicha); tranzaksiya ichida chaqiriladi. */
async function importLesson(c: Db, courseId: string, b: ImportLesson) {
      const old = (await c.query("SELECT id FROM cls_lessons WHERE course_id=$1 AND source_key=$2", [courseId, b.key])).rows[0];
  let lessonId: string;
  if (old) {
    lessonId = old.id;
    await c.query("UPDATE cls_lessons SET title=$2,kind=$3,body=$4,pass_percent=$5,position=$6,source_version=$7 WHERE id=$1", [lessonId, b.title, b.kind, b.body, b.passPercent, b.position, b.version]);
  } else {
    lessonId = (await c.query(
      "INSERT INTO cls_lessons(course_id,position,kind,title,body,pass_percent,source_key,source_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
      [courseId, b.position, b.kind, b.title, b.body, b.passPercent, b.key, b.version],
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
    const data = p.kind === "vocab" ? { words: p.words.map(({ imageData: _drop, ...w }) => w) } : { questions: p.questions };
    const ex = (await c.query("SELECT id FROM cls_parts WHERE lesson_id=$1 AND title=$2", [lessonId, p.title])).rows[0];
    const id = ex
      ? (await c.query("UPDATE cls_parts SET kind=$2,position=$3,data=$4,pass_percent=$5,max_attempts=$6 WHERE id=$1 RETURNING id", [ex.id, p.kind, i, JSON.stringify(data), p.passPercent, p.maxAttempts])).rows[0].id
      : (await c.query("INSERT INTO cls_parts(lesson_id,kind,position,title,data,pass_percent,max_attempts) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id", [lessonId, p.kind, i, p.title, JSON.stringify(data), p.passPercent, p.maxAttempts])).rows[0].id;
    keepParts.push(id);
  }
  await c.query("DELETE FROM cls_parts WHERE lesson_id=$1 AND NOT (id = ANY($2::uuid[]))", [lessonId, keepParts]);
  // Og'zaki vazifalar sarlavha bo'yicha yangilanadi; kontentda yo'q bo'lganlari o'chiriladi.
  const keepTasks: string[] = [];
  for (const t of b.tasks) {
    const ex = (await c.query("SELECT id FROM cls_tasks WHERE lesson_id=$1 AND title=$2", [lessonId, t.title])).rows[0];
    if (ex) {
      await c.query("UPDATE cls_tasks SET text_ar=$2,max_seconds=$3,max_score=$4,proctor=$5,pass_percent=$6,shadow=$7,prompt_ar=$8 WHERE id=$1", [ex.id, t.textAr, t.maxSeconds, t.maxScore, t.proctor, t.passPercent, t.shadow, t.promptAr || null]);
      keepTasks.push(ex.id);
    } else
      keepTasks.push((await c.query(
        "INSERT INTO cls_tasks(lesson_id,kind,title,text_ar,max_seconds,max_score,proctor,pass_percent,shadow,prompt_ar) VALUES($1,'recitation',$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
        [lessonId, t.title, t.textAr, t.maxSeconds, t.maxScore, t.proctor, t.passPercent, t.shadow, t.promptAr || null],
      )).rows[0].id);
  }
  await c.query("DELETE FROM cls_tasks WHERE lesson_id=$1 AND NOT (id = ANY($2::uuid[]))", [lessonId, keepTasks]);
  return { lessonId, created: !old };
}

/** Kontentdagi barcha ovozlarni (so'zlar, namunaviy gaplar, og'zaki gaplar) oldindan tayyorlaydi; tayyorlari keshdan olinadi. */
export async function warmLessonVoices(lessonId: string) {
  const texts: string[] = [];
  for (const p of (await pool.query("SELECT data FROM cls_parts WHERE lesson_id=$1 AND kind='vocab'", [lessonId])).rows)
    for (const w of p.data.words || []) texts.push(w.ar, ...[w.plural, w.def, w.exAr].filter(Boolean));
  for (const t of (await pool.query("SELECT text_ar,prompt_ar FROM cls_tasks WHERE lesson_id=$1 AND shadow", [lessonId])).rows)
    texts.push(...(t.prompt_ar ? [t.prompt_ar] : []), ...splitSentences(t.text_ar));
  let ok = 0, failed = 0;
  for (const t of texts) {
    try {
      await ttsUrl(t);
      ok++;
    } catch {
      failed++;
    }
  }
  return { total: texts.length, ok, failed };
}

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
    const b = z.object({ source: z.enum(["word", "plural", "def", "example", "task", "prompt"]), id: uuid, index: z.number().int().min(0).max(200) }).parse(req.body);
    let text = "";
    if (b.source === "task" || b.source === "prompt") {
      const t = (await pool.query("SELECT lesson_id,text_ar,prompt_ar FROM cls_tasks WHERE id=$1", [b.id])).rows[0] || fail(404, "Matn topilmadi");
      const { teacher } = await membership(groupId, uid);
      const state = (await lessonStates(groupId, uid, teacher)).find((s) => s.id === t.lesson_id) || fail(404, "Matn topilmadi");
      if (!state.unlocked) fail(403, "Bu dars hali ochilmagan");
      text = (b.source === "prompt" ? t.prompt_ar : splitSentences(t.text_ar)[b.index]) || fail(404, "Gap topilmadi");
    } else {
      const { part } = await partContext(groupId, b.id, uid);
      const w = part.kind === "vocab" ? part.data.words[b.index] : null;
      text = (b.source === "word" ? w?.ar : b.source === "plural" ? w?.plural : b.source === "def" ? w?.def : w?.exAr) || fail(404, "So‘z topilmadi");
    }
    return { url: await ttsUrl(text) };
  }));
  app.get(P + "/media/:hash", requireAuth, async (req, res, next) => {
    try {
      const hash = z.string().regex(/^[a-f0-9]{40}$/).parse(req.params.hash);
      const row = (await pool.query("SELECT storage_key,content_type FROM cls_media WHERE hash=$1", [hash])).rows[0];
      const file = row ? await classStore().get(row.storage_key) : null;
      if (!file) return res.status(404).json({ message: "Topilmadi" });
      res.set({ "Content-Type": row.content_type, "Cache-Control": "private, max-age=2592000, immutable", "Content-Length": String(file.data.length) });
      res.end(file.data);
    } catch (e) {
      next(e);
    }
  });
  app.get(P + "/tts-file/:hash", requireAuth, async (req, res, next) => {
    try {
      const hash = z.string().regex(/^[a-f0-9]{40}$/).parse(req.params.hash);
      const row = (await pool.query("SELECT storage_key FROM cls_tts WHERE hash=$1", [hash])).rows[0];
      const file = row ? await classStore().get(row.storage_key) : null;
      if (!file) return res.status(404).json({ message: "Topilmadi" });
      res.set({ "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=2592000, immutable", "Content-Length": String(file.data.length) });
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

  // Sinov kursi (sayt serveri yuboradi, faqat xizmat kaliti bilan): kurs, guruh va darslar YO'Q bo'lsa yaratiladi —
  // o'qituvchi keyin o'zgartirgan narsa qayta yozilmaydi. Adminning sinov o'quvchisi guruhga qo'shiladi, ovozlar tayyorlanadi.
  app.post(P + "/service/a1-pilot", async (req, res, next) => {
    try {
      if (!platformKeyMatches(req.get("x-platform-key"))) return res.status(403).json({ message: "Xizmat ruxsati yo‘q" });
      const lessons = z.array(importSchema).min(1).max(40).parse(req.body?.lessons);
      for (const l of lessons) await storeWordImages(l);
      const owner = (await pool.query("SELECT id FROM users WHERE role='admin' AND NOT is_test ORDER BY created_at LIMIT 1")).rows[0];
      if (!owner) return res.status(409).json({ message: "Admin topilmadi" });
      const c = await pool.connect();
      let out: any;
      try {
        await c.query("BEGIN");
        await c.query("SELECT pg_advisory_xact_lock(7711001)");
        let course = (await c.query("SELECT id FROM cls_courses WHERE source_key='a1-pilot'")).rows[0];
        if (!course) course = (await c.query("INSERT INTO cls_courses(title,description,level,source_key) VALUES('A1 kursi (sinov)','«Bosqichli arab tili A1» va «Arab tilida CEFR so‘z boyligi» asosida','A1','a1-pilot') RETURNING id")).rows[0];
        const created: string[] = [];
        for (const l of lessons) {
          // Yangi dars yaratiladi; kontent versiyasi oshgan bo'lsa (masalan, kitob almashdi) dars yangilanadi.
          const has = (await c.query("SELECT id,source_version FROM cls_lessons WHERE course_id=$1 AND source_key=$2", [course.id, l.key])).rows[0];
          if (!has || has.source_version < l.version) created.push((await importLesson(c, course.id, l)).lessonId);
        }
        let group = (await c.query("SELECT id,invite_code FROM cls_groups WHERE source_key='a1-pilot'")).rows[0];
        if (!group) {
          group = (await c.query(
            "INSERT INTO cls_groups(course_id,name,invite_code,teacher_id,auto_approve,offer_required,discipline,source_key) VALUES($1,'A1 sinov guruhi',$2,$3,true,false,false,'a1-pilot') RETURNING id,invite_code",
            [course.id, inviteCode(), owner.id],
          )).rows[0];
          await c.query("INSERT INTO cls_group_staff(group_id,user_id,role) VALUES($1,$2,'teacher') ON CONFLICT DO NOTHING", [group.id, owner.id]);
        }
        let tester = (await c.query("SELECT id FROM users WHERE test_owner_id=$1", [owner.id])).rows[0];
        if (!tester)
          tester = (await c.query(
            "INSERT INTO users(full_name,username,email_verified,password_hash,role,is_test,test_owner_id) VALUES('Sinov o‘quvchi',$1,false,$2,'student',true,$3) RETURNING id",
            ["test_" + String(owner.id).replace(/-/g, "").slice(0, 24), hashPassword(randomBytes(32).toString("hex")), owner.id],
          )).rows[0];
        await c.query("INSERT INTO cls_members(group_id,user_id,status,display_name) VALUES($1,$2,'active','Sinov o‘quvchi') ON CONFLICT (group_id,user_id) DO UPDATE SET status='active'", [group.id, tester.id]);
        await c.query("COMMIT");
        out = { courseId: course.id, groupId: group.id, inviteCode: group.invite_code, createdLessons: created.length };
      } catch (e) {
        await c.query("ROLLBACK").catch(() => undefined);
        throw e;
      } finally {
        c.release();
      }
      const ids = (await pool.query("SELECT id FROM cls_lessons WHERE course_id=$1 AND source_key IS NOT NULL ORDER BY position", [out.courseId])).rows.map((r: any) => r.id);
      // Ovozlar fonda tayyorlanadi (keshdagilari qayta yaratilmaydi).
      void (async () => {
        for (const id of ids) console.log("[a1-pilot] ovozlar", id, JSON.stringify(await warmLessonVoices(id).catch((e) => ({ error: String(e?.message || e) }))));
      })();
      res.json(out);
    } catch (e) {
      next(e);
    }
  });
  app.get(P + "/service/a1-pilot", async (req, res, next) => {
    try {
      if (!platformKeyMatches(req.get("x-platform-key"))) return res.status(403).json({ message: "Xizmat ruxsati yo‘q" });
      const voices = (await pool.query("SELECT count(*)::int AS n FROM cls_tts")).rows[0].n;
      const g = (await pool.query("SELECT g.id, g.invite_code, (SELECT count(*)::int FROM cls_lessons l WHERE l.course_id=g.course_id) AS lessons FROM cls_groups g WHERE g.source_key='a1-pilot'")).rows[0];
      res.json({ group: g || null, voices, voiceConfigured: !!(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID) });
    } catch (e) {
      next(e);
    }
  });

  // Import: kurs darsini tayyor kontent bilan yaratish yoki yangilash.
  app.post(P + "/admin/courses/:id/import-lesson", requireStaff, route(async (req) => {
    const courseId = uuid.parse(req.params.id), uid = userOf(req);
    await needCourse(courseId, uid);
    const b = importSchema.parse(req.body);
    await storeWordImages(b);
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const result = await importLesson(c, courseId, b);
      await c.query("COMMIT");
      return result;
    } catch (e) {
      await c.query("ROLLBACK").catch(() => undefined);
      throw e;
    } finally {
      c.release();
    }
  }));
}
