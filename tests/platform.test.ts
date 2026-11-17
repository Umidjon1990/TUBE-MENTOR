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
test("saved guides belong to one account, are idempotent and reject invalid identifiers", async () => {
  const extra = { "x-platform-session": accessToken };
  const list = async (h: Record<string, string>) =>
    fetch(base + "/api/platform/guides", { headers: { ...headers, ...h } });
  assert.equal((await list({})).status, 401);
  assert.equal((await post("/api/platform/guides", { guideId: "cefrVocab1" })).status, 401);
  assert.equal((await post("/api/platform/guides", { guideId: "cefrVocab1" }, extra)).status, 200);
  assert.equal((await post("/api/platform/guides", { guideId: "cefrVocab1" }, extra)).status, 200);
  assert.equal((await post("/api/platform/guides", { guideId: "kids1" }, extra)).status, 200);
  for (const bad of ["", "../x", "a b", "1abc", "x".repeat(41)])
    assert.equal((await post("/api/platform/guides", { guideId: bad }, extra)).status, 400, bad);
  const saved = (await (await list(extra)).json()).guides.map((g: any) => g.id);
  assert.deepEqual([...saved].sort(), ["cefrVocab1", "kids1"]);
  const other = await pool.query(
    "INSERT INTO users(full_name,username,password_hash,email_verified) VALUES('Guide other','guide_other','x',true) RETURNING id",
  );
  await pool.query("INSERT INTO platform_saved_guides(user_id,guide_id) VALUES($1,'b1')", [other.rows[0].id]);
  assert.ok(!(await (await list(extra)).json()).guides.some((g: any) => g.id === "b1"));
  const removed = await fetch(base + "/api/platform/guides/kids1", {
    method: "DELETE",
    headers: { ...headers, ...extra },
    body: "{}",
  });
  assert.equal(removed.status, 200);
  assert.equal((await fetch(base + "/api/platform/guides/..%2Fx", { method: "DELETE", headers: { ...headers, ...extra }, body: "{}" })).status, 400);
  assert.deepEqual((await (await list(extra)).json()).guides.map((g: any) => g.id), ["cefrVocab1"]);
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
test("arabictest collections publish free in one step and new tests auto-publish on sync", async () => {
  const { syncProviderCatalog, publishCollection, UNLIMITED_ATTEMPTS } = await import("../server/marketplace");
  process.env.PLATFORM_ARABICTEST_SECRET = randomBytes(32).toString("hex");
  const nativeFetch = globalThis.fetch;
  const item = (sourceId: string, collection: string, extra: any = {}) => ({
    sourceId,
    kind: "test",
    title: sourceId,
    description: "",
    sourceVersion: "v1",
    demoRef: sourceId,
    recommendedMaxAttempts: 2,
    features: { collection, section: "reading", openPractice: false, ...extra },
  });
  let products: any[] = [
    item("test:reading", "milliy"),
    item("test:essay", "milliy", { section: "writing", openPractice: true }),
    item("skill:a1", "daraja"),
  ];
  globalThis.fetch = (async (input: any, init: any) => {
    const url = String(input);
    if (!url.startsWith("https://arabictestuz.up.railway.app/")) return nativeFetch(input, init);
    if (new URL(url).pathname.endsWith("/catalog")) return Response.json({ products });
    return Response.json({}, { status: 404 });
  }) as typeof fetch;
  try {
    assert.equal((await syncProviderCatalog("arabictest")).count, 3);
    const rows = async () =>
      Object.fromEntries(
        (
          await pool.query(
            "SELECT source_id,status,price_coins,duration_days,max_attempts FROM platform_products WHERE provider='arabictest'",
          )
        ).rows.map((r: any) => [r.source_id, r]),
      );
    assert.equal((await rows())["test:reading"].status, "draft");
    const result = await publishCollection("arabictest", "milliy", userId);
    assert.deepEqual(result, { published: 2, skipped: 0, total: 2 });
    const r = await rows();
    assert.equal(r["test:reading"].status, "published");
    assert.equal(r["test:reading"].price_coins, 0);
    assert.equal(r["test:reading"].duration_days, null);
    assert.equal(r["test:reading"].max_attempts, UNLIMITED_ATTEMPTS);
    assert.equal(r["skill:a1"].status, "draft", "boshqa to'plamga tegilmaydi");
    // Avtomatik nashr: yangi kelgan test sinxronlashda o'zi chiqadi.
    await pool.query(
      "INSERT INTO system_settings(key,value) VALUES('collection_autopublish',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      [JSON.stringify({ "arabictest:daraja": true })],
    );
    products = [...products, item("skill:b1", "daraja")];
    await syncProviderCatalog("arabictest");
    const after = await rows();
    assert.equal(after["skill:a1"].status, "published");
    assert.equal(after["skill:b1"].status, "published");
    assert.equal(after["test:reading"].status, "published");
  } finally {
    globalThis.fetch = nativeFetch;
    await pool.query("DELETE FROM system_settings WHERE key='collection_autopublish'");
  }
});
test("arabictest one-click sign-in sends the account identity only in service headers and maps results to products", async () => {
  const { syncProviderCatalog } = await import("../server/marketplace");
  process.env.PLATFORM_ARABICTEST_SECRET = randomBytes(32).toString("hex");
  const nativeFetch = globalThis.fetch;
  const calls: { path: string; user: string | null; key: string | null; body?: any }[] = [];
  globalThis.fetch = (async (input: any, init: any) => {
    const url = String(input);
    if (!url.startsWith("https://arabictestuz.up.railway.app/")) return nativeFetch(input, init);
    const path = new URL(url).pathname.replace("/api/platform/", "");
    const h = new Headers(init?.headers);
    calls.push({ path, user: h.get("x-platform-user"), key: h.get("x-platform-key"), body: init?.body ? JSON.parse(init.body) : undefined });
    if (path === "catalog")
      return Response.json({
        products: [
          {
            sourceId: "test:sso1",
            kind: "test",
            title: "SSO test",
            description: "",
            sourceVersion: "v1",
            demoRef: "test:sso1",
            recommendedMaxAttempts: 2,
            features: { collection: "sso", takeUrl: "https://arabictestuz.up.railway.app/reading-test/sso1", takePath: "/reading-test/sso1" },
          },
        ],
      });
    if (path === "student-sso") return Response.json({ code: "c".repeat(43), expiresIn: 120 });
    if (path === "student-results")
      return Response.json({
        results: [
          { id: "test:a1", testId: "sso1", title: "SSO test", type: "reading", status: "completed", score: 8, maxScore: 10, level: "B1", at: "2026-11-12T10:00:00Z" },
          { id: "test:a2", testId: "zzz", title: "Boshqa", type: "writing", status: "grading", score: null, maxScore: null, level: null, at: "2026-11-11T10:00:00Z" },
        ],
      });
    return Response.json({}, { status: 404 });
  }) as typeof fetch;
  try {
    await syncProviderCatalog("arabictest");
    const productId = (
      await pool.query("UPDATE platform_products SET status='published' WHERE provider='arabictest' AND source_id='test:sso1' RETURNING id")
    ).rows[0].id;
    const login = await (await post("/api/platform/auth/password", { username: "platform_test", password })).json();
    const session = { "x-platform-session": login.token };
    assert.equal((await post("/api/platform/arabictest/start", { productId })).status, 401);
    const start = await post(
      "/api/platform/arabictest/start",
      { productId, returnUrl: "https://www.zamonaviytalim.uz/testlar/milliy" },
      session,
    );
    assert.equal(start.status, 200);
    const url = new URL((await start.json()).url);
    assert.equal(url.origin + url.pathname, "https://arabictestuz.up.railway.app/zt-kirish");
    assert.equal(url.searchParams.get("next"), "/reading-test/sso1");
    assert.equal(url.searchParams.get("zt_return"), "https://www.zamonaviytalim.uz/testlar/milliy");
    assert.equal(url.searchParams.get("code"), "c".repeat(43));
    const sso = calls.find((c) => c.path === "student-sso")!;
    assert.equal(sso.user, userId);
    assert.equal(sso.key, process.env.PLATFORM_ARABICTEST_SECRET);
    assert.equal(sso.body.fullName, "Platform test");
    assert.equal(
      (await post("/api/platform/arabictest/start", { productId: "missing" }, session)).status,
      404,
    );
    const results = await fetch(base + "/api/platform/arabictest/results", { headers: { ...headers, ...session } });
    assert.equal(results.status, 200);
    const list = (await results.json()).results;
    assert.equal(list.length, 2);
    assert.deepEqual(
      { score: list[0].score, maxScore: list[0].maxScore, productId: list[0].productId, status: list[0].status },
      { score: 8, maxScore: 10, productId, status: "completed" },
    );
    assert.equal(list[1].status, "grading");
    assert.equal(list[1].productId, null);
    assert.equal(calls.find((c) => c.path === "student-results")!.user, userId);
  } finally {
    globalThis.fetch = nativeFetch;
  }
});
test("mini-tests list, hide answers, check on the server and never trigger paid audio generation", async () => {
  const { resetMiniTestCache, weekStart } = await import("../server/mini-tests");
  resetMiniTestCache();
  process.env.PLATFORM_OBHAVO_SECRET = randomBytes(32).toString("hex");
  const nativeFetch = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = (async (input: any, init: any) => {
    const url = String(input);
    if (!url.startsWith("https://web-production-d1f0.up.railway.app/")) return nativeFetch(input, init);
    const path = new URL(url).pathname;
    seen.push(path + (new Headers(init?.headers).get("x-platform-key") === process.env.PLATFORM_OBHAVO_SECRET ? "#key" : ""));
    if (path === "/api/platform/mini-tests")
      return Response.json({
        tests: [
          { id: "l1", type: "listening", level: "A1A2", titleAr: "ع", titleUz: "Tinglash", testDate: "2026-11-12", hasAudio: true },
          { id: "l2", type: "listening", level: "B1B2", titleAr: "ع", titleUz: "Audiosiz", testDate: "2026-11-10", hasAudio: false },
          { id: "r1", type: "reading", level: "B1B2", titleAr: "ع", titleUz: "O'qish", testDate: "2026-11-03", hasAudio: false },
          { id: "../x", type: "reading", level: "A1A2", titleAr: "", titleUz: "", testDate: "2026-11-01" },
        ],
      });
    if (path === "/api/platform/mini-tests/r1")
      return Response.json({
        test: {
          id: "r1",
          type: "reading",
          level: "B1B2",
          paragraphsAr: ["نص"],
          questions: [{ question: "س", options: ["a", "b", "c", "d"], correctIndex: 3, explanation: "izoh" }],
        },
      });
    if (path === "/api/tests/l1/audio") return new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "audio/mpeg" } });
    return Response.json({}, { status: 404 });
  }) as typeof fetch;
  try {
    assert.equal(weekStart("2026-11-13"), "2026-11-09");
    assert.equal(weekStart("2026-11-09"), "2026-11-09");
    assert.equal(weekStart("2026-11-08"), "2026-11-02");
    const list = await (await fetch(base + "/api/platform/mini/tests", { headers })).json();
    assert.equal(list.tests.length, 3, "noto'g'ri identifikatorli test tashlab yuboriladi");
    assert.equal(list.latestWeek, "2026-11-09");
    assert.deepEqual(list.tests.map((t: any) => t.isNew), [true, true, false]);
    const one = await (await fetch(base + "/api/platform/mini/tests/r1", { headers })).json();
    assert.equal(one.test.questions[0].correctIndex, undefined);
    assert.equal(one.test.questions[0].explanation, undefined);
    const wrong = await (await post("/api/platform/mini/tests/r1/check", { question: 0, choice: 1 })).json();
    assert.deepEqual(wrong, { correct: false, correctIndex: 3, explanation: "izoh" });
    assert.equal((await (await post("/api/platform/mini/tests/r1/check", { question: 0, choice: 3 })).json()).correct, true);
    assert.equal((await post("/api/platform/mini/tests/r1/check", { question: 5, choice: 0 })).status, 400);
    const audio = await fetch(base + "/api/platform/mini/tests/l1/audio", { headers });
    assert.equal(audio.status, 200);
    assert.deepEqual([...new Uint8Array(await audio.arrayBuffer())], [1, 2, 3]);
    assert.equal((await fetch(base + "/api/platform/mini/tests/l2/audio", { headers })).status, 404);
    assert.equal(seen.filter((p) => p.startsWith("/api/tests/l2")).length, 0, "audiosiz test uchun ovoz yaratilmaydi");
    assert.ok(seen.includes("/api/platform/mini-tests#key"));
    assert.equal((await fetch(base + "/api/platform/mini/tests/..%2Fx", { headers })).status, 404);
  } finally {
    globalThis.fetch = nativeFetch;
    resetMiniTestCache();
  }
});
test("mini-test folders track new tests per student and queue one Telegram message for linked subscribers", async () => {
  const { resetMiniTestCache, recordNewTests, folderMatches, folderTitle } = await import("../server/mini-tests");
  const { miniTestsMessage } = await import("../server/payment-bot");
  resetMiniTestCache();
  process.env.PLATFORM_OBHAVO_SECRET = randomBytes(32).toString("hex");
  await pool.query("DELETE FROM mini_known_tests");
  const nativeFetch = globalThis.fetch;
  const t = (id: string, type: string, level: string) => ({ id, type, level, titleAr: "ع", titleUz: "Test " + id, testDate: "2026-11-12", hasAudio: true });
  let tests = [t("a1", "listening", "A1A2"), t("b1", "reading", "B1B2")];
  globalThis.fetch = (async (input: any, init: any) => {
    const url = String(input);
    if (!url.startsWith("https://web-production-d1f0.up.railway.app/")) return nativeFetch(input, init);
    return Response.json({ tests });
  }) as typeof fetch;
  try {
    assert.equal(folderMatches("A1A2-listening", { type: "listening", level: "A1A2" }), true);
    assert.equal(folderMatches("A1A2-listening", { type: "reading", level: "A1A2" }), false);
    assert.equal(folderMatches("reading", { type: "reading", level: "B1B2" }), true);
    assert.equal(folderTitle("B1B2-reading"), "B1/B2 · O‘qish");
    const login = await (await post("/api/platform/auth/password", { username: "platform_test", password })).json();
    const session = { ...headers, "x-platform-session": login.token };
    assert.equal((await fetch(base + "/api/platform/mini/folders", { headers })).status, 401);
    // Birinchi sinxronlash: mavjud testlar eski hisoblanadi, xabar yuborilmaydi.
    await (await fetch(base + "/api/platform/mini/tests", { headers })).json();
    await new Promise((r) => setTimeout(r, 50));
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM mini_known_tests")).rows[0].n, 2);
    assert.equal((await post("/api/platform/mini/folders", { folder: "../x" }, session)).status, 400);
    assert.equal((await post("/api/platform/mini/folders", { folder: "A1A2-listening" }, session)).status, 200);
    assert.equal((await post("/api/platform/mini/folders", { folder: "A1A2-listening" }, session)).status, 200, "takror qo'shish xato bermaydi");
    await pool.query("INSERT INTO telegram_bot_links(user_id,telegram_user_id,chat_id) VALUES($1,'777001','777001') ON CONFLICT DO NOTHING", [userId]);
    let view = await (await fetch(base + "/api/platform/mini/folders", { headers: session })).json();
    assert.equal(view.folders.length, 1);
    assert.deepEqual([view.folders[0].total, view.folders[0].fresh, view.fresh, view.telegramLinked], [1, 0, 0, true]);
    // Yangi testlar keldi: biri papkaga mos, biri emas.
    await new Promise((r) => setTimeout(r, 20));
    tests = [...tests, t("a2", "listening", "A1A2"), t("b2", "reading", "B1B2")];
    resetMiniTestCache();
    await fetch(base + "/api/platform/mini/tests", { headers });
    await new Promise((r) => setTimeout(r, 80));
    view = await (await fetch(base + "/api/platform/mini/folders", { headers: session })).json();
    assert.deepEqual([view.folders[0].total, view.folders[0].fresh, view.folders[0].freshIds[0], view.fresh], [2, 1, "a2", 1]);
    const queued = (await pool.query("SELECT payload FROM notification_outbox WHERE kind='mini_new_tests'")).rows;
    assert.equal(queued.length, 1);
    assert.equal(queued[0].payload.count, 1);
    assert.match(miniTestsMessage(queued[0].payload), /1 ta yangi test[\s\S]*Test a2 \(Tinglash, A1\/A2\)/);
    // Qayta sinxronlash yangi xabar qo'shmaydi.
    assert.deepEqual(await recordNewTests(tests as any), []);
    assert.equal((await post("/api/platform/mini/folders/A1A2-listening/seen", {}, session)).status, 200);
    view = await (await fetch(base + "/api/platform/mini/folders", { headers: session })).json();
    assert.equal(view.fresh, 0);
    const del = await fetch(base + "/api/platform/mini/folders/A1A2-listening", { method: "DELETE", headers: session, body: "{}" });
    assert.equal(del.status, 200);
    assert.equal((await (await fetch(base + "/api/platform/mini/folders", { headers: session })).json()).folders.length, 0);
  } finally {
    globalThis.fetch = nativeFetch;
    resetMiniTestCache();
    await pool.query("DELETE FROM notification_outbox WHERE kind='mini_new_tests'");
    await pool.query("DELETE FROM telegram_bot_links WHERE user_id=$1", [userId]);
  }
});
test("classroom: invite, approval, scheduled unlock, shuffled quiz with hidden answers, retake limit and ranking", async () => {
  const { hashPassword } = await import("../server/auth");
  const adminPass = randomBytes(24).toString("hex");
  await pool.query(
    "INSERT INTO users(full_name,username,password_hash,email_verified,role) VALUES('Teacher','cls_teacher',$1,true,'admin')",
    [hashPassword(adminPass)],
  );
  const adminLogin = await (await post("/api/platform/auth/password", { username: "cls_teacher", password: adminPass })).json();
  const T = { "x-platform-session": adminLogin.token };
  const studentLogin = await (await post("/api/platform/auth/password", { username: "platform_test", password })).json();
  const S = { "x-platform-session": studentLogin.token };
  const get = async (path: string, extra: Record<string, string>) => fetch(base + "/api/platform/class" + path, { headers: { ...headers, ...extra } });
  const call = (path: string, body: unknown, extra: Record<string, string>, method = "POST") =>
    fetch(base + "/api/platform/class" + path, { method, headers: { ...headers, ...extra }, body: JSON.stringify(body) });

  assert.equal((await call("/admin/courses", { title: "A1" }, S)).status, 403, "o'quvchi kurs yarata olmaydi");
  const course = (await (await call("/admin/courses", { title: "A1 arab tili", level: "A1" }, T)).json()).course;
  const l1 = (await (await call(`/admin/courses/${course.id}/lessons`, { title: "1-dars" }, T)).json()).lesson;
  const l2 = (await (await call(`/admin/courses/${course.id}/lessons`, { title: "2-dars" }, T)).json()).lesson;
  assert.equal(l2.position, 2);
  assert.equal((await call(`/admin/lessons/${l1.id}/quiz`, { questions: [{ q: "س1", options: ["a", "b"], correct: 5 }] }, T, "PUT")).status, 400);
  const questions = [
    { q: "ما اسمك؟", options: ["أحمد", "كتاب", "قلم"], correct: 0, explanation: "Ism so'raladi" },
    { q: "أين البيت؟", options: ["هناك", "أمس"], correct: 0 },
  ];
  assert.equal((await call(`/admin/lessons/${l1.id}/quiz`, { questions, maxAttempts: 2 }, T, "PUT")).status, 200);
  const group = (await (await call("/admin/groups", { courseId: course.id, name: "1-guruh" }, T)).json()).group;
  const past = new Date(Date.now() - 3600e3).toISOString(), future = new Date(Date.now() + 86400e3).toISOString();
  await call(`/admin/groups/${group.id}/schedule`, { items: [{ lessonId: l1.id, opensAt: past, dueAt: future }, { lessonId: l2.id, opensAt: past, dueAt: null }] }, T, "PUT");

  // Taklif havolasi: ochiq ma'lumot, qo'shilish tasdiqni kutadi.
  const invite = await (await get(`/invite/${group.invite_code}`, {})).json();
  assert.equal(invite.group.name, "1-guruh");
  assert.equal((await call(`/invite/${group.invite_code}/join`, { phone: "+998 90 123 45 67", name: "Aziza" }, {})).status, 401);
  assert.equal((await call(`/invite/${group.invite_code}/join`, { phone: "12", name: "Aziza" }, S)).status, 400);
  const joined = await (await call(`/invite/${group.invite_code}/join`, { phone: "+998 90 123 45 67", name: "Aziza" }, S)).json();
  assert.equal(joined.status, "pending");
  assert.equal((await get(`/groups/${group.id}/lessons`, S)).status, 403);
  assert.equal((await call(`/admin/groups/${group.id}/members/${userId}`, { action: "approve" }, T)).status, 200);
  assert.equal((await (await get("/my", S)).json()).groups[0].status, "active");

  let lessons = (await (await get(`/groups/${group.id}/lessons`, S)).json()).lessons;
  assert.deepEqual(lessons.map((l: any) => [l.unlocked, l.reason]), [[true, "open"], [false, "previous"]]);
  assert.equal((await get(`/groups/${group.id}/lessons/${l2.id}`, S)).status, 403);

  // 1-urinish: savollarda to'g'ri javob yo'q; xato javob → javoblar ochilmaydi.
  const a1 = await (await call(`/groups/${group.id}/lessons/${l1.id}/attempts`, {}, S)).json();
  assert.equal(a1.questions.length, 2);
  assert.equal(JSON.stringify(a1.questions).includes("correct"), false);
  const layout1 = (await pool.query("SELECT layout FROM cls_attempts WHERE id=$1", [a1.attemptId])).rows[0].layout;
  const wrong = layout1.map((l: any) => l.o.findIndex((orig: number) => orig !== questions[l.q].correct));
  const r1 = await (await call(`/attempts/${a1.attemptId}/submit`, { answers: wrong }, S)).json();
  assert.deepEqual([r1.percent, r1.passed, r1.review], [0, false, null]);
  assert.equal((await call(`/attempts/${a1.attemptId}/submit`, { answers: wrong }, S)).status, 409);

  // 2-urinish: to'g'ri → o'tdi, izohlar ko'rinadi, keyingi dars ochildi.
  const a2 = await (await call(`/groups/${group.id}/lessons/${l1.id}/attempts`, {}, S)).json();
  const layout2 = (await pool.query("SELECT layout FROM cls_attempts WHERE id=$1", [a2.attemptId])).rows[0].layout;
  const right = layout2.map((l: any) => l.o.indexOf(questions[l.q].correct));
  const r2 = await (await call(`/attempts/${a2.attemptId}/submit`, { answers: right }, S)).json();
  assert.deepEqual([r2.percent, r2.passed, r2.review.length], [100, true, 2]);
  assert.equal((await call(`/groups/${group.id}/lessons/${l1.id}/attempts`, {}, S)).status, 409, "urinishlar tugadi");
  lessons = (await (await get(`/groups/${group.id}/lessons`, S)).json()).lessons;
  assert.deepEqual(lessons.map((l: any) => l.unlocked), [true, true]);

  const home = await (await get(`/groups/${group.id}/home`, S)).json();
  assert.equal(home.progress.done, 2);
  const results = await (await get(`/groups/${group.id}/results`, S)).json();
  assert.deepEqual([results.me.rank, results.me.points, results.leaderboard[0].me], [1, 100, true]);
  const book = await (await get(`/admin/groups/${group.id}/gradebook`, T)).json();
  assert.equal(book.cells.find((c: any) => c.user_id === userId).value, 100);

  // Avtomatik jadval: dushanbadan, dush/chor/juma kunlari.
  const auto = await (await call(`/admin/groups/${group.id}/schedule`, { auto: { startDate: "2026-11-16", weekdays: [1, 3, 5], openTime: "09:00", dueHours: 48 } }, T, "PUT")).json();
  assert.deepEqual(auto.items.map((i: any) => i.opensAt), ["2026-11-16T04:00:00.000Z", "2026-11-18T04:00:00.000Z"]);
  assert.equal((await call(`/admin/lessons/${l1.id}`, {}, T, "DELETE")).status, 409, "natijasi bor dars o'chmaydi");
});

