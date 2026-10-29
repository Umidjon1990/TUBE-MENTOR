import type { Express } from "express";
import multer from "multer";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { pool } from "./db";
import { requireAuth } from "./auth";
import { rateLimit } from "./security";
import { CommerceError, reviewPaymentOrder } from "./commerce";

const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_RECEIPT_BYTES, files: 1, fields: 0, parts: 1 },
});
type Row = Record<string, any>;
type TelegramUpdate = {
  update_id: number;
  message?: { message_id: number; text?: string; from?: { id: number; is_bot?: boolean }; chat: { id: number; type: string } };
  callback_query?: { id: string; data?: string; from: { id: number; is_bot?: boolean }; message?: { chat: { id: number; type: string } } };
};

/** Browser-declared MIME alone does not establish that an upload is an image. */
export function validateReceiptImage(buffer: Buffer, declaredMime: string) {
  if (!buffer.length || buffer.length > MAX_RECEIPT_BYTES)
    throw new CommerceError(413, "receipt_size", "Chek hajmi 5 MB dan oshmasligi kerak");
  let mime: string | undefined;
  let extension: string | undefined;
  if (buffer.length >= 12 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    mime = "image/png";
    extension = "png";
  } else if (buffer.length >= 4 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) {
    mime = "image/jpeg";
    extension = "jpg";
  } else if (buffer.length >= 16 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    mime = "image/webp";
    extension = "webp";
  }
  if (!mime || mime !== declaredMime)
    throw new CommerceError(400, "receipt_format", "Chek uchun JPG, PNG yoki WEBP rasm yuboring");
  return { mime, extension: extension! };
}

function receiptDirectory() {
  const directory = path.resolve(process.env.PRIVATE_RECEIPTS_DIR || "private-payments/receipts");
  // Receipt data must never be exposed by the application's static upload routes.
  for (const publicRoot of [path.resolve("uploads"), path.resolve("dist/public"), path.resolve("client/public"), path.resolve("server/public")]) {
    if (directory === publicRoot || directory.startsWith(publicRoot + path.sep))
      throw new CommerceError(503, "receipt_storage", "Chek saqlash joyi noto‘g‘ri sozlangan");
  }
  return directory;
}

function receiptPath(storageKey: string) {
  if (!/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(storageKey))
    throw new CommerceError(404, "receipt_missing", "Chek topilmadi");
  return path.join(receiptDirectory(), storageKey);
}

async function readPrivateReceipt(storageKey: string) {
  const file = await open(receiptPath(storageKey), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > MAX_RECEIPT_BYTES)
      throw new CommerceError(404, "receipt_missing", "Chek topilmadi");
    return await file.readFile();
  } finally {
    await file.close();
  }
}

function config() {
  const token = process.env.TELEGRAM_BOT_TOKEN || "";
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || "";
  let appUrl = "";
  try {
    const url = new URL(process.env.APP_URL || "");
    if (url.protocol === "https:" && !url.username && !url.password) appUrl = url.origin;
  } catch { /* An unconfigured bot must not prevent website payments. */ }
  const adminIds = new Set((process.env.TELEGRAM_ADMIN_IDS || "").split(",").map((id) => id.trim()).filter((id) => /^\d{1,16}$/.test(id)));
  const available = /^\d{5,20}:[A-Za-z0-9_-]{20,200}$/.test(token) && /^[A-Za-z0-9_-]{32,256}$/.test(secret) && Boolean(appUrl);
  return { token, secret, appUrl, adminIds, available };
}

