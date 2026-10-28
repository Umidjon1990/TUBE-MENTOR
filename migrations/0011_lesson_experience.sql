CREATE TABLE IF NOT EXISTS lesson_experience_progress (
 user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 lesson_id integer NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
 version text NOT NULL,
 state jsonb NOT NULL DEFAULT '{"completed":[],"seen":[],"tab":0,"position":0}',
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,lesson_id,version)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS lesson_experience_attempts (
 id uuid PRIMARY KEY,
 user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 lesson_id integer NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
 version text NOT NULL,
 phase text NOT NULL CHECK(phase IN ('practice','vocabulary')),
 questions jsonb NOT NULL,
 answers jsonb NOT NULL DEFAULT '[]',
 created_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS experience_attempt_user_idx ON lesson_experience_attempts(user_id,lesson_id,version);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS experience_review_answers (
 id uuid PRIMARY KEY,
 user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 review_id integer NOT NULL REFERENCES word_reviews(id) ON DELETE CASCADE,
 choice_id text NOT NULL,
 feedback jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
