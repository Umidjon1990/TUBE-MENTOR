import { migrateDatabase } from "../server/migrate";
import { pool } from "../server/db";
try {
  await migrateDatabase();
  console.log("Database migrations complete");
} finally {
  await pool.end();
}
