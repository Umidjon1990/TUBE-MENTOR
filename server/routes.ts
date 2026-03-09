import type { Express } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { pool } from "./db";
import { verifyPassword, requireAdmin, requireAuth, hashPassword } from "./auth";
import { z } from "zod";
import { tryExtractTranscript, processManualTranscript, getDemoTranscript } from "./services/transcript";
import { generateLessonContent } from "./services/ai-generator";

const createUserSchema = z.object({
  fullName: z.string().min(2, "Ism kamida 2 ta belgidan iborat bo'lishi kerak"),
  username: z.string().min(3, "Login kamida 3 ta belgidan iborat bo'lishi kerak").regex(/^[a-zA-Z0-9_]+$/, "Login faqat harf, raqam va _ belgisidan iborat bo'lishi kerak"),
  password: z.string().min(6, "Parol kamida 6 ta belgidan iborat bo'lishi kerak"),
  role: z.enum(["admin", "teacher", "student"]),
  coins: z.number().int().min(0).optional(),
});

const updateUserSchema = z.object({
  fullName: z.string().min(2).optional(),
  username: z.string().min(3).regex(/^[a-zA-Z0-9_]+$/).optional(),
  role: z.enum(["admin", "teacher", "student"]).optional(),
  isActive: z.boolean().optional(),
});

const changePasswordSchema = z.object({
  newPassword: z.string().min(6, "Parol kamida 6 ta belgidan iborat bo'lishi kerak"),
});

