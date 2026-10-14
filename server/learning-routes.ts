import type { Express, Request } from "express";
import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, isNotNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { storage } from "./storage";
import { requireAuth, requireRole } from "./auth";
import { safeUser } from "./auth-routes";
import {
  accessibleLesson,
  catalogCard,
  filterLessonItems,
  readableLessons,
  lessonAccess,
} from "./access";
import { getCommerceSettings } from "./commerce";
import { rateLimit } from "./security";
import {
  collections,
  learningEvents,
  learningSessions,
  lessonAttempts,
  lessonProgress,
  lessons,
  reviewAnswers,
  savedWords,
  users,
  wordReviews,
  xpAwards,
  type Lesson,
  type User,
} from "@shared/schema";
import {
  buildQuestions,
  CEFR_LEVELS,
  cefrLevel,
  gradeAnswer,
  lessonSegments,
  lessonVocabulary,
  localDay,
  normalizeAnswer,
  publicationProblems,
  publicQuestion,
  publishedLesson,
  scheduleReview,
  STAGES,
  type LessonWord,
  type Question,
  type Stage,
} from "@shared/learning";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DemoAttempt = {
  id: string;
  lessonId: number;
  contentVersion: number;
  kind: "practice" | "vocabulary";
  questions: Question[];
  answers: { questionId: string; answer: string; correct: boolean }[];
  expiresAt: number;
  finishedAt: string | null;
};
declare module "express-session" {
  interface SessionData {
    demoAttempts: DemoAttempt[];
  }
}
const idSchema = z.coerce.number().int().positive();
const fail = (status: number, message: string) => {
  throw Object.assign(new Error(message), { status });
};
const parse = <S extends z.ZodTypeAny>(
  schema: S,
  data: unknown,
): z.output<S> => {
  const result = schema.safeParse(data);
  if (!result.success) fail(400, result.error.issues[0].message);
  return result.data!;
};
async function currentUser(req: Request): Promise<User> {
  const user = await storage.getUser(req.session.userId!);
  return user || fail(401, "Hisob topilmadi");
}
async function allPublished(includeArchived = false) {
  return (await storage.getAllLessons())
    .filter((lesson) => includeArchived || lesson.status !== "archived")
    .map((source) => {
      const published = publishedLesson(source);
      return published && source.status === "archived"
        ? { ...published, status: "archived" }
        : published;
    })
    .filter((l): l is Lesson => Boolean(l));
}
async function lockedProgress(tx: Tx, userId: string, lesson: Lesson) {
  await tx
    .insert(lessonProgress)
    .values({
      userId,
      lessonId: lesson.id,
      contentVersion: lesson.contentVersion,
    })
    .onConflictDoNothing();
  let [progress] = await tx
    .select()
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.lessonId, lesson.id),
      ),
    )
    .for("update");
  if (progress.contentVersion !== lesson.contentVersion)
    [progress] = await tx
      .update(lessonProgress)
      .set({
        contentVersion: lesson.contentVersion,
        completedStages: [],
        completionPercent: 0,
        accuracy: 0,
        completedQuizzes: 0,
        playbackPosition: 0,
        segmentIndex: 0,
      })
      .where(eq(lessonProgress.id, progress.id))
      .returning();
  return progress;
}
async function award(tx: Tx, user: User, key: string, amount: number) {
  const inserted = await tx
    .insert(xpAwards)
    .values({ userId: user.id, awardKey: key, amount })
    .onConflictDoNothing()
    .returning();
  if (!inserted.length) return 0;
  const [locked] = await tx
    .select()
    .from(users)
    .where(eq(users.id, user.id))
    .for("update");
  const today = localDay(new Date(), user.timezone);
  const yesterday = new Date(Date.parse(`${today}T12:00:00Z`) - 86400000)
    .toISOString()
    .slice(0, 10);
  const streak =
    locked.lastStudyDate === today
      ? locked.streakDays
      : locked.lastStudyDate === yesterday
        ? locked.streakDays + 1
        : 1;
  const xp = locked.xp + amount;
  const badges = [...(locked.badges || [])];
  if (streak >= 7 && !badges.includes("streak_7")) badges.push("streak_7");
  await tx
    .update(users)
    .set({
      xp,
      level: Math.floor(xp / 100) + 1,
      streakDays: streak,
      lastStudyDate: today,
      badges,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));
  return amount;
}
async function finishStage(tx: Tx, user: User, lesson: Lesson, stage: Stage) {
  const progress = await lockedProgress(tx, user.id, lesson);
  const completedStages = [
    ...new Set([...(progress.completedStages || []), stage]),
  ];
  const [updated] = await tx
    .update(lessonProgress)
    .set({
      completedStages,
      completionPercent: Math.round(
        (completedStages.filter((s) =>
          (STAGES as readonly string[]).includes(s),
        ).length /
          STAGES.length) *
          100,
      ),
      lastStudiedAt: new Date(),
    })
    .where(eq(lessonProgress.id, progress.id))
    .returning();
  const xp = await award(
    tx,
    user,
    `lesson:${lesson.id}:${lesson.contentVersion}:${stage}`,
    stage === "practice" || stage === "vocabulary" ? 15 : 5,
  );
  return { progress: updated, xp };
}
async function addReview(
  tx: Tx,
  userId: string,
  lessonId: number,
  word: LessonWord,
  immediate = false,
) {
  await tx
    .insert(wordReviews)
    .values({
      userId,
      lessonId,
      normalized: word.normalized,
      word: word.word,
      meaning: word.meaning,
      sourceSentence: word.sourceSentence,
      subtitleTime: word.subtitleTime,
      dueAt: new Date(Date.now() + (immediate ? 0 : 86400000)),
    })
    .onConflictDoUpdate({
      target: [
        wordReviews.userId,
        wordReviews.lessonId,
        wordReviews.normalized,
      ],
      set: immediate
        ? { dueAt: new Date(), repetitions: 0 }
        : { word: word.word, meaning: word.meaning },
    });
}
function clientAttempt(attempt: typeof lessonAttempts.$inferSelect) {
  const questions = attempt.questions as Question[];
  return {
    id: attempt.id,
    kind: attempt.kind,
    lessonId: attempt.lessonId,
    questions: questions.map(publicQuestion),
    answers: attempt.answers,
    score: attempt.score,
    finishedAt: attempt.finishedAt,
    contentVersion: attempt.contentVersion,
  };
}

