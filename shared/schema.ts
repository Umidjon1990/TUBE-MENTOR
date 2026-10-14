import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  timestamp,
  boolean,
  integer,
  serial,
  json,
  real,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  fullName: text("full_name").notNull(),
  username: text("username").notNull().unique(),
  email: text("email").unique(),
  emailVerified: boolean("email_verified").default(true).notNull(),
  googleId: text("google_id").unique(),
  telegramId: text("telegram_id").unique(),
  sessionVersion: integer("session_version").default(0).notNull(),
  learningLevel: text("learning_level").default("A1").notNull(),
  targetLanguage: text("target_language").default("ar").notNull(),
  dailyGoalMinutes: integer("daily_goal_minutes").default(15).notNull(),
  timezone: text("timezone").default("Asia/Tashkent").notNull(),
  onboardingCompleted: boolean("onboarding_completed").default(false).notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").default("student").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  coins: integer("coins").default(0).notNull(),
  xp: integer("xp").default(0).notNull(),
  level: integer("level").default(1).notNull(),
  streakDays: integer("streak_days").default(0).notNull(),
  lastStudyDate: text("last_study_date"),
  badges: json("badges").$type<string[]>().default([]),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  thumbnailUrl: text("thumbnail_url"),
});

export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
});

export const lessons = pgTable("lessons", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  youtubeUrl: text("youtube_url"),
  thumbnailUrl: text("thumbnail_url"),
  transcript: text("transcript"),
  transcriptSource: text("transcript_source"),
  manualTranscript: text("manual_transcript"),
  language: text("language").default("uz").notNull(),
  targetLanguage: text("target_language").default("ar").notNull(),
  level: text("level").default("beginner").notNull(),
  status: text("status").default("draft").notNull(),
  categoryId: integer("category_id").references(() => categories.id),
  summaryShort: text("summary_short"),
  summaryDetailed: text("summary_detailed"),
  summaryShortAr: text("summary_short_ar"),
  summaryDetailedAr: text("summary_detailed_ar"),
  vocabularyJson: json("vocabulary_json"),
  phrasesJson: json("phrases_json"),
  quizzesJson: json("quizzes_json"),
  flashcardsJson: json("flashcards_json"),
  subtitlesJson: json("subtitles_json"),
  sentenceAnalysisJson: json("sentence_analysis_json"),
  wordTimestampsJson: json("word_timestamps_json"),
  contentVersion: integer("content_version").default(1).notNull(),
  contentChecks: json("content_checks")
    .$type<Record<string, boolean>>()
    .default({})
    .notNull(),
  publishedSnapshot: json("published_snapshot").$type<Record<
    string,
    unknown
  > | null>(),
  aiMetaJson: json("ai_meta_json"),
  moderationNote: text("moderation_note"),
  isFeatured: boolean("is_featured").default(false).notNull(),
  downloadEnabled: boolean("download_enabled").default(true).notNull(),
  createdBy: varchar("created_by").references(() => users.id),
  approvedBy: varchar("approved_by").references(() => users.id),
  publishedBy: varchar("published_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  approvedAt: timestamp("approved_at"),
  publishedAt: timestamp("published_at"),
});

