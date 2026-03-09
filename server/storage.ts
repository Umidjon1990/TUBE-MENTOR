import {
  type User, type InsertUser, users,
  type Lesson, type InsertLesson, lessons,
  type Category, type InsertCategory, categories,
  type Tag, type InsertTag, tags,
  type LessonTag, lessonTags,
  type LessonProgress, type InsertLessonProgress, lessonProgress,
  type Flashcard, type InsertFlashcard, flashcards,
  type Note, type InsertNote, notes,
  type Bookmark, type InsertBookmark, bookmarks,
  type CoinTransaction, type InsertCoinTransaction, coinTransactions,
  type SystemSetting, systemSettings,
} from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;

  createCategory(category: InsertCategory): Promise<Category>;
  getAllCategories(): Promise<Category[]>;
  getCategoryBySlug(slug: string): Promise<Category | undefined>;

  createTag(tag: InsertTag): Promise<Tag>;
  getAllTags(): Promise<Tag[]>;

  createLesson(lesson: Partial<Lesson>): Promise<Lesson>;
  getLessonById(id: number): Promise<Lesson | undefined>;
  getAllLessons(): Promise<Lesson[]>;
  updateLesson(id: number, data: Partial<Lesson>): Promise<Lesson | undefined>;
  deleteLesson(id: number): Promise<void>;

  createLessonTag(lessonId: number, tagId: number): Promise<LessonTag>;
  deleteLessonTag(lessonId: number, tagId: number): Promise<void>;
  getTagsByLesson(lessonId: number): Promise<LessonTag[]>;

  createLessonProgress(data: InsertLessonProgress): Promise<LessonProgress>;
  getLessonProgress(userId: string, lessonId: number): Promise<LessonProgress | undefined>;
  updateLessonProgress(id: number, data: Partial<LessonProgress>): Promise<LessonProgress | undefined>;
  getProgressByUser(userId: string): Promise<LessonProgress[]>;

  createFlashcard(flashcard: InsertFlashcard): Promise<Flashcard>;
  getFlashcardsByUser(userId: string): Promise<Flashcard[]>;
  getFlashcardsByUserAndLesson(userId: string, lessonId: number): Promise<Flashcard[]>;
  updateFlashcard(id: number, data: Partial<Flashcard>): Promise<Flashcard | undefined>;
  deleteFlashcard(id: number): Promise<void>;

  createNote(note: InsertNote): Promise<Note>;
  getNotesByUser(userId: string): Promise<Note[]>;
  getNotesByUserAndLesson(userId: string, lessonId: number): Promise<Note[]>;
  updateNote(id: number, data: Partial<Note>): Promise<Note | undefined>;
  deleteNote(id: number): Promise<void>;

  createBookmark(bookmark: InsertBookmark): Promise<Bookmark>;
  getBookmarksByUser(userId: string): Promise<Bookmark[]>;
  deleteBookmark(id: number): Promise<void>;

  createCoinTransaction(tx: InsertCoinTransaction): Promise<CoinTransaction>;
  getCoinTransactionsByUser(userId: string): Promise<CoinTransaction[]>;

  getSystemSetting(key: string): Promise<SystemSetting | undefined>;
  setSystemSetting(key: string, value: string): Promise<SystemSetting>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const [user] = await db.update(users).set({ ...data, updatedAt: new Date() }).where(eq(users.id, id)).returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async createCategory(category: InsertCategory): Promise<Category> {
    const [cat] = await db.insert(categories).values(category).returning();
    return cat;
  }

  async getAllCategories(): Promise<Category[]> {
    return db.select().from(categories);
  }

  async getCategoryBySlug(slug: string): Promise<Category | undefined> {
    const [cat] = await db.select().from(categories).where(eq(categories.slug, slug));
    return cat;
  }

  async createTag(tag: InsertTag): Promise<Tag> {
    const [t] = await db.insert(tags).values(tag).returning();
    return t;
  }

  async getAllTags(): Promise<Tag[]> {
    return db.select().from(tags);
  }

  async createLesson(lesson: Partial<Lesson>): Promise<Lesson> {
    const [l] = await db.insert(lessons).values(lesson as any).returning();
    return l;
  }

  async getLessonById(id: number): Promise<Lesson | undefined> {
    const [l] = await db.select().from(lessons).where(eq(lessons.id, id));
    return l;
  }

  async getAllLessons(): Promise<Lesson[]> {
    return db.select().from(lessons);
  }

  async updateLesson(id: number, data: Partial<Lesson>): Promise<Lesson | undefined> {
    const [l] = await db.update(lessons).set({ ...data, updatedAt: new Date() }).where(eq(lessons.id, id)).returning();
    return l;
  }

  async deleteLesson(id: number): Promise<void> {
    await db.delete(lessons).where(eq(lessons.id, id));
  }

  async createLessonTag(lessonId: number, tagId: number): Promise<LessonTag> {
    const [lt] = await db.insert(lessonTags).values({ lessonId, tagId }).returning();
    return lt;
  }

  async deleteLessonTag(lessonId: number, tagId: number): Promise<void> {
    await db.delete(lessonTags).where(and(eq(lessonTags.lessonId, lessonId), eq(lessonTags.tagId, tagId)));
  }

  async getTagsByLesson(lessonId: number): Promise<LessonTag[]> {
    return db.select().from(lessonTags).where(eq(lessonTags.lessonId, lessonId));
  }

  async createLessonProgress(data: InsertLessonProgress): Promise<LessonProgress> {
    const [lp] = await db.insert(lessonProgress).values(data).returning();
    return lp;
  }

  async getLessonProgress(userId: string, lessonId: number): Promise<LessonProgress | undefined> {
    const [lp] = await db.select().from(lessonProgress).where(
      and(eq(lessonProgress.userId, userId), eq(lessonProgress.lessonId, lessonId))
    );
    return lp;
  }

  async updateLessonProgress(id: number, data: Partial<LessonProgress>): Promise<LessonProgress | undefined> {
    const [lp] = await db.update(lessonProgress).set(data).where(eq(lessonProgress.id, id)).returning();
    return lp;
  }

  async getProgressByUser(userId: string): Promise<LessonProgress[]> {
    return db.select().from(lessonProgress).where(eq(lessonProgress.userId, userId));
  }

  async createFlashcard(flashcard: InsertFlashcard): Promise<Flashcard> {
    const [f] = await db.insert(flashcards).values(flashcard).returning();
    return f;
  }

  async getFlashcardsByUser(userId: string): Promise<Flashcard[]> {
    return db.select().from(flashcards).where(eq(flashcards.userId, userId));
  }

  async getFlashcardsByUserAndLesson(userId: string, lessonId: number): Promise<Flashcard[]> {
    return db.select().from(flashcards).where(
      and(eq(flashcards.userId, userId), eq(flashcards.lessonId, lessonId))
    );
  }

  async updateFlashcard(id: number, data: Partial<Flashcard>): Promise<Flashcard | undefined> {
    const [f] = await db.update(flashcards).set(data).where(eq(flashcards.id, id)).returning();
    return f;
  }

  async deleteFlashcard(id: number): Promise<void> {
    await db.delete(flashcards).where(eq(flashcards.id, id));
  }

  async createNote(note: InsertNote): Promise<Note> {
    const [n] = await db.insert(notes).values(note).returning();
    return n;
  }

  async getNotesByUser(userId: string): Promise<Note[]> {
    return db.select().from(notes).where(eq(notes.userId, userId));
  }

  async getNotesByUserAndLesson(userId: string, lessonId: number): Promise<Note[]> {
    return db.select().from(notes).where(
      and(eq(notes.userId, userId), eq(notes.lessonId, lessonId))
    );
  }

  async updateNote(id: number, data: Partial<Note>): Promise<Note | undefined> {
    const [n] = await db.update(notes).set({ ...data, updatedAt: new Date() }).where(eq(notes.id, id)).returning();
    return n;
  }

  async deleteNote(id: number): Promise<void> {
    await db.delete(notes).where(eq(notes.id, id));
  }

  async createBookmark(bookmark: InsertBookmark): Promise<Bookmark> {
    const [b] = await db.insert(bookmarks).values(bookmark).returning();
    return b;
  }

  async getBookmarksByUser(userId: string): Promise<Bookmark[]> {
    return db.select().from(bookmarks).where(eq(bookmarks.userId, userId));
  }

  async deleteBookmark(id: number): Promise<void> {
    await db.delete(bookmarks).where(eq(bookmarks.id, id));
  }

  async createCoinTransaction(tx: InsertCoinTransaction): Promise<CoinTransaction> {
    const [ct] = await db.insert(coinTransactions).values(tx).returning();
    return ct;
  }

  async getCoinTransactionsByUser(userId: string): Promise<CoinTransaction[]> {
    return db.select().from(coinTransactions).where(eq(coinTransactions.userId, userId));
  }

  async getSystemSetting(key: string): Promise<SystemSetting | undefined> {
    const [s] = await db.select().from(systemSettings).where(eq(systemSettings.key, key));
    return s;
  }

  async setSystemSetting(key: string, value: string): Promise<SystemSetting> {
    const existing = await this.getSystemSetting(key);
    if (existing) {
      const [s] = await db.update(systemSettings).set({ value }).where(eq(systemSettings.key, key)).returning();
      return s;
    }
    const [s] = await db.insert(systemSettings).values({ key, value }).returning();
    return s;
  }
}

export const storage = new DatabaseStorage();
