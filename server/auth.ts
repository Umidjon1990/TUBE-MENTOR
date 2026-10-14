import { scryptSync, randomBytes, timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import type { User } from "@shared/schema";

declare module "express-session" {
  interface SessionData {
    userId: string;
    userRole: string;
    authVersion: number;
    socialLogin: {
      provider: "google" | "telegram";
      state: string;
      nonce: string;
      verifier: string;
      expires: number;
      linkUserId?: string;
      authVersion?: number;
    };
  }
}

/** A verified provider identity also authenticates users who have no email. */
export function hasVerifiedIdentity(user: User): boolean {
  return user.emailVerified || Boolean(user.googleId || user.telegramId);
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const parts = storedHash.split(":");
    if (parts.length !== 2) return false;
    const [salt, hash] = parts;
    if (!salt || !hash) return false;
    const hashBuffer = Buffer.from(hash, "hex");
    if (hashBuffer.length !== 64) return false;
    const suppliedBuffer = scryptSync(password, salt, 64);
    return timingSafeEqual(hashBuffer, suppliedBuffer);
  } catch {
    return false;
  }
}

/** Public catalogs may carry a session too; remove expired identity before attaching progress. */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (req.session.userId) {
    const user = await storage.getUser(req.session.userId);
    if (
      !user ||
      !user.isActive ||
      !hasVerifiedIdentity(user) ||
      (req.session.authVersion ?? 0) !== user.sessionVersion
    ) {
      delete (req.session as Partial<typeof req.session>).userId;
      delete (req.session as Partial<typeof req.session>).userRole;
      delete (req.session as Partial<typeof req.session>).authVersion;
    } else {
      req.session.userRole = user.role;
      res.locals.validatedUser = user;
    }
  }
  next();
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Avtorizatsiya talab qilinadi" });
  }

  const user =
    res.locals.validatedUser || (await storage.getUser(req.session.userId));
  if (
    !user ||
    !user.isActive ||
    (req.session.authVersion ?? 0) !== user.sessionVersion ||
    !hasVerifiedIdentity(user)
  ) {
    req.session.destroy(() => {});
    return res.status(401).json({
      message: user ? "Hisob bloklangan" : "Avtorizatsiya talab qilinadi",
    });
  }

  req.session.userRole = user.role;
  next();
}

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Avtorizatsiya talab qilinadi" });
  }

  const user =
    res.locals.validatedUser || (await storage.getUser(req.session.userId));
  if (
    !user ||
    !user.isActive ||
    (req.session.authVersion ?? 0) !== user.sessionVersion ||
    !hasVerifiedIdentity(user)
  ) {
    req.session.destroy(() => {});
    return res.status(401).json({
      message: user ? "Hisob bloklangan" : "Avtorizatsiya talab qilinadi",
    });
  }

  if (user.role !== "admin") {
    return res.status(403).json({ message: "Faqat adminlar uchun" });
  }

  req.session.userRole = user.role;
  next();
}

export function requireRole(...roles: string[]) {
  // Content and payment operations are administered centrally. Legacy teacher
  // accounts remain readable accounts without inheriting administrator rights.
  const activeRoles = roles.filter((role) => role !== "teacher");
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Avtorizatsiya talab qilinadi" });
    }

    const user =
      res.locals.validatedUser || (await storage.getUser(req.session.userId));
    if (
      !user ||
      !user.isActive ||
      (req.session.authVersion ?? 0) !== user.sessionVersion ||
      !hasVerifiedIdentity(user)
    ) {
      req.session.destroy(() => {});
      return res.status(401).json({
        message: user ? "Hisob bloklangan" : "Avtorizatsiya talab qilinadi",
      });
    }

    if (!activeRoles.includes(user.role)) {
      return res.status(403).json({ message: "Ruxsat berilmagan" });
    }

    req.session.userRole = user.role;
    next();
  };
}
