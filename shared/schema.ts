import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, serial, json, real, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fullName: text("full_name").notNull(),
  username: text("username").notNull().unique(),
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

export const lessonTags = pgTable("lesson_tags", {
  id: serial("id").primaryKey(),
  lessonId: integer("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
  tagId: integer("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
}, (table) => [
  uniqueIndex("lesson_tag_unique").on(table.lessonId, table.tagId),
]);

export const lessonProgress = pgTable("lesson_progress", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  lessonId: integer("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
  accuracy: real("accuracy").default(0),
  completedQuizzes: integer("completed_quizzes").default(0),
  learnedWords: integer("learned_words").default(0),
  studyTimeSeconds: integer("study_time_seconds").default(0),
  completionPercent: real("completion_percent").default(0),
  lastStudiedAt: timestamp("last_studied_at"),
}, (table) => [
  uniqueIndex("user_lesson_progress_unique").on(table.userId, table.lessonId),
]);

export const flashcards = pgTable("flashcards", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  lessonId: integer("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
  frontText: text("front_text").notNull(),
  backText: text("back_text").notNull(),
  type: text("type").default("vocabulary").notNull(),
  confidenceLevel: integer("confidence_level").default(0).notNull(),
  nextReviewAt: timestamp("next_review_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  lessonId: integer("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
  sentenceIndex: integer("sentence_index"),
  timestamp: integer("timestamp"),
  content: text("content").notNull(),
  isPinned: boolean("is_pinned").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const bookmarks = pgTable("bookmarks", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  lessonId: integer("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
  type: text("type").default("lesson").notNull(),
  sentenceIndex: integer("sentence_index"),
  timestamp: integer("timestamp"),
  label: text("label"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const coinTransactions = pgTable("coin_transactions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  type: text("type").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const savedWords = pgTable("saved_words", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  lessonId: integer("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
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
}, (table) => [
  uniqueIndex("saved_word_unique").on(table.userId, table.lessonId, table.normalized, table.subtitleTime),
]);

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

export const collectionLessons = pgTable("collection_lessons", {
  id: serial("id").primaryKey(),
  collectionId: integer("collection_id").notNull().references(() => collections.id, { onDelete: "cascade" }),
  lessonId: integer("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
  orderIndex: integer("order_index").default(0).notNull(),
}, (table) => [
  uniqueIndex("collection_lesson_unique").on(table.collectionId, table.lessonId),
]);

export const systemSettings = pgTable("system_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value"),
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
  category: one(categories, { fields: [lessons.categoryId], references: [categories.id] }),
  creator: one(users, { fields: [lessons.createdBy], references: [users.id], relationName: "createdBy" }),
  approver: one(users, { fields: [lessons.approvedBy], references: [users.id], relationName: "approvedBy" }),
  publisher: one(users, { fields: [lessons.publishedBy], references: [users.id], relationName: "publishedBy" }),
  lessonTags: many(lessonTags),
  progress: many(lessonProgress),
  flashcards: many(flashcards),
  notes: many(notes),
  bookmarks: many(bookmarks),
  savedWords: many(savedWords),
}));

export const lessonTagsRelations = relations(lessonTags, ({ one }) => ({
  lesson: one(lessons, { fields: [lessonTags.lessonId], references: [lessons.id] }),
  tag: one(tags, { fields: [lessonTags.tagId], references: [tags.id] }),
}));

export const lessonProgressRelations = relations(lessonProgress, ({ one }) => ({
  user: one(users, { fields: [lessonProgress.userId], references: [users.id] }),
  lesson: one(lessons, { fields: [lessonProgress.lessonId], references: [lessons.id] }),
}));

export const flashcardsRelations = relations(flashcards, ({ one }) => ({
  user: one(users, { fields: [flashcards.userId], references: [users.id] }),
  lesson: one(lessons, { fields: [flashcards.lessonId], references: [lessons.id] }),
}));

export const notesRelations = relations(notes, ({ one }) => ({
  user: one(users, { fields: [notes.userId], references: [users.id] }),
  lesson: one(lessons, { fields: [notes.lessonId], references: [lessons.id] }),
}));

export const bookmarksRelations = relations(bookmarks, ({ one }) => ({
  user: one(users, { fields: [bookmarks.userId], references: [users.id] }),
  lesson: one(lessons, { fields: [bookmarks.lessonId], references: [lessons.id] }),
}));

export const coinTransactionsRelations = relations(coinTransactions, ({ one }) => ({
  user: one(users, { fields: [coinTransactions.userId], references: [users.id] }),
}));

export const savedWordsRelations = relations(savedWords, ({ one }) => ({
  user: one(users, { fields: [savedWords.userId], references: [users.id] }),
  lesson: one(lessons, { fields: [savedWords.lessonId], references: [lessons.id] }),
}));

export const collectionsRelations = relations(collections, ({ one, many }) => ({
  creator: one(users, { fields: [collections.createdBy], references: [users.id] }),
  collectionLessons: many(collectionLessons),
}));

export const collectionLessonsRelations = relations(collectionLessons, ({ one }) => ({
  collection: one(collections, { fields: [collectionLessons.collectionId], references: [collections.id] }),
  lesson: one(lessons, { fields: [collectionLessons.lessonId], references: [lessons.id] }),
}));

export const insertUserSchema = createInsertSchema(users).pick({
  fullName: true,
  username: true,
  passwordHash: true,
  role: true,
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
});

export const insertBookmarkSchema = createInsertSchema(bookmarks).pick({
  userId: true,
  lessonId: true,
  type: true,
  sentenceIndex: true,
  timestamp: true,
  label: true,
});

export const insertCoinTransactionSchema = createInsertSchema(coinTransactions).pick({
  userId: true,
  amount: true,
  type: true,
  description: true,
});

export const insertLessonProgressSchema = createInsertSchema(lessonProgress).pick({
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

export const insertCollectionLessonSchema = createInsertSchema(collectionLessons).pick({
  collectionId: true,
  lessonId: true,
  orderIndex: true,
});
export type InsertCollectionLesson = z.infer<typeof insertCollectionLessonSchema>;
export type CollectionLesson = typeof collectionLessons.$inferSelect;
