ALTER TABLE platform_products ADD COLUMN IF NOT EXISTS source_metadata jsonb NOT NULL DEFAULT '{}';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS platform_admin_actions (
 id uuid PRIMARY KEY,
 actor_id varchar NOT NULL REFERENCES users(id),
 order_id uuid NOT NULL REFERENCES platform_orders(id),
 input jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','applied')),
 error text,
 locked_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS platform_admin_pending_order_idx ON platform_admin_actions(order_id) WHERE status='pending';
--> statement-breakpoint
ALTER TABLE lesson_access ADD COLUMN IF NOT EXISTS revocation_type text;
