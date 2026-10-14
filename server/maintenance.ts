import { pool } from "./db";
export async function cleanExpiredState() {
  await pool.query(
    "DELETE FROM api_rate_limits WHERE expires_at < now() - interval '1 hour'",
  );
  await pool.query(
    "DELETE FROM auth_tokens WHERE expires_at < now() - interval '7 days'",
  );
  await pool.query(
    "DELETE FROM learning_sessions WHERE created_at < now() - interval '1 day'",
  );
}
export function startMaintenance() {
  const interval = setInterval(() => {
    void cleanExpiredState().catch(() =>
      console.error("Expired state cleanup failed"),
    );
  }, 3600000);
  interval.unref();
  return () => clearInterval(interval);
}
