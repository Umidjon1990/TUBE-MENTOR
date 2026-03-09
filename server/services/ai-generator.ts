import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  ...(process.env.OPENAI_API_KEY ? {} : { baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL }),
});

export interface GeneratedLessonContent {
  summaryShort: string;
  summaryDetailed: string;
  summaryShortAr: string;
  summaryDetailedAr: string;
  vocabularyJson: VocabularyItem[];
  phrasesJson: PhraseItem[];
  quizzesJson: QuizItem[];
  flashcardsJson: FlashcardItem[];
  sentenceAnalysisJson: SentenceAnalysis[];
  aiMetaJson: AiMeta;
}

export interface VocabularyItem {
  word: string;
  translation: string;
  translationAr: string;
  partOfSpeech: string;
  example: string;
  difficulty: "easy" | "medium" | "hard";
}

export interface PhraseItem {
  phrase: string;
  translation: string;
  translationAr: string;
  context: string;
}

export interface QuizItem {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  type?: "multiple_choice" | "fill_blank";
}

export interface FlashcardItem {
  front: string;
  back: string;
  backAr: string;
  type: "vocabulary" | "phrase" | "grammar";
}

export interface WordMapItem {
  word: string;
  normalized: string;
  translationUz: string;
  translationAr: string;
  contextualMeaning: string;
}

export interface SentenceAnalysis {
  sentence: string;
  translation: string;
  translationAr: string;
  grammarNotes: string;
  keyWords: string[];
  wordMap: WordMapItem[];
}

export interface AiMeta {
  provider: "mock" | "openai";
  model: string;
  generatedAt: string;
  transcriptLength: number;
  sentenceCount: number;
}

const LEVEL_LABELS: Record<string, string> = {
  beginner: "boshlang'ich (beginner)",
  intermediate: "o'rta (intermediate)",
  advanced: "yuqori (advanced)",
};

const DIFFICULTY_MAP: Record<string, "easy" | "medium" | "hard"> = {
  beginner: "easy",
  intermediate: "medium",
  advanced: "hard",
};

function detectLanguage(text: string): "arabic" | "english" | "mixed" {
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
  const total = arabicChars + latinChars;
  if (total === 0) return "mixed";
  if (arabicChars / total > 0.6) return "arabic";
  if (latinChars / total > 0.6) return "english";
  return "mixed";
}

export async function generateLessonContent(
  transcript: string,
  sentences: string[],
  level: string
): Promise<GeneratedLessonContent> {
  try {
    return await generateWithOpenAI(transcript, sentences, level);
  } catch (error) {
    console.error("OpenAI generation failed, falling back to mock:", error);
    return generateMockContent(transcript, sentences, level);
  }
}