let botIdentity: { tokenHash: string; username: string; expires: number } | undefined;
async function botCall<T = unknown>(method: string, body: Record<string, unknown> | FormData = {}): Promise<T> {
  const current = config();
  if (!current.available) throw new Error("Bot configuration is incomplete");
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${current.token}/${method}`, {
      method: "POST",
      headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
      body: body instanceof FormData ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    // Never retain remote errors containing the token-bearing request URL.
    throw new Error("Telegram connection failed");
  }
  const data = await response.json().catch(() => null) as { ok?: boolean; result?: T; error_code?: number } | null;
  if (!response.ok || !data?.ok) throw new Error(`Telegram request failed (${data?.error_code || response.status})`);
  return data.result as T;
}

async function getBotUsername() {
  const tokenHash = createHash("sha256").update(config().token).digest("hex");
  if (botIdentity?.tokenHash === tokenHash && botIdentity.expires > Date.now()) return botIdentity.username;
  const identity = await botCall<{ username?: string }>("getMe");
  if (!identity.username || !/^[A-Za-z0-9_]{5,32}$/.test(identity.username)) throw new Error("Bot username unavailable");
  botIdentity = { tokenHash, username: identity.username, expires: Date.now() + 15 * 60000 };
  return identity.username;
}

async function activeAdminLinks() {
  const allowlist = [...config().adminIds];
  if (!allowlist.length) return [];
  const result = await pool.query(
    `SELECT l.* FROM telegram_bot_links l JOIN users u ON u.id=l.user_id
     WHERE u.role='admin' AND u.is_active=true
       AND (u.email_verified=true OR u.google_id IS NOT NULL OR u.telegram_id IS NOT NULL)
       AND l.telegram_user_id=ANY($1::text[])`, [allowlist],
  );
  return result.rows;
}

async function enqueue(kind: string, referenceId: string, payload: Record<string, unknown>) {
  await pool.query(
    "INSERT INTO notification_outbox(kind,reference_id,payload) VALUES($1,$2,$3) ON CONFLICT(kind,reference_id) DO NOTHING",
    [kind, referenceId, JSON.stringify(payload)],
  );
}

export function registerPaymentBotRoutes(app: Express) {
  app.post("/api/commerce/orders/:id/receipt", requireAuth, rateLimit("receipt-upload", 12, 900), upload.single("file"), async (req, res) => {
    const orderId = String(req.params.id);
    if (!UUID.test(orderId)) throw new CommerceError(404, "order_missing", "Buyurtma topilmadi");
    if (!req.file) throw new CommerceError(400, "receipt_missing", "Chek rasmini tanlang");
    const image = validateReceiptImage(req.file.buffer, req.file.mimetype);
    const sha256 = createHash("sha256").update(req.file.buffer).digest("hex");
    const storageKey = `${randomUUID()}.${image.extension}`;
    const destination = receiptPath(storageKey);
    const temporary = destination + ".tmp";
    await mkdir(receiptDirectory(), { recursive: true, mode: 0o700 });
    try {
      const file = await open(temporary, "wx", 0o600);
      try { await file.writeFile(req.file.buffer); await file.sync(); } finally { await file.close(); }
      await rename(temporary, destination);
    } catch (error) { await unlink(temporary).catch(() => {}); throw error; }
    let client;
    try { client = await pool.connect(); }
    catch (error) { await unlink(destination).catch(() => {}); throw error; }
    let committed = false;
    try {
      await client.query("BEGIN");
      const locked = await client.query("SELECT * FROM payment_orders WHERE id=$1 FOR UPDATE", [orderId]);
      const order = locked.rows[0];
      if (!order || order.user_id !== req.session.userId) throw new CommerceError(404, "order_missing", "Buyurtma topilmadi");
      if(order.instructions?.provider==='payme')throw new CommerceError(409,'PAYME_MANAGED','Payme to‘lovi avtomatik tasdiqlanadi; chek yuklash shart emas');
      if (!["awaiting_payment", "needs_info", "rejected", "expired", "cancelled"].includes(order.status))
        throw new CommerceError(409, "receipt_state", "Ushbu buyurtmaga hozir yangi chek yuborib bo‘lmaydi");
      // Late bank transfers still need a receipt, but must retain the explicit late-review state.
      const nextStatus = ["expired", "cancelled"].includes(order.status) || new Date(order.expires_at).getTime() <= Date.now() ? "expired" : "receipt_submitted";
      const count = await client.query("SELECT count(*)::int AS n FROM payment_receipts WHERE order_id=$1", [orderId]);
      if (count.rows[0].n >= 10) throw new CommerceError(409, "receipt_limit", "Cheklar soni chegarasiga yetdi. Admin bilan bog‘laning");
      const duplicate = await client.query("SELECT id FROM payment_receipts WHERE sha256=$1 AND order_id<>$2 LIMIT 1", [sha256, orderId]);
      const originalName = path.basename(req.file.originalname).replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 120) || `chek.${image.extension}`;
      const created = await client.query(
        `INSERT INTO payment_receipts(order_id,storage_key,mime_type,original_name,size_bytes,sha256)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING id,order_id,mime_type,original_name,size_bytes,created_at`,
        [orderId, storageKey, image.mime, originalName, req.file.size, sha256],
      );
      const receipt = created.rows[0];
      await client.query("UPDATE payment_orders SET status=$2,reason=$3,updated_at=now() WHERE id=$1", [orderId, nextStatus, nextStatus === "expired" ? "Kechikkan to‘lov cheki yuborildi; admin alohida tekshiradi" : null]);
      await client.query(
        "INSERT INTO commerce_audit(actor_id,user_id,action,reference_id,details) VALUES($1,$1,'receipt_submitted',$2,$3)",
        [req.session.userId, orderId, JSON.stringify({ receiptId: receipt.id, duplicateWarning: Boolean(duplicate.rowCount), previousStatus: order.status, latePayment: nextStatus === "expired" })],
      );
      await client.query(
        "INSERT INTO notification_outbox(kind,reference_id,payload) VALUES('payment_receipt',$1,$2) ON CONFLICT(kind,reference_id) DO NOTHING",
        [String(receipt.id), JSON.stringify({ orderId, receiptId: receipt.id, userId: req.session.userId, duplicateWarning: Boolean(duplicate.rowCount), latePayment: nextStatus === "expired" })],
      );
      await client.query("COMMIT");
      committed = true;
      res.status(201).json({ receipt: { id: receipt.id, orderId: receipt.order_id, mimeType: receipt.mime_type, originalName: receipt.original_name, sizeBytes: receipt.size_bytes, createdAt: receipt.created_at, url: `/api/commerce/receipts/${receipt.id}` }, duplicateWarning: Boolean(duplicate.rowCount), status: nextStatus });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
      if (!committed) await unlink(destination).catch(() => {});
    }
  });

  app.get("/api/commerce/receipts/:id", requireAuth, async (req, res) => {
    if (!/^\d{1,10}$/.test(String(req.params.id))) throw new CommerceError(404, "receipt_missing", "Chek topilmadi");
    const result = await pool.query(
      "SELECT r.*,o.user_id FROM payment_receipts r JOIN payment_orders o ON o.id=r.order_id WHERE r.id=$1", [Number(req.params.id)],
    );
    const receipt = result.rows[0];
    if (!receipt || (receipt.user_id !== req.session.userId && req.session.userRole !== "admin"))
      throw new CommerceError(404, "receipt_missing", "Chek topilmadi");
    let content: Buffer;
    try { content = await readPrivateReceipt(receipt.storage_key); }
    catch { throw new CommerceError(404, "receipt_missing", "Chek fayli topilmadi. Admin bilan bog‘laning"); }
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", receipt.mime_type);
    res.setHeader("Content-Disposition", `inline; filename="receipt-${receipt.id}.${receipt.mime_type === "image/png" ? "png" : receipt.mime_type === "image/webp" ? "webp" : "jpg"}"`);
    res.end(content);
  });

  app.get("/api/commerce/telegram/status", requireAuth, async (req, res) => {
    const current = config();
    const linked = await pool.query("SELECT id FROM telegram_bot_links WHERE user_id=$1", [req.session.userId]);
    let botUsername: string | null = null;
    if (current.available) botUsername = await getBotUsername().catch(() => null);
    res.json({ available: Boolean(botUsername), linked: Boolean(linked.rowCount), botUsername, adminConfigured: Boolean((await activeAdminLinks()).length) });
  });

  app.post("/api/commerce/telegram/link", requireAuth, rateLimit("bot-link", 6, 600), async (req, res) => {
    if (!config().available) throw new CommerceError(503, "bot_unavailable", "Telegram bot hali sozlanmagan. Saytda davom etishingiz mumkin");
    const username = await getBotUsername().catch(() => { throw new CommerceError(503, "bot_unavailable", "Telegram botga ulanishda xatolik. Qayta urinib ko‘ring"); });
    const token = randomBytes(24).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 10 * 60000);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [req.session.userId]);
      await client.query("UPDATE telegram_link_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL", [req.session.userId]);
      await client.query("INSERT INTO telegram_link_tokens(token_hash,user_id,expires_at) VALUES($1,$2,$3)", [tokenHash, req.session.userId, expiresAt]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
    res.json({ url: `https://t.me/${username}?start=${token}`, expiresAt });
  });

  app.delete("/api/commerce/telegram/link", requireAuth, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM telegram_bot_links WHERE user_id=$1", [req.session.userId]);
      await client.query("UPDATE telegram_link_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL", [req.session.userId]);
      await client.query("INSERT INTO commerce_audit(actor_id,user_id,action,reference_id) VALUES($1,$1,'telegram_bot_unlinked',$1)", [req.session.userId]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
    res.json({ linked: false });
  });

  app.post("/api/commerce/telegram/webhook", async (req, res) => {
    const current = config();
    const header = req.get("X-Telegram-Bot-Api-Secret-Token") || "";
    const a = Buffer.from(current.secret), b = Buffer.from(header);
    if (!current.available || a.length !== b.length || !timingSafeEqual(a, b)) return res.status(403).json({ message: "Ruxsat berilmagan" });
    if (Number(req.get("content-length") || 0) > 32768 || JSON.stringify(req.body ?? {}).length > 32768)
      return res.status(413).json({ message: "So‘rov hajmi juda katta" });
    const update = req.body as TelegramUpdate;
    if (!Number.isSafeInteger(update?.update_id) || update.update_id < 0)
      return res.status(400).json({ message: "Update formati noto‘g‘ri" });
    await enqueue("telegram_update", String(update.update_id), { update });
    res.json({ ok: true });
  });
}

