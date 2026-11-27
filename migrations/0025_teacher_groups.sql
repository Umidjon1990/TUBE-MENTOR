-- O'qituvchilar guruhi: guruh turi, guruhga biriktirilgan qo'llanmalar (Bepul — barcha a'zolarga) va tanlangan a'zolarga Pro.
ALTER TABLE cls_groups ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'students';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cls_group_guides (
 group_id uuid NOT NULL REFERENCES cls_groups(id) ON DELETE CASCADE,
 guide_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(group_id,guide_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cls_group_pro (
 group_id uuid NOT NULL REFERENCES cls_groups(id) ON DELETE CASCADE,
 user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 guide_id text NOT NULL,
 granted_by varchar REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(group_id,user_id,guide_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS cls_group_pro_user ON cls_group_pro(user_id);
