-- Sinfxona (online kurs): kurslar, darslar, guruhlar, a'zolar, testlar, e'lonlar, chat, jonli dars, vazifalar, push.
CREATE TABLE IF NOT EXISTS cls_courses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 title text NOT NULL,
 description text NOT NULL DEFAULT '',
 level text NOT NULL DEFAULT '',
 archived boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cls_lessons (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 course_id uuid NOT NULL REFERENCES cls_courses(id) ON DELETE CASCADE,
 position integer NOT NULL,
 kind text NOT NULL DEFAULT 'lesson',
 title text NOT NULL,
 body text NOT NULL DEFAULT '',
 video_url text NOT NULL DEFAULT '',
 pass_percent integer NOT NULL DEFAULT 60,
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS cls_lessons_course ON cls_lessons(course_id, position);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cls_quizzes (
 lesson_id uuid PRIMARY KEY REFERENCES cls_lessons(id) ON DELETE CASCADE,
 questions jsonb NOT NULL DEFAULT '[]',
 time_limit_minutes integer,
 max_attempts integer NOT NULL DEFAULT 2,
 updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cls_groups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 course_id uuid NOT NULL REFERENCES cls_courses(id),
 name text NOT NULL,
 invite_code text NOT NULL UNIQUE,
 invite_active boolean NOT NULL DEFAULT true,
 auto_approve boolean NOT NULL DEFAULT false,
 allow_peer_dm boolean NOT NULL DEFAULT false,
 leaderboard_mode text NOT NULL DEFAULT 'top10',
 late_penalty integer NOT NULL DEFAULT 20,
 archived boolean NOT NULL DEFAULT false,
 teacher_id varchar REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cls_group_lessons (
 group_id uuid NOT NULL REFERENCES cls_groups(id) ON DELETE CASCADE,
 lesson_id uuid NOT NULL REFERENCES cls_lessons(id) ON DELETE CASCADE,
 opens_at timestamptz,
 due_at timestamptz,
 notified_at timestamptz,
 PRIMARY KEY(group_id, lesson_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cls_members (
 group_id uuid NOT NULL REFERENCES cls_groups(id) ON DELETE CASCADE,
 user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending',
 phone text NOT NULL DEFAULT '',
 display_name text NOT NULL DEFAULT '',
 muted_until timestamptz,
 joined_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(group_id, user_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS cls_members_user ON cls_members(user_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cls_unlocks (
 group_id uuid NOT NULL REFERENCES cls_groups(id) ON DELETE CASCADE,
 user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 lesson_id uuid NOT NULL REFERENCES cls_lessons(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(group_id, user_id, lesson_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cls_announcements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 group_id uuid NOT NULL REFERENCES cls_groups(id) ON DELETE CASCADE,
 body text NOT NULL,
 pinned boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cls_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 group_id uuid NOT NULL REFERENCES cls_groups(id) ON DELETE CASCADE,
 lesson_id uuid NOT NULL REFERENCES cls_lessons(id) ON DELETE CASCADE,
 user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 layout jsonb NOT NULL,
 answers jsonb,
 score integer,
 max_score integer NOT NULL,
 percent integer,
 effective_percent integer,
 late boolean NOT NULL DEFAULT false,
 started_at timestamptz NOT NULL DEFAULT now(),
 submitted_at timestamptz
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS cls_attempts_user ON cls_attempts(group_id, user_id, lesson_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cls_messages (
 id bigserial PRIMARY KEY,
 group_id uuid NOT NULL REFERENCES cls_groups(id) ON DELETE CASCADE,
 sender_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 recipient_id varchar REFERENCES users(id) ON DELETE CASCADE,
 reply_to bigint,
 body text NOT NULL,
 deleted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS cls_messages_group ON cls_messages(group_id, id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cls_message_reports (
 message_id bigint NOT NULL REFERENCES cls_messages(id) ON DELETE CASCADE,
 reporter_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(message_id, reporter_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cls_blocks (
 user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 blocked_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 PRIMARY KEY(user_id, blocked_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cls_live_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 group_id uuid NOT NULL REFERENCES cls_groups(id) ON DELETE CASCADE,
 lesson_id uuid REFERENCES cls_lessons(id) ON DELETE SET NULL,
 title text NOT NULL,
 starts_at timestamptz NOT NULL,
 duration_minutes integer NOT NULL DEFAULT 60,
 zoom_meeting_id text,
 zoom_password text,
 status text NOT NULL DEFAULT 'scheduled',
 recording_key text,
 recording_state text NOT NULL DEFAULT 'none',
 recording_error text,
 zoom_uuid text,
 join_url text,
 reminded_at timestamptz,
 started_at timestamptz,
 ended_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cls_attendance (
 session_id uuid NOT NULL REFERENCES cls_live_sessions(id) ON DELETE CASCADE,
 user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 joined_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(session_id, user_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cls_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 lesson_id uuid NOT NULL REFERENCES cls_lessons(id) ON DELETE CASCADE,
 kind text NOT NULL DEFAULT 'recitation',
 title text NOT NULL,
 text_ar text NOT NULL DEFAULT '',
 max_seconds integer NOT NULL DEFAULT 120,
 max_score integer NOT NULL DEFAULT 10,
 proctor text NOT NULL DEFAULT 'required',
 pass_percent integer NOT NULL DEFAULT 80,
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cls_submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 task_id uuid NOT NULL REFERENCES cls_tasks(id) ON DELETE CASCADE,
 group_id uuid NOT NULL REFERENCES cls_groups(id) ON DELETE CASCADE,
 user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 audio_key text,
 audio_seconds integer,
 audio_mime text,
 source text NOT NULL DEFAULT 'web',
 transcript text,
 ai_percent integer,
 ai_diff jsonb,
 final_percent integer,
 pauses integer,
 proctor jsonb,
 snapshots integer NOT NULL DEFAULT 0,
 auto boolean NOT NULL DEFAULT false,
 score integer,
 comment text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'submitted',
 late boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 graded_at timestamptz
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS cls_submissions_task ON cls_submissions(task_id, group_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cls_push_subscriptions (
 endpoint text PRIMARY KEY,
 user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 p256dh text NOT NULL,
 auth text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS cls_live_meeting ON cls_live_sessions(zoom_meeting_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cls_chat_reads (
 group_id uuid NOT NULL REFERENCES cls_groups(id) ON DELETE CASCADE,
 user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 thread text NOT NULL,
 last_id bigint NOT NULL DEFAULT 0,
 PRIMARY KEY(group_id, user_id, thread)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cls_blobs (
 key text PRIMARY KEY,
 mime text NOT NULL,
 data bytea NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