async function reply(updateId: number, label: string, chatId: number | string, text: string) {
  await enqueue("telegram_reply", `${updateId}:${label}`, { method: "sendMessage", body: { chat_id: String(chatId), text: text.slice(0, 4000) } });
}

async function linkBot(update: TelegramUpdate, token: string, telegramId: string, chatId: string) {
  const client = await pool.connect();
  let message = "Ulash havolasi eskirgan yoki ishlatilgan. Saytdan yangi havola oling.";
  try {
    await client.query("BEGIN");
    const tokens = await client.query("SELECT * FROM telegram_link_tokens WHERE token_hash=$1 FOR UPDATE", [createHash("sha256").update(token).digest("hex")]);
    const linkToken = tokens.rows[0];
    if (linkToken) {
      const people = await client.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [linkToken.user_id]);
      const user = people.rows[0];
      const links = await client.query("SELECT * FROM telegram_bot_links WHERE user_id=$1 OR telegram_user_id=$2", [linkToken.user_id, telegramId]);
      const exact = links.rows.find((link) => link.user_id === linkToken.user_id && link.telegram_user_id === telegramId);
      const verified = user?.email_verified || user?.google_id || user?.telegram_id;
      if (user?.is_active && verified && (user.role !== "admin" || config().adminIds.has(telegramId))) {
        if (exact && linkToken.used_at) message = "Telegram bot hisobingizga ulangan. To‘lov holatlari haqida shu yerda xabar olasiz.";
        else if (!linkToken.used_at && new Date(linkToken.expires_at).getTime() > Date.now()) {
          if (links.rows.some((link) => link.user_id !== linkToken.user_id || link.telegram_user_id !== telegramId))
            message = "Bu Telegram yoki sayt hisobi boshqa profilga ulangan. Admin bilan bog‘laning.";
          else {
            await client.query("INSERT INTO telegram_bot_links(user_id,telegram_user_id,chat_id) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET chat_id=excluded.chat_id", [user.id, telegramId, chatId]);
            await client.query("UPDATE telegram_link_tokens SET used_at=now() WHERE id=$1", [linkToken.id]);
            await client.query("INSERT INTO commerce_audit(actor_id,user_id,action,reference_id,details) VALUES($1,$1,'telegram_bot_linked',$2,$3)", [user.id, telegramId, JSON.stringify({ role: user.role })]);
            message = user.role === "admin"
              ? "Admin bot ulandi. Chek kelganda bank tushumini tekshiring. /approve BUYURTMA_ID BANK_TRANZAKSIYA_ID; /reject BUYURTMA_ID sabab; /info BUYURTMA_ID sabab. Saytdagi admin kabineti ham ishlaydi."
              : "Telegram bot hisobingizga ulandi. To‘lov holatlari haqida shu yerda xabar olasiz. Dars va coin xaridi saytning o‘zida bajariladi.";
          }
        }
      } else if (user?.role === "admin") message = "Admin Telegram IDsi ruxsat ro‘yxatida emas yoki hisob faol emas. TELEGRAM_ADMIN_IDS sozlamasini tekshiring.";
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505") message = "Bu Telegram hisobi boshqa profilga ulangan. Admin bilan bog‘laning.";
    else throw error;
  } finally { client.release(); }
  await reply(update.update_id, "link", chatId, message);
}