export const lessonTags = pgTable(
  "lesson_tags",
  {
    id: serial("id").primaryKey(),
    lessonId: integer("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("lesson_tag_unique").on(table.lessonId, table.tagId)],
);

export const lessonProgress = pgTable(
  "lesson_progress",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lessonId: integer("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    accuracy: real("accuracy").default(0),
    completedQuizzes: integer("completed_quizzes").default(0),
    learnedWords: integer("learned_words").default(0),
    studyTimeSeconds: integer("study_time_seconds").default(0),
    completionPercent: real("completion_percent").default(0),
    contentVersion: integer("content_version").default(1).notNull(),
    completedStages: json("completed_stages")
      .$type<string[]>()
      .default([])
      .notNull(),
    playbackPosition: real("playback_position").default(0).notNull(),
    segmentIndex: integer("segment_index").default(0).notNull(),
    lastStudiedAt: timestamp("last_studied_at"),
  },
  (table) => [
    uniqueIndex("user_lesson_progress_unique").on(table.userId, table.lessonId),
  ],
);

export const flashcards = pgTable("flashcards", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  lessonId: integer("lesson_id")
    .notNull()
    .references(() => lessons.id, { onDelete: "cascade" }),
  frontText: text("front_text").notNull(),
  backText: text("back_text").notNull(),
  type: text("type").default("vocabulary").notNull(),
  confidenceLevel: integer("confidence_level").default(0).notNull(),
  nextReviewAt: timestamp("next_review_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  lessonId: integer("lesson_id")
    .notNull()
    .references(() => lessons.id, { onDelete: "cascade" }),
  sentenceIndex: integer("sentence_index"),
  timestamp: integer("timestamp"),
  content: text("content").notNull(),
  isPinned: boolean("is_pinned").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const bookmarks = pgTable("bookmarks", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  lessonId: integer("lesson_id")
    .notNull()
    .references(() => lessons.id, { onDelete: "cascade" }),
  type: text("type").default("lesson").notNull(),
  sentenceIndex: integer("sentence_index"),
  timestamp: integer("timestamp"),
  label: text("label"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const coinTransactions = pgTable("coin_transactions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  type: text("type").notNull(),
  description: text("description"),
  idempotencyKey: text("idempotency_key").unique(),
  actorId: varchar("actor_id").references(() => users.id),
  orderId: varchar("order_id"),
  lessonId: integer("lesson_id").references(() => lessons.id),
  bankReference: text("bank_reference").unique(),
  balanceBefore: integer("balance_before"),
  balanceAfter: integer("balance_after"),
  metadata: json("metadata")
    .$type<Record<string, unknown>>()
    .default({})
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const lessonAccess = pgTable(
  "lesson_access",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id),
    lessonId: integer("lesson_id")
      .notNull()
      .references(() => lessons.id),
    source: text("source").notNull(),
    priceCoins: integer("price_coins").default(0).notNull(),
    purchaseTransactionId: integer("purchase_transaction_id").references(
      () => coinTransactions.id,
    ),
    grantedBy: varchar("granted_by").references(() => users.id),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("lesson_access_user_lesson_unique").on(t.userId, t.lessonId),
  ],
);

export const coinPackages = pgTable("coin_packages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  coins: integer("coins").notNull(),
  priceUzs: integer("price_uzs").notNull(),
  isActive: boolean("is_active").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const paymentOrders = pgTable("payment_orders", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  packageId: integer("package_id")
    .notNull()
    .references(() => coinPackages.id),
  packageName: text("package_name").notNull(),
  coins: integer("coins").notNull(),
  priceUzs: integer("price_uzs").notNull(),
  status: text("status").default("awaiting_payment").notNull(),
  instructions: json("instructions").$type<Record<string, string>>().notNull(),
  reason: text("reason"),
  bankReference: text("bank_reference").unique(),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  refundedCoins: integer("refunded_coins").default(0).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const paymentReceipts = pgTable("payment_receipts", {
  id: serial("id").primaryKey(),
  orderId: varchar("order_id")
    .notNull()
    .references(() => paymentOrders.id),
  storageKey: text("storage_key").notNull().unique(),
  mimeType: text("mime_type").notNull(),
  originalName: text("original_name").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const coinGrants = pgTable("coin_grants", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  source: text("source").notNull(),
  amount: integer("amount").notNull(),
  remaining: integer("remaining").notNull(),
  orderId: varchar("order_id").references(() => paymentOrders.id),
  transactionId: integer("transaction_id").references(
    () => coinTransactions.id,
  ),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const commerceAudit = pgTable("commerce_audit", {
  id: serial("id").primaryKey(),
  actorId: varchar("actor_id").references(() => users.id),
  userId: varchar("user_id").references(() => users.id),
  action: text("action").notNull(),
  referenceId: text("reference_id"),
  idempotencyKey: text("idempotency_key").unique(),
  details: json("details")
    .$type<Record<string, unknown>>()
    .default({})
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const telegramBotLinks = pgTable("telegram_bot_links", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  telegramUserId: text("telegram_user_id").notNull().unique(),
  chatId: text("chat_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const telegramLinkTokens = pgTable("telegram_link_tokens", {
  id: serial("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
});

export const notificationOutbox = pgTable(
  "notification_outbox",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull(),
    referenceId: text("reference_id").notNull(),
    payload: json("payload")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    state: text("state").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at").defaultNow().notNull(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("notification_outbox_event_unique").on(t.kind, t.referenceId),
  ],
);

export const savedWords = pgTable(
  "saved_words",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lessonId: integer("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    word: text("word").notNull(),
    normalized: text("normalized").notNull(),
    translationUz: text("translation_uz"),
    translationAr: text("translation_ar"),
    contextualMeaning: text("contextual_meaning"),
    partOfSpeech: text("part_of_speech"),
    pronunciation: text("pronunciation"),
    sourceSentence: text("source_sentence"),
    subtitleTime: real("subtitle_time"),
    phraseText: text("phrase_text"),
    phraseTranslationUz: text("phrase_translation_uz"),
    phraseTranslationAr: text("phrase_translation_ar"),
    phraseExplanation: text("phrase_explanation"),
    isLearned: boolean("is_learned").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("saved_word_unique").on(
      table.userId,
      table.lessonId,
      table.normalized,
      table.subtitleTime,
    ),
  ],
);

export const collections = pgTable("collections", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  coverImage: text("cover_image"),
  targetLanguage: text("target_language").default("ar").notNull(),
  level: text("level").default("beginner").notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  status: text("status").default("draft").notNull(),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const collectionLessons = pgTable(
  "collection_lessons",
  {
    id: serial("id").primaryKey(),
    collectionId: integer("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    lessonId: integer("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").default(0).notNull(),
  },
  (table) => [
    uniqueIndex("collection_lesson_unique").on(
      table.collectionId,
      table.lessonId,
    ),
  ],
);

export const systemSettings = pgTable("system_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value"),
});

export const authTokens = pgTable("auth_tokens", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  purpose: text("purpose").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
});

export const learningSessions = pgTable("learning_sessions", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  lessonId: integer("lesson_id").references(() => lessons.id, {
    onDelete: "cascade",
  }),
  lastHeartbeatAt: timestamp("last_heartbeat_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const learningEvents = pgTable("learning_events", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  lessonId: integer("lesson_id").references(() => lessons.id, {
    onDelete: "cascade",
  }),
  type: text("type").notNull(),
  studySeconds: integer("study_seconds").default(0).notNull(),
  details: json("details")
    .$type<Record<string, unknown>>()
    .default({})
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const xpAwards = pgTable(
  "xp_awards",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    awardKey: text("award_key").notNull(),
    amount: integer("amount").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("xp_award_unique").on(table.userId, table.awardKey)],
);

export const lessonAttempts = pgTable("lesson_attempts", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  lessonId: integer("lesson_id")
    .notNull()
    .references(() => lessons.id, { onDelete: "cascade" }),
  contentVersion: integer("content_version").notNull(),
  kind: text("kind").notNull(),
  questions: json("questions").notNull(),
  answers: json("answers").default([]).notNull(),
  score: real("score"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
});

export const wordReviews = pgTable(
  "word_reviews",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lessonId: integer("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    normalized: text("normalized").notNull(),
    word: text("word").notNull(),
    meaning: text("meaning").notNull(),
    sourceSentence: text("source_sentence"),
    subtitleTime: real("subtitle_time"),
    repetitions: integer("repetitions").default(0).notNull(),
    intervalDays: integer("interval_days").default(0).notNull(),
    ease: real("ease").default(2.5).notNull(),
    dueAt: timestamp("due_at").defaultNow().notNull(),
    lastReviewedAt: timestamp("last_reviewed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("word_review_unique").on(
      table.userId,
      table.lessonId,
      table.normalized,
    ),
  ],
);

export const reviewAnswers = pgTable("review_answers", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  reviewId: integer("review_id")
    .notNull()
    .references(() => wordReviews.id, { onDelete: "cascade" }),
  rating: text("rating").notNull(),
  dueAt: timestamp("due_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  createdLessons: many(lessons, { relationName: "createdBy" }),
  approvedLessons: many(lessons, { relationName: "approvedBy" }),
  publishedLessons: many(lessons, { relationName: "publishedBy" }),
  lessonProgress: many(lessonProgress),
  flashcards: many(flashcards),
  notes: many(notes),
  bookmarks: many(bookmarks),
  coinTransactions: many(coinTransactions),
  savedWords: many(savedWords),
}));

export const lessonsRelations = relations(lessons, ({ one, many }) => ({
  category: one(categories, {
    fields: [lessons.categoryId],
    references: [categories.id],
  }),
  creator: one(users, {
    fields: [lessons.createdBy],
    references: [users.id],
    relationName: "createdBy",
  }),
  approver: one(users, {
    fields: [lessons.approvedBy],
    references: [users.id],
    relationName: "approvedBy",
  }),
  publisher: one(users, {
    fields: [lessons.publishedBy],
    references: [users.id],
    relationName: "publishedBy",
  }),
  lessonTags: many(lessonTags),
  progress: many(lessonProgress),
  flashcards: many(flashcards),
  notes: many(notes),
  bookmarks: many(bookmarks),
  savedWords: many(savedWords),
}));

export const lessonTagsRelations = relations(lessonTags, ({ one }) => ({
  lesson: one(lessons, {
    fields: [lessonTags.lessonId],
    references: [lessons.id],
  }),
  tag: one(tags, { fields: [lessonTags.tagId], references: [tags.id] }),
}));

export const lessonProgressRelations = relations(lessonProgress, ({ one }) => ({
  user: one(users, { fields: [lessonProgress.userId], references: [users.id] }),
  lesson: one(lessons, {
    fields: [lessonProgress.lessonId],
    references: [lessons.id],
  }),
}));

export const flashcardsRelations = relations(flashcards, ({ one }) => ({
  user: one(users, { fields: [flashcards.userId], references: [users.id] }),
  lesson: one(lessons, {
    fields: [flashcards.lessonId],
    references: [lessons.id],
  }),
}));

export const notesRelations = relations(notes, ({ one }) => ({
  user: one(users, { fields: [notes.userId], references: [users.id] }),
  lesson: one(lessons, { fields: [notes.lessonId], references: [lessons.id] }),
}));

export const bookmarksRelations = relations(bookmarks, ({ one }) => ({
  user: one(users, { fields: [bookmarks.userId], references: [users.id] }),
  lesson: one(lessons, {
    fields: [bookmarks.lessonId],
    references: [lessons.id],
  }),
}));

export const coinTransactionsRelations = relations(
  coinTransactions,
  ({ one }) => ({
    user: one(users, {
      fields: [coinTransactions.userId],
      references: [users.id],
    }),
  }),
);

export const savedWordsRelations = relations(savedWords, ({ one }) => ({
  user: one(users, { fields: [savedWords.userId], references: [users.id] }),
  lesson: one(lessons, {
    fields: [savedWords.lessonId],
    references: [lessons.id],
  }),
}));

export const collectionsRelations = relations(collections, ({ one, many }) => ({
  creator: one(users, {
    fields: [collections.createdBy],
    references: [users.id],
  }),
  collectionLessons: many(collectionLessons),
}));

export const collectionLessonsRelations = relations(
  collectionLessons,
  ({ one }) => ({
    collection: one(collections, {
      fields: [collectionLessons.collectionId],
      references: [collections.id],
    }),
    lesson: one(lessons, {
      fields: [collectionLessons.lessonId],
      references: [lessons.id],
    }),
  }),
);

export const insertUserSchema = createInsertSchema(users).pick({
  fullName: true,
  username: true,
  passwordHash: true,
  role: true,
  email: true,
  emailVerified: true,
  googleId: true,
});

export const insertLessonSchema = createInsertSchema(lessons).pick({
  title: true,
  description: true,
  youtubeUrl: true,
  thumbnailUrl: true,
  language: true,
  targetLanguage: true,
  level: true,
  categoryId: true,
});

export const insertCategorySchema = createInsertSchema(categories).pick({
  name: true,
  slug: true,
  description: true,
  thumbnailUrl: true,
});

export const insertTagSchema = createInsertSchema(tags).pick({
  name: true,
  slug: true,
});

export const insertFlashcardSchema = createInsertSchema(flashcards).pick({
  userId: true,
  lessonId: true,
  frontText: true,
  backText: true,
  type: true,
});

export const insertNoteSchema = createInsertSchema(notes).pick({
  userId: true,
  lessonId: true,
  sentenceIndex: true,
  timestamp: true,
  content: true,
  isPinned: true,
});

export const insertBookmarkSchema = createInsertSchema(bookmarks).pick({
  userId: true,
  lessonId: true,
  type: true,
  sentenceIndex: true,
  timestamp: true,
  label: true,
});

export const insertCoinTransactionSchema = createInsertSchema(
  coinTransactions,
).pick({
  userId: true,
  amount: true,
  type: true,
  description: true,
});

export const insertLessonProgressSchema = createInsertSchema(
  lessonProgress,
).pick({
  userId: true,
  lessonId: true,
  accuracy: true,
  completedQuizzes: true,
  learnedWords: true,
  studyTimeSeconds: true,
  completionPercent: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertLesson = z.infer<typeof insertLessonSchema>;
export type Lesson = typeof lessons.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Tag = typeof tags.$inferSelect;
export type InsertTag = z.infer<typeof insertTagSchema>;
export type LessonTag = typeof lessonTags.$inferSelect;
export type LessonProgress = typeof lessonProgress.$inferSelect;
export type InsertLessonProgress = z.infer<typeof insertLessonProgressSchema>;
export type Flashcard = typeof flashcards.$inferSelect;
export type InsertFlashcard = z.infer<typeof insertFlashcardSchema>;
export type Note = typeof notes.$inferSelect;
export type InsertNote = z.infer<typeof insertNoteSchema>;
export type Bookmark = typeof bookmarks.$inferSelect;
export type InsertBookmark = z.infer<typeof insertBookmarkSchema>;
export type CoinTransaction = typeof coinTransactions.$inferSelect;
export type InsertCoinTransaction = z.infer<typeof insertCoinTransactionSchema>;
export const insertSavedWordSchema = createInsertSchema(savedWords).pick({
  userId: true,
  lessonId: true,
  word: true,
  normalized: true,
  translationUz: true,
  translationAr: true,
  contextualMeaning: true,
  partOfSpeech: true,
  pronunciation: true,
  sourceSentence: true,
  subtitleTime: true,
  phraseText: true,
  phraseTranslationUz: true,
  phraseTranslationAr: true,
  phraseExplanation: true,
});

export type SavedWord = typeof savedWords.$inferSelect;
export type InsertSavedWord = z.infer<typeof insertSavedWordSchema>;
export type SystemSetting = typeof systemSettings.$inferSelect;

export const insertCollectionSchema = createInsertSchema(collections).pick({
  name: true,
  description: true,
  coverImage: true,
  targetLanguage: true,
  level: true,
  sortOrder: true,
});

export type Collection = typeof collections.$inferSelect;
export type InsertCollection = z.infer<typeof insertCollectionSchema>;

export const insertCollectionLessonSchema = createInsertSchema(
  collectionLessons,
).pick({
  collectionId: true,
  lessonId: true,
  orderIndex: true,
});
export type InsertCollectionLesson = z.infer<
  typeof insertCollectionLessonSchema
>;
export type CollectionLesson = typeof collectionLessons.$inferSelect;

export const commerceSupportTickets = pgTable("commerce_support_tickets", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  category: text("category").notNull(),
  subject: text("subject").notNull(),
  status: text("status").default("open").notNull(),
  orderId: varchar("order_id").references(() => paymentOrders.id),
  lessonId: integer("lesson_id").references(() => lessons.id),
  fullNameSnapshot: text("full_name_snapshot").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export const commerceSupportMessages = pgTable("commerce_support_messages", {
  id: serial("id").primaryKey(),
  ticketId: varchar("ticket_id")
    .notNull()
    .references(() => commerceSupportTickets.id),
  authorId: varchar("author_id")
    .notNull()
    .references(() => users.id),
  authorRole: text("author_role").notNull(),
  authorNameSnapshot: text("author_name_snapshot").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
