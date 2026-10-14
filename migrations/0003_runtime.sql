CREATE TABLE IF NOT EXISTS session (sid varchar PRIMARY KEY NOT NULL, sess json NOT NULL, expire timestamp(6) NOT NULL);
CREATE INDEX IF NOT EXISTS session_expire_idx ON session(expire);
CREATE TABLE IF NOT EXISTS api_rate_limits (key text PRIMARY KEY, hits integer NOT NULL DEFAULT 0, expires_at timestamptz NOT NULL);
CREATE INDEX IF NOT EXISTS learning_events_user_time_idx ON learning_events(user_id, created_at);
CREATE INDEX IF NOT EXISTS word_reviews_user_due_idx ON word_reviews(user_id, due_at);
CREATE INDEX IF NOT EXISTS lesson_attempts_user_lesson_idx ON lesson_attempts(user_id, lesson_id, created_at);
CREATE INDEX IF NOT EXISTS auth_tokens_expiry_idx ON auth_tokens(expires_at);

ALTER TABLE learning_sessions ALTER COLUMN lesson_id DROP NOT NULL;
CREATE UNIQUE INDEX lesson_attempt_unfinished_unique ON lesson_attempts(user_id,lesson_id,content_version,kind) WHERE finished_at IS NULL;

CREATE INDEX api_rate_limits_expires_idx ON api_rate_limits(expires_at);

INSERT INTO word_reviews(user_id,lesson_id,normalized,word,meaning,source_sentence,subtitle_time,due_at)
SELECT DISTINCT ON(user_id,lesson_id,normalized) user_id,lesson_id,normalized,word,coalesce(nullif(contextual_meaning,''),translation_uz,''),source_sentence,subtitle_time,now()
FROM saved_words WHERE coalesce(nullif(contextual_meaning,''),translation_uz,'') <> ''
ORDER BY user_id,lesson_id,normalized,created_at
ON CONFLICT(user_id,lesson_id,normalized) DO NOTHING;
