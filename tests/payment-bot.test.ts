import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";

let module: typeof import("../server/payment-bot");
let pool: import("pg").Pool;
let server: Server;
let base: string;
const secret = "test_payment_webhook_secret_1234567890";

before(async () => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.APP_URL = "https://tube-payment.test";
  process.env.TELEGRAM_BOT_TOKEN = "123456789:abcdefghijklmnopqrstuvwxyz_123456";
  process.env.TELEGRAM_WEBHOOK_SECRET = secret;
  module = await import("../server/payment-bot");
  ({ pool } = await import("../server/db"));
  const app = express();
  app.use(express.json({ limit: "100kb" }));
  module.registerPaymentBotRoutes(app);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
});

after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  if (pool) await pool.end();
});

test("receipt image bytes and declared MIME must agree; non-images and excessive size are rejected", () => {
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(12)]);
  const jpeg = Buffer.from([255, 216, 255, 224, 0, 1]);
  const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(4)]);
  assert.deepEqual(module.validateReceiptImage(png, "image/png"), { mime: "image/png", extension: "png" });
  assert.deepEqual(module.validateReceiptImage(jpeg, "image/jpeg"), { mime: "image/jpeg", extension: "jpg" });
  assert.deepEqual(module.validateReceiptImage(webp, "image/webp"), { mime: "image/webp", extension: "webp" });
  assert.throws(() => module.validateReceiptImage(png, "image/jpeg"), /JPG, PNG yoki WEBP/);
  assert.throws(() => module.validateReceiptImage(Buffer.from("<svg onload='alert(1)' />"), "image/png"), /JPG, PNG yoki WEBP/);
  assert.throws(() => module.validateReceiptImage(Buffer.alloc(0), "image/png"), /5 MB/);
  assert.throws(() => module.validateReceiptImage(Buffer.alloc(5 * 1024 * 1024 + 1), "image/png"), /5 MB/);
});

test("webhook authenticates the full secret before any database operation", async () => {
  for (const provided of ["", secret.slice(0, -1), secret.slice(0, -1) + "x"]) {
    const response = await fetch(base + "/api/commerce/telegram/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": provided },
      body: JSON.stringify({ update_id: 1 }),
    });
    assert.equal(response.status, 403);
  }
});

test("even an authenticated webhook rejects oversized payloads and invalid update identities", async () => {
  const headers = { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": secret };
  const large = await fetch(base + "/api/commerce/telegram/webhook", { method: "POST", headers, body: JSON.stringify({ update_id: 1, text: "a".repeat(33000) }) });
  assert.equal(large.status, 413);
  for (const update_id of [-1, 1.5, "1", null]) {
    const invalid = await fetch(base + "/api/commerce/telegram/webhook", { method: "POST", headers, body: JSON.stringify({ update_id }) });
    assert.equal(invalid.status, 400);
  }
});
