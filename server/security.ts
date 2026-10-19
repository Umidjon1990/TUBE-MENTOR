import type { Request, Response, NextFunction } from "express";
import { createHash } from "node:crypto";
import { pool } from "./db";

export function apiSecurity(req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), geolocation=(), microphone=(self)",
  );
  if (req.path.startsWith("/api")) res.setHeader("Cache-Control", "no-store");
  if (
    req.path.startsWith("/api") &&
    !["GET", "HEAD", "OPTIONS"].includes(req.method)
  ) {
    const origin = req.get("origin");
    const configured = process.env.APP_URL
      ? new URL(process.env.APP_URL).origin
      : undefined;
    const local = `${req.protocol}://${req.get("host")}`;
    if (
      origin &&
      origin !== (configured || local) &&
      !(req.platformEditor && origin === local)
    )
      return res
        .status(403)
        .json({ message: "So‘rov manbasi ruxsat etilmagan" });
    if (
      !req.path.startsWith("/api/upload/") &&
      !req.path.endsWith("/whisper-audio-upload") &&
      !/^\/api\/platform\/owned\/[^/]+\/native\//.test(req.path) &&
      !/^\/api\/commerce\/orders\/[0-9a-f-]{36}\/receipt$/.test(req.path) &&
      !req.is("application/json")
    ) {
      return res.status(415).json({ message: "JSON so‘rov talab qilinadi" });
    }
  }
  next();
}

/** PostgreSQL-backed: the limit also holds when the application has multiple instances. */
export function rateLimit(
  scope: string,
  maximum: number,
  windowSeconds: number,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
    const identity = scope === "auth" ? req.ip : req.session?.userId || req.ip;
    const key = createHash("sha256")
      .update(`${scope}:${identity}:${bucket}`)
      .digest("hex");
    try {
      const result = await pool.query(
        "INSERT INTO api_rate_limits(key,hits,expires_at) VALUES($1,1,now()+($2*interval '1 second')) ON CONFLICT(key) DO UPDATE SET hits=api_rate_limits.hits+1 RETURNING hits",
        [key, windowSeconds],
      );
      if (result.rows[0].hits > maximum) {
        res.setHeader(
          "Retry-After",
          String(
            windowSeconds - (Math.floor(Date.now() / 1000) % windowSeconds),
          ),
        );
        return res.status(429).json({
          message: "So‘rovlar ko‘paydi. Birozdan so‘ng qayta urinib ko‘ring.",
        });
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