async function adminActor(telegramId: string, chatId: string) {
  if (!config().adminIds.has(telegramId)) return undefined;
  const result = await pool.query(
    "SELECT u.* FROM telegram_bot_links l JOIN users u ON u.id=l.user_id WHERE l.telegram_user_id=$1 AND l.chat_id=$2 AND u.role='admin' AND u.is_active=true", [telegramId, chatId],
  );
  const user = result.rows[0];
  return user && (user.email_verified || user.google_id || user.telegram_id) ? user : undefined;
}

async function processTelegramUpdate(update: TelegramUpdate) {
  const event = update.callback_query || update.message;
  const chat = update.callback_query?.message?.chat || update.message?.chat;
  const from = event?.from;
  if (!chat || chat.type !== "private" || !from || from.is_bot || !Number.isSafeInteger(from.id) || from.id <= 0 || !Number.isSafeInteger(chat.id) || String(chat.id) !== String(from.id)) return;
  const telegramId = String(from.id), chatId = String(chat.id);
  const text = (update.message?.text || "").trim();
  const start = /^\/start(?:@[A-Za-z0-9_]+)?\s+([A-Za-z0-9_-]{32})$/.exec(text);
  if (start) return linkBot(update, start[1], telegramId, chatId);
  const actor = await adminActor(telegramId, chatId);
  if (/^\/support(?:@[A-Za-z0-9_]+)?(?:\s|$)/.test(text)) {
    await enqueue("telegram_reply", `${update.update_id}:support`, {
      method: "sendMessage",
      body: {
        chat_id: chatId,
        text: "Yordam yoki to‘lovni qaytarish bo‘yicha murojaatni saytda yuboring. Javob va murojaat tarixi shaxsiy kabinetda saqlanadi.",
        reply_markup: { inline_keyboard: [[{ text: actor ? "Admin murojaatlari" : "Yordam olish", url: `${config().appUrl}/${actor ? "admin/support" : "support"}` }]] },
      },
    });
    return;
  }
  if (update.callback_query) {
    const callback = update.callback_query;
    await enqueue("telegram_reply", `${update.update_id}:callback`, { method: "answerCallbackQuery", body: { callback_query_id: callback.id, text: actor ? "Ko‘rsatma yuborildi" : "Admin ruxsati talab qilinadi" } });
    if (!actor) return;
    const choice = /^(approve|reject|info):([0-9a-f-]{36})$/.exec(callback.data || "");
    if (!choice || !UUID.test(choice[2])) return;
    const instruction = choice[1] === "approve"
      ? `Bank/Payme hisobida pul tushganini tekshiring. Chekning o‘zi isbot emas. So‘ng yuboring:\n/approve ${choice[2]} BANK_TRANZAKSIYA_ID\nKechikkan yoki rad etilgan to‘lov uchun oxiriga « | SABAB» qo‘shing.`
      : `Sababini yozib yuboring:\n/${choice[1]} ${choice[2]} SABAB`;
    return reply(update.update_id, "instruction", chatId, instruction);
  }
  const command = /^\/(approve|reject|info)(?:@[A-Za-z0-9_]+)?\s+(\S+)\s+([\s\S]+)$/.exec(text);
  if (command && actor && UUID.test(command[2])) {
    try {
      const decision: "approve" | "reject" | "needs_info" = command[1] === "info" ? "needs_info" : command[1] as "approve" | "reject";
      const value = command[3].trim();
      const [bankReference, ...reasonParts] = value.split("|");
      const approvalReason = reasonParts.join("|").trim();
      if (decision === "approve" && (bankReference.trim().length < 3 || bankReference.trim().length > 160 || (approvalReason && (approvalReason.length < 3 || approvalReason.length > 1000))))
        throw new CommerceError(400, "review_format", "Bank tranzaksiya raqamini (3–160 belgi), kerak bo‘lsa | belgisi bilan sababni yozing");
      if (decision !== "approve" && (value.length < 3 || value.length > 1000))
        throw new CommerceError(400, "review_format", "Sabab 3–1000 belgidan iborat bo‘lsin");
      await reviewPaymentOrder(command[2], actor.id, decision === "approve"
        ? { decision, bankReference: bankReference.trim(), ...(approvalReason ? { reason: approvalReason } : {}) }
        : { decision, reason: value });
      await reply(update.update_id, "review", chatId, `Buyurtma ${command[2]}: ${decision === "approve" ? "tasdiqlandi, coin bir marta qo‘shildi" : decision === "reject" ? "rad etildi" : "aniqlashtirish so‘raldi"}.`);
    } catch (error) {
      if (!(error instanceof CommerceError)) throw error;
      await reply(update.update_id, "review-error", chatId, error.message);
    }
    return;
  }
  await reply(update.update_id, "help", chatId, actor
    ? "To‘lovni bank hisobida tekshiring. Buyruqlar: /approve BUYURTMA_ID BANK_TRANZAKSIYA_ID; /reject BUYURTMA_ID sabab; /info BUYURTMA_ID sabab. To‘liq buyurtmalar saytning admin kabinetida."
    : "Botni ulash uchun TUBE MENTOR profilidagi «Telegram botni ulash» tugmasidan foydalaning. Yordam olish yoki qaytarish bo‘yicha murojaat uchun /support buyrug‘ini yuboring. Darslar va to‘lovlar saytning o‘zida boshqariladi.");
}

