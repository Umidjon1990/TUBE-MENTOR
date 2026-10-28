import {coerceLessonPackage} from '../shared/experience-package';
import type { Express } from "express";
import { z } from "zod";
import { pool } from "./db";
import { requireAdmin } from "./auth";
import { lessonPackageSchema } from "../shared/content-validation";
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T00:00:00Z");
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Sana noto‘g‘ri");
export function reportPeriod(from: unknown, to: unknown) {
  const end = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const start = new Date(Date.parse(end) - 29 * 86400000)
    .toISOString()
    .slice(0, 10);
  const a = day.parse(from || start),
    b = day.parse(to || end);
  if (a > b || Date.parse(b) - Date.parse(a) > 366 * 86400000)
    throw Object.assign(Error("Davr 1–367 kun oralig‘ida bo‘lsin"), {
      status: 400,
    });
  return { from: a, to: b };
}
export function registerAdminDesk(app: Express) {
  app.post(
    "/api/platform/admin/desk/validate-lesson",
    requireAdmin,
    (req, res) => {
      const parsed = lessonPackageSchema.safeParse(coerceLessonPackage(req.body.package));
      if (!parsed.success)
        return res
          .status(400)
          .json({
            message: parsed.error.issues.map((i) => i.message).join("; "),
            issues: parsed.error.issues,
          });
      const { metadata, content } = parsed.data;
      res.json({
        metadata,
        counts: {
          subtitles: content.subtitles.length,
          vocabulary: content.vocabulary.length,
          quizzes: content.quizzes.length,
          sentenceAnalysis: content.sentenceAnalysis.length,
          ...(parsed.data.experience?{experienceQuestions:parsed.data.experience.questions.length,experienceCards:parsed.data.experience.words.length}:{}),
        },
      });
    },
  );

  app.get(
    "/api/platform/admin/desk/summary",
    requireAdmin,
    async (req, res, next) => {
      try {
        const period = reportPeriod(req.query.from, req.query.to);
        const c = await pool.connect();
        try {
          await c.query(
            "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
          );
          const window =
            " BETWEEN ($1::date::timestamp AT TIME ZONE 'Asia/Tashkent') AND (($2::date+1)::timestamp AT TIME ZONE 'Asia/Tashkent')-interval '1 microsecond'";
          const payment = (
            await c.query(
              `SELECT COALESCE(sum(price_uzs),0)::text AS gross_uzs,COALESCE(sum(coins),0)::text AS issued_coins FROM payment_orders WHERE status IN('approved','partially_refunded','refunded') AND (reviewed_at AT TIME ZONE 'UTC')${window}`,
              [period.from, period.to],
            )
          ).rows[0];
          const ledger = (
            await c.query(
              `SELECT type,COALESCE(sum(amount),0)::text AS amount,count(*)::int AS count FROM coin_transactions WHERE (created_at AT TIME ZONE 'UTC')${window} GROUP BY type`,
              [period.from, period.to],
            )
          ).rows;
          const counts = (
            await c.query(
              `SELECT (SELECT count(*)::int FROM users WHERE role='student') AS students,(SELECT count(*)::int FROM platform_products WHERE status='published') AS published,(SELECT count(*)::int FROM platform_products WHERE status='draft') AS drafts,(SELECT count(*)::int FROM platform_orders WHERE status='pending') AS pending_access,(SELECT count(*)::int FROM payment_orders WHERE status IN('receipt_submitted','under_review','needs_info')) AS pending_payments,(SELECT count(*)::int FROM commerce_support_tickets WHERE status='open') AS open_support,(SELECT count(*)::int FROM notification_outbox WHERE state<>'sent' AND attempts>=3) AS notification_failures`,
            )
          ).rows[0];
          const sales = (
            await c.query(
              `SELECT policy->>'kind' AS kind,status,count(*)::int AS count,COALESCE(sum(price_coins),0)::text AS coins FROM platform_orders WHERE (created_at AT TIME ZONE 'UTC')${window} GROUP BY policy->>'kind',status`,
              [period.from, period.to],
            )
          ).rows;
          await c.query("COMMIT");
          res
            .set("Cache-Control", "private, no-store")
            .json({
              period,
              payment,
              ledger,
              counts,
              sales,
              generatedAt: new Date().toISOString(),
              cashRefundsTracked: false,
            });
        } catch (e) {
          await c.query("ROLLBACK");
          throw e;
        } finally {
          c.release();
        }
      } catch (e) {
        next(e);
      }
    },
  );
  app.get(
    "/api/platform/admin/desk/users",
    requireAdmin,
    async (req, res, next) => {
      try {
        const page = z.coerce
            .number()
            .int()
            .min(0)
            .max(100000)
            .parse(req.query.page || 0),
          q = z
            .string()
            .trim()
            .max(100)
            .parse(req.query.q || "");
        const like = "%" + q.replace(/[\\%_]/g, "\\$&") + "%";
        const where =
          "WHERE full_name ILIKE $1 ESCAPE '\\' OR COALESCE(email,'') ILIKE $1 ESCAPE '\\' OR username ILIKE $1 ESCAPE '\\'";
        const total = (
          await pool.query("SELECT count(*)::int AS n FROM users " + where, [
            like,
          ])
        ).rows[0].n;
        const rows = (
          await pool.query(
            "SELECT id,full_name,username,email,role,is_active,coins,created_at FROM users " +
              where +
              " ORDER BY created_at DESC,id LIMIT 40 OFFSET $2",
            [like, page * 40],
          )
        ).rows;
        res.json({ users: rows, total, page, pages: Math.ceil(total / 40) });
      } catch (e) {
        next(e);
      }
    },
  );
  app.get(
    "/api/platform/admin/desk/users/:id",
    requireAdmin,
    async (req, res, next) => {
      try {
        const id = z.string().min(1).max(100).parse(req.params.id);
        const user = (
          await pool.query(
            "SELECT id,full_name,username,email,role,is_active,coins,created_at FROM users WHERE id=$1",
            [id],
          )
        ).rows[0];
        if (!user) return res.status(404).json({ message: "Hisob topilmadi" });
        const orders = (
          await pool.query(
            "SELECT id,product_id,status,price_coins,policy,expires_at,created_at FROM platform_orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200",
            [id],
          )
        ).rows;
        const payments = (
          await pool.query(
            "SELECT id,package_name,price_uzs,coins,status,created_at FROM payment_orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
            [id],
          )
        ).rows;
        const progress = (
          await pool.query(
            "SELECT lp.lesson_id,l.title,lp.completion_percent,lp.last_studied_at FROM lesson_progress lp JOIN lessons l ON l.id=lp.lesson_id WHERE lp.user_id=$1 ORDER BY lp.last_studied_at DESC LIMIT 100",
            [id],
          )
        ).rows;
        res.json({ user, orders, payments, progress });
      } catch (e) {
        next(e);
      }
    },
  );
}
