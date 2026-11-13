// "Mini-testlar": ob-havo loyihasidagi haftalik tinglash/o'qish testlari.
// Testlar bepul va ochiq; natija o'quvchi qurilmasida saqlanadi. To'g'ri javoblar brauzerga
// oldindan yuborilmaydi: har bir javob shu yerda tekshiriladi.
import type { Express, Response } from "express";
import { z } from "zod";

const LIST_TTL = 5 * 60_000;
const TEST_TTL = 60 * 60_000;
const AUDIO_CACHE_ITEMS = 12;
const TEST_CACHE_ITEMS = 300;
const idSchema = z.string().regex(/^[0-9a-zA-Z-]{1,64}$/);

const source = () => ({
  url: (process.env.PLATFORM_OBHAVO_URL || "https://web-production-d1f0.up.railway.app").replace(/\/$/, ""),
  key: process.env.PLATFORM_OBHAVO_SECRET || "",
});
const fail = (status: number, message: string): never => {
  throw Object.assign(new Error(message), { status });
};

async function upstream(path: string, secret = true, timeout = 15000) {
  const { url, key } = source();
  if (secret && key.length < 32) fail(503, "Mini-testlar hali ulanmagan");
  const response = await fetch(url + path, {
    headers: secret ? { "x-platform-key": key } : {},
    signal: AbortSignal.timeout(timeout),
    redirect: "error",
  });
  if (response.status === 404) fail(404, "Test topilmadi");
  if (!response.ok) fail(503, "Mini-testlar vaqtincha ishlamayapti");
  return response;
}

type Summary = {
  id: string;
  type: "listening" | "reading";
  level: string;
  titleAr: string;
  titleUz: string;
  testDate: string;
  createdAt: string | null;
  hasAudio: boolean;
};
let listCache: { at: number; tests: Summary[] } | null = null;
let listLoading: Promise<Summary[]> | null = null;
const testCache = new Map<string, { at: number; test: any }>();
const audioCache = new Map<string, { type: string; body: Buffer }>();

