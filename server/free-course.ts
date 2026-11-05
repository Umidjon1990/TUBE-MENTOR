import { z } from "zod";
import { pool } from "./db";
import { youtubeId } from "@shared/learning";

export const freeA0Id = "bosqichli-arab-tili-a0";
const sourceId = "b3ca0baa-971b-4b5b-9e1f-d2525d0cb089";
const sourceUrl =
  "https://zamonaviy-videokurs.up.railway.app/api/courses/" +
  sourceId +
  "/lessons/public";

const sourceLesson = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(300),
  description: z.string().max(5000).optional(),
  duration: z.number().int().positive().max(240).nullable(),
  order: z.number().int(),
  isDemo: z.literal(true),
  videoUrl: z.string().max(1024),
  courseId: z.literal(sourceId),
});

async function fetchLessons() {
  try {
    const response = await fetch(sourceUrl, {
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
    if (!response.ok) throw new Error("Course source unavailable");
    const rows = z
      .array(sourceLesson)
      .min(1)
      .max(200)
      .parse(await response.json());
    const lessons = rows
      .sort((a, b) => a.order - b.order)
      .map((row) => {
        const videoId = youtubeId(row.videoUrl);
        if (!videoId) throw new Error("Invalid course video");
        return {
          id: row.id,
          title: row.title.replace(/^(\d+)\s*-\s*dars\b/i, "$1-dars"),
          description: row.description || "",
          durationMinutes: row.duration,
          videoId,
        };
      });
    if (new Set(lessons.map((lesson) => lesson.id)).size !== lessons.length)
      throw new Error("Duplicate lesson ID");
    return lessons;
  } catch {
    throw Object.assign(
      new Error(
        "A0 darslar ro‘yxati vaqtincha yuklanmadi. Qayta urinib ko‘ring.",
      ),
      { status: 503 },
    );
  }
}

let cache:
  | { until: number; lessons: Awaited<ReturnType<typeof fetchLessons>> }
  | undefined;
let pending: ReturnType<typeof fetchLessons> | undefined;
export function a0Lessons() {
  if (cache && cache.until > Date.now()) return Promise.resolve(cache.lessons);
  pending ??= fetchLessons()
    .then((lessons) => {
      cache = { lessons, until: Date.now() + 60000 };
      return lessons;
    })
    .finally(() => {
      pending = undefined;
    });
  return pending;
}

export async function a0Outline() {
  return (await a0Lessons()).map(({ videoId, ...lesson }) => lesson);
}

export async function a0Demo() {
  const lesson = (await a0Lessons())[0];
  return {
    kind: "video",
    title: lesson.title,
    youtubeId: lesson.videoId,
    endSeconds: 30,
  };
}

type Range = [number, number];
const maxDuration = 14400;
export const a0ProgressInput = z
  .object({
    videoId: z.string().regex(/^[\w-]{11}$/),
    position: z.number().finite().min(0).max(maxDuration),
    duration: z.number().finite().positive().max(maxDuration),
    ranges: z
      .array(
        z.tuple([
          z.number().finite().min(0).max(maxDuration),
          z.number().finite().min(0).max(maxDuration),
        ]),
      )
      .max(120),
  })
  .strict();

export function mergeWatchedRanges(ranges: Range[], duration: number): Range[] {
  const merged: Range[] = [];
  for (const [rawStart, rawEnd] of ranges.slice().sort((a, b) => a[0] - b[0])) {
    const start = Math.max(0, Math.min(rawStart, duration));
    const end = Math.max(0, Math.min(rawEnd, duration));
    if (end <= start) continue;
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  // Keep the largest intervals if unusually fragmented playback reaches the storage cap.
  return merged.length <= 240
    ? merged
    : merged.sort((a, b) => b[1] - b[0] - (a[1] - a[0])).slice(0, 240);
}

function progressDto(row: any) {
  const watchedSeconds = (row.watched_ranges as Range[]).reduce(
    (sum, [a, b]) => sum + b - a,
    0,
  );
  return {
    position: row.last_position as number,
    duration: row.duration_seconds as number,
    watchedPercent: Math.min(
      100,
      Math.floor((watchedSeconds * 100) / row.duration_seconds),
    ),
    completed: watchedSeconds >= row.duration_seconds * 0.9,
  };
}

function courseSummary(
  lessons: Awaited<ReturnType<typeof a0Lessons>>,
  rows: any[],
) {
  const states = new Map(rows.map((row) => [row.lesson_id, row]));
  const valid = lessons.flatMap((lesson) => {
    const row = states.get(lesson.id);
    return row?.video_id === lesson.videoId ? [row] : [];
  });
  const completedLessons = valid.filter(
    (row) => progressDto(row).completed,
  ).length;
  const recent = valid.sort(
    (a, b) => +new Date(b.updated_at) - +new Date(a.updated_at),
  )[0];
  const resume =
    recent && !progressDto(recent).completed
      ? lessons.find((lesson) => lesson.id === recent.lesson_id)
      : lessons.find(
          (lesson) =>
            !valid.some(
              (row) =>
                row.lesson_id === lesson.id && progressDto(row).completed,
            ),
        );
  const resumeState =
    resume && valid.find((row) => row.lesson_id === resume.id);
  return {
    lessonCount: lessons.length,
    completedLessons,
    completionPercent: Math.floor((completedLessons * 100) / lessons.length),
    resume: resume
      ? {
          lessonId: resume.id,
          title: resume.title,
          position: resumeState?.last_position ?? 0,
        }
      : null,
  };
}

async function progressRows(userId: string) {
  return (
    await pool.query(
      "SELECT * FROM free_course_progress WHERE user_id=$1 AND product_id=$2",
      [userId, freeA0Id],
    )
  ).rows;
}

export async function a0View(userId: string) {
  const [lessons, rows] = await Promise.all([
    a0Lessons(),
    progressRows(userId),
  ]);
  const progress = Object.fromEntries(
    rows
      .filter((row) =>
        lessons.some(
          (lesson) =>
            lesson.id === row.lesson_id && lesson.videoId === row.video_id,
        ),
      )
      .map((row) => [row.lesson_id, progressDto(row)]),
  );
  return { lessons, progress, ...courseSummary(lessons, rows) };
}

export async function a0Library(userId: string) {
  const [lessons, rows] = await Promise.all([
    a0Lessons(),
    progressRows(userId),
  ]);
  return courseSummary(lessons, rows);
}

export async function saveA0Progress(
  userId: string,
  orderId: string,
  lessonId: string,
  input: z.infer<typeof a0ProgressInput>,
) {
  const lesson = (await a0Lessons()).find(
    (item) => item.id === lessonId && item.videoId === input.videoId,
  );
  if (!lesson)
    throw Object.assign(new Error("Video yangilangan. Darsni qayta oching."), {
      status: 409,
    });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const access = await client.query(
      "SELECT id FROM platform_orders WHERE id=$1 AND user_id=$2 AND product_id=$3 AND status='active' FOR UPDATE",
      [orderId, userId, freeA0Id],
    );
    if (!access.rowCount)
      throw Object.assign(new Error("Kursni kabinetga qo‘shing."), {
        status: 403,
      });
    const previous = (
      await client.query(
        "SELECT * FROM free_course_progress WHERE user_id=$1 AND product_id=$2 AND lesson_id=$3",
        [userId, freeA0Id, lessonId],
      )
    ).rows[0];
    const priorRanges =
      previous?.video_id === input.videoId
        ? (previous.watched_ranges as Range[])
        : [];
    const ranges = mergeWatchedRanges(
      [...priorRanges, ...input.ranges],
      input.duration,
    );
    const position = Math.min(input.position, input.duration);
    const result = (
      await client.query(
        `INSERT INTO free_course_progress(user_id,product_id,lesson_id,video_id,last_position,duration_seconds,watched_ranges)
       VALUES($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT(user_id,product_id,lesson_id) DO UPDATE SET video_id=excluded.video_id,last_position=excluded.last_position,
       duration_seconds=excluded.duration_seconds,watched_ranges=excluded.watched_ranges,updated_at=now()
       RETURNING *`,
        [
          userId,
          freeA0Id,
          lessonId,
          input.videoId,
          position,
          input.duration,
          JSON.stringify(ranges),
        ],
      )
    ).rows[0];
    await client.query("COMMIT");
    return progressDto(result);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
