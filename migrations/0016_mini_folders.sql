-- Mini-testlar: o'quvchi kabinetidagi papkalar va ko'rilgan testlar (yangi test bildirishnomasi uchun).
CREATE TABLE IF NOT EXISTS mini_folders (
 user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 folder text NOT NULL,
 last_seen_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,folder)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS mini_known_tests (
 test_id text PRIMARY KEY,
 test_type text NOT NULL,
 level text NOT NULL,
 title_uz text NOT NULL DEFAULT '',
 first_seen_at timestamptz NOT NULL DEFAULT now()
);
