// Yodlash vazifalari: o'quvchi matnni yoddan o'qiydi — faqat saytda, old kamera yoqilgan holda yoziladi.
// Telefon brauzerida yuz/ko'z nazorati (MediaPipe) ishlaydi; qoidabuzarlik ko'p bo'lsa yozuv qabul qilinmaydi
// (qayta yozish so'raladi). Audio siqiladi, OpenAI orqali matnga aylantiriladi (so'z vaqtlari bilan), asl matn bilan
// so'zma-so'z solishtiriladi va ball AVTOMATIK qo'yiladi. O'qituvchi xohlasa bahoni o'zgartira oladi.
import type { Express, Request } from "express";
import { spawn } from "node:child_process";
import { z } from "zod";
import OpenAI, { toFile } from "openai";
import { pool } from "./db";
import { requireAuth } from "./auth";
import { ClassError, groupStaff, lessonStates, membership, needLesson, notifyUsers, requireStaff, route, uuid } from "./classroom";
import { classStore } from "./class-storage";

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

/** Bo'laklab tekshirish: aytilgan so'zlarning qanchasi asl matnda shu tartibda bor (aniqlik) va bo'laklar
 *  yetarlicha uzunmi (jim turib qolmaganmi). Bo'laklardan tashqaridagi so'zlar "aytilmagan" hisoblanmaydi. */
export function compareSampled(original: string, spoken: string, clipSeconds: number) {
  const a = normalizeArabic(original), b = normalizeArabic(spoken);
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const matched = dp[0][0];
  // Arabcha yoddan o'qishda soniyasiga ~2 so'z; bo'laklarda kamida soniyasiga 1 so'z kutiladi.
  const expected = Math.max(3, Math.min(Math.round(n * 0.6), Math.round(clipSeconds * 1)));
  const percent = Math.max(0, Math.min(100, Math.round((matched / Math.max(m, expected)) * 100)));
  return { percent, matched, spoken: m };
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

/* ---------------- Audio: matnga aylantirish ---------------- */
export type Transcript = { text: string; words?: { word: string; start: number; end: number }[] };
type Transcriber = (audio: Buffer, mime: string) => Promise<Transcript>;
let openai: OpenAI | undefined;
const realTranscriber: Transcriber = async (audio, mime) => {
  const key = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!key) throw new Error("OpenAI is not configured");
  openai ||= new OpenAI({ apiKey: key, ...(process.env.OPENAI_API_KEY ? {} : { baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL }) });
  const ext = mime.includes("ogg") ? "ogg" : mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac") ? "m4a" : mime.includes("mpeg") ? "mp3" : "webm";
  // whisper-1 so'z vaqtlarini beradi — to'xtalishlar (eslay olmay qolish) shundan aniqlanadi.
  const result: any = await openai.audio.transcriptions.create({
    file: await toFile(audio, `recitation.${ext}`, { type: mime }),
    model: process.env.CLASS_TRANSCRIBE_MODEL || "whisper-1",
    language: "ar",
    response_format: "verbose_json",
    timestamp_granularities: ["word"],
  } as any);
  return { text: String(result?.text || ""), words: Array.isArray(result?.words) ? result.words : undefined };
};
let transcriber: Transcriber = realTranscriber;

