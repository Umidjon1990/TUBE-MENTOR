import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { and, asc, desc, eq, isNull, sql, or, gt } from "drizzle-orm";
import { z } from "zod";
import { db, pool } from "./db";
import { requireAdmin, requireAuth, hasVerifiedIdentity } from "./auth";
import { rateLimit } from "./security";
import { publishedLesson } from "@shared/learning";
import {
  coinGrants,
  coinPackages,
  coinTransactions,
  commerceAudit,
  lessonAccess,
  lessons,
  notificationOutbox,
  paymentOrders,
  paymentReceipts,
  systemSettings,
  users,
} from "@shared/schema";
import {
  DEFAULT_COMMERCE_SETTINGS,
  lessonPrice,
  LESSON_COST,
  WELCOME_COINS,
  type CommerceSettings,
  type PaymentOrderDTO,
  type PaymentReviewInput,
  type WalletDTO,
} from "@shared/commerce";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export class CommerceError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "CommerceError";
  }
}
export function commerceDatabaseError(error: unknown): {
  code?: string;
  constraint?: string;
} {
  let current = error;
  for (
    let depth = 0;
    depth < 5 && current && typeof current === "object";
    depth++
  ) {
    const item = current as {
      code?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };
    if (typeof item.code === "string" && /^[0-9A-Z]{5}$/.test(item.code))
      return {
        code: item.code,
        constraint:
          typeof item.constraint === "string" ? item.constraint : undefined,
      };
    current = item.cause;
  }
  return {};
}
const problem = (status: number, code: string, message: string): never => {
  throw new CommerceError(status, code, message);
};
const idSchema = z.string().uuid();
const numericId = z.coerce.number().int().positive();
const bankRef = z
  .string()
  .trim()
  .min(3)
  .max(160)
  .transform((v) => v.toUpperCase());
const reasonSchema = z.string().trim().min(3).max(1000);
const packageSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    coins: z.number().int().min(1).max(100000),
    priceUzs: z.number().int().min(0).max(100000000),
    isActive: z.boolean(),
  })
  .strict();
const settingsSchema = z
  .object({
    welcomeCoins: z.number().int().min(1).max(100000).default(WELCOME_COINS),
    lessonCost: z.number().int().min(1).max(100000).default(LESSON_COST),
    lessonPrices: z
      .record(
        z.string().regex(/^[1-9]\d*$/),
        z.number().int().min(1).max(100000),
      )
      .default({}),
    demoLessonId: z.number().int().positive().nullable(),
    paymentsEnabled: z.boolean(),
    recipientName: z.string().trim().max(150),
    cardNumber: z
      .string()
      .trim()
      .max(30)
      .transform((v) => v.replace(/[\s-]/g, "")),
    paymeUrl: z.string().trim().max(1000),
    paymentInstructions: z.string().trim().max(3000),
    reviewHours: z.string().trim().max(300),
  })
  .strict();
const reviewSchema = z
  .object({
    decision: z.enum(["approve", "reject", "needs_info"]),
    bankReference: bankRef.optional(),
    reason: reasonSchema.optional(),
  })
  .strict();
const adjustmentSchema = z
  .object({
    amount: z
      .number()
      .int()
      .min(-100000)
      .max(100000)
      .refine((v) => v !== 0),
    reason: reasonSchema,
    idempotencyKey: z.string().trim().min(12).max(120),
  })
  .strict();

async function audit(tx: Tx, values: typeof commerceAudit.$inferInsert) {
  await tx.insert(commerceAudit).values(values);
}
async function outbox(
  tx: Tx,
  kind: string,
  referenceId: string,
  payload: Record<string, unknown> = {},
) {
  await tx
    .insert(notificationOutbox)
    .values({ kind, referenceId, payload })
    .onConflictDoNothing();
}
export async function enqueueNotification(
  kind: string,
  referenceId: string,
  payload: Record<string, unknown> = {},
) {
  await db.transaction((tx) => outbox(tx, kind, referenceId, payload));
}

