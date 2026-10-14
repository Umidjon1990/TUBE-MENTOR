import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { spawn } from "node:child_process";
import { once } from "node:events";
import assert from "node:assert/strict";
const database = new PGlite();
await database.waitReady;
const socket = new PGLiteSocketServer({
  db: database,
  port: 0,
  maxConnections: 1,
});
await socket.start();
const port = "5020";
const child = spawn(process.execPath, ["dist/index.cjs"], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    DATABASE_URL: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`,
    DB_POOL_MAX: "1",
    SESSION_SECRET: "production-smoke-secret-for-test-only-32-characters",
    APP_URL: "https://tube-smoke.example",
    PORT: port,
    ENABLE_DEMO_SEED: "true",
    RESEND_API_KEY: "",
    GOOGLE_CLIENT_ID: "",
    TELEGRAM_CLIENT_ID: "",
    TELEGRAM_CLIENT_SECRET: "",
    OPENAI_API_KEY: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.on("data", (b) => (output += b));
child.stderr.on("data", (b) => (output += b));
const exited = once(child, "exit");
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null)
      throw new Error(`Production process exited: ${output}`);
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (r.ok) {
        const health = await r.json();
        assert.equal(health.version, "2.1.0");
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.equal(ready, true, output);
  assert.equal((await fetch(`http://127.0.0.1:${port}/courses`)).status, 200);
  assert.equal(
    (await fetch(`http://127.0.0.1:${port}/api/nonexistent`)).status,
    404,
  );
  const config = await (
    await fetch(`http://127.0.0.1:${port}/api/auth/config`)
  ).json();
  assert.equal(config.signupEnabled, false);
  assert.equal(config.telegramEnabled, false);
  const users = await database.query<{ count: number }>(
    "select count(*)::int as count from users",
  );
  assert.equal(users.rows[0].count, 0);
  console.log(
    "Production bundle smoke passed: migrations, static routes, health and no demo accounts",
  );
} finally {
  const force = setTimeout(() => child.kill("SIGKILL"), 10000);
  child.kill("SIGTERM");
  await exited;
  clearTimeout(force);
  await socket.stop();
  await new Promise<void>((r) => setImmediate(r));
  await new Promise<void>((r) => setImmediate(r));
  await database.close();
}