/* ---------------- ChatGPT: so'zma-so'z hakamlik ---------------- */
export type Judge = { percent: number; missing: string[]; wrong: { said: string; expected: string }[]; extra: string[]; note: string };
type Judger = (original: string, spoken: string, lcs: number, sampled?: boolean) => Promise<Judge>;
const realJudge: Judger = async (original, spoken, lcs, sampled) => {
  const key = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!key) throw new Error("OpenAI is not configured");
  openai ||= new OpenAI({ apiKey: key, ...(process.env.OPENAI_API_KEY ? {} : { baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL }) });
  const r: any = await openai.chat.completions.create({
    model: process.env.CLASS_JUDGE_MODEL || "gpt-4o-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You grade an Arabic memorization (recitation) exam. ORIGINAL is the text the student had to memorize word for word. TRANSCRIPT is an automatic speech-to-text (Whisper) result of the student's recording. " +
          "Compare them word by word, ignoring diacritics (harakat), punctuation, hamza/alif/ta-marbuta spelling variants and obvious speech-recognition spelling errors of the SAME word. " +
          "Count as errors only words the student omitted, replaced with a different word, or added. Return JSON: {\"percent\": integer 0-100 = share of ORIGINAL words said correctly and in order, minus small penalty for added words, " +
          "\"missing\": [original words not said], \"wrong\": [{\"said\": word, \"expected\": word}], \"extra\": [added words], \"note\": one short sentence in Uzbek (Latin script) for the student}. Be strict: the text must be memorized verbatim." +
          (sampled
            ? " IMPORTANT: to save cost, TRANSCRIPT contains only three short clips of the recording (from the beginning, the middle and the end), joined together. Do NOT count original words outside these clips as missing. percent = share of TRANSCRIPT words that match the ORIGINAL verbatim and in order (each clip must be a continuous fragment of the ORIGINAL; the last clip should come from the end of the ORIGINAL). \"missing\" lists only words skipped INSIDE a clip."
            : ""),
      },
      { role: "user", content: `ORIGINAL:\n${original}\n\nTRANSCRIPT${sampled ? " (three short clips: start, middle, end)" : ""}:\n${spoken}\n\nAutomatic word-match score for reference: ${lcs}%` },
    ],
  });
  const j = JSON.parse(r?.choices?.[0]?.message?.content || "{}");
  const list = (v: any) => (Array.isArray(v) ? v.map(String).slice(0, 60) : []);
  return {
    percent: Math.max(0, Math.min(100, Math.round(Number(j.percent)))),
    missing: list(j.missing),
    wrong: Array.isArray(j.wrong) ? j.wrong.slice(0, 60).map((w: any) => ({ said: String(w?.said ?? ""), expected: String(w?.expected ?? "") })) : [],
    extra: list(j.extra),
    note: String(j.note || "").slice(0, 400),
  };
};
let judge: Judger | null = realJudge;

/* ---------------- Erkin gapirish (B1: iboralar bilan 60 soniya) ---------------- */
type SpeakJudger = (topic: string, phrases: string, spoken: string, sampled: boolean) => Promise<Judge>;
const realSpeakJudge: SpeakJudger = async (topic, phrases, spoken, sampled) => {
  const key = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!key) throw new Error("OpenAI is not configured");
  openai ||= new OpenAI({ apiKey: key, ...(process.env.OPENAI_API_KEY ? {} : { baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL }) });
  const r: any = await openai.chat.completions.create({
    model: process.env.CLASS_JUDGE_MODEL || "gpt-4o-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You grade a B1-level Arabic speaking task. The student had to speak freely for about 60 seconds on TOPIC, using the TARGET PHRASES (Arabic discourse phrases). " +
          "TRANSCRIPT is an automatic speech-to-text result" + (sampled ? " of only three short clips (beginning, middle, end) of the recording, joined together — judge only what is there, do not penalize for content outside the clips" : "") + ". " +
          "Score 0-100: Arabic language actually spoken and mostly comprehensible (40), relevance to TOPIC (25), use of TARGET PHRASES (20, any phrase present in the clips counts), grammar and coherence (15). " +
          "If the transcript is not Arabic, is empty, or is unrelated noise, give at most 10. Return JSON: {\"percent\": integer, \"used\": [target phrases heard], \"note\": one or two short sentences in Uzbek (Latin script) for the student: what was good and what to improve}.",
      },
      { role: "user", content: `TOPIC:\n${topic}\n\nTARGET PHRASES:\n${phrases}\n\nTRANSCRIPT:\n${spoken}` },
    ],
  });
  const j = JSON.parse(r?.choices?.[0]?.message?.content || "{}");
  return {
    percent: Math.max(0, Math.min(100, Math.round(Number(j.percent)))),
    missing: [], wrong: [], extra: Array.isArray(j.used) ? j.used.map(String).slice(0, 20) : [],
    note: String(j.note || "").slice(0, 400),
  };
};
let speakJudge: SpeakJudger | null = realSpeakJudge;
/** Testlar uchun: null — AI o'chiq (arabcha so'zlar soni bo'yicha taxminiy baho). */
export function setSpeakJudge(fn: SpeakJudger | null | undefined) {
  speakJudge = fn === undefined ? realSpeakJudge : fn;
}
/** AI'siz zaxira baho: bo'laklarda arabcha so'zlar soni (15 soniyada ~25 so'z — a'lo). */
export function speakFallback(spoken: string) {
  const words = normalizeArabic(spoken).filter((w) => /[\u0621-\u064A]/.test(w)).length;
  return Math.min(100, Math.round((words / 25) * 100));
}
/** Testlar uchun: null — hakam o'chiq (faqat avtomatik solishtirish). */
export function setJudge(fn: Judger | null | undefined) {
  judge = fn === undefined ? realJudge : fn;
}
export function setTranscriber(fn: Transcriber | undefined) {
  transcriber = fn || realTranscriber;
}

