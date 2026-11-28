-- B1 kursi: og'zaki vazifa turi (recite — matnni yodlab aytish, speak — iboralar bilan erkin gapirish) va eng kam davomiylik.
ALTER TABLE cls_tasks ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'recite';
ALTER TABLE cls_tasks ADD COLUMN IF NOT EXISTS min_seconds integer NOT NULL DEFAULT 0;
-- Darsdan keyingi vazifalar muddati: 48 soat (tezkor topshiriq — baribir 1 soat). O'qituvchi o'zgartirmagan guruhlar ham 48 ga o'tadi.
ALTER TABLE cls_groups ALTER COLUMN task_hours SET DEFAULT 48;
UPDATE cls_groups SET task_hours=48 WHERE task_hours=24;
