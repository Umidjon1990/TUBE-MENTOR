import { db } from "./db";
import { users, categories, tags, lessons, lessonTags, lessonProgress, flashcards, notes, bookmarks, coinTransactions, systemSettings } from "@shared/schema";
import { eq } from "drizzle-orm";
import { log } from "./index";
import { hashPassword } from "./auth";

export async function seedDatabase() {
  const existingAdmin = await db.select().from(users).where(eq(users.username, "admin"));
  if (existingAdmin.length > 0) {
    log("Seed data already exists, skipping.", "seed");
    return;
  }

  log("Seeding database...", "seed");

  const [admin] = await db.insert(users).values({
    fullName: "Administrator",
    username: "admin",
    passwordHash: hashPassword("admin123"),
    role: "admin",
    isActive: true,
    coins: 1000,
  }).returning();

  const [teacher1] = await db.insert(users).values({
    fullName: "Aziza Karimova",
    username: "aziza_k",
    passwordHash: hashPassword("aziza123"),
    role: "teacher",
    isActive: true,
    coins: 350,
  }).returning();

  const [student1] = await db.insert(users).values({
    fullName: "Bobur Aliyev",
    username: "bobur_a",
    passwordHash: hashPassword("bobur123"),
    role: "student",
    isActive: true,
    coins: 120,
  }).returning();

  const [student2] = await db.insert(users).values({
    fullName: "Dilorom Yusupova",
    username: "dilorom_y",
    passwordHash: hashPassword("dilorom123"),
    role: "student",
    isActive: true,
    coins: 75,
  }).returning();

  const categoryData = [
    { name: "Ingliz tili", slug: "ingliz-tili", description: "Ingliz tilini o'rganish darslari" },
    { name: "Dasturlash", slug: "dasturlash", description: "Dasturlash va texnologiya darslari" },
    { name: "Matematika", slug: "matematika", description: "Matematika va hisoblash darslari" },
    { name: "Tarix", slug: "tarix", description: "Jahon va O'zbekiston tarixi" },
    { name: "Fan va tabiat", slug: "fan-tabiat", description: "Tabiiy fanlar va kashfiyotlar" },
  ];

  const createdCategories = await db.insert(categories).values(categoryData).returning();

  const tagData = [
    { name: "Boshlang'ich", slug: "boshlangich" },
    { name: "O'rta daraja", slug: "orta-daraja" },
    { name: "Yuqori daraja", slug: "yuqori-daraja" },
    { name: "Grammatika", slug: "grammatika" },
    { name: "Lug'at", slug: "lugat" },
    { name: "Tinglash", slug: "tinglash" },
    { name: "Python", slug: "python" },
    { name: "JavaScript", slug: "javascript" },
    { name: "Algebra", slug: "algebra" },
    { name: "Geometriya", slug: "geometriya" },
  ];

  const createdTags = await db.insert(tags).values(tagData).returning();

  const lessonData = [
    {
      title: "Ingliz tili: Kundalik muloqot iboralari",
      description: "Kundalik hayotda eng ko'p ishlatiladigan ingliz tilidagi iboralar va ularning to'g'ri talaffuzi haqida batafsil dars.",
      youtubeUrl: "https://www.youtube.com/watch?v=example1",
      thumbnailUrl: "https://img.youtube.com/vi/example1/maxresdefault.jpg",
      language: "uz",
      level: "beginner",
      status: "published",
      categoryId: createdCategories[0].id,
      isFeatured: true,
      createdBy: teacher1.id,
      approvedBy: admin.id,
      publishedBy: admin.id,
      approvedAt: new Date(),
      publishedAt: new Date(),
      summaryShort: "Ingliz tilida kundalik muloqot uchun eng muhim iboralar.",
      summaryDetailed: "Bu darsda siz kundalik hayotda ishlatadigan 50 dan ortiq ingliz tilidagi iboralarni o'rganasiz. Salomlashish, xayrlashish, so'rashish va javob berish iboralari batafsil tushuntirilgan.",
      vocabularyJson: [
        { word: "Hello", translation: "Salom", example: "Hello, how are you?" },
        { word: "Goodbye", translation: "Xayr", example: "Goodbye, see you tomorrow!" },
        { word: "Thank you", translation: "Rahmat", example: "Thank you for your help." },
        { word: "Please", translation: "Iltimos", example: "Please open the door." },
        { word: "Excuse me", translation: "Kechirasiz", example: "Excuse me, where is the library?" },
      ],
      phrasesJson: [
        { phrase: "How are you?", translation: "Qalaysiz?", context: "Salomlashishda" },
        { phrase: "Nice to meet you", translation: "Tanishganimdan xursandman", context: "Tanishishda" },
        { phrase: "What time is it?", translation: "Soat nechchi?", context: "Vaqt so'rashda" },
      ],
      quizzesJson: [
        { question: "'Rahmat' ingliz tilida qanday aytiladi?", options: ["Thank you", "Please", "Sorry", "Hello"], answer: 0 },
        { question: "'How are you?' ning tarjimasi nima?", options: ["Nima gap?", "Qalaysiz?", "Qaerdasiz?", "Kim siz?"], answer: 1 },
      ],
    },
    {
      title: "Python dasturlash: Birinchi qadam",
      description: "Python dasturlash tilini noldan o'rganish uchun mo'ljallangan boshlang'ich dars. O'zgaruvchilar, ma'lumot turlari va oddiy amallar.",
      youtubeUrl: "https://www.youtube.com/watch?v=example2",
      thumbnailUrl: "https://img.youtube.com/vi/example2/maxresdefault.jpg",
      language: "uz",
      level: "beginner",
      status: "published",
      categoryId: createdCategories[1].id,
      isFeatured: true,
      createdBy: teacher1.id,
      approvedBy: admin.id,
      publishedBy: admin.id,
      approvedAt: new Date(),
      publishedAt: new Date(),
      summaryShort: "Pythonda dasturlashning asosiy tushunchalari.",
      summaryDetailed: "Bu darsda Python dasturlash tilining asosiy tushunchalarini o'rganasiz: o'zgaruvchilar, ma'lumot turlari (string, integer, float, boolean), oddiy hisoblash amallari va birinchi dasturingizni yozish.",
      vocabularyJson: [
        { word: "Variable", translation: "O'zgaruvchi", example: "x = 5 — bu o'zgaruvchi" },
        { word: "Function", translation: "Funksiya", example: "def salom(): — bu funksiya" },
        { word: "Loop", translation: "Sikl", example: "for i in range(10): — bu sikl" },
      ],
      quizzesJson: [
        { question: "Python'da o'zgaruvchi nima?", options: ["Ma'lumot saqlaydigan joy", "Dastur nomi", "Xatolik turi", "Fayl nomi"], answer: 0 },
        { question: "'print()' nima qiladi?", options: ["Faylni o'chiradi", "Ekranga chiqaradi", "O'zgaruvchi yaratadi", "Dasturni to'xtatadi"], answer: 1 },
      ],
    },
    {
      title: "Matematika: Algebraik ifodalar",
      description: "Algebraik ifodalarni soddalashtirish va hisoblash usullari. 7-sinf matematikasi uchun foydali dars.",
      youtubeUrl: "https://www.youtube.com/watch?v=example3",
      thumbnailUrl: "https://img.youtube.com/vi/example3/maxresdefault.jpg",
      language: "uz",
      level: "intermediate",
      status: "published",
      categoryId: createdCategories[2].id,
      isFeatured: false,
      createdBy: admin.id,
      approvedBy: admin.id,
      publishedBy: admin.id,
      approvedAt: new Date(),
      publishedAt: new Date(),
      summaryShort: "Algebraik ifodalar bilan ishlash asoslari.",
      summaryDetailed: "Bu darsda siz algebraik ifodalarni soddalashtirish, qavslarni ochish, o'xshash hadlarni qo'shish va ko'paytma formulalarini o'rganasiz.",
      quizzesJson: [
        { question: "2x + 3x nechaga teng?", options: ["5x", "6x", "5x²", "23x"], answer: 0 },
        { question: "(a+b)² formulasi qanday?", options: ["a²+b²", "a²+2ab+b²", "2a+2b", "a²-b²"], answer: 1 },
      ],
    },
    {
      title: "O'zbekiston tarixi: Amir Temur davri",
      description: "Amir Temur davlati, uning yurish va g'alabalari, madaniyat va ilm-fan rivoji haqida batafsil dars.",
      youtubeUrl: "https://www.youtube.com/watch?v=example4",
      thumbnailUrl: "https://img.youtube.com/vi/example4/maxresdefault.jpg",
      language: "uz",
      level: "intermediate",
      status: "published",
      categoryId: createdCategories[3].id,
      isFeatured: true,
      createdBy: teacher1.id,
      approvedBy: admin.id,
      publishedBy: admin.id,
      approvedAt: new Date(),
      publishedAt: new Date(),
      summaryShort: "Amir Temur va uning buyuk davlati haqida.",
      summaryDetailed: "Amir Temur (1336-1405) — O'rta Osiyo tarixidagi eng buyuk sarkarda va davlat arbobi. Bu darsda uning hayoti, yurish va g'alabalari, Samarqandni poytaxt sifatida rivojlantirishi haqida o'rganasiz.",
      vocabularyJson: [
        { word: "Sarkarda", translation: "Commander", example: "Amir Temur buyuk sarkarda edi" },
        { word: "Poytaxt", translation: "Capital", example: "Samarqand poytaxt bo'lgan" },
        { word: "Madaniyat", translation: "Culture", example: "Temuriylar davri madaniyati" },
      ],
    },
    {
      title: "JavaScript: Web dasturlash asoslari",
      description: "JavaScript tilida web sahifalar yaratish. DOM bilan ishlash, hodisalar va interaktiv elementlar.",
      youtubeUrl: "https://www.youtube.com/watch?v=example5",
      thumbnailUrl: "https://img.youtube.com/vi/example5/maxresdefault.jpg",
      language: "uz",
      level: "intermediate",
      status: "draft",
      categoryId: createdCategories[1].id,
      isFeatured: false,
      createdBy: teacher1.id,
      summaryShort: "JavaScript bilan web sahifalar yaratish.",
    },
  ];

  const createdLessons = await db.insert(lessons).values(lessonData).returning();

  const lessonTagMappings = [
    { lessonId: createdLessons[0].id, tagId: createdTags[0].id },
    { lessonId: createdLessons[0].id, tagId: createdTags[3].id },
    { lessonId: createdLessons[0].id, tagId: createdTags[4].id },
    { lessonId: createdLessons[1].id, tagId: createdTags[0].id },
    { lessonId: createdLessons[1].id, tagId: createdTags[6].id },
    { lessonId: createdLessons[2].id, tagId: createdTags[1].id },
    { lessonId: createdLessons[2].id, tagId: createdTags[8].id },
    { lessonId: createdLessons[3].id, tagId: createdTags[1].id },
    { lessonId: createdLessons[4].id, tagId: createdTags[1].id },
    { lessonId: createdLessons[4].id, tagId: createdTags[7].id },
  ];

  await db.insert(lessonTags).values(lessonTagMappings);

  const progressData = [
    {
      userId: student1.id,
      lessonId: createdLessons[0].id,
      accuracy: 85.5,
      completedQuizzes: 2,
      learnedWords: 5,
      studyTimeSeconds: 1200,
      completionPercent: 75.0,
      lastStudiedAt: new Date(Date.now() - 86400000),
    },
    {
      userId: student1.id,
      lessonId: createdLessons[1].id,
      accuracy: 60.0,
      completedQuizzes: 1,
      learnedWords: 3,
      studyTimeSeconds: 600,
      completionPercent: 40.0,
      lastStudiedAt: new Date(Date.now() - 172800000),
    },
    {
      userId: student2.id,
      lessonId: createdLessons[0].id,
      accuracy: 92.0,
      completedQuizzes: 2,
      learnedWords: 5,
      studyTimeSeconds: 900,
      completionPercent: 100.0,
      lastStudiedAt: new Date(Date.now() - 43200000),
    },
    {
      userId: student2.id,
      lessonId: createdLessons[3].id,
      accuracy: 70.0,
      completedQuizzes: 1,
      learnedWords: 3,
      studyTimeSeconds: 800,
      completionPercent: 50.0,
      lastStudiedAt: new Date(),
    },
  ];

  await db.insert(lessonProgress).values(progressData);

  const flashcardData = [
    { userId: student1.id, lessonId: createdLessons[0].id, frontText: "Hello", backText: "Salom", type: "vocabulary", confidenceLevel: 3 },
    { userId: student1.id, lessonId: createdLessons[0].id, frontText: "Thank you", backText: "Rahmat", type: "vocabulary", confidenceLevel: 4 },
    { userId: student1.id, lessonId: createdLessons[0].id, frontText: "How are you?", backText: "Qalaysiz?", type: "phrase", confidenceLevel: 2 },
    { userId: student1.id, lessonId: createdLessons[1].id, frontText: "Variable", backText: "O'zgaruvchi — ma'lumot saqlaydigan joy", type: "vocabulary", confidenceLevel: 1 },
    { userId: student2.id, lessonId: createdLessons[0].id, frontText: "Please", backText: "Iltimos", type: "vocabulary", confidenceLevel: 5 },
    { userId: student2.id, lessonId: createdLessons[0].id, frontText: "Excuse me", backText: "Kechirasiz", type: "vocabulary", confidenceLevel: 4 },
    { userId: student2.id, lessonId: createdLessons[3].id, frontText: "Sarkarda", backText: "Commander — harbiy boshchi", type: "vocabulary", confidenceLevel: 2 },
  ];

  await db.insert(flashcards).values(flashcardData);

  const noteData = [
    { userId: student1.id, lessonId: createdLessons[0].id, sentenceIndex: 2, timestamp: 45, content: "Bu iborani ko'proq mashq qilish kerak. 'How are you' javobida 'I'm fine, thank you' deb aytish mumkin.", isPinned: true },
    { userId: student1.id, lessonId: createdLessons[0].id, sentenceIndex: 5, timestamp: 120, content: "Rasmiy muloqotda 'How do you do?' ham ishlatiladi.", isPinned: false },
    { userId: student1.id, lessonId: createdLessons[1].id, sentenceIndex: 1, timestamp: 30, content: "Python o'rnatish uchun python.org saytiga kirishim kerak.", isPinned: false },
    { userId: student2.id, lessonId: createdLessons[0].id, sentenceIndex: 3, timestamp: 75, content: "Ingliz tilida 'please' so'zi har doim iltimos ma'nosida ishlatilmaydi.", isPinned: true },
    { userId: student2.id, lessonId: createdLessons[3].id, sentenceIndex: 0, timestamp: 0, content: "Amir Temur 1336-yilda Shahrisabzda tug'ilgan.", isPinned: false },
  ];

  await db.insert(notes).values(noteData);

  const bookmarkData = [
    { userId: student1.id, lessonId: createdLessons[0].id, type: "lesson", label: "Keyin takrorlash uchun" },
    { userId: student1.id, lessonId: createdLessons[0].id, type: "sentence", sentenceIndex: 3, timestamp: 90, label: "Muhim ibora" },
    { userId: student1.id, lessonId: createdLessons[1].id, type: "lesson", label: "Python darsi" },
    { userId: student2.id, lessonId: createdLessons[0].id, type: "lesson", label: "Sevimli dars" },
    { userId: student2.id, lessonId: createdLessons[3].id, type: "sentence", sentenceIndex: 5, timestamp: 180, label: "Samarqand haqida" },
  ];

  await db.insert(bookmarks).values(bookmarkData);

  const coinTxData = [
    { userId: admin.id, amount: 1000, type: "initial", description: "Tizim tomonidan berilgan boshlang'ich tangalar" },
    { userId: teacher1.id, amount: 200, type: "initial", description: "Tizim tomonidan berilgan boshlang'ich tangalar" },
    { userId: teacher1.id, amount: 150, type: "lesson_reward", description: "Dars yaratganlik uchun mukofot: Kundalik muloqot iboralari" },
    { userId: student1.id, amount: 100, type: "initial", description: "Ro'yxatdan o'tish bonusi" },
    { userId: student1.id, amount: 20, type: "quiz_complete", description: "Test yakunlangani uchun: Ingliz tili darsi" },
    { userId: student2.id, amount: 100, type: "initial", description: "Ro'yxatdan o'tish bonusi" },
    { userId: student2.id, amount: -25, type: "purchase", description: "Premium dars sotib olindi" },
  ];

  await db.insert(coinTransactions).values(coinTxData);

  const settingsData = [
    { key: "site_name", value: "Tube Mentor AI" },
    { key: "site_description", value: "Sun'iy intellekt yordamida o'rganish platformasi" },
    { key: "default_language", value: "uz" },
    { key: "coins_per_registration", value: "100" },
    { key: "coins_per_quiz_complete", value: "20" },
    { key: "coins_per_lesson_created", value: "150" },
    { key: "max_daily_lessons", value: "10" },
    { key: "maintenance_mode", value: "false" },
  ];

  await db.insert(systemSettings).values(settingsData);

  log("Database seeded successfully!", "seed");
}
