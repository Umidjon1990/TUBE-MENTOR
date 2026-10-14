import type { Request } from "express";
import {
  lessonAccess as grants,
  lessons,
  users,
  type Lesson,
} from "@shared/schema";
import { and, eq, isNull } from "drizzle-orm";
import { cefrLevel, publishedLesson } from "@shared/learning";
import { LESSON_COST } from "@shared/commerce";
import { getCommerceSettings } from "./commerce";
import { storage } from "./storage";
import { db } from "./db";
import { hasVerifiedIdentity } from "./auth";

export type LessonAccess = "demo" | "owned" | "locked" | "admin";
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const requestAccess = new WeakMap<
  Request,
  Promise<{ demoLessonId: number | null; owned: Set<number> }>
>();
function accessContext(req: Request) {
  let context = requestAccess.get(req);
  if (!context) {
    context = Promise.all([
      getCommerceSettings(),
      req.session.userId
        ? db
            .select({ lessonId: grants.lessonId })
            .from(grants)
            .where(
              and(
                eq(grants.userId, req.session.userId),
                isNull(grants.revokedAt),
              ),
            )
        : Promise.resolve([]),
    ]).then(([settings, owned]) => ({
      demoLessonId: settings.demoLessonId,
      owned: new Set(owned.map((grant) => grant.lessonId)),
    }));
    requestAccess.set(req, context);
  }
  return context;
}

/** Catalog metadata is safe even when a learner has not purchased the lesson. */
export function lessonCard(
  lesson: Lesson,
  access: LessonAccess,
  completion = 0,
) {
  return {
    id: lesson.id,
    title: lesson.title,
    description: lesson.description,
    thumbnailUrl: lesson.thumbnailUrl,
    level: cefrLevel(lesson.level),
    targetLanguage: lesson.targetLanguage,
    contentVersion: lesson.contentVersion,
    categoryId: lesson.categoryId,
    isFeatured: lesson.isFeatured,
    completionPercent: completion,
    access,
    priceCoins: access === "demo" ? 0 : LESSON_COST,
  };
}

export async function lessonAccess(
  req: Request,
  lesson: Lesson,
  tx?: Tx,
): Promise<LessonAccess> {
  if (req.session.userRole === "admin" && req.session.userId) return "admin";
  if (tx) {
    // Queries inside a transaction must use its own connection, including configuration.
    const settings = await getCommerceSettings(tx);
    if (
      settings.demoLessonId === lesson.id &&
      lesson.status !== "archived" &&
      publishedLesson(lesson)
    )
      return "demo";
    if (req.session.userId) {
      const [grant] = await tx
        .select({ id: grants.id })
        .from(grants)
        .where(
          and(
            eq(grants.userId, req.session.userId),
            eq(grants.lessonId, lesson.id),
            isNull(grants.revokedAt),
          ),
        );
      if (grant) return "owned";
    }
    return "locked";
  }
  const context = await accessContext(req);
  if (
    context.demoLessonId === lesson.id &&
    lesson.status !== "archived" &&
    publishedLesson(lesson)
  )
    return "demo";
  if (req.session.userId && context.owned.has(lesson.id)) return "owned";
  return "locked";
}

export async function catalogCard(
  req: Request,
  lesson: Lesson,
  completion = 0,
) {
  return lessonCard(lesson, await lessonAccess(req, lesson), completion);
}

