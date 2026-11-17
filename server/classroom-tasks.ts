// Yodlash vazifalari: o'quvchi matnni yoddan o'qib audio yuboradi (saytda yozib yoki Telegram botga
// ovozli xabar / dumaloq video). Audio siqiladi, OpenAI orqali matnga aylantiriladi va asl matn bilan
// so'zma-so'z solishtiriladi (harakatlar hisobga olinmaydi). Natija — taxminiy foiz; yakuniy ballni o'qituvchi tasdiqlaydi.
import type { Express, Request } from "express";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import OpenAI, { toFile } from "openai";
import { pool } from "./db";
import { requireAdmin, requireAuth } from "./auth";
import { ClassError, lessonStates, membership, notifyUsers, route, uuid } from "./classroom";
import { classStore } from "./class-storage";
import { botFile, botUsername, botReady, setClassTelegramHook, type TelegramMedia } from "./payment-bot";

const fail = (status: number, message: string): never => {
  throw new ClassError(status, message);
};
const userOf = (req: Request) => String(req.session.userId);

/* ---------------- Arabcha matnni solishtirish ---------------- */
export function normalizeArabic(text: string) {
  return text
    .normalize("NFKC")
    .replace(/[ؐ-ًؚ-ٰٟۖ-ۭ]/g, "") // harakatlar va Qur'on belgilari
    .replace(/ـ/g, "") // tatvil
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}
export type DiffItem = { w: string; t: "ok" | "miss" | "extra" };
/** LCS asosida so'zma-so'z solishtirish. percent = asl matndagi to'g'ri aytilgan so'zlar ulushi. */
export function compareRecitation(original: string, spoken: string) {
  const a = normalizeArabic(original), b = normalizeArabic(spoken);
  const shownA = original.normalize("NFKC").replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const diff: DiffItem[] = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      diff.push({ w: shownA[i] ?? a[i], t: "ok" });
      i++, j++;
    } else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) {
      diff.push({ w: b[j], t: "extra" });
      j++;
    } else {
      diff.push({ w: shownA[i] ?? a[i], t: "miss" });
      i++;
    }
  }
  const matched = diff.filter((d) => d.t === "ok").length;
  const extra = diff.filter((d) => d.t === "extra").length;
  // Ortiqcha so'zlar ham biroz jarima beradi (matnga qo'shimcha "to'qib" aytilmasin).
  const percent = n ? Math.max(0, Math.round(((matched - extra * 0.25) / n) * 100)) : 0;
  return { percent, diff, words: n };
}

/* ---------------- Audio: siqish va matnga aylantirish ---------------- */
type Transcriber = (audio: Buffer, mime: string) => Promise<string>;
let openai: OpenAI | undefined;
const realTranscriber: Transcriber = async (audio, mime) => {
  const key = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!key) throw new Error("OpenAI is not configured");
  openai ||= new OpenAI({ apiKey: key, ...(process.env.OPENAI_API_KEY ? {} : { baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL }) });
  const ext = mime.includes("ogg") ? "ogg" : mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac") ? "m4a" : mime.includes("mpeg") ? "mp3" : "webm";
  const result = await openai.audio.transcriptions.create({
    file: await toFile(audio, `recitation.${ext}`, { type: mime }),
    model: process.env.CLASS_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe",
    language: "ar",
  });
  return String((result as any).text || "");
};
let transcriber: Transcriber = realTranscriber;
export function setTranscriber(fn: Transcriber | undefined) {
  transcriber = fn || realTranscriber;
}

/** ffmpeg bo'lsa: ovozni mono 24 kbit/s Opus (ogg) ga siqamiz — 2 daqiqa ≈ 360 KB. Bo'lmasa asl fayl qoladi. */
export function compressAudio(input: Buffer, maxSeconds: number): Promise<{ data: Buffer; mime: string } | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: { data: Buffer; mime: string } | null) => {
      if (!done) (done = true), resolve(v);
    };
    let child;
    try {
      child = spawn(process.env.FFMPEG_PATH || "ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-t", String(maxSeconds + 5), "-vn", "-ac", "1", "-ar", "24000", "-c:a", "libopus", "-b:a", "24k", "-f", "ogg", "pipe:1"], { stdio: ["pipe", "pipe", "ignore"] });
    } catch {
      return finish(null);
    }
    const chunks: Buffer[] = [];
    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.on("error", () => finish(null));
    child.on("close", (code) => finish(code === 0 && chunks.length ? { data: Buffer.concat(chunks), mime: "audio/ogg" } : null));
    child.stdin.on("error", () => undefined);
    child.stdin.end(input);
    setTimeout(() => {
      child.kill("SIGKILL");
      finish(null);
    }, 60000).unref();
  });
}

