import { test, before, beforeEach, after, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes, randomInt } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import type { Server } from "node:http";

let pg: PGlite, socket: PGLiteSocketServer, http: Server, pool: import("pg").Pool;
let base: string, receiptDirectory: string, admin: Client, packageId: number;
let demoLessonId: number, paidLessonIds: number[] = [], legacyId: string, legacyLessonId: number;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhN8AAAAASUVORK5CYII=", "base64");
const testPassword = randomBytes(32).toString("hex");
const settings = {
  demoLessonId: null as number | null,
  paymentsEnabled: true,
  recipientName: "Sinov uchun qabul qiluvchi",
  cardNumber: `0000${randomInt(0, 1_000_000_000_000).toString().padStart(12, "0")}`,
  paymeUrl: "",
  paymentInstructions: "Mahalliy sinov: haqiqiy pul yubormang.",
  reviewHours: "09:00–18:00",
};
class Client {
  cookie = "";
  id = "";
  async raw(url: string, method = "GET", body?: unknown, extraHeaders: Record<string, string> = {}) {
    const multipart = body instanceof FormData;
    const r = await fetch(base + url, {
      method,
      headers: {
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(method === "GET" || multipart ? {} : { "Content-Type": "application/json" }),
        ...extraHeaders,
      },
      body: method === "GET" ? undefined : multipart ? body : JSON.stringify(body ?? {}),
    });
    const cookie = r.headers.get("set-cookie");
    if (cookie) this.cookie = cookie.split(";")[0];
    return r;
  }
  async call(url: string, method = "GET", body?: unknown) {
    const r = await this.raw(url, method, body);
    return { status: r.status, data: await r.json() };
  }
  async login(username: string, password: string) {
    const r = await this.call("/api/auth/login", "POST", { username, password });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    this.id = r.data.id;
    return r.data;
  }
  async wallet() {
    const r = await this.call("/api/commerce/wallet");
    assert.equal(r.status, 200, JSON.stringify(r.data));
    return r.data;
  }
  async order() {
    const r = await this.call("/api/commerce/orders", "POST", { packageId });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    return r.data;
  }
  async receipt(orderId: string, bytes: Buffer = png, mime = "image/png") {
    const form = new FormData();
    form.append("file", new Blob([Uint8Array.from(bytes)], { type: mime }), "chek.png");
    return this.call(`/api/commerce/orders/${orderId}/receipt`, "POST", form);
  }
}
async function learner(name: string = randomUUID(), verified = true) {
  const { hashPassword } = await import("../server/auth");
  await pool.query("insert into users(full_name,username,password_hash,email_verified,onboarding_completed)values($1,$1,$2,$3,true)", [name, hashPassword(testPassword), verified]);
  const c = new Client();
  if (verified) await c.login(name, testPassword);
  return c;
}
async function approve(orderId: string, bankReference: string = randomUUID()) {
  const r = await admin.call(`/api/admin/commerce/orders/${orderId}/review`, "POST", { decision: "approve", bankReference });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
}
beforeEach(async () => { await pool.query("delete from api_rate_limits"); });
before(async () => {
  pg = new PGlite();
  await pg.waitReady;
  socket = new PGLiteSocketServer({ db: pg, port: 0, maxConnections: 1 });
  await socket.start();
  process.env.DATABASE_URL = `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`;
  process.env.DB_POOL_MAX = "1";
  process.env.NODE_ENV = "test";
  process.env.SESSION_SECRET = randomBytes(32).toString("hex");
  process.env.APP_URL = "http://localhost";
  delete process.env.TELEGRAM_BOT_TOKEN;
  receiptDirectory = await mkdtemp(path.join(tmpdir(), "tube-commerce-receipts-"));
  process.env.PRIVATE_RECEIPTS_DIR = receiptDirectory;
  ({ pool } = await import("../server/db"));
  // Model a real installation upgrade, not just an empty database.
  await pool.query(await readFile("migrations/0000_baseline.sql", "utf8"));
  const old = await pool.query("insert into users(full_name,username,password_hash,coins)values('Legacy Student','legacy_commerce','unused',55)returning id");
  legacyId = old.rows[0].id;
  await pool.query("insert into coin_transactions(user_id,amount,type,description)values($1,55,'old_topup','Historical balance entry')", [legacyId]);
  await pool.query("insert into users(full_name,username,password_hash,role,coins)values('Former Teacher','old_teacher_commerce','unused','teacher',10)");
  const oldLesson = await pool.query("insert into lessons(title,status,created_by)values('Previously studied lesson','published',$1)returning id", [legacyId]);
  legacyLessonId = oldLesson.rows[0].id;
  await pool.query("insert into lesson_progress(user_id,lesson_id,completion_percent,study_time_seconds)values($1,$2,40,90)", [legacyId, legacyLessonId]);
  const { createApplication } = await import("../server/app");
  ({ httpServer: http } = await createApplication({ seed: false }));
  const { seedDemo, exampleLesson } = await import("../server/demo-data");
  process.env.TUBE_DEMO_ADMIN_PASSWORD = testPassword;
  await seedDemo();
  const { db } = await import("../server/db");
  const { lessons } = await import("../shared/schema");
  const adminId = (await pool.query("select id from users where username='demo_admin'")).rows[0].id;
  for (let n = 0; n < 5; n++) {
    const [l] = await db.insert(lessons).values({ ...exampleLesson(adminId, adminId), title: `Coin lesson ${n + 1}`, summaryDetailed: `Secret paid lesson ${n + 1}` }).returning();
    paidLessonIds.push(l.id);
  }
  demoLessonId = (await pool.query("select id from lessons where title='Namuna: Maktab va uy'")).rows[0].id;
  settings.demoLessonId = demoLessonId;
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(http.address() as import("node:net").AddressInfo).port}`;
  admin = new Client();
  await admin.login("demo_admin", testPassword);
}, { timeout: 180000 });
after(async () => {
  if (http) await new Promise<void>((r) => http.close(() => r()));
  if (pool) await pool.end();
  if (socket) await socket.stop();
  await new Promise<void>((r) => setImmediate(r));
  if (pg) await pg.close();
  if (receiptDirectory) await rm(receiptDirectory, { recursive: true, force: true });
});

test("commerce migration preserves existing balances, financial history and studied access", async () => {
  const { migrateDatabase } = await import("../server/migrate");
  await migrateDatabase();
  assert.equal((await pool.query("select coins from users where id=$1", [legacyId])).rows[0].coins, 55);
  const history = (await pool.query("select amount,type,description,idempotency_key from coin_transactions where user_id=$1", [legacyId])).rows;
  assert.deepEqual(history, [{ amount: 55, type: "old_topup", description: "Historical balance entry", idempotency_key: null }]);
  assert.equal((await pool.query("select role,coins from users where username='old_teacher_commerce'")).rows[0].role, "student");
  assert.equal((await pool.query("select role,coins from users where username='old_teacher_commerce'")).rows[0].coins, 10);
  const grants = (await pool.query("select * from coin_grants where user_id=$1", [legacyId])).rows;
  assert.equal(grants.length, 1);
  assert.equal(grants[0].source, "legacy");
  assert.equal(grants[0].remaining, 55);
  assert.equal((await pool.query("select source from lesson_access where user_id=$1 and lesson_id=$2", [legacyId, legacyLessonId])).rows[0].source, "legacy");
  const progress = (await pool.query("select completion_percent,study_time_seconds from lesson_progress where user_id=$1", [legacyId])).rows[0];
  assert.equal(progress.completion_percent, 40);
  assert.equal(progress.study_time_seconds, 90);
});

test("verified students receive exactly one welcome bonus; unverified login cannot earn coins", async () => {
  const name = `welcome_${randomUUID()}`;
  const c = await learner(name);
  const wallets = await Promise.all([c.wallet(), c.wallet(), c.wallet()]);
  assert.ok(wallets.every((w) => w.balance === 30 && w.bonusGranted));
  const returning = new Client();
  await returning.login(name, testPassword);
  assert.equal((await returning.wallet()).balance, 30);
  const ledger = (await pool.query("select amount,balance_before,balance_after from coin_transactions where user_id=$1", [c.id])).rows;
  assert.deepEqual(ledger.map((x) => [x.amount, x.balance_before, x.balance_after]), [[30, 0, 30]]);
  assert.equal((await c.call(`/api/commerce/lessons/${demoLessonId}/purchase`, "POST")).status, 200);
  assert.equal((await c.wallet()).balance, 30);
  const draftId = (await pool.query("select id from lessons where status='draft' limit 1")).rows[0].id;
  assert.equal((await c.call(`/api/commerce/lessons/${draftId}/purchase`, "POST")).status, 404);
  assert.equal((await c.wallet()).balance, 30);
  const unverifiedName = `unverified_${randomUUID()}`;
  await learner(unverifiedName, false);
  const denied = await new Client().call("/api/auth/login", "POST", { username: unverifiedName, password: testPassword });
  assert.equal(denied.status, 403);
  assert.equal((await pool.query("select coins from users where username=$1", [unverifiedName])).rows[0].coins, 0);
});

test("concurrent lesson purchases charge once and never overdraw the wallet", async () => {
  const c = await learner();
  const repeated = await Promise.all(Array.from({ length: 5 }, () => c.call(`/api/commerce/lessons/${paidLessonIds[0]}/purchase`, "POST")));
  assert.ok(repeated.every((r) => r.status === 200), JSON.stringify(repeated));
  assert.equal((await c.wallet()).balance, 20);
  assert.equal((await pool.query("select count(*)::int as n from lesson_access where user_id=$1 and lesson_id=$2", [c.id, paidLessonIds[0]])).rows[0].n, 1);
  const rest = await Promise.all(paidLessonIds.slice(1, 4).map((id) => c.call(`/api/commerce/lessons/${id}/purchase`, "POST")));
  assert.equal(rest.filter((r) => r.status === 200).length, 2);
  assert.equal(rest.filter((r) => r.status === 402).length, 1);
  const wallet = await c.wallet();
  assert.equal(wallet.balance, 0);
  assert.equal(wallet.ownedLessonIds.length, 3);
  assert.equal((await pool.query("select sum(amount)::int as total from coin_transactions where user_id=$1", [c.id])).rows[0].total, 0);
  assert.equal((await c.call(`/api/learn/lessons/${paidLessonIds[0]}`)).status, 200);
  assert.equal((await c.call(`/api/commerce/lessons/${paidLessonIds[0]}/purchase`, "POST")).status, 200);
  assert.equal((await c.wallet()).balance, 0);
});

test("locked lessons expose only catalog metadata across current and legacy APIs", async () => {
  const c = await learner();
  const guest = new Client();
  const id = paidLessonIds[4];
  for (const path of [`/api/lessons/public/${id}`, `/api/learn/preview/${id}`, `/api/learn/lessons/${id}`]) {
    assert.equal((await guest.call(path)).status, 401, path);
    assert.equal((await c.call(path)).status, 402, path);
  }
  for (const path of ["/api/lessons/public", "/api/learn/catalog"]) {
    const r = await guest.call(path);
    assert.equal(r.status, 200);
    const data = JSON.stringify(r.data);
    assert.ok(!data.includes("Secret paid lesson"), path);
    assert.ok(!data.includes("i_rab"), path);
    assert.ok(!data.includes("correctIndex"), path);
    assert.ok(!data.includes("youtube.com"), path);
  }
  assert.equal((await guest.call(`/api/learn/preview/${demoLessonId}`)).status, 200);
  assert.equal((await c.call("/api/user/saved-words", "POST", { lessonId: id, word: "طَالِبٌ", subtitleTime: 0 })).status, 402);
  assert.equal((await c.call(`/api/learn/lessons/${id}/notes`, "POST", { content: "Bypass" })).status, 402);
  assert.equal((await c.call(`/api/learn/lessons/${id}/sessions`, "POST")).status, 402);
  assert.equal((await c.call(`/api/learn/lessons/${id}/attempts`, "POST", { kind: "practice" })).status, 402);
  assert.equal((await c.call(`/api/user/lessons/${id}/notes`)).status, 402);
  assert.equal((await c.call(`/api/user/lessons/${id}x/notes`)).status, 400);
  assert.equal((await c.call(`/api/user/lessons/${id}e1/notes`)).status, 400);
});

test("unconfigured payments and inactive packages reject orders; configured orders snapshot prices", async () => {
  const c = await learner();
  const packages = (await admin.call("/api/admin/commerce/packages")).data.packages;
  const inactiveId = packages[0].id;
  assert.equal((await c.call("/api/commerce/orders", "POST", { packageId: inactiveId })).status, 503);
  const updated = await admin.call(`/api/admin/commerce/packages/${inactiveId}`, "PATCH", { name: "Sinov 100", coins: 100, priceUzs: 100000, isActive: true });
  assert.equal(updated.status, 200, JSON.stringify(updated.data));
  packageId = inactiveId;
  assert.equal((await c.call("/api/commerce/orders", "POST", { packageId })).status, 503);
  assert.equal((await admin.call("/api/admin/commerce/settings", "PUT", { ...settings, recipientName: "" })).status, 400);
  assert.equal((await admin.call("/api/admin/commerce/settings", "PUT", { ...settings, paymeUrl: "https://payme.uz.evil.example/checkout" })).status, 400);
  const configured = await admin.call("/api/admin/commerce/settings", "PUT", settings);
  assert.equal(configured.status, 200, JSON.stringify(configured.data));
  assert.equal((await c.call("/api/commerce/orders", "POST", { packageId: packages[1].id })).status, 404);
  const order = await c.order();
  assert.equal(order.coins, 100);
  assert.equal(order.priceUzs, 100000);
  assert.equal(order.instructions.cardNumber, settings.cardNumber);
  await admin.call(`/api/admin/commerce/packages/${packageId}`, "PATCH", { name: "Changed package", coins: 200, priceUzs: 250000, isActive: true });
  const snapshot = (await c.call(`/api/commerce/orders/${order.id}`)).data;
  assert.equal(snapshot.coins, 100);
  assert.equal(snapshot.priceUzs, 100000);
  assert.equal(snapshot.packageName, "Sinov 100");
  assert.equal((await new Client().call("/api/admin/commerce/settings")).status, 401);
  assert.equal((await c.call("/api/admin/commerce/settings", "PUT", settings)).status, 403);
  await admin.call(`/api/admin/commerce/packages/${packageId}`, "PATCH", { name: "Sinov 100", coins: 100, priceUzs: 100000, isActive: true });
});

test("receipt upload validates contents and ownership and never exposes a public upload URL", async () => {
  const c = await learner(), other = await learner();
  const order = await c.order();
  assert.equal((await other.receipt(order.id)).status, 404);
  assert.equal((await c.receipt(order.id, Buffer.from("not a picture"), "image/png")).status, 400);
  assert.equal((await c.receipt(order.id, png, "text/html")).status, 400);
  assert.equal((await c.receipt(order.id, Buffer.alloc(6 * 1024 * 1024, 1))).status, 413);
  const uploaded = await c.receipt(order.id);
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.data));
  const saved = (await c.call(`/api/commerce/orders/${order.id}`)).data;
  assert.equal(saved.status, "receipt_submitted");
  assert.equal(saved.receipts.length, 1);
  const receipt = saved.receipts[0];
  assert.match(receipt.url, /^\/api\/commerce\/receipts\/\d+$/);
  assert.ok(!JSON.stringify(saved).includes("storageKey"));
  assert.equal((await new Client().raw(receipt.url)).status, 401);
  assert.equal((await other.raw(receipt.url)).status, 404);
  const privateImage = await c.raw(receipt.url);
  assert.equal(privateImage.status, 200);
  assert.equal(privateImage.headers.get("content-type"), "image/png");
  assert.match(privateImage.headers.get("cache-control") ?? "", /private|no-store/);
  assert.deepEqual(Buffer.from(await privateImage.arrayBuffer()), png);
  assert.equal((await admin.raw(receipt.url)).status, 200);
});

test("admin approval requires a bank reference and duplicate reviews credit exactly once", async () => {
  const c = await learner();
  const order = await c.order();
  assert.equal((await admin.call(`/api/admin/commerce/orders/${order.id}/review`, "POST", { decision: "approve", bankReference: "no-receipt-yet" })).status, 409);
  await c.receipt(order.id);
  assert.equal((await admin.call(`/api/admin/commerce/orders/${order.id}/review`, "POST", { decision: "approve" })).status, 400);
  const ref = randomUUID();
  const results = await Promise.all(Array.from({ length: 4 }, () => admin.call(`/api/admin/commerce/orders/${order.id}/review`, "POST", { decision: "approve", bankReference: ref })));
  assert.ok(results.every((r) => r.status === 200), JSON.stringify(results));
  assert.equal((await c.wallet()).balance, 130);
  assert.equal((await pool.query("select count(*)::int as n from coin_transactions where order_id=$1 and amount>0", [order.id])).rows[0].n, 1);
  const second = await c.order();
  await c.receipt(second.id);
  assert.equal((await admin.call(`/api/admin/commerce/orders/${second.id}/review`, "POST", { decision: "approve", bankReference: ref })).status, 409);
  assert.equal((await c.wallet()).balance, 130);
  assert.equal((await c.call(`/api/commerce/orders/${order.id}/cancel`, "POST")).status, 409);
});

test("needs-info and rejected payments can be clarified; expired paid orders require admin review", async () => {
  const c = await learner();
  const order = await c.order();
  await c.receipt(order.id);
  assert.equal((await admin.call(`/api/admin/commerce/orders/${order.id}/review`, "POST", { decision: "needs_info", reason: "Chekda summa ko‘rinmagan" })).status, 200);
  assert.equal((await c.wallet()).balance, 30);
  assert.equal((await c.receipt(order.id)).status, 201);
  assert.equal((await admin.call(`/api/admin/commerce/orders/${order.id}/review`, "POST", { decision: "reject", reason: "Tranzaksiya topilmadi" })).status, 200);
  assert.equal((await c.wallet()).balance, 30);
  assert.equal((await c.receipt(order.id)).status, 201);
  await approve(order.id);
  assert.equal((await c.wallet()).balance, 130);
  const late = await c.order();
  await pool.query("update payment_orders set expires_at=now()-interval '1 minute' where id=$1", [late.id]);
  assert.equal((await c.call(`/api/commerce/orders/${late.id}`)).data.status, "expired");
  assert.equal((await c.receipt(late.id)).status, 201);
  assert.equal((await c.wallet()).balance, 130);
  assert.equal((await admin.call(`/api/admin/commerce/orders/${late.id}/review`, "POST", { decision: "approve", bankReference: randomUUID() })).status, 400);
  assert.equal((await admin.call(`/api/admin/commerce/orders/${late.id}/review`, "POST", { decision: "approve", bankReference: randomUUID(), reason: "Late receipt: confirmed in bank statement" })).status, 200);
  assert.equal((await c.wallet()).balance, 230);
  const cancelled = await c.order();
  assert.equal((await c.call(`/api/commerce/orders/${cancelled.id}/cancel`, "POST")).status, 200);
  assert.equal((await c.call(`/api/commerce/orders/${cancelled.id}`)).data.status, "cancelled");
  assert.equal((await c.receipt(cancelled.id)).status, 201);
  assert.equal((await c.call(`/api/commerce/orders/${cancelled.id}`)).data.status, "expired");
  assert.equal((await admin.call(`/api/admin/commerce/orders/${cancelled.id}/review`, "POST", { decision: "approve", bankReference: randomUUID() })).status, 400);
  assert.equal((await admin.call(`/api/admin/commerce/orders/${cancelled.id}/review`, "POST", { decision: "approve", bankReference: randomUUID(), reason: "Payment confirmed after the learner cancelled" })).status, 200);
  assert.equal((await c.wallet()).balance, 330);
});

test("refunds consume only the originating unused paid coins and retain an audit trail", async () => {
  const c = await learner();
  const order = await c.order();
  await c.receipt(order.id);
  await approve(order.id);
  const ref = `refund-${randomUUID()}`;
  const body = { coins: 100, bankReference: ref, reason: "Unused package refund after bank repayment" };
  const first = await admin.call(`/api/admin/commerce/orders/${order.id}/refund`, "POST", body);
  assert.equal(first.status, 200, JSON.stringify(first.data));
  const repeated = await admin.call(`/api/admin/commerce/orders/${order.id}/refund`, "POST", body);
  assert.equal(repeated.status, 200, JSON.stringify(repeated.data));
  assert.equal((await c.wallet()).balance, 30);
  const snapshot = (await c.call(`/api/commerce/orders/${order.id}`)).data;
  assert.equal(snapshot.status, "refunded");
  assert.equal(snapshot.refundedCoins, 100);
  assert.equal((await pool.query("select count(*)::int as n from coin_transactions where order_id=$1 and amount<0", [order.id])).rows[0].n, 1);
  assert.ok((await pool.query("select count(*)::int as n from commerce_audit where reference_id=$1", [order.id])).rows[0].n >= 2);
  const spent = await c.order();
  await c.receipt(spent.id);
  await approve(spent.id);
  for (const id of paidLessonIds.slice(0, 4)) assert.equal((await c.call(`/api/commerce/lessons/${id}/purchase`, "POST")).status, 200);
  assert.equal((await admin.call(`/api/admin/commerce/orders/${spent.id}/refund`, "POST", { coins: 100, bankReference: randomUUID(), reason: "Already partly spent" })).status, 409);
  assert.equal((await c.wallet()).balance, 90);
  assert.equal((await c.call(`/api/learn/lessons/${paidLessonIds[0]}`)).status, 200);
});

test("manual adjustments are explained, idempotent and restricted to active admin accounts", async () => {
  const c = await learner();
  const body = { amount: 7, reason: "Documented support correction", idempotencyKey: randomUUID() };
  assert.equal((await c.call(`/api/admin/commerce/users/${c.id}/adjust`, "POST", body)).status, 403);
  const first = await admin.call(`/api/admin/commerce/users/${c.id}/adjust`, "POST", body);
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal((await admin.call(`/api/admin/commerce/users/${c.id}/adjust`, "POST", body)).status, 200);
  assert.equal((await c.wallet()).balance, 37);
  assert.equal((await admin.call(`/api/admin/commerce/users/${c.id}/adjust`, "POST", { amount: -100, reason: "Cannot overdraw", idempotencyKey: randomUUID() })).status, 409);
  assert.equal((await c.wallet()).balance, 37);
});

test("Telegram webhook secrets and linked admin roles prevent forged approval; bot and web credit once", async () => {
  const { processPaymentOutbox } = await import("../server/payment-bot");
  const realFetch = globalThis.fetch;
  const secret = "commerce_webhook_fixture_secret_123456789";
  process.env.APP_URL = "https://tube-commerce.test";
  process.env.TELEGRAM_BOT_TOKEN = "123456789:abcdefghijklmnopqrstuvwxyz_123456";
  process.env.TELEGRAM_WEBHOOK_SECRET = secret;
  process.env.TELEGRAM_ADMIN_IDS = "12345";
  let failMessages = false;
  const remoteCalls: string[] = [];
  const botMock = mock.method(globalThis, "fetch", async (...args: Parameters<typeof fetch>) => {
    const url = String(args[0]);
    if (!url.startsWith("https://api.telegram.org/")) return realFetch(...args);
    const method = url.split("/").at(-1)!;
    remoteCalls.push(method);
    if (failMessages && method === "sendMessage") throw new Error("Network outage fixture");
    return Response.json({ ok: true, result: method === "getMe" ? { username: "CommerceFixtureBot" } : true });
  });
  let updateId = 90000;
  async function webhook(id: number, text: string, from = 12345, header = secret) {
    return new Client().raw("/api/commerce/telegram/webhook", "POST", {
      update_id: id,
      message: { message_id: id, chat: { id: from, type: "private" }, from: { id: from }, text },
    }, { "X-Telegram-Bot-Api-Secret-Token": header });
  }
  try {
    const c = await learner();
    const order = await c.order();
    await c.receipt(order.id);
    assert.equal((await webhook(++updateId, `/approve ${order.id} FORGED-REF`, 12345, "incorrect-secret")).status, 403);
    assert.equal((await webhook(++updateId, `/approve ${order.id} NO-SITE-LINK`)).status, 200);
    await processPaymentOutbox(50);
    assert.equal((await c.wallet()).balance, 30);
    const link = await admin.call("/api/commerce/telegram/link", "POST");
    assert.equal(link.status, 200, JSON.stringify(link.data));
    const token = new URL(link.data.url).searchParams.get("start")!;
    assert.equal((await webhook(++updateId, `/start ${token}`)).status, 200);
    await processPaymentOutbox(50);
    assert.equal((await pool.query("select user_id from telegram_bot_links where telegram_user_id='12345'")).rows[0].user_id, admin.id);
    // Notifications accepted before an admin links the bot remain durable and deliver later.
    await pool.query("update notification_outbox set next_attempt_at=now() where kind='payment_receipt' and payload->>'orderId'=$1", [order.id]);
    await processPaymentOutbox(50);
    assert.equal((await webhook(++updateId, `/approve ${order.id} FORGED-OTHER-USER`, 99999)).status, 200);
    await processPaymentOutbox(50);
    assert.equal((await c.wallet()).balance, 30);
    const ref = `BOT-WEB-${randomUUID()}`.toUpperCase();
    const validId = ++updateId;
    const repeated = await Promise.all([webhook(validId, `/approve ${order.id} ${ref}`), webhook(validId, `/approve ${order.id} ${ref}`)]);
    assert.ok(repeated.every((r) => r.status === 200));
    await Promise.all([processPaymentOutbox(50), approve(order.id, ref)]);
    assert.equal((await c.wallet()).balance, 130);
    assert.equal((await pool.query("select count(*)::int as n from coin_transactions where order_id=$1 and amount>0", [order.id])).rows[0].n, 1);
    assert.equal((await pool.query("select count(*)::int as n from notification_outbox where kind='telegram_update' and reference_id=$1", [String(validId)])).rows[0].n, 1);
    assert.ok(remoteCalls.includes("sendDocument"));
    // A remote notification failure leaves website purchases and approvals intact.
    failMessages = true;
    const next = await c.order();
    assert.equal((await c.receipt(next.id)).status, 201);
    await approve(next.id);
    await processPaymentOutbox(50);
    assert.equal((await c.wallet()).balance, 230);
    // Link the learner to receive a real order notification; its delivery can be retried.
    const learnerLink = await c.call("/api/commerce/telegram/link", "POST");
    const learnerToken = new URL(learnerLink.data.url).searchParams.get("start")!;
    await webhook(++updateId, `/start ${learnerToken}`, 54321);
    await processPaymentOutbox(50);
    const pending = (await pool.query("select * from notification_outbox where kind='telegram_reply' and attempts>0 order by id desc limit 1")).rows[0];
    assert.ok(pending);
    assert.equal(pending.state, "pending");
    assert.ok(!String(pending.last_error).includes(process.env.TELEGRAM_BOT_TOKEN));
    failMessages = false;
    await pool.query("update notification_outbox set next_attempt_at=now() where id=$1", [pending.id]);
    await processPaymentOutbox(50);
    assert.equal((await pool.query("select state from notification_outbox where id=$1", [pending.id])).rows[0].state, "sent");
    await pool.query("update users set is_active=false where id=$1", [admin.id]);
    try {
      const blockedOrder = await c.order();
      await c.receipt(blockedOrder.id);
      await webhook(++updateId, `/approve ${blockedOrder.id} BLOCKED-ADMIN`);
      await processPaymentOutbox(50);
      assert.equal((await c.wallet()).balance, 230);
    } finally {
      await pool.query("update users set is_active=true where id=$1", [admin.id]);
    }
  } finally {
    botMock.mock.restore();
    process.env.APP_URL = "http://localhost";
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    delete process.env.TELEGRAM_ADMIN_IDS;
  }
});

test("audited coin ledger entries are append-only and cannot silently change the balance", async () => {
  const c = await learner();
  const entry = (await pool.query("select id from coin_transactions where user_id=$1 and type='welcome_bonus'", [c.id])).rows[0];
  await assert.rejects(() => pool.query("update coin_transactions set amount=9999 where id=$1", [entry.id]));
  await assert.rejects(() => pool.query("delete from coin_transactions where id=$1", [entry.id]));
  assert.equal((await c.wallet()).balance, 30);
  assert.equal((await pool.query("select amount from coin_transactions where id=$1", [entry.id])).rows[0].amount, 30);
});

test("a guest can finish the sample test and retain results after login without coin or XP duplication", async () => {
  const guest = new Client();
  const attempt = await guest.call(`/api/learn/preview/${demoLessonId}/attempts`, "POST", { kind: "vocabulary" });
  assert.equal(attempt.status, 200, JSON.stringify(attempt.data));
  assert.ok(attempt.data.questions.length > 0);
  assert.ok(attempt.data.questions.every((q: any) => !("answer" in q) && !("explanation" in q)));
  const first = attempt.data.questions[0];
  assert.equal((await new Client().call(`/api/learn/preview/${demoLessonId}/attempts/${attempt.data.id}/answers`, "POST", { questionId: first.id, answer: "wrong" })).status, 404);
  for (const q of attempt.data.questions) {
    const answer = await guest.call(`/api/learn/preview/${demoLessonId}/attempts/${attempt.data.id}/answers`, "POST", { questionId: q.id, answer: "wrong" });
    assert.equal(answer.status, 200);
    assert.equal(answer.data.xp, 0);
    assert.equal(answer.data.correct, false);
    const retry = await guest.call(`/api/learn/preview/${demoLessonId}/attempts/${attempt.data.id}/answers`, "POST", { questionId: q.id, answer: answer.data.answer });
    assert.equal(retry.data.correct, false);
  }
  assert.equal((await guest.call(`/api/learn/preview/${demoLessonId}/transfer`, "POST")).status, 401);
  const name = `demo_transfer_${randomUUID()}`;
  const newStudent = await learner(name);
  const { content_version } = (await pool.query("select content_version from lessons where id=$1", [demoLessonId])).rows[0];
  await pool.query("insert into lesson_progress(user_id,lesson_id,content_version,accuracy)values($1,$2,$3,90)", [newStudent.id, demoLessonId, content_version]);
  await guest.login(name, testPassword);
  assert.equal((await guest.call(`/api/learn/preview/${demoLessonId}/transfer`, "POST", { score: 100, xp: 1000 })).status, 400);
  const imported = await guest.call(`/api/learn/preview/${demoLessonId}/transfer`, "POST");
  assert.equal(imported.status, 200, JSON.stringify(imported.data));
  assert.equal(imported.data.imported, true);
  assert.equal(imported.data.xp, 0);
  assert.equal(imported.data.vocabulary.score, 0);
  assert.equal(imported.data.progress.completionPercent, 100);
  assert.equal(imported.data.progress.accuracy, 90);
  const again = await guest.call(`/api/learn/preview/${demoLessonId}/transfer`, "POST");
  assert.equal(again.status, 200);
  assert.equal(again.data.imported, false);
  assert.equal((await guest.wallet()).balance, 30);
  assert.equal((await pool.query("select xp from users where id=$1", [newStudent.id])).rows[0].xp, 0);
  assert.equal((await pool.query("select count(*)::int as n from lesson_attempts where user_id=$1 and lesson_id=$2", [newStudent.id, demoLessonId])).rows[0].n, 1);
});

test("support messages and refund requests remain private and never change wallet or lesson rights automatically", async () => {
  const c = await learner(), other = await learner();
  const order = await c.order();
  await c.receipt(order.id);
  await approve(order.id);
  await c.call(`/api/commerce/lessons/${paidLessonIds[0]}/purchase`, "POST");
  const before = await c.wallet();
  const payload = { category: "refund", subject: "Refund request for the paid package", message: "Please review my unused coins and explain the refund process.", orderId: order.id, lessonId: paidLessonIds[0] };
  assert.equal((await other.call("/api/commerce/support", "POST", payload)).status, 404);
  const created = await c.call("/api/commerce/support", "POST", payload);
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const ticketId = created.data.ticket.id;
  assert.equal(created.data.ticket.category, "refund");
  assert.equal((await new Client().call(`/api/commerce/support/${ticketId}`)).status, 401);
  assert.equal((await other.call(`/api/commerce/support/${ticketId}`)).status, 404);
  assert.equal((await other.call(`/api/commerce/support/${ticketId}/reply`, "POST", { message: "Cannot read this user's request" })).status, 404);
  assert.equal((await c.call(`/api/admin/commerce/support/${ticketId}/reply`, "POST", { message: "Forbidden moderation", status: "closed" })).status, 403);
  const answered = await admin.call(`/api/admin/commerce/support/${ticketId}/reply`, "POST", { message: "Bank repayment must be confirmed before a refund is recorded.", status: "answered" });
  assert.equal(answered.status, 200, JSON.stringify(answered.data));
  assert.equal(answered.data.ticket.status, "answered");
  assert.equal(answered.data.messages.length, 2);
  assert.ok(JSON.stringify(answered.data.messages).includes(payload.message));
  assert.equal((await c.call(`/api/commerce/support/${ticketId}/reply`, "POST", { message: "Status injection", status: "closed" })).status, 400);
  const reply = await c.call(`/api/commerce/support/${ticketId}/reply`, "POST", { message: "Thank you, I will wait for the bank confirmation." });
  assert.equal(reply.status, 200);
  assert.equal(reply.data.ticket.status, "open");
  assert.equal(reply.data.messages.length, 3);
  assert.equal((await admin.call(`/api/admin/commerce/support/${ticketId}/reply`, "POST", { message: "The request is resolved without a financial adjustment.", status: "closed" })).status, 200);
  const reopened = await c.call(`/api/commerce/support/${ticketId}/reply`, "POST", { message: "I have one further question about this same order." });
  assert.equal(reopened.status, 200);
  assert.equal(reopened.data.ticket.status, "open");
  assert.equal(reopened.data.messages.length, 5);
  assert.ok(reopened.data.messages.filter((message: any) => message.authorRole === "admin").every((message: any) => message.authorName === "TUBE MENTOR admini"));
  const originalMessageId = reopened.data.messages[0].id;
  await assert.rejects(() => pool.query("update commerce_support_messages set message='tampered message' where id=$1", [originalMessageId]));
  await assert.rejects(() => pool.query("delete from commerce_support_messages where id=$1", [originalMessageId]));
  assert.equal((await c.call(`/api/commerce/support/${ticketId}`)).data.messages.length, 5);
  const wallet = await c.wallet();
  assert.equal(wallet.balance, before.balance);
  assert.deepEqual(wallet.ownedLessonIds, before.ownedLessonIds);
  assert.equal((await c.call(`/api/commerce/orders/${order.id}`)).data.status, "approved");
  assert.equal((await c.call(`/api/learn/lessons/${paidLessonIds[0]}`)).status, 200);
  const adminList = await admin.call("/api/admin/commerce/support");
  assert.equal(adminList.status, 200);
  assert.ok(adminList.data.tickets.some((ticket: any) => ticket.id === ticketId));
  const otherList = await other.call("/api/commerce/support");
  assert.equal(otherList.status, 200);
  assert.ok(!otherList.data.tickets.some((ticket: any) => ticket.id === ticketId));
});

test("admin lifecycle controls prevent losing the last active admin even during concurrent demotions", async () => {
  const last = await admin.call(`/api/admin/users/${admin.id}`, "PATCH", { role: "student" });
  assert.equal(last.status, 409, JSON.stringify(last.data));
  assert.equal(last.data.code, "LAST_ACTIVE_ADMIN");
  assert.equal((await admin.call(`/api/admin/users/${admin.id}/status`, "PATCH", { isActive: false })).status, 409);
  const { hashPassword } = await import("../server/auth");
  const nameA = `admin_a_${randomUUID()}`, nameB = `admin_b_${randomUUID()}`;
  await pool.query("insert into users(full_name,username,password_hash,role,email_verified)values('Admin A',$1,$3,'admin',true),('Admin B',$2,$3,'admin',true)", [nameA, nameB, hashPassword(testPassword)]);
  const a = new Client(), b = new Client();
  await a.login(nameA, testPassword);
  await b.login(nameB, testPassword);
  await pool.query("update users set is_active=false where id=$1", [admin.id]);
  try {
    const results = await Promise.all([
      a.call(`/api/admin/users/${a.id}`, "PATCH", { role: "student" }),
      b.call(`/api/admin/users/${b.id}`, "PATCH", { role: "student" }),
    ]);
    assert.equal(results.filter((result) => result.status === 200).length, 1, JSON.stringify(results));
    assert.equal(results.filter((result) => result.status === 409 || result.status === 403).length, 1);
    assert.equal((await pool.query("select count(*)::int as n from users where role='admin' and is_active=true")).rows[0].n, 1);
    assert.equal((await pool.query("select count(*)::int as n from commerce_audit where action='admin_user_role_changed' and user_id=any($1::varchar[])", [[a.id, b.id]])).rows[0].n, 1);
  } finally {
    await pool.query("update users set is_active=true where id=$1", [admin.id]);
    await pool.query("update users set role='student',session_version=session_version+1 where id=any($1::varchar[])", [[a.id, b.id]]);
  }
});

test('admin prices and welcome bonus apply on server while previous grants remain unchanged', async () => {
  const student = await learner();
  const before = await student.wallet();
  const paidId = paidLessonIds[0];
  try {
    const saved = await admin.call('/api/admin/commerce/settings','PUT',{...settings,welcomeCoins:45,lessonCost:14,lessonPrices:{[paidId]:17}});
    assert.equal(saved.status,200,JSON.stringify(saved.data));
    const fresh = await learner();
    assert.equal((await fresh.wallet()).balance,45);
    assert.equal((await student.wallet()).balance,before.balance);
    const catalog = await fresh.call('/api/learn/catalog');
    assert.equal(catalog.data.lessons.find((l:any)=>l.id===paidId).priceCoins,17);
    const results = await Promise.all([fresh.call(`/api/commerce/lessons/${paidId}/purchase`,'POST',{}),fresh.call(`/api/commerce/lessons/${paidId}/purchase`,'POST',{})]);
    assert.ok(results.every(r=>r.status===200),JSON.stringify(results));
    assert.equal((await fresh.wallet()).balance,28);
  } finally {await admin.call('/api/admin/commerce/settings','PUT',settings);}
});

test('JSON lesson package is admin-only, creates a draft, rejects invalid replacement and publishes in one checked step', async () => {
  const pkg = JSON.parse(await readFile('client/public/lesson-package-example.json','utf8'));
  const student = await learner();
  assert.equal((await student.call('/api/admin/lesson-package','POST',{package:pkg})).status,403);
  const created = await admin.call('/api/admin/lesson-package','POST',{package:pkg});
  assert.equal(created.status,201,JSON.stringify(created.data));
  const lesson = created.data.lesson;
  assert.equal(lesson.status,'draft');
  const broken = structuredClone(pkg); broken.content.quizzes[0].correctIndex=999;
  assert.equal((await admin.call('/api/admin/lesson-package','POST',{package:broken,lessonId:lesson.id,contentVersion:lesson.contentVersion})).status,400);
  assert.equal((await admin.call(`/api/user/lessons/${lesson.id}`)).data.status,'draft');
  assert.equal((await admin.call('/api/admin/lesson-package','POST',{package:pkg,lessonId:lesson.id,contentVersion:999})).status,409);
  const reviewed = await admin.call(`/api/studio/lessons/${lesson.id}/review`,'POST',{text:true,translation:true,timing:true,exercises:true,contentVersion:lesson.contentVersion});
  assert.equal(reviewed.status,200,JSON.stringify(reviewed.data));
  assert.equal(reviewed.data.status,'published');
  assert.equal(reviewed.data.publishedSnapshot.title,pkg.metadata.title);
  assert.equal((await admin.call(`/api/studio/lessons/${lesson.id}/review`,'POST',{text:true})).status,400);
});
