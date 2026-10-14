import type { Express, Request } from "express";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { authTokens, users, type User } from "@shared/schema";
import {
  hashPassword,
  verifyPassword,
  requireAuth,
  hasVerifiedIdentity,
} from "./auth";
import { localDay } from "@shared/learning";
import { rateLimit } from "./security";
import { registerSocialAuthRoutes, socialProviderEnabled } from "./social-auth";

export function safeUser(user: User) {
  const { passwordHash, googleId, telegramId, sessionVersion, ...safe } = user;
  const today = localDay(new Date(), user.timezone);
  const yesterday = new Date(Date.parse(`${today}T12:00:00Z`) - 86400000)
    .toISOString()
    .slice(0, 10);
  return {
    ...safe,
    linkedAccounts: {
      google: Boolean(googleId),
      telegram: Boolean(telegramId),
    },
    streakDays: [today, yesterday].includes(user.lastStudyDate || "")
      ? user.streakDays
      : 0,
  };
}
const emailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((s) => s.toLowerCase());
const passwordSchema = z
  .string()
  .min(10, "Parol kamida 10 belgidan iborat bo‘lsin")
  .max(128);
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const mailEnabled = () =>
  Boolean(
    process.env.RESEND_API_KEY && process.env.MAIL_FROM && process.env.APP_URL,
  );
type Mail = { to: string; subject: string; text: string; key: string };
let testMailer: ((mail: Mail) => Promise<void>) | undefined;
export function setTestMailer(fn: (mail: Mail) => Promise<void>) {
  if (process.env.NODE_ENV !== "test")
    throw new Error("Test mail transport is test-only");
  testMailer = fn;
}
async function sendMail(mail: Mail) {
  if (process.env.NODE_ENV === "test" && testMailer) return testMailer(mail);
  if (!mailEnabled())
    throw Object.assign(new Error("Email xizmati hali sozlanmagan"), {
      status: 503,
    });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": mail.key,
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
      to: [mail.to],
      subject: mail.subject,
      text: mail.text,
    }),
  });
  if (!response.ok)
    throw Object.assign(
      new Error("Email yuborilmadi. Qayta yuborishni tanlang."),
      { status: 502 },
    );
}
async function issueToken(user: User, purpose: "verify" | "reset") {
  const token = randomBytes(32).toString("base64url");
  await db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(authTokens.userId, user.id),
        eq(authTokens.purpose, purpose),
        isNull(authTokens.usedAt),
      ),
    );
  await db.insert(authTokens).values({
    userId: user.id,
    tokenHash: digest(token),
    purpose,
    expiresAt: new Date(
      Date.now() + (purpose === "verify" ? 86400000 : 3600000),
    ),
  });
  const link = `${process.env.APP_URL!.replace(/\/$/, "")}/${purpose === "verify" ? "verify-email" : "reset-password"}?token=${token}`;
  await sendMail({
    to: user.email!,
    subject:
      purpose === "verify"
        ? "TUBE MENTOR — emailni tasdiqlash"
        : "TUBE MENTOR — parolni tiklash",
    text: `${purpose === "verify" ? "Hisobingizni tasdiqlash" : "Yangi parol o‘rnatish"} uchun havolani oching:\n${link}\n\nBu so‘rovni siz yubormagan bo‘lsangiz, xabarni e’tiborsiz qoldiring.`,
    key: `${purpose}-${digest(token)}`,
  });
}
export async function establishSession(req: Request, user: User) {
  await new Promise<void>((resolve, reject) =>
    req.session.regenerate((e) => (e ? reject(e) : resolve())),
  );
  req.session.userId = user.id;
  req.session.userRole = user.role;
  req.session.authVersion = user.sessionVersion;
  await new Promise<void>((resolve, reject) =>
    req.session.save((e) => (e ? reject(e) : resolve())),
  );
}

