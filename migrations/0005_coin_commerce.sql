ALTER TABLE coin_transactions ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE coin_transactions ADD COLUMN IF NOT EXISTS actor_id varchar REFERENCES users(id);
ALTER TABLE coin_transactions ADD COLUMN IF NOT EXISTS order_id varchar;
ALTER TABLE coin_transactions ADD COLUMN IF NOT EXISTS lesson_id integer REFERENCES lessons(id);
ALTER TABLE coin_transactions ADD COLUMN IF NOT EXISTS bank_reference text;
CREATE UNIQUE INDEX IF NOT EXISTS coin_transactions_bank_reference_unique ON coin_transactions(bank_reference);
ALTER TABLE coin_transactions ADD COLUMN IF NOT EXISTS balance_before integer;
ALTER TABLE coin_transactions ADD COLUMN IF NOT EXISTS balance_after integer;
ALTER TABLE coin_transactions ADD COLUMN IF NOT EXISTS metadata json NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX IF NOT EXISTS coin_transactions_idempotency_unique ON coin_transactions(idempotency_key);
CREATE TABLE IF NOT EXISTS lesson_access (
 id serial PRIMARY KEY,user_id varchar NOT NULL REFERENCES users(id),lesson_id integer NOT NULL REFERENCES lessons(id),
 source text NOT NULL,price_coins integer NOT NULL DEFAULT 0 CHECK(price_coins>=0),purchase_transaction_id integer REFERENCES coin_transactions(id),
 granted_by varchar REFERENCES users(id),revoked_at timestamp,created_at timestamp NOT NULL DEFAULT now(),UNIQUE(user_id,lesson_id)
);
CREATE TABLE IF NOT EXISTS coin_packages (
 id serial PRIMARY KEY,name text NOT NULL,coins integer NOT NULL CHECK(coins>0),price_uzs integer NOT NULL CHECK(price_uzs>=0),
 is_active boolean NOT NULL DEFAULT false,created_at timestamp NOT NULL DEFAULT now(),updated_at timestamp NOT NULL DEFAULT now(),
 CHECK(NOT is_active OR price_uzs>0)
);
CREATE TABLE IF NOT EXISTS payment_orders (
 id varchar PRIMARY KEY,user_id varchar NOT NULL REFERENCES users(id),package_id integer NOT NULL REFERENCES coin_packages(id),
 package_name text NOT NULL,coins integer NOT NULL CHECK(coins>0),price_uzs integer NOT NULL CHECK(price_uzs>0),
 status text NOT NULL DEFAULT 'awaiting_payment' CHECK(status IN('created','awaiting_payment','receipt_submitted','under_review','needs_info','approved','rejected','cancelled','expired','partially_refunded','refunded')),
 instructions json NOT NULL,reason text,bank_reference text UNIQUE,reviewed_by varchar REFERENCES users(id),reviewed_at timestamp,
 refunded_coins integer NOT NULL DEFAULT 0 CHECK(refunded_coins>=0 AND refunded_coins<=coins),expires_at timestamp NOT NULL,
 created_at timestamp NOT NULL DEFAULT now(),updated_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS payment_receipts (
 id serial PRIMARY KEY,order_id varchar NOT NULL REFERENCES payment_orders(id),storage_key text NOT NULL UNIQUE,
 mime_type text NOT NULL,original_name text NOT NULL,size_bytes integer NOT NULL CHECK(size_bytes>0),sha256 text NOT NULL,created_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS coin_grants (
 id serial PRIMARY KEY,user_id varchar NOT NULL REFERENCES users(id),source text NOT NULL CHECK(source IN('bonus','paid','legacy','adjustment')),
 amount integer NOT NULL CHECK(amount>0),remaining integer NOT NULL CHECK(remaining>=0 AND remaining<=amount),
 order_id varchar REFERENCES payment_orders(id),transaction_id integer REFERENCES coin_transactions(id),idempotency_key text NOT NULL UNIQUE,created_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS commerce_audit (
 id serial PRIMARY KEY,actor_id varchar REFERENCES users(id),user_id varchar REFERENCES users(id),action text NOT NULL,reference_id text,
 idempotency_key text UNIQUE,details json NOT NULL DEFAULT '{}',created_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS telegram_bot_links (
 id serial PRIMARY KEY,user_id varchar NOT NULL UNIQUE REFERENCES users(id),telegram_user_id text NOT NULL UNIQUE,chat_id text NOT NULL,created_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS telegram_link_tokens (
 id serial PRIMARY KEY,token_hash text NOT NULL UNIQUE,user_id varchar NOT NULL REFERENCES users(id),expires_at timestamp NOT NULL,used_at timestamp
);
CREATE TABLE IF NOT EXISTS notification_outbox (
 id serial PRIMARY KEY,kind text NOT NULL,reference_id text NOT NULL,payload json NOT NULL DEFAULT '{}',state text NOT NULL DEFAULT 'pending',
 attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamp NOT NULL DEFAULT now(),last_error text,created_at timestamp NOT NULL DEFAULT now(),UNIQUE(kind,reference_id)
);
CREATE INDEX IF NOT EXISTS payment_orders_user_date ON payment_orders(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS payment_orders_status_date ON payment_orders(status,created_at);
CREATE INDEX IF NOT EXISTS payment_receipts_order ON payment_receipts(order_id);
CREATE INDEX IF NOT EXISTS coin_grants_user_remaining ON coin_grants(user_id,remaining);
CREATE INDEX IF NOT EXISTS notification_outbox_pending ON notification_outbox(state,next_attempt_at);
INSERT INTO coin_packages(name,coins,price_uzs,is_active) SELECT 'Boshlang‘ich',50,0,false WHERE NOT EXISTS(SELECT 1 FROM coin_packages);
INSERT INTO coin_packages(name,coins,price_uzs,is_active) SELECT 'Davomiy',100,0,false WHERE NOT EXISTS(SELECT 1 FROM coin_packages WHERE coins=100);
INSERT INTO coin_packages(name,coins,price_uzs,is_active) SELECT 'Kengaytirilgan',300,0,false WHERE NOT EXISTS(SELECT 1 FROM coin_packages WHERE coins=300);
INSERT INTO coin_grants(user_id,source,amount,remaining,idempotency_key) SELECT id,'legacy',coins,coins,'legacy-balance:'||id FROM users WHERE coins>0 ON CONFLICT(idempotency_key) DO NOTHING;
-- Existing learning records retain access at cutover. Financial history is never replaced.
INSERT INTO lesson_access(user_id,lesson_id,source)
SELECT DISTINCT user_id,lesson_id,'legacy' FROM (
 SELECT user_id,lesson_id FROM lesson_progress UNION SELECT user_id,lesson_id FROM lesson_attempts
 UNION SELECT user_id,lesson_id FROM notes UNION SELECT user_id,lesson_id FROM flashcards
 UNION SELECT user_id,lesson_id FROM saved_words UNION SELECT user_id,lesson_id FROM word_reviews
 UNION SELECT user_id,lesson_id FROM bookmarks UNION SELECT user_id,lesson_id FROM learning_sessions
 UNION SELECT user_id,lesson_id FROM learning_events
 UNION SELECT created_by AS user_id,id AS lesson_id FROM lessons WHERE created_by IS NOT NULL
) existing WHERE lesson_id IS NOT NULL ON CONFLICT(user_id,lesson_id) DO NOTHING;
INSERT INTO system_settings(key,value) VALUES('commerce','{"demoLessonId":null,"paymentsEnabled":false,"recipientName":"","cardNumber":"","paymeUrl":"","paymentInstructions":"","reviewHours":""}') ON CONFLICT(key) DO NOTHING;
-- Teaching operations are centralized in admin; legacy teachers keep accounts,
-- balances and purchased/created content access as learners without elevated rights.
UPDATE users SET role='student' WHERE role='teacher';
-- Audited commerce transactions are append-only; corrections require a new reversing entry.
CREATE OR REPLACE FUNCTION protect_commerce_ledger() RETURNS trigger AS $$
BEGIN
 IF OLD.idempotency_key IS NOT NULL THEN
  RAISE EXCEPTION 'Audited coin ledger entries are immutable';
 END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS coin_transactions_append_only ON coin_transactions;
CREATE TRIGGER coin_transactions_append_only BEFORE UPDATE OR DELETE ON coin_transactions FOR EACH ROW EXECUTE FUNCTION protect_commerce_ledger();
