import OpenAI from "openai";
import { getLanguageConfig } from "@shared/languages";

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      ...(process.env.OPENAI_API_KEY ? {} : { baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL }),
    });
  }
  return _openai;
}

export interface GeneratedLessonContent {
  summaryShort: string;
  summaryDetailed: string;
  summaryShortAr: string;
  summaryDetailedAr: string;
  vocabularyJson: VocabularyItem[];
  phrasesJson: never[];
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
}

export interface SentenceAnalysis {
  sentence: string;
  translation: string;
  translationAr: string;
  wordMap: WordMapItem[];
}

export interface AiMeta {
  provider: "mock" | "openai";
  model: string;
  targetLanguage?: string;
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

function buildArabicSystemPrompt(lang: string, levelLabel: string, difficulty: string): string {
  return `# ROL
Sen arab tili bo'yicha tajribali professor va mutaxassisisisan. YouTube video transkriptidan O'ZBEK tilidagi talabalar uchun professional dars materiallari yaratasan.

Sen quyidagi manbalarga tayanasan:
- كِتَابُ سِيبَوَيْهِ (Sibavayh kitobi — nahv asosi)
- النَّحْوُ الْوَافِي لِعَبَّاسِ حَسَنٍ (Abbas Hasan — to'liq nahv)
- أَلْفِيَّةُ ابْنِ مَالِكٍ (Ibn Molik alfiyasi — nahv qoidalari)
- شَرْحُ ابْنِ عَقِيلٍ (Ibn Aqil sharhi)

## ⚠️ IMLOVIY XATOLAR — MUTLAQO BO'LMASLIGI KERAK:
1. Arabcha matnda IMLOVIY XATO bo'lishi MUMKIN EMAS:
   - Har bir so'zni lug'atdan tekshir
   - Hamza (ء أ إ ؤ ئ) to'g'ri joyda yozilsin
   - Taa marbuuta (ة) va haa (ه) farqlansin: مَدْرَسَة (maktab), لَهُ (unga)
   - Alif maqsuura (ى) va yaa (ي) farqlansin: عَلَى (ustida), عَلِيّ (Ali)
   - Alif wasl (ا) va alif qat' (أ إ) to'g'ri ishlatilsin
   - Laam shamsiyya va qamariyya to'g'ri bo'lsin: الشَّمْسُ (laam tushadi), الْقَمَرُ (laam saqlanadi)
2. O'zbekcha tarjimada IMLOVIY XATO bo'lishi MUMKIN EMAS:
   - O'zbek alifbosi: a,b,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,t,u,v,x,y,z,o',g',sh,ch,ng
   - To'g'ri: o'qituvchi, maktab | Noto'g'ri: o'kituvchi, mektab

## HARAKAT (التَّشْكِيل) QOIDALARI — QAT'IY RIOYA QILING:
Quyidagi BARCHA maydonlarda arabcha so'zlar TO'LIQ va TO'G'RI HARAKAT bilan yozilishi SHART:

### Asosiy harakatlar:
- فَتْحَة (َ): ochiq tovush (a), harf ustiga qo'yiladi
- كَسْرَة (ِ): yopiq tovush (i), harf ostiga qo'yiladi
- ضَمَّة (ُ): dumaloq tovush (u), harf ustiga qo'yiladi
- سُكُون (ْ): harakatsiz harf, harf ustiga doiracha
- شَدَّة (ّ): ikkilangan harf, ALBATTA harakat bilan birga: مُعَلِّمٌ (shadda + kasra)
- تَنْوِين: indefinite ism oxirida ٌ (rafg'), ٍ (jarr), ً (nasb): كِتَابٌ, كِتَابٍ, كِتَابًا

### I'rob qoidalari (oxirgi harakat):
- مَرْفُوعٌ (ko'tarilgan): ُ yoki ٌ (فَاعِل, مُبْتَدَأٌ, خَبَرٌ)
- مَنْصُوبٌ (tushirilgan): َ yoki ً (مَفْعُولٌ بِهِ, خَبَرُ إِنَّ)
- مَجْرُورٌ (tortilgan): ِ yoki ٍ (مُضَافٌ إِلَيْهِ, بَعْدَ حَرْفِ الْجَرِّ)
- مَجْزُومٌ (kesik): ْ (الْفِعْلُ الْمُضَارِعُ بَعْدَ لَمْ)

### Xatolarga misollar (BUNDAY YOZMA!):
- ❌ ذهب الولد الى المدرسة → ✅ ذَهَبَ الْوَلَدُ إِلَى الْمَدْرَسَةِ
- ❌ كتاب جميل → ✅ كِتَابٌ جَمِيلٌ
- ❌ المعلم كتب → ✅ الْمُعَلِّمُ كَتَبَ
- ❌ هذا ولد → ✅ هَذَا وَلَدٌ
- ❌ انّ (xato shadda) → ✅ إِنَّ (to'g'ri hamza + shadda + fatha)

### Harakat qo'yiladigan BARCHA maydonlar:
"word", "sentence", "translationAr", "front", "question" (arabcha qism), "options" (arabcha variantlar), wordMap."word", wordMap."translationAr", "summaryShortAr", "summaryDetailedAr"

### QAT'IY TEKSHIRUV:
- Harakatsiz arabcha so'z QABUL QILINMAYDI
- Noto'g'ri harakat qo'yilgan so'z QABUL QILINMAYDI
- Javob berishdan oldin har bir arabcha so'zni ikki marta tekshir: 1) imlo to'g'rimi? 2) harakat to'g'rimi?

## TARJIMA QOIDALARI:
- "translation" maydoni: O'ZBEK tilida tarjima (bu eng muhim — O'ZBEKCHA bo'lishi SHART)
- "translationAr" maydoni: arabcha so'zning arabcha izohi yoki sinonimi (HARAKAT BILAN)
- "explanation": O'ZBEK tilida
${lang === "english" ? `
## TIL: INGLIZ TILIDA TRANSKRIPT
- "word" maydoni: inglizcha so'z
- "translation" maydoni: O'ZBEK tilida tarjima
- "translationAr" maydoni: ARAB tilida tarjima (HARAKAT bilan)
- Barcha tushuntirish, savol, javob variantlari O'ZBEK tilida bo'lsin` : ""}

# JAVOB FORMATI
Javobni FAQAT JSON formatda ber. Boshqa hech qanday matn, izoh, markdown yozma — faqat sof JSON: { dan boshlab } gacha.

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
      "example": "transkriptdan misol gap (${lang === "arabic" ? "HARAKAT bilan" : "asl tilida"})",
      "difficulty": "${difficulty}"
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
      "type": "vocabulary | grammar"
    }
  ],
  "sentenceAnalysis": [
    {
      "sentence": "${lang === "arabic" ? "الْجُمْلَةُ الْعَرَبِيَّةُ بِالتَّشْكِيلِ الْكَامِلِ" : "inglizcha gap"}",
      "translation": "O'ZBEKCHA tarjima (bu SHART o'zbekcha bo'lishi kerak)",
      "translationAr": "${lang === "arabic" ? "الْجُمْلَةُ بِالتَّشْكِيلِ الْكَامِلِ" : "الترجمة العربية مع التشكيل"}",
      "wordMap": [
        {
          "word": "${lang === "arabic" ? "كَلِمَةٌ بِالتَّشْكِيلِ" : "original word"}",
          "normalized": "harakat olib tashlangan shakl (masalan: كتب)",
          "translationUz": "O'ZBEKCHA tarjima",
          "translationAr": "${lang === "arabic" ? "تَفْسِيرٌ أَوْ مُرَادِفٌ بِالتَّشْكِيلِ" : "الترجمة العربية"}"
        }
      ]
    }
  ]
}

# QOIDALAR

## 1. HARAKAT — ENG MUHIM QOIDA
- BARCHA arabcha so'zlarda TO'LIQ harakat (تَشْكِيل كَامِل) bo'lishi SHART
- Har bir harfda tegishli harakat: فَتْحَة, كَسْرَة, ضَمَّة, سُكُون, شَدَّة, تَنْوِين
- I'rob alamatlari to'g'ri qo'yilsin
- Harakatsiz arabcha so'z QABUL QILINMAYDI — bu qat'iy talab

## 2. TARJIMA TILI
- BARCHA "translation", "explanation", "back" maydonlari — O'ZBEK tilida
- Arabcha maydonlar ("translationAr", "backAr", "summaryShortAr", "summaryDetailedAr") — arab tilida HARAKAT bilan

## 3. QUIZ TURLARI — MAJBURIY:
- multiple_choice: 4-5 ta (O'zbek tilida savol, 4 variant)
- sentence_completion: 3-4 ta (arabcha gap O'RTASIDA _____ bo'shliq, BOSHIDA yoki OXIRIDA EMAS!, 4 arabcha variant HARAKAT BILAN)
- word_translation: 3-4 ta (arabcha so'z HARAKAT BILAN, 4 o'zbekcha variant)

## 4. SON CHEGARALARI
- vocabulary: 8-15 ta so'z
- quizzes: 10-12 ta savol (3 tur aralash)
- flashcards: 8-12 ta karta
- sentenceAnalysis: BARCHA gaplar — BIRONTASINI HAM TASHLAB KETMA!

## 5. SENTENCEANALYSIS
- Transkriptdagi har bir gap: tarjima + wordMap SHART
- wordMap: gapdagi HAR BIR so'z tahlili — so'z tashlab ketish MUMKIN EMAS
- Har bir so'z uchun faqat 4 ta maydon: word (asl shakl HARAKAT bilan), normalized (harakat olib tashlangan), translationUz (o'zbekcha), translationAr (arabcha sinonim HARAKAT bilan)

## 6. TEXNIK
- correctIndex: 0 dan boshlanadi (0-3)
- Daraja: ${levelLabel}
- JSON VALID bo'lishi SHART — vergul, qavs, qo'shtirnoqlarni tekshir`;
}

function buildEnglishSystemPrompt(lang: string, levelLabel: string, difficulty: string): string {
  return `# ROL
Sen ingliz tili bo'yicha tajribali professor va mutaxassisisisan. YouTube video transkriptidan O'ZBEK tilidagi talabalar uchun professional ingliz tili dars materiallari yaratasan.

# JAVOB FORMATI
Javobni FAQAT JSON formatda ber. Boshqa hech qanday matn, izoh, markdown yozma — faqat sof JSON: { dan boshlab } gacha.

# JSON STRUKTURASI
{
  "summaryShort": "Videoning qisqacha mazmuni (2-3 gap, O'ZBEK tilida)",
  "summaryDetailed": "Videoning batafsil mazmuni (5-8 gap, O'ZBEK tilida)",
  "summaryShortAr": "Short summary of the video (2-3 sentences, in English)",
  "summaryDetailedAr": "Detailed summary of the video (5-8 sentences, in English)",
  "vocabulary": [
    {
      "word": "English word or phrase from the transcript",
      "translation": "O'ZBEKCHA tarjima (SHART o'zbekcha bo'lishi kerak)",
      "translationAr": "English definition or synonym",
      "partOfSpeech": "noun/verb/adjective/adverb/preposition/conjunction",
      "example": "Example sentence from transcript using this word",
      "difficulty": "${difficulty}"
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
      "question": "I _____ to school every day — bo'sh joyga mos so'zni tanlang",
      "options": ["go", "goes", "went", "going"],
      "correctIndex": 0,
      "explanation": "I go to school every day — Men har kuni maktabga boraman. Simple present tense da 'I' bilan 'go' ishlatiladi",
      "type": "sentence_completion"
    },
    {
      "question": "accomplish",
      "options": ["erishmoq", "yurmoq", "o'qimoq", "uxlamoq"],
      "correctIndex": 0,
      "explanation": "'accomplish' — maqsadga erishmoq, bajarmoq degan ma'noni bildiradi",
      "type": "word_translation"
    }
  ],
  "flashcards": [
    {
      "front": "English word or phrase",
      "back": "O'ZBEKCHA tarjima va tushuntirish",
      "backAr": "English definition, synonym, or usage note",
      "type": "vocabulary | grammar"
    }
  ],
  "sentenceAnalysis": [
    {
      "sentence": "Original English sentence from transcript",
      "translation": "O'ZBEKCHA tarjima (bu SHART o'zbekcha bo'lishi kerak)",
      "translationAr": "The same English sentence (for reference)",
      "wordMap": [
        {
          "word": "original word as it appears",
          "normalized": "base/dictionary form (e.g., 'goes' -> 'go')",
          "translationUz": "O'ZBEKCHA tarjima",
          "translationAr": "English definition or synonym"
        }
      ]
    }
  ]
}

# QOIDALAR

## 1. INGLIZ TILI SO'ZLARI
- BARCHA so'zlar asl inglizcha shaklida yozilsin
- Transkripsiya (IPA) kerak EMAS
- "word" maydoni: inglizcha so'z yoki ibora
- "translationAr" maydoni: inglizcha izoh yoki sinonim

## 2. TARJIMA TILI
- BARCHA "translation", "explanation", "back" maydonlari — O'ZBEK tilida
- "summaryShortAr", "summaryDetailedAr", "translationAr", "backAr" — INGLIZ tilida

## 3. QUIZ TURLARI — MAJBURIY:
- multiple_choice: 4-5 ta (O'zbek tilida savol, 4 variant)
- sentence_completion: 3-4 ta (inglizcha gap O'RTASIDA _____ bo'shliq, 4 inglizcha variant)
- word_translation: 3-4 ta (inglizcha so'z, 4 o'zbekcha variant)

## 4. SON CHEGARALARI
- vocabulary: 8-15 ta so'z
- quizzes: 10-12 ta savol (3 tur aralash)
- flashcards: 8-12 ta karta
- sentenceAnalysis: BARCHA gaplar — BIRONTASINI HAM TASHLAB KETMA!

## 5. SENTENCEANALYSIS
- Transkriptdagi har bir gap: tarjima + wordMap SHART
- wordMap: gapdagi HAR BIR so'z tahlili — so'z tashlab ketish MUMKIN EMAS
- Har bir so'z uchun faqat 4 ta maydon: word, normalized, translationUz, translationAr

## 6. TEXNIK
- correctIndex: 0 dan boshlanadi (0-3)
- Daraja: ${levelLabel}
- JSON VALID bo'lishi SHART — vergul, qavs, qo'shtirnoqlarni tekshir`;
}

export async function generateLessonContent(
  transcript: string,
  sentences: string[],
  level: string,
  targetLanguage: string = "ar"
): Promise<GeneratedLessonContent> {
  try {
    return await generateWithOpenAI(transcript, sentences, level, targetLanguage);
  } catch (error: any) {
    const msg = error?.message || String(error);
    const isTimeout = msg.includes("timeout") || msg.includes("ETIMEDOUT") || msg.includes("abort");
    console.error(`[AI] OpenAI xatolik (${isTimeout ? "timeout" : "boshqa"}):`, msg);
    if (isTimeout) {
      throw new Error("AI so'rovi vaqt chegarasidan oshdi (timeout). Qaytadan urinib ko'ring.");
    }
    console.log("[AI] Mock fallback ishlatilmoqda...");
    return generateMockContent(transcript, sentences, level, targetLanguage);
  }
}

async function generateWithOpenAI(
  transcript: string,
  sentences: string[],
  level: string,
  targetLanguage: string = "ar"
): Promise<GeneratedLessonContent> {
  const levelLabel = LEVEL_LABELS[level] || level;
  const difficulty = DIFFICULTY_MAP[level] || "medium";
  const trimmedTranscript = transcript.slice(0, 8000);
  const lang = detectLanguage(trimmedTranscript);
  const langConfig = getLanguageConfig(targetLanguage);

  const systemPrompt = targetLanguage === "ar"
    ? buildArabicSystemPrompt(lang, levelLabel, difficulty)
    : buildEnglishSystemPrompt(lang, levelLabel, difficulty);


  const maxSentences = 30;
  const sentencesList = sentences.slice(0, maxSentences).map((s, i) => `${i + 1}. ${s}`).join("\n");

  const userPrompt = `# VAZIFA
Quyidagi video transkriptidan ${levelLabel} darajadagi dars materiallari yarat.

# ⚠️ MUHIM ESLATMALAR — QAT'IY RIOYA QILING:
1. sentenceAnalysis maydonida quyidagi BARCHA ${Math.min(sentences.length, maxSentences)} ta gapni tahlil qil — BIRONTASINI HAM TASHLAB KETMA
2. Har bir gapdagi HAR BIR so'z wordMap ichida bo'lishi SHART — so'z tashlab ketish MUMKIN EMAS
3. ${lang === "arabic" ? `BARCHA arabcha so'zlar TO'LIQ HARAKAT (تَشْكِيل كَامِل) bilan yozilsin:
   - Har bir harfda harakat: فَتْحَة, كَسْرَة, ضَمَّة, سُكُون, شَدَّة, تَنْوِين
   - I'rob to'g'ri bo'lsin: فَاعِلٌ (damma), مَفْعُولًا (fatha+tanvin), مَجْرُورٍ (kasra+tanvin)
   - Harakatsiz so'z QABUL QILINMAYDI` : "Arabcha tarjimalarda harakat qo'yishga harakat qiling"}
4. Tarjima va tushuntirish FAQAT O'ZBEK tilida bo'lsin
5. IMLOVIY XATO BO'LMASLIGI KERAK — arabchada ham, o'zbekchada ham
6. Javob berishdan oldin har bir so'zni tekshir: imlo to'g'rimi? harakat to'g'rimi?

# GAPLAR RO'YXATI (${Math.min(sentences.length, maxSentences)} ta):
${sentencesList}

# TRANSKRIPT:
${trimmedTranscript}`;

  const startTime = Date.now();
  console.log(`[AI] OpenAI so'rov boshlandi: ${sentences.length} ta gap, ${trimmedTranscript.length} belgi...`);

  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.3,
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

  const hasArabic = (t: string) => /[\u0600-\u06FF]/.test(t);
  const hasDiacritics = (t: string) => /[\u064B-\u065F\u0670]/.test(t);
  const countArabicWithoutDiacritics = (text: string): number => {
    const arabicWords = text.match(/[\u0600-\u06FF]+/g) || [];
    return arabicWords.filter(w => !hasDiacritics(w) && w.length > 1).length;
  };

  const sentenceAnalysisJson: SentenceAnalysis[] = (parsed.sentenceAnalysis || []).map((s: any) => {
    const rawSentence = s.sentence || "";
    const wordMapArr = Array.isArray(s.wordMap) ? s.wordMap.map((w: any) => ({
      word: w.word || "",
      normalized: w.normalized || (w.word || "").replace(/[\u064B-\u065F\u0670]/g, ""),
      translationUz: w.translationUz || "",
      translationAr: w.translationAr || "",
    })) : [];

    let sentence = rawSentence;
    if (!hasDiacritics(rawSentence) && wordMapArr.length > 0 && wordMapArr.some((w: any) => hasDiacritics(w.word))) {
      sentence = wordMapArr.map((w: any) => w.word).join(" ");
    }

    return {
      sentence,
      translation: s.translation || "",
      translationAr: s.translationAr || "",
      wordMap: wordMapArr,
    };
  });

  let totalNoDiacritics = 0;
  sentenceAnalysisJson.forEach(s => {
    totalNoDiacritics += countArabicWithoutDiacritics(s.sentence);
    s.wordMap.forEach(w => {
      if (hasArabic(w.word) && !hasDiacritics(w.word) && w.word.length > 1) totalNoDiacritics++;
    });
  });
  vocabularyJson.forEach(v => {
    if (hasArabic(v.word) && !hasDiacritics(v.word)) totalNoDiacritics++;
  });
  if (totalNoDiacritics > 0) {
    console.warn(`[AI] ⚠️ HARAKAT OGOHLANTIRISH: ${totalNoDiacritics} ta arabcha so'z harakatsiz topildi!`);
  } else {
    console.log(`[AI] ✅ Barcha arabcha so'zlar harakatli`);
  }

  return {
    summaryShort: parsed.summaryShort || "",
    summaryDetailed: parsed.summaryDetailed || "",
    summaryShortAr: parsed.summaryShortAr || "",
    summaryDetailedAr: parsed.summaryDetailedAr || "",
    vocabularyJson,
    phrasesJson: [],
    quizzesJson,
    flashcardsJson,
    sentenceAnalysisJson,
    aiMetaJson: {
      provider: "openai",
      model: "gpt-4o-mini",
      targetLanguage,
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
  level: string,
  targetLanguage: string = "ar"
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

  const flashcardsJson: FlashcardItem[] = selectedWords.slice(0, 8).map(w => ({
    front: w,
    back: mockUzTranslation(w),
    backAr: mockArabicTranslation(w),
    type: "vocabulary" as const,
  }));

  const sentenceAnalysisJson: SentenceAnalysis[] = usableSentences.map((s) => {
    const sentenceWords = extractWords(s);
    const wordMap: WordMapItem[] = sentenceWords.map((w) => ({
      word: w,
      normalized: w.toLowerCase(),
      translationUz: mockUzTranslation(w),
      translationAr: mockArabicTranslation(w),
    }));
    return {
      sentence: s,
      translation: `Bu gapda ${sentenceWords.slice(0, 3).map(w => mockUzTranslation(w)).join(", ")} haqida gap ketmoqda`,
      translationAr: lang === "arabic" ? s : mockArabicTranslation(s),
      wordMap,
    };
  });

  const topKeywords = selectedWords.slice(0, 4).map(w => mockUzTranslation(w)).join(", ");
  const shortSummary = lang === "arabic"
    ? `Bu videoda arabcha matn tahlil qilinadi. Asosiy mavzu: ${usableSentences[0]?.slice(0, 60) || "mavjud emas"}...`
    : `Bu videoda ${topKeywords} kabi mavzular haqida gap ketadi.`;
  const detailedSummary = lang === "arabic"
    ? `Bu video darsida quyidagi mavzular ko'rib chiqiladi: ${usableSentences.slice(0, 4).map(s => s.slice(0, 40)).join(", ")}. O'quvchilar yangi so'zlar va iboralarni o'rganadilar.`
    : `Bu video darsida ${topKeywords} kabi tushunchalar ko'rib chiqiladi. O'quvchilar yangi so'zlar o'rganib, til ko'nikmalarini rivojlantiradilar. Darsda ${vocabularyJson.length} ta yangi so'z tahlil qilinadi.`;

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
    phrasesJson: [],
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
