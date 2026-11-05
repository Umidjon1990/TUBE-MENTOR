INSERT INTO platform_products (
  id, provider, source_id, kind, title, description, thumbnail_url, level,
  price_coins, demo_ref, status, source_metadata
) VALUES (
  'bosqichli-arab-tili-a0', 'courses', 'b3ca0baa-971b-4b5b-9e1f-d2525d0cb089',
  'course', 'Bosqichli arab tili A0',
  'Arab tilini ilk bosqichdan boshlang. Mavjud 20 ta video darsni o‘z tartibingizda ko‘ring.',
  '/covers/a0.webp', 'A0', 0, 'a0-first-lesson', 'published',
  '{"lessonCount":20,"durationMinutes":149}'::jsonb
) ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS free_course_progress (
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id varchar NOT NULL REFERENCES platform_products(id),
  lesson_id uuid NOT NULL,
  video_id varchar(11) NOT NULL,
  last_position real NOT NULL,
  duration_seconds real NOT NULL,
  watched_ranges jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id, lesson_id)
);
