import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
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

test("verified legacy import never changes coins; qualified native IDs and permanent delivery rollback stay scoped", async () => {
  const { hashPassword } = await import("../server/auth");
  const { createHash } = await import("node:crypto");
  const { processPlatformAction, provisionOrder, queuePlatformAction } =
    await import("../server/marketplace");
  const username = "linked_" + randomUUID(),
    loginPassword = "private-fixture-password";
  const uid = (
    await pool.query(
      "INSERT INTO users(full_name,username,password_hash,email_verified) VALUES('Linked fixture',$1,$2,true) RETURNING id",
      [username, hashPassword(loginPassword)],
    )
  ).rows[0].id;
  const logged = await (
      await post("/api/platform/auth/password", {
        username,
        password: loginPassword,
      })
    ).json(),
    session = { "x-platform-session": logged.token };
  const legacyOrder = randomUUID(),
    sourceId = "quiz:legacy",
    pid =
      "quiz-" +
      createHash("sha256").update(sourceId).digest("hex").slice(0, 32);
  const oldFetch = globalThis.fetch;
  process.env.PLATFORM_QUIZ_SECRET = randomBytes(32).toString("hex");
  let revokeDown = true,
    proxySeen = false;
  globalThis.fetch = (async (input: any, init: any) => {
    const url = String(input);
    if (!url.startsWith("https://web-production-73482.up.railway.app/"))
      return oldFetch(input, init);
    const path = new URL(url).pathname,
      body = init?.body ? JSON.parse(String(init.body)) : {};
    assert.equal(
      init?.headers["x-platform-key"],
      process.env.PLATFORM_QUIZ_SECRET,
    );
    if (path.endsWith("/legacy/link")) {
      if (body.password !== "proof-password")
        return Response.json({ message: "wrong" }, { status: 401 });
      assert.equal(body.externalUserId, uid);
      return Response.json({
        linked: true,
        grants: [
          {
            orderId: legacyOrder,
            sourceId,
            kind: "test",
            title: "Old assessment",
            description: "Preserved",
            sourceVersion: "v1",
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
            maxAttempts: 2,
            attemptsRemaining: 1,
          },
        ],
      });
    }
    if (path.includes("/native/course-exams/quiz:legacy/start")) {
      assert.equal(init.headers["x-platform-order"], legacyOrder);
      assert.equal(init.headers["x-platform-user"], uid);
      proxySeen = true;
      return Response.json({ id: randomUUID(), status: "started" });
    }
    if (path.endsWith("/history"))
      return Response.json({
        attempts: [
          {
            id: "historic-result",
            status: "submitted",
            result: { score: 1, totalPoints: 2, percentage: 50 },
          },
        ],
      });
    if (path.endsWith("/library"))
      return Response.json({
        grants: [
          {
            orderId: legacyOrder,
            sourceId,
            attemptsRemaining: 1,
            maxAttempts: 2,
          },
        ],
      });
    if (path.endsWith("/grants"))
      return Response.json({ message: "changed version" }, { status: 409 });
    if (path.endsWith("/manage"))
      return revokeDown
        ? Response.json({ message: "temporary" }, { status: 503 })
        : Response.json({
            orderId: path.split("/").at(-2),
            active: false,
            expiresAt: null,
          });
    return Response.json({ message: "not found" }, { status: 404 });
  }) as any;
  try {
    const before = (
      await pool.query("SELECT coins FROM users WHERE id=$1", [uid])
    ).rows[0].coins;
    const wrong = await post(
      "/api/platform/links/quiz",
      { username: "old", password: "incorrect" },
      session,
    );
    assert.equal(wrong.status, 400);
    assert.equal(
      (
        await fetch(base + "/api/platform/me", {
          headers: { ...headers, ...session },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await post(
          "/api/platform/links/quiz",
          {
            username: "old",
            password: "proof-password",
            externalUserId: "forged",
          },
          session,
        )
      ).status,
      400,
    );
    for (let n = 0; n < 2; n++)
      assert.equal(
        (
          await post(
            "/api/platform/links/quiz",
            { username: "old", password: "proof-password" },
            session,
          )
        ).status,
        200,
      );
    assert.equal(
      (await pool.query("SELECT coins FROM users WHERE id=$1", [uid])).rows[0]
        .coins,
      before,
    );
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM platform_orders WHERE id=$1",
          [legacyOrder],
        )
      ).rows[0].n,
      1,
    );
    const proxied = await post(
      `/api/platform/owned/${pid}/order/${legacyOrder}/native/course-exams/quiz:legacy/start`,
      {},
      session,
    );
    assert.equal(proxied.status, 200);
    assert.equal(proxySeen, true);
    const history = await fetch(base + `/api/platform/results/${pid}`, {
      headers: { ...headers, ...session },
    });
    assert.equal((await history.json()).attempts[0].id, "historic-result");
    const walletRows = (
      await pool.query(
        "SELECT count(*)::int AS n FROM coin_transactions WHERE user_id=$1",
        [uid],
      )
    ).rows[0].n;
    assert.equal(walletRows, 1);
    const admin = (
      await pool.query(
        "SELECT id FROM users WHERE username='platform_admin_fixture'",
      )
    ).rows[0];
    await assert.rejects(
      () =>
        queuePlatformAction(admin.id, legacyOrder, randomUUID(), {
          action: "refund",
          reason: "Not a coin purchase",
        }),
      (e: any) => e.status === 409,
    );
    await pool.query(
      "INSERT INTO platform_products(id,provider,source_id,kind,title,price_coins,duration_days,max_attempts,demo_ref,source_version,status) VALUES('version-rollback','quiz','quiz:changed','test','Rollback fixture',5,30,1,'sample','v1','published')",
    );
    const purchase = await post(
      "/api/platform/products/version-rollback/purchase",
      { requestKey: randomUUID(), expectedPrice: 5 },
      session,
    );
    assert.equal(purchase.status, 200);
    const order = await purchase.json();
    assert.equal(order.status, "pending");
    assert.equal(
      (await pool.query("SELECT coins FROM users WHERE id=$1", [uid])).rows[0]
        .coins,
      before - 5,
    );
    const action = (
      await pool.query(
        "SELECT * FROM platform_admin_actions WHERE order_id=$1",
        [order.id],
      )
    ).rows[0];
    assert.equal(action.input.automatic, true);
    revokeDown = false;
    await processPlatformAction(action.id);
    await processPlatformAction(action.id);
    await provisionOrder(order.id);
    assert.equal(
      (
        await pool.query("SELECT status FROM platform_orders WHERE id=$1", [
          order.id,
        ])
      ).rows[0].status,
      "refunded",
    );
    assert.equal(
      (await pool.query("SELECT coins FROM users WHERE id=$1", [uid])).rows[0]
        .coins,
      before,
    );
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM coin_transactions WHERE user_id=$1 AND type='product_refund'",
          [uid],
        )
      ).rows[0].n,
      1,
    );
  } finally {
    globalThis.fetch = oldFetch;
    delete process.env.PLATFORM_QUIZ_SECRET;
  }
});