const updateCoinsSchema = z.object({
  amount: z.number().int().min(1, "Miqdor kamida 1 bo'lishi kerak"),
  type: z.enum(["add", "remove"]),
  description: z.string().min(1, "Izoh kiritilishi shart"),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get("/api/health", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({ status: "ok", name: "Tube Mentor AI", version: "1.0.0", database: "connected" });
    } catch {
      res.status(503).json({ status: "error", name: "Tube Mentor AI", version: "1.0.0", database: "disconnected" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: "Login va parol kiritilishi shart" });
    }

    const user = await storage.getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ message: "Noto'g'ri login yoki parol" });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: "Hisob bloklangan" });
    }

    if (!verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ message: "Noto'g'ri login yoki parol" });
    }

    await storage.updateUser(user.id, { lastLoginAt: new Date() });

    req.session.regenerate((err) => {
      if (err) {
        return res.status(500).json({ message: "Tizimda xatolik yuz berdi" });
      }
      req.session.userId = user.id;
      req.session.userRole = user.role;
      req.session.save((saveErr) => {
        if (saveErr) {
          return res.status(500).json({ message: "Tizimda xatolik yuz berdi" });
        }
        const { passwordHash, ...safeUser } = user;
        res.json(safeUser);
      });
    });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Chiqishda xatolik yuz berdi" });
      }
      res.clearCookie("connect.sid");
      res.json({ message: "Muvaffaqiyatli chiqildi" });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Avtorizatsiya talab qilinadi" });
    }

    const user = await storage.getUser(req.session.userId);
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ message: "Foydalanuvchi topilmadi" });
    }

    if (!user.isActive) {
      req.session.destroy(() => {});
      return res.status(403).json({ message: "Hisob bloklangan" });
    }

    const { passwordHash, ...safeUser } = user;
    res.json(safeUser);
  });

  app.get("/api/admin/users", requireAdmin, async (_req, res) => {
    const allUsers = await storage.getAllUsers();
    const safeUsers = allUsers.map(({ passwordHash, ...u }) => u);
    res.json(safeUsers);
  });

  app.get("/api/admin/users/:id", requireAdmin, async (req, res) => {
    const id = req.params.id as string;
    const user = await storage.getUser(id);
    if (!user) {
      return res.status(404).json({ message: "Foydalanuvchi topilmadi" });
    }
    const { passwordHash, ...safeUser } = user;
    res.json(safeUser);
  });

  app.post("/api/admin/users", requireAdmin, async (req, res) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }

    const { fullName, username, password, role, coins } = parsed.data;

    const existing = await storage.getUserByUsername(username);
    if (existing) {
      return res.status(409).json({ message: "Bu login allaqachon mavjud" });
    }

    const passwordHashed = hashPassword(password);
    const newUser = await storage.createUser({
      fullName,
      username,
      passwordHash: passwordHashed,
      role,
    });

    if (coins && coins > 0) {
      await storage.adjustCoinsAtomically(newUser.id, coins, {
        userId: newUser.id,
        amount: coins,
        type: "admin_add",
        description: "Boshlang'ich tanga — admin tomonidan",
      });
    }

    const updatedUser = await storage.getUser(newUser.id);
    const { passwordHash, ...safeUser } = updatedUser!;
    res.status(201).json(safeUser);
  });

  app.patch("/api/admin/users/:id", requireAdmin, async (req, res) => {
    const id = req.params.id as string;
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }

    const targetUser = await storage.getUser(id);
    if (!targetUser) {
      return res.status(404).json({ message: "Foydalanuvchi topilmadi" });
    }

    if (parsed.data.username && parsed.data.username !== targetUser.username) {
      const existing = await storage.getUserByUsername(parsed.data.username);
      if (existing) {
        return res.status(409).json({ message: "Bu login allaqachon mavjud" });
      }
    }

    const updated = await storage.updateUser(id, parsed.data);
    if (!updated) {
      return res.status(500).json({ message: "Yangilanishda xatolik" });
    }

    const { passwordHash, ...safeUser } = updated;
    res.json(safeUser);
  });

  app.patch("/api/admin/users/:id/status", requireAdmin, async (req, res) => {
    const id = req.params.id as string;
    const { isActive } = req.body;
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ message: "isActive maydoni talab qilinadi" });
    }

    if (id === req.session.userId && !isActive) {
      return res.status(400).json({ message: "O'zingizni bloklashning iloji yo'q" });
    }

    const updated = await storage.updateUser(id, { isActive });
    if (!updated) {
      return res.status(404).json({ message: "Foydalanuvchi topilmadi" });
    }

    const { passwordHash, ...safeUser } = updated;
    res.json(safeUser);
  });

  app.patch("/api/admin/users/:id/password", requireAdmin, async (req, res) => {
    const id = req.params.id as string;
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }

    const targetUser = await storage.getUser(id);
    if (!targetUser) {
      return res.status(404).json({ message: "Foydalanuvchi topilmadi" });
    }

    const newHash = hashPassword(parsed.data.newPassword);
    await storage.updateUser(id, { passwordHash: newHash });
    res.json({ message: "Parol muvaffaqiyatli yangilandi" });
  });

  app.post("/api/admin/users/:id/coins", requireAdmin, async (req, res) => {
    const id = req.params.id as string;
    const parsed = updateCoinsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }

    const targetUser = await storage.getUser(id);
    if (!targetUser) {
      return res.status(404).json({ message: "Foydalanuvchi topilmadi" });
    }

    const { amount, type, description } = parsed.data;
    const coinChange = type === "add" ? amount : -amount;

    try {
      const updated = await storage.adjustCoinsAtomically(id, coinChange, {
        userId: id,
        amount: coinChange,
        type: type === "add" ? "admin_add" : "admin_remove",
        description,
      });
      const { passwordHash, ...safeUser } = updated;
      res.json(safeUser);
    } catch (err: any) {
      if (err.message === "INSUFFICIENT_BALANCE") {
        return res.status(400).json({ message: `Yetarli tanga mavjud emas. Joriy balans: ${targetUser.coins}` });
      }
      throw err;
    }
  });

  app.get("/api/admin/users/:id/coins", requireAdmin, async (req, res) => {
    const id = req.params.id as string;
    const targetUser = await storage.getUser(id);
    if (!targetUser) {
      return res.status(404).json({ message: "Foydalanuvchi topilmadi" });
    }

    const transactions = await storage.getCoinTransactionsByUser(id);
    res.json({
      balance: targetUser.coins,
      transactions: transactions.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    });
  });

  // ─── Admin — Lesson Management ───
  async function resolveTagNames(lessonId: number) {
    const lessonTagRows = await storage.getTagsByLesson(lessonId);
    const allTags = await storage.getAllTags();
    return lessonTagRows.map(lt => allTags.find(t => t.id === lt.tagId)).filter(Boolean);
  }

  app.get("/api/admin/lessons", requireAdmin, async (_req, res) => {
    const allLessons = await storage.getAllLessons();
    const allTags = await storage.getAllTags();
    const lessonsWithCreator = await Promise.all(
      allLessons.map(async (lesson) => {
        const creator = lesson.createdBy ? await storage.getUser(lesson.createdBy) : null;
        const lessonTagRows = await storage.getTagsByLesson(lesson.id);
        const tags = lessonTagRows.map(lt => allTags.find(t => t.id === lt.tagId)).filter(Boolean);
        return {
          ...lesson,
          creatorName: creator?.fullName || "Noma'lum",
          creatorUsername: creator?.username || "",
          tags,
        };
      })
    );
    res.json(lessonsWithCreator.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ));
  });

  app.get("/api/admin/lessons/:id", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Noto'g'ri ID" });
    const lesson = await storage.getLessonById(id);
    if (!lesson) return res.status(404).json({ message: "Dars topilmadi" });
    const creator = lesson.createdBy ? await storage.getUser(lesson.createdBy) : null;
    const tags = await resolveTagNames(id);
    const categories = await storage.getAllCategories();
    const allTags = await storage.getAllTags();
    res.json({
      ...lesson,
      creatorName: creator?.fullName || "Noma'lum",
      creatorUsername: creator?.username || "",
      tags,
      allCategories: categories,
      allTags,
    });
  });

  app.patch("/api/admin/lessons/:id/approve", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Noto'g'ri ID" });
    const lesson = await storage.getLessonById(id);
    if (!lesson) return res.status(404).json({ message: "Dars topilmadi" });
    const updated = await storage.updateLesson(id, {
      status: "approved",
      approvedBy: req.session.userId,
      approvedAt: new Date(),
      moderationNote: req.body.moderationNote || lesson.moderationNote,
    });
    res.json(updated);
  });

  app.patch("/api/admin/lessons/:id/reject", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Noto'g'ri ID" });
    const lesson = await storage.getLessonById(id);
    if (!lesson) return res.status(404).json({ message: "Dars topilmadi" });
    const { moderationNote } = req.body;
    if (!moderationNote) return res.status(400).json({ message: "Rad etish sababi majburiy" });
    const updated = await storage.updateLesson(id, {
      status: "rejected",
      moderationNote,
    });
    res.json(updated);
  });

  app.patch("/api/admin/lessons/:id/publish", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Noto'g'ri ID" });
    const lesson = await storage.getLessonById(id);
    if (!lesson) return res.status(404).json({ message: "Dars topilmadi" });
    if (lesson.status !== "approved") return res.status(400).json({ message: "Faqat tasdiqlangan darslar e'lon qilinishi mumkin" });
    const updated = await storage.updateLesson(id, {
      status: "published",
      publishedBy: req.session.userId,
      publishedAt: new Date(),
    });
    res.json(updated);
  });

  app.patch("/api/admin/lessons/:id/unpublish", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Noto'g'ri ID" });
    const lesson = await storage.getLessonById(id);
    if (!lesson) return res.status(404).json({ message: "Dars topilmadi" });
    if (lesson.status !== "published") return res.status(400).json({ message: "Faqat e'lon qilingan darslar o'chirilishi mumkin" });
    const updated = await storage.updateLesson(id, {
      status: "approved",
      publishedAt: null,
      publishedBy: null,
    });
    res.json(updated);
  });

  app.patch("/api/admin/lessons/:id", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Noto'g'ri ID" });
    const lesson = await storage.getLessonById(id);
    if (!lesson) return res.status(404).json({ message: "Dars topilmadi" });
    const { moderationNote, isFeatured, categoryId } = req.body;
    const updateData: Record<string, unknown> = {};
    if (moderationNote !== undefined) updateData.moderationNote = moderationNote;
    if (isFeatured !== undefined) updateData.isFeatured = isFeatured;
    if (categoryId !== undefined) updateData.categoryId = categoryId;
    const updated = await storage.updateLesson(id, updateData);
    res.json(updated);
  });

  app.put("/api/admin/lessons/:id/tags", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Noto'g'ri ID" });
    const lesson = await storage.getLessonById(id);
    if (!lesson) return res.status(404).json({ message: "Dars topilmadi" });
    const { tagIds } = req.body;
    if (!Array.isArray(tagIds)) return res.status(400).json({ message: "tagIds massiv bo'lishi kerak" });
    const currentTags = await storage.getTagsByLesson(id);
    for (const t of currentTags) {
      if (!tagIds.includes(t.tagId)) await storage.deleteLessonTag(id, t.tagId);
    }
    for (const tid of tagIds) {
      if (!currentTags.find(t => t.tagId === tid)) await storage.createLessonTag(id, tid);
    }
    const updatedTags = await resolveTagNames(id);
    res.json(updatedTags);
  });

  app.delete("/api/admin/lessons/:id", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Noto'g'ri ID" });
    const lesson = await storage.getLessonById(id);
    if (!lesson) return res.status(404).json({ message: "Dars topilmadi" });
    await storage.deleteLesson(id);
    res.json({ success: true });
  });

  app.get("/api/user/progress", requireAuth, async (req, res) => {
    const progress = await storage.getProgressByUser(req.session.userId!);
    res.json(progress);
  });

  app.get("/api/user/dashboard", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const [user, lessonCount, flashcardCount, userLessons, progress, coinTxs] = await Promise.all([
      storage.getUser(userId),
      storage.countLessonsByUser(userId),
      storage.countFlashcardsByUser(userId),
      storage.getLessonsByUser(userId),
      storage.getProgressByUser(userId),
      storage.getCoinTransactionsByUser(userId),
    ]);

    const pendingCount = userLessons.filter(l => l.status === "pending").length;
    const totalStudyTime = progress.reduce((sum, p) => sum + (p.studyTimeSeconds ?? 0), 0);
    const learnedWords = progress.reduce((sum, p) => sum + (p.learnedWords ?? 0), 0);

    const recentLessons = userLessons
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);

    const recentTransactions = coinTxs
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);

    res.json({
      coins: user?.coins ?? 0,
      lessonCount,
      flashcardCount,
      pendingCount,
      totalStudyTime,
      learnedWords,
      recentLessons,
      recentTransactions,
    });
  });

  app.get("/api/user/lessons", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const userLessons = await storage.getLessonsByUser(userId);
    res.json(userLessons);
  });

  const createLessonSchema = z.object({
    youtubeUrl: z.string().min(1, "YouTube havolasi kiritilishi shart").refine((url) => {
      const pattern = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|shorts\/)|youtu\.be\/)[a-zA-Z0-9_-]{11}/;
      return pattern.test(url);
    }, "Noto'g'ri YouTube havolasi"),
    title: z.string().optional(),
    categoryId: z.number().int().positive().optional(),
    tagIds: z.array(z.number().int().positive()).optional(),
    level: z.enum(["beginner", "intermediate", "advanced"]),
  });

  const LESSON_COST = 10;

  app.post("/api/user/lessons", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const parsed = createLessonSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }

    const { youtubeUrl, title, categoryId, tagIds, level } = parsed.data;

    const videoIdMatch = youtubeUrl.match(/(?:v=|embed\/|shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    const videoId = videoIdMatch?.[1] ?? "";
    const thumbnailUrl = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : undefined;
    const lessonTitle = title || `YouTube dars — ${videoId}`;

    try {
      const result = await storage.createLessonWithCoinDeduction(
        userId,
        LESSON_COST,
        {
          title: lessonTitle,
          youtubeUrl,
          thumbnailUrl,
          level,
          status: "pending",
          categoryId: categoryId ?? null,
          createdBy: userId,
        },
        tagIds ?? [],
        `Dars yaratish: ${lessonTitle}`
      );

      res.status(201).json(result);
    } catch (err: any) {
      if (err.message === "INSUFFICIENT_BALANCE") {
        return res.status(400).json({ message: `Bu amal uchun coin yetarli emas. Dars narxi: ${LESSON_COST} coin` });
      }
      throw err;
    }
  });

  app.get("/api/user/lessons/:id", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Noto'g'ri dars ID" });

    const lesson = await storage.getLessonById(id);
    if (!lesson) return res.status(404).json({ message: "Dars topilmadi" });
    if (lesson.createdBy !== req.session.userId) return res.status(403).json({ message: "Ruxsat yo'q" });

    res.json(lesson);
  });

  app.post("/api/user/lessons/:id/transcript", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Noto'g'ri dars ID" });

    const lesson = await storage.getLessonById(id);
    if (!lesson) return res.status(404).json({ message: "Dars topilmadi" });
    if (lesson.createdBy !== req.session.userId) return res.status(403).json({ message: "Ruxsat yo'q" });

    const { mode, manualText } = req.body;

    if (mode === "auto") {
      const videoIdMatch = lesson.youtubeUrl?.match(/(?:v=|embed\/|shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      const videoId = videoIdMatch?.[1];
      if (!videoId) return res.status(400).json({ message: "YouTube video ID topilmadi" });

      const result = await tryExtractTranscript(videoId);
      if (!result) {
        return res.json({ success: false, message: "Bu videoda subtitle topilmadi" });
      }

      await storage.updateLesson(id, {
        transcript: result.text,
        transcriptSource: result.source,
      });

      return res.json({ success: true, transcript: result });
    }

    if (mode === "manual") {
      if (!manualText || typeof manualText !== "string" || manualText.trim().length < 20) {
        return res.status(400).json({ message: "Matn kamida 20 ta belgidan iborat bo'lishi kerak" });
      }

      const result = processManualTranscript(manualText);

      await storage.updateLesson(id, {
        transcript: result.text,
        manualTranscript: manualText,
        transcriptSource: "manual",
      });

      return res.json({ success: true, transcript: result });
    }

    if (mode === "demo") {
      const result = getDemoTranscript();

      await storage.updateLesson(id, {
        transcript: result.text,
        transcriptSource: "demo",
      });

      return res.json({ success: true, transcript: result });
    }

    return res.status(400).json({ message: "Noto'g'ri rejim. auto, manual yoki demo bo'lishi kerak" });
  });

  app.post("/api/user/lessons/:id/generate", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Noto'g'ri dars ID" });

    const lesson = await storage.getLessonById(id);
    if (!lesson) return res.status(404).json({ message: "Dars topilmadi" });
    if (lesson.createdBy !== req.session.userId) return res.status(403).json({ message: "Ruxsat yo'q" });
    if (!lesson.transcript) return res.status(400).json({ message: "Avval transkript qo'shing" });
    if (lesson.status === "approved" && lesson.summaryShort) {
      return res.status(400).json({ message: "Bu dars allaqachon generatsiya qilingan" });
    }

    const sentences = lesson.transcript
      .split(/(?<=[.!?。？！])\s+|\n+/)
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0);

    const content = await generateLessonContent(lesson.transcript, sentences, lesson.level);

    const updated = await storage.updateLesson(id, {
      summaryShort: content.summaryShort,
      summaryDetailed: content.summaryDetailed,
      vocabularyJson: content.vocabularyJson,
      phrasesJson: content.phrasesJson,
      quizzesJson: content.quizzesJson,
      flashcardsJson: content.flashcardsJson,
      sentenceAnalysisJson: content.sentenceAnalysisJson,
      aiMetaJson: content.aiMetaJson,
      status: "approved",
    });

    res.json(updated);
  });

  // ─── Flashcards ───
  app.get("/api/user/lessons/:id/flashcards", requireAuth, async (req, res) => {
    const lessonId = parseInt(req.params.id as string);
    if (isNaN(lessonId)) return res.status(400).json({ message: "Noto'g'ri ID" });
    const cards = await storage.getFlashcardsByUserAndLesson(req.session.userId!, lessonId);
    res.json(cards);
  });

  app.post("/api/user/lessons/:id/flashcards", requireAuth, async (req, res) => {
    const lessonId = parseInt(req.params.id as string);
    if (isNaN(lessonId)) return res.status(400).json({ message: "Noto'g'ri ID" });
    const { frontText, backText, type } = req.body;
    if (!frontText || !backText) return res.status(400).json({ message: "frontText va backText majburiy" });
    const card = await storage.createFlashcard({
      userId: req.session.userId!,
      lessonId,
      frontText,
      backText,
      type: type || "vocabulary",
    });
    res.status(201).json(card);
  });

  app.patch("/api/user/flashcards/:id", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Noto'g'ri ID" });
    const existing = await storage.getFlashcardsByUser(req.session.userId!);
    const card = existing.find(c => c.id === id);
    if (!card) return res.status(404).json({ message: "Kartochka topilmadi" });
    const { confidenceLevel, nextReviewAt } = req.body;
    const updated = await storage.updateFlashcard(id, { confidenceLevel, nextReviewAt });
    if (!updated) return res.status(404).json({ message: "Kartochka topilmadi" });
    res.json(updated);
  });

  app.delete("/api/user/flashcards/:id", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Noto'g'ri ID" });
    const existing = await storage.getFlashcardsByUser(req.session.userId!);
    const card = existing.find(c => c.id === id);
    if (!card) return res.status(404).json({ message: "Kartochka topilmadi" });
    await storage.deleteFlashcard(id);
    res.json({ success: true });
  });

  // ─── Notes ───
  app.get("/api/user/lessons/:id/notes", requireAuth, async (req, res) => {
    const lessonId = parseInt(req.params.id as string);
    if (isNaN(lessonId)) return res.status(400).json({ message: "Noto'g'ri ID" });
    const items = await storage.getNotesByUserAndLesson(req.session.userId!, lessonId);
    res.json(items);
  });

  app.post("/api/user/lessons/:id/notes", requireAuth, async (req, res) => {
    const lessonId = parseInt(req.params.id as string);
    if (isNaN(lessonId)) return res.status(400).json({ message: "Noto'g'ri ID" });
    const { content, sentenceIndex, isPinned } = req.body;
    if (!content) return res.status(400).json({ message: "Mazmun majburiy" });
    const note = await storage.createNote({
      userId: req.session.userId!,
      lessonId,
      content,
      sentenceIndex: sentenceIndex ?? null,
      isPinned: isPinned ?? false,
    });
    res.status(201).json(note);
  });

  app.patch("/api/user/notes/:id", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Noto'g'ri ID" });
    const userNotes = await storage.getNotesByUser(req.session.userId!);
    const note = userNotes.find(n => n.id === id);
    if (!note) return res.status(404).json({ message: "Eslatma topilmadi" });
    const { content, isPinned } = req.body;
    const updated = await storage.updateNote(id, { content, isPinned });
    if (!updated) return res.status(404).json({ message: "Eslatma topilmadi" });
    res.json(updated);
  });

  app.delete("/api/user/notes/:id", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Noto'g'ri ID" });
    const userNotes = await storage.getNotesByUser(req.session.userId!);
    const note = userNotes.find(n => n.id === id);
    if (!note) return res.status(404).json({ message: "Eslatma topilmadi" });
    await storage.deleteNote(id);
    res.json({ success: true });
  });

  // ─── Bookmarks ───
  app.get("/api/user/lessons/:id/bookmarks", requireAuth, async (req, res) => {
    const lessonId = parseInt(req.params.id as string);
    if (isNaN(lessonId)) return res.status(400).json({ message: "Noto'g'ri ID" });
    const items = await storage.getBookmarksByUserAndLesson(req.session.userId!, lessonId);
    res.json(items);
  });

  app.post("/api/user/lessons/:id/bookmarks", requireAuth, async (req, res) => {
    const lessonId = parseInt(req.params.id as string);
    if (isNaN(lessonId)) return res.status(400).json({ message: "Noto'g'ri ID" });
    const { type, sentenceIndex, label } = req.body;
    const bookmark = await storage.createBookmark({
      userId: req.session.userId!,
      lessonId,
      type: type || "sentence",
      sentenceIndex: sentenceIndex ?? null,
      label: label ?? null,
    });
    res.status(201).json(bookmark);
  });

  app.delete("/api/user/bookmarks/:id", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Noto'g'ri ID" });
    const userBookmarks = await storage.getBookmarksByUser(req.session.userId!);
    const bm = userBookmarks.find(b => b.id === id);
    if (!bm) return res.status(404).json({ message: "Xatcho'p topilmadi" });
    await storage.deleteBookmark(id);
    res.json({ success: true });
  });

  // ─── Lesson Progress ───
  app.get("/api/user/lessons/:id/progress", requireAuth, async (req, res) => {
    const lessonId = parseInt(req.params.id as string);
    if (isNaN(lessonId)) return res.status(400).json({ message: "Noto'g'ri ID" });
    const progress = await storage.getLessonProgress(req.session.userId!, lessonId);
    res.json(progress || { completedQuizzes: 0, learnedWords: 0, studyTimeSeconds: 0, accuracy: 0, completionPercent: 0 });
  });

  app.post("/api/user/lessons/:id/progress", requireAuth, async (req, res) => {
    const lessonId = parseInt(req.params.id as string);
    if (isNaN(lessonId)) return res.status(400).json({ message: "Noto'g'ri ID" });
    const { completedQuizzes, learnedWords, studyTimeSeconds, accuracy, completionPercent } = req.body;
    const progressData = {
      ...(completedQuizzes !== undefined && { completedQuizzes }),
      ...(learnedWords !== undefined && { learnedWords }),
      ...(studyTimeSeconds !== undefined && { studyTimeSeconds }),
      ...(accuracy !== undefined && { accuracy }),
      ...(completionPercent !== undefined && { completionPercent }),
      lastStudiedAt: new Date(),
    };
    const existing = await storage.getLessonProgress(req.session.userId!, lessonId);
    if (existing) {
      const updated = await storage.updateLessonProgress(existing.id, progressData);
      res.json(updated);
    } else {
      const created = await storage.createLessonProgress({
        userId: req.session.userId!,
        lessonId,
        ...progressData,
      });
      res.status(201).json(created);
    }
  });

  app.get("/api/categories", requireAuth, async (_req, res) => {
    const cats = await storage.getAllCategories();
    res.json(cats);
  });

  app.get("/api/tags", requireAuth, async (_req, res) => {
    const allTags = await storage.getAllTags();
    res.json(allTags);
  });

  app.get("/api/lessons/public", async (req, res) => {
    const allLessons = await storage.getAllLessons();
    let publicLessons = allLessons.filter(l => l.status === "published");

    const { search, category, level, featured } = req.query;
    if (search && typeof search === "string") {
      const q = search.toLowerCase();
      publicLessons = publicLessons.filter(l =>
        l.title.toLowerCase().includes(q) ||
        (l.summaryShort && l.summaryShort.toLowerCase().includes(q))
      );
    }
    if (category && typeof category === "string") {
      const catId = parseInt(category);
      if (!isNaN(catId)) publicLessons = publicLessons.filter(l => l.categoryId === catId);
    }
    if (level && typeof level === "string") {
      publicLessons = publicLessons.filter(l => l.level === level);
    }
    if (featured === "true") {
      publicLessons = publicLessons.filter(l => l.isFeatured);
    }

    publicLessons.sort((a, b) => {
      if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
      return new Date(b.publishedAt ?? b.createdAt).getTime() - new Date(a.publishedAt ?? a.createdAt).getTime();
    });

    const categories = await storage.getAllCategories();
    res.json({ lessons: publicLessons, categories });
  });

  app.get("/api/lessons/public/:id", async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Noto'g'ri ID" });
    const lesson = await storage.getLessonById(id);
    if (!lesson || lesson.status !== "published") return res.status(404).json({ message: "Dars topilmadi" });
    const creator = lesson.createdBy ? await storage.getUser(lesson.createdBy) : null;
    const tags = await resolveTagNames(id);
    const category = lesson.categoryId ? await storage.getAllCategories().then(cats => cats.find(c => c.id === lesson.categoryId)) : null;
    res.json({
      ...lesson,
      creatorName: creator?.fullName || "Noma'lum",
      tags,
      categoryName: category?.name || null,
    });
  });

  return httpServer;
}