/* ---------------- Kamera nazorati ---------------- */
const proctorSchema = z.object({
  enabled: z.boolean(),
  supported: z.boolean().default(true),
  duration: z.number().min(0).max(600),
  awaySeconds: z.number().min(0).max(600).default(0),
  noFaceSeconds: z.number().min(0).max(600).default(0),
  multiSeconds: z.number().min(0).max(600).default(0),
  events: z.array(z.object({ t: z.number().min(0).max(600), kind: z.enum(["noface", "multi", "down", "side", "eyes"]), seconds: z.number().min(0).max(600) })).max(60).default([]),
});
export type ProctorReport = z.infer<typeof proctorSchema>;
/** Sayt bilan bir xil qoida: 3+ marta ko'z olib qochish, vaqtning 25%+ i chetga qarash yoki kadrda boshqa odam — qayta yozish. */
export function proctorVerdict(r: ProctorReport | null) {
  if (!r || !r.enabled) return { retake: false, reasons: [] as string[], warnings: 0 };
  const reasons: string[] = [];
  const looks = r.events.filter((e) => e.kind !== "multi").length;
  if (r.multiSeconds >= 1.5 || r.events.some((e) => e.kind === "multi")) reasons.push("kadrda boshqa odam ko‘rindi");
  if (looks >= 3) reasons.push(`${looks} marta kameraga qaralmadi`);
  if (r.duration > 0 && r.awaySeconds > Math.max(4, r.duration * 0.25)) reasons.push("ko‘p vaqt kameraga qaralmadi");
  if (r.noFaceSeconds > Math.max(3, r.duration * 0.15)) reasons.push("yuz kadrdan chiqib ketdi");
  return { retake: reasons.length > 0, reasons, warnings: looks };
}
/** So'zlar orasidagi 2,5 soniyadan uzun jimlik — eslay olmay to'xtalish. */
export function countPauses(words: Transcript["words"]) {
  if (!words?.length) return null;
  let n = 0;
  for (let i = 1; i < words.length; i++) if (words[i].start - words[i - 1].end > 2.5) n++;
  return n;
}
/** Yakuniy foiz: to'g'ri aytilgan so'zlar ulushi − ortiqcha to'xtalishlar − kamera ogohlantirishlari. */
export function autoPercent(accuracy: number, pauses: number | null, warnings: number) {
  return Math.max(0, Math.min(100, Math.round(accuracy - Math.max(0, (pauses || 0) - 2) * 5 - warnings * 5)));
}

const MAX_AUDIO = 20 * 1024 * 1024;
const MAX_ATTEMPTS = 5;
async function sniffMime(data: Buffer, declared: string) {
  const head = data.subarray(0, 12).toString("latin1");
  if (head.startsWith("OggS")) return "audio/ogg";
  if (data[0] === 0x1a && data[1] === 0x45 && data[2] === 0xdf && data[3] === 0xa3) return "audio/webm";
  if (head.slice(4, 8) === "ftyp") return declared.startsWith("video") ? "video/mp4" : "audio/mp4";
  if (head.startsWith("ID3") || (data[0] === 0xff && (data[1] & 0xe0) === 0xe0)) return "audio/mpeg";
  if (head.startsWith("RIFF")) return "audio/wav";
  return null;
}

