import type { Express, Request, Response, NextFunction } from "express";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { pool } from "./db";
import { requireAdmin, hasVerifiedIdentity } from "./auth";
import { storage } from "./storage";

export const editorProviders: Record<
  string,
  { url: string; key: string; label: string }
> = {
  tube: {
    url: "https://tube-mentor-production.up.railway.app",
    key: "PLATFORM_SERVICE_SECRET",
    label: "Tube Mentor",
  },
  courses: {
    url: "https://zamonaviy-videokurs.up.railway.app",
    key: "PLATFORM_COURSES_SECRET",
    label: "Video kurslar",
  },
  arabictest: {
    url: "https://www.arabictest.uz",
    key: "PLATFORM_ARABICTEST_SECRET",
    label: "Arabictest",
  },
  quiz: {
    url: "https://web-production-73482.up.railway.app",
    key: "PLATFORM_QUIZ_SECRET",
    label: "Master Quiz va PDF",
  },
  qomus: {
    url: "https://al-qomusuz-production.up.railway.app",
    key: "PLATFORM_QOMUS_SECRET",
    label: "Al-Qomus",
  },
  portal: {
    url: "https://zamonaviy-talim.up.railway.app",
    key: "PLATFORM_SERVICE_SECRET",
    label: "Asosiy sayt va Shorts",
  },
};
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const opaque = (s: any) =>
  typeof s === "string" && /^[A-Za-z0-9_-]{43}$/.test(s);
const nonce = (s: any) =>
  typeof s === "string" && /^[A-Za-z0-9_-]{32,100}$/.test(s);
const run =
  (fn: (req: any, res: Response) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) =>
    void fn(req, res).catch(next);
async function activeSession(sessionHash: string) {
  const row = (
    await pool.query(
      "SELECT user_id,auth_version FROM platform_sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()",
      [sessionHash],
    )
  ).rows[0];
  if (!row) return null;
  const user = await storage.getUser(row.user_id);
  return user?.isActive &&
    user.role === "admin" &&
    hasVerifiedIdentity(user) &&
    user.sessionVersion === row.auth_version
    ? user
    : null;
}
export async function initializeEditorBroker(app: Express) {
  await pool.query(`CREATE TABLE IF NOT EXISTS platform_editor_codes(code_hash text PRIMARY KEY,provider varchar NOT NULL,nonce text NOT NULL,session_hash text NOT NULL REFERENCES platform_sessions(token_hash),expires_at timestamptz NOT NULL);
 CREATE TABLE IF NOT EXISTS platform_editor_handles(handle_hash text PRIMARY KEY,provider varchar NOT NULL,session_hash text NOT NULL REFERENCES platform_sessions(token_hash),expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
 CREATE INDEX IF NOT EXISTS platform_editor_handles_session_idx ON platform_editor_handles(session_hash);`);
  function source(req: Request, res: Response, next: NextFunction) {
    const p = editorProviders[String(req.body?.provider)],
      expected = p && process.env[p.key],
      given = req.get("x-platform-key") || "";
    if (
      !expected ||
      expected.length < 32 ||
      !given ||
      !timingSafeEqual(Buffer.from(hash(expected)), Buffer.from(hash(given)))
    )
      return res.status(403).json({ message: "Muharrir xizmati ruxsati yo‘q" });
    next();
  }
  // These service endpoints are mounted before the root-only platform identity middleware.
  app.post(
    "/api/platform/editor/redeem",
    source,
    run(async (req, res) => {
      const { provider, code, state } = req.body || {};
      if (!opaque(code) || !nonce(state))
        return res.status(400).json({ message: "Kirish kodi noto‘g‘ri" });
      const row = (
        await pool.query(
          "DELETE FROM platform_editor_codes WHERE code_hash=$1 AND provider=$2 AND nonce=$3 AND expires_at>now() RETURNING session_hash",
          [hash(code), provider, state],
        )
      ).rows[0];
      const user = row && (await activeSession(row.session_hash));
      if (!user)
        return res
          .status(401)
          .json({ message: "Kirish kodi eskirgan yoki hisobdan chiqilgan" });
      const handle = randomBytes(32).toString("base64url"),
        expiresAt = new Date(Date.now() + 8 * 3600000);
      await pool.query(
        "INSERT INTO platform_editor_handles(handle_hash,provider,session_hash,expires_at) VALUES($1,$2,$3,$4)",
        [hash(handle), provider, row.session_hash, expiresAt],
      );
      res.set("Cache-Control", "no-store").json({
        handle,
        expiresAt: expiresAt.toISOString(),
        actor: {
          id: user.id,
          fullName: user.fullName,
          username: user.username,
          role: "admin",
        },
      });
    }),
  );
  app.post(
    "/api/platform/editor/validate",
    source,
    run(async (req, res) => {
      const { provider, handle } = req.body || {};
      if (!opaque(handle))
        return res.status(401).json({ message: "Muharrir sessiyasi yo‘q" });
      const row = (
        await pool.query(
          "SELECT session_hash FROM platform_editor_handles WHERE handle_hash=$1 AND provider=$2 AND expires_at>now()",
          [hash(handle), provider],
        )
      ).rows[0];
      const user = row && (await activeSession(row.session_hash));
      if (!user)
        return res
          .status(401)
          .json({ message: "Asosiy hisobdan qayta kiring" });
      res.set("Cache-Control", "no-store").json({
        actor: {
          id: user.id,
          fullName: user.fullName,
          username: user.username,
          role: "admin",
        },
      });
    }),
  );
  app.post(
    "/api/platform/editor/revoke",
    source,
    run(async (req, res) => {
      if (opaque(req.body?.handle))
        await pool.query(
          "DELETE FROM platform_editor_handles WHERE handle_hash=$1 AND provider=$2",
          [hash(req.body.handle), req.body.provider],
        );
      res.json({ success: true });
    }),
  );
}
export function registerEditorAuthorization(app: Express) {
  app.get("/api/platform/admin/editors", requireAdmin, (_req, res) =>
    res.json({
      editors: Object.entries(editorProviders).map(([id, p]) => ({
        id,
        label: p.label,
        configured: (process.env[p.key] || "").length >= 32,
      })),
    }),
  );
  app.post(
    "/api/platform/editor/:provider/authorize",
    requireAdmin,
    run(async (req, res) => {
      const provider = String(req.params.provider),
        p = editorProviders[provider],
        token = req.get("x-platform-session"),
        state = req.body?.state;
      if (!p || (process.env[p.key] || "").length < 32)
        return res.status(503).json({ message: "Muharrir hali ulanmagan" });
      if (!opaque(token) || !nonce(state))
        return res
          .status(400)
          .json({ message: "Asosiy kabinetdan kirish kerak" });
      const sessionHash = hash(token),
        user = await activeSession(sessionHash);
      if (!user || user.id !== req.session.userId)
        return res.status(401).json({ message: "Hisobga qayta kiring" });
      const code = randomBytes(32).toString("base64url");
      await pool.query(
        "INSERT INTO platform_editor_codes(code_hash,provider,nonce,session_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval '60 seconds')",
        [hash(code), provider, state, sessionHash],
      );
      await pool.query(
        "DELETE FROM platform_editor_codes WHERE expires_at<now()",
      );
      await pool.query(
        "DELETE FROM platform_editor_handles WHERE expires_at<now()",
      );
      const target = new URL("/api/platform/editor/complete", p.url);
      target.searchParams.set("code", code);
      target.searchParams.set("state", state);
      res.set("Cache-Control", "no-store").json({ url: target.href });
    }),
  );
}
