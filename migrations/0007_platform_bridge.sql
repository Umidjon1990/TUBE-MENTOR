CREATE TABLE IF NOT EXISTS platform_auth_codes (
 code_hash text PRIMARY KEY,
 user_id varchar NOT NULL REFERENCES users(id),
 nonce text NOT NULL,
 expires_at timestamptz NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS platform_sessions (
 token_hash text PRIMARY KEY,
 user_id varchar NOT NULL REFERENCES users(id),
 auth_version integer NOT NULL,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS platform_sessions_user_idx ON platform_sessions(user_id);
