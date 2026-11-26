-- Qo'llanmalar: kitob ichidagi bir martalik kodlar, o'quvchi kirishi, o'qituvchi biriktirish va faqat o'qituvchiga materiallar.
CREATE TABLE IF NOT EXISTS guide_access (
 user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 guide_id text NOT NULL,
 source text NOT NULL,
 ref text,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,guide_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS guide_codes (
 code text PRIMARY KEY,
 guide_id text NOT NULL,
 batch text NOT NULL,
 created_by varchar REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 used_by varchar REFERENCES users(id) ON DELETE SET NULL,
 used_at timestamptz
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS guide_codes_guide ON guide_codes(guide_id,batch);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS guide_teachers (
 user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 guide_id text NOT NULL,
 tier text NOT NULL DEFAULT 'free',
 assigned_by varchar REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,guide_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS guide_materials (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 guide_id text NOT NULL,
 kind text NOT NULL,
 title text NOT NULL,
 storage_key text NOT NULL,
 content_type text NOT NULL,
 size integer NOT NULL,
 position integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS guide_materials_guide ON guide_materials(guide_id,position);
