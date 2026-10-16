import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { readFile, readdir } from "node:fs/promises";
import type { Server } from "node:http";
let pg: PGlite,
  socket: PGLiteSocketServer,
  http: Server,
  base: string,
  pool: import("pg").Pool;
let student: Client, other: Client, teacher: Client, admin: Client;
let lessonId: number, courseId: number;
const mail: { to: string; text: string }[] = [];
const fixturePasswords = Object.fromEntries(["ADMIN", "TEACHER", "STUDENT", "REGISTER", "RESET", "ANOTHER"].map(role => [role, randomBytes(32).toString("hex")]));
class Client {
  cookie = "";
  async call(
    path: string,
    method = "GET",
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(method === "GET" ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    });
    const cookie = response.headers.get("set-cookie");
    if (cookie) this.cookie = cookie.split(";")[0];
    return { status: response.status, data: await response.json() };
  }
  async login(username: string, password: string) {
    const r = await this.call("/api/auth/login", "POST", {
      username,
      password,
    });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    return r.data;
  }
}
before(
  async () => {
    if (process.env.TEST_DATABASE_URL) {
      if (!new URL(process.env.TEST_DATABASE_URL).pathname.endsWith("_test"))
        throw new Error(
          "TEST_DATABASE_URL must use a disposable database ending in _test",
        );
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
      process.env.DB_POOL_MAX = "10";
    } else {
      pg = new PGlite();
      await pg.waitReady;
      socket = new PGLiteSocketServer({ db: pg, port: 0, maxConnections: 1 });
      await socket.start();
      process.env.DATABASE_URL = `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`;
      process.env.DB_POOL_MAX = "1";
    }
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-not-for-production";
    process.env.APP_URL = "http://localhost";
    process.env.RESEND_API_KEY = "test-only";
    process.env.MAIL_FROM = "test@example.com";
    // Existing installation upgrade: apply the original schema and preserve an existing row.
    ({ pool } = await import("../server/db"));
    await pool.query(await readFile("migrations/0000_baseline.sql", "utf8"));
    await pool.query(
      "insert into users(full_name,username,password_hash)values('Old Account','old_account','unused')",
    );
    const app = await import("../server/app");
    ({ pool } = await import("../server/db"));
    const { setTestMailer } = await import("../server/auth-routes");
    setTestMailer(async (m) => {
      mail.push(m);
    });
    const result = await app.createApplication({ seed: false });
    http = result.httpServer;
    const { seedDemo } = await import("../server/demo-data");
    for (const role of ["ADMIN", "TEACHER", "STUDENT"]) process.env[`TUBE_DEMO_${role}_PASSWORD`] = fixturePasswords[role];
    await seedDemo();
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(http.address() as import("node:net").AddressInfo).port}`;
    student = new Client();
    other = new Client();
    teacher = new Client();
    admin = new Client();
    await student.login("demo_student", fixturePasswords.STUDENT);
    await other.login("demo_other", fixturePasswords.STUDENT);
    await teacher.login("demo_teacher", fixturePasswords.TEACHER);
    await admin.login("demo_admin", fixturePasswords.ADMIN);
    const catalog = (await student.call("/api/learn/catalog")).data;
    lessonId = catalog.lessons.find((l: any) => l.access === "demo").id;
    courseId = catalog.courses[0].id;
  },
  { timeout: 180000 },
);
after(async () => {
  if (http) await new Promise<void>((r) => http.close(() => r()));
  if (pool) await pool.end();
  if (socket) await socket.stop();
  await new Promise<void>((r) => setImmediate(r));
  await new Promise<void>((r) => setImmediate(r));
  if (pg) await pg.close();
});
test("additive migrations retain existing accounts and can run twice", async () => {
  const { migrateDatabase } = await import("../server/migrate");
  await migrateDatabase();
  const r = await pool.query(
    "select username,learning_level,email_verified from users where username='old_account'",
  );
  assert.equal(r.rows[0].learning_level, "A1");
  assert.equal(r.rows[0].email_verified, true);
  assert.equal(
    (await pool.query("select count(*) from tube_migrations")).rows[0].count,
    String((await readdir("migrations")).filter((f) => /^\d{4}_.*\.sql$/.test(f)).length),
  );
});
test("public catalogs exclude drafts; learner reads an accessible published lesson", async () => {
  const guest = new Client();
  const course = await guest.call(`/api/collections/public/${courseId}`);
  assert.equal(course.data.lessons.length, 2);
  assert.ok(!JSON.stringify(course.data).includes("Yashirin"));
  const l = await student.call(`/api/learn/lessons/${lessonId}`);
  assert.equal(l.status, 200);
  assert.equal(l.data.segments[0].words[0].i_rab, "خبر مرفوع");
  const draft = (
    await pool.query(
      "select id from lessons where status='draft' order by id limit 1",
    )
  ).rows[0].id;
  assert.equal((await guest.call(`/api/lessons/public/${draft}`)).status, 404);
  assert.equal((await student.call(`/api/learn/lessons/${draft}`)).status, 404);
  assert.equal(
    (await student.call(`/api/user/lessons/${lessonId}`)).status,
    200,
  );
  assert.equal(
    (await student.call("/api/user/lessons", "POST", { title: "Forbidden" }))
      .status,
    403,
  );
});
test("unsafe origins and invalid import structures are rejected", async () => {
  assert.equal(
    (
      await student.call(
        "/api/learn/preferences",
        "PATCH",
        { dailyGoalMinutes: 15 },
        { Origin: "https://evil.test" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await admin.call(`/api/user/lessons/${lessonId}/import-json`, "PATCH", {
        field: "quizzesJson",
        data: [{ question: "Q", options: ["a", "b"], correctIndex: 99 }],
      })
    ).status,
    400,
  );
});
test("active time is capped and event retries do not double count; stage XP is idempotent", async () => {
  const session = (
    await student.call(`/api/learn/lessons/${lessonId}/sessions`, "POST")
  ).data;
  await pool.query(
    "update learning_sessions set last_heartbeat_at=now()-interval '120 seconds' where id=$1",
    [session.id],
  );
  const body = {
    id: randomUUID(),
    sessionId: session.id,
    active: true,
    position: 12,
    segmentIndex: 1,
  };
  const r = await student.call(
    `/api/learn/lessons/${lessonId}/activity`,
    "POST",
    body,
  );
  assert.equal(r.data.seconds, 30);
  assert.equal(
    (
      await student.call(
        `/api/learn/lessons/${lessonId}/activity`,
        "POST",
        body,
      )
    ).data.seconds,
    0,
  );
  const first = await student.call(
    `/api/learn/lessons/${lessonId}/stages`,
    "POST",
    { stage: "listen" },
  );
  assert.equal(first.data.xp, 5);
  const retries = await Promise.all([
    student.call(`/api/learn/lessons/${lessonId}/stages`, "POST", {
      stage: "listen",
    }),
    student.call(`/api/learn/lessons/${lessonId}/stages`, "POST", {
      stage: "listen",
    }),
  ]);
  assert.equal(
    retries.reduce((n, r) => n + (r.data.xp || 0), 0),
    0,
  );
  assert.equal(
    (await student.call(`/api/learn/lessons/${lessonId}`)).data.progress
      .studyTimeSeconds,
    30,
  );
  assert.equal(
    (await other.call(`/api/learn/lessons/${lessonId}`)).data.progress
      .completionPercent,
    0,
  );
});
test("complete lesson includes server-graded practice and vocabulary; wrong words become review cards", async () => {
  assert.equal(
    (
      await student.call(`/api/learn/lessons/${lessonId}/attempts`, "POST", {
        kind: "vocabulary",
      })
    ).status,
    409,
  );
  for (const stage of ["understand", "shadow"])
    assert.equal(
      (
        await student.call(`/api/learn/lessons/${lessonId}/stages`, "POST", {
          stage,
          spoken: true,
        })
      ).status,
      200,
    );
  for (const kind of ["practice", "vocabulary"]) {
    const attempts = await Promise.all([
      student.call(`/api/learn/lessons/${lessonId}/attempts`, "POST", { kind }),
      student.call(`/api/learn/lessons/${lessonId}/attempts`, "POST", { kind }),
    ]);
    assert.equal(attempts[0].data.id, attempts[1].data.id);
    const attempt = attempts[0].data;
    assert.ok(
      attempt.questions.every(
        (q: any) => !("answer" in q) && !("explanation" in q),
      ),
    );
    for (const q of attempt.questions) {
      const body = { questionId: q.id, answer: "intentionally incorrect" };
      const first = await student.call(
        `/api/learn/attempts/${attempt.id}/answers`,
        "POST",
        body,
      );
      assert.equal(first.status, 200);
      assert.equal(first.data.correct, false);
      const repeat = await student.call(
        `/api/learn/attempts/${attempt.id}/answers`,
        "POST",
        { ...body, answer: first.data.answer },
      );
      assert.equal(repeat.data.correct, false);
    }
  }
  const result = (await student.call(`/api/learn/lessons/${lessonId}/results`))
    .data;
  assert.equal(result.progress.completionPercent, 100);
  assert.equal(result.vocabulary.score, 0);
  assert.equal(result.vocabulary.errors.length, 6);
  assert.equal((await student.call("/api/learn/reviews")).data.length, 6);
  assert.equal((await student.call("/api/user/saved-words")).data.length, 6);
  assert.equal((await other.call("/api/learn/reviews")).data.length, 0);
});
test("SRS ratings and word saves are idempotent and isolated between users", async () => {
  const cards = (await student.call("/api/learn/reviews")).data;
  const body = { id: randomUUID(), rating: "easy" };
  const r = await student.call(
    `/api/learn/reviews/${cards[0].id}`,
    "POST",
    body,
  );
  assert.equal(r.status, 200);
  assert.equal(
    (await student.call(`/api/learn/reviews/${cards[0].id}`, "POST", body)).data
      .duplicate,
    true,
  );
  assert.equal(
    (
      await other.call(`/api/learn/reviews/${cards[0].id}`, "POST", {
        id: randomUUID(),
        rating: "hard",
      })
    ).status,
    404,
  );
  const saved = { lessonId, word: "طَالِبٌ", subtitleTime: 0 };
  await other.call("/api/user/saved-words", "POST", saved);
  await other.call("/api/user/saved-words", "POST", saved);
  assert.equal((await other.call("/api/user/saved-words")).data.length, 1);
  const word = (await other.call("/api/user/saved-words")).data[0];
  assert.equal(
    (await student.call(`/api/user/saved-words/${word.id}`, "DELETE")).status,
    404,
  );
  await other.call(`/api/user/saved-words/${word.id}`, "DELETE");
  assert.equal((await other.call("/api/learn/reviews")).data.length, 0);
});
test("editing a published lesson preserves visible revision until reviewed and republished", async () => {
  const original = (await student.call(`/api/learn/lessons/${lessonId}`)).data;
  await admin.call(`/api/user/lessons/${lessonId}`, "PATCH", {
    title: "New reviewed title",
  });
  assert.equal(
    (await student.call(`/api/learn/lessons/${lessonId}`)).data.title,
    original.title,
  );
  assert.equal(
    (await student.call(`/api/learn/lessons/${lessonId}`)).data.progress
      .completionPercent,
    100,
  );
  assert.equal(
    (await admin.call(`/api/user/lessons/${lessonId}/publish`, "PATCH"))
      .status,
    400,
  );
  const source = (await admin.call(`/api/user/lessons/${lessonId}`)).data;
  assert.equal(
    (await admin.call(`/api/admin/lessons/${lessonId}/approve`, "PATCH"))
      .status,
    400,
  );
  assert.equal(
    (
      await admin.call(`/api/studio/lessons/${lessonId}/review`, "POST", {
        contentVersion: source.contentVersion,
        text: true,
        translation: true,
        timing: true,
        exercises: true,
      })
    ).status,
    200,
  );
  assert.equal(
    (await admin.call(`/api/admin/lessons/${lessonId}/approve`, "PATCH"))
      .status,
    200,
  );
  assert.equal(
    (await admin.call(`/api/user/lessons/${lessonId}/publish`, "PATCH"))
      .status,
    200,
  );
  const fresh = (await student.call(`/api/learn/lessons/${lessonId}`)).data;
  assert.equal(fresh.title, "New reviewed title");
  assert.equal(fresh.progress.completionPercent, 0);
});
test("email registration, one-use verification and password reset invalidate existing sessions", async () => {
  const c = new Client();
  const email = "new@example.com";
  assert.equal(
    (
      await c.call("/api/auth/register", "POST", {
        email,
        fullName: "New User",
        password: fixturePasswords.REGISTER,
        acceptedTerms: true,
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await c.call("/api/auth/login", "POST", {
        username: email,
        password: fixturePasswords.REGISTER,
      })
    ).status,
    403,
  );
  const token = new URL(
    mail.at(-1)!.text.match(/http:\/\/[^\s]+/)![0],
  ).searchParams.get("token");
  assert.equal(
    (await c.call("/api/auth/verify-email", "POST", { token })).status,
    200,
  );
  assert.equal(
    (await c.call("/api/auth/verify-email", "POST", { token })).status,
    400,
  );
  const oldCookie = c.cookie;
  await c.call("/api/auth/forgot-password", "POST", { email });
  const reset = new URL(
    mail.at(-1)!.text.match(/http:\/\/[^\s]+/)![0],
  ).searchParams.get("token");
  assert.equal(
    (
      await c.call("/api/auth/reset-password", "POST", {
        token: reset,
        password: fixturePasswords.RESET,
      })
    ).status,
    200,
  );
  c.cookie = oldCookie;
  assert.equal((await c.call("/api/auth/me")).status, 401);
  assert.equal(
    (
      await c.call("/api/auth/reset-password", "POST", {
        token: reset,
        password: fixturePasswords.ANOTHER,
      })
    ).status,
    400,
  );
  await c.login(email, fixturePasswords.RESET);
  assert.ok(!("passwordHash" in (await c.call("/api/auth/me")).data));
});
test("AI has no mock-success fallback without provider keys", async () => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  assert.equal(
    (await admin.call(`/api/user/lessons/${lessonId}/generate`, "POST", {}))
      .status,
    503,
  );
  const { generateLessonContent } = await import(
    "../server/services/ai-generator"
  );
  await assert.rejects(() =>
    generateLessonContent("أنا طالب", ["أنا طالب"], "A1", "ar"),
  );
});

test("logout destroys the session and PostgreSQL sessions survive application instance changes", async () => {
  const { createApplication } = await import("../server/app");
  process.env.APP_URL = "https://tube-test.example";
  const first = await createApplication({ production: true, seed: false });
  const second = await createApplication({ production: true, seed: false });
  await new Promise<void>((r) => first.httpServer.listen(0, "127.0.0.1", r));
  await new Promise<void>((r) => second.httpServer.listen(0, "127.0.0.1", r));
  try {
    const url = (s: Server) =>
      `http://127.0.0.1:${(s.address() as import("node:net").AddressInfo).port}`;
    const headers = {
      "Content-Type": "application/json",
      "X-Forwarded-Proto": "https",
    };
    const response = await fetch(url(first.httpServer) + "/api/auth/login", {
      method: "POST",
      headers,
      body: JSON.stringify({
        username: "demo_student",
        password: fixturePasswords.STUDENT,
      }),
    });
    assert.equal(response.status, 200);
    const cookie = response.headers.get("set-cookie")!;
    assert.match(cookie, /Secure/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    const shared = { ...headers, Cookie: cookie.split(";")[0] };
    assert.equal(
      (
        await fetch(url(second.httpServer) + "/api/auth/me", {
          headers: shared,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await fetch(url(second.httpServer) + "/api/auth/logout", {
          method: "POST",
          headers: shared,
          body: "{}",
        })
      ).status,
      200,
    );
    assert.equal(
      (await fetch(url(first.httpServer) + "/api/auth/me", { headers: shared }))
        .status,
      401,
    );
  } finally {
    await new Promise<void>((r) => first.httpServer.close(() => r()));
    await new Promise<void>((r) => second.httpServer.close(() => r()));
    process.env.APP_URL = "http://localhost";
  }
});

test("personal notes remain private and accept bounded edits", async () => {
  const created = await student.call(
    `/api/learn/lessons/${lessonId}/notes`,
    "POST",
    { content: "Muhim izoh", sentenceIndex: 0 },
  );
  assert.equal(created.status, 201);
  assert.equal((await other.call("/api/learn/notes")).data.length, 0);
  assert.equal(
    (
      await other.call(`/api/user/notes/${created.data.id}`, "PATCH", {
        content: "Forbidden",
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await student.call(`/api/user/notes/${created.data.id}`, "PATCH", {
        content: "Yangi izoh",
        isPinned: true,
      })
    ).status,
    200,
  );
  assert.equal(
    (await student.call("/api/learn/notes")).data[0].content,
    "Yangi izoh",
  );
});


test("legacy teachers cannot create, edit or review content now managed by the admin", async () => {
  const catalog = await teacher.call("/api/user/lessons");
  assert.equal(catalog.status, 200);
  const safeCatalog = JSON.stringify(catalog.data);
  assert.ok(!safeCatalog.includes("Yashirin"));
  assert.ok(!safeCatalog.includes("correctIndex"));
  assert.ok(!safeCatalog.includes('"answer"'));
  assert.ok(!safeCatalog.includes("publishedSnapshot"));
  for (const [path, method, body] of [
    ["/api/user/lessons", "POST", { title: "Forbidden teacher lesson" }],
    [`/api/user/lessons/${lessonId}`, "PATCH", { title: "Forbidden edit" }],
    [`/api/studio/lessons/${lessonId}/review`, "POST", { text: true }],
    ["/api/admin/users", "GET", undefined],
  ] as const) {
    assert.equal((await teacher.call(path, method, body)).status, 403, `${method} ${path}`);
  }
});
