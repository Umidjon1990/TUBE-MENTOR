-- Darsdan keyingi vazifalar muddati (soat): tezkor topshiriq — 1 soat, qolganlari — shu muddat (standart 24 soat).
ALTER TABLE cls_groups ADD COLUMN IF NOT EXISTS task_hours integer NOT NULL DEFAULT 24;
