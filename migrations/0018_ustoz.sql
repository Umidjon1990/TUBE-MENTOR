-- O'qituvchi xonasi: o'qituvchi/yordamchi rollari, guruhga biriktirish, o'quvchi eslatmalari,
-- chatda ovoz/rasm/fayl, qadalgan xabar, bir nechta guruhga e'lon, tayyor javoblar.
CREATE TABLE IF NOT EXISTS cls_staff (
 user_id varchar PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 role text NOT NULL DEFAULT 'teacher',
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cls_group_staff (
 group_id uuid NOT NULL REFERENCES cls_groups(id) ON DELETE CASCADE,
 user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 role text NOT NULL DEFAULT 'teacher',
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(group_id, user_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS cls_group_staff_user ON cls_group_staff(user_id);
--> statement-breakpoint
INSERT INTO cls_group_staff(group_id,user_id,role) SELECT id, teacher_id, 'teacher' FROM cls_groups WHERE teacher_id IS NOT NULL ON CONFLICT DO NOTHING;
--> statement-breakpoint
ALTER TABLE cls_courses ADD COLUMN IF NOT EXISTS owner_id varchar REFERENCES users(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cls_student_notes (
 id bigserial PRIMARY KEY,
 student_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 author_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 body text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS cls_student_notes_student ON cls_student_notes(student_id, id);
--> statement-breakpoint
ALTER TABLE cls_messages ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'text';
--> statement-breakpoint
ALTER TABLE cls_messages ADD COLUMN IF NOT EXISTS file_key text;
--> statement-breakpoint
ALTER TABLE cls_messages ADD COLUMN IF NOT EXISTS file_mime text;
--> statement-breakpoint
ALTER TABLE cls_messages ADD COLUMN IF NOT EXISTS file_name text;
--> statement-breakpoint
ALTER TABLE cls_messages ADD COLUMN IF NOT EXISTS file_size integer;
--> statement-breakpoint
ALTER TABLE cls_messages ADD COLUMN IF NOT EXISTS audio_seconds integer;
--> statement-breakpoint
ALTER TABLE cls_messages ADD COLUMN IF NOT EXISTS broadcast_id uuid;
--> statement-breakpoint
ALTER TABLE cls_groups ADD COLUMN IF NOT EXISTS pinned_message_id bigint;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cls_quick_replies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 body text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