export async function getCommerceSettings(
  source: Pick<typeof db, "select"> = db,
): Promise<CommerceSettings> {
  const [entry] = await source
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, "commerce"));
  try {
    const result = settingsSchema.safeParse({
      ...DEFAULT_COMMERCE_SETTINGS,
      ...JSON.parse(entry?.value || "{}"),
    });
    return result.success ? result.data : { ...DEFAULT_COMMERCE_SETTINGS };
  } catch {
    return { ...DEFAULT_COMMERCE_SETTINGS };
  }
}
export async function hasLessonEntitlement(
  userId: string,
  lessonId: number,
): Promise<boolean> {
  const [entry] = await db
    .select({ id: lessonAccess.id })
    .from(lessonAccess)
    .where(
      and(
        eq(lessonAccess.userId, userId),
        eq(lessonAccess.lessonId, lessonId),
        isNull(lessonAccess.revokedAt),
        or(isNull(lessonAccess.expiresAt), gt(lessonAccess.expiresAt, new Date())),
      ),
    );
  return Boolean(entry);
}
async function lockUser(tx: Tx, userId: string) {
  const [user] = await tx
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .for("update");
  if (!user) return problem(404, "USER_NOT_FOUND", "O‘quvchi topilmadi");
  return user;
}
async function assertAdmin(tx: Tx, actorId: string) {
  const [actor] = await tx.select().from(users).where(eq(users.id, actorId));
  if (!actor?.isActive || actor.role !== "admin" || !hasVerifiedIdentity(actor))
    problem(403, "ADMIN_REQUIRED", "Faol admin hisobi talab qilinadi");
}
/** Old balance grants are created by migration; this catches accounts provisioned by a legacy integration. */
async function reconcileLots(tx: Tx, user: typeof users.$inferSelect) {
  const lots = await tx
    .select()
    .from(coinGrants)
    .where(eq(coinGrants.userId, user.id))
    .for("update");
  const total = lots.reduce((n, l) => n + l.remaining, 0);
  if (total !== user.coins)
    problem(
      409,
      "WALLET_RECONCILIATION_REQUIRED",
      "Balans tarixi mos kelmadi. Adminga murojaat qiling.",
    );
  return lots;
}
async function applyCredit(
  tx: Tx,
  user: typeof users.$inferSelect,
  amount: number,
  type: string,
  key: string,
  description: string,
  source: "bonus" | "paid" | "adjustment",
  actorId?: string,
  orderId?: string,
  bankReference?: string,
) {
  if (
    !Number.isSafeInteger(user.coins + amount) ||
    user.coins + amount > 2147483647
  )
    problem(409, "BALANCE_LIMIT", "Balans chegarasi oshib ketdi");
  const [transaction] = await tx
    .insert(coinTransactions)
    .values({
      userId: user.id,
      amount,
      type,
      description,
      idempotencyKey: key,
      actorId,
      orderId,
      bankReference,
      balanceBefore: user.coins,
      balanceAfter: user.coins + amount,
    })
    .returning();
  await tx.insert(coinGrants).values({
    userId: user.id,
    source,
    amount,
    remaining: amount,
    orderId,
    transactionId: transaction.id,
    idempotencyKey: key,
  });
  await tx
    .update(users)
    .set({ coins: user.coins + amount, updatedAt: new Date() })
    .where(eq(users.id, user.id));
  return { balance: user.coins + amount, transaction };
}
async function consumeLots(tx: Tx, userId: string, amount: number) {
  const lots = await tx
    .select()
    .from(coinGrants)
    .where(and(eq(coinGrants.userId, userId), sql`${coinGrants.remaining}>0`))
    .orderBy(
      sql`CASE ${coinGrants.source} WHEN 'bonus' THEN 0 WHEN 'legacy' THEN 1 WHEN 'adjustment' THEN 2 ELSE 3 END`,
      asc(coinGrants.createdAt),
      asc(coinGrants.id),
    )
    .for("update");
  let remaining = amount;
  const allocations: { grantId: number; amount: number; source: string }[] = [];
  for (const lot of lots) {
    if (remaining === 0) break;
    const use = Math.min(lot.remaining, remaining);
    await tx
      .update(coinGrants)
      .set({ remaining: lot.remaining - use })
      .where(eq(coinGrants.id, lot.id));
    allocations.push({ grantId: lot.id, amount: use, source: lot.source });
    remaining -= use;
  }
  if (remaining)
    problem(
      409,
      "WALLET_RECONCILIATION_REQUIRED",
      "Coin manbalari yetarli emas",
    );
  return allocations;
}
export async function grantWelcomeBonus(
  userId: string,
): Promise<{ balance: number; granted: boolean }> {
  return db.transaction(async (tx) => {
    const user = await lockUser(tx, userId);
    if (!user.isActive || user.role !== "student" || !hasVerifiedIdentity(user))
      return { balance: user.coins, granted: false };
    const key = `welcome:${user.id}`;
    const [existing] = await tx
      .select()
      .from(coinTransactions)
      .where(eq(coinTransactions.idempotencyKey, key));
    if (existing) return { balance: user.coins, granted: false };
    const bonus = (await getCommerceSettings(tx)).welcomeCoins;
    await reconcileLots(tx, user);
    const result = await applyCredit(
      tx,
      user,
      bonus,
      "welcome_bonus",
      key,
      "Ro‘yxatdan o‘tish bonusi",
      "bonus",
    );
    await audit(tx, {
      userId,
      action: "welcome_bonus",
      referenceId: String(result.transaction.id),
      idempotencyKey: key,
      details: { amount: bonus, balance: result.balance },
    });
    return { balance: result.balance, granted: true };
  });
}
export async function getWallet(userId: string): Promise<WalletDTO> {
  await grantWelcomeBonus(userId);
  return db.transaction(async (tx) => {
    // Writers lock the same wallet row first; the view cannot mix two balances.
    const [user] = await tx
      .select({ coins: users.coins })
      .from(users)
      .where(eq(users.id, userId))
      .for("share");
    if (!user) return problem(404, "USER_NOT_FOUND", "Hisob topilmadi");
    const transactions = await tx
      .select({
        id: coinTransactions.id,
        amount: coinTransactions.amount,
        type: coinTransactions.type,
        description: coinTransactions.description,
        createdAt: coinTransactions.createdAt,
        balanceBefore: coinTransactions.balanceBefore,
        balanceAfter: coinTransactions.balanceAfter,
      })
      .from(coinTransactions)
      .where(eq(coinTransactions.userId, userId))
      .orderBy(desc(coinTransactions.id))
      .limit(100);
    const owned = await tx
      .select({ lessonId: lessonAccess.lessonId })
      .from(lessonAccess)
      .where(
        and(eq(lessonAccess.userId, userId), isNull(lessonAccess.revokedAt), or(isNull(lessonAccess.expiresAt), gt(lessonAccess.expiresAt, new Date()))),
      );
    const [bonus] = await tx
      .select({ id: coinTransactions.id })
      .from(coinTransactions)
      .where(eq(coinTransactions.idempotencyKey, `welcome:${userId}`));
    return {
      balance: user.coins,
      bonusGranted: Boolean(bonus),
      ownedLessonIds: owned.map((r) => r.lessonId),
      transactions: transactions.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  });
}
export async function purchaseLesson(userId: string, lessonId: number) {
  await grantWelcomeBonus(userId);
  const settings = await getCommerceSettings();
  const offer = await pool.query("SELECT status,duration_days FROM platform_products WHERE provider='tube' AND source_id=$1", [String(lessonId)]);
  if (offer.rows[0])
    problem(409, 'MARKETPLACE_REQUIRED', 'Xaridni asosiy marketplace orqali yakunlang');
  return db.transaction(async (tx) => {
    const user = await lockUser(tx, userId);
    if (!user.isActive || user.role !== "student" || !hasVerifiedIdentity(user))
      problem(403, "STUDENT_REQUIRED", "Dars xaridi o‘quvchi hisobi uchun");
    const [owned] = await tx
      .select()
      .from(lessonAccess)
      .where(
        and(
          eq(lessonAccess.userId, userId),
          eq(lessonAccess.lessonId, lessonId),
        ),
      )
      .for("update");
    if (owned?.expiresAt && owned.expiresAt <= new Date())
      problem(402, 'LESSON_EXPIRED', 'Dars muddati tugagan. Asosiy kabinetdan uzaytiring.');
    if (owned && !owned.revokedAt)
      return { balance: user.coins, lessonId, alreadyOwned: true };
    const [lesson] = await tx
      .select()
      .from(lessons)
      .where(eq(lessons.id, lessonId))
      .for("share");
    if (!lesson || lesson.status === "archived" || !publishedLesson(lesson))
      problem(404, "LESSON_UNAVAILABLE", "Dars sotuvda mavjud emas");
    if (settings.demoLessonId === lessonId)
      return { balance: user.coins, lessonId, alreadyOwned: true };
    if (owned?.revokedAt)
      problem(
        403,
        "ACCESS_REVOKED",
        "Darsga kirish bekor qilingan. Adminga murojaat qiling.",
      );
    const cost = lessonPrice(settings, lessonId);
    if (user.coins < cost)
      problem(
        402,
        "INSUFFICIENT_COINS",
        "Balans yetarli emas. Coin paketini tanlang.",
      );
    await reconcileLots(tx, user);
    const allocations = await consumeLots(tx, userId, cost);
    const key = `lesson-purchase:${userId}:${lessonId}`;
    const [transaction] = await tx
      .insert(coinTransactions)
      .values({
        userId,
        amount: -cost,
        type: "lesson_purchase",
        description: `Dars: ${publishedLesson(lesson)!.title}`,
        lessonId,
        idempotencyKey: key,
        balanceBefore: user.coins,
        balanceAfter: user.coins - cost,
        metadata: { allocations },
      })
      .returning();
    await tx.insert(lessonAccess).values({
      userId,
      lessonId,
      source: "purchase",
      priceCoins: cost,
      purchaseTransactionId: transaction.id,
    });
    await tx
      .update(users)
      .set({ coins: user.coins - cost, updatedAt: new Date() })
      .where(eq(users.id, userId));
    await audit(tx, {
      userId,
      action: "lesson_purchase",
      referenceId: String(lessonId),
      idempotencyKey: key,
      details: { amount: cost, transactionId: transaction.id },
    });
    return { balance: user.coins - cost, lessonId, alreadyOwned: false };
  });
}

async function orderDTO(
  order: typeof paymentOrders.$inferSelect,
  admin = false,
): Promise<PaymentOrderDTO> {
  const receipts = await db
    .select({
      id: paymentReceipts.id,
      mimeType: paymentReceipts.mimeType,
      originalName: paymentReceipts.originalName,
      sha256: paymentReceipts.sha256,
      createdAt: paymentReceipts.createdAt,
    })
    .from(paymentReceipts)
    .where(eq(paymentReceipts.orderId, order.id))
    .orderBy(asc(paymentReceipts.id));
  const receiptDTOs = await Promise.all(
    receipts.map(async (r) => {
      let duplicateWarning = false;
      if (admin) {
        const [duplicate] = await db
          .select({ id: paymentReceipts.id })
          .from(paymentReceipts)
          .where(
            and(
              eq(paymentReceipts.sha256, r.sha256),
              sql`${paymentReceipts.orderId}<>${order.id}`,
            ),
          )
          .limit(1);
        duplicateWarning = Boolean(duplicate);
      }
      return {
        id: r.id,
        mimeType: r.mimeType,
        originalName: r.originalName,
        url: `/api/commerce/receipts/${r.id}`,
        createdAt: r.createdAt.toISOString(),
        ...(admin ? { duplicateWarning } : {}),
      };
    }),
  );
  let fullName: string | undefined;
  if (admin) {
    const [owner] = await db
      .select({ name: users.fullName })
      .from(users)
      .where(eq(users.id, order.userId));
    fullName = owner?.name;
  }
  return {
    id: order.id,
    packageName: order.packageName,
    coins: order.coins,
    priceUzs: order.priceUzs,
    status: order.status as PaymentOrderDTO["status"],
    reason: order.reason,
    bankReference: order.bankReference,
    refundedCoins: order.refundedCoins,
    createdAt: order.createdAt.toISOString(),
    expiresAt: order.expiresAt.toISOString(),
    instructions: {
      recipientName: order.instructions.recipientName || "",
      cardNumber: order.instructions.cardNumber || "",
      paymeUrl: order.instructions.paymeUrl || "",
      paymentInstructions: order.instructions.paymentInstructions || "",
      reviewHours: order.instructions.reviewHours || "",
    },
    receipts: receiptDTOs,
    ...(admin
      ? {
          userId: order.userId,
          fullName,
          duplicateReceiptWarning: receiptDTOs.some(
            (receipt) => receipt.duplicateWarning,
          ),
        }
      : {}),
  };
}
export async function getOrderForUser(
  orderId: string,
  userId: string,
  admin = false,
): Promise<PaymentOrderDTO> {
  idSchema.parse(orderId);
  if (admin) await db.transaction((tx) => assertAdmin(tx, userId));
  let [order] = await db
    .select()
    .from(paymentOrders)
    .where(
      and(
        eq(paymentOrders.id, orderId),
        ...(admin ? [] : [eq(paymentOrders.userId, userId)]),
      ),
    );
  if (!order) return problem(404, "ORDER_NOT_FOUND", "Buyurtma topilmadi");
  if (
    order.status === "awaiting_payment" &&
    order.expiresAt.getTime() < Date.now()
  ) {
    const [expired] = await db
      .update(paymentOrders)
      .set({ status: "expired", updatedAt: new Date() })
      .where(
        and(
          eq(paymentOrders.id, order.id),
          eq(paymentOrders.status, "awaiting_payment"),
        ),
      )
      .returning();
    if (expired) order = expired;
  }
  return orderDTO(order, admin);
}
export async function createPaymentOrder(
  userId: string,
  packageId: number,
): Promise<PaymentOrderDTO> {
  const settings = await getCommerceSettings();
  if (!settings.paymentsEnabled)
    problem(
      503,
      "PAYMENTS_DISABLED",
      "To‘lovlar hali sozlanmagan. Adminga murojaat qiling.",
    );
  const order = await db.transaction(async (tx) => {
    const user = await lockUser(tx, userId);
    if (!user.isActive || user.role !== "student" || !hasVerifiedIdentity(user))
      problem(403, "STUDENT_REQUIRED", "O‘quvchi hisobi talab qilinadi");
    const [pack] = await tx
      .select()
      .from(coinPackages)
      .where(
        and(eq(coinPackages.id, packageId), eq(coinPackages.isActive, true)),
      )
      .for("share");
    if (!pack || pack.priceUzs <= 0)
      problem(404, "PACKAGE_UNAVAILABLE", "Tarif mavjud emas");
    const [pending] = await tx
      .select()
      .from(paymentOrders)
      .where(
        and(
          eq(paymentOrders.userId, userId),
          eq(paymentOrders.packageId, packageId),
          eq(paymentOrders.status, "awaiting_payment"),
          sql`${paymentOrders.expiresAt}>now()`,
        ),
      )
      .orderBy(desc(paymentOrders.createdAt));
    if (pending) return pending;
    const {
      demoLessonId: _demo,
      paymentsEnabled: _enabled,
      welcomeCoins: _welcome,
      lessonCost: _cost,
      lessonPrices: _prices,
      ...instructions
    } = settings;
    const [created] = await tx
      .insert(paymentOrders)
      .values({
        id: randomUUID(),
        userId,
        packageId,
        packageName: pack.name,
        coins: pack.coins,
        priceUzs: pack.priceUzs,
        instructions,
        status: "awaiting_payment",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
      .returning();
    await audit(tx, {
      userId,
      action: "order_created",
      referenceId: created.id,
      details: { coins: pack.coins, priceUzs: pack.priceUzs, packageId },
    });
    return created;
  });
  return orderDTO(order);
}
export async function reviewPaymentOrder(
  orderId: string,
  actorId: string,
  input: PaymentReviewInput,
): Promise<PaymentOrderDTO> {
  idSchema.parse(orderId);
  const parsed = reviewSchema.parse(input);
  try {
    await db.transaction(async (tx) => {
      await assertAdmin(tx, actorId);
      const [order] = await tx
        .select()
        .from(paymentOrders)
        .where(eq(paymentOrders.id, orderId))
        .for("update");
      if (!order) return problem(404, "ORDER_NOT_FOUND", "Buyurtma topilmadi");
      if (
        ["approved", "partially_refunded", "refunded"].includes(order.status)
      ) {
        if (
          parsed.decision === "approve" &&
          parsed.bankReference === order.bankReference
        )
          return;
        problem(
          409,
          "ORDER_ALREADY_APPROVED",
          "Buyurtma allaqachon tasdiqlangan",
        );
      }
      if (
        ![
          "receipt_submitted",
          "under_review",
          "needs_info",
          "expired",
          "rejected",
          "cancelled",
        ].includes(order.status)
      )
        problem(
          409,
          "ORDER_NOT_REVIEWABLE",
          "Buyurtmani hozir tekshirib bo‘lmaydi",
        );
      if (parsed.decision === "approve") {
        if (!parsed.bankReference)
          problem(
            400,
            "BANK_REFERENCE_REQUIRED",
            "Bank tranzaksiya raqami talab qilinadi",
          );
        if (
          ["expired", "rejected", "cancelled"].includes(order.status) &&
          !parsed.reason
        )
          problem(
            400,
            "LATE_PAYMENT_REASON_REQUIRED",
            "Kechikkan to‘lov tasdig‘iga izoh kiriting",
          );
        const [usedRefund] = await tx
          .select({ id: coinTransactions.id })
          .from(coinTransactions)
          .where(
            eq(
              coinTransactions.idempotencyKey,
              `refund:${parsed.bankReference}`,
            ),
          );
        if (usedRefund)
          problem(
            409,
            "BANK_REFERENCE_USED",
            "Bank tranzaksiyasi qaytarishda ishlatilgan",
          );
        const [receipt] = await tx
          .select({ id: paymentReceipts.id })
          .from(paymentReceipts)
          .where(eq(paymentReceipts.orderId, order.id));
        if (!receipt)
          problem(409, "RECEIPT_REQUIRED", "To‘lov cheki yuklanmagan");
        const user = await lockUser(tx, order.userId);
        if (!user.isActive)
          problem(
            409,
            "USER_INACTIVE",
            "Bloklangan hisob to‘lovini avval tekshiring",
          );
        await reconcileLots(tx, user);
        const key = `payment:${order.id}`;
        const result = await applyCredit(
          tx,
          user,
          order.coins,
          "payment_credit",
          key,
          `${order.packageName}: to‘lov tasdiqlandi`,
          "paid",
          actorId,
          order.id,
          parsed.bankReference,
        );
        await tx
          .update(paymentOrders)
          .set({
            status: "approved",
            bankReference: parsed.bankReference,
            reason: parsed.reason || null,
            reviewedBy: actorId,
            reviewedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(paymentOrders.id, order.id));
        await audit(tx, {
          actorId,
          userId: order.userId,
          action: "payment_approved",
          referenceId: order.id,
          idempotencyKey: key,
          details: {
            bankReference: parsed.bankReference,
            coins: order.coins,
            priceUzs: order.priceUzs,
            balance: result.balance,
          },
        });
        await outbox(tx, "payment_review", `${order.id}:approved`, {
          orderId: order.id,
          userId: order.userId,
          status: "approved",
          coins: order.coins,
        });
      } else {
        if (!parsed.reason) problem(400, "REASON_REQUIRED", "Sababni kiriting");
        const status = parsed.decision === "reject" ? "rejected" : "needs_info";
        await tx
          .update(paymentOrders)
          .set({
            status,
            reason: parsed.reason,
            reviewedBy: actorId,
            reviewedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(paymentOrders.id, order.id));
        await audit(tx, {
          actorId,
          userId: order.userId,
          action: `payment_${status}`,
          referenceId: order.id,
          details: { reason: parsed.reason },
        });
        await outbox(
          tx,
          "payment_review",
          `${order.id}:${status}:${randomUUID()}`,
          {
            orderId: order.id,
            userId: order.userId,
            status,
            reason: parsed.reason,
          },
        );
      }
    });
  } catch (error) {
    if (commerceDatabaseError(error).code === "23505")
      problem(
        409,
        "BANK_REFERENCE_USED",
        "Bu bank tranzaksiyasi allaqachon ishlatilgan",
      );
    throw error;
  }
  return getOrderForUser(orderId, actorId, true);
}
export async function refundPaymentOrder(
  orderId: string,
  actorId: string,
  input: { coins: number; bankReference: string; reason: string },
): Promise<PaymentOrderDTO> {
  idSchema.parse(orderId);
  const parsed = z
    .object({
      coins: z.number().int().positive().max(100000),
      bankReference: bankRef,
      reason: reasonSchema,
    })
    .strict()
    .parse(input);
  await db
    .transaction(async (tx) => {
      await assertAdmin(tx, actorId);
      const [order] = await tx
        .select()
        .from(paymentOrders)
        .where(eq(paymentOrders.id, orderId))
        .for("update");
      if (!order) return problem(404, "ORDER_NOT_FOUND", "Buyurtma topilmadi");
      const key = `refund:${parsed.bankReference}`;
      const [previous] = await tx
        .select()
        .from(coinTransactions)
        .where(eq(coinTransactions.idempotencyKey, key));
      if (previous) {
        if (previous.orderId !== orderId || previous.amount !== -parsed.coins)
          problem(
            409,
            "IDEMPOTENCY_CONFLICT",
            "Qaytarish raqami boshqa operatsiyada ishlatilgan",
          );
        return;
      }
      const [usedPayment] = await tx
        .select({ id: paymentOrders.id })
        .from(paymentOrders)
        .where(eq(paymentOrders.bankReference, parsed.bankReference));
      if (usedPayment)
        problem(
          409,
          "BANK_REFERENCE_USED",
          "Bank tranzaksiyasi to‘lovda ishlatilgan",
        );
      if (!["approved", "partially_refunded"].includes(order.status))
        problem(
          409,
          "ORDER_NOT_REFUNDABLE",
          "Bu buyurtmani qaytarib bo‘lmaydi",
        );
      const user = await lockUser(tx, order.userId);
      await reconcileLots(tx, user);
      const [grant] = await tx
        .select()
        .from(coinGrants)
        .where(
          and(
            eq(coinGrants.userId, user.id),
            eq(coinGrants.orderId, order.id),
            eq(coinGrants.source, "paid"),
          ),
        )
        .for("update");
      if (!grant || grant.remaining < parsed.coins || user.coins < parsed.coins)
        problem(
          409,
          "REFUND_EXCEEDS_UNUSED",
          "Faqat shu paketning sarflanmagan coinlari qaytariladi",
        );
      const refunded = order.refundedCoins + parsed.coins;
      await tx
        .update(coinGrants)
        .set({ remaining: grant.remaining - parsed.coins })
        .where(eq(coinGrants.id, grant.id));
      await tx
        .update(users)
        .set({ coins: user.coins - parsed.coins, updatedAt: new Date() })
        .where(eq(users.id, user.id));
      const [transaction] = await tx
        .insert(coinTransactions)
        .values({
          userId: user.id,
          amount: -parsed.coins,
          type: "payment_refund",
          bankReference: parsed.bankReference,
          description: parsed.reason,
          idempotencyKey: key,
          actorId,
          orderId,
          balanceBefore: user.coins,
          balanceAfter: user.coins - parsed.coins,
          metadata: {
            bankReference: parsed.bankReference,
            grantId: grant.id,
            refundUzs:
              Math.floor((order.priceUzs * refunded) / order.coins) -
              Math.floor((order.priceUzs * order.refundedCoins) / order.coins),
          },
        })
        .returning();
      const status =
        refunded === order.coins ? "refunded" : "partially_refunded";
      await tx
        .update(paymentOrders)
        .set({ refundedCoins: refunded, status, updatedAt: new Date() })
        .where(eq(paymentOrders.id, orderId));
      await audit(tx, {
        actorId,
        userId: user.id,
        action: "payment_refunded",
        referenceId: orderId,
        idempotencyKey: key,
        details: {
          coins: parsed.coins,
          bankReference: parsed.bankReference,
          reason: parsed.reason,
          transactionId: transaction.id,
        },
      });
      await outbox(tx, "payment_refund", key, {
        orderId,
        userId: user.id,
        coins: parsed.coins,
        status,
      });
    })
    .catch((error) => {
      if (commerceDatabaseError(error).code === "23505")
        problem(
          409,
          "BANK_REFERENCE_USED",
          "Bu bank tranzaksiyasi allaqachon ishlatilgan",
        );
      throw error;
    });
  return getOrderForUser(orderId, actorId, true);
}
export async function adjustCoins(
  actorId: string,
  userId: string,
  input: { amount: number; reason: string; idempotencyKey: string },
) {
  const parsed = adjustmentSchema.parse(input);
  const key = `admin-adjust:${parsed.idempotencyKey}`;
  return db.transaction(async (tx) => {
    await assertAdmin(tx, actorId);
    const user = await lockUser(tx, userId);
    const [previous] = await tx
      .select()
      .from(coinTransactions)
      .where(eq(coinTransactions.idempotencyKey, key));
    if (previous) {
      if (
        previous.userId !== userId ||
        previous.amount !== parsed.amount ||
        previous.description !== parsed.reason
      )
        problem(
          409,
          "IDEMPOTENCY_CONFLICT",
          "Operatsiya kaliti boshqa so‘rovda ishlatilgan",
        );
      return { balance: user.coins, alreadyApplied: true };
    }
    await reconcileLots(tx, user);
    if (user.coins + parsed.amount < 0)
      problem(409, "INSUFFICIENT_COINS", "Balans manfiy bo‘lishi mumkin emas");
    let balance: number;
    let transactionId: number;
    if (parsed.amount > 0) {
      const result = await applyCredit(
        tx,
        user,
        parsed.amount,
        "admin_adjustment",
        key,
        parsed.reason,
        "adjustment",
        actorId,
      );
      balance = result.balance;
      transactionId = result.transaction.id;
    } else {
      const allocations = await consumeLots(tx, userId, -parsed.amount);
      balance = user.coins + parsed.amount;
      const [transaction] = await tx
        .insert(coinTransactions)
        .values({
          userId,
          amount: parsed.amount,
          type: "admin_adjustment",
          description: parsed.reason,
          idempotencyKey: key,
          actorId,
          balanceBefore: user.coins,
          balanceAfter: balance,
          metadata: { allocations },
        })
        .returning();
      transactionId = transaction.id;
      await tx
        .update(users)
        .set({ coins: balance, updatedAt: new Date() })
        .where(eq(users.id, userId));
    }
    await audit(tx, {
      actorId,
      userId,
      action: "coin_adjustment",
      referenceId: String(transactionId),
      idempotencyKey: key,
      details: { amount: parsed.amount, reason: parsed.reason, balance },
    });
    return { balance, alreadyApplied: false };
  });
}
export async function adjustLessonAccess(
  actorId: string,
  userId: string,
  input: {
    lessonId: number;
    grant: boolean;
    reason: string;
    idempotencyKey: string;
  },
) {
  const parsed = z
    .object({
      lessonId: z.number().int().positive(),
      grant: z.boolean(),
      reason: reasonSchema,
      idempotencyKey: z.string().trim().min(12).max(120),
    })
    .strict()
    .parse(input);
  const key = `admin-access:${parsed.idempotencyKey}`;
  return db.transaction(async (tx) => {
    await assertAdmin(tx, actorId);
    await lockUser(tx, userId);
    const [prior] = await tx
      .select()
      .from(commerceAudit)
      .where(eq(commerceAudit.idempotencyKey, key));
    if (prior) {
      if (
        prior.userId !== userId ||
        prior.referenceId !== String(parsed.lessonId) ||
        prior.details.grant !== parsed.grant
      )
        problem(409, "IDEMPOTENCY_CONFLICT", "Operatsiya kaliti ishlatilgan");
      return {
        lessonId: parsed.lessonId,
        granted: parsed.grant,
        alreadyApplied: true,
      };
    }
    const [lesson] = await tx
      .select({ id: lessons.id })
      .from(lessons)
      .where(eq(lessons.id, parsed.lessonId));
    if (!lesson) problem(404, "LESSON_NOT_FOUND", "Dars topilmadi");
    const [owned] = await tx
      .select()
      .from(lessonAccess)
      .where(
        and(
          eq(lessonAccess.userId, userId),
          eq(lessonAccess.lessonId, parsed.lessonId),
        ),
      )
      .for("update");
    if (owned)
      await tx
        .update(lessonAccess)
        .set({
          revokedAt: parsed.grant ? null : new Date(),
          revocationType:parsed.grant?null:"admin",
          ...(parsed.grant?{expiresAt:null,source:"admin",purchaseTransactionId:null}:{}),
          grantedBy: actorId,
        })
        .where(eq(lessonAccess.id, owned.id));
    else if (parsed.grant)
      await tx.insert(lessonAccess).values({
        userId,
        lessonId: parsed.lessonId,
        source: "admin",
        grantedBy: actorId,
      });
    if(!parsed.grant)await tx.execute(sql`UPDATE platform_orders SET status='revoked',updated_at=now() WHERE user_id=${userId} AND product_id=${'tube-'+parsed.lessonId} AND status='active'`);
    await audit(tx, {
      actorId,
      userId,
      action: parsed.grant ? "access_granted" : "access_revoked",
      referenceId: String(parsed.lessonId),
      idempotencyKey: key,
      details: { grant: parsed.grant, reason: parsed.reason },
    });
    return {
      lessonId: parsed.lessonId,
      granted: parsed.grant,
      alreadyApplied: false,
    };
  });
}

function handle(fn: (req: Request, res: Response) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (error) {
      if (error instanceof CommerceError)
        return res
          .status(error.status)
          .json({ message: error.message, code: error.code });
      if (error instanceof z.ZodError)
        return res.status(400).json({
          message: error.issues[0]?.message || "So‘rov noto‘g‘ri",
          code: "INVALID_INPUT",
        });
      if (commerceDatabaseError(error).code === "23505") {
        const bankReference = /bank_reference/.test(
          commerceDatabaseError(error).constraint || "",
        );
        return res.status(409).json({
          message: bankReference
            ? "Bu bank tranzaksiyasi allaqachon ishlatilgan"
            : "Operatsiya kaliti takrorlangan",
          code: bankReference ? "BANK_REFERENCE_USED" : "DUPLICATE_OPERATION",
        });
      }
      console.error("Commerce request failed", {
        name: error instanceof Error ? error.name : "UnknownError",
        code: commerceDatabaseError(error).code || "UNKNOWN",
      });
      return res.status(500).json({
        message: "Operatsiya bajarilmadi. Qayta urinib ko‘ring.",
        code: "COMMERCE_ERROR",
      });
    }
  };
}
const userId = (req: Request) => req.session.userId!;
const param = (req: Request, key: string) => String(req.params[key]);
export function registerCommerceRoutes(app: Express) {
  app.get(
    "/api/commerce/config",
    handle(async (_req, res) => {
      const settings = await getCommerceSettings();
      const packages = await db
        .select()
        .from(coinPackages)
        .where(
          and(eq(coinPackages.isActive, true), sql`${coinPackages.priceUzs}>0`),
        )
        .orderBy(asc(coinPackages.coins));
      res.json({
        welcomeCoins: settings.welcomeCoins,
        lessonCost: settings.lessonCost,
        demoLessonId: settings.demoLessonId,
        paymentsEnabled: settings.paymentsEnabled,
        packages: packages.map(({ id, name, coins, priceUzs, isActive }) => ({
          id,
          name,
          coins,
          priceUzs,
          isActive,
        })),
        telegramAvailable: Boolean(
          /^\d{5,20}:[A-Za-z0-9_-]{20,200}$/.test(
            process.env.TELEGRAM_BOT_TOKEN || "",
          ) &&
            /^[A-Za-z0-9_-]{32,256}$/.test(
              process.env.TELEGRAM_WEBHOOK_SECRET || "",
            ) &&
            /^https:\/\//.test(process.env.APP_URL || ""),
        ),
      });
    }),
  );
  app.get(
    "/api/commerce/wallet",
    requireAuth,
    handle(async (req, res) => res.json(await getWallet(userId(req)))),
  );
  app.post(
    "/api/commerce/lessons/:id/purchase",
    requireAuth,
    rateLimit("lesson-purchase", 30, 60),
    handle(async (req, res) =>
      res.json(
        await purchaseLesson(userId(req), numericId.parse(param(req, "id"))),
      ),
    ),
  );
  app.get(
    "/api/commerce/orders",
    requireAuth,
    handle(async (req, res) => {
      const rows = await db
        .select()
        .from(paymentOrders)
        .where(eq(paymentOrders.userId, userId(req)))
        .orderBy(desc(paymentOrders.createdAt))
        .limit(100);
      res.json({ orders: await Promise.all(rows.map((row) => orderDTO(row))) });
    }),
  );
  app.post(
    "/api/commerce/orders",
    requireAuth,
    rateLimit("payment-order", 10, 300),
    handle(async (req, res) => {
      const parsed = z
        .object({ packageId: z.number().int().positive() })
        .strict()
        .parse(req.body);
      res
        .status(201)
        .json(await createPaymentOrder(userId(req), parsed.packageId));
    }),
  );
  app.get(
    "/api/commerce/orders/:id",
    requireAuth,
    handle(async (req, res) =>
      res.json(await getOrderForUser(param(req, "id"), userId(req))),
    ),
  );
  app.post(
    "/api/commerce/orders/:id/cancel",
    requireAuth,
    handle(async (req, res) => {
      const orderId = idSchema.parse(param(req, "id"));
      await db.transaction(async (tx) => {
        const [order] = await tx
          .select()
          .from(paymentOrders)
          .where(
            and(
              eq(paymentOrders.id, orderId),
              eq(paymentOrders.userId, userId(req)),
            ),
          )
          .for("update");
        if (!order) problem(404, "ORDER_NOT_FOUND", "Buyurtma topilmadi");
        if (order.status === "cancelled") return;
        if (order.status !== "awaiting_payment")
          problem(
            409,
            "ORDER_NOT_CANCELLABLE",
            "Yuborilgan to‘lovni admin tekshirishi kerak",
          );
        await tx
          .update(paymentOrders)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(eq(paymentOrders.id, orderId));
        await audit(tx, {
          userId: userId(req),
          action: "order_cancelled",
          referenceId: orderId,
        });
      });
      res.json(await getOrderForUser(orderId, userId(req)));
    }),
  );
  app.get(
    "/api/admin/commerce/packages",
    requireAdmin,
    handle(async (_req, res) =>
      res.json({
        packages: await db
          .select()
          .from(coinPackages)
          .orderBy(asc(coinPackages.id)),
      }),
    ),
  );
  app.post(
    "/api/admin/commerce/packages",
    requireAdmin,
    handle(async (req, res) => {
      const values = packageSchema.parse(req.body);
      if (values.isActive && values.priceUzs <= 0)
        problem(
          400,
          "PRICE_REQUIRED",
          "Faol tarif narxi noldan katta bo‘lishi kerak",
        );
      const result = await db.transaction(async (tx) => {
        const [pack] = await tx.insert(coinPackages).values(values).returning();
        await audit(tx, {
          actorId: userId(req),
          action: "package_created",
          referenceId: String(pack.id),
          details: values,
        });
        return pack;
      });
      res.status(201).json(result);
    }),
  );
  app.patch(
    "/api/admin/commerce/packages/:id",
    requireAdmin,
    handle(async (req, res) => {
      const id = numericId.parse(param(req, "id"));
      const patch = packageSchema.partial().parse(req.body);
      const result = await db.transaction(async (tx) => {
        const [old] = await tx
          .select()
          .from(coinPackages)
          .where(eq(coinPackages.id, id))
          .for("update");
        if (!old) problem(404, "PACKAGE_NOT_FOUND", "Tarif topilmadi");
        const updated = { ...old, ...patch };
        if (updated.isActive && updated.priceUzs <= 0)
          problem(
            400,
            "PRICE_REQUIRED",
            "Faol tarif narxi noldan katta bo‘lishi kerak",
          );
        const [pack] = await tx
          .update(coinPackages)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(coinPackages.id, id))
          .returning();
        await audit(tx, {
          actorId: userId(req),
          action: "package_updated",
          referenceId: String(id),
          details: {
            before: {
              name: old.name,
              coins: old.coins,
              priceUzs: old.priceUzs,
              isActive: old.isActive,
            },
            after: patch,
          },
        });
        return pack;
      });
      res.json(result);
    }),
  );
  app.get(
    "/api/admin/commerce/settings",
    requireAdmin,
    handle(async (_req, res) => res.json(await getCommerceSettings())),
  );
  app.put(
    "/api/admin/commerce/settings",
    requireAdmin,
    handle(async (req, res) => {
      const values = settingsSchema.parse(req.body);
      if (values.cardNumber && !/^\d{16}$/.test(values.cardNumber))
        problem(
          400,
          "CARD_INVALID",
          "Karta raqami 16 ta raqamdan iborat bo‘lsin",
        );
      if (values.paymeUrl) {
        let url: URL;
        try {
          url = new URL(values.paymeUrl);
        } catch {
          return problem(400, "PAYME_URL_INVALID", "Payme havolasi noto‘g‘ri");
        }
        if (
          url.protocol !== "https:" ||
          url.username ||
          url.password ||
          (url.port && url.port !== "443") ||
          !/(^|\.)(payme\.uz|paycom\.uz)$/.test(url.hostname)
        )
          problem(
            400,
            "PAYME_URL_INVALID",
            "Rasmiy HTTPS Payme havolasini kiriting",
          );
      }
      if (values.demoLessonId) {
        const [lesson] = await db
          .select()
          .from(lessons)
          .where(eq(lessons.id, values.demoLessonId));
        if (!lesson || lesson.status === "archived" || !publishedLesson(lesson))
          problem(
            400,
            "DEMO_UNAVAILABLE",
            "Namuna dars nashr qilingan bo‘lishi kerak",
          );
      }
      if (values.paymentsEnabled) {
        if (
          !values.recipientName ||
          (!values.cardNumber && !values.paymeUrl) ||
          !values.reviewHours
        )
          problem(
            400,
            "PAYMENT_CONFIG_INCOMPLETE",
            "Qabul qiluvchi, to‘lov rekvizitlari va tekshirish vaqtini to‘ldiring",
          );
        const [pack] = await db
          .select()
          .from(coinPackages)
          .where(
            and(
              eq(coinPackages.isActive, true),
              sql`${coinPackages.priceUzs}>0`,
            ),
          );
        if (!pack)
          problem(
            400,
            "ACTIVE_PACKAGE_REQUIRED",
            "Kamida bitta narxi belgilangan tarifni faollashtiring",
          );
      }
      await db.transaction(async (tx) => {
        const [old] = await tx
          .select()
          .from(systemSettings)
          .where(eq(systemSettings.key, "commerce"))
          .for("update");
        await tx
          .insert(systemSettings)
          .values({ key: "commerce", value: JSON.stringify(values) })
          .onConflictDoUpdate({
            target: systemSettings.key,
            set: { value: JSON.stringify(values) },
          });
        await audit(tx, {
          actorId: userId(req),
          action: "settings_updated",
          referenceId: "commerce",
          details: {
            before: old?.value
              ? JSON.parse(old.value)
              : DEFAULT_COMMERCE_SETTINGS,
            after: values,
          },
        });
      });
      res.json(values);
    }),
  );
  app.get(
    "/api/admin/commerce/orders",
    requireAdmin,
    handle(async (_req, res) => {
      const rows = await db
        .select()
        .from(paymentOrders)
        .orderBy(desc(paymentOrders.createdAt))
        .limit(200);
      res.json({
        orders: await Promise.all(rows.map((row) => orderDTO(row, true))),
      });
    }),
  );
  app.get(
    "/api/admin/commerce/orders/:id",
    requireAdmin,
    handle(async (req, res) =>
      res.json(await getOrderForUser(param(req, "id"), userId(req), true)),
    ),
  );
  app.post(
    "/api/admin/commerce/orders/:id/review",
    requireAdmin,
    handle(async (req, res) =>
      res.json(
        await reviewPaymentOrder(param(req, "id"), userId(req), req.body),
      ),
    ),
  );
  app.post(
    "/api/admin/commerce/orders/:id/refund",
    requireAdmin,
    handle(async (req, res) =>
      res.json(
        await refundPaymentOrder(param(req, "id"), userId(req), req.body),
      ),
    ),
  );
  app.post(
    "/api/admin/commerce/users/:id/adjust",
    requireAdmin,
    handle(async (req, res) =>
      res.json(await adjustCoins(userId(req), param(req, "id"), req.body)),
    ),
  );
  app.post(
    "/api/admin/commerce/users/:id/access",
    requireAdmin,
    handle(async (req, res) =>
      res.json(
        await adjustLessonAccess(userId(req), param(req, "id"), req.body),
      ),
    ),
  );
  app.get(
    "/api/admin/commerce/users/:id/wallet",
    requireAdmin,
    handle(async (req, res) => {
      const id = param(req, "id");
      const wallet = await getWallet(id);
      const access = await db
        .select({
          id: lessonAccess.id,
          lessonId: lessonAccess.lessonId,
          source: lessonAccess.source,
          priceCoins: lessonAccess.priceCoins,
          revokedAt: lessonAccess.revokedAt,
          createdAt: lessonAccess.createdAt,
          title: lessons.title,
        })
        .from(lessonAccess)
        .innerJoin(lessons, eq(lessons.id, lessonAccess.lessonId))
        .where(eq(lessonAccess.userId, id))
        .orderBy(desc(lessonAccess.id));
      res.json({ ...wallet, access });
    }),
  );
  // The old admin UI is kept compatible, with the same audited wallet implementation.
  app.post(
    "/api/admin/users/:id/coins",
    requireAdmin,
    handle(async (req, res) => {
      const amount =
        Number(req.body.amount) * (req.body.type === "remove" ? -1 : 1);
      const reason = req.body.description || req.body.reason;
      const key = req.body.idempotencyKey || req.get("Idempotency-Key");
      if (!key)
        problem(
          400,
          "IDEMPOTENCY_KEY_REQUIRED",
          "Operatsiya kaliti talab qilinadi",
        );
      res.json(
        await adjustCoins(userId(req), param(req, "id"), {
          amount,
          reason,
          idempotencyKey: key,
        }),
      );
    }),
  );
  app.get(
    "/api/admin/commerce/audit",
    requireAdmin,
    handle(async (_req, res) =>
      res.json({
        events: await db
          .select()
          .from(commerceAudit)
          .orderBy(desc(commerceAudit.id))
          .limit(300),
      }),
    ),
  );
  app.get(
    "/api/admin/commerce/export",
    requireAdmin,
    handle(async (req, res) => {
      const type = z
        .enum(["orders", "ledger", "audit"])
        .parse(req.query.type || "orders");
      let rows: Record<string, unknown>[];
      if (type === "orders")
        rows = await db
          .select({
            id: paymentOrders.id,
            userId: paymentOrders.userId,
            packageName: paymentOrders.packageName,
            coins: paymentOrders.coins,
            priceUzs: paymentOrders.priceUzs,
            status: paymentOrders.status,
            bankReference: paymentOrders.bankReference,
            refundedCoins: paymentOrders.refundedCoins,
            createdAt: paymentOrders.createdAt,
            reviewedAt: paymentOrders.reviewedAt,
            reviewedBy: paymentOrders.reviewedBy,
            reason: paymentOrders.reason,
          })
          .from(paymentOrders)
          .orderBy(desc(paymentOrders.createdAt));
      else if (type === "ledger")
        rows = await db
          .select()
          .from(coinTransactions)
          .orderBy(desc(coinTransactions.id));
      else
        rows = await db
          .select()
          .from(commerceAudit)
          .orderBy(desc(commerceAudit.id));
      const columns = rows.length ? Object.keys(rows[0]) : ["id"];
      const field = (value: unknown) => {
        if (value === null || value === undefined) return "";
        let text =
          value instanceof Date
            ? value.toISOString()
            : typeof value === "object"
              ? JSON.stringify(value)
              : String(value);
        if (typeof value === "string" && /^[\s]*[=+@-]/.test(text))
          text = "'" + text;
        return '"' + text.replace(/"/g, '""') + '"';
      };
      const csv =
        "\uFEFF" +
        [
          columns.map(field).join(","),
          ...rows.map((row) =>
            columns.map((column) => field(row[column])).join(","),
          ),
        ].join("\r\n");
      await db.transaction((tx) =>
        audit(tx, {
          actorId: userId(req),
          action: "report_exported",
          referenceId: type,
          details: { count: rows.length },
        }),
      );
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="tube-mentor-${type}-${new Date().toISOString().slice(0, 10)}.csv"`,
      );
      res.send(csv);
    }),
  );
  app.get(
    "/api/admin/commerce/overview",
    requireAdmin,
    handle(async (_req, res) => {
      const orders = await db.select().from(paymentOrders);
      const [balance] = await db
        .select({
          total: sql<number>`coalesce(sum(${users.coins}),0)::float8`,
        })
        .from(users);
      const [spent] = await db
        .select({
          total: sql<number>`coalesce(-sum(${coinTransactions.amount}),0)::float8`,
        })
        .from(coinTransactions)
        .where(eq(coinTransactions.type, "lesson_purchase"));
      const packs = await db
        .select()
        .from(coinPackages)
        .where(eq(coinPackages.isActive, true));
      const [failed] = await db
        .select({ count: sql<number>`count(*)::integer` })
        .from(notificationOutbox)
        .where(
          sql`${notificationOutbox.attempts}>=3 AND ${notificationOutbox.state}<>'sent'`,
        );
      const approved = orders.filter((o) =>
        ["approved", "partially_refunded", "refunded"].includes(o.status),
      );
      res.json({
        pendingOrders: orders.filter((o) =>
          ["receipt_submitted", "under_review", "needs_info"].includes(
            o.status,
          ),
        ).length,
        approvedOrders: approved.length,
        revenueUzs: approved.reduce(
          (n, o) =>
            n +
            o.priceUzs -
            Math.floor((o.priceUzs * o.refundedCoins) / o.coins),
          0,
        ),
        coinsIssued: approved.reduce(
          (n, o) => n + o.coins - o.refundedCoins,
          0,
        ),
        coinsSpent: spent?.total || 0,
        totalBalance: balance?.total || 0,
        activePackages: packs.length,
        notificationFailures: failed?.count || 0,
      });
    }),
  );
}
