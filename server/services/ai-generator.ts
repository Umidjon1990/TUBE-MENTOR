import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export interface GeneratedLessonContent {
  summaryShort: string;
  summaryDetailed: string;
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
  partOfSpeech: string;
  example: string;
  difficulty: "easy" | "medium" | "hard";
}

export interface PhraseItem {
  phrase: string;
  translation: string;
  context: string;
}

export interface QuizItem {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface FlashcardItem {
  front: string;
  back: string;
  type: "vocabulary" | "phrase" | "grammar";
}

export interface SentenceAnalysis {
  sentence: string;
  translation: string;
  grammarNotes: string;
  keyWords: string[];
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

  const systemPrompt = `Sen professional til o'qituvchisisan. YouTube video transkriptidan o'zbek tilidagi o'quvchilar uchun ta'limiy kontent yaratasan.
Javobni FAQAT JSON formatda ber, boshqa hech narsa yozma. JSON quyidagi strukturaga ega bo'lishi kerak:

{
  "summaryShort": "Videoning qisqacha mazmuni (2-3 gap, o'zbek tilida)",
  "summaryDetailed": "Videoning batafsil mazmuni (5-8 gap, o'zbek tilida)",
  "vocabulary": [
    {
      "word": "inglizcha so'z",
      "translation": "o'zbekcha tarjima",
      "partOfSpeech": "noun/verb/adjective/adverb",
      "example": "transkriptdan misol gap",
      "difficulty": "${difficulty}"
    }
  ],
  "phrases": [
    {
      "phrase": "iborani inglizcha yozing",
      "translation": "o'zbekcha tarjima",
      "context": "qayerda ishlatilishi haqida qisqacha izoh"
    }
  ],
  "quizzes": [
    {
      "question": "o'zbek tilida savol",
      "options": ["variant A", "variant B", "variant C", "variant D"],
      "correctIndex": 0,
      "explanation": "o'zbek tilida tushuntirish"
    }
  ],
  "flashcards": [
    {
      "front": "so'z yoki ibora",
      "back": "tarjima va tushuntirish",
      "type": "vocabulary/phrase/grammar"
    }
  ],
  "sentenceAnalysis": [
    {
      "sentence": "transkriptdan gap",
      "translation": "o'zbekcha tarjima",
      "grammarNotes": "grammatik izoh o'zbek tilida",
      "keyWords": ["kalit", "so'zlar"]
    }
  ]
}

Muhim qoidalar:
- Barcha tushuntirish va tarjimalar O'ZBEK tilida bo'lsin
- vocabulary: 8-12 ta so'z
- phrases: 4-6 ta ibora
- quizzes: 5-8 ta savol (har xil turdagi)
- flashcards: 8-12 ta karta (vocabulary + phrase + grammar aralash)
- sentenceAnalysis: 5-8 ta gap tahlili
- Daraja: ${levelLabel}
- correctIndex 0 dan boshlanadi (0-3)`;

