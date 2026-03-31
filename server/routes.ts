import type { Express } from "express";
import { type Server } from "http";
import express from "express";
import path from "path";
import multer from "multer";
import { storage } from "./storage";
import { pool } from "./db";
import { verifyPassword, requireAdmin, requireAuth, hashPassword } from "./auth";
import { z } from "zod";
import { tryExtractTranscript, processManualTranscript, getDemoTranscript } from "./services/transcript";
import { generateLessonContent } from "./services/ai-generator";

const uploadStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(process.cwd(), "uploads")),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `cover-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Faqat rasm fayllari (JPEG, PNG, WebP, GIF) qabul qilinadi"));
  },
});

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
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  app.post("/api/upload/cover", requireAuth, upload.single("cover"), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "Rasm yuklanmadi" });
    }
    const url = `/uploads/${req.file.filename}`;
    res.json({ url });
  });

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
    const [user, lessonCount, flashcardCount, userLessons, progress, coinTxs, allCategories] = await Promise.all([
      storage.getUser(userId),
      storage.countLessonsByUser(userId),
      storage.countFlashcardsByUser(userId),
      storage.getLessonsByUser(userId),
      storage.getProgressByUser(userId),
      storage.getCoinTransactionsByUser(userId),
      storage.getAllCategories(),
    ]);

    const catMap = new Map(allCategories.map(c => [c.id, c.name]));
    const pendingCount = userLessons.filter(l => l.status === "pending").length;
    const totalStudyTime = progress.reduce((sum, p) => sum + (p.studyTimeSeconds ?? 0), 0);
    const learnedWords = progress.reduce((sum, p) => sum + (p.learnedWords ?? 0), 0);

    const recentLessons = userLessons
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5)
      .map(l => ({ ...l, categoryName: l.categoryId ? catMap.get(l.categoryId) || null : null }));

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
    const [userLessons, allCategories] = await Promise.all([
      storage.getLessonsByUser(userId),
      storage.getAllCategories(),
    ]);
    const catMap = new Map(allCategories.map(c => [c.id, c.name]));
    const lessonsWithCategory = userLessons.map(l => ({
      ...l,
      categoryName: l.categoryId ? catMap.get(l.categoryId) || null : null,
    }));
    res.json(lessonsWithCategory);
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
    targetLanguage: z.enum(["ar", "en"]).default("ar"),
  });

  app.post("/api/user/lessons", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const parsed = createLessonSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }

    const { youtubeUrl, title, categoryId, tagIds, level, targetLanguage } = parsed.data;

    const costSetting = await storage.getSystemSetting("lesson_creation_cost");
    const LESSON_COST = costSetting?.value ? parseInt(costSetting.value) : 10;

    const videoIdMatch = youtubeUrl.match(/(?:v=|embed\/|shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    const videoId = videoIdMatch?.[1] ?? "";
    const thumbnailUrl = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : undefined;
    const lessonTitle = title || `YouTube dars — ${videoId}`;

    if (categoryId) {
      const cat = await storage.getCategoryById(categoryId);
      if (!cat) {
        return res.status(400).json({ message: "Tanlangan kategoriya topilmadi" });
      }
    }

    try {
      const result = await storage.createLessonWithCoinDeduction(
        userId,
        LESSON_COST,
        {
          title: lessonTitle,
          youtubeUrl,
          thumbnailUrl,
          level,
          targetLanguage,
          status: "pending",
          categoryId: categoryId ?? null,
          createdBy: userId,
        },
        tagIds ?? [],
        `Dars yaratish: ${lessonTitle}`
      );

      const user = await storage.getUser(userId);
      if (user && !(user.badges as string[] || []).includes("first_lesson")) {
        const newBadges = [...(user.badges as string[] || []), "first_lesson"];
        await storage.updateUser(userId, { badges: newBadges });
      }
      res.status(201).json(result);
    } catch (err: any) {
      if (err.message === "INSUFFICIENT_BALANCE") {
        return res.status(400).json({ message: `Bu amal uchun coin yetarli emas. Dars narxi: ${LESSON_COST} coin` });
      }
      if (err.code === "23503") {
        return res.status(400).json({ message: "Noto'g'ri kategoriya yoki teg. Qaytadan tanlang." });
      }
      throw err;
    }
  });

  app.get("/api/user/lessons/:id", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Noto'g'ri dars ID" });

    let lesson = await storage.getLessonById(id);
    if (!lesson) return res.status(404).json({ message: "Dars topilmadi" });
    if (lesson.createdBy !== req.session.userId) return res.status(403).json({ message: "Ruxsat yo'q" });

    if (lesson.manualTranscript) {
      const existingSubs = lesson.subtitlesJson as { text: string }[] | null;
      const needsReparse = !existingSubs || existingSubs.some(s => /\d+\s+(soniya|daqiqa|секунд|минут)/i.test(s.text));
      if (needsReparse) {
        try {
          const manualResult = processManualTranscript(lesson.manualTranscript);
          if (manualResult.timedSubtitles && manualResult.timedSubtitles.length > 0) {
            const updated = await storage.updateLesson(id, {
              subtitlesJson: manualResult.timedSubtitles,
              transcript: manualResult.text,
            });
            console.log(`[auto-fix] Dars #${id}: subtitlesJson yangilandi (${manualResult.timedSubtitles.length} ta)`);
            lesson = updated;
          }
        } catch (e) {
          console.error(`[auto-fix] Dars #${id}: subtitle tiklash xatolik:`, e);
        }
      }
    }

    res.json(lesson);
  });

  app.patch("/api/user/lessons/:id", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Noto'g'ri dars ID" });

    const lesson = await storage.getLessonById(id);
    if (!lesson) return res.status(404).json({ message: "Dars topilmadi" });
    if (lesson.createdBy !== req.session.userId) return res.status(403).json({ message: "Ruxsat yo'q" });

    const updateData: Record<string, any> = {};
    if (req.body.title !== undefined) updateData.title = req.body.title;
    if (req.body.categoryId !== undefined) updateData.categoryId = req.body.categoryId;
    if (req.body.level !== undefined) updateData.level = req.body.level;
    if (req.body.targetLanguage !== undefined && ["ar", "en"].includes(req.body.targetLanguage)) updateData.targetLanguage = req.body.targetLanguage;

    const updated = await storage.updateLesson(id, updateData);
    res.json(updated);
  });

  app.delete("/api/user/lessons/:id", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Noto'g'ri dars ID" });

    const lesson = await storage.getLessonById(id);
    if (!lesson) return res.status(404).json({ message: "Dars topilmadi" });
    if (lesson.createdBy !== req.session.userId) return res.status(403).json({ message: "Ruxsat yo'q" });

    await storage.deleteLesson(id);
    res.json({ success: true });
  });

  app.patch("/api/user/lessons/:id/publish", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Noto'g'ri dars ID" });
    const lesson = await storage.getLessonById(id);
    if (!lesson) return res.status(404).json({ message: "Dars topilmadi" });
    if (lesson.createdBy !== req.session.userId) return res.status(403).json({ message: "Ruxsat yo'q" });
    if (lesson.status !== "approved") return res.status(400).json({ message: "Faqat tasdiqlangan darslar e'lon qilinishi mumkin" });
    const updated = await storage.updateLesson(id, {
      status: "published",
      publishedBy: req.session.userId,
      publishedAt: new Date(),
    });
    res.json(updated);
  });

  app.patch("/api/user/lessons/:id/unpublish", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Noto'g'ri dars ID" });
    const lesson = await storage.getLessonById(id);
    if (!lesson) return res.status(404).json({ message: "Dars topilmadi" });
    if (lesson.createdBy !== req.session.userId) return res.status(403).json({ message: "Ruxsat yo'q" });
    if (lesson.status !== "published") return res.status(400).json({ message: "Faqat e'lon qilingan darslar olib tashlanishi mumkin" });
    const updated = await storage.updateLesson(id, {
      status: "approved",
      publishedAt: null,
      publishedBy: null,
    });
    res.json(updated);
  });

  const wordMapItemSchema = z.object({
    word: z.string().max(200),
    normalized: z.string().max(200).optional().default(""),
    translationUz: z.string().max(500),
    translationAr: z.string().max(500).optional().default(""),
  });

  const sentenceEditSchema = z.object({
    sentence: z.string().min(1).max(5000).optional(),
    translation: z.string().max(5000).optional(),
    translationAr: z.string().max(5000).optional(),
    wordMap: z.array(wordMapItemSchema).max(100).optional(),
  });

  app.patch("/api/user/lessons/:id/sentences/:index", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    const index = parseInt(req.params.index as string);
    if (isNaN(id) || isNaN(index) || index < 0) return res.status(400).json({ message: "Noto'g'ri parametrlar" });

    const parsed = sentenceEditSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Noto'g'ri ma'lumot formati", errors: parsed.error.flatten() });

    const lesson = await storage.getLessonById(id);
    if (!lesson) return res.status(404).json({ message: "Dars topilmadi" });
    if (lesson.createdBy !== req.session.userId) return res.status(403).json({ message: "Ruxsat yo'q" });

    const sentences: any[] = (lesson.sentenceAnalysisJson as any[]) || [];
    if (index >= sentences.length) return res.status(400).json({ message: "Gap indeksi noto'g'ri" });

    const data = parsed.data;
    if (data.sentence !== undefined) sentences[index].sentence = data.sentence;
    if (data.translation !== undefined) sentences[index].translation = data.translation;
    if (data.translationAr !== undefined) sentences[index].translationAr = data.translationAr;
    if (data.wordMap !== undefined) {
      sentences[index].wordMap = data.wordMap.map(wm => ({
        ...wm,
        normalized: wm.normalized || wm.word.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").trim(),
      }));
    }

    const updated = await storage.updateLesson(id, { sentenceAnalysisJson: sentences });
    res.json(updated);
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
        subtitlesJson: result.timedSubtitles && result.timedSubtitles.length > 0
          ? result.timedSubtitles
          : null,
      });

      return res.json({ success: true, transcript: result });
    }

    if (mode === "manual") {
      if (!manualText || typeof manualText !== "string" || manualText.trim().length < 20) {
        return res.status(400).json({ message: "Matn kamida 20 ta belgidan iborat bo'lishi kerak" });
      }

      const result = processManualTranscript(manualText);

      const updateData: any = {
        transcript: result.text,
        manualTranscript: manualText,
        transcriptSource: "manual",
        subtitlesJson: result.timedSubtitles && result.timedSubtitles.length > 0
          ? result.timedSubtitles
          : null,
      };

      await storage.updateLesson(id, updateData);

      return res.json({ success: true, transcript: result });
    }

    if (mode === "demo") {
      const result = getDemoTranscript();

      await storage.updateLesson(id, {
        transcript: result.text,
        transcriptSource: "demo",
        subtitlesJson: null,
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

    const storedSubs = lesson.subtitlesJson as { startTime: number; endTime: number; text: string }[] | null;
    let rawSentences: string[];

    if (storedSubs && storedSubs.length > 0) {
      rawSentences = storedSubs.map(s => s.text).filter(t => t.trim().length > 0);
    } else {
      rawSentences = lesson.transcript
        .split(/(?<=[.!?。？！؟!])\s+|\n+/)
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0);

      if (rawSentences.length <= 1 && lesson.transcript.length > 50) {
        rawSentences = lesson.transcript
          .split(/\n+/)
          .map((s: string) => s.trim())
          .filter((s: string) => s.length > 0);
      }
    }

    const sentences: string[] = [];
    for (const s of rawSentences) {
      if (s.split(/\s+/).length <= 2 && sentences.length > 0) {
        sentences[sentences.length - 1] += " " + s;
      } else {
        sentences.push(s);
      }
    }

    console.log(`[generate] Dars #${id}: AI kontent yaratish boshlandi (${sentences.length} ta gap)...`);
    const genStart = Date.now();
    try {
      const content = await generateLessonContent(lesson.transcript, sentences, lesson.level, lesson.targetLanguage || "ar");
      console.log(`[generate] Dars #${id}: AI kontent tayyor (${((Date.now() - genStart) / 1000).toFixed(1)}s, provider: ${content.aiMetaJson.provider})`);

      const updated = await storage.updateLesson(id, {
        summaryShort: content.summaryShort,
        summaryDetailed: content.summaryDetailed,
        summaryShortAr: content.summaryShortAr,
        summaryDetailedAr: content.summaryDetailedAr,
        vocabularyJson: content.vocabularyJson,
        phrasesJson: content.phrasesJson,
        quizzesJson: content.quizzesJson,
        flashcardsJson: content.flashcardsJson,
        sentenceAnalysisJson: content.sentenceAnalysisJson,
        aiMetaJson: content.aiMetaJson,
        status: "approved",
      });

      res.json(updated);
    } catch (err: any) {
      console.error(`[generate] Dars #${id}: xatolik (${((Date.now() - genStart) / 1000).toFixed(1)}s):`, err?.message || err);
      res.status(500).json({ message: "AI kontent yaratishda xatolik yuz berdi. Qaytadan urinib ko'ring." });
    }
  });

  // ─── Manual JSON Import (ChatGPT natijasini import qilish) ───
  app.post("/api/user/lessons/:id/import-content", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Noto'g'ri dars ID" });

    const lesson = await storage.getLessonById(id);
    if (!lesson) return res.status(404).json({ message: "Dars topilmadi" });
    if (lesson.createdBy !== req.session.userId) return res.status(403).json({ message: "Ruxsat yo'q" });

    const { content } = req.body;
    if (!content || typeof content !== "object") {
      return res.status(400).json({ message: "JSON formatdagi kontent talab qilinadi" });
    }

    const errors: string[] = [];
    if (!content.summaryShort) errors.push("summaryShort majburiy");
    if (!content.summaryDetailed) errors.push("summaryDetailed majburiy");
    if (!Array.isArray(content.vocabulary) || content.vocabulary.length === 0) errors.push("vocabulary majburiy (kamida 1 ta)");
    if (!Array.isArray(content.sentenceAnalysis) || content.sentenceAnalysis.length === 0) errors.push("sentenceAnalysis majburiy (kamida 1 ta)");

    if (errors.length > 0) {
      return res.status(400).json({ message: "JSON strukturasi noto'g'ri: " + errors.join(", ") });
    }

    try {
      const vocabularyJson = (content.vocabulary || []).map((v: any) => ({
        word: v.word || "",
        translation: v.translation || "",
        translationAr: v.translationAr || "",
        partOfSpeech: v.partOfSpeech || "ism",
        example: v.example || "",
        difficulty: v.difficulty || "easy",
      }));

      const phrasesJson = (content.phrases || []).map((p: any) => ({
        phrase: p.phrase || "",
        translation: p.translation || "",
        translationAr: p.translationAr || "",
        context: p.context || "",
      }));

      const quizzesJson = (content.quizzes || []).map((q: any) => ({
        question: q.question || "",
        options: Array.isArray(q.options) ? q.options : [],
        correctIndex: typeof q.correctIndex === "number" ? q.correctIndex : 0,
        explanation: q.explanation || "",
        type: q.type === "fill_blank" ? "fill_blank" : "multiple_choice",
      }));

      const flashcardsJson = (content.flashcards || []).map((f: any) => ({
        front: f.front || "",
        back: f.back || "",
        backAr: f.backAr || "",
        type: (["vocabulary", "phrase", "grammar"].includes(f.type) ? f.type : "vocabulary"),
      }));

      const stripDiacritics = (t: string) => t.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "");
      const hasDiacritics = (t: string) => /[\u064B-\u065F\u0670]/.test(t);

      const sentenceAnalysisJson = (content.sentenceAnalysis || []).map((s: any) => {
        const rawSentence = s.sentence || "";
        const wordMapArr = Array.isArray(s.wordMap) ? s.wordMap.map((w: any) => ({
          word: w.word || "",
          normalized: w.normalized || (w.word || "").toLowerCase(),
          translationUz: w.translationUz || "",
          translationAr: w.translationAr || "",
          contextualMeaning: w.contextualMeaning || "",
        })) : [];

        let sentence = rawSentence;
        if (!hasDiacritics(rawSentence) && wordMapArr.length > 0 && wordMapArr.some((w: any) => hasDiacritics(w.word))) {
          sentence = wordMapArr.map((w: any) => w.word).join(" ");
        }

        const result: any = {
          sentence,
          translation: s.translation || "",
          translationAr: s.translationAr || "",
          grammarNotes: s.grammarNotes || "",
          keyWords: Array.isArray(s.keyWords) ? s.keyWords : [],
          wordMap: wordMapArr,
        };
        if (Array.isArray(s.lineIndices) && s.lineIndices.length > 0) {
          result.lineIndices = s.lineIndices;
        }
        return result;
      });

      const updateData: any = {
        summaryShort: content.summaryShort || "",
        summaryDetailed: content.summaryDetailed || "",
        summaryShortAr: content.summaryShortAr || "",
        summaryDetailedAr: content.summaryDetailedAr || "",
        vocabularyJson,
        phrasesJson,
        quizzesJson,
        flashcardsJson,
        sentenceAnalysisJson,
        aiMetaJson: {
          provider: "manual-import",
          model: "chatgpt-manual",
          generatedAt: new Date().toISOString(),
          transcriptLength: lesson.transcript?.length || 0,
          sentenceCount: sentenceAnalysisJson.length,
        },
        status: "approved",
      };

      if (!lesson.subtitlesJson && lesson.manualTranscript) {
        const manualResult = processManualTranscript(lesson.manualTranscript);
        if (manualResult.timedSubtitles && manualResult.timedSubtitles.length > 0) {
          updateData.subtitlesJson = manualResult.timedSubtitles;
          console.log(`[import] Dars #${id}: subtitlesJson tiklandi (${manualResult.timedSubtitles.length} ta)`);
        }
      }

      const updated = await storage.updateLesson(id, updateData);

      console.log(`[import] Dars #${id}: Manual JSON import muvaffaqiyatli (${sentenceAnalysisJson.length} gap, ${vocabularyJson.length} so'z)`);
      res.json(updated);
    } catch (err: any) {
      console.error(`[import] Dars #${id}: xatolik:`, err?.message || err);
      res.status(500).json({ message: "Import qilishda xatolik yuz berdi" });
    }
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
    let xpToAward = 5;
    if (completedQuizzes && completedQuizzes > 0) xpToAward += 25;
    if (learnedWords && learnedWords > 0) xpToAward += learnedWords * 2;
    try { await storage.addXpAndUpdateStreak(req.session.userId!, xpToAward); } catch {}
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

  app.post("/api/admin/categories", requireAdmin, async (req, res) => {
    try {
      const { name, description } = req.body;
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ message: "Kategoriya nomi kiritilishi shart" });
      }
      const slug = name.trim().toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-");
      const existing = await storage.getCategoryBySlug(slug);
      if (existing) {
        return res.status(400).json({ message: "Bu nomli kategoriya allaqachon mavjud" });
      }
      const cat = await storage.createCategory({ name: name.trim(), slug, description: description?.trim() || null });
      res.json(cat);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/admin/categories/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Noto'g'ri ID" });
      const { name, description } = req.body;
      const updateData: any = {};
      if (name && typeof name === "string" && name.trim()) {
        updateData.name = name.trim();
        const newSlug = name.trim().toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-");
        if (!newSlug) return res.status(400).json({ message: "Kategoriya nomi noto'g'ri" });
        const existing = await storage.getCategoryBySlug(newSlug);
        if (existing && existing.id !== id) {
          return res.status(400).json({ message: "Bu nomli kategoriya allaqachon mavjud" });
        }
        updateData.slug = newSlug;
      }
      if (description !== undefined) {
        updateData.description = description?.trim() || null;
      }
      const cat = await storage.updateCategory(id, updateData);
      if (!cat) return res.status(404).json({ message: "Kategoriya topilmadi" });
      res.json(cat);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/admin/categories/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Noto'g'ri ID" });
      await storage.deleteCategory(id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/tags", requireAuth, async (_req, res) => {
    const allTags = await storage.getAllTags();
    res.json(allTags);
  });

  app.get("/api/lessons/public", async (req, res) => {
    const allLessons = await storage.getAllLessons();
    let publicLessons = allLessons.filter(l => l.status === "published");

    const { search, category, level, featured, targetLanguage: langFilter } = req.query;
    if (search && typeof search === "string") {
      const q = search.toLowerCase();
      publicLessons = publicLessons.filter(l =>
        l.title.toLowerCase().includes(q) ||
        (l.summaryShort && l.summaryShort.toLowerCase().includes(q))
      );
    }
    if (category && typeof category === "string") {
      if (category === "uncategorized") {
        publicLessons = publicLessons.filter(l => !l.categoryId);
      } else {
        const catId = parseInt(category);
        if (!isNaN(catId)) publicLessons = publicLessons.filter(l => l.categoryId === catId);
      }
    }
    if (level && typeof level === "string") {
      publicLessons = publicLessons.filter(l => l.level === level);
    }
    if (featured === "true") {
      publicLessons = publicLessons.filter(l => l.isFeatured);
    }
    if (langFilter && typeof langFilter === "string") {
      publicLessons = publicLessons.filter(l => (l.targetLanguage || "ar") === langFilter);
    }

    publicLessons.sort((a, b) => {
      if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
      return new Date(b.publishedAt ?? b.createdAt).getTime() - new Date(a.publishedAt ?? a.createdAt).getTime();
    });

    const categories = await storage.getAllCategories();
    const catMap = new Map(categories.map(c => [c.id, c.name]));
    const lessonsWithCategory = publicLessons.map(l => ({
      ...l,
      categoryName: l.categoryId ? catMap.get(l.categoryId) || null : null,
    }));
    res.json({ lessons: lessonsWithCategory, categories });
  });

  // ─── User Analytics ───
  app.get("/api/user/analytics", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const [user, progress, flashcardCount, noteCount, bookmarkCount, lessons] = await Promise.all([
      storage.getUser(userId),
      storage.getProgressByUser(userId),
      storage.countFlashcardsByUser(userId),
      storage.countNotesByUser(userId),
      storage.countBookmarksByUser(userId),
      storage.getLessonsByUser(userId),
    ]);
    const totalLessons = lessons.length;
    const totalStudyTime = progress.reduce((s, p) => s + (p.studyTimeSeconds ?? 0), 0);
    const learnedWords = progress.reduce((s, p) => s + (p.learnedWords ?? 0), 0);
    const totalQuizzes = progress.reduce((s, p) => s + (p.completedQuizzes ?? 0), 0);
    const avgAccuracy = progress.length > 0
      ? progress.reduce((s, p) => s + (p.accuracy ?? 0), 0) / progress.length
      : 0;
    const weeklyStudy: number[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const day = new Date(now);
      day.setDate(day.getDate() - i);
      const dayStr = day.toISOString().split("T")[0];
      const dayProgress = progress.filter(p => {
        if (!p.lastStudiedAt) return false;
        return new Date(p.lastStudiedAt).toISOString().split("T")[0] === dayStr;
      });
      weeklyStudy.push(dayProgress.reduce((s, p) => s + (p.studyTimeSeconds ?? 0), 0));
    }
    res.json({
      totalLessons,
      quizAccuracy: Math.round(avgAccuracy * 10) / 10,
      totalQuizzes,
      vocabularyLearned: learnedWords,
      totalStudyTime,
      streakDays: user?.streakDays ?? 0,
      flashcardCount,
      noteCount,
      bookmarkCount,
      xp: user?.xp ?? 0,
      level: user?.level ?? 1,
      badges: user?.badges ?? [],
      weeklyStudy,
    });
  });

  // ─── Admin Analytics ───
  app.get("/api/admin/analytics", requireAdmin, async (_req, res) => {
    const [allUsers, allLessons, allSettings] = await Promise.all([
      storage.getAllUsers(),
      storage.getAllLessons(),
      storage.getAllSystemSettings(),
    ]);
    const totalUsers = allUsers.length;
    const activeUsers = allUsers.filter(u => u.isActive).length;
    const totalLessons = allLessons.length;
    const pendingLessons = allLessons.filter(l => l.status === "pending").length;
    const publishedLessons = allLessons.filter(l => l.status === "published").length;
    const rejectedLessons = allLessons.filter(l => l.status === "rejected").length;
    const approvedLessons = allLessons.filter(l => l.status === "approved").length;
    const draftLessons = allLessons.filter(l => l.status === "draft").length;
    const totalCoinsCirculation = allUsers.reduce((s, u) => s + u.coins, 0);
    const topUsers = allUsers
      .filter(u => u.role !== "admin")
      .sort((a, b) => b.xp - a.xp)
      .slice(0, 10)
      .map(u => ({ id: u.id, fullName: u.fullName, username: u.username, role: u.role, xp: u.xp, level: u.level, coins: u.coins, streakDays: u.streakDays }));
    const roleDistribution = {
      admin: allUsers.filter(u => u.role === "admin").length,
      teacher: allUsers.filter(u => u.role === "teacher").length,
      student: allUsers.filter(u => u.role === "student").length,
    };
    res.json({
      totalUsers,
      activeUsers,
      totalLessons,
      pendingLessons,
      publishedLessons,
      rejectedLessons,
      approvedLessons,
      draftLessons,
      totalCoinsCirculation,
      topUsers,
      roleDistribution,
    });
  });

  // ─── Admin Settings ───
  app.get("/api/admin/settings", requireAdmin, async (_req, res) => {
    const settings = await storage.getAllSystemSettings();
    const settingsMap: Record<string, string> = {};
    settings.forEach(s => { if (s.key && s.value !== null) settingsMap[s.key] = s.value!; });
    res.json(settingsMap);
  });

  app.put("/api/admin/settings", requireAdmin, async (req, res) => {
    const updates = req.body;
    if (!updates || typeof updates !== "object") return res.status(400).json({ message: "Noto'g'ri ma'lumot" });
    const results: Record<string, string> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (typeof value === "string") {
        await storage.setSystemSetting(key, value);
        results[key] = value;
      }
    }
    res.json(results);
  });

  app.get("/api/user/dictionary/search", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const q = (req.query.q as string || "").trim().toLowerCase();
    const langFilter = req.query.lang as string || "";
    if (!q || q.length < 2) return res.json([]);

    try {
      let userLessons = await storage.getLessonsByUser(userId);
      if (langFilter && ["ar", "en"].includes(langFilter)) {
        userLessons = userLessons.filter(l => (l.targetLanguage || "ar") === langFilter);
      }
      const results: any[] = [];
      const seen = new Set<string>();

      const findSubtitleTime = (subtitles: any[], sentenceText: string): number => {
        if (!subtitles.length || !sentenceText) return 0;
        const sentWords = sentenceText.replace(/[^\p{L}\p{N}\s]/gu, "").toLowerCase().split(/\s+/).filter(Boolean);
        if (!sentWords.length) return 0;
        let bestScore = 0;
        let bestTime = 0;
        for (const sub of subtitles) {
          const subText = (sub.text || "").replace(/[^\p{L}\p{N}\s]/gu, "").toLowerCase();
          let matched = 0;
          for (const w of sentWords) {
            if (subText.includes(w)) matched++;
          }
          const score = matched / sentWords.length;
          if (score > bestScore) {
            bestScore = score;
            bestTime = sub.startTime || 0;
          }
        }
        return bestScore >= 0.3 ? bestTime : 0;
      };

      for (const lesson of userLessons) {
        const sentences: any[] = lesson.sentenceAnalysisJson as any[] || [];
        const subtitles: any[] = lesson.subtitlesJson as any[] || [];
        const vocab: any[] = lesson.vocabularyJson as any[] || [];

        for (let si = 0; si < sentences.length; si++) {
          const s = sentences[si];
          const wm: any[] = s.wordMap || [];
          for (const w of wm) {
            const word = (w.word || "").toLowerCase();
            const norm = (w.normalized || "").toLowerCase();
            const tuz = (w.translationUz || "").toLowerCase();
            const tar = (w.translationAr || "").toLowerCase();
            if (word.includes(q) || norm.includes(q) || tuz.includes(q) || tar.includes(q)) {
              const key = `${norm || word}__${lesson.id}__${si}`;
              if (seen.has(key)) continue;
              seen.add(key);
              const startTime = findSubtitleTime(subtitles, s.sentence || "");
              results.push({
                word: w.word,
                normalized: w.normalized,
                translationUz: w.translationUz,
                translationAr: w.translationAr,
                contextualMeaning: w.contextualMeaning,
                sentence: s.sentence,
                sentenceTranslation: s.translation,
                lessonId: lesson.id,
                lessonTitle: lesson.title,
                sentenceIndex: si,
                startTime,
              });
            }
          }
        }

        for (const v of vocab) {
          const word = (v.word || "").toLowerCase();
          const tuz = (v.translation || "").toLowerCase();
          const tar = (v.translationAr || "").toLowerCase();
          if (word.includes(q) || tuz.includes(q) || tar.includes(q)) {
            const key = `vocab__${word}__${lesson.id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            results.push({
              word: v.word,
              normalized: v.word,
              translationUz: v.translation,
              translationAr: v.translationAr,
              contextualMeaning: v.partOfSpeech || "",
              sentence: v.example || "",
              sentenceTranslation: "",
              lessonId: lesson.id,
              lessonTitle: lesson.title,
              sentenceIndex: -1,
              startTime: 0,
              isVocab: true,
            });
          }
        }

        if (results.length >= 50) break;
      }

      res.json(results.slice(0, 50));
    } catch (err) {
      console.error("Dictionary search error:", err);
      res.status(500).json({ message: "Qidiruvda xatolik" });
    }
  });

  app.get("/api/dictionary/public/search", async (req, res) => {
    const rawQ = req.query.q;
    if (typeof rawQ !== "string") return res.json([]);
    const q = rawQ.trim().toLowerCase();
    const langFilter = req.query.lang as string || "";
    if (q.length < 2 || q.length > 100) return res.json([]);

    try {
      const allLessons = await storage.getAllLessons();
      let publishedLessons = allLessons.filter(l => l.status === "published");
      if (langFilter && ["ar", "en"].includes(langFilter)) {
        publishedLessons = publishedLessons.filter(l => (l.targetLanguage || "ar") === langFilter);
      }
      const results: any[] = [];
      const seen = new Set<string>();

      const findSubtitleTime = (subtitles: any[], sentenceText: string): number => {
        if (!subtitles.length || !sentenceText) return 0;
        const sentWords = sentenceText.replace(/[^\p{L}\p{N}\s]/gu, "").toLowerCase().split(/\s+/).filter(Boolean);
        if (!sentWords.length) return 0;
        let bestScore = 0;
        let bestTime = 0;
        for (const sub of subtitles) {
          const subText = (sub.text || "").replace(/[^\p{L}\p{N}\s]/gu, "").toLowerCase();
          let matched = 0;
          for (const w of sentWords) {
            if (subText.includes(w)) matched++;
          }
          const score = matched / sentWords.length;
          if (score > bestScore) {
            bestScore = score;
            bestTime = sub.startTime || 0;
          }
        }
        return bestScore >= 0.3 ? bestTime : 0;
      };

      for (const lesson of publishedLessons) {
        if (results.length >= 50) break;
        const sentences: any[] = lesson.sentenceAnalysisJson as any[] || [];
        const subtitles: any[] = lesson.subtitlesJson as any[] || [];
        const vocab: any[] = lesson.vocabularyJson as any[] || [];

        for (let si = 0; si < sentences.length && results.length < 50; si++) {
          const s = sentences[si];
          const wm: any[] = s.wordMap || [];
          for (const w of wm) {
            const word = (w.word || "").toLowerCase();
            const norm = (w.normalized || "").toLowerCase();
            const tuz = (w.translationUz || "").toLowerCase();
            const tar = (w.translationAr || "").toLowerCase();
            if (word.includes(q) || norm.includes(q) || tuz.includes(q) || tar.includes(q)) {
              const key = `${norm || word}__${lesson.id}__${si}`;
              if (seen.has(key)) continue;
              seen.add(key);
              const startTime = findSubtitleTime(subtitles, s.sentence || "");
              results.push({
                word: w.word,
                normalized: w.normalized,
                translationUz: w.translationUz,
                translationAr: w.translationAr,
                contextualMeaning: w.contextualMeaning,
                sentence: s.sentence,
                sentenceTranslation: s.translation,
                lessonId: lesson.id,
                lessonTitle: lesson.title,
                sentenceIndex: si,
                startTime,
              });
              if (results.length >= 50) break;
            }
          }
        }

        for (const v of vocab) {
          if (results.length >= 50) break;
          const word = (v.word || "").toLowerCase();
          const tuz = (v.translation || "").toLowerCase();
          const tar = (v.translationAr || "").toLowerCase();
          if (word.includes(q) || tuz.includes(q) || tar.includes(q)) {
            const key = `vocab__${word}__${lesson.id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            results.push({
              word: v.word,
              normalized: v.word,
              translationUz: v.translation,
              translationAr: v.translationAr,
              contextualMeaning: v.partOfSpeech || "",
              sentence: v.example || "",
              sentenceTranslation: "",
              lessonId: lesson.id,
              lessonTitle: lesson.title,
              sentenceIndex: -1,
              startTime: 0,
              isVocab: true,
            });
          }
        }
      }

      res.json(results.slice(0, 50));
    } catch (err) {
      console.error("Public dictionary search error:", err);
      res.status(500).json({ message: "Qidiruvda xatolik" });
    }
  });

  app.get("/api/user/saved-words", requireAuth, async (req, res) => {
    const userId = (req as any).session.userId;
    const lessonId = req.query.lessonId ? parseInt(req.query.lessonId as string) : null;
    if (lessonId) {
      const words = await storage.getSavedWordsByUserAndLesson(userId, lessonId);
      return res.json(words);
    }
    const words = await storage.getSavedWordsByUser(userId);
    res.json(words);
  });

  app.post("/api/user/saved-words", requireAuth, async (req, res) => {
    const userId = (req as any).session.userId;
    const { word, normalized, lessonId, translationUz, translationAr, contextualMeaning, partOfSpeech, pronunciation, sourceSentence, subtitleTime, phraseText, phraseTranslationUz, phraseTranslationAr, phraseExplanation } = req.body;
    if (!word || !lessonId) return res.status(400).json({ message: "So'z va dars kerak" });
    const norm = (normalized || word).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").trim();
    try {
      const saved = await storage.createSavedWord({
        userId,
        lessonId: parseInt(lessonId),
        word,
        normalized: norm,
        translationUz: translationUz || null,
        translationAr: translationAr || null,
        contextualMeaning: contextualMeaning || null,
        partOfSpeech: partOfSpeech || null,
        pronunciation: pronunciation || null,
        sourceSentence: sourceSentence || null,
        subtitleTime: subtitleTime != null ? parseFloat(subtitleTime) : null,
        phraseText: phraseText || null,
        phraseTranslationUz: phraseTranslationUz || null,
        phraseTranslationAr: phraseTranslationAr || null,
        phraseExplanation: phraseExplanation || null,
      });
      res.status(201).json(saved);
    } catch (err: any) {
      if (err.code === "23505") {
        return res.status(409).json({ message: "Bu so'z allaqachon saqlangan" });
      }
      throw err;
    }
  });

  app.patch("/api/user/saved-words/:id", requireAuth, async (req, res) => {
    const userId = (req as any).session.userId;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Noto'g'ri ID" });
    const allWords = await storage.getSavedWordsByUser(userId);
    const word = allWords.find(w => w.id === id);
    if (!word) return res.status(404).json({ message: "So'z topilmadi" });
    const { isLearned } = req.body;
    const updated = await storage.updateSavedWord(id, { isLearned });
    res.json(updated);
  });

  app.delete("/api/user/saved-words/:id", requireAuth, async (req, res) => {
    const userId = (req as any).session.userId;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Noto'g'ri ID" });
    const allWords = await storage.getSavedWordsByUser(userId);
    const word = allWords.find(w => w.id === id);
    if (!word) return res.status(404).json({ message: "So'z topilmadi" });
    await storage.deleteSavedWord(id);
    res.json({ success: true });
  });

  app.get("/api/admin/data/stats", requireAdmin, async (_req, res) => {
    const allLessons = await storage.getAllLessons();
    let totalWords = 0, totalSentences = 0, totalQuizzes = 0, totalPhrases = 0, totalFlashcards = 0;
    const uniqueWordsSet = new Set<string>();
    for (const lesson of allLessons) {
      const vocab = (lesson.vocabularyJson as any[]) || [];
      const sents = (lesson.sentenceAnalysisJson as any[]) || [];
      const quizArr = (lesson.quizzesJson as any[]) || [];
      const phrasesArr = (lesson.phrasesJson as any[]) || [];
      const fcArr = (lesson.flashcardsJson as any[]) || [];
      totalWords += vocab.length;
      totalSentences += sents.length;
      totalQuizzes += quizArr.length;
      totalPhrases += phrasesArr.length;
      totalFlashcards += fcArr.length;
      vocab.forEach((v: any) => uniqueWordsSet.add((v.word || "").toLowerCase()));
      sents.forEach((s: any) => {
        if (s.wordMap) s.wordMap.forEach((wm: any) => uniqueWordsSet.add((wm.normalized || wm.word || "").toLowerCase()));
      });
    }
    const allSaved = await storage.getAllSavedWords();
    res.json({
      totalLessons: allLessons.length,
      publishedLessons: allLessons.filter(l => l.status === "published").length,
      totalWords,
      uniqueWords: uniqueWordsSet.size,
      totalSentences,
      totalQuizzes,
      totalPhrases,
      totalFlashcards,
      totalSavedWords: allSaved.length,
    });
  });

  app.get("/api/admin/data/vocabulary", requireAdmin, async (req, res) => {
    const allLessons = await storage.getAllLessons();
    const lessonFilter = req.query.lessonId ? parseInt(req.query.lessonId as string) : null;
    const result: any[] = [];
    for (const lesson of allLessons) {
      if (lessonFilter && lesson.id !== lessonFilter) continue;
      const vocab = (lesson.vocabularyJson as any[]) || [];
      vocab.forEach((v: any) => {
        result.push({
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          lessonLevel: lesson.level,
          word: v.word,
          translation: v.translation,
          translationAr: v.translationAr || "",
          partOfSpeech: v.partOfSpeech || "",
          example: v.example || "",
          difficulty: v.difficulty || "",
        });
      });
    }
    res.json(result);
  });

  app.get("/api/admin/data/sentences", requireAdmin, async (req, res) => {
    const allLessons = await storage.getAllLessons();
    const lessonFilter = req.query.lessonId ? parseInt(req.query.lessonId as string) : null;
    const result: any[] = [];
    for (const lesson of allLessons) {
      if (lessonFilter && lesson.id !== lessonFilter) continue;
      const sents = (lesson.sentenceAnalysisJson as any[]) || [];
      sents.forEach((s: any, idx: number) => {
        result.push({
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          index: idx,
          sentence: s.sentence,
          translation: s.translation,
          translationAr: s.translationAr || "",
          grammarNotes: s.grammarNotes || "",
          keyWords: s.keyWords || [],
          wordMapCount: (s.wordMap || []).length,
        });
      });
    }
    res.json(result);
  });

  app.get("/api/admin/data/quizzes", requireAdmin, async (req, res) => {
    const allLessons = await storage.getAllLessons();
    const lessonFilter = req.query.lessonId ? parseInt(req.query.lessonId as string) : null;
    const result: any[] = [];
    for (const lesson of allLessons) {
      if (lessonFilter && lesson.id !== lessonFilter) continue;
      const quizArr = (lesson.quizzesJson as any[]) || [];
      quizArr.forEach((q: any, idx: number) => {
        result.push({
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          index: idx,
          question: q.question,
          options: q.options || [],
          correctIndex: q.correctIndex ?? q.answer ?? 0,
          explanation: q.explanation || "",
          type: q.type || "multiple_choice",
        });
      });
    }
    res.json(result);
  });

  app.get("/api/admin/data/phrases", requireAdmin, async (req, res) => {
    const allLessons = await storage.getAllLessons();
    const lessonFilter = req.query.lessonId ? parseInt(req.query.lessonId as string) : null;
    const result: any[] = [];
    for (const lesson of allLessons) {
      if (lessonFilter && lesson.id !== lessonFilter) continue;
      const phrasesArr = (lesson.phrasesJson as any[]) || [];
      phrasesArr.forEach((p: any) => {
        result.push({
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          phrase: p.phrase,
          translation: p.translation,
          translationAr: p.translationAr || "",
          context: p.context || "",
        });
      });
    }
    res.json(result);
  });

  app.get("/api/admin/data/flashcards", requireAdmin, async (req, res) => {
    const allLessons = await storage.getAllLessons();
    const lessonFilter = req.query.lessonId ? parseInt(req.query.lessonId as string) : null;
    const result: any[] = [];
    for (const lesson of allLessons) {
      if (lessonFilter && lesson.id !== lessonFilter) continue;
      const fcArr = (lesson.flashcardsJson as any[]) || [];
      fcArr.forEach((f: any) => {
        result.push({
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          front: f.front,
          back: f.back,
          backAr: f.backAr || "",
          type: f.type || "",
        });
      });
    }
    res.json(result);
  });

  app.get("/api/admin/data/saved-words", requireAdmin, async (req, res) => {
    const lessonFilter = req.query.lessonId ? parseInt(req.query.lessonId as string) : null;
    if (req.query.lessonId && (lessonFilter === null || isNaN(lessonFilter))) {
      return res.status(400).json({ message: "Noto'g'ri lessonId parametri" });
    }
    const allSaved = await storage.getAllSavedWords();
    const allUsers = await storage.getAllUsers();
    const allLessons = await storage.getAllLessons();
    const userMap = new Map(allUsers.map(u => [u.id, u]));
    const lessonMap = new Map(allLessons.map(l => [l.id, l]));
    const filtered = lessonFilter ? allSaved.filter(sw => sw.lessonId === lessonFilter) : allSaved;
    const result = filtered.map(sw => ({
      id: sw.id,
      word: sw.word,
      normalized: sw.normalized,
      translationUz: sw.translationUz,
      translationAr: sw.translationAr,
      contextualMeaning: sw.contextualMeaning,
      partOfSpeech: sw.partOfSpeech,
      sourceSentence: sw.sourceSentence,
      isLearned: sw.isLearned,
      userName: userMap.get(sw.userId)?.fullName || "Noma'lum",
      lessonTitle: lessonMap.get(sw.lessonId)?.title || "Noma'lum",
      lessonId: sw.lessonId,
      createdAt: sw.createdAt,
    }));
    res.json(result);
  });

  app.get("/api/admin/data/wordmaps", requireAdmin, async (req, res) => {
    const allLessons = await storage.getAllLessons();
    const lessonFilter = req.query.lessonId ? parseInt(req.query.lessonId as string) : null;
    const wordMapAgg = new Map<string, { word: string; normalized: string; translationUz: string; translationAr: string; contextualMeaning: string; count: number; lessonIds: Set<number>; lessonTitles: Map<number, string> }>();
    for (const lesson of allLessons) {
      if (lessonFilter && lesson.id !== lessonFilter) continue;
      const sents = (lesson.sentenceAnalysisJson as any[]) || [];
      sents.forEach((s: any) => {
        if (!s.wordMap) return;
        s.wordMap.forEach((wm: any) => {
          const key = (wm.normalized || wm.word || "").toLowerCase();
          if (!key) return;
          const existing = wordMapAgg.get(key);
          if (existing) {
            existing.count++;
            existing.lessonIds.add(lesson.id);
            existing.lessonTitles.set(lesson.id, lesson.title);
          } else {
            const titles = new Map<number, string>();
            titles.set(lesson.id, lesson.title);
            wordMapAgg.set(key, {
              word: wm.word,
              normalized: wm.normalized || wm.word,
              translationUz: wm.translationUz || "",
              translationAr: wm.translationAr || "",
              contextualMeaning: wm.contextualMeaning || "",
              count: 1,
              lessonIds: new Set([lesson.id]),
              lessonTitles: titles,
            });
          }
        });
      });
    }
    const result = Array.from(wordMapAgg.values()).map(v => ({
      word: v.word,
      normalized: v.normalized,
      translationUz: v.translationUz,
      translationAr: v.translationAr,
      contextualMeaning: v.contextualMeaning,
      count: v.count,
      lessons: Array.from(v.lessonTitles.values()),
      lessonCount: v.lessonIds.size,
    }));
    result.sort((a, b) => b.count - a.count);
    res.json(result);
  });

  app.get("/api/lessons/public/:id", async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Noto'g'ri ID" });
    let lesson = await storage.getLessonById(id);
    if (!lesson || lesson.status !== "published") return res.status(404).json({ message: "Dars topilmadi" });

    if (lesson.manualTranscript) {
      const existingSubs = lesson.subtitlesJson as { text: string }[] | null;
      const needsReparse = !existingSubs || existingSubs.some(s => /\d+\s+(soniya|daqiqa|секунд|минут)/i.test(s.text));
      if (needsReparse) {
        try {
          const manualResult = processManualTranscript(lesson.manualTranscript);
          if (manualResult.timedSubtitles && manualResult.timedSubtitles.length > 0) {
            lesson = await storage.updateLesson(id, {
              subtitlesJson: manualResult.timedSubtitles,
              transcript: manualResult.text,
            });
          }
        } catch {}
      }
    }

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

  // ─── Collections (Papkalar) ───

  const createCollectionSchema = z.object({
    name: z.string().min(1, "Papka nomi kiritilishi shart"),
    description: z.string().optional(),
    coverImage: z.string().optional(),
    targetLanguage: z.enum(["ar", "en"]).default("ar"),
    level: z.enum(["beginner", "intermediate", "advanced"]).default("beginner"),
    sortOrder: z.number().int().min(0).optional(),
  });

  app.get("/api/admin/collections", requireAdmin, async (_req, res) => {
    const allCollections = await storage.getAllCollections();
    const withCreator = await Promise.all(
      allCollections.map(async (c) => {
        const creator = c.createdBy ? await storage.getUser(c.createdBy) : null;
        const cls = await storage.getCollectionLessons(c.id);
        return { ...c, creatorName: creator?.fullName || "Noma'lum", lessonCount: cls.length };
      })
    );
    res.json(withCreator.sort((a, b) => a.sortOrder - b.sortOrder));
  });

  app.patch("/api/admin/collections/:id", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Noto'g'ri ID" });
    const collection = await storage.getCollectionById(id);
    if (!collection) return res.status(404).json({ message: "Papka topilmadi" });
    const { status, name, description, coverImage, targetLanguage, level, sortOrder } = req.body;
    const validLangs = ["ar", "en"];
    const validLevels = ["beginner", "intermediate", "advanced"];
    const updateData: Record<string, unknown> = {};
    if (status !== undefined) {
      const validStatuses = ["draft", "pending", "approved", "published"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Noto'g'ri status" });
      }
      updateData.status = status;
    }
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (coverImage !== undefined) updateData.coverImage = coverImage;
    if (targetLanguage !== undefined) {
      if (!validLangs.includes(targetLanguage)) return res.status(400).json({ message: "Noto'g'ri til" });
      updateData.targetLanguage = targetLanguage;
    }
    if (level !== undefined) {
      if (!validLevels.includes(level)) return res.status(400).json({ message: "Noto'g'ri daraja" });
      updateData.level = level;
    }
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    const updated = await storage.updateCollection(id, updateData);
    res.json(updated);
  });

  app.delete("/api/admin/collections/:id", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Noto'g'ri ID" });
    const collection = await storage.getCollectionById(id);
    if (!collection) return res.status(404).json({ message: "Papka topilmadi" });
    await storage.deleteCollection(id);
    res.json({ success: true });
  });

  app.post("/api/user/collections", requireAuth, async (req, res) => {
    const parsed = createCollectionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
    const collection = await storage.createCollection({
      ...parsed.data,
      createdBy: req.session.userId,
      status: "draft",
    });
    res.status(201).json(collection);
  });

  app.get("/api/user/collections", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const user = await storage.getUser(userId);
    let userCollections;
    if (user?.role === "admin") {
      userCollections = await storage.getAllCollections();
    } else {
      userCollections = await storage.getCollectionsByUser(userId);
    }
    const withLessons = await Promise.all(
      userCollections.map(async (c) => {
        const cls = await storage.getCollectionLessons(c.id);
        return { ...c, lessonCount: cls.length };
      })
    );
    res.json(withLessons.sort((a, b) => a.sortOrder - b.sortOrder));
  });

  app.get("/api/user/collections/:id", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Noto'g'ri ID" });
    const collection = await storage.getCollectionById(id);
    if (!collection) return res.status(404).json({ message: "Papka topilmadi" });
    const userId = req.session.userId!;
    const user = await storage.getUser(userId);
    if (collection.createdBy !== userId && user?.role !== "admin") {
      return res.status(403).json({ message: "Ruxsat yo'q" });
    }
    const cls = await storage.getCollectionLessons(collection.id);
    const allLessons = await Promise.all(
      cls.sort((a, b) => a.orderIndex - b.orderIndex).map(async (cl) => {
        const lesson = await storage.getLessonById(cl.lessonId);
        return lesson ? { ...lesson, orderIndex: cl.orderIndex } : null;
      })
    );
    res.json({ ...collection, lessons: allLessons.filter(Boolean) });
  });

  app.patch("/api/user/collections/:id", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Noto'g'ri ID" });
    const collection = await storage.getCollectionById(id);
    if (!collection) return res.status(404).json({ message: "Papka topilmadi" });
    const userId = req.session.userId!;
    const user = await storage.getUser(userId);
    if (collection.createdBy !== userId && user?.role !== "admin") {
      return res.status(403).json({ message: "Ruxsat yo'q" });
    }
    const { name, description, coverImage, targetLanguage, level, sortOrder, status } = req.body;
    const validLangs = ["ar", "en"];
    const validLevels = ["beginner", "intermediate", "advanced"];
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (coverImage !== undefined) updateData.coverImage = coverImage;
    if (targetLanguage !== undefined) {
      if (!validLangs.includes(targetLanguage)) return res.status(400).json({ message: "Noto'g'ri til" });
      updateData.targetLanguage = targetLanguage;
    }
    if (level !== undefined) {
      if (!validLevels.includes(level)) return res.status(400).json({ message: "Noto'g'ri daraja" });
      updateData.level = level;
    }
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    if (status !== undefined) {
      const isAdmin = user?.role === "admin";
      const validTransitions: Record<string, string[]> = isAdmin
        ? { draft: ["approved", "pending"], pending: ["approved", "draft"], approved: ["published", "draft"], published: ["approved", "draft"] }
        : { draft: ["pending"], approved: ["published"], published: ["approved"] };
      const allowed = validTransitions[collection.status] || [];
      if (!allowed.includes(status)) {
        return res.status(400).json({ message: `Status o'zgarishi mumkin emas: ${collection.status} → ${status}` });
      }
      updateData.status = status;
    }
    const updated = await storage.updateCollection(id, updateData);
    res.json(updated);
  });

  app.delete("/api/user/collections/:id", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Noto'g'ri ID" });
    const collection = await storage.getCollectionById(id);
    if (!collection) return res.status(404).json({ message: "Papka topilmadi" });
    const userId = req.session.userId!;
    const user = await storage.getUser(userId);
    if (collection.createdBy !== userId && user?.role !== "admin") {
      return res.status(403).json({ message: "Ruxsat yo'q" });
    }
    await storage.deleteCollection(id);
    res.json({ success: true });
  });

  app.post("/api/user/collections/:id/lessons", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Noto'g'ri ID" });
    const collection = await storage.getCollectionById(id);
    if (!collection) return res.status(404).json({ message: "Papka topilmadi" });
    const userId = req.session.userId!;
    const user = await storage.getUser(userId);
    if (collection.createdBy !== userId && user?.role !== "admin") {
      return res.status(403).json({ message: "Ruxsat yo'q" });
    }
    const { lessonId, orderIndex } = req.body;
    if (!lessonId) return res.status(400).json({ message: "lessonId majburiy" });
    const lesson = await storage.getLessonById(lessonId);
    if (!lesson) return res.status(404).json({ message: "Dars topilmadi" });
    if (lesson.createdBy !== userId && user?.role !== "admin") {
      return res.status(403).json({ message: "Faqat o'z darslaringizni qo'shishingiz mumkin" });
    }
    try {
      const cl = await storage.addLessonToCollection(id, lessonId, orderIndex ?? 0);
      res.status(201).json(cl);
    } catch (err: unknown) {
      const e = err as { message?: string; code?: string };
      if (e.message?.includes("duplicate") || e.code === "23505") {
        return res.status(409).json({ message: "Bu dars allaqachon papkada mavjud" });
      }
      throw err;
    }
  });

  app.delete("/api/user/collections/:id/lessons/:lessonId", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    const lessonId = parseInt(req.params.lessonId as string);
    if (isNaN(id) || isNaN(lessonId)) return res.status(400).json({ message: "Noto'g'ri ID" });
    const collection = await storage.getCollectionById(id);
    if (!collection) return res.status(404).json({ message: "Papka topilmadi" });
    const userId = req.session.userId!;
    const user = await storage.getUser(userId);
    if (collection.createdBy !== userId && user?.role !== "admin") {
      return res.status(403).json({ message: "Ruxsat yo'q" });
    }
    await storage.removeLessonFromCollection(id, lessonId);
    res.json({ success: true });
  });

  app.put("/api/user/collections/:id/lessons/order", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Noto'g'ri ID" });
    const collection = await storage.getCollectionById(id);
    if (!collection) return res.status(404).json({ message: "Papka topilmadi" });
    const userId = req.session.userId!;
    const user = await storage.getUser(userId);
    if (collection.createdBy !== userId && user?.role !== "admin") {
      return res.status(403).json({ message: "Ruxsat yo'q" });
    }
    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ message: "items massiv bo'lishi kerak" });
    for (const item of items) {
      await storage.updateCollectionLessonOrder(id, item.lessonId, item.orderIndex);
    }
    res.json({ success: true });
  });

  app.get("/api/collections/public", async (req, res) => {
    const { targetLanguage } = req.query;
    let published = await storage.getPublishedCollections();
    if (targetLanguage && typeof targetLanguage === "string") {
      published = published.filter(c => c.targetLanguage === targetLanguage);
    }
    const progressData: Record<number, number> = {};
    if (req.session?.userId) {
      const userProgress = await storage.getProgressByUser(req.session.userId);
      userProgress.forEach(p => { progressData[p.lessonId] = p.completionPercent ?? 0; });
    }
    const withMeta = await Promise.all(
      published.map(async (c) => {
        const cls = await storage.getCollectionLessons(c.id);
        const creator = c.createdBy ? await storage.getUser(c.createdBy) : null;
        let completionPercent = 0;
        if (cls.length > 0 && Object.keys(progressData).length > 0) {
          const total = cls.reduce((sum, cl) => sum + (progressData[cl.lessonId] ?? 0), 0);
          completionPercent = Math.round(total / cls.length);
        }
        return {
          ...c,
          lessonCount: cls.length,
          creatorName: creator?.fullName || "Noma'lum",
          completionPercent,
        };
      })
    );
    res.json(withMeta.sort((a, b) => a.sortOrder - b.sortOrder));
  });

  app.get("/api/collections/public/:id", async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Noto'g'ri ID" });
    const collection = await storage.getCollectionById(id);
    if (!collection || collection.status !== "published") {
      return res.status(404).json({ message: "Papka topilmadi" });
    }
    const cls = await storage.getCollectionLessons(collection.id);
    const lessonsRaw = await Promise.all(
      cls.sort((a, b) => a.orderIndex - b.orderIndex).map(async (cl) => {
        const lesson = await storage.getLessonById(cl.lessonId);
        if (!lesson || lesson.status !== "published") return null;
        return { ...lesson, orderIndex: cl.orderIndex };
      })
    );
    const creator = collection.createdBy ? await storage.getUser(collection.createdBy) : null;
    const progressData: Record<number, number> = {};
    if (req.session?.userId) {
      const userProgress = await storage.getProgressByUser(req.session.userId);
      userProgress.forEach(p => { progressData[p.lessonId] = p.completionPercent ?? 0; });
    }
    const lessons = lessonsRaw.filter((l): l is NonNullable<typeof l> => l !== null).map((l) => ({
      ...l,
      completionPercent: progressData[l.id] ?? 0,
    }));
    res.json({
      ...collection,
      creatorName: creator?.fullName || "Noma'lum",
      lessons,
      lessonCount: lessons.length,
    });
  });

  return httpServer;
}