const MAX_AUDIO = 20 * 1024 * 1024;
async function sniffMime(data: Buffer, declared: string) {
  const head = data.subarray(0, 12).toString("latin1");
  if (head.startsWith("OggS")) return "audio/ogg";
  if (data[0] === 0x1a && data[1] === 0x45 && data[2] === 0xdf && data[3] === 0xa3) return "audio/webm";
  if (head.slice(4, 8) === "ftyp") return declared.startsWith("video") ? "video/mp4" : "audio/mp4";
  if (head.startsWith("ID3") || (data[0] === 0xff && (data[1] & 0xe0) === 0xe0)) return "audio/mpeg";
  if (head.startsWith("RIFF")) return "audio/wav";
  return null;
}

/** Topshiriqni saqlash va AI tekshiruv. Telegram va sayt uchun umumiy. */
export async function submitRecitation(input: { groupId: string; taskId: string; userId: string; audio: Buffer; mime: string; seconds: number; source: "web" | "telegram" }) {
  const task = (await pool.query("SELECT t.*, l.id AS lesson_id FROM cls_tasks t JOIN cls_lessons l ON l.id=t.lesson_id WHERE t.id=$1", [input.taskId])).rows[0] || fail(404, "Vazifa topilmadi");
  const { teacher } = await membership(input.groupId, input.userId);
  const state = (await lessonStates(input.groupId, input.userId, teacher)).find((s) => s.id === task.lesson_id) || fail(404, "Vazifa bu guruhga tegishli emas");
  if (!state.unlocked) fail(403, "Bu dars hali ochilmagan");
  if (!input.audio.length || input.audio.length > MAX_AUDIO) fail(413, "Audio hajmi juda katta");
  const mime = (await sniffMime(input.audio, input.mime)) || fail(415, "Audio formati tanilmadi");
  if (input.seconds > task.max_seconds + 10) fail(400, `Yozuv ${task.max_seconds} soniyadan oshmasin`);
  const graded = (await pool.query("SELECT 1 FROM cls_submissions WHERE task_id=$1 AND group_id=$2 AND user_id=$3 AND status='graded'", [task.id, input.groupId, input.userId])).rowCount;
  const recent = (await pool.query("SELECT count(*)::int AS n FROM cls_submissions WHERE task_id=$1 AND group_id=$2 AND user_id=$3", [task.id, input.groupId, input.userId])).rows[0].n;
  if (graded) fail(409, "Bu vazifa allaqachon baholangan");
  if (recent >= 5) fail(409, "Bu vazifa uchun urinishlar soni tugadi (5 ta)");

  const compressed = await compressAudio(input.audio, task.max_seconds);
  const audio = compressed?.data || input.audio;
  const audioMime = compressed?.mime || mime;
  const id = (await pool.query("SELECT gen_random_uuid() AS id")).rows[0].id;
  const key = `class/audio/${input.groupId}/${id}.${audioMime.includes("ogg") ? "ogg" : audioMime.includes("webm") ? "webm" : audioMime.includes("mpeg") ? "mp3" : audioMime.includes("wav") ? "wav" : "m4a"}`;
  await classStore().put(key, audio, audioMime);
  const due = (await pool.query("SELECT due_at FROM cls_group_lessons WHERE group_id=$1 AND lesson_id=$2", [input.groupId, task.lesson_id])).rows[0]?.due_at;
  const late = !!due && new Date(due).getTime() < Date.now();
  // Avvalgi tekshirilmagan urinishlar o'qituvchi navbatidan chiqadi (eng oxirgisi qoladi).
  await pool.query("UPDATE cls_submissions SET status='replaced' WHERE task_id=$1 AND group_id=$2 AND user_id=$3 AND status='submitted'", [task.id, input.groupId, input.userId]);
  await pool.query(
    `INSERT INTO cls_submissions(id,task_id,group_id,user_id,audio_key,audio_seconds,audio_mime,source,late,status)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'submitted')`,
    [id, task.id, input.groupId, input.userId, key, Math.round(input.seconds), audioMime, input.source, late],
  );
  let ai: { percent: number; diff: DiffItem[] } | null = null;
  let transcript = "";
  try {
    transcript = await transcriber(audio, audioMime);
    ai = compareRecitation(task.text_ar, transcript);
    await pool.query("UPDATE cls_submissions SET transcript=$2, ai_percent=$3, ai_diff=$4 WHERE id=$1", [id, transcript.slice(0, 10000), ai.percent, JSON.stringify(ai.diff)]);
  } catch {
    // AI ishlamasa ham topshiriq saqlanadi — o'qituvchi tinglab baholaydi.
  }
  const teacherId = (await pool.query("SELECT teacher_id FROM cls_groups WHERE id=$1", [input.groupId])).rows[0]?.teacher_id;
  if (teacherId) await notifyUsers([teacherId], input.groupId, { title: "Yangi vazifa tekshirishga keldi", body: task.title, path: "tekshirish", ref: `review-${input.groupId}-${Math.floor(Date.now() / 900000)}` });
  return {
    id,
    aiPercent: ai?.percent ?? null,
    suggested: ai ? Math.round((task.max_score * ai.percent) / 100) : null,
    maxScore: task.max_score,
    late,
    diff: ai?.diff ?? null,
  };
}

