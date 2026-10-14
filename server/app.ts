import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import session from "express-session";
import memorystore from "memorystore";
import connectPgSimple from "connect-pg-simple";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { registerRoutes } from "./routes";
import { migrateDatabase } from "./migrate";
import { apiSecurity, rateLimit } from "./security";
import { registerAuthRoutes } from "./auth-routes";
import { registerLearningRoutes } from "./learning-routes";
import { log } from "./logger";
import { pool } from "./db";
import { optionalAuth } from "./auth";

export async function createApplication(
  options: { production?: boolean; seed?: boolean } = {},
) {
  const production =
    options.production ?? process.env.NODE_ENV === "production";
  if (
    production &&
    (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
  )
    throw new Error(
      "SESSION_SECRET must contain at least 32 characters in production",
    );
  if (
    production &&
    (!process.env.APP_URL || !process.env.APP_URL.startsWith("https://"))
  )
    throw new Error("APP_URL must be an https:// URL in production");
  await migrateDatabase();
  const app = express();
  const httpServer = createServer(app);
  if (production) app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(express.json({ limit: "10mb" }));
  const MemoryStore = memorystore(session);
  const PgStore = connectPgSimple(session);
  app.use(
    session({
      secret: process.env.SESSION_SECRET || randomBytes(32).toString("hex"),
      resave: false,
      saveUninitialized: false,
      store: production
        ? new PgStore({
            pool,
            createTableIfMissing: false,
            tableName: "session",
          })
        : new MemoryStore({ checkPeriod: 86400000 }),
      cookie: {
        secure: production,
        httpOnly: true,
        sameSite: "lax",
        maxAge: 7 * 86400000,
      },
    }),
  );
  app.use(apiSecurity);
  app.use("/api", optionalAuth);
  app.use("/api/auth", rateLimit("auth", 120, 900));
  app.use((req, res, next) => {
    if (
      /\/api\/user\/lessons\/\d+\/(generate|whisper-transcribe|whisper-audio-upload)$/.test(
        req.path,
      )
    )
      return rateLimit("ai", 6, 300)(req, res, next);
    next();
  });
  app.use((req, res, next) => {
    const started = Date.now();
    res.on("finish", () => {
      if (req.path.startsWith("/api"))
        log(
          `${req.method} ${req.path} ${res.statusCode} ${Date.now() - started}ms`,
        );
    });
    next();
  });
  if (
    options.seed !== false &&
    !production &&
    process.env.ENABLE_DEMO_SEED === "true"
  ) {
    const { seedDemo } = await import("./demo-data");
    await seedDemo();
  }
  await registerAuthRoutes(app);
  await registerLearningRoutes(app);
  await registerRoutes(httpServer, app);
  app.use("/api", (_req, res) => {
    res.status(404).json({ message: "API yo‘li topilmadi" });
  });
  app.use((error: any, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(error);
    const status = Number(
      error.status ||
        error.statusCode ||
        (error.name === "ZodError"
          ? 400
          : error.code === "23505"
            ? 409
            : error.code === "23503"
              ? 400
              : error.code === "LIMIT_FILE_SIZE"
                ? 413
                : error.name === "MulterError"
                  ? 400
                  : 500),
    );
    console.error("Request failed", {
      status,
      name: error.name,
      code: error.code,
    });
    res.status(status).json({
      message:
        status < 500
          ? error.code === "23505"
            ? "Bu ma’lumot allaqachon mavjud"
            : error.code === "23503"
              ? "Bog‘langan ma’lumot topilmadi"
              : error.code === "LIMIT_FILE_SIZE"
                ? "Fayl hajmi ruxsat etilgan limitdan oshdi"
                : error.name === "ZodError"
                  ? error.issues?.[0]?.message ||
                    "Ma’lumot formatini tekshiring"
                  : error.message
          : "Tizimda xatolik yuz berdi. Qayta urinib ko‘ring.",
    });
  });
  return { app, httpServer };
}
