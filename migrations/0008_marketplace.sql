ALTER TABLE lesson_access ADD COLUMN IF NOT EXISTS expires_at timestamptz;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS platform_products (
 id varchar PRIMARY KEY,
 provider text NOT NULL CHECK(provider IN('tube','courses','arabictest','quiz')),
 source_id text NOT NULL,
 kind text NOT NULL CHECK(kind IN('tube','course','test','pdf')),
 title text NOT NULL,
 description text NOT NULL DEFAULT '',
 thumbnail_url text,
 level text,
 skill text,
 price_coins integer NOT NULL DEFAULT 0 CHECK(price_coins>=0),
 duration_days integer CHECK(duration_days>0),
 max_attempts integer CHECK(max_attempts>0),
 demo_ref text,
 source_version text NOT NULL DEFAULT '1',
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','published','archived')),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(provider,source_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS platform_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id varchar NOT NULL REFERENCES users(id),
 product_id varchar NOT NULL REFERENCES platform_products(id),
 request_key uuid NOT NULL,
 status text NOT NULL CHECK(status IN('pending','active','failed','refunded','revoked')),
 price_coins integer NOT NULL CHECK(price_coins>=0),
 policy jsonb NOT NULL,
 transaction_id integer REFERENCES coin_transactions(id),
 source_result jsonb,
 expires_at timestamptz,
 error text,
 delivery_attempts integer NOT NULL DEFAULT 0,
 next_try_at timestamptz NOT NULL DEFAULT now(),
 locked_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,request_key)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS platform_orders_user_idx ON platform_orders(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS platform_orders_pending_idx ON platform_orders(next_try_at) WHERE status='pending';
