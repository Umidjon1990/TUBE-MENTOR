-- Dars jarayoni: Zoom'dagi haqiqiy qatnashish, yakuniy davomat, uzrlar, jarima ballari, yozuvni ko'rish, tezkor topshiriq.
CREATE TABLE IF NOT EXISTS cls_presence (
 session_id uuid NOT NULL REFERENCES cls_live_sessions(id) ON DELETE CASCADE,
 user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 first_seen timestamptz NOT NULL DEFAULT now(),
 open_since timestamptz,
 seconds integer NOT NULL DEFAULT 0,
 PRIMARY KEY(session_id, user_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cls_marks (
 session_id uuid NOT NULL REFERENCES cls_live_sessions(id) ON DELETE CASCADE,
 user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 status text NOT NULL,
 seconds integer NOT NULL DEFAULT 0,
 manual boolean NOT NULL DEFAULT false,
 decided_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(session_id, user_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cls_excuses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 session_id uuid NOT NULL REFERENCES cls_live_sessions(id) ON DELETE CASCADE,
 user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 phase text NOT NULL DEFAULT 'before',
 reason text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'pending',
 decided_by varchar,
 decided_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(session_id, user_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cls_penalties (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 group_id uuid NOT NULL REFERENCES cls_groups(id) ON DELETE CASCADE,
 user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 points integer NOT NULL,
 kind text NOT NULL,
 ref text NOT NULL,
 note text NOT NULL DEFAULT '',
 cancelled boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(group_id, user_id, kind, ref)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cls_warnings (
 group_id uuid NOT NULL REFERENCES cls_groups(id) ON DELETE CASCADE,
 user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 month text NOT NULL,
 level integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(group_id, user_id, month, level)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cls_watch (
 session_id uuid NOT NULL REFERENCES cls_live_sessions(id) ON DELETE CASCADE,
 user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 buckets jsonb NOT NULL DEFAULT '[]',
 duration integer NOT NULL DEFAULT 0,
 percent integer NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(session_id, user_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cls_quick_quizzes (
 lesson_id uuid PRIMARY KEY REFERENCES cls_lessons(id) ON DELETE CASCADE,
 questions jsonb NOT NULL DEFAULT '[]',
 updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cls_quick_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 group_id uuid NOT NULL REFERENCES cls_groups(id) ON DELETE CASCADE,
 lesson_id uuid NOT NULL REFERENCES cls_lessons(id) ON DELETE CASCADE,
 user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 layout jsonb NOT NULL,
 answers jsonb,
 score integer,
 max_score integer NOT NULL,
 percent integer,
 started_at timestamptz NOT NULL DEFAULT now(),
 submitted_at timestamptz
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS cls_quick_attempts_user ON cls_quick_attempts(group_id, user_id, lesson_id);
--> statement-breakpoint
ALTER TABLE cls_live_sessions ADD COLUMN IF NOT EXISTS finalized_at timestamptz;
--> statement-breakpoint
ALTER TABLE cls_live_sessions ADD COLUMN IF NOT EXISTS warned_at timestamptz;
--> statement-breakpoint
ALTER TABLE cls_groups ADD COLUMN IF NOT EXISTS discipline boolean NOT NULL DEFAULT true;
--> statement-breakpoint
-- Yangi tizimdan oldingi darslar uchun davomat va ball hisoblanmaydi.
UPDATE cls_live_sessions SET finalized_at=now() WHERE finalized_at IS NULL AND starts_at < now() - interval '6 hours';
