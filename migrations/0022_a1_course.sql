-- A1 kursi: asosiy topshiriqning qo'shimcha qismlari (mustahkamlash, tarjima, so'z boyligi), so'z yodlash,
-- ovozli fayllar keshi, og'zaki matnni shadowing bilan yodlash.
CREATE TABLE IF NOT EXISTS cls_parts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 lesson_id uuid NOT NULL REFERENCES cls_lessons(id) ON DELETE CASCADE,
 kind text NOT NULL,
 position integer NOT NULL DEFAULT 0,
 title text NOT NULL,
 data jsonb NOT NULL DEFAULT '{}',
 pass_percent integer NOT NULL DEFAULT 80,
 max_attempts integer NOT NULL DEFAULT 3,
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS cls_parts_lesson ON cls_parts(lesson_id, position);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cls_part_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 part_id uuid NOT NULL REFERENCES cls_parts(id) ON DELETE CASCADE,
 group_id uuid NOT NULL REFERENCES cls_groups(id) ON DELETE CASCADE,
 user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 layout jsonb NOT NULL,
 answers jsonb,
 score integer,
 max_score integer NOT NULL DEFAULT 0,
 percent integer,
 started_at timestamptz NOT NULL DEFAULT now(),
 submitted_at timestamptz
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS cls_part_attempts_user ON cls_part_attempts(group_id, user_id, part_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cls_vocab_progress (
 part_id uuid NOT NULL REFERENCES cls_parts(id) ON DELETE CASCADE,
 group_id uuid NOT NULL REFERENCES cls_groups(id) ON DELETE CASCADE,
 user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 learned_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(part_id, group_id, user_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cls_tts (
 hash text PRIMARY KEY,
 storage_key text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE cls_tasks ADD COLUMN IF NOT EXISTS shadow boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE cls_lessons ADD COLUMN IF NOT EXISTS source_key text;
--> statement-breakpoint
ALTER TABLE cls_submissions ADD COLUMN IF NOT EXISTS ai_judge jsonb;
--> statement-breakpoint
ALTER TABLE cls_courses ADD COLUMN IF NOT EXISTS source_key text;
--> statement-breakpoint
ALTER TABLE cls_groups ADD COLUMN IF NOT EXISTS source_key text;