export async function registerAuthRoutes(app: Express) {
  app.post("/api/auth/logout", (req, res, next) => {
    req.session.destroy((error) => {
      if (error) return next(error);
      res.clearCookie("connect.sid", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
      res.json({ message: "Hisobdan chiqildi" });
    });
  });
  app.get("/api/auth/config", (_req, res) => {
    res.json({
      googleEnabled: socialProviderEnabled("google"),
      telegramEnabled: socialProviderEnabled("telegram"),
      socialSignupEnabled: process.env.ALLOW_SIGNUP !== "false",
      emailEnabled: mailEnabled(),
      signupEnabled: process.env.ALLOW_SIGNUP !== "false" && mailEnabled(),
    });
  });
  app.post("/api/auth/login", rateLimit("login", 20, 900), async (req, res) => {
    const parsed = z
      .object({
        username: z.string().trim().min(1).max(254),
        password: z.string().min(1).max(128),
      })
      .safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: "Login va parolni kiriting" });
    const username = parsed.data.username;
    const [user] = await db
      .select()
      .from(users)
      .where(
        username.includes("@")
          ? eq(users.email, username.toLowerCase())
          : eq(users.username, username),
      );
    if (!user || !verifyPassword(parsed.data.password, user.passwordHash))
      return res.status(401).json({ message: "Noto‘g‘ri login yoki parol" });
    if (!user.isActive)
      return res.status(403).json({ message: "Hisob bloklangan" });
    if (!hasVerifiedIdentity(user))
      return res.status(403).json({
        message: "Avval emailingizni tasdiqlang",
        code: "EMAIL_NOT_VERIFIED",
      });
    const [updated] = await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id))
      .returning();
    await establishSession(req, updated);
    res.json(safeUser(updated));
  });
  app.get("/api/auth/me", requireAuth, async (req, res) => {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.session.userId!));
    res.json(safeUser(user));
  });
  app.post("/api/auth/register", async (req, res) => {
    if (process.env.ALLOW_SIGNUP === "false" || !mailEnabled())
      return res.status(503).json({
        message:
          "Ro‘yxatdan o‘tish hali yoqilmagan. Markazdan hisob olish mumkin.",
      });
    const parsed = z
      .object({
        fullName: z.string().trim().min(2).max(100),
        email: emailSchema,
        password: passwordSchema,
        acceptedTerms: z.literal(true),
      })
      .safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.issues[0].message });
    const { fullName, email, password } = parsed.data;
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, email));
    if (existing)
      return res.status(409).json({
        message:
          "Bu email uchun hisob mavjud. Kirish yoki parolni tiklashni tanlang.",
      });
    const [user] = await db
      .insert(users)
      .values({
        fullName,
        email,
        username: `student_${randomBytes(8).toString("hex")}`,
        passwordHash: hashPassword(password),
        role: "student",
        emailVerified: false,
      })
      .returning();
    await issueToken(user, "verify");
    res
      .status(201)
      .json({ message: "Tasdiqlash havolasi emailingizga yuborildi" });
  });
  app.post("/api/auth/resend-verification", async (req, res) => {
    const parsed = emailSchema.safeParse(req.body.email);
    if (!parsed.success)
      return res.status(400).json({ message: "To‘g‘ri email kiriting" });
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, parsed.data));
    if (user && !user.emailVerified && user.isActive)
      await issueToken(user, "verify");
    res.json({
      message: "Hisob tasdiqlanishi kerak bo‘lsa, yangi havola yuborildi",
    });
  });
  app.post("/api/auth/verify-email", async (req, res) => {
    const parsed = z.string().min(30).max(128).safeParse(req.body.token);
    if (!parsed.success)
      return res.status(400).json({ message: "Tasdiqlash havolasi noto‘g‘ri" });
    const user = await db.transaction(async (tx) => {
      const [token] = await tx
        .select()
        .from(authTokens)
        .where(
          and(
            eq(authTokens.tokenHash, digest(parsed.data)),
            eq(authTokens.purpose, "verify"),
            isNull(authTokens.usedAt),
            gt(authTokens.expiresAt, new Date()),
          ),
        )
        .for("update");
      if (!token) return null;
      await tx
        .update(authTokens)
        .set({ usedAt: new Date() })
        .where(eq(authTokens.id, token.id));
      const [updated] = await tx
        .update(users)
        .set({ emailVerified: true, updatedAt: new Date() })
        .where(and(eq(users.id, token.userId), eq(users.isActive, true)))
        .returning();
      return updated;
    });
    if (!user)
      return res.status(400).json({
        message: "Havola eskirgan yoki ishlatilgan. Yangi havola so‘rang.",
      });
    await establishSession(req, user);
    res.json(safeUser(user));
  });
  app.post("/api/auth/forgot-password", async (req, res) => {
    const parsed = emailSchema.safeParse(req.body.email);
    if (!parsed.success)
      return res.status(400).json({ message: "To‘g‘ri email kiriting" });
    if (!mailEnabled())
      return res.status(503).json({
        message: "Email xizmati hali sozlanmagan. Markazga murojaat qiling.",
      });
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, parsed.data));
    if (user?.isActive && user.emailVerified) await issueToken(user, "reset");
    res.json({
      message: "Hisob mavjud bo‘lsa, tiklash havolasi emailingizga yuborildi",
    });
  });
  app.post("/api/auth/reset-password", async (req, res) => {
    const parsed = z
      .object({ token: z.string().min(30).max(128), password: passwordSchema })
      .safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.issues[0].message });
    const success = await db.transaction(async (tx) => {
      const [token] = await tx
        .select()
        .from(authTokens)
        .where(
          and(
            eq(authTokens.tokenHash, digest(parsed.data.token)),
            eq(authTokens.purpose, "reset"),
            isNull(authTokens.usedAt),
            gt(authTokens.expiresAt, new Date()),
          ),
        )
        .for("update");
      if (!token) return false;
      await tx
        .update(authTokens)
        .set({ usedAt: new Date() })
        .where(eq(authTokens.id, token.id));
      const changed = await tx
        .update(users)
        .set({
          passwordHash: hashPassword(parsed.data.password),
          sessionVersion: sql`${users.sessionVersion} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(users.id, token.userId), eq(users.isActive, true)))
        .returning();
      return changed.length > 0;
    });
    if (!success)
      return res
        .status(400)
        .json({ message: "Havola eskirgan yoki ishlatilgan" });
    req.session.destroy(() => {});
    res.clearCookie("connect.sid");
    res.json({ message: "Parol yangilandi. Yangi parol bilan kiring." });
  });
  registerSocialAuthRoutes(app, establishSession);
}