async function generateWithOpenAI(
  transcript: string,
  sentences: string[],
  level: string
): Promise<GeneratedLessonContent> {
  const levelLabel = LEVEL_LABELS[level] || level;
  const difficulty = DIFFICULTY_MAP[level] || "medium";
  const trimmedTranscript = transcript.slice(0, 8000);
  const lang = detectLanguage(trimmedTranscript);

  const langInstructions = lang === "arabic"
    ? `Transkript ARAB tilida. 
- "word" maydoni: arabcha so'z (asl matndagi)
- "translation" maydoni: O'ZBEK tilida tarjima (bu eng muhim — O'ZBEKCHA bo'lishi SHART)
- "translationAr" maydoni: arabcha so'zning arabcha izohi yoki sinonimi
- "sentence" maydoni: transkriptdan arabcha gap (asl matndagi)
- "grammarNotes" maydoni: O'ZBEK tilida grammatik izoh
- Barcha tushuntirish, savol, javob variantlari O'ZBEK tilida bo'lsin
- "front" maydoni kartochkalarda: arabcha so'z
- "back" maydoni kartochkalarda: O'ZBEK tilida tarjima
- "question" maydoni testlarda: O'ZBEK tilida savol
- "options" maydoni testlarda: aralash (ba'zilari arabcha, ba'zilari o'zbekcha)
- "explanation" maydoni: O'ZBEK tilida tushuntirish`
    : `Transkript INGLIZ tilida.
- "word" maydoni: inglizcha so'z
- "translation" maydoni: O'ZBEK tilida tarjima  
- "translationAr" maydoni: ARAB tilida tarjima
- Barcha tushuntirish, savol, javob variantlari O'ZBEK tilida bo'lsin`;

  const systemPrompt = `Sen professional til o'qituvchisisan. YouTube video transkriptidan o'zbek tilidagi o'quvchilar uchun ta'limiy kontent yaratasan.

${langInstructions}

Javobni FAQAT JSON formatda ber, boshqa hech narsa yozma. JSON quyidagi strukturaga ega bo'lishi kerak:

{
  "summaryShort": "Videoning qisqacha mazmuni (2-3 gap, O'ZBEK tilida)",
  "summaryDetailed": "Videoning batafsil mazmuni (5-8 gap, O'ZBEK tilida)",
  "summaryShortAr": "ملخص قصير للفيديو (2-3 جمل بالعربية)",
  "summaryDetailedAr": "ملخص تفصيلي للفيديو (5-8 جمل بالعربية)",
  "vocabulary": [
    {
      "word": "${lang === "arabic" ? "arabcha so'z" : "inglizcha so'z"}",
      "translation": "O'ZBEKCHA tarjima (bu SHART o'zbekcha bo'lishi kerak!)",
      "translationAr": "${lang === "arabic" ? "arabcha izoh yoki sinonim" : "الترجمة العربية"}",
      "partOfSpeech": "ism/fe'l/sifat/ravish",
      "example": "transkriptdan misol gap",
      "difficulty": "${difficulty}"
    }
  ],
  "phrases": [
    {
      "phrase": "${lang === "arabic" ? "arabcha ibora" : "inglizcha ibora"}",
      "translation": "O'ZBEKCHA tarjima",
      "translationAr": "${lang === "arabic" ? "arabcha izoh" : "الترجمة العربية"}",
      "context": "qayerda ishlatilishi haqida O'ZBEKCHA qisqacha izoh"
    }
  ],
  "quizzes": [
    {
      "question": "O'ZBEK tilida savol",
      "options": ["variant A", "variant B", "variant C", "variant D"],
      "correctIndex": 0,
      "explanation": "O'ZBEK tilida tushuntirish",
      "type": "multiple_choice"
    }
  ],
  "flashcards": [
    {
      "front": "${lang === "arabic" ? "arabcha so'z yoki ibora" : "inglizcha so'z yoki ibora"}",
      "back": "O'ZBEKCHA tarjima va tushuntirish",
      "backAr": "الترجمة والشرح بالعربية",
      "type": "vocabulary/phrase/grammar"
    }
  ],
  "sentenceAnalysis": [
    {
      "sentence": "transkriptdan gap (${lang === "arabic" ? "arabcha" : "inglizcha"})",
      "translation": "O'ZBEKCHA tarjima (bu SHART o'zbekcha bo'lishi kerak!)",
      "translationAr": "${lang === "arabic" ? "arabcha gap (asl nusxa yoki izoh)" : "الترجمة العربية"}",
      "grammarNotes": "grammatik izoh O'ZBEK tilida",
      "keyWords": ["kalit", "so'zlar"],
      "wordMap": [
        {
          "word": "${lang === "arabic" ? "arabcha so'z" : "original word"}",
          "normalized": "lowercased/normalized form",
          "translationUz": "O'ZBEKCHA tarjima",
          "translationAr": "${lang === "arabic" ? "arabcha izoh" : "الترجمة العربية"}",
          "contextualMeaning": "gapdagi ma'nosi O'ZBEK tilida"
        }
      ]
    }
  ]
}

Muhim qoidalar:
- BARCHA "translation" va tushuntirish maydonlari O'ZBEK tilida bo'lishi SHART
- vocabulary: 8-15 ta so'z
- phrases: 4-8 ta ibora
- quizzes: 8-10 ta savol (har xil turdagi: multiple_choice va fill_blank)
- flashcards: 8-12 ta karta (vocabulary + phrase + grammar aralash)
- sentenceAnalysis: transkriptdagi BARCHA gaplarni tahlil qil, birontasini ham tashlab ketma! Har bir gap uchun tarjima, wordMap va grammarNotes bo'lishi SHART.
- wordMap: har bir gapdagi BARCHA so'zlarning so'zma-so'z tarjimasi (hech bir so'zni tashlab ketma!)
- Daraja: ${levelLabel}
- correctIndex 0 dan boshlanadi (0-3)`;

  const sentencesList = sentences.slice(0, 50).map((s, i) => `${i + 1}. ${s}`).join("\n");

  const userPrompt = `Quyidagi video transkriptidan ${levelLabel} darajadagi dars materiallari yarat.

MUHIM: sentenceAnalysis maydonida quyidagi BARCHA ${Math.min(sentences.length, 50)} ta gapni tahlil qil. Birontasini ham tashlab ketma!

GAPLAR RO'YXATI:
${sentencesList}

TRANSKRIPT:
${trimmedTranscript}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 16384,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned empty response");
  }

  const parsed = JSON.parse(content);

  const vocabularyJson: VocabularyItem[] = (parsed.vocabulary || []).map((v: any) => ({
    word: v.word || "",
    translation: v.translation || "",
    translationAr: v.translationAr || "",
    partOfSpeech: v.partOfSpeech || "noun",
    example: v.example || "",
    difficulty: v.difficulty || difficulty,
  }));

  const phrasesJson: PhraseItem[] = (parsed.phrases || []).map((p: any) => ({
    phrase: p.phrase || "",
    translation: p.translation || "",
    translationAr: p.translationAr || "",
    context: p.context || "",
  }));

  const quizzesJson: QuizItem[] = (parsed.quizzes || []).map((q: any) => ({
    question: q.question || "",
    options: Array.isArray(q.options) ? q.options : [],
    correctIndex: typeof q.correctIndex === "number" ? q.correctIndex : 0,
    explanation: q.explanation || "",
    type: q.type === "fill_blank" ? "fill_blank" : "multiple_choice",
  }));

  const flashcardsJson: FlashcardItem[] = (parsed.flashcards || []).map((f: any) => ({
    front: f.front || "",
    back: f.back || "",
    backAr: f.backAr || "",
    type: (["vocabulary", "phrase", "grammar"].includes(f.type) ? f.type : "vocabulary") as "vocabulary" | "phrase" | "grammar",
  }));

  const sentenceAnalysisJson: SentenceAnalysis[] = (parsed.sentenceAnalysis || []).map((s: any) => ({
    sentence: s.sentence || "",
    translation: s.translation || "",
    translationAr: s.translationAr || "",
    grammarNotes: s.grammarNotes || "",
    keyWords: Array.isArray(s.keyWords) ? s.keyWords : [],
    wordMap: Array.isArray(s.wordMap) ? s.wordMap.map((w: any) => ({
      word: w.word || "",
      normalized: w.normalized || (w.word || "").toLowerCase(),
      translationUz: w.translationUz || "",
      translationAr: w.translationAr || "",
      contextualMeaning: w.contextualMeaning || "",
    })) : [],
  }));

  return {
    summaryShort: parsed.summaryShort || "",
    summaryDetailed: parsed.summaryDetailed || "",
    summaryShortAr: parsed.summaryShortAr || "",
    summaryDetailedAr: parsed.summaryDetailedAr || "",
    vocabularyJson,
    phrasesJson,
    quizzesJson,
    flashcardsJson,
    sentenceAnalysisJson,
    aiMetaJson: {
      provider: "openai",
      model: "gpt-4o-mini",
      generatedAt: new Date().toISOString(),
      transcriptLength: transcript.length,
      sentenceCount: sentences.length,
    },
  };
}

function extractWords(text: string): string[] {
  const latinWords = text.match(/\b[a-zA-Z]{3,}\b/g) || [];
  const arabicWords = text.match(/[\u0600-\u06FF]{2,}/g) || [];
  const allWords = [...latinWords, ...arabicWords];
  const unique = [...new Set(allWords.map(w => w.toLowerCase()))];
  return unique;
}

const MOCK_UZ_TRANSLATIONS: Record<string, string> = {
  "بطيخ": "tarvuz",
  "فاكهه": "meva",
  "خضروات": "sabzavotlar",
  "لذيذ": "mazali",
  "اكل": "yemoq",
  "شتاء": "qish",
  "صيف": "yoz",
  "منزل": "uy",
  "سكين": "pichoq",
  "كبير": "katta",
  "صغير": "kichik",
  "جميل": "chiroyli",
  "سلام": "salom",
  "اصدقاء": "do'stlar",
  "برتقال": "apelsin",
  "فيتامين": "vitamin",
  "طبيه": "tibbiy",
  "علم": "ilm",
  "تكنولوجيا": "texnologiya",
  "ماء": "suv",
  "ارض": "yer",
  "programming": "dasturlash",
  "variable": "o'zgaruvchi",
  "function": "funksiya",
  "loop": "tsikl",
  "array": "massiv",
  "object": "obyekt",
  "code": "kod",
  "program": "dastur",
  "computer": "kompyuter",
  "data": "ma'lumot",
  "error": "xatolik",
};

function mockUzTranslation(word: string): string {
  const lower = word.toLowerCase();
  if (MOCK_UZ_TRANSLATIONS[lower]) return MOCK_UZ_TRANSLATIONS[lower];
  if (MOCK_UZ_TRANSLATIONS[word]) return MOCK_UZ_TRANSLATIONS[word];
  const isArabicWord = /[\u0600-\u06FF]/.test(word);
  if (isArabicWord) return `"${word}" so'zining o'zbekcha tarjimasi`;
  const genericUz = ["tushuncha", "atama", "so'z", "ibora", "ifoda", "ma'no"];
  const hash = word.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return `${genericUz[hash % genericUz.length]} (${word})`;
}

function mockArabicTranslation(text: string): string {
  const isArabic = /[\u0600-\u06FF]/.test(text);
  if (isArabic) return text;
  return `ترجمة: ${text.slice(0, 30)}`;
}

function generateMockContent(
  transcript: string,
  sentences: string[],
  level: string
): GeneratedLessonContent {
  const words = extractWords(transcript);
  const selectedWords = words.slice(0, Math.min(10, words.length));
  const usableSentences = sentences.filter(s => s.length > 10);
  const diff = DIFFICULTY_MAP[level] || "medium";
  const lang = detectLanguage(transcript);

  const vocabularyJson: VocabularyItem[] = selectedWords.map((word, i) => ({
    word,
    translation: mockUzTranslation(word),
    translationAr: mockArabicTranslation(word),
    partOfSpeech: lang === "arabic"
      ? ["ism", "fe'l", "sifat", "ravish"][i % 4]
      : ["noun", "verb", "adjective", "adverb"][i % 4],
    example: usableSentences[i % Math.max(1, usableSentences.length)] || word,
    difficulty: diff,
  }));

  const phrasesJson: PhraseItem[] = usableSentences.slice(0, 6).map((s, i) => ({
    phrase: s.length > 60 ? s.slice(0, 60) + "..." : s,
    translation: `Bu ibora ${["muloqotda", "matnda", "nutqda", "yozuvda", "suhbatda", "darsda"][i % 6]} ishlatiladi — o'zbekcha tarjima`,
    translationAr: mockArabicTranslation(s),
    context: "Videodagi kontekstda ishlatilgan",
  }));

  const quizzesJson: QuizItem[] = usableSentences.slice(0, 10).map((s, i) => {
    const keyword = selectedWords[i % Math.max(1, selectedWords.length)] || "so'z";
    const isFillBlank = i % 3 === 2;
    return {
      question: isFillBlank
        ? `Quyidagi gapda bo'sh joyni to'ldiring: "${s.slice(0, 40)}..."`
        : `"${keyword}" so'zining o'zbekcha ma'nosi nima?`,
      options: isFillBlank
        ? [keyword, `noto'g'ri 1`, `noto'g'ri 2`, `noto'g'ri 3`]
        : [
            mockUzTranslation(keyword),
            `noto'g'ri variant 1`,
            `noto'g'ri variant 2`,
            `noto'g'ri variant 3`,
          ],
      correctIndex: 0,
      explanation: `"${keyword}" so'zi matnda "${s.slice(0, 50)}..." kontekstida ishlatilgan. O'zbekchada "${mockUzTranslation(keyword)}" degan ma'noni bildiradi.`,
      type: isFillBlank ? "fill_blank" as const : "multiple_choice" as const,
    };
  });

  const flashcardsJson: FlashcardItem[] = [
    ...selectedWords.slice(0, 5).map(w => ({
      front: w,
      back: mockUzTranslation(w),
      backAr: mockArabicTranslation(w),
      type: "vocabulary" as const,
    })),
    ...phrasesJson.slice(0, 3).map(p => ({
      front: p.phrase,
      back: p.translation,
      backAr: p.translationAr,
      type: "phrase" as const,
    })),
  ];

  const sentenceContexts = ["Bu gapda", "Ushbu jumlada", "Mazkur gapda", "Bu iborada", "Gapda", "Jumlada", "Bu yerda", "Matnda"];
  const sentenceAnalysisJson: SentenceAnalysis[] = usableSentences.map((s, idx) => {
    const sentenceWords = extractWords(s);
    const keyWords = sentenceWords.slice(0, 3);
    const wordMap: WordMapItem[] = sentenceWords.map(w => ({
      word: w,
      normalized: w.toLowerCase(),
      translationUz: mockUzTranslation(w),
      translationAr: mockArabicTranslation(w),
      contextualMeaning: `"${w}" gapdagi kontekstda ishlatilgan`,
    }));
    return {
      sentence: s,
      translation: `${sentenceContexts[idx % sentenceContexts.length]} ${keyWords.map(w => mockUzTranslation(w)).join(", ")} haqida gap ketmoqda`,
      translationAr: lang === "arabic" ? s : mockArabicTranslation(s),
      grammarNotes: lang === "arabic" ? detectArabicGrammarPattern(s) : detectGrammarPattern(s),
      keyWords,
      wordMap,
    };
  });

  const topKeywords = selectedWords.slice(0, 4).map(w => mockUzTranslation(w)).join(", ");
  const shortSummary = lang === "arabic"
    ? `Bu videoda arabcha matn tahlil qilinadi. Asosiy mavzu: ${usableSentences[0]?.slice(0, 60) || "mavjud emas"}...`
    : `Bu videoda ${topKeywords} kabi mavzular haqida gap ketadi.`;
  const detailedSummary = lang === "arabic"
    ? `Bu video darsida quyidagi mavzular ko'rib chiqiladi: ${usableSentences.slice(0, 4).map(s => s.slice(0, 40)).join(", ")}. O'quvchilar yangi so'zlar va iboralarni o'rganadilar.`
    : `Bu video darsida ${topKeywords} kabi tushunchalar ko'rib chiqiladi. O'quvchilar yangi so'zlar va iboralarni o'rganib, til ko'nikmalarini rivojlantiradilar. Darsda ${vocabularyJson.length} ta yangi so'z va ${phrasesJson.length} ta ibora tahlil qilinadi.`;

  return {
    summaryShort: shortSummary.length > 200 ? shortSummary.slice(0, 200) + "..." : shortSummary,
    summaryDetailed: detailedSummary,
    summaryShortAr: lang === "arabic"
      ? `ملخص قصير: ${usableSentences[0]?.slice(0, 80) || "محتوى الفيديو"}`
      : "ملخص قصير للفيديو التعليمي",
    summaryDetailedAr: lang === "arabic"
      ? `ملخص تفصيلي: ${usableSentences.slice(0, 3).join(" ").slice(0, 200)}`
      : "ملخص تفصيلي للفيديو التعليمي يتضمن شرحاً وافياً للمحتوى والمواضيع الرئيسية المطروحة",
    vocabularyJson,
    phrasesJson,
    quizzesJson,
    flashcardsJson,
    sentenceAnalysisJson,
    aiMetaJson: {
      provider: "mock",
      model: "mock-v1",
      generatedAt: new Date().toISOString(),
      transcriptLength: transcript.length,
      sentenceCount: sentences.length,
    },
  };
}

