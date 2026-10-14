import { db } from "./db";
import {
  users,
  lessons,
  collections,
  collectionLessons,
  systemSettings,
  type Lesson,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { DEFAULT_COMMERCE_SETTINGS } from "@shared/commerce";
import { hashPassword } from "./auth";

/** Explicit local-only fixtures. Never invoked by production startup. */
export async function seedDemo() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Demo data is forbidden in production");
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.username, "demo_student"));
  if (existing.length) return;
  const accounts = await db
    .insert(users)
    .values([
      {
        username: "demo_admin",
        fullName: "Demo Administrator",
        passwordHash: hashPassword("DemoAdmin2026!"),
        role: "admin",
        onboardingCompleted: true,
        coins: 0,
      },
      {
        username: "demo_teacher",
        fullName: "Demo O‘qituvchi",
        passwordHash: hashPassword("DemoTeacher2026!"),
        role: "teacher",
        onboardingCompleted: true,
        coins: 0,
      },
      {
        username: "demo_student",
        fullName: "Demo O‘quvchi",
        passwordHash: hashPassword("DemoStudent2026!"),
        role: "student",
        onboardingCompleted: true,
      },
      {
        username: "demo_other",
        fullName: "Boshqa O‘quvchi",
        passwordHash: hashPassword("DemoStudent2026!"),
        role: "student",
        onboardingCompleted: true,
      },
    ])
    .returning();
  const teacher = accounts.find((u) => u.role === "teacher")!;
  const admin = accounts.find((u) => u.role === "admin")!;
  const example = exampleLesson(teacher.id, admin.id);
  const [lesson] = await db.insert(lessons).values(example).returning();
  const [paidLesson] = await db.insert(lessons).values({ ...exampleLesson(teacher.id, admin.id), title: "Namuna: Coin bilan ochiladigan dars" }).returning();
  const [draft] = await db
    .insert(lessons)
    .values({
      title: "Yashirin qoralama",
      createdBy: teacher.id,
      status: "draft",
      targetLanguage: "ar",
      level: "A1",
    })
    .returning();
  const [course] = await db
    .insert(collections)
    .values({
      name: "Namuna: Arab tili A1",
      description:
        "Mahalliy tekshiruv uchun namunaviy kurs. Video matniga mosligi tasdiqlanmagan.",
      targetLanguage: "ar",
      level: "A1",
      status: "published",
      createdBy: teacher.id,
    })
    .returning();
  await db.insert(systemSettings).values({ key: "commerce", value: JSON.stringify({ ...DEFAULT_COMMERCE_SETTINGS, demoLessonId: lesson.id }) }).onConflictDoUpdate({ target: systemSettings.key, set: { value: JSON.stringify({ ...DEFAULT_COMMERCE_SETTINGS, demoLessonId: lesson.id }) } });
  await db.insert(collectionLessons).values([
    { collectionId: course.id, lessonId: lesson.id, orderIndex: 0 },
    { collectionId: course.id, lessonId: paidLesson.id, orderIndex: 1 },
    { collectionId: course.id, lessonId: draft.id, orderIndex: 2 },
  ]);
}
export function exampleLesson(
  teacherId: string,
  adminId: string,
): Partial<Lesson> & Pick<Lesson, "title"> {
  const lines = [
    ["أَنَا طَالِبٌ فِي الْمَدْرَسَةِ.", "Men maktabda o‘quvchiman."],
    ["هَذَا كِتَابٌ جَدِيدٌ.", "Bu yangi kitob."],
    ["أَذْهَبُ إِلَى الْبَيْتِ.", "Men uyga boraman."],
  ];
  const words = [
    {
      word: "طَالِبٌ",
      translation: "o‘quvchi",
      partOfSpeech: "noun",
      root: "ط ل ب",
      i_rab: "خبر مرفوع",
      grammaticalRole: "Xabar",
    },
    { word: "الْمَدْرَسَةِ", translation: "maktab", partOfSpeech: "noun" },
    { word: "كِتَابٌ", translation: "kitob", partOfSpeech: "noun" },
    { word: "جَدِيدٌ", translation: "yangi", partOfSpeech: "adjective" },
    { word: "أَذْهَبُ", translation: "boraman", partOfSpeech: "verb" },
    { word: "الْبَيْتِ", translation: "uy", partOfSpeech: "noun" },
  ];
  return {
    title: "Namuna: Maktab va uy",
    description:
      "Mahalliy namuna kontenti; haqiqiy dars sifatida nashr qilishdan oldin video bilan moslang.",
    youtubeUrl: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
    thumbnailUrl: null,
    createdBy: teacherId,
    targetLanguage: "ar",
    level: "A1",
    status: "published",
    transcriptSource: "manual",
    transcript: lines.map((l) => l[0]).join("\n"),
    summaryShort: "Maktab, kitob va uy haqida oddiy gaplar.",
    summaryDetailed:
      "Mahalliy test uchun arabcha gaplar va o‘zbekcha tarjimalar.",
    subtitlesJson: lines.map((l, i) => ({
      text: l[0],
      startTime: i * 10,
      endTime: (i + 1) * 10,
    })),
    sentenceAnalysisJson: lines.map((l, i) => ({
      sentence: l[0],
      translation: l[1],
      lineIndices: [i],
      sentenceType: "Jumla",
      grammarNotes:
        i === 0 ? "Ismiy gap: أَنَا — mubtado, طَالِبٌ — xabar." : "",
      wordMap: words
        .slice(i * 2, i * 2 + 2)
        .map((w) => ({
          ...w,
          translationUz: w.translation,
          contextualMeaning: w.translation,
        })),
    })),
    vocabularyJson: words,
    quizzesJson: [
      {
        question: "طَالِبٌ so‘zining ma’nosi nima?",
        options: ["o‘quvchi", "kitob", "uy"],
        correctIndex: 0,
        explanation: "طَالِبٌ — o‘quvchi.",
      },
    ],
    aiMetaJson: { provider: "manual" },
    contentChecks: {
      text: true,
      translation: true,
      timing: true,
      exercises: true,
    },
    approvedBy: adminId,
    approvedAt: new Date(),
    publishedBy: adminId,
    publishedAt: new Date(),
  };
}