class AwaitingAdmin extends Error {}
async function sendReceiptNotification(job: Row) {
  const admins = await activeAdminLinks();
  if (!admins.length) throw new AwaitingAdmin("An active admin must link the bot");
  const receiptId = Number(job.payload.receiptId || job.reference_id);
  const result = await pool.query(
    "SELECT r.*,o.package_name,o.price_uzs,o.coins,o.id AS payment_id,u.full_name FROM payment_receipts r JOIN payment_orders o ON o.id=r.order_id JOIN users u ON u.id=o.user_id WHERE r.id=$1", [receiptId],
  );
  const receipt = result.rows[0];
  if (!receipt) return;
  await readPrivateReceipt(receipt.storage_key);
  const caption = `Yangi chek\nBuyurtma: ${receipt.payment_id}\nO‘quvchi: ${String(receipt.full_name).slice(0, 100)}\nPaket: ${String(receipt.package_name).slice(0, 100)}\nSumma: ${receipt.price_uzs} so‘m\nCoin: ${receipt.coins}\n${job.payload.duplicateWarning ? "DIQQAT: shu rasm boshqa buyurtmada ham ishlatilgan.\n" : ""}${job.payload.latePayment ? "Kechikkan to‘lov: sabab bilan alohida tasdiqlash talab etiladi.\n" : ""}Tasdiqlashdan avval haqiqiy bank tushumini tekshiring.`;
  // Each recipient has a durable event; one failed recipient cannot cause everyone to receive another copy.
  for (const admin of admins) await enqueue("telegram_receipt_delivery", `${receipt.id}:${admin.user_id}`, { receiptId: receipt.id, recipientUserId: admin.user_id, caption });
}

