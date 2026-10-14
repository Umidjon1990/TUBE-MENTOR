import { readFile } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { pool } from "./db";

/** Additive, versioned migrations; the existing 14-table installation is the baseline. */
export async function migrateDatabase() {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(872641)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS tube_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    for (const name of [
      "0000_baseline.sql",
      "0001_mobile_learning.sql",
      "0002_published_revision.sql",
      "0003_runtime.sql",
    ]) {
      const exists = await client.query(
        "SELECT 1 FROM tube_migrations WHERE name=$1",
        [name],
      );
      if (exists.rowCount) continue;
      await client.query("BEGIN");
      try {
        const baseline = name === "0000_baseline.sql";
        const tables = baseline
          ? await client.query("SELECT to_regclass('public.users') AS existing")
          : null;
        if (!baseline || !tables?.rows[0]?.existing) {
          const directory = existsSync(path.join(process.cwd(), "migrations"))
            ? path.join(process.cwd(), "migrations")
            : path.join(process.cwd(), "dist", "migrations");
          const sql = await readFile(path.join(directory, name), "utf8");
          for (const statement of sql
            .split("--> statement-breakpoint")
            .filter((s) => s.trim())) {
            await client.query(statement);
          }
        }
        await client.query("INSERT INTO tube_migrations(name) VALUES($1)", [
          name,
        ]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(872641)").catch(() => {});
    client.release();
  }
}
