-- Zamonaviy Ta'lim saytidagi qo'llanmalar (masalan cefrVocab1) foydalanuvchi kabinetiga saqlanadi.
CREATE TABLE IF NOT EXISTS platform_saved_guides (
 user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 guide_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,guide_id)
);