/* ---------------- Telegram orqali qabul qilish ---------------- */
async function telegramHook(input: { chatId: string; text: string; message: { voice?: TelegramMedia; video_note?: TelegramMedia; audio?: TelegramMedia; video?: TelegramMedia } }) {
  const start = /^\/start(?:@[A-Za-z0-9_]+)?\s+t-([A-Za-z0-9]{16})$/.exec(input.text);
  if (start) {
    const row = (
      await pool.query(
        `UPDATE cls_tg_intake SET chat_id=$2 WHERE code=$1 AND used_at IS NULL AND expires_at>now() RETURNING task_id`,
        [start[1], input.chatId],
      )
    ).rows[0];
    if (!row) return "Havola eskirgan. Saytdagi vazifadan «Telegram orqali yuborish» tugmasini qayta bosing.";
    const t = (await pool.query("SELECT title, max_seconds FROM cls_tasks WHERE id=$1", [row.task_id])).rows[0];
    return `«${t?.title || "Vazifa"}» uchun tayyor.\nEndi matnni yoddan o‘qib, ovozli xabar yoki dumaloq video yuboring (eng ko‘pi ${Math.min(t?.max_seconds || 60, 60)} soniya).`;
  }
  const media = input.message.voice || input.message.video_note || input.message.audio || input.message.video;
  if (!media) return null;
  const intake = (
    await pool.query("SELECT * FROM cls_tg_intake WHERE chat_id=$1 AND used_at IS NULL AND expires_at>now() ORDER BY expires_at DESC LIMIT 1", [input.chatId])
  ).rows[0];
  if (!intake) return null; // boshqa maqsaddagi audio — umumiy javob beriladi
  if ((media.file_size || 0) > 20 * 1024 * 1024) return "Fayl juda katta. 1 daqiqagacha ovozli xabar yuboring.";
  await pool.query("UPDATE cls_tg_intake SET used_at=now() WHERE code=$1", [intake.code]);
  try {
    const data = await botFile(media.file_id);
    const r = await submitRecitation({
      groupId: intake.group_id,
      taskId: intake.task_id,
      userId: intake.user_id,
      audio: data,
      mime: media.mime_type || (input.message.voice ? "audio/ogg" : "video/mp4"),
      seconds: Number(media.duration || 0),
      source: "telegram",
    });
    return r.aiPercent === null
      ? "Qabul qilindi ✅ O‘qituvchi tinglab baholaydi."
      : `Qabul qilindi ✅\nTaxminiy natija: ${r.aiPercent}% (${r.suggested}/${r.maxScore} ball).\nYakuniy ballni o‘qituvchi tasdiqlaydi.`;
  } catch (error) {
    await pool.query("UPDATE cls_tg_intake SET used_at=NULL WHERE code=$1", [intake.code]);
    return error instanceof ClassError ? error.message : "Yuborishda xato bo‘ldi. Birozdan so‘ng qayta yuboring.";
  }
}

