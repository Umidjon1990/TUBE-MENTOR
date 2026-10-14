ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_id text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS users_telegram_id_unique ON users(telegram_id);