/** All content routes use the same entitlement check, including legacy routes. */
export async function accessibleLesson(
  req: Request,
  id: number,
  tx?: Tx,
): Promise<Lesson> {
  if (tx && req.session.userId) {
    const [user] = await tx
      .select()
      .from(users)
      .where(eq(users.id, req.session.userId));
    if (
      !user?.isActive ||
      !hasVerifiedIdentity(user) ||
      user.sessionVersion !== (req.session.authVersion ?? 0)
    )
      throw Object.assign(
        new Error("Hisob holati yangilangan. Hisobingizga qayta kiring"),
        { status: 401 },
      );
    req.session.userRole = user.role;
  }
  const source = tx
    ? (await tx.select().from(lessons).where(eq(lessons.id, id)))[0]
    : await storage.getLessonById(id);
  if (!source)
    throw Object.assign(new Error("Dars topilmadi"), { status: 404 });
  if (req.query.preview === "1") {
    if (req.session.userRole === "admin" && req.session.userId) return source;
    throw Object.assign(new Error("Ko‘rib chiqish huquqi yo‘q"), {
      status: 403,
    });
  }
  const published = publishedLesson(source);
  if (req.session.userRole === "admin" && req.session.userId)
    return published || source;
  if (!published)
    throw Object.assign(new Error("Dars nashr qilinmagan"), { status: 404 });
  const access = await lessonAccess(req, source, tx);
  if (access === "demo" || access === "owned")
    return source.status === "archived"
      ? { ...published, status: "archived" }
      : published;
  throw Object.assign(
    new Error(
      req.session.userId
        ? "Darsni coin bilan oching"
        : "Darsni ochish uchun hisobingizga kiring",
    ),
    {
      status: req.session.userId ? 402 : 401,
      code: req.session.userId ? "LESSON_LOCKED" : "LOGIN_REQUIRED",
      lessonId: id,
      priceCoins: LESSON_COST,
      lesson: lessonCard(published, "locked"),
    },
  );
}

export async function readableLessons(
  req: Request,
  includeAdminDrafts = false,
): Promise<Lesson[]> {
  const sources = await storage.getAllLessons();
  if (
    includeAdminDrafts &&
    req.session.userId &&
    req.session.userRole === "admin"
  )
    return sources;
  const decisions = await Promise.all(
    sources.map(async (source) => {
      const published = publishedLesson(source);
      if (!published) return null;
      const access = await lessonAccess(req, source);
      return access === "locked"
        ? null
        : source.status === "archived"
          ? { ...published, status: "archived" }
          : published;
    }),
  );
  return decisions.filter((lesson): lesson is Lesson => lesson !== null);
}

/** Closing sales keeps the reviewed version available to previous purchasers. */
export async function archiveLesson(id: number) {
  const source = await storage.getLessonById(id);
  if (!source)
    throw Object.assign(new Error("Dars topilmadi"), { status: 404 });
  const published = publishedLesson(source);
  const { publishedSnapshot: _snapshot, ...snapshot } = published || source;
  return storage.updateLesson(id, {
    status: "archived",
    ...(published
      ? {
          publishedSnapshot: source.publishedSnapshot || snapshot,
          publishedAt: source.publishedAt || new Date(),
        }
      : {}),
  });
}

export async function filterLessonItems<T extends { lessonId: number }>(
  req: Request,
  items: T[],
): Promise<T[]> {
  const readable = new Set(
    (await readableLessons(req, true)).map((lesson) => lesson.id),
  );
  return items.filter((item) => readable.has(item.lessonId));
}

/** Never expose saved publication snapshots, AI internals, or quiz answer keys. */
export async function learnerLessonContent(req: Request, lesson: Lesson) {
  return {
    ...(await catalogCard(req, lesson)),
    youtubeUrl: lesson.youtubeUrl,
    summaryShort: lesson.summaryShort,
    summaryDetailed: lesson.summaryDetailed,
    transcript: lesson.transcript,
    subtitlesJson: lesson.subtitlesJson,
    vocabularyJson: lesson.vocabularyJson,
    sentenceAnalysisJson: lesson.sentenceAnalysisJson,
    phrasesJson: lesson.phrasesJson,
    flashcardsJson: lesson.flashcardsJson,
    wordTimestampsJson: lesson.wordTimestampsJson,
    summaryShortAr: lesson.summaryShortAr,
    summaryDetailedAr: lesson.summaryDetailedAr,
    quizzesJson: [],
    status: lesson.status,
    publishedAt: lesson.publishedAt,
  };
}
