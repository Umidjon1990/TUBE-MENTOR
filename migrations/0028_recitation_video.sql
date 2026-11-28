-- Yodlash vazifasi videosi: o'qituvchi o'quvchi videosini ko'radi va qo'lda baholay oladi.
-- AI butun yozuvni emas, boshi, o'rtasi va oxiridan olingan qisqa bo'laklarni tekshiradi (arzon).
ALTER TABLE cls_tasks ADD COLUMN IF NOT EXISTS video boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE cls_submissions ADD COLUMN IF NOT EXISTS video_key text;
--> statement-breakpoint
ALTER TABLE cls_submissions ADD COLUMN IF NOT EXISTS video_mime text;
--> statement-breakpoint
ALTER TABLE cls_submissions ADD COLUMN IF NOT EXISTS video_bytes integer;
--> statement-breakpoint
ALTER TABLE cls_submissions ADD COLUMN IF NOT EXISTS video_deleted_at timestamptz;
--> statement-breakpoint
ALTER TABLE cls_submissions ADD COLUMN IF NOT EXISTS sampled jsonb;
--> statement-breakpoint
ALTER TABLE cls_submissions ADD COLUMN IF NOT EXISTS flagged boolean NOT NULL DEFAULT false;
