-- A1: "CEFR so'z boyligi" — og'zaki savol-javob (savol matni) va kontent versiyasi (sinov kursini yangilash uchun).
ALTER TABLE cls_tasks ADD COLUMN IF NOT EXISTS prompt_ar text;
--> statement-breakpoint
ALTER TABLE cls_lessons ADD COLUMN IF NOT EXISTS source_version integer NOT NULL DEFAULT 1;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cls_media (
 hash text PRIMARY KEY,
 storage_key text NOT NULL,
 content_type text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE cls_tasks ADD COLUMN IF NOT EXISTS prompt_uz text;
--> statement-breakpoint
ALTER TABLE cls_tasks ADD COLUMN IF NOT EXISTS text_uz jsonb NOT NULL DEFAULT '[]'::jsonb;