async function deliverReceipt(job: Row) {
  const admin = (await activeAdminLinks()).find((row) => row.user_id === job.payload.recipientUserId);
  if (!admin) return; // Revoked admins must not receive private payment data.
  const result = await pool.query("SELECT * FROM payment_receipts WHERE id=$1", [job.payload.receiptId]);
  const receipt = result.rows[0];
  if (!receipt) return;
  const content = await readPrivateReceipt(receipt.storage_key);
  const markup = { inline_keyboard: [
    [{ text: "Tasdiqlash", callback_data: `approve:${receipt.order_id}` }, { text: "Rad etish", callback_data: `reject:${receipt.order_id}` }],
    [{ text: "Aniqlashtirish", callback_data: `info:${receipt.order_id}` }, { text: "Admin kabineti", url: `${config().appUrl}/admin/payments/${receipt.order_id}` }],
  ] };
  const form = new FormData();
  form.set("chat_id", admin.chat_id);
  form.set("caption", String(job.payload.caption).slice(0, 1000));
  form.set("reply_markup", JSON.stringify(markup));
  // sendDocument preserves WEBP/JPEG bytes and works for all allowed receipt formats.
  form.set("document", new Blob([new Uint8Array(content)], { type: receipt.mime_type }), receipt.original_name);
  await botCall("sendDocument", form);
}

