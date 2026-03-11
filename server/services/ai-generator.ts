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
  type?: "multiple_choice" | "fill_blank" | "sentence_completion" | "word_translation";
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
  grammaticalRole?: string;
  i_rab?: string;
  partOfSpeech?: string;
  nahwExplanation?: string;
}

export interface SentenceAnalysis {
  sentence: string;
  translation: string;
  translationAr: string;
  grammarNotes: string;
  keyWords: string[];
  wordMap: WordMapItem[];
  sentenceType?: string;
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
  } catch (error: any) {
    const msg = error?.message || String(error);
    const isTimeout = msg.includes("timeout") || msg.includes("ETIMEDOUT") || msg.includes("abort");
    console.error(`[AI] OpenAI xatolik (${isTimeout ? "timeout" : "boshqa"}):`, msg);
    if (isTimeout) {
      throw new Error("AI so'rovi vaqt chegarasidan oshdi (timeout). Qaytadan urinib ko'ring.");
    }
    console.log("[AI] Mock fallback ishlatilmoqda...");
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
    ? `## TIL: ARAB TILIDA TRANSKRIPT

### HARAKAT (التَّشْكِيل) QOIDALARI — BUNGA QAT'IY RIOYA QILING:
Quyidagi BARCHA maydonlarda arabcha so'zlar TO'LIQ HARAKAT bilan yozilishi SHART:
- Har bir harf ustiga/ostiga tegishli harakat qo'yilsin: فَتْحَة (َ), كَسْرَة (ِ), ضَمَّة (ُ), سُكُون (ْ), شَدَّة (ّ), تَنْوِين (ً ٍ ٌ)
- TO'G'RI: ذَهَبَ الْوَلَدُ إِلَى الْمَدْرَسَةِ | NOTO'G'RI: ذهب الولد الى المدرسة
- TO'G'RI: كِتَابٌ جَمِيلٌ | NOTO'G'RI: كتاب جميل
- Alif-lam (ال) oldidan ham harakat qo'yilsin: الْكِتَابُ, الْعِلْمُ
- Tanvin: indefinite ism oxirida ٌ ٍ ً qo'yilsin (كِتَابٌ, كِتَابًا, كِتَابٍ)
- Shadda: tashdidli harflarda ّ belgisi SHART (مُعَلِّمٌ, شَدَّةٌ)
- Harakat qo'yiladigan maydonlar: "word", "sentence", "translationAr", "phrase", "front", "question" (arabcha qism), "options" (arabcha variantlar), wordMap."word"

### TARJIMA QOIDALARI:
- "translation" maydoni: O'ZBEK tilida tarjima (bu eng muhim — O'ZBEKCHA bo'lishi SHART)
- "translationAr" maydoni: arabcha so'zning arabcha izohi yoki sinonimi (HARAKAT BILAN)
- "grammarNotes", "explanation", "contextualMeaning", "nahwExplanation": O'ZBEK tilida`
    : `## TIL: INGLIZ TILIDA TRANSKRIPT
- "word" maydoni: inglizcha so'z
- "translation" maydoni: O'ZBEK tilida tarjima
- "translationAr" maydoni: ARAB tilida tarjima (harakatsiz ham bo'lishi mumkin)
- Barcha tushuntirish, savol, javob variantlari O'ZBEK tilida bo'lsin`;

  const systemPrompt = `# ROL
Sen arab tili bo'yicha tajribali professor va nahv (النَّحْو) mutaxassisisisan. Sening vazifang YouTube video transkriptidan O'ZBEK tilidagi talabalar uchun professional dars materiallari yaratish.

Sen quyidagi manbalarga tayanasan:
- كِتَابُ سِيبَوَيْهِ (Sibavayh kitobi — nahv asosi)
- النَّحْوُ الْوَافِي لِعَبَّاسِ حَسَنٍ (Abbas Hasan — to'liq nahv)
- أَلْفِيَّةُ ابْنِ مَالِكٍ (Ibn Molik alfiyasi — nahv qoidalari)
- شَرْحُ ابْنِ عَقِيلٍ (Ibn Aqil sharhi)

${langInstructions}

# JAVOB FORMATI
Javobni FAQAT JSON formatda ber. Boshqa hech qanday matn, izoh yoki markdown yozma — faqat sof JSON.

# JSON STRUKTURASI
{
  "summaryShort": "Videoning qisqacha mazmuni (2-3 gap, O'ZBEK tilida)",
  "summaryDetailed": "Videoning batafsil mazmuni (5-8 gap, O'ZBEK tilida)",
  "summaryShortAr": "مُلَخَّصٌ قَصِيرٌ لِلْفِيدِيُو (٢-٣ جُمَل بِالْعَرَبِيَّةِ مَعَ التَّشْكِيلِ الْكَامِلِ)",
  "summaryDetailedAr": "مُلَخَّصٌ تَفْصِيلِيٌّ لِلْفِيدِيُو (٥-٨ جُمَل بِالْعَرَبِيَّةِ مَعَ التَّشْكِيلِ الْكَامِلِ)",
  "vocabulary": [
    {
      "word": "${lang === "arabic" ? "arabcha so'z TO'LIQ HARAKAT BILAN (masalan: مُعَلِّمٌ)" : "inglizcha so'z"}",
      "translation": "O'ZBEKCHA tarjima (SHART o'zbekcha bo'lishi kerak)",
      "translationAr": "${lang === "arabic" ? "عَرَبِيّ: تَفْسِيرٌ أَوْ مُرَادِفٌ بِالتَّشْكِيلِ" : "الترجمة العربية"}",
      "partOfSpeech": "${lang === "arabic" ? "اِسْمٌ/فِعْلٌ/حَرْفٌ/صِفَةٌ/ظَرْفٌ" : "noun/verb/adjective/adverb"}",
      "example": "transkriptdan misol gap (arabcha bo'lsa HARAKAT bilan)",
      "difficulty": "${difficulty}"
    }
  ],
  "phrases": [
    {
      "phrase": "${lang === "arabic" ? "عِبَارَةٌ عَرَبِيَّةٌ بِالتَّشْكِيلِ الْكَامِلِ" : "inglizcha ibora"}",
      "translation": "O'ZBEKCHA tarjima",
      "translationAr": "${lang === "arabic" ? "شَرْحُ الْعِبَارَةِ بِالتَّشْكِيلِ" : "الترجمة العربية"}",
      "context": "qayerda ishlatilishi haqida O'ZBEKCHA izoh"
    }
  ],
  "quizzes": [
    {
      "question": "O'ZBEK tilida savol",
      "options": ["variant A", "variant B", "variant C", "variant D"],
      "correctIndex": 0,
      "explanation": "O'ZBEK tilida batafsil tushuntirish",
      "type": "multiple_choice"
    },
    {
      "question": "هَذَا _____ جَمِيلٌ — bo'sh joyga mos so'zni tanlang",
      "options": ["بَيْتٌ", "كِتَابٌ", "وَلَدٌ", "سَيَّارَةٌ"],
      "correctIndex": 0,
      "explanation": "هَذَا بَيْتٌ جَمِيلٌ — Bu go'zal uy. بَيْتٌ — uy degan ma'no",
      "type": "sentence_completion"
    },
    {
      "question": "كَتَبَ",
      "options": ["o'qidi", "yozdi", "bordi", "keldi"],
      "correctIndex": 1,
      "explanation": "كَتَبَ — yozmoq fe'lining o'tgan zamon (الْمَاضِي) shakli",
      "type": "word_translation"
    }
  ],
  "flashcards": [
    {
      "front": "${lang === "arabic" ? "كَلِمَةٌ أَوْ عِبَارَةٌ بِالتَّشْكِيلِ" : "inglizcha so'z yoki ibora"}",
      "back": "O'ZBEKCHA tarjima va tushuntirish",
      "backAr": "التَّرْجَمَةُ وَالشَّرْحُ بِالْعَرَبِيَّةِ مَعَ التَّشْكِيلِ",
      "type": "vocabulary | phrase | grammar"
    }
  ],
  "sentenceAnalysis": [
    {
      "sentence": "${lang === "arabic" ? "الْجُمْلَةُ الْعَرَبِيَّةُ بِالتَّشْكِيلِ الْكَامِلِ" : "inglizcha gap"}",
      "translation": "O'ZBEKCHA tarjima (bu SHART o'zbekcha bo'lishi kerak)",
      "translationAr": "${lang === "arabic" ? "الْجُمْلَةُ بِالتَّشْكِيلِ الْكَامِلِ" : "الترجمة العربية"}",
      "grammarNotes": "O'ZBEK tilida grammatik izoh: gap turi, fe'l zamoni, gap tuzilishi haqida",
      "keyWords": ["kalit", "so'zlar"],
      "sentenceType": "جُمْلَةٌ فِعْلِيَّةٌ yoki جُمْلَةٌ اِسْمِيَّةٌ",
      "wordMap": [
        {
          "word": "${lang === "arabic" ? "كَلِمَةٌ بِالتَّشْكِيلِ" : "original word"}",
          "normalized": "harakat olib tashlangan shakl (masalan: كتب)",
          "translationUz": "O'ZBEKCHA tarjima",
          "translationAr": "${lang === "arabic" ? "تَفْسِيرٌ بِالتَّشْكِيلِ" : "الترجمة العربية"}",
          "contextualMeaning": "shu gapdagi aniq ma'nosi — O'ZBEK tilida",
          "partOfSpeech": "اِسْمٌ | فِعْلٌ | حَرْفٌ | ظَرْفٌ | ضَمِيرٌ | اِسْمُ إِشَارَةٍ | اِسْمٌ مَوْصُولٌ",
          "grammaticalRole": "الْفَاعِلُ | الْمَفْعُولُ بِهِ | الْمُبْتَدَأُ | الْخَبَرُ | الْحَالُ | النَّعْتُ | الْمُضَافُ إِلَيْهِ | الْجَارُّ وَالْمَجْرُورُ | الظَّرْفُ | التَّمْيِيزُ",
          "i_rab": "مَرْفُوعٌ بِالضَّمَّةِ لِأَنَّهُ فَاعِلٌ | مَنْصُوبٌ بِالْفَتْحَةِ لِأَنَّهُ مَفْعُولٌ بِهِ | مَجْرُورٌ بِالْكَسْرَةِ لِأَنَّهُ مُضَافٌ إِلَيْهِ | مَبْنِيٌّ عَلَى الْفَتْحِ",
          "nahwExplanation": "O'ZBEKCHA: Masalan 'Ega (fail) — gapda ish bajaruvchi, marfu holda, damma bilan' yoki 'To'ldiruvchi (maf'ul bih) — fe'l ta'sir ko'rsatgan so'z, mansub holda, fatha bilan'"
        }
      ]
    }
  ]
}

# QOIDALAR

## 1. HARAKAT MAJBURIY QOIDASI (${lang === "arabic" ? "ENG MUHIM" : "arabcha qismlar uchun"})
- Arabcha yoziladigan BARCHA maydondagi BARCHA so'zlarda TO'LIQ harakat (تَشْكِيل كَامِل) bo'lishi SHART
- Har bir harfda tegishli harakat: فَتْحَة, كَسْرَة, ضَمَّة, سُكُون, شَدَّة, تَنْوِين
- Harakatsiz arabcha so'z QABUL QILINMAYDI — bu qat'iy talab
- I'rob alamatlari (الْعَلَامَاتُ الْإِعْرَابِيَّةُ) to'g'ri qo'yilsin

## 2. TARJIMA TILI
- BARCHA "translation", "explanation", "contextualMeaning", "grammarNotes", "nahwExplanation" maydonlari O'ZBEK tilida bo'lsin
- Arabcha maydonlarda arab tili ishlatilsin (HARAKAT bilan)

## 3. SON CHEGARALARI
- vocabulary: 8-15 ta so'z (transkriptdan eng muhim kalit so'zlar)
- phrases: 4-8 ta ibora (kontekstga mos)
- quizzes: 10-12 ta savol, MAJBURIY taqsimot:
  * multiple_choice: 4-5 ta — O'zbek tilida savol, 4 variant
  * sentence_completion: 3-4 ta — arabcha gap O'RTASIDA _____ bo'shliq (BOSHIDA yoki OXIRIDA EMAS!), 4 arabcha variant HARAKAT BILAN
  * word_translation: 3-4 ta — arabcha so'z HARAKAT BILAN, 4 o'zbekcha variant
- flashcards: 8-12 ta karta (vocabulary + phrase + grammar aralash)
- sentenceAnalysis: BARCHA gaplarni tahlil qil — BIRONTASINI HAM TASHLAB KETMA

## 4. SENTENCEANALYSIS QOIDALARI
- Transkriptdagi har bir gap uchun: tarjima, wordMap, grammarNotes bo'lishi SHART
- wordMap: gapdagi HAR BIR so'zning tahlili — birontasini tashlab ketma
- sentenceType: "جُمْلَةٌ فِعْلِيَّةٌ" (fe'l bilan boshlangan) yoki "جُمْلَةٌ اِسْمِيَّةٌ" (ism bilan boshlangan)

## 5. NAHVIY TAHLIL QOIDALARI (الْإِعْرَابُ)
Har bir so'z uchun:
- partOfSpeech: اِسْمٌ (ot), فِعْلٌ (fe'l), حَرْفٌ (harf), ظَرْفٌ (zarf), ضَمِيرٌ (olmosh)
- grammaticalRole: الْفَاعِلُ, الْمَفْعُولُ بِهِ, الْمُبْتَدَأُ, الْخَبَرُ, الْحَالُ, النَّعْتُ, الْمُضَافُ إِلَيْهِ, الْجَارُّ وَالْمَجْرُورُ, التَّمْيِيزُ
- i_rab: to'liq i'rob tahlili — holatni ayting + sababini ko'rsating:
  * مَرْفُوعٌ بِالضَّمَّةِ لِأَنَّهُ فَاعِلٌ (marfu — chunki ega)
  * مَنْصُوبٌ بِالْفَتْحَةِ لِأَنَّهُ مَفْعُولٌ بِهِ (mansub — chunki to'ldiruvchi)
  * مَجْرُورٌ بِالْكَسْرَةِ لِأَنَّهُ مُضَافٌ إِلَيْهِ (majrur — chunki mudof ilayh)
  * مَبْنِيٌّ عَلَى الْفَتْحِ / الضَّمِّ / السُّكُونِ (mabniy — o'zgarmas)
  * مَرْفُوعٌ بِالْوَاوِ لِأَنَّهُ مِنَ الْأَسْمَاءِ الْخَمْسَةِ (5 maxsus ism)
  * مَنْصُوبٌ بِالْيَاءِ لِأَنَّهُ مُثَنًّى (juft son)
- nahwExplanation: O'ZBEK tilida qisqa izoh (masalan: "Ega — gapda ish bajaruvchi, damma bilan ko'tarilgan")

## 6. TEXNIK QOIDALAR
- correctIndex: 0 dan boshlanadi (0-3 orasida)
- Daraja: ${levelLabel}
- JSON VALID bo'lishi SHART — vergul, qavs, qo'shtirnoqlarni tekshir`;


  const maxSentences = 30;
  const sentencesList = sentences.slice(0, maxSentences).map((s, i) => `${i + 1}. ${s}`).join("\n");

  const userPrompt = `# VAZIFA
Quyidagi video transkriptidan ${levelLabel} darajadagi dars materiallari yarat.

# MUHIM ESLATMALAR
1. sentenceAnalysis maydonida quyidagi BARCHA ${Math.min(sentences.length, maxSentences)} ta gapni tahlil qil — BIRONTASINI HAM TASHLAB KETMA
2. Har bir gapdagi HAR BIR so'z wordMap ichida bo'lishi SHART — so'z tashlab ketish MUMKIN EMAS
3. ${lang === "arabic" ? "BARCHA arabcha so'zlar TO'LIQ HARAKAT (تَشْكِيل كَامِل) bilan yozilsin — harakatsiz so'z QABUL QILINMAYDI" : "Arabcha tarjimalarda harakat qo'yishga harakat qiling"}
4. Tarjima va tushuntirish FAQAT O'ZBEK tilida bo'lsin

# GAPLAR RO'YXATI (${Math.min(sentences.length, maxSentences)} ta):
${sentencesList}

# TRANSKRIPT:
${trimmedTranscript}`;

  const startTime = Date.now();
  console.log(`[AI] OpenAI so'rov boshlandi: ${sentences.length} ta gap, ${trimmedTranscript.length} belgi...`);

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 16384,
    response_format: { type: "json_object" },
  }, { timeout: 120000 });

  console.log(`[AI] OpenAI javob keldi: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

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
    type: (["multiple_choice", "fill_blank", "sentence_completion", "word_translation"].includes(q.type)
      ? q.type
      : "multiple_choice") as "multiple_choice" | "fill_blank" | "sentence_completion" | "word_translation",
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
    sentenceType: s.sentenceType || "",
    wordMap: Array.isArray(s.wordMap) ? s.wordMap.map((w: any) => ({
      word: w.word || "",
      normalized: w.normalized || (w.word || "").toLowerCase(),
      translationUz: w.translationUz || "",
      translationAr: w.translationAr || "",
      contextualMeaning: w.contextualMeaning || "",
      grammaticalRole: w.grammaticalRole || "",
      i_rab: w.i_rab || "",
      partOfSpeech: w.partOfSpeech || "",
      nahwExplanation: w.nahwExplanation || "",
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
    const mockRoles = ["الفاعل", "المفعول به", "المبتدأ", "الخبر", "الحال", "الجار والمجرور", "النعت", "المضاف إليه"];
    const mockIrabs = ["مرفوع بالضمة", "منصوب بالفتحة", "مجرور بالكسرة", "مبني على الفتح", "مرفوع بالواو", "منصوب بالياء"];
    const mockPOS = ["اسم", "فعل", "حرف", "ظرف", "ضمير", "اسم", "فعل", "حرف"];
    const mockNahwExp = ["Ega — gap bajaruvchisi", "To'ldiruvchi — fe'l ta'sir qilgan so'z", "Mubtada — gap mavzusi", "Xabar — mubtadaga oid xabar", "Hol — fe'l holatini bildiradi", "Jar va majrur — bog'lovchi", "Sifat — ot belgisini bildiradi", "Mudof ilayh — egalik bildiradi"];
    const wordMap: WordMapItem[] = sentenceWords.map((w, wi) => ({
      word: w,
      normalized: w.toLowerCase(),
      translationUz: mockUzTranslation(w),
      translationAr: mockArabicTranslation(w),
      contextualMeaning: `"${w}" gapdagi kontekstda ishlatilgan`,
      grammaticalRole: mockRoles[wi % mockRoles.length],
      i_rab: mockIrabs[wi % mockIrabs.length],
      partOfSpeech: mockPOS[wi % mockPOS.length],
      nahwExplanation: mockNahwExp[wi % mockNahwExp.length],
    }));
    const isVerbalSentence = /^[\u0600-\u06FF]{2,}\b/.test(s.trim());
    return {
      sentence: s,
      translation: `${sentenceContexts[idx % sentenceContexts.length]} ${keyWords.map(w => mockUzTranslation(w)).join(", ")} haqida gap ketmoqda`,
      translationAr: lang === "arabic" ? s : mockArabicTranslation(s),
      grammarNotes: lang === "arabic" ? detectArabicGrammarPattern(s) : detectGrammarPattern(s),
      keyWords,
      wordMap,
      sentenceType: isVerbalSentence ? "جملة فعلية" : "جملة اسمية",
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