  const userPrompt = `Quyidagi video transkriptidan ${levelLabel} darajadagi dars materiallari yarat:

TRANSKRIPT:
${trimmedTranscript}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 4096,
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
    partOfSpeech: v.partOfSpeech || "noun",
    example: v.example || "",
    difficulty: v.difficulty || difficulty,
  }));

  const phrasesJson: PhraseItem[] = (parsed.phrases || []).map((p: any) => ({
    phrase: p.phrase || "",
    translation: p.translation || "",
    context: p.context || "",
  }));

  const quizzesJson: QuizItem[] = (parsed.quizzes || []).map((q: any) => ({
    question: q.question || "",
    options: Array.isArray(q.options) ? q.options : [],
    correctIndex: typeof q.correctIndex === "number" ? q.correctIndex : 0,
    explanation: q.explanation || "",
  }));

  const flashcardsJson: FlashcardItem[] = (parsed.flashcards || []).map((f: any) => ({
    front: f.front || "",
    back: f.back || "",
    type: (["vocabulary", "phrase", "grammar"].includes(f.type) ? f.type : "vocabulary") as "vocabulary" | "phrase" | "grammar",
  }));

  const sentenceAnalysisJson: SentenceAnalysis[] = (parsed.sentenceAnalysis || []).map((s: any) => ({
    sentence: s.sentence || "",
    translation: s.translation || "",
    grammarNotes: s.grammarNotes || "",
    keyWords: Array.isArray(s.keyWords) ? s.keyWords : [],
  }));

  return {
    summaryShort: parsed.summaryShort || "",
    summaryDetailed: parsed.summaryDetailed || "",
    vocabularyJson,
    phrasesJson,
    quizzesJson,
    flashcardsJson,
    sentenceAnalysisJson,
    aiMetaJson: {
      provider: "openai",
      model: "gpt-4o",
      generatedAt: new Date().toISOString(),
      transcriptLength: transcript.length,
      sentenceCount: sentences.length,
    },
  };
}

function extractWords(text: string): string[] {
  const words = text.match(/\b[a-zA-Z]{4,}\b/g) || [];
  const unique = [...new Set(words.map(w => w.toLowerCase()))];
  return unique;
}

function generateMockContent(
  transcript: string,
  sentences: string[],
  level: string
): GeneratedLessonContent {
  const words = extractWords(transcript);
  const selectedWords = words.slice(0, Math.min(10, words.length));
  const usableSentences = sentences.filter(s => s.length > 15).slice(0, 20);
  const diff = DIFFICULTY_MAP[level] || "medium";

  const vocabularyJson: VocabularyItem[] = selectedWords.map((word, i) => ({
    word,
    translation: `${word} — tarjima`,
    partOfSpeech: ["noun", "verb", "adjective", "adverb"][i % 4],
    example: usableSentences[i % usableSentences.length] || `This is an example with ${word}.`,
    difficulty: diff,
  }));

  const phrasesJson: PhraseItem[] = usableSentences.slice(0, 6).map(s => ({
    phrase: s.length > 60 ? s.slice(0, 60) + "..." : s,
    translation: `Tarjima: ${s.slice(0, 40)}...`,
    context: "Videodagi kontekstda ishlatilgan",
  }));

  const quizzesJson: QuizItem[] = usableSentences.slice(0, 5).map((s, i) => {
    const keyword = selectedWords[i] || "concept";
    return {
      question: `"${keyword}" so'zining ma'nosi nima?`,
      options: [
        `${keyword} — to'g'ri tarjima`,
        `${keyword} — noto'g'ri variant 1`,
        `${keyword} — noto'g'ri variant 2`,
        `${keyword} — noto'g'ri variant 3`,
      ],
      correctIndex: 0,
      explanation: `"${keyword}" so'zi matnda "${s.slice(0, 50)}..." kontekstida ishlatilgan.`,
    };
  });

  const flashcardsJson: FlashcardItem[] = [
    ...selectedWords.slice(0, 5).map(w => ({
      front: w,
      back: `${w} — tarjima (${diff})`,
      type: "vocabulary" as const,
    })),
    ...phrasesJson.slice(0, 3).map(p => ({
      front: p.phrase,
      back: p.translation,
      type: "phrase" as const,
    })),
  ];

  const sentenceAnalysisJson: SentenceAnalysis[] = usableSentences.slice(0, 8).map(s => {
    const keyWords = extractWords(s).slice(0, 3);
    return {
      sentence: s,
      translation: `Tarjima: ${s.slice(0, 60)}...`,
      grammarNotes: detectGrammarPattern(s),
      keyWords,
    };
  });

  const shortSummary = usableSentences.slice(0, 2).join(" ");
  const detailedSummary = usableSentences.slice(0, 5).join(" ");

  return {
    summaryShort: shortSummary.length > 200 ? shortSummary.slice(0, 200) + "..." : shortSummary,
    summaryDetailed: detailedSummary,
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
