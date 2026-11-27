-- Sinfxona: sinov haftasi va oylik to'lov. Har o'quvchida «…gacha to'langan» sanasi, sinov tugash sanasi,
-- nasiya (va'da) sanasi, imtiyozli belgisi va ogohlantirib chiqarish vaqti. Cheklar cls_payments'da.
ALTER TABLE cls_groups ADD COLUMN IF NOT EXISTS billing_enabled boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE cls_groups ADD COLUMN IF NOT EXISTS trial_days integer NOT NULL DEFAULT 7;
--> statement-breakpoint
ALTER TABLE cls_groups ADD COLUMN IF NOT EXISTS grace_days integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE cls_groups ADD COLUMN IF NOT EXISTS monthly_price integer;
--> statement-breakpoint
ALTER TABLE cls_members ADD COLUMN IF NOT EXISTS trial_until timestamptz;
--> statement-breakpoint
ALTER TABLE cls_members ADD COLUMN IF NOT EXISTS paid_until timestamptz;
--> statement-breakpoint
ALTER TABLE cls_members ADD COLUMN IF NOT EXISTS promise_until timestamptz;
--> statement-breakpoint
ALTER TABLE cls_members ADD COLUMN IF NOT EXISTS billing_exempt boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE cls_members ADD COLUMN IF NOT EXISTS removal_due_at timestamptz;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cls_payments (
 id bigserial PRIMARY KEY,
 group_id uuid NOT NULL REFERENCES cls_groups(id) ON DELETE CASCADE,
 user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 amount integer NOT NULL CHECK (amount > 0),
 paid_on date NOT NULL,
 note text,
 file_key text NOT NULL,
 file_mime text NOT NULL,
 file_name text NOT NULL,
 file_size integer NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
 reason text,
 period_from timestamptz,
 period_to timestamptz,
 decided_by varchar REFERENCES users(id) ON DELETE SET NULL,
 decided_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS cls_payments_group ON cls_payments(group_id, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS cls_payments_user ON cls_payments(user_id, group_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cls_billing_notices (
 group_id uuid NOT NULL REFERENCES cls_groups(id) ON DELETE CASCADE,
 user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind text NOT NULL,
 ref text NOT NULL,
 sent_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (group_id, user_id, kind, ref)
);