/** Topshiriqni qabul qilish, kamera hisobotini tekshirish, AI bilan avtomatik baholash. */
export type SampleInfo = { total: number; clips: [number, number][] };
const MAX_VIDEO = 15 * 1024 * 1024;
function videoMime(data: Buffer) {
  const head = data.subarray(0, 12).toString("latin1");
  if (data[0] === 0x1a && data[1] === 0x45 && data[2] === 0xdf && data[3] === 0xa3) return "video/webm";
  if (head.slice(4, 8) === "ftyp") return "video/mp4";
  return null;
}
export async function submitRecitation(input: { groupId: string; taskId: string; userId: string; audio: Buffer; mime: string; seconds: number; proctor: ProctorReport | null; snapshots: Buffer[]; video?: Buffer | null; sampled?: SampleInfo | null }) {
  const task = (await pool.query("SELECT t.*, l.id AS lesson_id FROM cls_tasks t JOIN cls_lessons l ON l.id=t.lesson_id WHERE t.id=$1", [input.taskId])).rows[0] || fail(404, "Vazifa topilmadi");
  const { teacher } = await membership(input.groupId, input.userId);
  const state = (await lessonStates(input.groupId, input.userId, teacher)).find((s) => s.id === task.lesson_id) || fail(404, "Vazifa bu guruhga tegishli emas");
  if (!state.unlocked) fail(403, "Bu dars hali ochilmagan");
  if (!input.audio.length || input.audio.length > MAX_AUDIO) fail(413, "Audio hajmi juda katta");
  const mime = (await sniffMime(input.audio, input.mime)) || fail(415, "Audio formati tanilmadi");
  if (input.seconds > task.max_seconds + 10) fail(400, `Yozuv ${task.max_seconds} soniyadan oshmasin`);
  if (task.min_seconds && input.seconds < task.min_seconds - 2) fail(400, `Kamida ${task.min_seconds} soniya gapiring`);
  if (task.proctor === "required" && !input.proctor?.enabled) fail(400, "Bu vazifa old kamera yoqilgan holda yoziladi");
  const video = task.video ? input.video || null : null;
  if (task.video && !video) fail(400, "Bu vazifa video bilan topshiriladi. Brauzeringizni yangilang");
  if (video && video.length > MAX_VIDEO) fail(413, "Video hajmi juda katta. Qisqaroq yozing");
  const vMime = video ? videoMime(video) || fail(415, "Video formati tanilmadi") : null;
  const sampled = input.sampled && input.sampled.clips.length ? input.sampled : null;
  const used = (await pool.query("SELECT count(*)::int AS n FROM cls_submissions WHERE task_id=$1 AND group_id=$2 AND user_id=$3 AND status<>'rejected'", [task.id, input.groupId, input.userId])).rows[0].n;
  const test = !!(await pool.query("SELECT is_test FROM users WHERE id=$1", [input.userId])).rows[0]?.is_test;
  const passedBefore = (await pool.query("SELECT 1 FROM cls_submissions WHERE task_id=$1 AND group_id=$2 AND user_id=$3 AND status='graded' AND final_percent >= $4 LIMIT 1", [task.id, input.groupId, input.userId, task.pass_percent])).rowCount;
  if (used >= MAX_ATTEMPTS && !test && !passedBefore) fail(409, `Bu vazifa uchun urinishlar tugadi (${MAX_ATTEMPTS} ta)`);
  const proctor = task.proctor === "off" ? null : input.proctor;
  const verdict = proctorVerdict(proctor);
  if (verdict.retake) {
    // Urinish hisoblanmaydi, lekin o'qituvchi ko'rishi uchun iz qoladi.
    await pool.query("INSERT INTO cls_submissions(task_id,group_id,user_id,status,proctor,audio_seconds) VALUES($1,$2,$3,'rejected',$4,$5)", [
      task.id, input.groupId, input.userId, JSON.stringify(proctor), Math.round(input.seconds),
    ]);
    fail(422, "Qayta yozing: " + verdict.reasons.join(", "));
  }

  const compressed = await compressAudio(input.audio, task.max_seconds);
  const audio = compressed?.data || input.audio;
  const audioMime = compressed?.mime || mime;
  const id = (await pool.query("SELECT gen_random_uuid() AS id")).rows[0].id;
  const ext = audioMime.includes("ogg") ? "ogg" : audioMime.includes("webm") ? "webm" : audioMime.includes("mpeg") ? "mp3" : audioMime.includes("wav") ? "wav" : "m4a";
  const key = `class/audio/${input.groupId}/${id}.${ext}`;
  const store = classStore();
  await store.put(key, audio, audioMime);
  // Video bucket'ga yoziladi; o'qituvchi uni vaqtinchalik havola orqali to'g'ridan-to'g'ri bucket'dan ko'radi.
  const videoKey = video ? `class/video/${input.groupId}/${id}.${vMime === "video/mp4" ? "mp4" : "webm"}` : null;
  if (video) await store.put(videoKey!, video, vMime!);
  // Yuz suratlari serverga saqlanmaydi (biometrik ma'lumot): faqat raqamli kamera hisoboti qoladi.
  const snaps: Buffer[] = [];
  const due = (await pool.query("SELECT due_at FROM cls_group_lessons WHERE group_id=$1 AND lesson_id=$2", [input.groupId, task.lesson_id])).rows[0]?.due_at;
  const late = !!due && new Date(due).getTime() < Date.now();
  await pool.query("UPDATE cls_submissions SET status='replaced' WHERE task_id=$1 AND group_id=$2 AND user_id=$3 AND status='submitted'", [task.id, input.groupId, input.userId]);
  await pool.query(
    `INSERT INTO cls_submissions(id,task_id,group_id,user_id,audio_key,audio_seconds,audio_mime,source,late,status,proctor,snapshots,video_key,video_mime,video_bytes,sampled)
     VALUES($1,$2,$3,$4,$5,$6,$7,'web',$8,'submitted',$9,$10,$11,$12,$13,$14)`,
    [id, task.id, input.groupId, input.userId, key, Math.round(input.seconds), audioMime, late, proctor ? JSON.stringify(proctor) : null, snaps.length, videoKey, vMime, video?.length ?? null, sampled ? JSON.stringify(sampled) : null],
  );
  let result: { accuracy: number; diff: DiffItem[] | null; pauses: number | null; final: number; score: number; judge: Judge | null } | null = null;
  try {
    const t = await transcriber(audio, audioMime);
    const clipSeconds = sampled ? sampled.clips.reduce((sum, [a, b]) => sum + Math.max(0, b - a), 0) : 0;
    const speak = task.mode === "speak";
    const cmp = speak ? { percent: 0, diff: null } : compareRecitation(task.text_ar, t.text);
    const lcs = speak ? speakFallback(t.text) : sampled ? compareSampled(task.text_ar, t.text, clipSeconds).percent : cmp.percent;
    let verdictAi: Judge | null = null;
    if (t.text.trim()) {
      if (speak) verdictAi = speakJudge ? await speakJudge([task.prompt_ar, task.prompt_uz].filter(Boolean).join("\n"), task.text_ar, t.text, !!sampled).catch(() => null) : null;
      else if (judge) verdictAi = await judge(task.text_ar, t.text, lcs, !!sampled).catch(() => null);
    }
    const accuracy = verdictAi ? verdictAi.percent : lcs;
    // Bo'laklarda to'xtalishni o'lchab bo'lmaydi; to'liq matn farqi ham ko'rsatilmaydi (bo'laklardan tashqarisi aytilmagan bo'lib chiqadi).
    const pauses = sampled || speak ? null : countPauses(t.words);
    const final = autoPercent(accuracy, pauses, verdict.warnings);
    const diff = sampled || speak ? null : cmp.diff;
    // O'qituvchi avval ko'rishi kerak bo'lganlar: o'tish chegarasiga yaqin yoki past ball, kamera ogohlantirishi.
    const flagged = !!video && (final < task.pass_percent + 10 || verdict.warnings > 0);
    result = { accuracy, diff, pauses, final, score: Math.round((task.max_score * final) / 100), judge: verdictAi };
    await pool.query(
      `UPDATE cls_submissions SET transcript=$2, ai_percent=$3, ai_diff=$4, pauses=$5, final_percent=$6, score=$7, ai_judge=$8, flagged=$9, status='graded', auto=true, graded_at=now() WHERE id=$1`,
      [id, t.text.slice(0, 10000), accuracy, diff ? JSON.stringify(diff) : null, pauses, final, result.score, verdictAi ? JSON.stringify(verdictAi) : null, flagged],
    );
  } catch {
    // AI vaqtincha ishlamasa — o'qituvchi navbatiga tushadi (zaxira yo'l).
    const staffIds = (await groupStaff(input.groupId)).map((x) => x.user_id);
    if (staffIds.length) await notifyUsers(staffIds, input.groupId, { title: "Vazifani qo‘lda tekshirish kerak", body: task.title, path: "tekshirish", ref: `review-${input.groupId}-${Math.floor(Date.now() / 900000)}` });
  }
  return {
    id,
    auto: !!result,
    aiPercent: result?.accuracy ?? null,
    finalPercent: result?.final ?? null,
    score: result?.score ?? null,
    maxScore: task.max_score,
    passed: result ? result.final >= task.pass_percent : null,
    passPercent: task.pass_percent,
    pauses: result?.pauses ?? null,
    warnings: verdict.warnings,
    late,
    diff: result?.diff ?? null,
    judge: result?.judge ?? null,
    attemptsLeft: test ? 99 : MAX_ATTEMPTS - used - 1,
    sampled: !!sampled,
    video: !!video,
  };
}

