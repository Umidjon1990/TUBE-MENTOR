-- Telefon raqam + kirish kodi bilan hisob, admin uchun sinov o'quvchi hisobi.
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique ON users(phone) WHERE phone IS NOT NULL;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS test_owner_id varchar REFERENCES users(id) ON DELETE CASCADE;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS users_test_owner_unique ON users(test_owner_id) WHERE test_owner_id IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS phone_login_attempts (
 phone text PRIMARY KEY,
 failures integer NOT NULL DEFAULT 0,
 locked_until timestamptz
);
