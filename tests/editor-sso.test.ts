import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import express from "express";
import { once } from "node:events";
import { createEditorSource } from "../server/platform-editor-source";

test("editor one-use codes bind source/state; primary logout revokes source admin access", async () => {
  const pg = new PGlite();
  await pg.waitReady;
  const socket = new PGLiteSocketServer({ db: pg, port: 0, maxConnections: 1 });
  await socket.start();
  const rootKey = randomBytes(32).toString("hex"),
    sourceKey = randomBytes(32).toString("hex"),
    password = randomBytes(24).toString("hex");
  process.env.DATABASE_URL = `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`;
  process.env.DB_POOL_MAX = "1";
  process.env.NODE_ENV = "test";
  process.env.SESSION_SECRET = randomBytes(32).toString("hex");
  process.env.APP_URL = "http://localhost";
  process.env.PLATFORM_APP_URL = "http://primary.test";
  process.env.PLATFORM_SERVICE_SECRET = rootKey;
  process.env.PLATFORM_QUIZ_SECRET = sourceKey;
  const { createApplication } = await import("../server/app"),
    { pool } = await import("../server/db"),
    { hashPassword } = await import("../server/auth"),
    { editorProviders } = await import("../server/platform-editors");
  const { httpServer } = await createApplication({ seed: false });
  httpServer.listen(0, "127.0.0.1");
  await once(httpServer, "listening");
  const core = `http://127.0.0.1:${(httpServer.address() as any).port}`;
  let nativeServer: any;
  const originalSource = editorProviders.quiz.url;
  try {
    const user = (
      await pool.query(
        "INSERT INTO users(username,password_hash,full_name,role,email_verified) VALUES('editor_admin',$1,'Admin','admin',true) RETURNING id",
        [hashPassword(password)],
      )
    ).rows[0];
    await pool.query(
      "INSERT INTO users(username,password_hash,full_name,role,email_verified) VALUES('editor_student',$1,'Student','student',true)",
      [hashPassword(password)],
    );
    const coreCall = async (
      path: string,
      body: any,
      token?: string,
      key = rootKey,
    ) => {
      const r = await fetch(core + path, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-platform-key": key,
          ...(token ? { "x-platform-session": token } : {}),
        },
        body: JSON.stringify(body),
        redirect: "manual",
      });
      return { r, data: await r.json() };
    };
    const admin = (
      await coreCall("/api/platform/auth/password", {
        username: "editor_admin",
        password,
      })
    ).data.token;
    const student = (
      await coreCall("/api/platform/auth/password", {
        username: "editor_student",
        password,
      })
    ).data.token;
    assert.ok(admin);
    const state = randomBytes(32).toString("base64url");
    assert.equal(
      (
        await coreCall(
          "/api/platform/editor/quiz/authorize",
          { state },
          student,
        )
      ).r.status,
      403,
    );
    const native = express();
    native.use(express.json());
    const bridge = createEditorSource(native, {
      provider: "quiz",
      coreUrl: core,
      portalUrl: "http://primary.test",
      editorPath: "/admin",
      resolve: async (actor) => "native-" + actor.id,
      prepareBrowser: () => ({ marker: "ui-only" }),
      fetch: async (input, init) =>
        fetch(input, {
          ...init,
          headers: { ...init?.headers, "x-platform-key": sourceKey },
        }),
    });
    native.use(bridge.middleware);
    bridge.routes();
    native.get("/api/private", (req, res) =>
      req.platformEditor
        ? res.json({ id: req.platformEditor.nativeId })
        : res.status(401).json({ message: "auth" }),
    );
    native.post("/api/private", (req, res) =>
      res.json({ ok: !!req.platformEditor }),
    );
    nativeServer = native.listen(0, "127.0.0.1");
    await once(nativeServer, "listening");
    const base = `http://127.0.0.1:${nativeServer.address().port}`;
    editorProviders.quiz.url = base;
    const started = await fetch(base + "/api/platform/editor/start", {
      redirect: "manual",
    });
    const stateCookie = started.headers.get("set-cookie")!.split(";")[0],
      nonce = new URL(started.headers.get("location")!).searchParams.get(
        "state",
      )!;
    const issued = await coreCall(
      "/api/platform/editor/quiz/authorize",
      { state: nonce, actor: { role: "student", id: "forged" } },
      admin,
    );
    assert.equal(issued.r.status, 200);
    const url = new URL(issued.data.url),
      code = url.searchParams.get("code");
    assert.ok(code);
    assert.equal((await fetch(url, { redirect: "manual" })).status, 403);
    assert.equal(
      (
        await coreCall(
          "/api/platform/editor/redeem",
          { provider: "courses", code, state: nonce },
          undefined,
          sourceKey,
        )
      ).r.status,
      403,
    );
    const completed = await fetch(url, {
      headers: { cookie: stateCookie },
      redirect: "manual",
    });
    assert.equal(completed.status, 200);
    const cookies = completed.headers.getSetCookie(),
      loginCookie = cookies
        .find((c) => c.startsWith("zt_editor="))!
        .split(";")[0];
    assert.ok(cookies.some((c) => /zt_editor=.*HttpOnly/.test(c)));
    const html = await completed.text();
    assert.match(html, /ui-only/);
    assert.ok(!html.includes(sourceKey));
    assert.ok(!html.includes(admin));
    assert.equal(
      (
        await fetch(url, {
          headers: { cookie: stateCookie },
          redirect: "manual",
        })
      ).status,
      401,
    );
    const read = await fetch(base + "/api/private", {
      headers: { cookie: loginCookie },
    });
    assert.equal(read.status, 200);
    assert.equal((await read.json()).id, "native-" + user.id);
    assert.equal(
      (
        await fetch(base + "/api/private", {
          method: "POST",
          headers: {
            cookie: loginCookie,
            origin: "https://evil.test",
            "content-type": "application/json",
          },
          body: "{}",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(base + "/api/private", {
          headers: {
            cookie: "zt_editor=" + randomBytes(32).toString("base64url"),
          },
        })
      ).status,
      401,
    );
    await coreCall("/api/platform/auth/logout", {}, admin);
    assert.equal(
      (await fetch(base + "/api/private", { headers: { cookie: loginCookie } }))
        .status,
      401,
    );
  } finally {
    editorProviders.quiz.url = originalSource;
    if (nativeServer)
      await new Promise<void>((r) => nativeServer.close(() => r()));
    await new Promise<void>((r) => httpServer.close(() => r()));
    await pool.end();
    await socket.stop();
    await pg.close();
  }
});