/** Toshkent vaqti bo'yicha hafta boshi (dushanba), YYYY-MM-DD. */
export function weekStart(date: string) {
  const d = new Date(date + "T12:00:00+05:00");
  if (Number.isNaN(d.getTime())) return "";
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

async function list(): Promise<Summary[]> {
  if (listCache && Date.now() - listCache.at < LIST_TTL) return listCache.tests;
  listLoading ||= (async () => {
    try {
      const data: any = await (await upstream("/api/platform/mini-tests")).json();
      const tests: Summary[] = (Array.isArray(data?.tests) ? data.tests : [])
        .filter((t: any) => idSchema.safeParse(t?.id).success && /^\d{4}-\d{2}-\d{2}$/.test(t.testDate))
        .map((t: any) => ({
          id: t.id,
          type: t.type === "listening" ? "listening" : "reading",
          level: t.level === "B1B2" ? "B1B2" : "A1A2",
          titleAr: String(t.titleAr || ""),
          titleUz: String(t.titleUz || ""),
          testDate: t.testDate,
          createdAt: t.createdAt || null,
          hasAudio: t.hasAudio === true,
        }));
      listCache = { at: Date.now(), tests };
      return tests;
    } catch (error) {
      // Manba vaqtincha ishlamasa, oxirgi ma'lum ro'yxat ko'rsatilaveradi.
      if (listCache) return listCache.tests;
      throw error;
    } finally {
      listLoading = null;
    }
  })();
  return listLoading;
}

async function fullTest(id: string) {
  const hit = testCache.get(id);
  if (hit && Date.now() - hit.at < TEST_TTL) return hit.test;
  const data: any = await (await upstream("/api/platform/mini-tests/" + encodeURIComponent(id))).json();
  const test = data?.test;
  if (!test || !Array.isArray(test.questions) || !test.questions.length) fail(404, "Test topilmadi");
  testCache.delete(id);
  testCache.set(id, { at: Date.now(), test });
  while (testCache.size > TEST_CACHE_ITEMS) testCache.delete(testCache.keys().next().value!);
  return test;
}

/** O'quvchiga yuboriladigan ko'rinish: to'g'ri javob va izohsiz. */
export function publicTest(test: any) {
  const { questions, ...rest } = test;
  return {
    ...rest,
    questions: questions.map((q: any) => ({ question: q.question, options: q.options, type: q.type })),
  };
}

const sendError = (res: Response, error: any) =>
  res.status(error?.status || 503).json({ message: error?.status ? error.message : "Mini-testlar vaqtincha ishlamayapti" });

export function registerMiniTests(app: Express) {
  app.get("/api/platform/mini/tests", async (_req, res) => {
    try {
      const tests = await list();
      const weeks = tests.map((t) => weekStart(t.testDate)).filter(Boolean).sort();
      const latestWeek = weeks.at(-1) || null;
      res.set("Cache-Control", "public, max-age=60");
      res.json({
        latestWeek,
        tests: tests.map((t) => ({ ...t, week: weekStart(t.testDate), isNew: weekStart(t.testDate) === latestWeek })),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/platform/mini/tests/:id", async (req, res) => {
    try {
      const id = idSchema.parse(req.params.id);
      const test = await fullTest(id);
      res.set("Cache-Control", "public, max-age=300");
      res.json({ test: publicTest(test) });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(404).json({ message: "Test topilmadi" });
      sendError(res, error);
    }
  });

  app.post("/api/platform/mini/tests/:id/check", async (req, res) => {
    try {
      const id = idSchema.parse(req.params.id);
      const body = z
        .object({ question: z.number().int().min(0).max(50), choice: z.number().int().min(0).max(10) })
        .parse(req.body || {});
      const test = await fullTest(id);
      const q = test.questions[body.question];
      if (!q || body.choice >= q.options.length) return res.status(400).json({ message: "Javob noto‘g‘ri yuborildi" });
      res.set("Cache-Control", "no-store");
      res.json({ correct: q.correctIndex === body.choice, correctIndex: q.correctIndex, explanation: q.explanation || "" });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Javob noto‘g‘ri yuborildi" });
      sendError(res, error);
    }
  });

  // Audio faqat tayyor bo'lsa beriladi: bu so'rov hech qachon yangi (pullik) ovoz yaratishni boshlamaydi.
  app.get("/api/platform/mini/tests/:id/audio", async (req, res) => {
    try {
      const id = idSchema.parse(req.params.id);
      const summary = (await list()).find((t) => t.id === id);
      if (!summary || summary.type !== "listening" || !summary.hasAudio)
        return res.status(404).json({ message: "Audio topilmadi" });
      let item = audioCache.get(id);
      if (!item) {
        const response = await upstream("/api/tests/" + encodeURIComponent(id) + "/audio", false, 30000);
        item = { type: response.headers.get("content-type") || "audio/mpeg", body: Buffer.from(await response.arrayBuffer()) };
        audioCache.set(id, item);
        while (audioCache.size > AUDIO_CACHE_ITEMS) audioCache.delete(audioCache.keys().next().value!);
      } else {
        audioCache.delete(id);
        audioCache.set(id, item);
      }
      res.set({ "Content-Type": item.type, "Cache-Control": "public, max-age=86400", "Accept-Ranges": "none" });
      res.send(item.body);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(404).json({ message: "Audio topilmadi" });
      sendError(res, error);
    }
  });

  app.get("/api/platform/mini/tests/:id/download/:format", async (req, res) => {
    try {
      const id = idSchema.parse(req.params.id);
      const format = z.enum(["pdf", "docx", "mp3"]).parse(req.params.format);
      const summary = (await list()).find((t) => t.id === id);
      if (!summary) return res.status(404).json({ message: "Test topilmadi" });
      if (format === "mp3" && (summary.type !== "listening" || !summary.hasAudio))
        return res.status(404).json({ message: "Audio topilmadi" });
      const response = await upstream(
        "/api/tests/" + encodeURIComponent(id) + "/" + (format === "mp3" ? "audio" : format),
        false,
        60000,
      );
      const type = response.headers.get("content-type");
      if (type) res.set("Content-Type", type);
      const disposition = response.headers.get("content-disposition");
      res.set("Content-Disposition", disposition || "attachment");
      res.set("Cache-Control", "private, max-age=3600");
      res.send(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(404).json({ message: "Fayl topilmadi" });
      sendError(res, error);
    }
  });
}

/** Testlar uchun: keshni tozalash. */
export function resetMiniTestCache() {
  listCache = null;
  testCache.clear();
  audioCache.clear();
}
