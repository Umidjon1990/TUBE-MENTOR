-- Darsga kirmagan o'quvchi yozuvni qanday ko'radi: true — ruxsatsiz (dars tugagach), false — o'qituvchidan ruxsat so'raydi.
ALTER TABLE cls_groups ADD COLUMN IF NOT EXISTS free_recording boolean NOT NULL DEFAULT true;
