CREATE TABLE IF NOT EXISTS platform_resource_progress (
 user_id varchar NOT NULL REFERENCES users(id),
 resource_id text NOT NULL,
 position double precision NOT NULL DEFAULT 0,
 duration double precision NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,resource_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS platform_saved_words (
 user_id varchar NOT NULL REFERENCES users(id),
 source_id text NOT NULL,
 arabic text NOT NULL,
 translation text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,source_id)
);
