// "Mini-testlar": ob-havo loyihasidagi haftalik tinglash/o'qish testlari.
// Testlar bepul va ochiq; natija o'quvchi qurilmasida saqlanadi. To'g'ri javoblar brauzerga
// oldindan yuborilmaydi: har bir javob shu yerda tekshiriladi.
import type { Express, Response } from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import { pool } from "./db";
import { requireAuth } from "./auth";

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
      void recordNewTests(tests).catch(() => console.error("Mini-test notification sync failed"));
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
  registerMiniFolders(app);
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

/* ---------- Kabinet papkalari va yangi test bildirishnomasi ---------- */

/** Papka: hammasi, faqat tur, faqat daraja yoki daraja+tur. */
export const folderSchema = z
  .string()
  .regex(/^(?:all|listening|reading|(?:A1A2|B1B2)(?:-(?:listening|reading))?)$/);
export function folderMatches(folder: string, t: { type: string; level: string }) {
  if (folder === "all") return true;
  const [a, b] = folder.split("-");
  if (a === "listening" || a === "reading") return t.type === a;
  return t.level === a && (!b || t.type === b);
}
const levelName: Record<string, string> = { A1A2: "A1/A2", B1B2: "B1/B2" };
const typeName: Record<string, string> = { listening: "Tinglash", reading: "O‘qish" };
export function folderTitle(folder: string) {
  if (folder === "all") return "Barcha mini-testlar";
  const [a, b] = folder.split("-");
  if (typeName[a]) return typeName[a];
  return [levelName[a], b && typeName[b]].filter(Boolean).join(" · ");
}

/**
 * Yangi kelgan testlarni yozib boradi va papkasi mos o'quvchilarga Telegram xabarini navbatga qo'yadi.
 * Birinchi ishga tushganda mavjud testlar "eski" hisoblanadi — hech kimga ommaviy xabar ketmaydi.
 */
export async function recordNewTests(tests: Summary[]) {
  if (!tests.length) return [];
  const before = (await pool.query("SELECT count(*)::int AS n FROM mini_known_tests")).rows[0].n;
  const inserted: { test_id: string; test_type: string; level: string; title_uz: string }[] = [];
  for (const t of tests) {
    const r = await pool.query(
      "INSERT INTO mini_known_tests(test_id,test_type,level,title_uz) VALUES($1,$2,$3,$4) ON CONFLICT(test_id) DO NOTHING RETURNING test_id,test_type,level,title_uz",
      [t.id, t.type, t.level, t.titleUz.slice(0, 200)],
    );
    if (r.rows[0]) inserted.push(r.rows[0]);
  }
  if (!before || !inserted.length) return [];
  const subscribers = (
    await pool.query(
      "SELECT f.user_id,array_agg(f.folder) AS folders FROM mini_folders f JOIN telegram_bot_links l ON l.user_id=f.user_id JOIN users u ON u.id=f.user_id WHERE u.is_active IS NOT FALSE GROUP BY f.user_id",
    )
  ).rows;
  const batch = createHash("sha256")
    .update(inserted.map((t) => t.test_id).sort().join(","))
    .digest("hex")
    .slice(0, 16);
  for (const s of subscribers) {
    const matched = inserted.filter((t) =>
      (s.folders as string[]).some((f) => folderMatches(f, { type: t.test_type, level: t.level })),
    );
    if (!matched.length) continue;
    await pool.query(
      "INSERT INTO notification_outbox(kind,reference_id,payload) VALUES('mini_new_tests',$1,$2) ON CONFLICT(kind,reference_id) DO NOTHING",
      [
        s.user_id + ":" + batch,
        JSON.stringify({
          userId: s.user_id,
          tests: matched.slice(0, 10).map((t) => ({ title: t.title_uz, type: t.test_type, level: t.level })),
          count: matched.length,
        }),
      ],
    );
  }
  return inserted;
}

export function registerMiniFolders(app: Express) {
  app.get("/api/platform/mini/folders", requireAuth, async (req, res) => {
    try {
      const tests = await list().catch(() => [] as Summary[]);
      const ids = new Set(tests.map((t) => t.id));
      const folders = (
        await pool.query("SELECT folder,last_seen_at,created_at FROM mini_folders WHERE user_id=$1 ORDER BY created_at", [
          req.session.userId,
        ])
      ).rows;
      const known = (
        await pool.query(
          "SELECT test_id,test_type,level,first_seen_at FROM mini_known_tests WHERE first_seen_at > (SELECT min(last_seen_at) FROM mini_folders WHERE user_id=$1)",
          [req.session.userId],
        )
      ).rows.filter((k: any) => ids.has(k.test_id));
      const result = folders.map((f: any) => {
        const match = (t: { type: string; level: string }) => folderMatches(f.folder, t);
        const fresh = known
          .filter((k: any) => k.first_seen_at > f.last_seen_at && match({ type: k.test_type, level: k.level }))
          .map((k: any) => k.test_id);
        return {
          folder: f.folder,
          title: folderTitle(f.folder),
          total: tests.filter(match).length,
          fresh: fresh.length,
          freshIds: fresh,
          addedAt: f.created_at,
        };
      });
      const telegram = (await pool.query("SELECT 1 FROM telegram_bot_links WHERE user_id=$1", [req.session.userId])).rowCount;
      res.set("Cache-Control", "no-store");
      res.json({
        folders: result,
        fresh: new Set(result.flatMap((f: any) => f.freshIds)).size,
        telegramLinked: Boolean(telegram),
      });
    } catch (error) {
      sendError(res, error);
    }
  });
  app.post("/api/platform/mini/folders", requireAuth, async (req, res) => {
    try {
      const folder = folderSchema.parse(req.body?.folder);
      const count = (await pool.query("SELECT count(*)::int AS n FROM mini_folders WHERE user_id=$1", [req.session.userId])).rows[0].n;
      if (count >= 12) return res.status(409).json({ message: "Papkalar soni chegarasiga yetdi" });
      await pool.query(
        "INSERT INTO mini_folders(user_id,folder) VALUES($1,$2) ON CONFLICT(user_id,folder) DO NOTHING",
        [req.session.userId, folder],
      );
      res.json({ folder, title: folderTitle(folder) });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Papka noto‘g‘ri" });
      sendError(res, error);
    }
  });
  app.post("/api/platform/mini/folders/:folder/seen", requireAuth, async (req, res) => {
    try {
      const folder = folderSchema.parse(req.params.folder);
      await pool.query("UPDATE mini_folders SET last_seen_at=now() WHERE user_id=$1 AND folder=$2", [req.session.userId, folder]);
      res.json({ ok: true });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Papka noto‘g‘ri" });
      sendError(res, error);
    }
  });
  app.delete("/api/platform/mini/folders/:folder", requireAuth, async (req, res) => {
    try {
      const folder = folderSchema.parse(req.params.folder);
      await pool.query("DELETE FROM mini_folders WHERE user_id=$1 AND folder=$2", [req.session.userId, folder]);
      res.json({ ok: true });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Papka noto‘g‘ri" });
      sendError(res, error);
    }
  });

  // Yangi testlarni muntazam tekshirish (ro'yxat keshi 5 daqiqa; shu oraliqda manbadan yangilanadi).
  if (process.env.NODE_ENV !== "test") {
    const tick = () => void list().catch(() => undefined);
    const first = setTimeout(tick, 15000);
    first.unref();
    const timer = setInterval(tick, 10 * 60_000);
    timer.unref();
  }
}

/** Testlar uchun: keshni tozalash. */
export function resetMiniTestCache() {
  listCache = null;
  testCache.clear();
  audioCache.clear();
}