/** Videolarni saqlash muddati: almashtirilgan urinishlar — 7 kun, qolganlari baholangandan 60 kun keyin o'chiriladi (baho qoladi). */
let lastPrune = 0;
export async function pruneRecitationVideos(now = Date.now(), force = false) {
  if (!force && now - lastPrune < 6 * 3600 * 1000) return 0;
  lastPrune = now;
  const rows = (
    await pool.query(
      `SELECT id, video_key FROM cls_submissions WHERE video_key IS NOT NULL AND video_deleted_at IS NULL AND (
         (status IN ('replaced','rejected') AND created_at < $1::timestamptz - interval '7 days') OR
         (status='graded' AND COALESCE(graded_at,created_at) < $1::timestamptz - interval '60 days')) LIMIT 200`,
      [new Date(now).toISOString()],
    )
  ).rows;
  for (const r of rows) {
    try {
      await classStore().remove(r.video_key);
      await pool.query("UPDATE cls_submissions SET video_deleted_at=now() WHERE id=$1", [r.id]);
    } catch {
      // keyingi safar qayta urinadi
    }
  }
  return rows.length;
}

export function registerClassTasks(app: Express) {
  const P = "/api/platform/class";

  /* ---------- O'qituvchi: vazifalar ---------- */
  const taskSchema = z.object({
    title: z.string().trim().min(1).max(200),
    textAr: z.string().trim().min(1).max(5000),
    maxSeconds: z.number().int().min(10).max(300).default(120),
    maxScore: z.number().int().min(1).max(100).default(10),
    proctor: z.enum(["off", "warn", "required"]).default("required"),
    passPercent: z.number().int().min(10).max(100).default(80),
    shadow: z.boolean().default(false),
    video: z.boolean().default(false),
  });
  app.get(P + "/admin/lessons/:id/tasks", requireStaff, route(async (req) => {
    await needLesson(uuid.parse(req.params.id), userOf(req), "view");
    return { tasks: (await pool.query("SELECT * FROM cls_tasks WHERE lesson_id=$1 ORDER BY created_at", [uuid.parse(req.params.id)])).rows };
  }));
  app.post(P + "/admin/lessons/:id/tasks", requireStaff, route(async (req) => {
    await needLesson(uuid.parse(req.params.id), userOf(req));
    const b = taskSchema.parse(req.body);
    const t = (
      await pool.query(
        "INSERT INTO cls_tasks(lesson_id,kind,title,text_ar,max_seconds,max_score,proctor,pass_percent,shadow,video) SELECT $1,'recitation',$2,$3,$4,$5,$6,$7,$8,$9 WHERE EXISTS(SELECT 1 FROM cls_lessons WHERE id=$1) RETURNING *",
        [uuid.parse(req.params.id), b.title, b.textAr, b.maxSeconds, b.maxScore, b.proctor, b.passPercent, b.shadow, b.video],
      )
    ).rows[0];
    return t ? { task: t } : fail(404, "Dars topilmadi");
  }));
  app.patch(P + "/admin/tasks/:id", requireStaff, route(async (req) => {
    const t0 = (await pool.query("SELECT lesson_id FROM cls_tasks WHERE id=$1", [uuid.parse(req.params.id)])).rows[0] || fail(404, "Vazifa topilmadi");
    await needLesson(t0.lesson_id, userOf(req));
    const b = taskSchema.partial().parse(req.body);
    const t = (
      await pool.query(
        `UPDATE cls_tasks SET title=COALESCE($2,title), text_ar=COALESCE($3,text_ar), max_seconds=COALESCE($4,max_seconds), max_score=COALESCE($5,max_score),
                proctor=COALESCE($6,proctor), pass_percent=COALESCE($7,pass_percent), shadow=COALESCE($8,shadow), video=COALESCE($9,video) WHERE id=$1 RETURNING *`,
        [uuid.parse(req.params.id), b.title ?? null, b.textAr ?? null, b.maxSeconds ?? null, b.maxScore ?? null, b.proctor ?? null, b.passPercent ?? null, b.shadow ?? null, b.video ?? null],
      )
    ).rows[0];
    return t ? { task: t } : fail(404, "Vazifa topilmadi");
  }));
  app.delete(P + "/admin/tasks/:id", requireStaff, route(async (req) => {
    const id = uuid.parse(req.params.id);
    const t0 = (await pool.query("SELECT lesson_id FROM cls_tasks WHERE id=$1", [id])).rows[0] || fail(404, "Vazifa topilmadi");
    await needLesson(t0.lesson_id, userOf(req));
    if ((await pool.query("SELECT 1 FROM cls_submissions WHERE task_id=$1 AND status<>'rejected' LIMIT 1", [id])).rowCount) fail(409, "Bu vazifaga javoblar bor — o‘chirib bo‘lmaydi");
    await pool.query("DELETE FROM cls_tasks WHERE id=$1", [id]);
  }));

  /* ---------- O'quvchi: topshirish (faqat sayt) ---------- */
  app.post(P + "/groups/:id/tasks/:taskId/submit", requireAuth, route(async (req) => {
    const b = z
      .object({
        audio: z.string().min(100).max(11_000_000),
        mime: z.string().max(100),
        seconds: z.number().min(0.5).max(400),
        proctor: proctorSchema.nullable().optional(),
        snapshots: z.array(z.string().max(200_000)).max(4).optional().default([]),
        video: z.string().max(21_000_000).nullable().optional(),
        sampled: z.object({ total: z.number().min(0).max(400), clips: z.array(z.tuple([z.number().min(0).max(400), z.number().min(0).max(400)])).max(4) }).nullable().optional(),
      })
      .parse(req.body);
    const snapshots: Buffer[] = []; // eski mijozlar yuborsa ham saqlanmaydi
    return submitRecitation({
      groupId: uuid.parse(req.params.id),
      taskId: uuid.parse(req.params.taskId),
      userId: userOf(req),
      audio: Buffer.from(b.audio, "base64"),
      mime: b.mime,
      seconds: b.seconds,
      proctor: b.proctor ?? null,
      snapshots,
      video: b.video ? Buffer.from(b.video, "base64") : null,
      sampled: b.sampled ?? null,
    });
  }));
  const sendFile = (kind: "audio" | "snap") => async (req: Request, res: any, next: any) => {
    try {
      const id = uuid.parse(req.params.id), me = userOf(req);
      const s = (await pool.query("SELECT * FROM cls_submissions WHERE id=$1", [id])).rows[0];
      if (!s) return res.status(404).json({ message: "Topilmadi" });
      const { teacher } = await membership(s.group_id, me);
      if (!teacher && (kind === "snap" || s.user_id !== me)) return res.status(404).json({ message: "Topilmadi" });
      const n = kind === "snap" ? z.coerce.number().int().min(0).max(3).parse(req.params.n) : 0;
      const key = kind === "audio" ? s.audio_key : n < s.snapshots ? `class/snap/${s.group_id}/${s.id}-${n}.jpg` : null;
      const file = key ? await classStore().get(key) : null;
      if (!file) return res.status(404).json({ message: "Fayl topilmadi" });
      res.set({ "Content-Type": kind === "audio" ? s.audio_mime || file.mime : "image/jpeg", "Cache-Control": "private, max-age=3600", "Content-Length": String(file.data.length) });
      res.end(file.data);
    } catch (error) {
      if (error instanceof ClassError) return res.status(error.status).json({ message: error.message });
      next(error);
    }
  };
  /** Video: o'quvchi o'zinikini, o'qituvchi hammasini. Bucket bo'lsa — vaqtinchalik havola (fayl serverdan o'tmaydi, trafik bepul). */
  const videoAccess = async (req: Request) => {
    const id = uuid.parse(req.params.id), me = userOf(req);
    const s = (await pool.query("SELECT id,group_id,user_id,video_key,video_mime,video_deleted_at FROM cls_submissions WHERE id=$1", [id])).rows[0] || fail(404, "Topilmadi");
    const { teacher } = await membership(s.group_id, me);
    if (!teacher && s.user_id !== me) fail(404, "Topilmadi");
    if (!s.video_key) fail(404, "Bu topshiriqda video yo‘q");
    if (s.video_deleted_at) fail(410, "Video saqlash muddati tugagan (baho saqlangan)");
    return s;
  };
  app.get(P + "/submissions/:id/video", requireAuth, route(async (req) => {
    const s = await videoAccess(req);
    const store = classStore();
    return { url: store.url ? store.url(s.video_key, 3 * 3600) : `${P}/submissions/${s.id}/video-file`, mime: s.video_mime };
  }));
  app.get(P + "/submissions/:id/video-file", requireAuth, async (req, res, next) => {
    try {
      const s = await videoAccess(req);
      const file = await classStore().get(s.video_key);
      if (!file) return res.status(404).json({ message: "Fayl topilmadi" });
      res.set({ "Content-Type": s.video_mime || file.mime, "Cache-Control": "private, max-age=3600", "Content-Length": String(file.data.length) });
      res.end(file.data);
    } catch (error) {
      if (error instanceof ClassError) return res.status(error.status).json({ message: error.message });
      next(error);
    }
  });
  /** Audio: o'quvchi o'zinikini, o'qituvchi hammasini. Kamera suratlari faqat o'qituvchiga. */
  app.get(P + "/submissions/:id/audio", requireAuth, sendFile("audio"));
  app.get(P + "/submissions/:id/snap/:n", requireAuth, sendFile("snap"));

  /* ---------- O'qituvchi: natijalar (avtomatik baholangan) va zaxira navbati ---------- */
  app.get(P + "/groups/:id/review", requireAuth, route(async (req) => {
    const id = uuid.parse(req.params.id), me = userOf(req);
    const { teacher } = await membership(id, me);
    if (!teacher) fail(403, "Faqat o‘qituvchi uchun");
    const status = req.query.status === "graded" ? "graded" : req.query.status === "rejected" ? "rejected" : "submitted";
    const rows = (
      await pool.query(
        `SELECT s.id, s.user_id, COALESCE(NULLIF(m.display_name,''),u.full_name) AS name, s.audio_seconds, s.transcript, s.ai_percent, s.ai_diff, s.final_percent, s.pauses,
                s.proctor, s.snapshots, s.auto, s.score, s.comment, s.status, s.late, s.source, s.created_at, s.flagged, (s.sampled IS NOT NULL) AS sampled,
                (s.video_key IS NOT NULL AND s.video_deleted_at IS NULL) AS video, (s.video_deleted_at IS NOT NULL) AS video_expired, t.id AS task_id, t.title, t.text_ar, t.max_score, t.pass_percent, l.title AS lesson_title
           FROM cls_submissions s JOIN cls_tasks t ON t.id=s.task_id JOIN cls_lessons l ON l.id=t.lesson_id
           JOIN users u ON u.id=s.user_id LEFT JOIN cls_members m ON m.group_id=s.group_id AND m.user_id=s.user_id
          WHERE s.group_id=$1 AND s.status=$2 ORDER BY ${status === "submitted" ? "s.created_at" : status === "graded" ? "(s.flagged AND s.auto) DESC, s.created_at DESC" : "s.created_at DESC"} LIMIT 100`,
        [id, status],
      )
    ).rows;
    return {
      items: rows.map((r: any) => ({ ...r, suggested: r.final_percent === null ? (r.ai_percent === null ? null : Math.round((r.max_score * r.ai_percent) / 100)) : r.score })),
      waiting: (await pool.query("SELECT count(*)::int AS n FROM cls_submissions WHERE group_id=$1 AND status='submitted'", [id])).rows[0].n,
      flagged: (await pool.query("SELECT count(*)::int AS n FROM cls_submissions WHERE group_id=$1 AND status='graded' AND flagged AND auto", [id])).rows[0].n,
    };
  }));
  app.post(P + "/submissions/:id/grade", requireAuth, route(async (req) => {
    const id = uuid.parse(req.params.id), me = userOf(req);
    const b = z.object({ score: z.number().int().min(0).max(100), comment: z.string().trim().max(1000).optional().default("") }).parse(req.body);
    const s = (await pool.query("SELECT s.*, t.max_score, t.title FROM cls_submissions s JOIN cls_tasks t ON t.id=s.task_id WHERE s.id=$1", [id])).rows[0] || fail(404, "Topilmadi");
    const { manage } = await membership(s.group_id, me);
    if (!manage) fail(403, "Bahoni faqat o‘qituvchi o‘zgartiradi");
    if (s.status === "rejected" || s.status === "replaced") fail(409, "Bu yozuvni baholab bo‘lmaydi");
    if (b.score > s.max_score) fail(400, `Ball ${s.max_score} dan oshmasin`);
    await pool.query("UPDATE cls_submissions SET score=$2, comment=$3, status='graded', auto=false, flagged=false, graded_at=now() WHERE id=$1", [id, b.score, b.comment]);
    await notifyUsers([s.user_id], s.group_id, { title: "O‘qituvchi bahoni tasdiqladi", body: `${s.title}: ${b.score}/${s.max_score}${b.comment ? " — " + b.comment.slice(0, 80) : ""}`, path: "natijalar", ref: `graded-${id}-${Date.now()}` });
    return { ok: true };
  }));
}
