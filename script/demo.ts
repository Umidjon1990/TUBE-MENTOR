import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { mkdir } from "node:fs/promises";
if (process.env.NODE_ENV === "production")
  throw new Error("Demo cannot run in production");
await mkdir(".data", { recursive: true });
const database = new PGlite(
  process.env.DEMO_EPHEMERAL === "true" ? undefined : ".data/demo",
);
await database.waitReady;
const socket = new PGLiteSocketServer({
  db: database,
  host: "127.0.0.1",
  port: Number(process.env.DEMO_DB_PORT || 55432),
  maxConnections: 1,
});
await socket.start();
process.env.DATABASE_URL = `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`;
process.env.DB_POOL_MAX = "1";
process.env.NODE_ENV = "development";
process.env.ENABLE_DEMO_SEED = "true";
process.env.PORT = process.env.PORT || "5000";
console.log(
  "Local demo only: demo_student / DemoStudent2026!, demo_teacher / DemoTeacher2026!, demo_admin / DemoAdmin2026!",
);
await import("../server/index");
