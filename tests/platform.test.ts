import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import type { Server } from "node:http";
let pg: PGlite,
  socket: PGLiteSocketServer,
  http: Server,
  pool: import("pg").Pool,
  base: string,
  userId: string;
const password = randomBytes(32).toString("hex");
const key = randomBytes(32).toString("hex");
const headers = { "Content-Type": "application/json", "x-platform-key": key };
async function post(
  path: string,
  data: unknown,
  extra: Record<string, string> = {},
) {
  if (
    path.endsWith("/purchase") &&
    data &&
    typeof data === "object" &&
    !("expectedVersion" in data)
  ) {
    const item = await (
      await fetch(base + path.replace(/\/purchase$/, ""))
    ).json();
    data = { ...data, expectedVersion: item.offerVersion };
  }
  return fetch(base + path, {
    method: "POST",
    headers: { ...headers, ...extra },
    body: JSON.stringify(data),
  });
}
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
  process.env.PLATFORM_APP_URL = "http://portal.local";
  process.env.PLATFORM_SERVICE_SECRET = key;
  const { createApplication } = await import("../server/app");
  ({ pool } = await import("../server/db"));
  const app = await createApplication({ seed: false });
  http = app.httpServer;
  const { hashPassword } = await import("../server/auth");
  const result = await pool.query(
    "INSERT INTO users(full_name,username,password_hash,email_verified) VALUES('Platform test','platform_test',$1,true) RETURNING id",
    [hashPassword(password)],
  );
  userId = result.rows[0].id;
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  base = "http://127.0.0.1:" + (http.address() as any).port;
});
after(async () => {
  if (http) await new Promise<void>((resolve) => http.close(() => resolve()));
  await pool?.end();
  await socket?.stop();
  await pg?.close();
});
test("platform service authentication cannot be forged and public me contains no private identity", async () => {
  assert.equal(
    (
      await fetch(base + "/api/platform/me", {
        headers: {
          "x-platform-key": "incorrect",
          "x-platform-session": "forged",
        },
      })
    ).status,
    403,
  );
  const response = await fetch(base + "/api/platform/me", { headers });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { user: null });
});
test("password login shares the existing account/wallet and never repeats the welcome bonus", async () => {
  const first = await post("/api/platform/auth/password", {
    username: "platform_test",
    password,
  });
  assert.equal(first.status, 200);
  const data = await first.json();
  assert.equal(data.user.id, userId);
  assert.equal(data.user.coins, 30);
  assert.equal(data.user.passwordHash, undefined);
  const second = await post("/api/platform/auth/password", {
    username: "platform_test",
    password,
  });
  assert.equal(second.status, 200);
  assert.equal((await second.json()).user.coins, 30);
  const wallet = await fetch(base + "/api/commerce/wallet", {
    headers: { ...headers, "x-platform-session": data.token },
  });
  assert.equal(wallet.status, 200);
  assert.equal((await wallet.json()).balance, 30);
  const ledger = await pool.query(
    "SELECT count(*)::int AS n FROM coin_transactions WHERE user_id=$1 AND type='welcome_bonus'",
    [userId],
  );
  assert.equal(ledger.rows[0].n, 1);
  const sessions = await pool.query("SELECT count(*)::int AS n FROM session");
  assert.equal(sessions.rows[0].n, 0);
});
test("OAuth handoff is nonce-bound, single-use and has a fixed callback origin", async () => {
  const { finishPlatformLogin } = await import("../server/platform-bridge");
  const { storage } = await import("../server/storage");
  const nonce = randomBytes(32).toString("base64url");
  const url = new URL(
    (await finishPlatformLogin((await storage.getUser(userId))!, nonce))!,
  );
  assert.equal(url.origin, "http://portal.local");
  const code = url.searchParams.get("code");
  assert.equal(
    (
      await post("/api/platform/auth/exchange", {
        code,
        nonce: randomBytes(32).toString("base64url"),
      })
    ).status,
    401,
  );
  const response = await post("/api/platform/auth/exchange", { code, nonce });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.id, userId);
  assert.equal(
    (await post("/api/platform/auth/exchange", { code, nonce })).status,
    401,
  );
});
test("logout and account version changes invalidate platform sessions", async () => {
  const response = await post("/api/platform/auth/password", {
    username: "platform_test",
    password,
  });
  const { token } = await response.json();
  assert.equal(
    (
      await post(
        "/api/platform/auth/logout",
        {},
        { "x-platform-session": token },
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(base + "/api/platform/me", {
        headers: { ...headers, "x-platform-session": token },
      })
    ).status,
    401,
  );
  const another = await post("/api/platform/auth/password", {
    username: "platform_test",
    password,
  });
  const newToken = (await another.json()).token;
  await pool.query(
    "UPDATE users SET session_version=session_version+1 WHERE id=$1",
    [userId],
  );
  assert.equal(
    (
      await fetch(base + "/api/platform/me", {
        headers: { ...headers, "x-platform-session": newToken },
      })
    ).status,
    401,
  );
});
let productId: string, lessonId: number, accessToken: string;
test("real published lessons appear in the public marketplace; demos contain only the allowed portion", async () => {
  const lesson = await pool.query(
    `INSERT INTO lessons(title,status,youtube_url,transcript_source,subtitles_json) VALUES('Real source fixture','published','https://www.youtube.com/watch?v=dQw4w9WgXcQ','manual',$1) RETURNING id`,
    [
      JSON.stringify([
        { text: "أَهْلًا", translation: "Salom", start: 0, end: 5 },
        { text: "بَعْدَ ذَلِكَ", translation: "Keyin", start: 60, end: 65 },
      ]),
    ],
  );
  lessonId = lesson.rows[0].id;
  productId = "tube-" + lessonId;
  const catalog = await fetch(base + "/api/platform/catalog");
  assert.equal(catalog.status, 200);
  const products = (await catalog.json()).products;
  assert.equal(products.find((p: any) => p.id === productId).priceCoins, 10);
  const demo = await fetch(
    base + "/api/platform/products/" + productId + "/demo",
  );
  const data = await demo.json();
  assert.equal(demo.status, 200);
  assert.equal(data.endSeconds, 30);
  assert.equal(data.transcript, undefined);
  assert.equal(data.quizzesJson, undefined);
  assert.equal(
    data.segments.some((s: any) => s.start >= 30),
    false,
  );
  accessToken = (
    await (
      await post("/api/platform/auth/password", {
        username: "platform_test",
        password,
      })
    ).json()
  ).token;
});
test("marketplace purchase and repeated requests debit the existing wallet only once", async () => {
  const requestKey = crypto.randomUUID();
  const body = { requestKey, expectedPrice: 10 };
  const h = { "x-platform-session": accessToken };
  const first = await post(
    "/api/platform/products/" + productId + "/purchase",
    body,
    h,
  );
  assert.equal(first.status, 200);
  const order = await first.json();
  assert.equal(order.status, "active");
  const repeat = await post(
    "/api/platform/products/" + productId + "/purchase",
    body,
    h,
  );
  assert.equal((await repeat.json()).id, order.id);
  const another = await post(
    "/api/platform/products/" + productId + "/purchase",
    { requestKey: crypto.randomUUID(), expectedPrice: 10 },
    h,
  );
  assert.equal(another.status, 200);
  const user = (
    await pool.query("SELECT coins FROM users WHERE id=$1", [userId])
  ).rows[0];
  assert.equal(user.coins, 20);
  const ledger = await pool.query(
    "SELECT count(*)::int AS n FROM coin_transactions WHERE user_id=$1 AND type='product_purchase'",
    [userId],
  );
  assert.equal(ledger.rows[0].n, 1);
  const source = await fetch(base + "/api/learn/lessons/" + lessonId, {
    headers: { ...headers, ...h },
  });
  assert.equal(source.status, 200);
});
test("expired access is denied by the original learning endpoint and renewed purchase creates one new term", async () => {
  await pool.query(
    "UPDATE lesson_access SET expires_at=now()-interval '1 day' WHERE user_id=$1 AND lesson_id=$2",
    [userId, lessonId],
  );
  await pool.query(
    "UPDATE platform_orders SET expires_at=now()-interval '1 day' WHERE user_id=$1 AND product_id=$2",
    [userId, productId],
  );
  const h = { "x-platform-session": accessToken };
  assert.equal(
    (
      await fetch(base + "/api/learn/lessons/" + lessonId, {
        headers: { ...headers, ...h },
      })
    ).status,
    402,
  );
  await pool.query(
    "UPDATE platform_products SET duration_days=30 WHERE id=$1",
    [productId],
  );
  const changed = await post(
    "/api/platform/products/" + productId + "/purchase",
    { requestKey: crypto.randomUUID(), expectedPrice: 99 },
    h,
  );
  assert.equal(changed.status, 409);
  const renewed = await post(
    "/api/platform/products/" + productId + "/purchase",
    { requestKey: crypto.randomUUID(), expectedPrice: 10 },
    h,
  );
  assert.equal(renewed.status, 200);
  assert.ok((await renewed.json()).expires_at);
  assert.equal(
    (
      await fetch(base + "/api/learn/lessons/" + lessonId, {
        headers: { ...headers, ...h },
      })
    ).status,
    200,
  );
  assert.equal(
    (await pool.query("SELECT coins FROM users WHERE id=$1", [userId])).rows[0]
      .coins,
    10,
  );
});
test("unconnected source products cannot charge a student", async () => {
  await pool.query(
    "INSERT INTO platform_products(id,provider,source_id,kind,title,price_coins,demo_ref,status) VALUES('unconnected-course','courses','fixture','course','Provider fixture',5,'fixture','published')",
  );
  const response = await post(
    "/api/platform/products/unconnected-course/purchase",
    { requestKey: crypto.randomUUID(), expectedPrice: 5 },
    { "x-platform-session": accessToken },
  );
  assert.equal(response.status, 503);
  assert.equal(
    (await pool.query("SELECT coins FROM users WHERE id=$1", [userId])).rows[0]
      .coins,
    10,
  );
});
test("admin extends access, then refund restores original coin lots exactly once and removes source access", async () => {
  const { managePlatformOrder } = await import("../server/marketplace");
  const order = (
    await pool.query(
      "SELECT * FROM platform_orders WHERE user_id=$1 AND product_id=$2 AND status='active' ORDER BY created_at DESC LIMIT 1",
      [userId, productId],
    )
  ).rows[0];
  await managePlatformOrder(userId, order.id, {
    action: "extend",
    days: 10,
    reason: "Test extension",
  });
  const access = (
    await pool.query(
      "SELECT expires_at FROM lesson_access WHERE user_id=$1 AND lesson_id=$2",
      [userId, lessonId],
    )
  ).rows[0];
  assert.ok(new Date(access.expires_at).getTime() > Date.now() + 39 * 86400000);
  await managePlatformOrder(userId, order.id, {
    action: "refund",
    reason: "Test refund",
  });
  await managePlatformOrder(userId, order.id, {
    action: "refund",
    reason: "Retry refund",
  });
  assert.equal(
    (await pool.query("SELECT coins FROM users WHERE id=$1", [userId])).rows[0]
      .coins,
    20,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT sum(remaining)::int AS balance FROM coin_grants WHERE user_id=$1",
        [userId],
      )
    ).rows[0].balance,
    20,
  );
  assert.equal(
    (
      await fetch(base + "/api/learn/lessons/" + lessonId, {
        headers: { ...headers, "x-platform-session": accessToken },
      })
    ).status,
    402,
  );
});
test("saved words and audio progress are isolated by account and reject invalid resource identifiers", async () => {
  const extra = { "x-platform-session": accessToken };
  assert.equal(
    (
      await post(
        "/api/platform/audio/progress",
        { resourceId: "lesson-01", position: 15, duration: 100 },
        extra,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await post(
        "/api/platform/audio/progress",
        { resourceId: "lesson-31", position: 0, duration: 1 },
        extra,
      )
    ).status,
    400,
  );
  const response = await fetch(base + "/api/platform/audio/progress", {
    headers: { ...headers, ...extra },
  });
  assert.equal((await response.json()).progress["lesson-01"], 15);
  assert.equal(
    (
      await post(
        "/api/platform/saved",
        { sourceId: "123", arabic: "كِتَابٌ", translation: "kitob" },
        extra,
      )
    ).status,
    200,
  );
  assert.equal(
    (await fetch(base + "/api/platform/saved", { headers })).status,
    401,
  );
});
test("provider delivery and admin refund reconcile failures without a second debit or premature refund", async () => {
  const {
    syncProviderCatalog,
    provisionOrder,
    queuePlatformAction,
    processPlatformAction,
  } = await import("../server/marketplace");
  process.env.PLATFORM_COURSES_SECRET = randomBytes(32).toString("hex");
  const nativeFetch = globalThis.fetch;
  let deliveryDown = true,
    revokeDown = true;
  let expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
  const operations = new Map<string, any>();
  globalThis.fetch = (async (input: any, init: any) => {
    const url = String(input);
    if (!url.startsWith("https://zamonaviy-videokurs.up.railway.app/"))
      return nativeFetch(input, init);
    const path = new URL(url).pathname;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (path.endsWith("/catalog"))
      return Response.json({
        products: [
          {
            sourceId: "course:plan",
            kind: "course",
            title: "Provider contract fixture",
            description: "Contract test",
            sourceVersion: "v1",
            demoRef: "course:plan",
            recommendedDurationDays: 30,
          },
        ],
      });
    if (path.endsWith("/grants")) {
      if (deliveryDown)
        return Response.json({ message: "offline" }, { status: 503 });
      return Response.json({ orderId: body.orderId, active: true, expiresAt });
    }
    if (path.endsWith("/manage")) {
      if (body.action === "revoke" && revokeDown)
        return Response.json({ message: "offline" }, { status: 503 });
      if (operations.has(body.operationId))
        return Response.json(operations.get(body.operationId));
      if (body.action === "extend")
        expiresAt = new Date(
          Date.parse(expiresAt) + body.days * 86400000,
        ).toISOString();
      const value = {
        orderId: path.split("/").at(-2),
        active: body.action === "extend",
        expiresAt,
      };
      operations.set(body.operationId, value);
      return Response.json(value);
    }
    return Response.json({}, { status: 404 });
  }) as typeof fetch;
  try {
    assert.equal((await syncProviderCatalog("courses")).count, 1);
    const p = (
      await pool.query(
        "SELECT id,status FROM platform_products WHERE provider='courses' AND source_id='course:plan'",
      )
    ).rows[0];
    assert.equal(p.status, "draft");
    await pool.query(
      "UPDATE platform_products SET status='published',price_coins=5 WHERE id=$1",
      [p.id],
    );
    const bought = await post(
      "/api/platform/products/" + p.id + "/purchase",
      { requestKey: crypto.randomUUID(), expectedPrice: 5 },
      { "x-platform-session": accessToken },
    );
    const o = await bought.json();
    assert.equal(o.status, "pending");
    assert.equal(
      (await pool.query("SELECT coins FROM users WHERE id=$1", [userId]))
        .rows[0].coins,
      15,
    );
    deliveryDown = false;
    await provisionOrder(o.id);
    assert.equal(
      (
        await pool.query("SELECT status FROM platform_orders WHERE id=$1", [
          o.id,
        ])
      ).rows[0].status,
      "active",
    );
    const actionId = crypto.randomUUID(),
      value = {
        action: "extend" as const,
        days: 10,
        reason: "Contract extension",
      };
    assert.equal(
      (await queuePlatformAction(userId, o.id, actionId, value)).status,
      "applied",
    );
    const expiry = (
      await pool.query("SELECT expires_at FROM platform_orders WHERE id=$1", [
        o.id,
      ])
    ).rows[0].expires_at;
    await queuePlatformAction(userId, o.id, actionId, value);
    assert.equal(
      new Date(
        (
          await pool.query(
            "SELECT expires_at FROM platform_orders WHERE id=$1",
            [o.id],
          )
        ).rows[0].expires_at,
      ).getTime(),
      new Date(expiry).getTime(),
    );
    const refundId = crypto.randomUUID();
    assert.equal(
      (
        await queuePlatformAction(userId, o.id, refundId, {
          action: "refund",
          reason: "Contract refund",
        })
      ).status,
      "pending",
    );
    assert.equal(
      (await pool.query("SELECT coins FROM users WHERE id=$1", [userId]))
        .rows[0].coins,
      15,
    );
    revokeDown = false;
    await processPlatformAction(refundId);
    await processPlatformAction(refundId);
    assert.equal(
      (await pool.query("SELECT coins FROM users WHERE id=$1", [userId]))
        .rows[0].coins,
      20,
    );
    assert.equal(
      (
        await pool.query("SELECT status FROM platform_orders WHERE id=$1", [
          o.id,
        ])
      ).rows[0].status,
      "refunded",
    );
  } finally {
    globalThis.fetch = nativeFetch;
    delete process.env.PLATFORM_COURSES_SECRET;
  }
});
test("a refunded lesson can be bought again, and removing an offer does not remove a previous purchaser", async () => {
  const response = await post(
    "/api/platform/products/" + productId + "/purchase",
    { requestKey: crypto.randomUUID(), expectedPrice: 10 },
    { "x-platform-session": accessToken },
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "active");
  await pool.query("UPDATE platform_products SET status='draft' WHERE id=$1", [
    productId,
  ]);
  const h = { ...headers, "x-platform-session": accessToken };
  assert.equal(
    (await fetch(base + "/api/platform/products/" + productId, { headers: h }))
      .status,
    404,
  );
  assert.equal(
    (await fetch(base + "/api/learn/lessons/" + lessonId, { headers: h }))
      .status,
    200,
  );
  const library = await (
    await fetch(base + "/api/platform/library", { headers: h })
  ).json();
  assert.equal(
    library.products.find((p: any) => p.id === productId).status,
    "draft",
  );
  assert.equal(
    (
      await post(
        "/api/commerce/lessons/" + lessonId + "/purchase",
        {},
        { "x-platform-session": accessToken },
      )
    ).status,
    409,
  );
  await pool.query(
    "UPDATE platform_products SET status='published' WHERE id=$1",
    [productId],
  );
});
test("a term change after product preview cannot charge the old confirmation", async () => {
  const p = await (
    await fetch(base + "/api/platform/products/" + productId)
  ).json();
  await pool.query(
    "UPDATE platform_products SET duration_days=15 WHERE id=$1",
    [productId],
  );
  const balance = (
    await pool.query("SELECT coins FROM users WHERE id=$1", [userId])
  ).rows[0].coins;
  const response = await post(
    "/api/platform/products/" + productId + "/purchase",
    {
      requestKey: crypto.randomUUID(),
      expectedPrice: 10,
      expectedVersion: p.offerVersion,
    },
    { "x-platform-session": accessToken },
  );
  assert.equal(response.status, 409);
  assert.equal(
    (await pool.query("SELECT coins FROM users WHERE id=$1", [userId])).rows[0]
      .coins,
    balance,
  );
});
test("legacy admin grants synchronize the cabinet and a manual block cannot be bypassed by buying again", async () => {
  const actor = (
    await pool.query(
      "INSERT INTO users(full_name,username,password_hash,email_verified,role) VALUES('Admin fixture','platform_admin_fixture',$1,true,'admin') RETURNING id",
      [randomBytes(64).toString("hex")],
    )
  ).rows[0].id;
  const { adjustLessonAccess } = await import("../server/commerce");
  await adjustLessonAccess(actor, userId, {
    lessonId,
    grant: true,
    reason: "Manual permanent access",
    idempotencyKey: crypto.randomUUID(),
  });
  const h = { ...headers, "x-platform-session": accessToken };
  const library = await (
    await fetch(base + "/api/platform/library", { headers: h })
  ).json();
  assert.equal(
    library.products.find((p: any) => p.id === productId).expiresAt,
    null,
  );
  await adjustLessonAccess(actor, userId, {
    lessonId,
    grant: false,
    reason: "Manual access block",
    idempotencyKey: crypto.randomUUID(),
  });
  assert.equal(
    (
      await post(
        "/api/platform/products/" + productId + "/purchase",
        { requestKey: crypto.randomUUID(), expectedPrice: 10 },
        { "x-platform-session": accessToken },
      )
    ).status,
    403,
  );
  assert.equal(
    (await fetch(base + "/api/learn/lessons/" + lessonId, { headers: h }))
      .status,
    402,
  );
  assert.equal(
    (
      await (await fetch(base + "/api/platform/library", { headers: h })).json()
    ).products.some((p: any) => p.id === productId),
    false,
  );
});
test("admin lesson-price changes preserve payment settings and concurrent prices; invalid zero prices cannot reset configuration", async () => {
  const { getCommerceSettings } = await import("../server/commerce");
  const settings = await getCommerceSettings();
  settings.recipientName = "Payment settings invariant";
  await pool.query(
    "INSERT INTO system_settings(key,value) VALUES('commerce',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    [JSON.stringify(settings)],
  );
  const { storage } = await import("../server/storage");
  const { finishPlatformLogin } = await import("../server/platform-bridge");
  const admin = (await storage.getUserByUsername("platform_admin_fixture"))!;
  const nonce = randomBytes(32).toString("base64url"),
    url = new URL((await finishPlatformLogin(admin, nonce))!);
  const token = (
    await (
      await post("/api/platform/auth/exchange", {
        code: url.searchParams.get("code"),
        nonce,
      })
    ).json()
  ).token;
  const another = (
    await pool.query(
      "INSERT INTO lessons(title,status,youtube_url,transcript_source,subtitles_json) SELECT 'Second price fixture',status,youtube_url,transcript_source,subtitles_json FROM lessons WHERE id=$1 RETURNING id",
      [lessonId],
    )
  ).rows[0].id;
  await fetch(base + "/api/platform/catalog");
  async function price(id: string, value: number) {
    const p = await (await fetch(base + "/api/platform/products/" + id)).json();
    return fetch(base + "/api/platform/admin/products/" + id, {
      method: "PATCH",
      headers: { ...headers, "x-platform-session": token },
      body: JSON.stringify({
        title: p.title,
        description: p.description,
        priceCoins: value,
        durationDays: 30,
        maxAttempts: null,
        demoRef: "source-demo",
        status: "published",
      }),
    });
  }
  assert.equal((await price(productId, 0)).status, 400);
  const results = await Promise.all([
    price(productId, 11),
    price("tube-" + another, 12),
  ]);
  for (const response of results) assert.equal(response.status, 200);
  const final = await getCommerceSettings();
  assert.equal(final.recipientName, "Payment settings invariant");
  assert.equal(final.lessonPrices[String(lessonId)], 11);
  assert.equal(final.lessonPrices[String(another)], 12);
});