test("archiving a Tube source hides new sales while keeping the purchaser library and published snapshot", async () => {
  const { storage } = await import("../server/storage");
  const source = await storage.getLessonById(lessonId);
  assert.ok(source);
  const nativeGrant = (
    await pool.query(
      "SELECT * FROM lesson_access WHERE user_id=$1 AND lesson_id=$2 LIMIT 1",
      [userId, lessonId],
    )
  ).rows[0];
  assert.ok(nativeGrant);
  await pool.query(
    "UPDATE lesson_access SET revoked_at=NULL,expires_at=now()+interval '1 day' WHERE id=$1",
    [nativeGrant.id],
  );
  try {
    await storage.updateLesson(lessonId, { status: "archived" });
    const h = { ...headers, "x-platform-session": accessToken };
    const library = await (
      await fetch(base + "/api/platform/library", { headers: h })
    ).json();
    assert.ok(library.products.some((p: any) => p.id === productId));
    assert.equal(
      (await fetch(base + "/api/learn/lessons/" + lessonId, { headers: h }))
        .status,
      200,
    );
    const catalog = await (await fetch(base + "/api/platform/catalog")).json();
    assert.ok(!catalog.products.some((p: any) => p.id === productId));
  } finally {
    await pool.query("UPDATE lessons SET status=$2 WHERE id=$1", [
      lessonId,
      source.status,
    ]);
    await pool.query(
      "UPDATE lesson_access SET revoked_at=$2,expires_at=$3 WHERE id=$1",
      [nativeGrant.id, nativeGrant.revoked_at, nativeGrant.expires_at],
    );
  }
});