test("classroom live: chat permissions, Zoom join and recording import, recitation AI check and notifications", async () => {
  const { hashPassword } = await import("../server/auth");
  const { createHmac } = await import("node:crypto");
  const { Readable } = await import("node:stream");
  const { setZoomTransport } = await import("../server/classroom-zoom");
  const { setClassStore } = await import("../server/class-storage");
  const { setTranscriber, compareRecitation } = await import("../server/classroom-tasks");
  const { setPushSender, processClassNotices, quietDelaySeconds } = await import("../server/classroom-notify");
  const mk = async (username: string, role = "student") => {
    const pass = randomBytes(24).toString("hex");
    await pool.query("INSERT INTO users(full_name,username,password_hash,email_verified,role) VALUES($1,$1,$2,true,$3)", [username, hashPassword(pass), role]);
    const login = await (await post("/api/platform/auth/password", { username, password: pass })).json();
    const id = (await pool.query("SELECT id FROM users WHERE username=$1", [username])).rows[0].id;
    return { h: { "x-platform-session": login.token }, id };
  };
  const T = await mk("live_teacher", "admin"), S = await mk("live_student"), P = await mk("live_peer");
  const get = async (path: string, extra: Record<string, string>) => fetch(base + "/api/platform/class" + path, { headers: { ...headers, ...extra } });
  const call = (path: string, body: unknown, extra: Record<string, string>, method = "POST") =>
    fetch(base + "/api/platform/class" + path, { method, headers: { ...headers, ...extra }, body: JSON.stringify(body) });

  const course = (await (await call("/admin/courses", { title: "Jonli kurs" }, T.h)).json()).course;
  const lesson = (await (await call(`/admin/courses/${course.id}/lessons`, { title: "Yodlash darsi" }, T.h)).json()).lesson;
  const group = (await (await call("/admin/groups", { courseId: course.id, name: "Kechki guruh" }, T.h)).json()).group;
  await call(`/admin/groups/${group.id}`, { autoApprove: true }, T.h, "PATCH");
  await call(`/admin/groups/${group.id}/schedule`, { items: [{ lessonId: lesson.id, opensAt: new Date(Date.now() - 60000).toISOString(), dueAt: null }] }, T.h, "PUT");
  for (const u of [S, P]) assert.equal((await (await call(`/invite/${group.invite_code}/join`, { phone: "+998901112233", name: u === S ? "Ali" : "Vali" }, u.h)).json()).status, "active");

  /* ---------- Chat ---------- */
  const outbox = async () => (await pool.query("SELECT payload FROM notification_outbox WHERE kind='class_notice'")).rows.map((r: any) => r.payload);
  const before = (await outbox()).length;
  assert.equal((await call(`/groups/${group.id}/chat`, { body: "Assalomu alaykum" }, S.h)).status, 200);
  assert.equal((await outbox()).length, before, "o'quvchining guruh xabari hammaga bildirishnoma yubormaydi");
  const tmsg = (await (await call(`/groups/${group.id}/chat`, { body: "Bugun soat 19:00 da dars" }, T.h)).json()).message;
  assert.equal(tmsg.teacher, true);
  assert.deepEqual((await outbox()).slice(before).map((p: any) => p.userId).sort(), [S.id, P.id].sort());
  assert.equal((await (await get(`/groups/${group.id}/chat/unread`, P.h)).json()).unread, 2);
  const feed = await (await get(`/groups/${group.id}/chat`, P.h)).json();
  assert.deepEqual(feed.messages.map((m: any) => m.body), ["Assalomu alaykum", "Bugun soat 19:00 da dars"]);
  assert.equal((await (await get(`/groups/${group.id}/chat/unread`, P.h)).json()).unread, 0);
  assert.equal((await (await get(`/groups/${group.id}/chat?after=${tmsg.id}`, P.h)).json()).messages.length, 0);

  assert.equal((await call(`/groups/${group.id}/chat`, { body: "Salom", to: P.id }, S.h)).status, 403, "guruhdoshga yozish yopiq");
  assert.equal((await call(`/groups/${group.id}/chat`, { body: "Ustoz, savol bor", to: T.id }, S.h)).status, 200);
  const threads = await (await get(`/groups/${group.id}/chat/threads`, S.h)).json();
  assert.deepEqual(threads.people.map((p: any) => [p.name, p.teacher]), [["live_teacher", true]]);
  const tThreads = await (await get(`/groups/${group.id}/chat/threads`, T.h)).json();
  assert.equal(tThreads.people.find((p: any) => p.userId === S.id).unread, 1);

  await call(`/admin/groups/${group.id}`, { allowPeerDm: true }, T.h, "PATCH");
  const dm = (await (await call(`/groups/${group.id}/chat`, { body: "Salom, Vali", to: P.id }, S.h)).json()).message;
  assert.equal((await (await get(`/groups/${group.id}/chat?with=${S.id}`, P.h)).json()).messages[0].body, "Salom, Vali");
  assert.equal((await get(`/groups/${group.id}/chat?with=${S.id}`, T.h)).status, 200);
  assert.equal((await (await get(`/groups/${group.id}/chat?with=${S.id}`, T.h)).json()).messages.length, 1, "o'qituvchi faqat o'z suhbatini ko'radi");
  assert.equal((await call(`/messages/${dm.id}/report`, {}, P.h)).status, 200);
  assert.equal((await call(`/groups/${group.id}/block`, { userId: S.id, blocked: true }, P.h)).status, 200);
  assert.equal((await call(`/groups/${group.id}/chat`, { body: "Yana salom", to: P.id }, S.h)).status, 403, "bloklangan");
  assert.equal((await call(`/groups/${group.id}/block`, { userId: T.id, blocked: true }, P.h)).status, 400);
  const reports = await (await get(`/groups/${group.id}/chat/reports`, T.h)).json();
  assert.deepEqual(reports.reports.map((r: any) => [r.body, r.reports]), [["Salom, Vali", 1]]);
  assert.equal((await get(`/groups/${group.id}/chat/reports`, S.h)).status, 403);
  assert.equal((await call(`/messages/${tmsg.id}`, {}, S.h, "DELETE")).status, 403);
  assert.equal((await call(`/messages/${dm.id}`, {}, T.h, "DELETE")).status, 200);
  assert.equal((await (await get(`/groups/${group.id}/chat?with=${P.id}`, S.h)).json()).messages[0].deleted, true);
  await call(`/admin/groups/${group.id}/members/${S.id}`, { action: "mute", hours: 1 }, T.h);
  const muted = await call(`/groups/${group.id}/chat`, { body: "?" }, S.h);
  assert.equal(muted.status, 403);
  assert.equal((await (await get(`/groups/${group.id}/chat`, S.h)).json()).canSend, false);
  await call(`/admin/groups/${group.id}/members/${S.id}`, { action: "unmute" }, T.h);

  /* ---------- Zoom ---------- */
  Object.assign(process.env, { ZOOM_ACCOUNT_ID: "acc", ZOOM_CLIENT_ID: "cid", ZOOM_CLIENT_SECRET: "csecret", ZOOM_SDK_KEY: "sdkkey", ZOOM_SDK_SECRET: "sdksecret", ZOOM_WEBHOOK_SECRET: "whsecret" });
  const zoomCalls: string[] = [];
  let meetingNo = 900000000;
  setZoomTransport({
    api: async (method, path, body: any) => {
      zoomCalls.push(`${method} ${path}`);
      if (method === "POST" && path === "/users/me/meetings") {
        assert.equal(body.settings.auto_recording, "cloud");
        return { id: ++meetingNo, password: body.password, join_url: `https://zoom.us/j/${meetingNo}` };
      }
      if (path.startsWith("/users/me/token")) return { token: "zak-token" };
      return {};
    },
    download: async () => ({ stream: Readable.from([Buffer.from("MP4DATA")]), length: 7, type: "video/mp4" }),
  });
  const blobs = new Map<string, Buffer>();
  setClassStore({
    put: async (k, d) => void blobs.set(k, d),
    get: async (k) => (blobs.has(k) ? { data: blobs.get(k)!, mime: "audio/webm" } : null),
    remove: async (k) => void blobs.delete(k),
    putStream: async (k, stream) => {
      const parts: Buffer[] = [];
      for await (const c of stream) parts.push(Buffer.from(c));
      blobs.set(k, Buffer.concat(parts));
    },
    url: (k) => `https://bucket.example/${k}?signed`,
  });
  const later = (await (await call(`/admin/groups/${group.id}/live`, { title: "Kelasi dars", startsAt: new Date(Date.now() + 2 * 3600e3).toISOString(), durationMinutes: 60 }, T.h)).json()).session;
  assert.equal((await call(`/live/${later.id}/join`, {}, S.h)).status, 409, "15 daqiqadan oldin kirib bo'lmaydi");
  const now = (await (await call(`/admin/groups/${group.id}/live`, { title: "Hozirgi dars", startsAt: new Date(Date.now() + 5 * 60000).toISOString(), durationMinutes: 45, lessonId: lesson.id }, T.h)).json()).session;
  const join = await (await call(`/live/${now.id}/join`, {}, S.h)).json();
  const [h, b, sig] = join.signature.split(".");
  assert.equal(createHmac("sha256", "sdksecret").update(`${h}.${b}`).digest("base64url"), sig);
  const claims = JSON.parse(Buffer.from(b, "base64url").toString());
  assert.deepEqual([claims.appKey, claims.mn, claims.role], ["sdkkey", join.meetingNumber, 0]);
  assert.equal(join.userName, "Ali");
  assert.equal((await call(`/live/${now.id}/join`, {}, { "x-platform-session": "bad" })).status, 401);
  const start = await (await call(`/admin/live/${now.id}/start`, {}, T.h)).json();
  assert.deepEqual([start.zak, JSON.parse(Buffer.from(start.signature.split(".")[1], "base64url").toString()).role], ["zak-token", 1]);
  const listed = await (await get(`/groups/${group.id}/live`, P.h)).json();
  assert.deepEqual(listed.upcoming.map((s: any) => [s.title, s.canJoin]), [["Hozirgi dars", true], ["Kelasi dars", false]]);
  const att = await (await get(`/admin/live/${now.id}/attendance`, T.h)).json();
  assert.deepEqual(att.people.filter((p: any) => p.joined_at).map((p: any) => p.name), ["Ali"]);

  const hook = async (payload: any, valid = true) => {
    const raw = JSON.stringify(payload);
    const ts = String(Math.floor(Date.now() / 1000));
    const signature = "v0=" + createHmac("sha256", valid ? "whsecret" : "nope").update(`v0:${ts}:${raw}`).digest("hex");
    return fetch(base + "/api/zoom/webhook", { method: "POST", headers: { "Content-Type": "application/json", "x-zm-request-timestamp": ts, "x-zm-signature": signature }, body: raw });
  };
  const validation = await (await hook({ event: "endpoint.url_validation", payload: { plainToken: "abc" } }, false)).json();
  assert.equal(validation.encryptedToken, createHmac("sha256", "whsecret").update("abc").digest("hex"));
  assert.equal((await hook({ event: "meeting.started", payload: { object: { id: join.meetingNumber } } }, false)).status, 401);
  await hook({ event: "meeting.started", payload: { object: { id: Number(join.meetingNumber), uuid: "u/1==" } } });
  assert.equal((await pool.query("SELECT status FROM cls_live_sessions WHERE id=$1", [now.id])).rows[0].status, "live");
  await hook({ event: "meeting.ended", payload: { object: { id: Number(join.meetingNumber), uuid: "u/1==" } } });
  await hook({
    event: "recording.completed",
    download_token: "dl",
    payload: { object: { id: Number(join.meetingNumber), uuid: "u/1==", recording_files: [{ file_type: "M4A", download_url: "https://zoom/a" }, { file_type: "MP4", recording_type: "active_speaker", download_url: "https://zoom/v", file_size: 7 }] } },
  });
  for (let i = 0; i < 100 && !zoomCalls.some((c) => c.endsWith("recordings?action=trash")); i++) await new Promise((r) => setTimeout(r, 20));
  assert.equal((await pool.query("SELECT recording_state FROM cls_live_sessions WHERE id=$1", [now.id])).rows[0].recording_state, "ready");
  assert.equal(blobs.get(`class/recordings/${group.id}/${now.id}.mp4`)?.toString(), "MP4DATA");
  assert.ok(zoomCalls.includes("DELETE /meetings/u%2F1%3D%3D/recordings?action=trash"), "Zoom nusxasi savatga");
  const rec = await (await get(`/live/${now.id}/recording`, P.h)).json();
  assert.match(rec.url, /^https:\/\/bucket\.example\/class\/recordings\//);
  assert.equal((await call(`/admin/live/${later.id}`, {}, T.h, "DELETE")).status, 200);
  assert.ok(zoomCalls.includes(`DELETE /meetings/${meetingNo - 1}`));

  /* ---------- Yodlash vazifasi ---------- */
  const text = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ الْحَمْدُ لِلَّهِ";
  assert.deepEqual(compareRecitation(text, "بسم الله الرحمن الرحيم الحمد لله").percent, 100);
  assert.equal(compareRecitation(text, "بسم الله الرحيم الحمد لله").percent, 83);
  const task = (await (await call(`/admin/lessons/${lesson.id}/tasks`, { title: "Basmalani yodlang", textAr: text, maxSeconds: 60, maxScore: 10 }, T.h)).json()).task;
  assert.deepEqual([task.proctor, task.pass_percent], ["required", 80]);
  const words = (list: string[], gapAfter = -1) => {
    let t = 0;
    return list.map((word, i) => ({ word, start: (t += i === gapAfter + 1 && gapAfter >= 0 ? 3.5 : 0.2), end: (t += 0.5) }));
  };
  setTranscriber(async () => ({ text: "بسم الله الرحيم الحمد لله", words: words(["بسم", "الله", "الرحيم", "الحمد", "لله"], 2) }));
  const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), randomBytes(400)]);
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(300)]);
  const good = { enabled: true, supported: true, duration: 12, awaySeconds: 1.6, noFaceSeconds: 0, multiSeconds: 0, events: [{ t: 4, kind: "side", seconds: 1.6 }] };
  const submit = (extra: any) => call(`/groups/${group.id}/tasks/${task.id}/submit`, { audio: webm.toString("base64"), mime: "audio/webm", seconds: 12, ...extra }, S.h);
  assert.equal((await call(`/groups/${group.id}/tasks/${task.id}/submit`, { audio: randomBytes(300).toString("base64"), mime: "audio/webm", seconds: 5, proctor: good }, S.h)).status, 415);
  assert.equal((await submit({ seconds: 200, proctor: good })).status, 400);
  assert.equal((await submit({})).status, 400, "kamerasiz qabul qilinmaydi");
  const cheat = await submit({ proctor: { ...good, awaySeconds: 6, events: [1, 4, 8].map((t) => ({ t, kind: "down", seconds: 2 })) } });
  assert.equal(cheat.status, 422);
  assert.match((await cheat.json()).message, /Qayta yozing: 3 marta kameraga qaralmadi/);
  const sub = await (await submit({ proctor: good, snapshots: [jpeg.toString("base64")] })).json();
  // 83% to'g'ri, 1 ta uzun to'xtalish (jarimasiz, 2 tagacha), 1 ta kamera ogohlantirishi (−5) → 78% → 8 ball, o'tmadi (80%)
  assert.deepEqual([sub.auto, sub.aiPercent, sub.finalPercent, sub.score, sub.passed, sub.pauses, sub.warnings, sub.attemptsLeft], [true, 83, 78, 8, false, 1, 1, 4]);
  setTranscriber(async () => ({ text: "بسم الله الرحمن الرحيم الحمد لله", words: words(["بسم", "الله", "الرحمن", "الرحيم", "الحمد", "لله"]) }));
  const sub2 = await (await submit({ proctor: { ...good, awaySeconds: 0, events: [] } })).json();
  assert.deepEqual([sub2.finalPercent, sub2.score, sub2.passed, sub2.attemptsLeft], [100, 10, true, 3]);
  assert.equal((await get(`/submissions/${sub.id}/audio`, P.h)).status, 404, "boshqa o'quvchi eshita olmaydi");
  assert.equal(Buffer.from(await (await get(`/submissions/${sub.id}/audio`, S.h)).arrayBuffer()).length, webm.length);
  assert.equal((await get(`/submissions/${sub.id}/snap/0`, S.h)).status, 404, "kamera suratini faqat o'qituvchi ko'radi");
  assert.equal(Buffer.from(await (await get(`/submissions/${sub.id}/snap/0`, T.h)).arrayBuffer()).length, jpeg.length);
  assert.equal((await get(`/groups/${group.id}/review`, S.h)).status, 403);
  const graded = await (await get(`/groups/${group.id}/review?status=graded`, T.h)).json();
  assert.deepEqual(graded.items.map((i: any) => [i.name, i.final_percent, i.score, i.auto]), [["Ali", 100, 10, true], ["Ali", 78, 8, true]]);
  assert.equal((await (await get(`/groups/${group.id}/review?status=rejected`, T.h)).json()).items.length, 1);
  assert.equal((await (await get(`/groups/${group.id}/review`, T.h)).json()).waiting, 0, "o'qituvchi qo'lda tekshirishi shart emas");
  let res = await (await get(`/groups/${group.id}/results`, S.h)).json();
  assert.deepEqual([res.me.points, res.tasks.length, res.tasks[0].score], [10, 1, 10], "eng yaxshi natija hisoblanadi");
  // AI ishlamay qolsa — zaxira: o'qituvchi navbati
  setTranscriber(async () => {
    throw new Error("down");
  });
  const sub3 = await (await submit({ proctor: { ...good, events: [] } })).json();
  assert.equal(sub3.auto, false);
  const queue = await (await get(`/groups/${group.id}/review`, T.h)).json();
  assert.deepEqual(queue.items.map((i: any) => i.id), [sub3.id]);
  assert.equal((await call(`/submissions/${sub3.id}/grade`, { score: 11 }, T.h)).status, 400);
  assert.equal((await call(`/submissions/${sub3.id}/grade`, { score: 9, comment: "Barakalla" }, T.h)).status, 200);
  res = await (await get(`/groups/${group.id}/results`, S.h)).json();
  assert.equal(res.me.points, 10);
  assert.equal((await call(`/admin/tasks/${task.id}`, {}, T.h, "DELETE")).status, 409);

  /* ---------- Push bildirishnoma ---------- */
  assert.equal(quietDelaySeconds(new Date("2026-11-17T18:30:00Z")), 7 * 3600 + 30 * 60, "23:30 → 07:00");
  assert.equal(quietDelaySeconds(new Date("2026-11-17T06:00:00Z")), 0, "11:00 → darhol");
  const endpoint = "https://push.example/sub/1";
  assert.equal((await call("/push/subscribe", { endpoint, keys: { p256dh: "p".repeat(40), auth: "a".repeat(16) } }, S.h)).status, 200);
  await pool.query("UPDATE notification_outbox SET state='sent' WHERE kind='class_notice'");
  const pushed: string[] = [];
  setPushSender(async (s, payload) => void pushed.push(`${s.endpoint} ${payload}`));
  await call("/push/test", { groupId: group.id }, S.h);
  await processClassNotices();
  assert.equal(pushed.length, 1);
  assert.match(pushed[0], /Bildirishnoma yoqildi/);
  assert.match(pushed[0], new RegExp(`/sinfxona/${group.id}`));
  setPushSender(undefined);
  setZoomTransport(undefined);
  setClassStore(undefined);
  setTranscriber(undefined);
});
