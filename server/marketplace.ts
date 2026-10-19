import { Readable } from "node:stream";
import { registerPlatformLinks } from "./platform-links";
import type { Express } from "express";
import type { Server } from "node:http";
import { randomUUID, createHash } from "node:crypto";
import express from "express";
import { z } from "zod";
import { pool } from "./db";
import { storage } from "./storage";
import { requireAdmin, requireAuth } from "./auth";
import { getCommerceSettings, grantWelcomeBonus } from "./commerce";
import {
  cefrLevel,
  lessonSegments,
  publishedLesson,
  youtubeId,
} from "@shared/learning";
import { lessonPrice } from "@shared/commerce";
import { catalogCard } from "./access";

const providerConfig = {
  courses: {
    url: "https://zamonaviy-videokurs.up.railway.app",
    env: "PLATFORM_COURSES_SECRET",
  },
  arabictest: {
    url: "https://www.arabictest.uz",
    env: "PLATFORM_ARABICTEST_SECRET",
  },
  quiz: {
    url: "https://web-production-73482.up.railway.app",
    env: "PLATFORM_QUIZ_SECRET",
  },
};
export async function providerRequest(
  provider: string,
  path: string,
  body?: unknown,
  identity?: { userId: string; orderId: string },
  method?: string,
  contentType?: string,
  raw = false,
  range?: string,
) {
  const config = providerConfig[provider as keyof typeof providerConfig];
  const key = config && process.env[config.env];
  if (!config || !key || key.length < 32)
    throw Object.assign(new Error("Manba ulanishi tayyor emas"), {
      status: 503,
    });
  const response = await fetch(config.url + "/api/platform/" + path, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: {
      "x-platform-key": key,
      ...(range ? { Range: range } : {}),
      ...(identity
        ? {
            "x-platform-user": identity.userId,
            "x-platform-order": identity.orderId,
          }
        : {}),
      ...(body === undefined
        ? {}
        : { "Content-Type": contentType || "application/json" }),
    },
    body:
      body === undefined
        ? undefined
        : Buffer.isBuffer(body)
          ? body
          : JSON.stringify(body),
    signal: AbortSignal.timeout(
      path.includes("pdf") || path.endsWith("demo-file")
        ? 60000
        : path.startsWith("users/")
          ? 3000
          : 15000,
    ),
    redirect: "error",
  });
  if (!response.ok)
    throw Object.assign(new Error("Manba so‘rovni bajarmadi"), {
      status: response.status >= 500 ? 503 : response.status,
    });
  return raw ? response : response.json();
}
const problem = (status: number, message: string): never => {
  throw Object.assign(new Error(message), { status });
};
function offerVersion(p: any) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        p.source_version,
        p.price_coins,
        p.duration_days,
        p.max_attempts,
        p.demo_ref,
        p.status,
        p.source_metadata || {},
      ]),
    )
    .digest("hex")
    .slice(0, 32);
}
function dto(p: any) {
  return {
    id: p.id,
    provider: p.provider,
    sourceId: p.source_id,
    kind: p.kind,
    title: p.title,
    description: p.description,
    thumbnailUrl: p.thumbnail_url,
    level: p.level,
    skill: p.skill,
    priceCoins: p.price_coins,
    durationDays: p.duration_days,
    maxAttempts: p.max_attempts,
    hasDemo: !!p.demo_ref,
    sourceVersion: p.source_version,
    status: p.status,
    offerVersion: offerVersion(p),
    sourceMetadata: p.source_metadata || {},
  };
}
const offerInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).default(""),
  priceCoins: z.number().int().min(0).max(1000000),
  durationDays: z.number().int().min(1).max(3650).nullable(),
  maxAttempts: z.number().int().min(1).max(1000).nullable(),
  demoRef: z.string().min(1).max(200).nullable(),
  status: z.enum(["draft", "published", "archived"]),
});

/** Import only real source metadata. Never create fabricated inventory or convert UZS to coins implicitly. */
export async function syncTubeProducts() {
  const settings = await getCommerceSettings();
  for (const source of await storage.getAllLessons()) {
    const lesson = publishedLesson(source);
    if (!lesson || source.status === "archived") continue;
    const free = settings.demoLessonId === source.id;
    await pool.query(
      `INSERT INTO platform_products(id,provider,source_id,kind,title,description,thumbnail_url,level,price_coins,demo_ref,source_version,status)
   VALUES($1,'tube',$2,'tube',$3,$4,$5,$6,$7,$2,$8,'published')
   ON CONFLICT(provider,source_id) DO UPDATE SET title=excluded.title,description=excluded.description,thumbnail_url=excluded.thumbnail_url,level=excluded.level,price_coins=excluded.price_coins,source_version=excluded.source_version,updated_at=now()`,
      [
        "tube-" + source.id,
        String(source.id),
        lesson.title,
        lesson.description || "",
        lesson.thumbnailUrl,
        cefrLevel(lesson.level),
        free ? 0 : lessonPrice(settings, source.id),
        String(lesson.contentVersion),
      ],
    );
  }
}
async function tubeCatalog(req: any) {
  const sources = await storage.getAllLessons();
  const valid = sources.filter(
    (s) => s.status !== "archived" && publishedLesson(s),
  );
  const ids = valid.map((s) => "tube-" + s.id);
  if (!ids.length) return [];
  const rows = await pool.query(
    "SELECT * FROM platform_products WHERE provider='tube' AND status='published' AND id=ANY($1::varchar[])",
    [ids],
  );
  return Promise.all(
    rows.rows.map(async (p) => {
      const lesson = valid.find((s) => String(s.id) === p.source_id)!;
      const card = await catalogCard(req, lesson);
      return {
        ...dto(p),
        owned: card.access === "owned" || card.access === "admin",
        access: card.access,
      };
    }),
  );
}
async function product(id: string) {
  const r = await pool.query("SELECT * FROM platform_products WHERE id=$1", [
    id,
  ]);
  return r.rows[0];
}