test("PDF offers publish without quiz sale hooks and keep coin delivery, private ranges and manage payload scoped", async () => {
  const {
    syncProviderCatalog,
    provisionOrder,
    queuePlatformAction,
    processPlatformAction,
  } = await import("../server/marketplace");
  const { finishPlatformLogin } = await import("../server/platform-bridge"),
    { storage } = await import("../server/storage");
  const admin = (await storage.getUserByUsername("platform_admin_fixture"))!,
    nonce = randomBytes(32).toString("base64url"),
    url = new URL((await finishPlatformLogin(admin, nonce))!),
    token = (
      await (
        await post("/api/platform/auth/exchange", {
          code: url.searchParams.get("code"),
          nonce,
        })
      ).json()
    ).token;
  process.env.PLATFORM_QUIZ_SECRET = randomBytes(32).toString("hex");
  const native = globalThis.fetch;
  let saleHook = false,
    rangeSeen = false,
    managed = false;
  const expiresAt = new Date(Date.now() + 86400000).toISOString();
  globalThis.fetch = (async (input: any, init: any) => {
    if (
      !String(input).startsWith("https://web-production-73482.up.railway.app/")
    )
      return native(input, init);
    const p = new URL(String(input)).pathname,
      b = init?.body ? JSON.parse(String(init.body)) : {};
    if (p.endsWith("/catalog"))
      return Response.json({
        products: [
          {
            sourceId: "pdf:contract",
            kind: "pdf",
            title: "PDF contract",
            sourceVersion: "v1",
            demoRef: "pdf:contract",
            readyForSale: true,
            recommendedDurationDays: 30,
            recommendedMaxAttempts: 2,
          },
        ],
      });
    if (p.endsWith("/sale")) {
      saleHook = true;
      return Response.json({ message: "quiz only" }, { status: 400 });
    }
    if (p.endsWith("/demo"))
      return Response.json({ kind: "pdf", pdfPreview: true, previewPages: 1 });
    if (p.endsWith("/grants")) {
      assert.equal(b.kind, "pdf");
      assert.equal(b.maxAttempts, 2);
      return Response.json({ orderId: b.orderId, active: true, expiresAt });
    }
    if (p.endsWith("/manage")) {
      assert.equal(b.kind, "pdf");
      assert.equal(b.sourceId, "pdf:contract");
      managed = true;
      return Response.json({
        orderId: p.split("/").at(-2),
        active: false,
        expiresAt,
      });
    }
    if (p.endsWith("/demo-file")) {
      assert.equal(init.headers["x-platform-user"], undefined);
      assert.equal(init.headers.Range, "bytes=0-4");
      return new Response("%PDF-", {
        status: 206,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Range": "bytes 0-4/10",
          "Content-Length": "5",
          "Accept-Ranges": "bytes",
        },
      });
    }
    if (p.endsWith("/file")) {
      assert.equal(init.headers["x-platform-user"], userId);
      assert.equal(init.headers.Range, "bytes=0-4");
      rangeSeen = true;
      return new Response("%PDF-", {
        status: 206,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Range": "bytes 0-4/10",
          "Content-Length": "5",
          "Accept-Ranges": "bytes",
        },
      });
    }
    return Response.json({ message: "no path" }, { status: 404 });
  }) as typeof fetch;
  try {
    assert.equal((await syncProviderCatalog("quiz")).count, 1);
    const p = (
      await pool.query(
        "SELECT * FROM platform_products WHERE source_id='pdf:contract'",
      )
    ).rows[0];
    const privatePreview = await fetch(
      base + "/api/platform/admin/products/" + p.id + "/preview",
      { headers: { ...headers, "x-platform-session": token } },
    );
    assert.equal(privatePreview.status, 200);
    assert.match(
      (await privatePreview.json()).pdfUrl,
      /platform\/admin\/products\/.+\/demo-file$/,
    );
    const demoFile = await fetch(
      base + "/api/platform/admin/products/" + p.id + "/demo-file",
      {
        headers: {
          ...headers,
          "x-platform-session": token,
          Range: "bytes=0-4",
        },
      },
    );
    assert.equal(demoFile.status, 206);
    assert.equal(await demoFile.text(), "%PDF-");
    assert.match(demoFile.headers.get("cache-control")!, /private.*no-store/);
    const adminCatalog = await (
      await fetch(base + "/api/platform/admin/products", {
        headers: { ...headers, "x-platform-session": token },
      })
    ).json();
    assert.equal(
      adminCatalog.providers.find((v: any) => v.id === "quiz").lastSync.status,
      "ok",
    );
    assert.equal(
      adminCatalog.products.find((v: any) => v.id === p.id).demoRef,
      p.demo_ref,
    );
    const patched = await fetch(base + "/api/platform/admin/products/" + p.id, {
      method: "PATCH",
      headers: { ...headers, "x-platform-session": token },
      body: JSON.stringify({
        title: p.title,
        description: "PDF",
        priceCoins: 1,
        durationDays: 30,
        maxAttempts: 2,
        demoRef: p.demo_ref,
        status: "published",
      }),
    });
    assert.equal(patched.status, 200, await patched.text());
    assert.equal(saleHook, false);
    const demo = await (
      await fetch(base + "/api/platform/products/" + p.id + "/demo")
    ).json();
    assert.match(demo.pdfUrl, /demo-file$/);
    await pool.query("UPDATE users SET coins=GREATEST(coins,5) WHERE id=$1", [
      userId,
    ]);
    const bought = await post(
      "/api/platform/products/" + p.id + "/purchase",
      { requestKey: randomUUID(), expectedPrice: 1 },
      { "x-platform-session": accessToken },
    );
    assert.equal(bought.status, 200);
    const o = await bought.json();
    await provisionOrder(o.id);
    assert.equal(
      (
        await pool.query("SELECT status FROM platform_orders WHERE id=$1", [
          o.id,
        ])
      ).rows[0].status,
      "active",
    );
    const reader = randomUUID(),
      file = await fetch(
        base +
          "/api/platform/owned/" +
          p.id +
          "/order/" +
          o.id +
          "/pdf/" +
          reader +
          "/file",
        {
          headers: {
            ...headers,
            "x-platform-session": accessToken,
            Range: "bytes=0-4",
          },
        },
      );
    assert.equal(file.status, 206, await file.text());
    assert.equal(file.headers.get("content-range"), "bytes 0-4/10");
    assert.equal(rangeSeen, true);
    const a = await queuePlatformAction(admin.id, o.id, randomUUID(), {
      action: "revoke",
      reason: "Contract test",
    });
    await processPlatformAction(a.id);
    assert.equal(managed, true);
  } finally {
    globalThis.fetch = native;
  }
});

