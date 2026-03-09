import type { Express } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { pool } from "./db";
import { verifyPassword, requireAdmin, requireAuth, hashPassword } from "./auth";
import { z } from "zod";

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

  app.get("/api/user/progress", requireAuth, async (req, res) => {
    const progress = await storage.getProgressByUser(req.session.userId!);
    res.json(progress);
  });

  return httpServer;
}
