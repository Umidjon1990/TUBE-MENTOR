import type { Express } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { pool } from "./db";
import { verifyPassword, requireAuth, requireAdmin } from "./auth";

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

  app.get("/api/user/progress", requireAuth, async (req, res) => {
    const progress = await storage.getProgressByUser(req.session.userId!);
    res.json(progress);
  });

  return httpServer;
}
