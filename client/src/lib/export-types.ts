export type ExportFormat = "pdf" | "docx" | "xlsx";

export type ExportSection =
  | "arabText"
  | "uzTranslation"
  | "wordByWord"
  | "vocabulary"
  | "quizzes"
  | "flashcards"
  | "summary";

export type QuizMode = "all" | "random";
export type QuizCount = 5 | 10 | 15 | 20;

export interface ExportConfig {
  format: ExportFormat;
  sections: ExportSection[];
  quizMode: QuizMode;
  quizCount: QuizCount;
  quizWithAnswers: boolean;
}

export interface SentenceBlock {
  index: number;
  sentence: string;
  translation: string;
  translationAr?: string;
  wordMap?: WordMapEntry[];
}

export interface WordMapEntry {
  word: string;
  translation: string;
  translationAr?: string;
}

export interface VocabEntry {
  word: string;
  translation: string;
  translationAr?: string;
  partOfSpeech?: string;
  example?: string;
  difficulty?: string;
}

export interface QuizEntry {
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
  type?: string;
}

export interface FlashcardEntry {
  front: string;
  back: string;
  backAr?: string;
  type?: string;
}

export interface SummaryData {
  summaryShort?: string;
  summaryDetailed?: string;
  summaryShortAr?: string;
  summaryDetailedAr?: string;
}

export interface LessonExportData {
  title: string;
  level: string;
  targetLanguage?: string;
  sentences: SentenceBlock[];
  vocabulary: VocabEntry[];
  quizzes: QuizEntry[];
  flashcards: FlashcardEntry[];
  summary: SummaryData;
}
