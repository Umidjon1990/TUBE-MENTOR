-- Onlayn kurs: oldindan ruxsat berilgan raqamlar, ommaviy oferta (versiyalangan) va o'quvchi roziliklari.
CREATE TABLE IF NOT EXISTS cls_preapproved (
 group_id uuid NOT NULL REFERENCES cls_groups(id) ON DELETE CASCADE,
 phone text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(group_id, phone)
);
--> statement-breakpoint
ALTER TABLE cls_groups ADD COLUMN IF NOT EXISTS offer_required boolean NOT NULL DEFAULT true;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cls_offers (
 version serial PRIMARY KEY,
 body text NOT NULL,
 created_by varchar,
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cls_agreements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 number text NOT NULL UNIQUE,
 group_id uuid NOT NULL REFERENCES cls_groups(id) ON DELETE CASCADE,
 user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 offer_version integer NOT NULL REFERENCES cls_offers(version),
 full_name text NOT NULL,
 phone text NOT NULL,
 birth_year integer NOT NULL,
 guardian_name text,
 guardian_phone text,
 consents jsonb NOT NULL,
 ip text,
 user_agent text,
 accepted_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS cls_agreements_member ON cls_agreements(group_id, user_id, accepted_at DESC);
