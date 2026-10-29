CREATE TABLE IF NOT EXISTS lesson_controls (
 lesson_id integer PRIMARY KEY REFERENCES lessons(id) ON DELETE CASCADE,
 dashboard_visible boolean NOT NULL DEFAULT true,
 sort_order integer NOT NULL DEFAULT 0,
 trial_mode text NOT NULL DEFAULT 'none' CHECK(trial_mode IN ('none','full','preview')),
 preview_segments integer NOT NULL DEFAULT 3 CHECK(preview_segments BETWEEN 1 AND 20),
 level_note text NOT NULL DEFAULT '',
 updated_at timestamptz NOT NULL DEFAULT now()
);
