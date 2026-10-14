CREATE TABLE "auth_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"token_hash" text NOT NULL,
	"purpose" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	CONSTRAINT "auth_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "learning_events" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"lesson_id" integer,
	"type" text NOT NULL,
	"study_seconds" integer DEFAULT 0 NOT NULL,
	"details" json DEFAULT '{}'::json NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_sessions" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"lesson_id" integer NOT NULL,
	"last_heartbeat_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_attempts" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"lesson_id" integer NOT NULL,
	"content_version" integer NOT NULL,
	"kind" text NOT NULL,
	"questions" json NOT NULL,
	"answers" json DEFAULT '[]'::json NOT NULL,
	"score" real,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "review_answers" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"review_id" integer NOT NULL,
	"rating" text NOT NULL,
	"due_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "word_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"lesson_id" integer NOT NULL,
	"normalized" text NOT NULL,
	"word" text NOT NULL,
	"meaning" text NOT NULL,
	"source_sentence" text,
	"subtitle_time" real,
	"repetitions" integer DEFAULT 0 NOT NULL,
	"interval_days" integer DEFAULT 0 NOT NULL,
	"ease" real DEFAULT 2.5 NOT NULL,
	"due_at" timestamp DEFAULT now() NOT NULL,
	"last_reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xp_awards" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"award_key" text NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD COLUMN "content_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD COLUMN "completed_stages" json DEFAULT '[]'::json NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD COLUMN "playback_position" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD COLUMN "segment_index" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "content_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "content_checks" json DEFAULT '{}'::json NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "google_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "session_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "learning_level" text DEFAULT 'A1' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "target_language" text DEFAULT 'ar' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "daily_goal_minutes" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "timezone" text DEFAULT 'Asia/Tashkent' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarding_completed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_sessions" ADD CONSTRAINT "learning_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_sessions" ADD CONSTRAINT "learning_sessions_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_attempts" ADD CONSTRAINT "lesson_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_attempts" ADD CONSTRAINT "lesson_attempts_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_answers" ADD CONSTRAINT "review_answers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_answers" ADD CONSTRAINT "review_answers_review_id_word_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."word_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_reviews" ADD CONSTRAINT "word_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_reviews" ADD CONSTRAINT "word_reviews_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_awards" ADD CONSTRAINT "xp_awards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "word_review_unique" ON "word_reviews" USING btree ("user_id","lesson_id","normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "xp_award_unique" ON "xp_awards" USING btree ("user_id","award_key");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE("email");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_google_id_unique" UNIQUE("google_id");