function detectGrammarPattern(sentence: string): string {
  if (/\b(is|are|was|were|am)\b/i.test(sentence)) return "To be fe'li ishlatilgan";
  if (/\b(has|have|had)\b/i.test(sentence)) return "Have/has yordamchi fe'li";
  if (/\b(will|shall|would|could|might)\b/i.test(sentence)) return "Modal fe'l ishlatilgan";
  if (/\b(if|when|while|although)\b/i.test(sentence)) return "Shart/bog'lovchi gap";
  if (/\b(can|must|should)\b/i.test(sentence)) return "Modal fe'l — imkoniyat/majburiyat";
  if (/\b(not|don't|doesn't|didn't)\b/i.test(sentence)) return "Inkor shakli";
  if (/\?$/.test(sentence.trim())) return "So'roq gap";
  return "Oddiy darak gap";
}

function detectArabicGrammarPattern(sentence: string): string {
  if (/[\u061F؟]/.test(sentence)) return "So'roq gap (جملة استفهامية)";
  if (/^(هل|ما|من|كيف|لماذا|اين|متى)\b/.test(sentence.trim())) return "So'roq so'zi bilan boshlangan gap";
  if (/\b(لا|ما|لن|لم|ليس)\b/.test(sentence)) return "Inkor shakli (نفي)";
  if (/\b(ان|إن|لو|اذا|إذا)\b/.test(sentence)) return "Shart gap (جملة شرطية)";
  if (/\b(كان|يكون|هو|هي)\b/.test(sentence)) return "Ism gap (جملة اسمية)";
  if (/^[\u0600-\u06FF]{2,}\b/.test(sentence.trim())) return "Fe'l gap (جملة فعلية)";
  return "Oddiy gap";
}