test("admin desk reports exact Tashkent date boundaries, keeps UZS separate from coin refunds, and protects private accounts", async () => {
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
  const h = { ...headers, "x-platform-session": token };
  const packageId = (
    await pool.query(
      "INSERT INTO coin_packages(name,coins,price_uzs,is_active) VALUES('Report fixture',100,2000000000,false) RETURNING id",
    )
  ).rows[0].id;
  const ids: string[] = [];
  for (const [status, time] of [
    ["approved", "2024-01-01 19:00:00"],
    ["refunded", "2024-01-02 18:59:59.999999"],
    ["approved", "2024-01-01 18:59:59.999999"],
    ["approved", "2024-01-02 19:00:00"],
    ["rejected", "2024-01-02 10:00:00"],
  ]) {
    const id = randomUUID();
    ids.push(id);
    await pool.query(
      "INSERT INTO payment_orders(id,user_id,package_id,package_name,coins,price_uzs,status,instructions,reviewed_at,expires_at) VALUES($1,$2,$3,'Report fixture',100,2000000000,$4,'{}',$5,now())",
      [id, userId, packageId, status, time],
    );
  }
  await pool.query(
    "INSERT INTO coin_transactions(user_id,amount,type,created_at) VALUES($1,-80,'payment_refund','2024-01-02 10:00:00')",
    [userId],
  );
  const studentHeaders = { ...headers, "x-platform-session": accessToken };
  for (const path of [
    "/api/platform/admin/desk/summary",
    "/api/platform/admin/desk/users",
    "/api/platform/admin/desk/users/" + userId,
    "/api/platform/admin/products/" + productId + "/preview",
  ]) {
    assert.equal(
      (await fetch(base + path, { headers: studentHeaders })).status,
      403,
      path,
    );
  }
  const r = await fetch(
    base + "/api/platform/admin/desk/summary?from=2024-01-02&to=2024-01-02",
    { headers: h },
  );
  assert.equal(r.status, 200, await r.clone().text());
  const report = await r.json();
  assert.equal(report.payment.gross_uzs, "4000000000");
  assert.equal(report.payment.issued_coins, "200");
  assert.equal(
    report.ledger.find((t: any) => t.type === "payment_refund").amount,
    "-80",
  );
  assert.equal(report.cashRefundsTracked, false);
  assert.equal(typeof report.counts.students, "number");
  for (const range of [
    "from=2024-02-30",
    "from=2024-01-03&to=2024-01-02",
    "from=2020-01-01&to=2024-01-01",
  ])
    assert.equal(
      (
        await fetch(base + "/api/platform/admin/desk/summary?" + range, {
          headers: h,
        })
      ).status,
      400,
    );
  const users = await (
    await fetch(base + "/api/platform/admin/desk/users?q=platform_test", {
      headers: h,
    })
  ).json();
  assert.ok(users.users.some((u: any) => u.id === userId));
  assert.equal(users.users[0].password_hash, undefined);
  assert.equal(users.users[0].google_id, undefined);
  const wildcard = await (
    await fetch(base + "/api/platform/admin/desk/users?q=%25", { headers: h })
  ).json();
  assert.equal(wildcard.total, 0);
  const detail = await fetch(
    base + "/api/platform/admin/desk/users/" + userId,
    { headers: h },
  );
  assert.equal(detail.status, 200, await detail.clone().text());
  assert.equal((await detail.json()).user.password_hash, undefined);
  const invalid = await post(
    "/api/platform/admin/desk/validate-lesson",
    { package: {} },
    { "x-platform-session": token },
  );
  assert.equal(invalid.status, 400);
  assert.ok((await invalid.json()).issues.length);
  assert.equal(
    (
      await post(
        "/api/platform/admin/desk/validate-lesson",
        { package: {} },
        { "x-platform-session": accessToken },
      )
    ).status,
    403,
  );
  const preview = await fetch(
    base + "/api/platform/admin/products/" + productId + "/preview",
    { headers: h },
  );
  assert.equal(preview.status, 200, await preview.clone().text());
  assert.match((await preview.json()).youtubeId, /^[\w-]{11}$/);
  await pool.query(
    "DELETE FROM coin_transactions WHERE user_id=$1 AND created_at='2024-01-02 10:00:00'",
    [userId],
  );
  await pool.query("DELETE FROM payment_orders WHERE id=ANY($1::varchar[])", [
    ids,
  ]);
  await pool.query("DELETE FROM coin_packages WHERE id=$1", [packageId]);
});
