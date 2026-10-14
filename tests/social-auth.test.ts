import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { OAuth2Client } from "google-auth-library";
import type { Server } from "node:http";

let pg: PGlite,
  socket: PGLiteSocketServer,
  http: Server,
  pool: import("pg").Pool,
  base: string;
let privateKey: CryptoKey, attackerKey: CryptoKey;
let learner: Browser, learnerId: string;
let claims: Record<string, unknown> = {},
  forged = false,
  exchanges = 0;
let googleClaims: Record<string, unknown> = {};
const realFetch = globalThis.fetch;
const flows = new Map<string, URL>();
class Browser {
  cookie = "";
  async raw(
    path: string,
    method = "GET",
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    const res = await realFetch(base + path, {
      method,
      redirect: "manual",
      headers: {
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(method === "GET" ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    });
    const cookie = res.headers.get("set-cookie");
    if (cookie) this.cookie = cookie.split(";")[0];
    return res;
  }
  async me() {
    const r = await this.raw("/api/auth/me");
    return { status: r.status, data: await r.json() };
  }
  async begin(provider = "telegram", linking = false) {
    const r = linking
      ? await this.raw(`/api/auth/accounts/${provider}/link`, "POST", {})
      : await this.raw(`/api/auth/${provider}`);
    assert.equal(r.status, linking ? 200 : 302);
    const url = new URL(
      linking ? (await r.json()).url : r.headers.get("location")!,
    );
    const code = randomUUID();
    flows.set(code, url);
    return { url, code, provider };
  }
  async finish(
    flow: Awaited<ReturnType<Browser["begin"]>>,
    state = flow.url.searchParams.get("state")!,
  ) {
    const r = await this.raw(
      `/api/auth/${flow.provider}/callback?${new URLSearchParams({ state, code: flow.code })}`,
    );
    return r.headers.get("location");
  }
}
before(
  async () => {
    pg = new PGlite();
    await pg.waitReady;
    socket = new PGLiteSocketServer({ db: pg, port: 0, maxConnections: 1 });
    await socket.start();
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`;
    process.env.DB_POOL_MAX = "1";
    process.env.SESSION_SECRET = "social-login-test-secret-not-for-production";
    process.env.APP_URL = "https://tube-social.test";
    process.env.TELEGRAM_CLIENT_ID = "123456789";
    process.env.TELEGRAM_CLIENT_SECRET = "test-telegram-client-secret";
    process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
    process.env.ALLOW_SIGNUP = "true";
    delete process.env.RESEND_API_KEY;
    ({ privateKey: attackerKey } = await generateKeyPair("RS256"));
    const pair = await generateKeyPair("RS256");
    privateKey = pair.privateKey;
    const jwk = await exportJWK(pair.publicKey);
    mock.method(
      globalThis,
      "fetch",
      async (...args: Parameters<typeof fetch>) => {
        const url = String(args[0]);
        if (url === "https://oauth.telegram.org/.well-known/jwks.json")
          return Response.json({
            keys: [
              { ...jwk, kid: "telegram-fixture", alg: "RS256", use: "sig" },
            ],
          });
        if (url !== "https://oauth.telegram.org/token")
          return realFetch(...args);
        exchanges++;
        const init = args[1]!;
        assert.equal(
          (init.headers as Record<string, string>).Authorization,
          `Basic ${Buffer.from("123456789:test-telegram-client-secret").toString("base64")}`,
        );
        const form = new URLSearchParams(String(init.body));
        const flow = flows.get(form.get("code")!)!;
        assert.equal(
          form.get("redirect_uri"),
          "https://tube-social.test/api/auth/telegram/callback",
        );
        assert.equal(
          createHash("sha256")
            .update(form.get("code_verifier")!)
            .digest("base64url"),
          flow.searchParams.get("code_challenge"),
        );
        const now = Math.floor(Date.now() / 1000);
        const token = await new SignJWT({
          iss: "https://oauth.telegram.org",
          aud: "123456789",
          sub: "telegram-learner",
          iat: now,
          exp: now + 300,
          nonce: flow.searchParams.get("nonce"),
          name: "Telegram Learner",
          role: "admin",
          ...claims,
        })
          .setProtectedHeader({ alg: "RS256", kid: "telegram-fixture" })
          .sign(forged ? attackerKey : privateKey);
        return Response.json({ id_token: token });
      },
    );
    mock.method(OAuth2Client.prototype, "getToken", async (options: any) => {
      const flow = flows.get(options.code)!;
      assert.equal(
        createHash("sha256").update(options.codeVerifier).digest("base64url"),
        flow.searchParams.get("code_challenge"),
      );
      return { tokens: { id_token: options.code } } as any;
    });
    mock.method(
      OAuth2Client.prototype,
      "verifyIdToken",
      async (options: any) =>
        ({
          getPayload: () => ({
            sub: "google-learner",
            email: "learner@gmail.com",
            email_verified: true,
            nonce: flows.get(options.idToken)!.searchParams.get("nonce"),
            name: "Google Learner",
            ...googleClaims,
          }),
        }) as any,
    );
    const { createApplication } = await import("../server/app");
    ({ pool } = await import("../server/db"));
    ({ httpServer: http } = await createApplication({ seed: false }));
    await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(http.address() as import("node:net").AddressInfo).port}`;
  },
  { timeout: 60000 },
);
after(async () => {
  mock.restoreAll();
  if (http) await new Promise<void>((r) => http.close(() => r()));
  if (pool) await pool.end();
  if (socket) await socket.stop();
  await new Promise<void>((r) => setImmediate(r));
  await new Promise<void>((r) => setImmediate(r));
  if (pg) await pg.close();
});
test("social provider configuration exposes availability without exposing credentials", async () => {
  const r = await new Browser().raw("/api/auth/config");
  const data = await r.json();
  assert.equal(data.telegramEnabled, true);
  assert.equal(data.googleEnabled, true);
  assert.equal(data.emailEnabled, false);
  assert.equal(data.socialSignupEnabled, true);
  assert.ok(!JSON.stringify(data).includes("secret"));
  delete process.env.TELEGRAM_CLIENT_SECRET;
  const unavailable = await new Browser().raw("/api/auth/telegram");
  assert.equal(
    unavailable.headers.get("location"),
    "/login?error=telegram_unavailable",
  );
  process.env.TELEGRAM_CLIENT_SECRET = "test-telegram-client-secret";
});
test("Telegram creates a student without email and regenerates its session", async () => {
  learner = new Browser();
  const flow = await learner.begin();
  const before = learner.cookie;
  assert.equal(flow.url.origin, "https://oauth.telegram.org");
  assert.equal(flow.url.searchParams.get("scope"), "openid profile");
  assert.equal(flow.url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(await learner.finish(flow), "/onboarding");
  assert.notEqual(learner.cookie, before);
  const me = await learner.me();
  learnerId = me.data.id;
  assert.equal(me.status, 200);
  assert.equal(me.data.role, "student");
  assert.equal(me.data.email, null);
  assert.equal(me.data.emailVerified, false);
  assert.deepEqual(me.data.linkedAccounts, { google: false, telegram: true });
  for (const key of [
    "passwordHash",
    "telegramId",
    "googleId",
    "sessionVersion",
  ])
    assert.ok(!(key in me.data));
  assert.equal(
    (
      await learner.raw("/api/learn/preferences", "PATCH", {
        onboardingCompleted: true,
        learningLevel: "A2",
      })
    ).status,
    200,
  );
  await pool.query(
    "update users set xp=73,onboarding_completed=true where id=$1",
    [learnerId],
  );
  const count = exchanges;
  assert.equal(await learner.finish(flow), "/login?error=telegram_failed");
  assert.equal(exchanges, count);
  const returning = new Browser();
  assert.equal(await returning.finish(await returning.begin()), "/today");
  assert.equal((await returning.me()).data.id, learnerId);
  assert.equal((await returning.me()).data.xp, 73);
});
test("state, provider and expiry checks reject callbacks before exchanging any code", async () => {
  const count = exchanges;
  const c = new Browser();
  const flow = await c.begin();
  assert.equal(
    await c.finish(flow, "incorrect-state"),
    "/login?error=telegram_failed",
  );
  assert.equal((await c.me()).status, 401);
  const wrong = await c.begin();
  assert.equal(
    await c.finish({ ...wrong, provider: "google" }),
    "/login?error=google_failed",
  );
  const expired = await c.begin();
  const now = Date.now();
  const clock = mock.method(Date, "now", () => now + 610000);
  try {
    assert.equal(await c.finish(expired), "/login?error=telegram_failed");
  } finally {
    clock.mock.restore();
  }
  assert.equal(exchanges, count);
});
test("Telegram rejects forged signatures, issuer, audience, expiry and nonce mismatches", async () => {
  for (const invalid of [
    { aud: "different-client" },
    { iss: "https://attacker.test" },
    { exp: Math.floor(Date.now() / 1000) - 60 },
    { nonce: "wrong-nonce" },
    { nonce: undefined },
    { iat: Math.floor(Date.now() / 1000) - 1200 },
  ]) {
    claims = { sub: `invalid-${randomUUID()}`, ...invalid };
    const c = new Browser();
    assert.equal(
      await c.finish(await c.begin()),
      "/login?error=telegram_failed",
    );
    assert.equal((await c.me()).status, 401);
  }
  claims = {};
  forged = true;
  try {
    const c = new Browser();
    assert.equal(
      await c.finish(await c.begin()),
      "/login?error=telegram_failed",
    );
  } finally {
    forged = false;
  }
  assert.equal(
    (await pool.query("select count(*)::int as n from users")).rows[0].n,
    1,
  );
});
test("Google links to the current Telegram profile and both providers retain the same progress", async () => {
  assert.equal(
    (await new Browser().raw("/api/auth/accounts/google/link", "POST", {}))
      .status,
    401,
  );
  assert.equal(
    (
      await learner.raw(
        "/api/auth/accounts/google/link",
        "POST",
        {},
        { Origin: "https://attacker.test" },
      )
    ).status,
    403,
  );
  const flow = await learner.begin("google", true);
  assert.equal(await learner.finish(flow), "/profile?linked=google");
  const me = await learner.me();
  assert.equal(me.data.id, learnerId);
  assert.deepEqual(me.data.linkedAccounts, { google: true, telegram: true });
  assert.equal(me.data.email, "learner@gmail.com");
  assert.equal(me.data.xp, 73);
  const google = new Browser();
  assert.equal(await google.finish(await google.begin("google")), "/today");
  assert.equal((await google.me()).data.id, learnerId);
  assert.equal((await google.me()).data.learningLevel, "A2");
});
test("a provider cannot be reassigned or connected to another user's profile", async () => {
  const { hashPassword } = await import("../server/auth");
  await pool.query(
    "insert into users(full_name,username,password_hash) values('Other User','other_social',$1)",
    [hashPassword("OtherPassword2026!")],
  );
  const other = new Browser();
  assert.equal(
    (
      await other.raw("/api/auth/login", "POST", {
        username: "other_social",
        password: "OtherPassword2026!",
      })
    ).status,
    200,
  );
  assert.equal(
    await other.finish(await other.begin("telegram", true)),
    "/profile?link_error=account_in_use",
  );
  assert.deepEqual((await other.me()).data.linkedAccounts, {
    google: false,
    telegram: false,
  });
  claims = { sub: "different-telegram-account" };
  try {
    assert.equal(
      await learner.finish(await learner.begin("telegram", true)),
      "/profile?link_error=provider_already_linked",
    );
  } finally {
    claims = {};
  }
  const flow = await other.begin("google", true);
  await pool.query(
    "update users set session_version=session_version+1 where username='other_social'",
  );
  assert.equal(
    await other.finish(flow),
    "/profile?link_error=link_session_expired",
  );
});
test("signup closure and blocked accounts are enforced for Telegram login", async () => {
  process.env.ALLOW_SIGNUP = "false";
  try {
    claims = { sub: "closed-signup" };
    const c = new Browser();
    assert.equal(
      await c.finish(await c.begin()),
      "/login?error=signup_disabled",
    );
    claims = {};
    const existing = new Browser();
    assert.equal(await existing.finish(await existing.begin()), "/today");
  } finally {
    process.env.ALLOW_SIGNUP = "true";
    claims = {};
  }
  await pool.query("update users set is_active=false where id=$1", [learnerId]);
  try {
    const blocked = new Browser();
    assert.equal(
      await blocked.finish(await blocked.begin()),
      "/login?error=blocked",
    );
    assert.equal((await blocked.me()).status, 401);
    assert.equal((await learner.me()).status, 401);
  } finally {
    await pool.query("update users set is_active=true where id=$1", [
      learnerId,
    ]);
  }
});
test("verified Google accounts with non-Gmail emails can register without an email service", async () => {
  googleClaims = { sub: "external-google", email: "external@example.edu" };
  try {
    const c = new Browser();
    assert.equal(await c.finish(await c.begin("google")), "/onboarding");
    const me = await c.me();
    assert.equal(me.status, 200);
    assert.equal(me.data.emailVerified, true);
  } finally {
    googleClaims = {};
  }
});
test("concurrent first logins create one Telegram profile", async () => {
  claims = { sub: "concurrent-telegram" };
  try {
    const a = new Browser(),
      b = new Browser();
    const flows = await Promise.all([a.begin(), b.begin()]);
    assert.deepEqual(
      await Promise.all([a.finish(flows[0]), b.finish(flows[1])]),
      ["/onboarding", "/onboarding"],
    );
    assert.equal((await a.me()).data.id, (await b.me()).data.id);
    assert.equal(
      (
        await pool.query(
          "select count(*)::int as n from users where telegram_id='concurrent-telegram'",
        )
      ).rows[0].n,
      1,
    );
  } finally {
    claims = {};
  }
});

test("a Google-first learner can connect Telegram without losing progress", async () => {
  googleClaims = { sub: "google-first", email: "google-first@gmail.com" };
  claims = { sub: "telegram-for-google-first" };
  try {
    const google = new Browser();
    assert.equal(
      await google.finish(await google.begin("google")),
      "/onboarding",
    );
    const id = (await google.me()).data.id;
    await pool.query("update users set xp=41 where id=$1", [id]);
    assert.equal(
      await google.finish(await google.begin("telegram", true)),
      "/profile?linked=telegram",
    );
    const telegram = new Browser();
    assert.equal(await telegram.finish(await telegram.begin()), "/onboarding");
    const me = await telegram.me();
    assert.equal(me.data.id, id);
    assert.equal(me.data.xp, 41);
    assert.deepEqual(me.data.linkedAccounts, { google: true, telegram: true });
  } finally {
    googleClaims = {};
    claims = {};
  }
});

test("Google email matching cannot take over privileged or non-authoritative legacy accounts", async () => {
  const rows = [
    {
      email: "protected@gmail.com",
      role: "admin",
      subject: "google-admin-email",
    },
    {
      email: "legacy@example.edu",
      role: "student",
      subject: "google-legacy-email",
    },
    {
      email: "student@gmail.com",
      role: "student",
      subject: "google-student-email",
    },
  ];
  try {
    for (const [index, row] of rows.entries()) {
      const result = await pool.query(
        "insert into users(full_name,username,password_hash,email,role,xp) values('Legacy User',$1,'unused',$2,$3,29) returning id",
        [`legacy_social_${index}`, row.email, row.role],
      );
      googleClaims = { sub: row.subject, email: row.email };
      const c = new Browser();
      const redirect = await c.finish(await c.begin("google"));
      if (index < 2) {
        assert.equal(redirect, "/login?error=google_email_link");
        assert.equal((await c.me()).status, 401);
        assert.equal(
          (
            await pool.query("select google_id from users where id=$1", [
              result.rows[0].id,
            ])
          ).rows[0].google_id,
          null,
        );
      } else {
        assert.equal(redirect, "/onboarding");
        const me = await c.me();
        assert.equal(me.data.id, result.rows[0].id);
        assert.equal(me.data.role, "student");
        assert.equal(me.data.xp, 29);
      }
    }
  } finally {
    googleClaims = {};
  }
});
