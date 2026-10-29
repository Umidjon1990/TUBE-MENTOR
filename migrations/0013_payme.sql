CREATE TABLE IF NOT EXISTS payme_invoices (
 id serial PRIMARY KEY,
 order_id varchar REFERENCES payment_orders(id),
 mode text NOT NULL CHECK(mode IN('test','live')),
 amount bigint NOT NULL CHECK(amount>0),
 created_at timestamp NOT NULL DEFAULT now(),
 UNIQUE(order_id,mode),
 CHECK((mode='test' AND order_id IS NULL) OR (mode='live' AND order_id IS NOT NULL))
);
--> statement-breakpoint
ALTER SEQUENCE payme_invoices_id_seq RESTART WITH 1000001;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS payme_transactions (
 key text PRIMARY KEY,
 id text NOT NULL,
 mode text NOT NULL CHECK(mode IN('test','live')),
 invoice_id integer NOT NULL REFERENCES payme_invoices(id),
 amount bigint NOT NULL,
 time bigint NOT NULL,
 create_time bigint NOT NULL,
 perform_time bigint NOT NULL DEFAULT 0,
 cancel_time bigint NOT NULL DEFAULT 0,
 state integer NOT NULL CHECK(state IN(1,2,-1,-2)),
 reason integer,
 fiscal_data jsonb,
 UNIQUE(mode,id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX payme_one_active_payment_per_invoice ON payme_transactions(invoice_id) WHERE state IN(1,2);
--> statement-breakpoint
CREATE INDEX payme_statement_time ON payme_transactions(mode,time);
