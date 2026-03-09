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

export async function generateLessonContent(
  transcript: string,
  sentences: string[],
  level: string
): Promise<GeneratedLessonContent> {
  return generateMockContent(transcript, sentences, level);
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

  const difficultyMap: Record<string, "easy" | "medium" | "hard"> = {
    beginner: "easy",
    intermediate: "medium",
    advanced: "hard",
  };
  const diff = difficultyMap[level] || "medium";

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
