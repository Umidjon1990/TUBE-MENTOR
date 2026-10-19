import type { Express } from "express";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { pool } from "./db";
import { requireAuth } from "./auth";

const provider = z.enum(["courses", "arabictest", "quiz"]);
const legacyGrant = z.object({
  orderId: z.string().uuid(),
  sourceId: z.string().min(1).max(200),
  kind: z.enum(["test", "course", "pdf"]),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).default(""),
  sourceVersion: z.string().min(1).max(100),
  expiresAt: z.string().datetime().nullable(),
  maxAttempts: z.number().int().min(1).max(1000000).nullable(),
  attemptsRemaining: z.number().int().min(0).max(1000000).optional(),
  revoked: z.boolean().optional(),
});
export function registerPlatformLinks(
  app: Express,
  request: (provider: string, path: string, body?: unknown) => Promise<any>,
) {
  const limits = new Map<string, { n: number; until: number }>();
  async function importGrants(userId: string, source: string, result: any) {
    const grants = z
      .array(legacyGrant)
      .max(2000)
      .parse(result.grants || []);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        userId,
      ]);
      for (const g of grants) {
        const productId =
          source +
          "-" +
          createHash("sha256").update(g.sourceId).digest("hex").slice(0, 32);
        await client.query(
          "INSERT INTO platform_products(id,provider,source_id,kind,title,description,source_version,max_attempts,status,source_metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'archived',$9) ON CONFLICT(provider,source_id) DO NOTHING",
          [
            productId,
            source,
            g.sourceId,
            g.kind,
            g.title,
            g.description,
            g.sourceVersion,
            g.maxAttempts,
            JSON.stringify({ legacy: true, readyForSale: false }),
          ],
        );
        const previous = (
          await client.query(
            "SELECT user_id,policy FROM platform_orders WHERE id=$1 FOR UPDATE",
            [g.orderId],
          )
        ).rows[0];
        if (
          previous &&
          (previous.user_id !== userId || previous.policy.legacy !== true)
        )
          throw Object.assign(new Error("Eski xarid mos emas"), {
            status: 409,
          });
        const policy = {
          id: productId,
          provider: source,
          sourceId: g.sourceId,
          kind: g.kind,
          title: g.title,
          description: g.description,
          sourceVersion: g.sourceVersion,
          maxAttempts: g.maxAttempts,
          durationDays: null,
          priceCoins: 0,
          legacy: true,
          hasDemo: false,
        };
        await client.query(
          "INSERT INTO platform_orders(id,user_id,product_id,request_key,status,price_coins,policy,source_result,expires_at) VALUES($1,$2,$3,$1,$4,0,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET expires_at=CASE WHEN platform_orders.status IN('revoked','refunded') THEN platform_orders.expires_at ELSE excluded.expires_at END,source_result=excluded.source_result,updated_at=now()",
          [
            g.orderId,
            userId,
            productId,
            g.revoked ? "revoked" : "active",
            JSON.stringify(policy),
            JSON.stringify({
              legacy: true,
              attemptsRemaining: g.attemptsRemaining,
            }),
            g.expiresAt,
          ],
        );
      }
      await client.query(
        "INSERT INTO commerce_audit(actor_id,action,reference_id,details) VALUES($1,'legacy_account_synced',$2,$3)",
        [userId, source, JSON.stringify({ products: grants.length })],
      );
      await client.query("COMMIT");
      return {
        linked: !!result.linked,
        provider: source,
        imported: grants.length,
        warnings: Array.isArray(result.warnings) ? result.warnings.length : 0,
        fullName: result.fullName || null,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  app.post(
    "/api/platform/links/:provider",
    requireAuth,
    async (req, res, next) => {
      try {
        const source = provider.parse(req.params.provider),
          v = z
            .object({
              username: z.string().trim().min(1).max(200),
              password: z.string().min(1).max(1024),
            })
            .strict()
            .parse(req.body);
        const key = req.session.userId!,
          now = Date.now(),
          old = limits.get(key);
        if (old && old.until > now && old.n >= 20)
          return res
            .status(429)
            .json({ message: "Birozdan keyin qayta urinib ko‘ring" });
        limits.set(key, {
          n: (old && old.until > now ? old.n : 0) + 1,
          until: now + 900000,
        });
        if (limits.size > 10000)
          for (const [k, value] of limits)
            if (value.until < now) limits.delete(k);
        const result = await request(source, "legacy/link", {
          ...v,
          externalUserId: req.session.userId,
        });
        res.json(await importGrants(req.session.userId!, source, result));
      } catch (error: any) {
        if (error.status === 401)
          return res.status(400).json({
            message:
              "Eski hisob login yoki paroli noto‘g‘ri, yoxud hisob faol emas",
          });
        next(error);
      }
    },
  );
  app.get(
    "/api/platform/links/:provider",
    requireAuth,
    async (req, res, next) => {
      try {
        const source = provider.parse(req.params.provider),
          result = await request(
            source,
            "legacy/status/" + encodeURIComponent(req.session.userId!),
          );
        res.json(await importGrants(req.session.userId!, source, result));
      } catch (error) {
        next(error);
      }
    },
  );
}
