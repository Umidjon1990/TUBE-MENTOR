import type {
  ExportConfig,
  LessonExportData,
  SentenceBlock,
  VocabEntry,
  QuizEntry,
  FlashcardEntry,
  SummaryData,
} from "./export-types";

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function mergeEnglishSentences(sentences: SentenceBlock[]): SentenceBlock[] {
  if (sentences.length === 0) return [];
  const merged: SentenceBlock[] = [];
  let current: SentenceBlock | null = null;

  for (const s of sentences) {
    if (!current) {
      current = { ...s, wordMap: s.wordMap ? [...s.wordMap] : undefined };
      continue;
    }

    const prevText = (current.sentence || "").trim();
    const endsWithPunctuation = /[.!?;:]$/.test(prevText);

    if (endsWithPunctuation || !prevText) {
      merged.push(current);
      current = { ...s, wordMap: s.wordMap ? [...s.wordMap] : undefined };
    } else {
      current.sentence = (current.sentence || "") + " " + (s.sentence || "");
      current.translation = (current.translation || "") + " " + (s.translation || "");
      if (s.translationAr) {
        current.translationAr = (current.translationAr || "") + " " + s.translationAr;
      }
      if (current.wordMap && s.wordMap) {
        current.wordMap = [...current.wordMap, ...s.wordMap];
      } else if (s.wordMap) {
        current.wordMap = [...s.wordMap];
      }
    }
  }
  if (current) merged.push(current);

  return merged.map((b, i) => ({ ...b, index: i + 1 }));
}

export function prepareTextBlocks(
  data: LessonExportData,
  config: ExportConfig
): SentenceBlock[] {
  if (
    !config.sections.includes("arabText") &&
    !config.sections.includes("uzTranslation") &&
    !config.sections.includes("wordByWord")
  ) {
    return [];
  }
  const hasWordByWord = config.sections.includes("wordByWord");
  const raw = data.sentences.map((s, i) => ({
    index: i + 1,
    sentence: (config.sections.includes("arabText") || hasWordByWord) ? s.sentence : "",
    translation: (config.sections.includes("uzTranslation") || hasWordByWord) ? s.translation : "",
    translationAr: s.translationAr,
    wordMap: hasWordByWord ? s.wordMap : undefined,
  }));

  const isArabic = !data.targetLanguage || data.targetLanguage === "ar";
  if (isArabic) return raw;

  return mergeEnglishSentences(raw);
}

export function prepareVocabulary(
  data: LessonExportData,
  config: ExportConfig
): VocabEntry[] {
  if (!config.sections.includes("vocabulary")) return [];
  return data.vocabulary;
}

export function prepareQuizzes(
  data: LessonExportData,
  config: ExportConfig
): QuizEntry[] {
  if (!config.sections.includes("quizzes")) return [];
  let quizList = [...data.quizzes];

  if (config.quizMode === "random") {
    quizList = shuffleArray(quizList).slice(0, config.quizCount);
  }

  if (!config.quizWithAnswers) {
    return quizList.map((q) => ({
      ...q,
      correctIndex: -1,
      explanation: undefined,
    }));
  }

  return quizList;
}

export function prepareFlashcards(
  data: LessonExportData,
  config: ExportConfig
): FlashcardEntry[] {
  if (!config.sections.includes("flashcards")) return [];
  return data.flashcards;
}

export function prepareSummary(
  data: LessonExportData,
  config: ExportConfig
): SummaryData | null {
  if (!config.sections.includes("summary")) return null;
  return data.summary;
}

export function buildExportData(
  lesson: any,
  sentences: any[],
  vocabulary: any[],
  quizzes: any[],
  flashcards: any[]
): LessonExportData {
  return {
    title: lesson.title || "Dars",
    level: lesson.level || "beginner",
    targetLanguage: lesson.targetLanguage || "ar",
    sentences: sentences.map((s, i) => ({
      index: i + 1,
      sentence: s.sentence || "",
      translation: s.translation || "",
      translationAr: s.translationAr,
      wordMap: Array.isArray(s.wordMap)
        ? s.wordMap.map((w: any) => ({
            word: w.word || "",
            translation: w.translationUz || w.translation || "",
            translationAr: w.translationAr,
          }))
        : undefined,
    })),
    vocabulary: vocabulary.map((v) => ({
      word: v.word || "",
      translation: v.translation || "",
      translationAr: v.translationAr,
      partOfSpeech: v.partOfSpeech,
      example: v.example,
      difficulty: v.difficulty,
    })),
    quizzes: quizzes.map((q) => ({
      question: q.question || "",
      options: q.options || [],
      correctIndex: q.correctIndex ?? 0,
      explanation: q.explanation,
      type: q.type,
    })),
    flashcards: flashcards.map((f) => ({
      front: f.front || "",
      back: f.back || "",
      backAr: f.backAr,
      type: f.type,
    })),
    summary: {
      summaryShort: lesson.summaryShort,
      summaryDetailed: lesson.summaryDetailed,
      summaryShortAr: lesson.summaryShortAr,
      summaryDetailedAr: lesson.summaryDetailedAr,
    },
  };
}