export async function buyProduct(
  userId: string,
  id: string,
  requestKey: string,
  expectedPrice?: number,
  expectedVersion?: string,
) {
  await grantWelcomeBonus(userId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const user = (
      await client.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [userId])
    ).rows[0];
    if (
      !user ||
      !user.is_active ||
      user.role !== "student" ||
      !(user.email_verified || user.google_id || user.telegram_id)
    )
      problem(403, "Faol o‘quvchi hisobi kerak");
    const prior = (
      await client.query(
        "SELECT * FROM platform_orders WHERE user_id=$1 AND request_key=$2",
        [userId, requestKey],
      )
    ).rows[0];
    if (prior) {
      if (prior.product_id !== id)
        problem(409, "Xarid kaliti boshqa mahsulot uchun ishlatilgan");
      await client.query("COMMIT");
      return prior;
    }
    const p = (
      await client.query(
        "SELECT * FROM platform_products WHERE id=$1 AND status='published' FOR SHARE",
        [id],
      )
    ).rows[0];
    if (!p || !p.demo_ref) problem(404, "Mahsulot sotuvda mavjud emas");
    if (expectedVersion !== undefined && expectedVersion !== offerVersion(p))
      problem(409, "Mahsulot shartlari yangilangan. Sahifani qayta oching");
    if (expectedPrice !== undefined && expectedPrice !== p.price_coins)
      problem(409, "Narx yangilangan. Mahsulot sahifasini qayta oching");
    const active = (
      await client.query(
        "SELECT * FROM platform_orders WHERE user_id=$1 AND product_id=$2 AND (status='pending' OR (status='active' AND (expires_at IS NULL OR expires_at>now()))) ORDER BY created_at DESC LIMIT 1",
        [userId, id],
      )
    ).rows[0];
    if (active) {
      await client.query("COMMIT");
      return active;
    }
    if (p.provider === "tube") {
      const source = (
        await client.query("SELECT * FROM lessons WHERE id=$1", [
          Number(p.source_id),
        ])
      ).rows[0];
      if (
        !source ||
        source.status === "archived" ||
        (!source.published_snapshot && source.status !== "published")
      )
        problem(404, "Dars nashrda mavjud emas");
      const owned = (
        await client.query(
          "SELECT * FROM lesson_access WHERE user_id=$1 AND lesson_id=$2",
          [userId, Number(p.source_id)],
        )
      ).rows[0];
      if (owned?.revoked_at && owned.revocation_type !== "refund")
        problem(403, "Kirish admin tomonidan to‘xtatilgan");
      if (
        owned &&
        !owned.revoked_at &&
        (!owned.expires_at || new Date(owned.expires_at) > new Date())
      ) {
        await client.query("COMMIT");
        return { status: "active", product_id: id, alreadyOwned: true };
      }
    } else {
      const config = providerConfig[p.provider as keyof typeof providerConfig];
      if (!config || !process.env[config.env])
        problem(503, "Mahsulot manbasi hali ulanmagan");
    }
    if (user.coins < p.price_coins)
      problem(402, "Coin yetarli emas. Hamyonni to‘ldiring");
    const lots = (
      await client.query(
        "SELECT * FROM coin_grants WHERE user_id=$1 ORDER BY CASE source WHEN 'bonus' THEN 0 WHEN 'legacy' THEN 1 WHEN 'adjustment' THEN 2 ELSE 3 END,created_at,id FOR UPDATE",
        [userId],
      )
    ).rows;
    if (lots.reduce((n, l) => n + l.remaining, 0) !== user.coins)
      problem(409, "Hamyon tarixi mos emas. Adminga murojaat qiling");
    let remaining = p.price_coins;
    const allocations = [];
    for (const lot of lots) {
      if (!remaining) break;
      const amount = Math.min(lot.remaining, remaining);
      if (!amount) continue;
      await client.query(
        "UPDATE coin_grants SET remaining=remaining-$1 WHERE id=$2",
        [amount, lot.id],
      );
      allocations.push({ grantId: lot.id, amount, source: lot.source });
      remaining -= amount;
    }
    if (remaining) problem(409, "Coin manbalari mos emas");
    const orderId = randomUUID();
    const policy = { ...dto(p), fullName: user.full_name, version: 1 };
    const native = p.provider === "tube";
    const expiry =
      native && p.duration_days
        ? new Date(Date.now() + p.duration_days * 86400000)
        : null;
    const transaction = (
      await client.query(
        `INSERT INTO coin_transactions(user_id,amount,type,description,idempotency_key,order_id,balance_before,balance_after,metadata)
   VALUES($1,$2,'product_purchase',$3,$4,$5,$6,$7,$8) RETURNING id`,
        [
          userId,
          -p.price_coins,
          "Xarid: " + p.title,
          "platform-purchase:" + orderId,
          orderId,
          user.coins,
          user.coins - p.price_coins,
          JSON.stringify({ allocations, productId: id }),
        ],
      )
    ).rows[0];
    await client.query(
      "UPDATE users SET coins=coins-$1,updated_at=now() WHERE id=$2",
      [p.price_coins, userId],
    );
    const order = (
      await client.query(
        `INSERT INTO platform_orders(id,user_id,product_id,request_key,status,price_coins,policy,transaction_id,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [
          orderId,
          userId,
          id,
          requestKey,
          native ? "active" : "pending",
          p.price_coins,
          JSON.stringify(policy),
          transaction.id,
          expiry,
        ],
      )
    ).rows[0];
    if (native)
      await client.query(
        `INSERT INTO lesson_access(user_id,lesson_id,source,price_coins,purchase_transaction_id,expires_at)
   VALUES($1,$2,'marketplace',$3,$4,$5) ON CONFLICT(user_id,lesson_id) DO UPDATE SET source='marketplace',price_coins=excluded.price_coins,purchase_transaction_id=excluded.purchase_transaction_id,expires_at=excluded.expires_at,revoked_at=NULL,revocation_type=NULL`,
        [userId, Number(p.source_id), p.price_coins, transaction.id, expiry],
      );
    await client.query(
      "INSERT INTO commerce_audit(user_id,action,reference_id,idempotency_key,details) VALUES($1,'product_purchase',$2,$3,$4)",
      [
        userId,
        orderId,
        "platform-purchase:" + orderId,
        JSON.stringify({ productId: id, priceCoins: p.price_coins }),
      ],
    );
    await client.query("COMMIT");
    return order;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Central admin actions are serialized on the same wallet row as every debit. */
export async function managePlatformOrder(
  actorId: string,
  id: string,
  input: {
    action: "extend" | "revoke" | "refund";
    days?: number;
    reason: string;
  },
  sourceResult?: { orderId: string; expiresAt?: string | null },
  actionId?: string,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const summary = (
      await client.query("SELECT user_id FROM platform_orders WHERE id=$1", [
        id,
      ])
    ).rows[0];
    if (!summary) problem(404, "Xarid topilmadi");
    const user = (
      await client.query("SELECT coins FROM users WHERE id=$1 FOR UPDATE", [
        summary.user_id,
      ])
    ).rows[0];
    const order = (
      await client.query(
        "SELECT * FROM platform_orders WHERE id=$1 FOR UPDATE",
        [id],
      )
    ).rows[0];
    if (
      order.policy.provider !== "tube" &&
      (!sourceResult || sourceResult.orderId !== id)
    )
      problem(409, "Manba ruxsati tasdiqlanishi kerak");
    if (order.status === "refunded") {
      if (input.action === "refund") {
        if (actionId)
          await client.query(
            "UPDATE platform_admin_actions SET status='applied',locked_until=NULL,error=NULL,updated_at=now() WHERE id=$1",
            [actionId],
          );
        await client.query("COMMIT");
        return { success: true, alreadyApplied: true };
      }
      problem(409, "Qaytarilgan xaridni o‘zgartirib bo‘lmaydi");
    }
    if (input.action === "extend") {
      if (order.status !== "active")
        problem(409, "Faqat faol xarid uzaytiriladi");
      if (order.policy.provider === "tube" && !order.expires_at)
        problem(409, "Muddatsiz xaridni uzaytirish talab etilmaydi");
      if (!input.days) problem(400, "Kunlar soni kerak");
      const expires =
        order.policy.provider === "tube"
          ? new Date(
              Math.max(
                Date.now(),
                order.expires_at
                  ? new Date(order.expires_at).getTime()
                  : Date.now(),
              ) +
                input.days! * 86400000,
            )
          : new Date(sourceResult?.expiresAt || "");
      if (!Number.isFinite(expires.getTime()) || expires <= new Date())
        problem(409, "Manba muddati noto‘g‘ri");
      await client.query(
        "UPDATE platform_orders SET expires_at=$2,updated_at=now() WHERE id=$1",
        [id, expires],
      );
      if (order.policy.provider === "tube") {
        const changed = await client.query(
          "UPDATE lesson_access SET expires_at=$3 WHERE user_id=$1 AND lesson_id=$2 AND purchase_transaction_id=$4 AND revoked_at IS NULL",
          [
            order.user_id,
            Number(order.policy.sourceId),
            expires,
            order.transaction_id,
          ],
        );
        if (!changed.rowCount)
          problem(
            409,
            "Bu kirish keyingi xarid bilan almashtirilgan yoki bekor qilingan",
          );
      }
    } else {
      if (order.policy.provider === "tube")
        await client.query(
          "UPDATE lesson_access SET revoked_at=now(),revocation_type=$4 WHERE user_id=$1 AND lesson_id=$2 AND purchase_transaction_id=$3",
          [
            order.user_id,
            Number(order.policy.sourceId),
            order.transaction_id,
            input.action === "refund" ? "refund" : "admin",
          ],
        );
      if (input.action === "refund") {
        const transaction = (
          await client.query(
            "SELECT metadata FROM coin_transactions WHERE id=$1",
            [order.transaction_id],
          )
        ).rows[0];
        const allocations = transaction?.metadata?.allocations || [];
        if (
          allocations.reduce((sum: number, a: any) => sum + a.amount, 0) !==
          order.price_coins
        )
          problem(409, "Xarid coin manbalari mos emas");
        for (const allocation of allocations) {
          const restored = await client.query(
            "UPDATE coin_grants SET remaining=remaining+$1 WHERE id=$2 AND user_id=$3",
            [allocation.amount, allocation.grantId, order.user_id],
          );
          if (!restored.rowCount) problem(409, "Coin manbasi topilmadi");
        }
        await client.query(
          "UPDATE users SET coins=coins+$1,updated_at=now() WHERE id=$2",
          [order.price_coins, order.user_id],
        );
        await client.query(
          "INSERT INTO coin_transactions(user_id,amount,type,description,idempotency_key,order_id,balance_before,balance_after,metadata) VALUES($1,$2,'product_refund',$3,$4,$5,$6,$7,$8)",
          [
            order.user_id,
            order.price_coins,
            "Xarid coinlari qaytarildi: " + order.policy.title,
            "platform-refund:" + id,
            id,
            user.coins,
            user.coins + order.price_coins,
            JSON.stringify({ originalTransactionId: order.transaction_id }),
          ],
        );
      }
      await client.query(
        "UPDATE platform_orders SET status=$2,updated_at=now() WHERE id=$1",
        [id, input.action === "refund" ? "refunded" : "revoked"],
      );
    }
    await client.query(
      "INSERT INTO commerce_audit(actor_id,user_id,action,reference_id,details) VALUES($1,$2,$3,$4,$5)",
      [
        actorId,
        order.user_id,
        "platform_" + input.action,
        id,
        JSON.stringify(input),
      ],
    );
    if (actionId)
      await client.query(
        "UPDATE platform_admin_actions SET status='applied',locked_until=NULL,error=NULL,updated_at=now() WHERE id=$1",
        [actionId],
      );
    await client.query("COMMIT");
    return { success: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function provisionOrder(id: string) {
  const order = (
    await pool.query(
      "UPDATE platform_orders SET locked_until=now()+interval '45 seconds',delivery_attempts=delivery_attempts+1 WHERE id=$1 AND status='pending' AND (locked_until IS NULL OR locked_until<now()) RETURNING *",
      [id],
    )
  ).rows[0];
  if (!order) return;
  const p = order.policy;
  try {
    const result = await providerRequest(p.provider, "grants", {
      orderId: id,
      externalUserId: order.user_id,
      fullName: p.fullName,
      sourceId: p.sourceId,
      kind: p.kind,
      durationDays: p.durationDays,
      maxAttempts: p.maxAttempts,
      sourceVersion: p.sourceVersion,
    });
    if (result.orderId !== id || !result.active)
      throw new Error("Ruxsat tasdig‘i mos emas");
    await pool.query(
      "UPDATE platform_orders SET status='active',source_result=$2,expires_at=$3,locked_until=NULL,error=NULL,updated_at=now() WHERE id=$1 AND status='pending'",
      [id, JSON.stringify(result), result.expiresAt || null],
    );
  } catch (error: any) {
    await pool.query(
      "UPDATE platform_orders SET locked_until=NULL,error=$2,next_try_at=now()+interval '1 minute',updated_at=now() WHERE id=$1 AND status='pending'",
      [id, "Manba bilan tasdiqlash kutilmoqda"],
    );
    if (
      [400, 403, 404, 409].includes(error?.status) ||
      order.delivery_attempts >= 15
    ) {
      const actionId = randomUUID();
      const created = (
        await pool.query(
          "INSERT INTO platform_admin_actions(id,actor_id,order_id,input) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id",
          [
            actionId,
            order.user_id,
            id,
            JSON.stringify({
              action: "refund",
              reason: "Avtomatik: manba xaridni yetkaza olmadi",
              automatic: true,
            }),
          ],
        )
      ).rows[0];
      if (created) await processPlatformAction(created.id);
    }
  }
}

export async function processPlatformAction(id: string) {
  const action = (
    await pool.query(
      "UPDATE platform_admin_actions SET locked_until=now()+interval '45 seconds' WHERE id=$1 AND status='pending' AND (locked_until IS NULL OR locked_until<now()) RETURNING *",
      [id],
    )
  ).rows[0];
  if (!action) return;
  try {
    const order = (
      await pool.query("SELECT * FROM platform_orders WHERE id=$1", [
        action.order_id,
      ])
    ).rows[0];
    if (!order) problem(404, "Xarid topilmadi");
    let sourceResult;
    if (order.policy.provider !== "tube") {
      sourceResult = await providerRequest(
        order.policy.provider,
        "grants/" + order.id + "/manage",
        {
          externalUserId: order.user_id,
          ...((order.policy.provider === "arabictest" &&
            order.policy.kind === "course") ||
          order.policy.kind === "pdf"
            ? { kind: order.policy.kind, sourceId: order.policy.sourceId }
            : {}),
          operationId: action.id,
          action: action.input.action === "extend" ? "extend" : "revoke",
          ...(action.input.action === "extend"
            ? { days: action.input.days }
            : {}),
        },
      );
      if (
        sourceResult.orderId !== order.id ||
        sourceResult.active !== (action.input.action === "extend")
      )
        problem(409, "Manba ruxsati tasdiqlanmadi");
    }
    await managePlatformOrder(
      action.actor_id,
      action.order_id,
      action.input,
      sourceResult,
      action.id,
    );
  } catch {
    await pool.query(
      "UPDATE platform_admin_actions SET error='Amal tasdiqlanishi kutilmoqda',locked_until=NULL,updated_at=now() WHERE id=$1 AND status='pending'",
      [id],
    );
  }
}
export async function queuePlatformAction(
  actorId: string,
  orderId: string,
  id: string,
  input: {
    action: "extend" | "revoke" | "refund";
    days?: number;
    reason: string;
  },
) {
  const prior = (
    await pool.query("SELECT * FROM platform_admin_actions WHERE id=$1", [id])
  ).rows[0];
  if (prior) {
    if (
      prior.order_id !== orderId ||
      prior.input.action !== input.action ||
      prior.input.days !== input.days ||
      prior.input.reason !== input.reason
    )
      problem(409, "Amal kaliti boshqa so‘rov uchun ishlatilgan");
    return { id: prior.id, status: prior.status };
  }
  if (input.action === "extend" && !input.days)
    problem(400, "Uzaytirish kunlari kerak");
  const order = (
    await pool.query(
      "SELECT status,expires_at,policy FROM platform_orders WHERE id=$1",
      [orderId],
    )
  ).rows[0];
  if (!order) problem(404, "Xarid topilmadi");
  if (order.policy.legacy && input.action === "refund")
    problem(
      409,
      "Eski manbadagi xarid uchun coin yechilmagan. Coin qaytarish qo‘llanmaydi",
    );
  if (input.action === "extend" && order.status !== "active")
    problem(409, "Faqat faol xarid uzaytiriladi");
  if (input.action === "extend" && !order.expires_at)
    problem(409, "Muddatsiz xaridni uzaytirish talab etilmaydi");
  const created = (
    await pool.query(
      "INSERT INTO platform_admin_actions(id,actor_id,order_id,input) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id",
      [id, actorId, orderId, JSON.stringify(input)],
    )
  ).rows[0];
  const activeId =
    created?.id ||
    (
      await pool.query(
        "SELECT id FROM platform_admin_actions WHERE order_id=$1 AND status='pending'",
        [orderId],
      )
    ).rows[0]?.id;
  if (!activeId)
    problem(409, "Amal bir vaqtda yangilangan. Holatni qayta yuklang");
  await processPlatformAction(activeId);
  const result = (
    await pool.query(
      "SELECT id,status,error FROM platform_admin_actions WHERE id=$1",
      [activeId],
    )
  ).rows[0];
  return result;
}

export async function syncProviderCatalog(provider: string) {
  if (!Object.hasOwn(providerConfig, provider))
    problem(404, "Manba mavjud emas");
  const response = await providerRequest(provider, "catalog");
  const items = z
    .array(
      z.object({
        sourceId: z.string().min(1).max(200),
        kind: z.enum(["course", "test", "pdf"]),
        title: z.string().min(1).max(200),
        description: z.string().max(5000).default(""),
        thumbnailUrl: z.string().nullable().optional(),
        level: z.string().nullable().optional(),
        skill: z.string().nullable().optional(),
        sourceVersion: z.string().min(1).max(100),
        demoRef: z.string().max(200).nullable(),
        recommendedDurationDays: z
          .number()
          .int()
          .min(1)
          .max(3650)
          .nullable()
          .optional(),
        recommendedMaxAttempts: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .nullable()
          .optional(),
        sourcePriceUzs: z.union([z.string(), z.number()]).nullable().optional(),
        features: z.record(z.unknown()).optional(),
        readyForSale: z.boolean().optional(),
        saleNote: z.string().max(1000).nullable().optional(),
      }),
    )
    .max(2000)
    .parse(response.products);
  const ids: string[] = [];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const item of items) {
      const id =
        provider +
        "-" +
        createHash("sha256").update(item.sourceId).digest("hex").slice(0, 32);
      ids.push(id);
      await client.query(
        `INSERT INTO platform_products(id,provider,source_id,kind,title,description,thumbnail_url,level,skill,duration_days,max_attempts,demo_ref,source_version,source_metadata,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'draft') ON CONFLICT(provider,source_id) DO UPDATE SET title=excluded.title,description=excluded.description,thumbnail_url=excluded.thumbnail_url,level=excluded.level,skill=excluded.skill,demo_ref=excluded.demo_ref,source_version=excluded.source_version,source_metadata=excluded.source_metadata,status=CASE WHEN excluded.demo_ref IS NULL OR (excluded.source_metadata->>'readyForSale')='false' THEN 'draft' ELSE platform_products.status END,updated_at=now()`,
        [
          id,
          provider,
          item.sourceId,
          item.kind,
          item.title,
          item.description,
          item.thumbnailUrl || null,
          item.level || null,
          item.skill || null,
          item.recommendedDurationDays || null,
          item.recommendedMaxAttempts || null,
          item.demoRef,
          item.sourceVersion,
          JSON.stringify({
            sourcePriceUzs: item.sourcePriceUzs,
            features: item.features,
            readyForSale: item.readyForSale,
            saleNote: item.saleNote,
          }),
        ],
      );
    }
    await client.query(
      "UPDATE platform_products SET status='archived',updated_at=now() WHERE provider=$1 AND NOT(id=ANY($2::varchar[]))",
      [provider, ids],
    );
    await client.query("COMMIT");
    return { count: items.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
async function ownedOrder(userId: string, id: string, requested?: unknown) {
  const selected =
    requested === undefined ? null : z.string().uuid().parse(requested);
  const order = (
    await pool.query(
      "SELECT * FROM platform_orders WHERE user_id=$1 AND product_id=$2 AND status='active' AND (expires_at IS NULL OR expires_at>now()) AND ($3::uuid IS NULL OR id=$3) ORDER BY created_at DESC LIMIT 1",
      [userId, id, selected],
    )
  ).rows[0];
  if (!order) problem(403, "Mahsulotga faol kirish huquqi kerak");
  return order;
}

export function registerMarketplace(app: Express, http: Server) {
  registerPlatformLinks(app, providerRequest);
  app.get("/api/platform/results/:id", requireAuth, async (req, res, next) => {
    try {
      const orders = (
        await pool.query(
          "SELECT * FROM platform_orders WHERE user_id=$1 AND product_id=$2 AND status IN('active','revoked','refunded') ORDER BY created_at DESC LIMIT 20",
          [req.session.userId, req.params.id],
        )
      ).rows;
      if (!orders.length)
        return res.status(404).json({ message: "Xarid topilmadi" });
      const outcomes = await Promise.allSettled(
        orders
          .filter((o: any) => o.policy.provider !== "tube")
          .map(async (o: any) =>
            providerRequest(
              o.policy.provider,
              "owned/" + encodeURIComponent(o.policy.sourceId) + "/history",
              undefined,
              { userId: o.user_id, orderId: o.id },
            ),
          ),
      );
      const unique = new Map<string, any>();
      let unavailable = 0;
      for (const r of outcomes) {
        if (r.status === "rejected") {
          unavailable++;
          continue;
        }
        for (const a of Array.isArray(r.value.attempts) ? r.value.attempts : [])
          if (typeof a.id === "string") unique.set(a.id, a);
      }
      res.json({ attempts: [...unique.values()], unavailable });
    } catch (error) {
      next(error);
    }
  });
  app.use((req, res, next) => {
    const match =
      /^\/api\/platform\/owned\/([a-zA-Z0-9_-]+)\/order\/([0-9a-f-]{36})(?=\/|$)/.exec(
        req.path,
      );
    if (match) {
      const url = new URL(req.url, "https://local.invalid");
      url.pathname = url.pathname.replace(
        match[0],
        "/api/platform/owned/" + match[1],
      );
      url.searchParams.set("order", match[2]);
      req.url = url.pathname + url.search;
    }
    next();
  });
  app.get("/api/platform/catalog", async (req, res, next) => {
    try {
      await syncTubeProducts();
      const native = await tubeCatalog(req);
      const other = (
        await pool.query(
          "SELECT * FROM platform_products WHERE provider<>'tube' AND status='published' ORDER BY updated_at DESC",
        )
      ).rows.map(dto);
      res.json({ products: [...native, ...other] });
    } catch (error) {
      next(error);
    }
  });
  app.get("/api/platform/products/:id", async (req, res, next) => {
    try {
      await syncTubeProducts();
      const p = await product(String(req.params.id));
      if (!p || p.status !== "published")
        return res.status(404).json({ message: "Mahsulot topilmadi" });
      let owned = false,
        access: string | undefined;
      if (p.provider === "tube") {
        const source = await storage.getLessonById(Number(p.source_id));
        if (!source || !publishedLesson(source) || source.status === "archived")
          return res.status(404).json({ message: "Mahsulot topilmadi" });
        const card = await catalogCard(req, source);
        owned = card.access === "owned" || card.access === "admin";
        access = card.access;
      } else if (req.session.userId) {
        owned = !!(
          await pool.query(
            "SELECT 1 FROM platform_orders WHERE user_id=$1 AND product_id=$2 AND status='active' AND (expires_at IS NULL OR expires_at>now())",
            [req.session.userId, p.id],
          )
        ).rowCount;
      }
      res.json({ ...dto(p), owned, access });
    } catch (error) {
      next(error);
    }
  });
  app.get("/api/platform/products/:id/demo", async (req, res, next) => {
    try {
      const p = await product(String(req.params.id));
      if (!p || p.status !== "published" || !p.demo_ref)
        return res.status(404).json({ message: "Demo mavjud emas" });
      if (p.provider !== "tube") {
        const preview = await providerRequest(
          p.provider,
          "products/" + encodeURIComponent(p.source_id) + "/demo",
        );
        if (p.kind === "pdf")
          preview.pdfUrl =
            "/api/platform/core/platform/products/" + p.id + "/demo-file";
        return res.json(preview);
      }
      const source = await storage.getLessonById(Number(p.source_id));
      const lesson =
        source && source.status !== "archived" && publishedLesson(source);
      if (!lesson) return res.status(404).json({ message: "Demo mavjud emas" });
      const segments = lessonSegments(lesson)
        .filter((s) => s.start !== null && s.start < 30)
        .slice(0, 3)
        .map((s) => ({
          id: s.id,
          text: s.text,
          translation: s.translation,
          start: s.start,
          end: Math.min(s.end || 30, 30),
        }));
      res.json({
        kind: "video",
        title: lesson.title,
        youtubeId: youtubeId(lesson.youtubeUrl),
        endSeconds: 30,
        segments,
      });
    } catch (error) {
      next(error);
    }
  });
  app.post(
    "/api/platform/products/:id/purchase",
    requireAuth,
    async (req, res, next) => {
      try {
        const key = z.string().uuid().parse(req.body?.requestKey);
        const expectedPrice = z
          .number()
          .int()
          .min(0)
          .parse(req.body?.expectedPrice);
        const expectedVersion = z
          .string()
          .regex(/^[0-9a-f]{32}$/)
          .safeParse(req.body?.expectedVersion);
        if (!expectedVersion.success)
          return res.status(409).json({
            message:
              "Mahsulot shartlarini yangilash uchun sahifani qayta oching",
          });
        const order = await buyProduct(
          req.session.userId!,
          String(req.params.id),
          key,
          expectedPrice,
          expectedVersion.data,
        );
        if (order.status === "pending") await provisionOrder(order.id);
        const current = order.id
          ? (
              await pool.query(
                "SELECT * FROM platform_orders WHERE id=$1 AND user_id=$2",
                [order.id, req.session.userId],
              )
            ).rows[0]
          : order;
        res.json(current);
      } catch (error) {
        next(error);
      }
    },
  );
  app.get("/api/platform/orders/:id", requireAuth, async (req, res, next) => {
    try {
      const row = (
        await pool.query(
          "SELECT id,product_id,status,price_coins,expires_at FROM platform_orders WHERE id=$1 AND user_id=$2",
          [z.string().uuid().parse(req.params.id), req.session.userId],
        )
      ).rows[0];
      if (!row) return res.status(404).json({ message: "Xarid topilmadi" });
      res.json({
        id: row.id,
        productId: row.product_id,
        status: row.status,
        priceCoins: row.price_coins,
        expiresAt: row.expires_at,
      });
    } catch (error) {
      next(error);
    }
  });
  app.get("/api/platform/library", requireAuth, async (req, res, next) => {
    try {
      await syncTubeProducts();
      const orders = (
        await pool.query(
          "SELECT * FROM platform_orders WHERE user_id=$1 ORDER BY created_at DESC",
          [req.session.userId],
        )
      ).rows;
      const progress = (
        await pool.query(
          "SELECT lesson_id,completion_percent FROM lesson_progress WHERE user_id=$1",
          [req.session.userId],
        )
      ).rows;
      const grants = (
        await pool.query(
          "SELECT a.lesson_id,a.expires_at,p.* FROM lesson_access a JOIN platform_products p ON p.provider='tube' AND p.source_id=a.lesson_id::text WHERE a.user_id=$1 AND a.revoked_at IS NULL",
          [req.session.userId],
        )
      ).rows;
      const sourceLessons = await storage.getAllLessons();
      const liveAttempts = new Map<string, any>();
      await Promise.all(
        [
          ...new Set(
            orders
              .filter(
                (o: any) =>
                  o.policy.kind === "test" &&
                  o.policy.provider !== "tube" &&
                  o.status === "active",
              )
              .map((o: any) => o.policy.provider as string),
          ),
        ].map(async (provider) => {
          try {
            const result = await providerRequest(
              provider,
              "users/" + encodeURIComponent(req.session.userId!) + "/library",
            );
            for (const g of z
              .array(
                z.object({
                  orderId: z.string().uuid(),
                  sourceId: z.string(),
                  attemptsRemaining: z.number().int().min(0).max(1000000),
                  maxAttempts: z.number().int().min(1).max(1000000).optional(),
                  expiresAt: z.string().datetime().nullable().optional(),
                  revoked: z.boolean().optional(),
                }),
              )
              .max(2000)
              .parse(result.grants)) {
              if (
                orders.some(
                  (o: any) =>
                    o.id === g.orderId &&
                    o.policy.sourceId === g.sourceId &&
                    o.policy.provider === provider,
                )
              )
                liveAttempts.set(g.orderId, g);
            }
          } catch {
            /* A provider outage must not hide the learner's other purchases. */
          }
        }),
      );
      const products: any[] = [];
      for (const grant of grants) {
        const lesson = sourceLessons.find((s) => s.id === grant.lesson_id);
        if (!lesson || !publishedLesson(lesson)) continue;
        products.push({
          ...dto(grant),
          owned: true,
          access:
            !grant.expires_at || new Date(grant.expires_at) > new Date()
              ? "owned"
              : "locked",
          completionPercent:
            progress.find((r) => r.lesson_id === grant.lesson_id)
              ?.completion_percent || 0,
          expiresAt: grant.expires_at,
        });
      }
      const currentOffers = (
        await pool.query(
          "SELECT id,status FROM platform_products WHERE provider<>'tube'",
        )
      ).rows;
      const seen = new Set<string>();
      const accessRank = (o: any) =>
        o.status === "active" &&
        (!o.expires_at || new Date(o.expires_at) > new Date())
          ? 0
          : o.status === "pending"
            ? 1
            : 2;
      for (const o of orders
        .filter(
          (o) =>
            o.policy.provider !== "tube" &&
            ["active", "pending"].includes(o.status),
        )
        .sort((a: any, b: any) => accessRank(a) - accessRank(b))) {
        if (seen.has(o.product_id)) continue;
        seen.add(o.product_id);
        products.push({
          ...o.policy,
          id: o.product_id,
          status:
            currentOffers.find((p) => p.id === o.product_id)?.status ||
            "archived",
          owned:
            o.status === "active" &&
            (!o.expires_at || new Date(o.expires_at) > new Date()),
          orderId: o.id,
          orderStatus: o.status,
          expiresAt: o.expires_at,
          completionPercent: o.source_result?.completionPercent || 0,
          attemptsRemaining:
            liveAttempts.get(o.id)?.attemptsRemaining ??
            o.source_result?.attemptsRemaining,
          maxAttempts:
            liveAttempts.get(o.id)?.maxAttempts ?? o.policy.maxAttempts,
        });
      }
      res.json({
        products,
        orders: orders.map((o) => ({
          id: o.id,
          productId: o.product_id,
          title: o.policy.title,
          status: o.status,
          expiresAt: o.expires_at,
          createdAt: o.created_at,
          error: o.error,
        })),
      });
    } catch (error) {
      next(error);
    }
  });
  app.get(
    "/api/platform/admin/providers/:provider/files/:id",
    requireAdmin,
    async (req, res, next) => {
      try {
        const response = await providerRequest(
          String(req.params.provider),
          "admin/files/" + z.string().uuid().parse(req.params.id),
          undefined,
          undefined,
          "GET",
          undefined,
          true,
        );
        res.set(
          "Content-Type",
          response.headers.get("content-type") || "application/octet-stream",
        );
        const disposition = response.headers.get("content-disposition");
        if (disposition) res.set("Content-Disposition", disposition);
        res.send(Buffer.from(await response.arrayBuffer()));
      } catch (error) {
        next(error);
      }
    },
  );
  app.get(
    "/api/platform/admin/providers/:provider/reviews",
    requireAdmin,
    async (req, res, next) => {
      try {
        const provider = String(req.params.provider);
        const result = await providerRequest(provider, "admin/exam-attempts");
        const rewrite = (v: any): any =>
          typeof v === "string" &&
          /^\/api\/private-files\/[0-9a-f-]{36}$/.test(v)
            ? "/api/platform/core/platform/admin/providers/" +
              provider +
              "/files/" +
              v.split("/").pop()
            : Array.isArray(v)
              ? v.map(rewrite)
              : v && typeof v === "object"
                ? Object.fromEntries(
                    Object.entries(v).map(([k, x]) => [k, rewrite(x)]),
                  )
                : v;
        res.json(rewrite(result));
      } catch (error) {
        next(error);
      }
    },
  );
  app.post(
    "/api/platform/admin/providers/:provider/reviews/:id/grade",
    requireAdmin,
    async (req, res, next) => {
      try {
        const v = z
          .object({
            kind: z
              .enum(["exam", "assignment", "essay", "speaking"])
              .default("exam"),
            scores: z.record(z.number().min(0).max(1000000)),
            feedback: z.string().trim().min(3).max(10000),
          })
          .strict()
          .parse(req.body);
        res.json(
          await providerRequest(
            String(req.params.provider),
            "admin/exam-attempts/" +
              z.string().uuid().parse(req.params.id) +
              "/grade",
            { ...v, actorId: req.session.userId },
          ),
        );
      } catch (error) {
        next(error);
      }
    },
  );
  app.post(
    "/api/platform/admin/providers/:provider/sync",
    requireAdmin,
    async (req, res, next) => {
      try {
        res.json(await syncProviderCatalog(String(req.params.provider)));
      } catch (error) {
        next(error);
      }
    },
  );
  app.get(
    "/api/platform/owned/:id/files/:fileId",
    requireAuth,
    async (req, res, next) => {
      try {
        const o = await ownedOrder(
          req.session.userId!,
          String(req.params.id),
          req.query.order,
        );
        const fileId = z.string().uuid().parse(req.params.fileId);
        const response = await providerRequest(
          o.policy.provider,
          "files/" + fileId,
          undefined,
          { userId: o.user_id, orderId: o.id },
          "GET",
          undefined,
          true,
        );
        res.set(
          "Content-Type",
          response.headers.get("content-type") || "application/octet-stream",
        );
        const disposition = response.headers.get("content-disposition");
        if (disposition) res.set("Content-Disposition", disposition);
        const data = Buffer.from(await response.arrayBuffer());
        if (data.length > 6 * 1024 * 1024)
          return res
            .status(413)
            .json({ message: "Fayl hajmi ruxsatdan katta" });
        res.send(data);
      } catch (error) {
        next(error);
      }
    },
  );
  const streamPdf = async (response: any, res: any) => {
    res.status(response.status);
    for (const h of [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "content-disposition",
    ]) {
      const v = response.headers.get(h);
      if (v) res.set(h, v);
    }
    res.set("Cache-Control", "private, no-store, no-transform");
    if (!response.body) return res.end();
    const stream = Readable.fromWeb(response.body);
    res.on("close", () => stream.destroy());
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  };
  app.get("/api/platform/products/:id/demo-file", async (req, res, next) => {
    try {
      const p = await product(String(req.params.id));
      if (!p || p.status !== "published" || p.kind !== "pdf" || !p.demo_ref)
        problem(404, "PDF demo topilmadi");
      await streamPdf(
        await providerRequest(
          p.provider,
          "products/" + encodeURIComponent(p.source_id) + "/demo-file",
          undefined,
          undefined,
          "GET",
          undefined,
          true,
          req.get("range"),
        ),
        res,
      );
    } catch (e) {
      next(e);
    }
  });
  app.get(
    "/api/platform/owned/:id/pdf/:readerId/file",
    requireAuth,
    async (req, res, next) => {
      try {
        const o = await ownedOrder(
          req.session.userId!,
          String(req.params.id),
          req.query.order,
        );
        if (o.policy.kind !== "pdf") problem(404, "PDF topilmadi");
        const id = z.string().uuid().parse(req.params.readerId);
        await streamPdf(
          await providerRequest(
            o.policy.provider,
            "native/pdf-sessions/" + id + "/file",
            undefined,
            { userId: o.user_id, orderId: o.id },
            "GET",
            undefined,
            true,
            req.get("range"),
          ),
          res,
        );
      } catch (e) {
        next(e);
      }
    },
  );
  app.get("/api/platform/owned/:id", requireAuth, async (req, res, next) => {
    try {
      const o = await ownedOrder(
        req.session.userId!,
        String(req.params.id),
        req.query.order,
      );
      const view = await providerRequest(
        o.policy.provider,
        "owned/" + encodeURIComponent(o.policy.sourceId) + "/view",
        undefined,
        { userId: o.user_id, orderId: o.id },
      );
      if (
        Number.isInteger(view.attemptsRemaining) &&
        view.attemptsRemaining >= 0
      )
        await pool.query(
          "UPDATE platform_orders SET source_result=COALESCE(source_result,'{}'::jsonb)||$2::jsonb WHERE id=$1",
          [o.id, JSON.stringify({ attemptsRemaining: view.attemptsRemaining })],
        );
      if (Number.isFinite(view.completionPercent))
        await pool.query(
          "UPDATE platform_orders SET source_result=COALESCE(source_result,'{}'::jsonb)||$2::jsonb WHERE id=$1",
          [
            o.id,
            JSON.stringify({
              completionPercent: Math.max(
                0,
                Math.min(100, view.completionPercent),
              ),
            }),
          ],
        );
      view.accessChoices = (
        await pool.query(
          "SELECT id,expires_at,policy->>'legacy' AS legacy FROM platform_orders WHERE user_id=$1 AND product_id=$2 AND status='active' AND (expires_at IS NULL OR expires_at>now()) ORDER BY created_at DESC",
          [req.session.userId, o.product_id],
        )
      ).rows.map((r: any) => ({
        id: r.id,
        expiresAt: r.expires_at,
        legacy: r.legacy === "true",
      }));
      view.currentOrderId = o.id;
      res.json(view);
    } catch (error) {
      next(error);
    }
  });
  app.all(
    "/api/platform/owned/:id/native/*nativePath",
    requireAuth,
    express.raw({ type: "multipart/form-data", limit: "20mb" }),
    async (req, res, next) => {
      try {
        if (!["GET", "POST"].includes(req.method))
          return res.status(405).json({ message: "Amal ruxsat etilmagan" });
        const raw = (req.params as any).nativePath;
        const path = Array.isArray(raw) ? raw.join("/") : String(raw);
        if (
          !/^[a-zA-Z0-9_:\/-]+$/.test(path) ||
          path.includes("..") ||
          path.includes("//")
        )
          return res.status(400).json({ message: "API yo‘li noto‘g‘ri" });
        const o = await ownedOrder(
          req.session.userId!,
          String(req.params.id),
          req.query.order,
        );
        const result = await providerRequest(
          o.policy.provider,
          "native/" + path,
          req.method === "GET" ? undefined : req.body,
          { userId: o.user_id, orderId: o.id },
          req.method,
          req.get("content-type"),
        );
        const rewrite = (v: any): any =>
          typeof v === "string" &&
          /^\/api\/private-files\/[0-9a-f-]{36}$/.test(v)
            ? "/api/platform/core/platform/owned/" +
              o.product_id +
              "/order/" +
              o.id +
              "/files/" +
              v.split("/").pop()
            : Array.isArray(v)
              ? v.map(rewrite)
              : v && typeof v === "object"
                ? Object.fromEntries(
                    Object.entries(v).map(([k, value]) => [k, rewrite(value)]),
                  )
                : v;
        res.json(rewrite(result));
      } catch (error) {
        next(error);
      }
    },
  );
  app.get(
    "/api/platform/admin/products",
    requireAdmin,
    async (_req, res, next) => {
      try {
        await syncTubeProducts();
        res.json({
          products: (
            await pool.query(
              "SELECT * FROM platform_products ORDER BY updated_at DESC",
            )
          ).rows.map(dto),
          providers: Object.entries(providerConfig).map(([id, p]) => ({
            id,
            configured: !!process.env[p.env],
          })),
        });
      } catch (error) {
        next(error);
      }
    },
  );
  app.patch(
    "/api/platform/admin/products/:id",
    requireAdmin,
    async (req, res, next) => {
      try {
        const p = await product(String(req.params.id));
        if (!p) return res.status(404).json({ message: "Mahsulot topilmadi" });
        const v = offerInput.parse(req.body);
        if (p.kind === "test" && v.status === "published" && !v.maxAttempts)
          return res
            .status(400)
            .json({ message: "Test uchun urinish limiti kerak" });
        if (
          v.status === "published" &&
          p.source_metadata?.readyForSale === false
        )
          return res.status(409).json({
            message:
              p.source_metadata.saleNote ||
              "Tarifning barcha imkoniyatlari hali ulanmagan",
          });
        if (
          (p.provider === "courses" ||
            (p.provider === "arabictest" && p.kind === "course")) &&
          v.status === "published" &&
          !v.durationDays
        )
          return res
            .status(400)
            .json({ message: "Video kurs uchun foydalanish muddati kerak" });
        if (p.provider === "tube" && v.maxAttempts !== null)
          return res.status(400).json({
            message: "Tube Mentor darslari uchun urinish limiti qo‘llanmaydi",
          });
        if (v.status === "published" && !v.demoRef)
          return res.status(400).json({ message: "Savdo uchun demo kerak" });
        if (p.provider !== "tube" && v.status === "published")
          await providerRequest(
            p.provider,
            "products/" + encodeURIComponent(p.source_id) + "/demo",
          );
        if (
          p.provider === "quiz" &&
          p.kind === "test" &&
          v.status === "published"
        )
          await providerRequest(
            "quiz",
            "products/" + encodeURIComponent(p.source_id) + "/sale",
            { enabled: true },
          );
        if (p.provider === "tube") {
          const settings = await getCommerceSettings();
          const globalDemo = settings.demoLessonId === Number(p.source_id);
          if (v.priceCoins > 100000 || (!globalDemo && v.priceCoins < 1))
            return res.status(400).json({
              message: "Tube Mentor darsi narxi 1–100000 coin bo‘lishi kerak",
            });
          if (globalDemo && v.priceCoins !== 0)
            return res.status(409).json({
              message:
                "Bu dars umumiy ochiq demo sifatida tanlangan. Avval demo dars sozlamasini almashtiring",
            });
          if (!globalDemo) {
            settings.lessonPrices[p.source_id] = v.priceCoins;
            // Change only this lesson price; preserve payee settings and simultaneous edits of other lessons.
            await pool.query(
              "INSERT INTO system_settings(key,value) VALUES('commerce',$1) ON CONFLICT(key) DO UPDATE SET value=jsonb_set(jsonb_set(COALESCE(system_settings.value::jsonb,'{}'::jsonb),'{lessonPrices}',COALESCE(system_settings.value::jsonb->'lessonPrices','{}'::jsonb),true),ARRAY['lessonPrices',$2]::text[],to_jsonb($3::int),true)::text",
              [JSON.stringify(settings), p.source_id, v.priceCoins],
            );
          }
        }
        await pool.query(
          "UPDATE platform_products SET title=$2,description=$3,price_coins=$4,duration_days=$5,max_attempts=$6,demo_ref=$7,status=$8,updated_at=now() WHERE id=$1",
          [
            p.id,
            v.title,
            v.description,
            v.priceCoins,
            v.durationDays,
            v.maxAttempts,
            v.demoRef,
            v.status,
          ],
        );
        await pool.query(
          "INSERT INTO commerce_audit(actor_id,action,reference_id,details) VALUES($1,'product_updated',$2,$3)",
          [req.session.userId, p.id, JSON.stringify(v)],
        );
        res.json(dto(await product(p.id)));
      } catch (error) {
        next(error);
      }
    },
  );
  app.get(
    "/api/platform/admin/actions",
    requireAdmin,
    async (_req, res, next) => {
      try {
        res.json(
          (
            await pool.query(
              "SELECT id,order_id,input,status,error,created_at FROM platform_admin_actions ORDER BY created_at DESC LIMIT 200",
            )
          ).rows,
        );
      } catch (error) {
        next(error);
      }
    },
  );
  app.get(
    "/api/platform/admin/orders",
    requireAdmin,
    async (_req, res, next) => {
      try {
        res.json(
          (
            await pool.query(
              "SELECT id,user_id,product_id,status,price_coins,policy,expires_at,error,created_at FROM platform_orders ORDER BY created_at DESC LIMIT 200",
            )
          ).rows,
        );
      } catch (error) {
        next(error);
      }
    },
  );
  app.post(
    "/api/platform/admin/orders/:id/manage",
    requireAdmin,
    async (req, res, next) => {
      try {
        const { requestKey, ...input } = z
          .object({
            requestKey: z.string().uuid(),
            action: z.enum(["extend", "revoke", "refund"]),
            days: z.number().int().min(1).max(3650).optional(),
            reason: z.string().trim().min(5).max(1000),
          })
          .strict()
          .parse(req.body);
        res.json(
          await queuePlatformAction(
            req.session.userId!,
            z.string().uuid().parse(req.params.id),
            requestKey,
            input,
          ),
        );
      } catch (error) {
        next(error);
      }
    },
  );
  app.post(
    "/api/platform/admin/orders/:id/retry",
    requireAdmin,
    async (req, res, next) => {
      try {
        await provisionOrder(z.string().uuid().parse(req.params.id));
        res.json({ success: true });
      } catch (error) {
        next(error);
      }
    },
  );
  if (process.env.NODE_ENV === "production") {
    let syncing = false;
    const refreshCatalog = async () => {
      if (syncing) return;
      syncing = true;
      try {
        for (const [id, config] of Object.entries(providerConfig))
          if (process.env[config.env]) {
            try {
              const result = await syncProviderCatalog(id);
              console.info("Provider catalog synchronized", id, result.count);
            } catch {
              console.error("Provider catalog refresh deferred", id);
            }
          }
      } catch {
        console.error("Provider catalog refresh deferred");
      } finally {
        syncing = false;
      }
    };
    const initial = setTimeout(() => {
      void refreshCatalog();
    }, 1000);
    initial.unref();
    const catalogTimer = setInterval(() => {
      void refreshCatalog();
    }, 600000);
    catalogTimer.unref();
    http.once("close", () => {
      clearTimeout(initial);
      clearInterval(catalogTimer);
    });
    let reconciling = false;
    const timer = setInterval(async () => {
      if (reconciling) return;
      reconciling = true;
      try {
        const orders = await pool.query(
          "SELECT id FROM platform_orders WHERE status='pending' AND next_try_at<=now() AND (locked_until IS NULL OR locked_until<now()) LIMIT 10",
        );
        for (const o of orders.rows) await provisionOrder(o.id);
        const actions = await pool.query(
          "SELECT id FROM platform_admin_actions WHERE status='pending' AND (locked_until IS NULL OR locked_until<now()) LIMIT 10",
        );
        for (const a of actions.rows) await processPlatformAction(a.id);
      } catch {
        console.error("Marketplace delivery reconciliation failed");
      } finally {
        reconciling = false;
      }
    }, 15000);
    timer.unref();
    http.once("close", () => clearInterval(timer));
  }
}