export function registerClassTasks(app: Express) {
  const P = "/api/platform/class";
  setClassTelegramHook(telegramHook as any);

  /* ---------- O'qituvchi: vazifalar ---------- */
  const taskSchema = z.object({
    title: z.string().trim().min(1).max(200),
    textAr: z.string().trim().min(1).max(5000),
    maxSeconds: z.number().int().min(10).max(300).default(120),
    maxScore: z.number().int().min(1).max(100).default(10),
  });
  app.get(P + "/admin/lessons/:id/tasks", requireAdmin, route(async (req) => ({
    tasks: (await pool.query("SELECT * FROM cls_tasks WHERE lesson_id=$1 ORDER BY created_at", [uuid.parse(req.params.id)])).rows,
  })));
  app.post(P + "/admin/lessons/:id/tasks", requireAdmin, route(async (req) => {
    const b = taskSchema.parse(req.body);
    const t = (
      await pool.query(
        "INSERT INTO cls_tasks(lesson_id,kind,title,text_ar,max_seconds,max_score) SELECT $1,'recitation',$2,$3,$4,$5 WHERE EXISTS(SELECT 1 FROM cls_lessons WHERE id=$1) RETURNING *",
        [uuid.parse(req.params.id), b.title, b.textAr, b.maxSeconds, b.maxScore],
      )
    ).rows[0];
    return t ? { task: t } : fail(404, "Dars topilmadi");
  }));
  app.patch(P + "/admin/tasks/:id", requireAdmin, route(async (req) => {
    const b = taskSchema.partial().parse(req.body);
    const t = (
      await pool.query(
        "UPDATE cls_tasks SET title=COALESCE($2,title), text_ar=COALESCE($3,text_ar), max_seconds=COALESCE($4,max_seconds), max_score=COALESCE($5,max_score) WHERE id=$1 RETURNING *",
        [uuid.parse(req.params.id), b.title ?? null, b.textAr ?? null, b.maxSeconds ?? null, b.maxScore ?? null],
      )
    ).rows[0];
    return t ? { task: t } : fail(404, "Vazifa topilmadi");
  }));
  app.delete(P + "/admin/tasks/:id", requireAdmin, route(async (req) => {
    const id = uuid.parse(req.params.id);
    if ((await pool.query("SELECT 1 FROM cls_submissions WHERE task_id=$1 LIMIT 1", [id])).rowCount) fail(409, "Bu vazifaga javoblar bor — o‘chirib bo‘lmaydi");
    await pool.query("DELETE FROM cls_tasks WHERE id=$1", [id]);
  }));

  /* ---------- O'quvchi: topshirish ---------- */
  app.post(P + "/groups/:id/tasks/:taskId/submit", requireAuth, route(async (req) => {
    const b = z.object({ audio: z.string().min(100).max(11_000_000), mime: z.string().max(100), seconds: z.number().min(0.5).max(400) }).parse(req.body);
    return submitRecitation({
      groupId: uuid.parse(req.params.id),
      taskId: uuid.parse(req.params.taskId),
      userId: userOf(req),
      audio: Buffer.from(b.audio, "base64"),
      mime: b.mime,
      seconds: b.seconds,
      source: "web",
    });
  }));
  /** Telegram orqali yuborish uchun bir martalik havola (30 daqiqa). */
  app.post(P + "/groups/:id/tasks/:taskId/telegram", requireAuth, route(async (req) => {
    const groupId = uuid.parse(req.params.id), taskId = uuid.parse(req.params.taskId), me = userOf(req);
    await membership(groupId, me);
    if (!(await pool.query("SELECT 1 FROM cls_tasks WHERE id=$1", [taskId])).rowCount) fail(404, "Vazifa topilmadi");
    if (!botReady()) fail(503, "Telegram bot hozircha ulanmagan");
    const code = randomBytes(8).toString("hex");
    await pool.query("DELETE FROM cls_tg_intake WHERE user_id=$1 AND task_id=$2 AND used_at IS NULL", [me, taskId]);
    await pool.query("INSERT INTO cls_tg_intake(code,user_id,group_id,task_id,expires_at) VALUES($1,$2,$3,$4,now()+interval '30 minutes')", [code, me, groupId, taskId]);
    const username = await botUsername();
    return { url: `https://t.me/${username}?start=t-${code}` };
  }));
  /** Audio tinglash: o'quvchi o'zinikini, o'qituvchi hammasini. */
  app.get(P + "/submissions/:id/audio", requireAuth, async (req, res, next) => {
    try {
      const id = uuid.parse(req.params.id), me = userOf(req);
      const s = (await pool.query("SELECT * FROM cls_submissions WHERE id=$1", [id])).rows[0];
      if (!s) return res.status(404).json({ message: "Topilmadi" });
      const { teacher } = await membership(s.group_id, me);
      if (!teacher && s.user_id !== me) return res.status(404).json({ message: "Topilmadi" });
      const file = s.audio_key ? await classStore().get(s.audio_key) : null;
      if (!file) return res.status(404).json({ message: "Audio topilmadi" });
      res.set({ "Content-Type": s.audio_mime || file.mime, "Cache-Control": "private, max-age=3600", "Content-Length": String(file.data.length) });
      res.end(file.data);
    } catch (error) {
      if (error instanceof ClassError) return res.status(error.status).json({ message: error.message });
      next(error);
    }
  });

  /* ---------- O'qituvchi: tekshirish navbati ---------- */
  app.get(P + "/groups/:id/review", requireAuth, route(async (req) => {
    const id = uuid.parse(req.params.id), me = userOf(req);
    const { teacher } = await membership(id, me);
    if (!teacher) fail(403, "Faqat o‘qituvchi uchun");
    const status = req.query.status === "graded" ? "graded" : "submitted";
    const rows = (
      await pool.query(
        `SELECT s.id, s.user_id, COALESCE(NULLIF(m.display_name,''),u.full_name) AS name, s.audio_seconds, s.transcript, s.ai_percent, s.ai_diff,
                s.score, s.comment, s.status, s.late, s.source, s.created_at, t.id AS task_id, t.title, t.text_ar, t.max_score, l.title AS lesson_title
           FROM cls_submissions s JOIN cls_tasks t ON t.id=s.task_id JOIN cls_lessons l ON l.id=t.lesson_id
           JOIN users u ON u.id=s.user_id LEFT JOIN cls_members m ON m.group_id=s.group_id AND m.user_id=s.user_id
          WHERE s.group_id=$1 AND s.status=$2 ORDER BY ${status === "graded" ? "s.created_at DESC" : "s.created_at"} LIMIT 100`,
        [id, status],
      )
    ).rows;
    return {
      items: rows.map((r: any) => ({ ...r, suggested: r.ai_percent === null ? null : Math.round((r.max_score * r.ai_percent) / 100) })),
      waiting: (await pool.query("SELECT count(*)::int AS n FROM cls_submissions WHERE group_id=$1 AND status='submitted'", [id])).rows[0].n,
    };
  }));
  app.post(P + "/submissions/:id/grade", requireAuth, route(async (req) => {
    const id = uuid.parse(req.params.id), me = userOf(req);
    const b = z.object({ score: z.number().int().min(0).max(100), comment: z.string().trim().max(1000).optional().default("") }).parse(req.body);
    const s = (await pool.query("SELECT s.*, t.max_score, t.title FROM cls_submissions s JOIN cls_tasks t ON t.id=s.task_id WHERE s.id=$1", [id])).rows[0] || fail(404, "Topilmadi");
    const { teacher } = await membership(s.group_id, me);
    if (!teacher) fail(403, "Faqat o‘qituvchi uchun");
    if (b.score > s.max_score) fail(400, `Ball ${s.max_score} dan oshmasin`);
    await pool.query("UPDATE cls_submissions SET score=$2, comment=$3, status='graded' WHERE id=$1", [id, b.score, b.comment]);
    await notifyUsers([s.user_id], s.group_id, { title: "Vazifangiz baholandi", body: `${s.title}: ${b.score}/${s.max_score}${b.comment ? " — " + b.comment.slice(0, 80) : ""}`, path: "natijalar", ref: `graded-${id}` });
    return { ok: true };
  }));
}