export async function registerLearningRoutes(app: Express) {
  app.get("/api/learn/notes", requireAuth, async (req, res) => {
    res.json(
      (
        await filterLessonItems(
          req,
          await storage.getNotesByUser(req.session.userId!),
        )
      ).sort(
        (a, b) =>
          Number(b.isPinned) - Number(a.isPinned) ||
          b.createdAt.getTime() - a.createdAt.getTime(),
      ),
    );
  });
  app.get("/api/learn/cards", requireAuth, async (req, res) => {
    res.json(
      await filterLessonItems(
        req,
        await storage.getFlashcardsByUser(req.session.userId!),
      ),
    );
  });
  app.post("/api/learn/lessons/:id/notes", requireAuth, async (req, res) => {
    const lesson = await accessibleLesson(req, parse(idSchema, req.params.id));
    const body = parse(
      z
        .object({
          content: z.string().trim().min(1).max(5000),
          sentenceIndex: z.number().int().nonnegative().optional(),
        })
        .strict(),
      req.body,
    );
    res.status(201).json(
      await storage.createNote({
        ...body,
        lessonId: lesson.id,
        userId: req.session.userId!,
      }),
    );
  });
  app.get(
    "/api/studio/config",
    requireRole("teacher", "admin"),
    async (_req, res) => {
      res.json({
        lessonCreationCost: 0,
        aiEnabled: Boolean(
          process.env.OPENAI_API_KEY ||
            process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        ),
      });
    },
  );
  app.delete("/api/user/saved-words/:id", requireAuth, async (req, res) => {
    const id = parse(idSchema, req.params.id);
    await db.transaction(async (tx) => {
      await tx
        .select()
        .from(users)
        .where(eq(users.id, req.session.userId!))
        .for("update");
      const [word] = await tx
        .select()
        .from(savedWords)
        .where(
          and(
            eq(savedWords.id, id),
            eq(savedWords.userId, req.session.userId!),
          ),
        );
      if (!word) return fail(404, "So‘z topilmadi");
      await tx.delete(savedWords).where(eq(savedWords.id, id));
      const [remaining] = await tx
        .select()
        .from(savedWords)
        .where(
          and(
            eq(savedWords.userId, req.session.userId!),
            eq(savedWords.lessonId, word.lessonId),
            eq(savedWords.normalized, word.normalized),
          ),
        )
        .limit(1);
      if (!remaining)
        await tx
          .delete(wordReviews)
          .where(
            and(
              eq(wordReviews.userId, req.session.userId!),
              eq(wordReviews.lessonId, word.lessonId),
              eq(wordReviews.normalized, word.normalized),
            ),
          );
    });
    res.json({ success: true });
  });
  app.get("/api/learn/catalog", async (req, res) => {
    const language =
      req.query.language === "en"
        ? "en"
        : req.query.language === "ar"
          ? "ar"
          : req.query.owned === "1"
            ? ""
            : "ar";
    const level = typeof req.query.level === "string" ? req.query.level : "";
    const q = String(req.query.q || "")
      .slice(0, 100)
      .toLocaleLowerCase();
    const page = Math.max(1, Math.min(10000, Number(req.query.page) || 1));
    const ownedOnly = req.query.owned === "1";
    const candidates = await allPublished(ownedOnly);
    const decisions = ownedOnly
      ? await Promise.all(
          candidates.map(async (lesson) =>
            (await lessonAccess(req, lesson)) === "owned" ? lesson : null,
          ),
        )
      : candidates;
    const all = decisions.filter((lesson): lesson is Lesson => lesson !== null);
    const matching = all.filter(
      (l) =>
        (!language || l.targetLanguage === language) &&
        (!level || cefrLevel(l.level) === level) &&
        (!q ||
          `${l.title} ${l.description || ""}`.toLocaleLowerCase().includes(q)),
    );
    const progress = req.session.userId
      ? await storage.getProgressByUser(req.session.userId)
      : [];
    const completion = (l: Lesson) => {
      const p = progress.find(
        (p) => p.lessonId === l.id && p.contentVersion === l.contentVersion,
      );
      return p?.completionPercent || 0;
    };
    const courseCards = await Promise.all(
      (await storage.getPublishedCollections())
        .filter(
          (c) =>
            (!language || c.targetLanguage === language) &&
            (!level || cefrLevel(c.level) === level),
        )
        .map(async (c) => {
          const links = await storage.getCollectionLessons(c.id);
          const visible = links
            .map((link) => all.find((l) => l.id === link.lessonId))
            .filter((l): l is Lesson => Boolean(l));
          return {
            id: c.id,
            name: c.name,
            description: c.description,
            coverImage: c.coverImage,
            level: cefrLevel(c.level),
            targetLanguage: c.targetLanguage,
            lessonCount: visible.length,
            completedCount: visible.filter((l) => completion(l) === 100).length,
            completionPercent: visible.length
              ? Math.round(
                  visible.reduce((sum, l) => sum + completion(l), 0) /
                    visible.length,
                )
              : 0,
          };
        }),
    );
    res.json({
      courses: courseCards.filter(
        (c) => c.lessonCount && (!q || c.name.toLocaleLowerCase().includes(q)),
      ),
      lessons: await Promise.all(
        matching
          .slice((page - 1) * 20, page * 20)
          .map((l) => catalogCard(req, l, completion(l))),
      ),
      total: matching.length,
      page,
      availableLevels: [
        ...new Set(
          all
            .filter((l) => !language || l.targetLanguage === language)
            .map((l) => cefrLevel(l.level)),
        ),
      ].sort(),
    });
  });
  app.get("/api/learn/courses/:id", async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const collection = await storage.getCollectionById(id);
    if (!collection || collection.status !== "published")
      return fail(404, "Kurs topilmadi");
    const links = (await storage.getCollectionLessons(id)).sort(
      (a, b) => a.orderIndex - b.orderIndex,
    );
    const all = await allPublished();
    const progress = req.session.userId
      ? await storage.getProgressByUser(req.session.userId)
      : [];
    const visible = links
      .map((link) => all.find((l) => l.id === link.lessonId))
      .filter((l): l is Lesson => Boolean(l));
    res.json({
      id,
      name: collection.name,
      description: collection.description,
      coverImage: collection.coverImage,
      level: cefrLevel(collection.level),
      lessons: await Promise.all(
        visible.map((l) =>
          catalogCard(
            req,
            l,
            progress.find(
              (p) =>
                p.lessonId === l.id && p.contentVersion === l.contentVersion,
            )?.completionPercent || 0,
          ),
        ),
      ),
    });
  });
  app.patch("/api/learn/preferences", requireAuth, async (req, res) => {
    const prefs = parse(
      z
        .object({
          fullName: z.string().trim().min(2).max(100).optional(),
          targetLanguage: z.enum(["ar", "en"]).optional(),
          learningLevel: z.enum(CEFR_LEVELS).optional(),
          dailyGoalMinutes: z.number().int().min(5).max(120).optional(),
          timezone: z
            .string()
            .max(80)
            .refine((value) => {
              try {
                new Intl.DateTimeFormat("en", { timeZone: value });
                return true;
              } catch {
                return false;
              }
            }, "Vaqt mintaqasi noto‘g‘ri")
            .optional(),
          onboardingCompleted: z.boolean().optional(),
        })
        .strict(),
      req.body,
    );
    const [updated] = await db
      .update(users)
      .set({ ...prefs, updatedAt: new Date() })
      .where(eq(users.id, req.session.userId!))
      .returning();
    res.json(safeUser(updated));
  });
  app.get("/api/learn/today", requireAuth, async (req, res) => {
    const user = await currentUser(req);
    const all = await readableLessons(req);
    const progress = await storage.getProgressByUser(user.id);
    const recent = [...progress]
      .sort((a, b) => Number(b.lastStudiedAt) - Number(a.lastStudiedAt))
      .find(
        (p) =>
          p.completionPercent !== 100 &&
          all.some(
            (l) => l.id === p.lessonId && l.contentVersion === p.contentVersion,
          ),
      );
    const next =
      all.find((l) => l.id === recent?.lessonId) ||
      all.find(
        (l) =>
          l.targetLanguage === user.targetLanguage &&
          cefrLevel(l.level) === user.learningLevel &&
          !progress.some(
            (p) =>
              p.lessonId === l.id &&
              p.completionPercent === 100 &&
              p.contentVersion === l.contentVersion,
          ),
      );
    const today = localDay(new Date(), user.timezone);
    const [activity] = await db
      .select({
        seconds: sql<number>`coalesce(sum(${learningEvents.studySeconds}),0)`,
      })
      .from(learningEvents)
      .where(
        and(
          eq(learningEvents.userId, user.id),
          sql`(${learningEvents.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE ${user.timezone})::date = ${today}::date`,
        ),
      );
    const [due] = await db
      .select({ count: sql<number>`count(*)` })
      .from(wordReviews)
      .where(
        and(
          eq(wordReviews.userId, user.id),
          lte(wordReviews.dueAt, new Date()),
        ),
      );
    res.json({
      user: safeUser(user),
      studySeconds: Number(activity.seconds),
      dueWords: Number(due.count),
      continueLesson: next
        ? await catalogCard(
            req,
            next,
            progress.find(
              (p) =>
                p.lessonId === next.id &&
                p.contentVersion === next.contentVersion,
            )?.completionPercent || 0,
          )
        : null,
      completedLessons: progress.filter((p) => p.completionPercent === 100)
        .length,
    });
  });
  app.get("/api/learn/analytics", requireAuth, async (req, res) => {
    const user = await currentUser(req);
    const events = await db
      .select()
      .from(learningEvents)
      .where(
        and(
          eq(learningEvents.userId, user.id),
          sql`${learningEvents.createdAt} >= now() - interval '7 days'`,
        ),
      );
    const weekly = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(Date.now() - (6 - i) * 86400000);
      const day = localDay(date, user.timezone);
      return {
        date: day,
        seconds: events
          .filter((e) => localDay(e.createdAt, user.timezone) === day)
          .reduce((sum, e) => sum + e.studySeconds, 0),
      };
    });
    const progress = await storage.getProgressByUser(user.id);
    const words = await storage.getSavedWordsByUser(user.id);
    res.json({
      weekly,
      user: safeUser(user),
      completedLessons: progress.filter((p) => p.completionPercent === 100)
        .length,
      savedWords: words.length,
      totalStudySeconds: Number(
        (
          await db
            .select({
              seconds: sql<number>`coalesce(sum(${learningEvents.studySeconds}),0)`,
            })
            .from(learningEvents)
            .where(eq(learningEvents.userId, user.id))
        )[0].seconds,
      ),
    });
  });
  const lessonDto = async (req: Request, lesson: Lesson) => ({
    ...(await catalogCard(req, lesson)),
    youtubeUrl: lesson.youtubeUrl,
    summary: lesson.summaryShort,
    segments: lessonSegments(lesson),
    vocabulary: lessonVocabulary(lesson),
    practiceCount: buildQuestions(lesson, "practice").length,
    vocabularyCount: buildQuestions(lesson, "vocabulary").length,
  });
  app.get("/api/learn/preview/:id", async (req, res) => {
    const lesson = await accessibleLesson(req, parse(idSchema, req.params.id));
    res.json({
      ...(await lessonDto(req, lesson)),
      progress: null,
      preview: true,
      canEdit: false,
    });
  });
  // The sample lesson is usable without registration; answers stay in a bounded
  // server-side session and cannot create XP, balances, or persistent progress.
  app.post(
    "/api/learn/preview/:id/attempts",
    rateLimit("demo-attempt", 30, 300),
    async (req, res) => {
      const lessonId = parse(idSchema, req.params.id);
      if ((await getCommerceSettings()).demoLessonId !== lessonId)
        return fail(403, "Bu dars namuna dars emas");
      const lesson = await accessibleLesson(req, lessonId);
      const { kind } = parse(
        z.object({ kind: z.enum(["practice", "vocabulary"]) }).strict(),
        req.body,
      );
      const attempts = (req.session.demoAttempts || [])
        .filter((attempt) => attempt.expiresAt > Date.now())
        .slice(-5);
      let attempt = attempts.find(
        (attempt) =>
          attempt.lessonId === lesson.id &&
          attempt.contentVersion === lesson.contentVersion &&
          attempt.kind === kind &&
          !attempt.finishedAt,
      );
      if (!attempt) {
        const questions = buildQuestions(lesson, kind).slice(0, 100);
        if (!questions.length)
          return fail(409, "Bu dars uchun mashqlar hali tayyor emas");
        attempt = {
          id: randomUUID(),
          lessonId: lesson.id,
          contentVersion: lesson.contentVersion,
          kind,
          questions,
          answers: [],
          expiresAt: Date.now() + 20 * 60000,
          finishedAt: null,
        };
        attempts.push(attempt);
      }
      req.session.demoAttempts = attempts;
      res.json({
        id: attempt.id,
        lessonId: lesson.id,
        kind,
        contentVersion: lesson.contentVersion,
        questions: attempt.questions.map(publicQuestion),
        answers: attempt.answers,
        score: null,
        finishedAt: null,
      });
    },
  );
  app.post(
    "/api/learn/preview/:id/attempts/:attemptId/answers",
    rateLimit("demo-answer", 200, 300),
    async (req, res) => {
      const lessonId = parse(idSchema, req.params.id);
      if ((await getCommerceSettings()).demoLessonId !== lessonId)
        return fail(403, "Bu dars namuna dars emas");
      const lesson = await accessibleLesson(req, lessonId);
      const body = parse(
        z
          .object({
            questionId: z.string().max(100),
            answer: z.string().max(4000),
          })
          .strict(),
        req.body,
      );
      const attempt = req.session.demoAttempts?.find(
        (attempt) =>
          attempt.id === req.params.attemptId &&
          attempt.lessonId === lessonId &&
          attempt.expiresAt > Date.now(),
      );
      if (!attempt) return fail(404, "Namuna testi tugagan. Qayta boshlang");
      if (attempt.contentVersion !== lesson.contentVersion)
        return fail(409, "Dars yangilangan. Testni qayta boshlang");
      const question = attempt.questions.find(
        (question) => question.id === body.questionId,
      );
      if (!question) return fail(400, "Savol topilmadi");
      const previous = attempt.answers.find(
        (answer) => answer.questionId === question.id,
      );
      if (attempt.finishedAt && !previous) return fail(409, "Test yakunlangan");
      const correct = previous?.correct ?? gradeAnswer(question, body.answer);
      if (!previous)
        attempt.answers.push({
          questionId: question.id,
          answer: body.answer,
          correct,
        });
      const done = attempt.answers.length === attempt.questions.length;
      if (done) attempt.finishedAt ||= new Date().toISOString();
      const score = done
        ? Math.round(
            (attempt.answers.filter((answer) => answer.correct).length /
              attempt.questions.length) *
              100,
          )
        : null;
      // Explicitly mark the session dirty after changing a nested array.
      req.session.demoAttempts = [...req.session.demoAttempts!];
      res.json({
        correct,
        answer: question.answer,
        explanation: question.explanation,
        done,
        score,
        answered: attempt.answers.length,
        xp: 0,
      });
    },
  );
  app.get("/api/learn/lessons/:id", requireAuth, async (req, res) => {
    const lesson = await accessibleLesson(req, parse(idSchema, req.params.id));
    const preview = req.query.preview === "1";
    const progress = preview
      ? null
      : await db.transaction(async (tx) => {
          await tx
            .select()
            .from(users)
            .where(eq(users.id, req.session.userId!))
            .for("update");
          return lockedProgress(tx, req.session.userId!, lesson);
        });
    res.json({
      ...(await lessonDto(req, lesson)),
      completionPercent: progress?.completionPercent || 0,
      progress,
      preview,
      canEdit: req.session.userRole === "admin",
    });
  });
  app.post("/api/learn/preview/:id/transfer", requireAuth, async (req, res) => {
    parse(z.object({}).strict(), req.body);
    const lessonId = parse(idSchema, req.params.id);
    if ((await getCommerceSettings()).demoLessonId !== lessonId)
      return fail(403, "Faqat namuna dars natijasini saqlash mumkin");
    const lesson = await accessibleLesson(req, lessonId);
    const user = await currentUser(req);
    const completed = (req.session.demoAttempts || [])
      .filter(
        (attempt) =>
          attempt.lessonId === lessonId &&
          attempt.contentVersion === lesson.contentVersion &&
          attempt.expiresAt > Date.now() &&
          attempt.finishedAt &&
          attempt.questions.length > 0 &&
          attempt.answers.length === attempt.questions.length,
      )
      .map((attempt) => {
        // Regrade server-owned question snapshots rather than accepting a client score.
        const answers = attempt.questions.map((question) => {
          const submitted = attempt.answers.find(
            (answer) => answer.questionId === question.id,
          );
          return {
            questionId: question.id,
            answer: submitted?.answer || "",
            correct:
              Boolean(submitted) && gradeAnswer(question, submitted!.answer),
          };
        });
        return {
          ...attempt,
          answers,
          score: Math.round(
            (answers.filter((answer) => answer.correct).length /
              attempt.questions.length) *
              100,
          ),
        };
      });
    const selected = (["practice", "vocabulary"] as const)
      .map(
        (kind) =>
          completed
            .filter((attempt) => attempt.kind === kind)
            .sort((a, b) => b.score - a.score)[0],
      )
      .filter((attempt): attempt is NonNullable<typeof attempt> =>
        Boolean(attempt),
      );
    const importId = `demo-transfer:${user.id}:${lesson.id}:${lesson.contentVersion}`;
    const result = await db.transaction(async (tx) => {
      await tx.select().from(users).where(eq(users.id, user.id)).for("update");
      const [previous] = await tx
        .select()
        .from(learningEvents)
        .where(eq(learningEvents.id, importId));
      const progress = await lockedProgress(tx, user.id, lesson);
      if (previous) return { imported: false, progress };
      if (!selected.length)
        return fail(
          409,
          "Saqlash uchun avval namuna darsdagi testni yakunlang",
        );
      for (const attempt of selected) {
        const [best] = await tx
          .select()
          .from(lessonAttempts)
          .where(
            and(
              eq(lessonAttempts.userId, user.id),
              eq(lessonAttempts.lessonId, lesson.id),
              eq(lessonAttempts.contentVersion, lesson.contentVersion),
              eq(lessonAttempts.kind, attempt.kind),
              isNotNull(lessonAttempts.finishedAt),
            ),
          )
          .orderBy(desc(lessonAttempts.score))
          .limit(1);
        if (best && (best.score || 0) >= attempt.score) continue;
        await tx.insert(lessonAttempts).values({
          id: randomUUID(),
          userId: user.id,
          lessonId: lesson.id,
          contentVersion: lesson.contentVersion,
          kind: attempt.kind,
          questions: attempt.questions,
          answers: attempt.answers,
          score: attempt.score,
          finishedAt: new Date(attempt.finishedAt!),
        });
        for (const question of attempt.questions) {
          if (!question.word) continue;
          const word = question.word;
          const correct =
            attempt.answers.find((answer) => answer.questionId === question.id)
              ?.correct || false;
          const [saved] = await tx
            .select()
            .from(savedWords)
            .where(
              and(
                eq(savedWords.userId, user.id),
                eq(savedWords.lessonId, lesson.id),
                eq(savedWords.normalized, word.normalized),
              ),
            )
            .limit(1);
          if (!saved) {
            await addReview(tx, user.id, lesson.id, word, !correct);
            await tx.insert(savedWords).values({
              userId: user.id,
              lessonId: lesson.id,
              word: word.word,
              normalized: word.normalized,
              translationUz: word.meaning,
              sourceSentence: word.sourceSentence,
              subtitleTime: word.subtitleTime,
              pronunciation: word.pronunciation,
              partOfSpeech: word.partOfSpeech,
            });
          }
        }
      }
      // The same exercise flow is retained after login; importing never awards XP.
      const through = selected.some((attempt) => attempt.kind === "vocabulary")
        ? STAGES.length
        : STAGES.indexOf("practice") + 1;
      const stages = [
        ...new Set([
          ...(progress.completedStages || []),
          ...STAGES.slice(0, through),
        ]),
      ];
      const vocabulary = selected.find(
        (attempt) => attempt.kind === "vocabulary",
      );
      const [updated] = await tx
        .update(lessonProgress)
        .set({
          completedStages: stages,
          completionPercent: Math.max(
            progress.completionPercent || 0,
            Math.round((stages.length / STAGES.length) * 100),
          ),
          accuracy: Math.max(
            progress.accuracy || 0,
            ...selected.map((attempt) => attempt.score),
          ),
          completedQuizzes: Math.max(
            progress.completedQuizzes || 0,
            ...selected.map((attempt) => attempt.questions.length),
          ),
          learnedWords: Math.max(
            progress.learnedWords || 0,
            vocabulary?.answers.filter((answer) => answer.correct).length || 0,
          ),
          lastStudiedAt: new Date(),
        })
        .where(eq(lessonProgress.id, progress.id))
        .returning();
      await tx.insert(learningEvents).values({
        id: importId,
        userId: user.id,
        lessonId: lesson.id,
        type: "demo_transfer",
        details: {
          contentVersion: lesson.contentVersion,
          importedKinds: selected.map((attempt) => attempt.kind),
          xp: 0,
        },
      });
      return { imported: true, progress: updated };
    });
    req.session.demoAttempts = (req.session.demoAttempts || []).filter(
      (attempt) =>
        attempt.lessonId !== lesson.id ||
        attempt.contentVersion !== lesson.contentVersion,
    );
    res.json({
      ...result,
      practice: selected.find((attempt) => attempt.kind === "practice")
        ? {
            score: selected.find((attempt) => attempt.kind === "practice")!
              .score,
          }
        : null,
      vocabulary: selected.find((attempt) => attempt.kind === "vocabulary")
        ? {
            score: selected.find((attempt) => attempt.kind === "vocabulary")!
              .score,
          }
        : null,
      xp: 0,
    });
  });
  app.post("/api/learn/sessions", requireAuth, async (req, res) => {
    const id = randomUUID();
    await db
      .insert(learningSessions)
      .values({ id, userId: req.session.userId!, lessonId: null });
    res.status(201).json({ id });
  });
  app.post("/api/learn/lessons/:id/sessions", requireAuth, async (req, res) => {
    const lesson = await accessibleLesson(req, parse(idSchema, req.params.id));
    const id = randomUUID();
    await db
      .insert(learningSessions)
      .values({ id, userId: req.session.userId!, lessonId: lesson.id });
    res.status(201).json({ id });
  });
  const activity = async (req: Request, res: import("express").Response) => {
    const lesson = req.params.id
      ? await accessibleLesson(req, parse(idSchema, req.params.id))
      : null;
    const body = parse(
      z
        .object({
          id: z.string().uuid(),
          sessionId: z.string().uuid(),
          active: z.boolean(),
          position: z.number().finite().min(0).max(86400).default(0),
          segmentIndex: z.number().int().min(0).max(10000).default(0),
        })
        .strict(),
      req.body,
    );
    const result = await db.transaction(async (tx) => {
      await tx
        .select()
        .from(users)
        .where(eq(users.id, req.session.userId!))
        .for("update");
      const [session] = await tx
        .select()
        .from(learningSessions)
        .where(
          and(
            eq(learningSessions.id, body.sessionId),
            eq(learningSessions.userId, req.session.userId!),
          ),
        )
        .for("update");
      if (
        !session ||
        session.lessonId !== (lesson?.id ?? null) ||
        Date.now() - session.createdAt.getTime() > 12 * 3600000
      )
        return fail(409, "O‘quv sessiyasini qayta oching");
      const [duplicate] = await tx
        .select()
        .from(learningEvents)
        .where(eq(learningEvents.id, body.id));
      if (duplicate) {
        if (duplicate.userId !== req.session.userId)
          return fail(409, "Hodisa identifikatori band");
        return { duplicate: true, seconds: 0 };
      }
      const [last] = await tx
        .select({ at: learningEvents.createdAt })
        .from(learningEvents)
        .where(
          and(
            eq(learningEvents.userId, req.session.userId!),
            eq(learningEvents.type, "activity"),
          ),
        )
        .orderBy(desc(learningEvents.createdAt))
        .limit(1);
      const since = Math.max(
        session.lastHeartbeatAt.getTime(),
        last?.at.getTime() ?? 0,
      );
      const seconds = body.active
        ? Math.min(30, Math.max(0, Math.floor((Date.now() - since) / 1000)))
        : 0;
      await tx.insert(learningEvents).values({
        id: body.id,
        userId: req.session.userId!,
        lessonId: lesson?.id ?? null,
        type: "activity",
        studySeconds: seconds,
      });
      await tx
        .update(learningSessions)
        .set({ lastHeartbeatAt: new Date() })
        .where(eq(learningSessions.id, session.id));
      if (lesson) {
        const p = await lockedProgress(tx, req.session.userId!, lesson);
        await tx
          .update(lessonProgress)
          .set({
            playbackPosition: body.position,
            segmentIndex: Math.min(
              body.segmentIndex,
              Math.max(0, lessonSegments(lesson).length - 1),
            ),
            studyTimeSeconds: (p.studyTimeSeconds || 0) + seconds,
            lastStudiedAt: new Date(),
          })
          .where(eq(lessonProgress.id, p.id));
      }
      return { seconds };
    });
    res.json(result);
  };
  app.post("/api/learn/activity", requireAuth, activity);
  app.post("/api/learn/lessons/:id/activity", requireAuth, activity);
  app.post("/api/learn/lessons/:id/stages", requireAuth, async (req, res) => {
    const lesson = await accessibleLesson(req, parse(idSchema, req.params.id));
    const user = await currentUser(req);
    const body = parse(
      z
        .object({
          stage: z.enum(["listen", "understand", "shadow"]),
          recorded: z.boolean().optional(),
          spoken: z.boolean().optional(),
        })
        .strict(),
      req.body,
    );
    if (body.stage === "shadow" && !body.recorded && !body.spoken)
      return fail(400, "Avval gapni takrorlab ovoz yozing");
    const result = await db.transaction(async (tx) => {
      await tx.select().from(users).where(eq(users.id, user.id)).for("update");
      const p = await lockedProgress(tx, user.id, lesson);
      const prerequisite =
        body.stage === "understand"
          ? "listen"
          : body.stage === "shadow"
            ? "understand"
            : null;
      if (prerequisite && !p.completedStages?.includes(prerequisite))
        return fail(409, "Avval oldingi bosqichni yakunlang");
      if ((p.studyTimeSeconds || 0) < 5)
        return fail(400, "Avval dars bilan biroz shug‘ullaning");
      const result = await finishStage(tx, user, lesson, body.stage);
      await tx
        .insert(learningEvents)
        .values({
          id: randomUUID(),
          userId: user.id,
          lessonId: lesson.id,
          type: body.stage,
        })
        .onConflictDoNothing();
      return result;
    });
    res.json(result);
  });
  app.post("/api/learn/lessons/:id/attempts", requireAuth, async (req, res) => {
    const lesson = await accessibleLesson(req, parse(idSchema, req.params.id));
    const { kind } = parse(
      z.object({ kind: z.enum(["practice", "vocabulary"]) }).strict(),
      req.body,
    );
    const attempt = await db.transaction(async (tx) => {
      await tx
        .select()
        .from(users)
        .where(eq(users.id, req.session.userId!))
        .for("update");
      const p = await lockedProgress(tx, req.session.userId!, lesson);
      const required =
        kind === "vocabulary"
          ? ["listen", "understand", "shadow", "practice"]
          : ["listen", "understand", "shadow"];
      if (required.some((stage) => !p.completedStages?.includes(stage)))
        return fail(
          409,
          kind === "vocabulary"
            ? "Avval dars bosqichlari va mashqlarni yakunlang"
            : "Avval tinglash, tushunish va takrorlashni yakunlang",
        );
      const [existing] = await tx
        .select()
        .from(lessonAttempts)
        .where(
          and(
            eq(lessonAttempts.userId, req.session.userId!),
            eq(lessonAttempts.lessonId, lesson.id),
            eq(lessonAttempts.contentVersion, lesson.contentVersion),
            eq(lessonAttempts.kind, kind),
            isNull(lessonAttempts.finishedAt),
          ),
        )
        .limit(1);
      if (existing) return existing;
      const questions = buildQuestions(lesson, kind);
      if (!questions.length)
        return fail(409, "Bu dars uchun mashqlar hali tayyor emas");
      const [created] = await tx
        .insert(lessonAttempts)
        .values({
          id: randomUUID(),
          userId: req.session.userId!,
          lessonId: lesson.id,
          contentVersion: lesson.contentVersion,
          kind,
          questions,
        })
        .returning();
      return created;
    });
    res.json(clientAttempt(attempt));
  });
  app.post("/api/learn/attempts/:id/answers", requireAuth, async (req, res) => {
    const body = parse(
      z
        .object({
          questionId: z.string().max(100),
          answer: z.string().max(4000),
        })
        .strict(),
      req.body,
    );
    const user = await currentUser(req);
    const result = await db.transaction(async (tx) => {
      await tx.select().from(users).where(eq(users.id, user.id)).for("update");
      const [attempt] = await tx
        .select()
        .from(lessonAttempts)
        .where(
          and(
            eq(lessonAttempts.id, String(req.params.id)),
            eq(lessonAttempts.userId, user.id),
          ),
        )
        .for("update");
      if (!attempt) return fail(404, "Test topilmadi");
      const lesson = await accessibleLesson(req, attempt.lessonId, tx);
      if (lesson.contentVersion !== attempt.contentVersion)
        return fail(409, "Dars yangilangan. Testni qayta boshlang");
      const questions = attempt.questions as Question[];
      const question = questions.find((q) => q.id === body.questionId);
      if (!question) return fail(400, "Savol topilmadi");
      const answers = attempt.answers as {
        questionId: string;
        answer: string;
        correct: boolean;
      }[];
      const previous = answers.find((a) => a.questionId === question.id);
      if (!previous && attempt.finishedAt) return fail(409, "Test yakunlangan");
      const correct = previous?.correct ?? gradeAnswer(question, body.answer);
      if (!previous)
        answers.push({ questionId: question.id, answer: body.answer, correct });
      const done = answers.length === questions.length;
      const score = Math.round(
        (answers.filter((a) => a.correct).length / questions.length) * 100,
      );
      await tx
        .update(lessonAttempts)
        .set({
          answers,
          score: done ? score : null,
          finishedAt: done ? attempt.finishedAt || new Date() : null,
        })
        .where(eq(lessonAttempts.id, attempt.id));
      if (question.word && !previous) {
        if (!correct)
          await tx
            .update(savedWords)
            .set({ isLearned: false })
            .where(
              and(
                eq(savedWords.userId, user.id),
                eq(savedWords.lessonId, lesson.id),
                eq(savedWords.normalized, question.word.normalized),
              ),
            );
        await addReview(tx, user.id, lesson.id, question.word, !correct);
        const w = question.word;
        const [exists] = await tx
          .select()
          .from(savedWords)
          .where(
            and(
              eq(savedWords.userId, user.id),
              eq(savedWords.lessonId, lesson.id),
              eq(savedWords.normalized, w.normalized),
            ),
          )
          .limit(1);
        if (!exists)
          await tx.insert(savedWords).values({
            userId: user.id,
            lessonId: lesson.id,
            word: w.word,
            normalized: w.normalized,
            translationUz: w.meaning,
            sourceSentence: w.sourceSentence,
            subtitleTime: w.subtitleTime,
            pronunciation: w.pronunciation,
            partOfSpeech: w.partOfSpeech,
          });
      }
      let completion;
      if (done) {
        completion = await finishStage(
          tx,
          user,
          lesson,
          attempt.kind as "practice" | "vocabulary",
        );
        await tx
          .update(lessonProgress)
          .set({
            accuracy: score,
            completedQuizzes: questions.length,
            learnedWords:
              attempt.kind === "vocabulary"
                ? answers.filter((a) => a.correct).length
                : completion.progress.learnedWords,
          })
          .where(eq(lessonProgress.id, completion.progress.id));
      }
      return {
        correct,
        answer: question.answer,
        explanation: question.explanation,
        done,
        score: done ? score : null,
        answered: answers.length,
        ...completion,
      };
    });
    res.json(result);
  });
  app.get("/api/learn/lessons/:id/results", requireAuth, async (req, res) => {
    const lesson = await accessibleLesson(req, parse(idSchema, req.params.id));
    const attempts = await db
      .select()
      .from(lessonAttempts)
      .where(
        and(
          eq(lessonAttempts.userId, req.session.userId!),
          eq(lessonAttempts.lessonId, lesson.id),
          eq(lessonAttempts.contentVersion, lesson.contentVersion),
        ),
      )
      .orderBy(desc(lessonAttempts.createdAt));
    const latest = (kind: string) =>
      attempts.find((a) => a.kind === kind && a.finishedAt);
    const serialize = (a: typeof lessonAttempts.$inferSelect | undefined) =>
      a
        ? {
            id: a.id,
            score: a.score,
            total: (a.questions as Question[]).length,
            correct: (a.answers as any[]).filter((v) => v.correct).length,
            errors: (a.answers as any[])
              .filter((v) => !v.correct)
              .map((v) => {
                const q = (a.questions as Question[]).find(
                  (q) => q.id === v.questionId,
                )!;
                return {
                  prompt: q.prompt,
                  response: v.answer,
                  answer: q.answer,
                  explanation: q.explanation,
                };
              }),
          }
        : null;
    res.json({
      practice: serialize(latest("practice")),
      vocabulary: serialize(latest("vocabulary")),
      progress: await storage.getLessonProgress(req.session.userId!, lesson.id),
      savedWords: (
        await storage.getSavedWordsByUserAndLesson(
          req.session.userId!,
          lesson.id,
        )
      ).length,
    });
  });
  app.post("/api/user/saved-words", requireAuth, async (req, res) => {
    const data = parse(
      z
        .object({
          lessonId: idSchema,
          word: z.string().min(1).max(500),
          subtitleTime: z.number().finite().min(0).nullable().optional(),
        })
        .passthrough(),
      req.body,
    );
    const lesson = await accessibleLesson(req, data.lessonId);
    const vocab = [
      ...lessonVocabulary(lesson),
      ...lessonSegments(lesson).flatMap((s) => s.words),
    ];
    const word = vocab.find((w) => w.normalized === normalizeAnswer(data.word));
    if (!word) return fail(400, "So‘z dars lug‘atida topilmadi");
    const saved = await db.transaction(async (tx) => {
      await tx
        .select()
        .from(users)
        .where(eq(users.id, req.session.userId!))
        .for("update");
      const time = data.subtitleTime ?? word.subtitleTime;
      const [existing] = await tx
        .select()
        .from(savedWords)
        .where(
          and(
            eq(savedWords.userId, req.session.userId!),
            eq(savedWords.lessonId, lesson.id),
            eq(savedWords.normalized, word.normalized),
            time === null
              ? isNull(savedWords.subtitleTime)
              : eq(savedWords.subtitleTime, time),
          ),
        );
      await addReview(tx, req.session.userId!, lesson.id, word, true);
      if (existing) return existing;
      const [created] = await tx
        .insert(savedWords)
        .values({
          userId: req.session.userId!,
          lessonId: lesson.id,
          word: word.word,
          normalized: word.normalized,
          translationUz: word.meaning,
          translationAr: word.translationAr,
          sourceSentence: word.sourceSentence,
          subtitleTime: time,
          contextualMeaning: word.contextualMeaning,
          pronunciation: word.pronunciation,
          partOfSpeech: word.partOfSpeech,
        })
        .returning();
      return created;
    });
    res.status(201).json(saved);
  });
  app.get("/api/learn/reviews", requireAuth, async (req, res) => {
    const cards = await db
      .select()
      .from(wordReviews)
      .where(
        and(
          eq(wordReviews.userId, req.session.userId!),
          lte(wordReviews.dueAt, new Date()),
        ),
      )
      .orderBy(wordReviews.dueAt)
      .limit(100);
    res.json(await filterLessonItems(req, cards));
  });
  app.post("/api/learn/reviews/:id", requireAuth, async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const data = parse(
      z
        .object({
          id: z.string().uuid(),
          rating: z.enum(["hard", "medium", "easy"]),
        })
        .strict(),
      req.body,
    );
    const user = await currentUser(req);
    const result = await db.transaction(async (tx) => {
      await tx.select().from(users).where(eq(users.id, user.id)).for("update");
      const [previous] = await tx
        .select()
        .from(reviewAnswers)
        .where(
          and(eq(reviewAnswers.id, data.id), eq(reviewAnswers.userId, user.id)),
        );
      const [card] = await tx
        .select()
        .from(wordReviews)
        .where(and(eq(wordReviews.id, id), eq(wordReviews.userId, user.id)))
        .for("update");
      if (!card) return fail(404, "Karta topilmadi");
      await accessibleLesson(req, card.lessonId, tx);
      if (previous) return { dueAt: previous.dueAt, duplicate: true };
      if (card.dueAt.getTime() > Date.now())
        return fail(409, "Bu karta allaqachon takrorlangan");
      const scheduled = scheduleReview(card, data.rating);
      await tx
        .update(savedWords)
        .set({
          isLearned: scheduled.repetitions >= 3 && data.rating !== "hard",
        })
        .where(
          and(
            eq(savedWords.userId, user.id),
            eq(savedWords.lessonId, card.lessonId),
            eq(savedWords.normalized, card.normalized),
          ),
        );
      await tx
        .update(wordReviews)
        .set({ ...scheduled, lastReviewedAt: new Date() })
        .where(eq(wordReviews.id, id));
      await tx.insert(reviewAnswers).values({
        id: data.id,
        userId: user.id,
        reviewId: id,
        rating: data.rating,
        dueAt: scheduled.dueAt,
      });
      await tx.insert(learningEvents).values({
        id: data.id,
        userId: user.id,
        lessonId: card.lessonId,
        type: "review",
      });
      const xp = await award(
        tx,
        user,
        `review:${id}:${localDay(new Date(), user.timezone)}`,
        2,
      );
      return { dueAt: scheduled.dueAt, xp };
    });
    res.json(result);
  });
  app.get(
    "/api/studio/lessons/:id/review",
    requireRole("teacher", "admin"),
    async (req, res) => {
      const lesson = await storage.getLessonById(
        parse(idSchema, req.params.id),
      );
      if (
        !lesson ||
        (lesson.createdBy !== req.session.userId &&
          req.session.userRole !== "admin")
      )
        return fail(404, "Dars topilmadi");
      res.json({
        problems: publicationProblems(lesson),
        checks: lesson.contentChecks,
        contentVersion: lesson.contentVersion,
        hasPublishedVersion: Boolean(publishedLesson(lesson)),
      });
    },
  );
  app.post(
    "/api/studio/lessons/:id/review",
    requireRole("teacher", "admin"),
    async (req, res) => {
      const lesson = await storage.getLessonById(
        parse(idSchema, req.params.id),
      );
      if (
        !lesson ||
        (lesson.createdBy !== req.session.userId &&
          req.session.userRole !== "admin")
      )
        return fail(404, "Dars topilmadi");
      const data = parse(
        z
          .object({
            text: z.literal(true),
            translation: z.literal(true),
            timing: z.literal(true),
            exercises: z.literal(true),
            contentVersion: z.number().int(),
          })
          .strict(),
        req.body,
      );
      if (data.contentVersion !== lesson.contentVersion)
        return fail(409, "Dars yangilangan. Yangi nusxani tekshiring");
      const problems = publicationProblems(lesson);
      if (problems.length)
        return res.status(400).json({ message: problems.join(". "), problems });
      const { contentVersion, ...checks } = data;
      const updated = await storage.updateLesson(lesson.id, {
        contentChecks: checks,
        status: "pending",
        moderationNote:
          "O‘qituvchi matn, tarjima, vaqtlar va mashqlarni tekshirdi.",
      });
      res.json(updated);
    },
  );
}