async function sendOrderNotification(job: Row) {
  const orderId = String(job.payload.orderId || job.reference_id.split(":")[0]);
  const result = await pool.query(
    "SELECT o.*,l.chat_id,u.is_active FROM payment_orders o JOIN users u ON u.id=o.user_id JOIN telegram_bot_links l ON l.user_id=o.user_id WHERE o.id=$1", [orderId],
  );
  const order = result.rows[0];
  if (!order || !order.is_active) return;
  const status = String(job.payload.status || order.status);
  const label = status === "approved" ? `To‘lov tasdiqlandi. Hisobingizga ${job.payload.coins || order.coins} coin qo‘shildi.`
    : status === "needs_info" ? "To‘lov uchun aniqlashtirish kerak."
    : status === "rejected" ? "To‘lov rad etildi."
    : status.includes("refund") ? "To‘lovingiz bo‘yicha qaytarish qayd etildi."
    : `Buyurtma holati: ${status}`;
  const reason = String(job.payload.reason || "").slice(0, 1000);
  await botCall("sendMessage", { chat_id: order.chat_id, text: `${label}\nBuyurtma: ${order.id}${reason ? `\nSabab: ${reason}` : ""}`, reply_markup: { inline_keyboard: [[{ text: "Buyurtmani saytda ko‘rish", url: `${config().appUrl}/payments/${order.id}` }]] } });
}

async function dispatchSupportNotification(job: Row) {
  const admins = await activeAdminLinks();
  if (!admins.length) throw new AwaitingAdmin("An active admin must link the bot");
  const ticketId = String(job.payload.ticketId || "");
  if (!UUID.test(ticketId)) return;
  const result = await pool.query("SELECT id FROM commerce_support_tickets WHERE id=$1", [ticketId]);
  if (!result.rowCount) return;
  for (const admin of admins) await enqueue("telegram_support_admin_delivery", `${job.reference_id}:${admin.user_id}`, { ticketId, messageId: job.payload.messageId, recipientUserId: admin.user_id });
}

async function deliverAdminSupportNotification(job: Row) {
  const admin = (await activeAdminLinks()).find((row) => row.user_id === job.payload.recipientUserId);
  if (!admin) return;
  const result = await pool.query("SELECT * FROM commerce_support_tickets WHERE id=$1", [job.payload.ticketId]);
  const ticket = result.rows[0];
  if (!ticket) return;
  const categories: Record<string, string> = { payment: "To‘lov", refund: "Qaytarish", lesson: "Dars", account: "Hisob", technical: "Texnik yordam", other: "Boshqa" };
  const category = categories[ticket.category] || String(ticket.category).slice(0, 80);
  await botCall("sendMessage", {
    chat_id: admin.chat_id,
    text: `O‘quvchi murojaati\nMurojaat: ${ticket.id}\nO‘quvchi: ${String(ticket.full_name_snapshot).slice(0, 100)}\nBo‘lim: ${category}\nMavzu: ${String(ticket.subject).slice(0, 200)}\nJavobni admin kabinetidan yuboring. Qaytarish so‘rovi moliyaviy tasdiq emas.`,
    reply_markup: { inline_keyboard: [[{ text: "Murojaatni ochish", url: `${config().appUrl}/admin/support/${ticket.id}` }]] },
  });
}

async function deliverStudentSupportNotification(job: Row) {
  const ticketId = String(job.payload.ticketId || "");
  if (!UUID.test(ticketId)) return;
  const result = await pool.query(
    "SELECT t.*,l.chat_id,u.is_active FROM commerce_support_tickets t JOIN users u ON u.id=t.user_id JOIN telegram_bot_links l ON l.user_id=t.user_id WHERE t.id=$1", [ticketId],
  );
  const ticket = result.rows[0];
  if (!ticket || !ticket.is_active) return;
  await botCall("sendMessage", {
    chat_id: ticket.chat_id,
    text: `Murojaatingizga javob keldi.\nMavzu: ${String(ticket.subject).slice(0, 200)}\nJavob va tarixni shaxsiy kabinetingizda ko‘ring.`,
    reply_markup: { inline_keyboard: [[{ text: "Javobni ko‘rish", url: `${config().appUrl}/support/${ticket.id}` }]] },
  });
}

/** Durable leases support restart recovery and more than one application instance. */
export async function processPaymentOutbox(limit = 10) {
  if (!config().available) return;
  for (let i = 0; i < Math.min(Math.max(limit, 1), 50); i++) {
    const client = await pool.connect();
    let job: Row | undefined;
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `SELECT * FROM notification_outbox WHERE kind IN ('telegram_update','telegram_reply','payment_receipt','telegram_receipt_delivery','payment_review','payment_refund','support_admin','support_reply','telegram_support_admin_delivery')
           AND (state='pending' OR state='processing') AND next_attempt_at<=now()
         ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1`,
      );
      job = result.rows[0];
      if (job) await client.query("UPDATE notification_outbox SET state='processing',next_attempt_at=now()+interval '2 minutes' WHERE id=$1", [job.id]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
    if (!job) break;
    try {
      if (job.kind === "telegram_update") await processTelegramUpdate(job.payload.update);
      else if (job.kind === "telegram_reply") await botCall(String(job.payload.method), job.payload.body);
      else if (job.kind === "payment_receipt") await sendReceiptNotification(job);
      else if (job.kind === "telegram_receipt_delivery") await deliverReceipt(job);
      else if (job.kind === "support_admin") await dispatchSupportNotification(job);
      else if (job.kind === "telegram_support_admin_delivery") await deliverAdminSupportNotification(job);
      else if (job.kind === "support_reply") await deliverStudentSupportNotification(job);
      else await sendOrderNotification(job);
      await pool.query("UPDATE notification_outbox SET state='sent',last_error=NULL WHERE id=$1", [job.id]);
    } catch (error) {
      if (error instanceof AwaitingAdmin) {
        await pool.query("UPDATE notification_outbox SET state='pending',next_attempt_at=now()+interval '1 minute',last_error='Admin botni ulashi kerak' WHERE id=$1", [job.id]);
        continue;
      }
      const attempts = job.attempts + 1;
      const delay = Math.min(3600, 15 * 2 ** Math.min(attempts, 8));
      await pool.query("UPDATE notification_outbox SET state=$2,attempts=$3,next_attempt_at=now()+($4*interval '1 second'),last_error=$5 WHERE id=$1", [job.id, attempts >= 8 ? "failed" : "pending", attempts, delay, error instanceof CommerceError ? error.message.slice(0, 200) : "Telegram notification delivery failed"]);
    }
  }
}

export async function configurePaymentWebhook() {
  const current = config();
  if (!current.available) return false;
  await getBotUsername();
  await botCall("setWebhook", { url: `${current.appUrl}/api/commerce/telegram/webhook`, secret_token: current.secret, allowed_updates: ["message", "callback_query"], max_connections: 2, drop_pending_updates: false });
  return true;
}

export function startPaymentMaintenance() {
  let busy = false, stopped = false, webhookReady = false, configuredFingerprint = "";
  let webhookAttempts = 0, nextWebhookAttempt = 0;
  async function tick() {
    if (busy || stopped) return;
    busy = true;
    try {
      const current = config();
      const fingerprint = createHash("sha256").update(`${current.token}:${current.secret}:${current.appUrl}`).digest("hex");
      if (configuredFingerprint !== fingerprint) {
        configuredFingerprint = fingerprint;
        webhookReady = false;
        webhookAttempts = 0;
        nextWebhookAttempt = 0;
      }
      if (current.available && !webhookReady && Date.now() >= nextWebhookAttempt) {
        try { webhookReady = await configurePaymentWebhook(); webhookAttempts = 0; }
        catch {
          webhookAttempts++;
          nextWebhookAttempt = Date.now() + Math.min(3600000, 30000 * 2 ** Math.min(webhookAttempts, 7));
          console.error("Payment bot webhook setup failed; website payments remain available");
        }
      }
      await processPaymentOutbox();
      await pool.query("DELETE FROM telegram_link_tokens WHERE expires_at<now()-interval '7 days'");
    } catch { console.error("Payment notification maintenance failed"); }
    finally { busy = false; }
  }
  const interval = setInterval(() => { void tick(); }, 15000);
  interval.unref();
  void tick();
  return () => { stopped = true; clearInterval(interval); };
}
