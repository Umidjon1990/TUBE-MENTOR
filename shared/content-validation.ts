import { z } from "zod";
const text = z.string().max(120000);
const short = z.string().max(4000);
const nonempty = z.string().trim().min(1).max(4000);
const word = z
  .object({
    word: nonempty,
    translation: short.optional(),
    translationUz: short.optional(),
    meaning: short.optional(),
    translationAr: short.optional(),
    pronunciation: short.optional(),
    contextualMeaning: short.optional(),
    grammarNotes: short.optional(),
    partOfSpeech: short.optional(),
    root: short.optional(),
    i_rab: short.optional(),
    grammaticalRole: short.optional(),
  })
  .passthrough();
const sentence = z
  .object({
    sentence: nonempty,
    translation: short.optional(),
    translationUz: short.optional(),
    grammarNotes: short.optional(),
    sentenceType: short.optional(),
    lineIndices: z.array(z.number().int().nonnegative()).max(100).optional(),
    wordMap: z.array(word).max(150).optional(),
  })
  .passthrough();
const subtitle = z
  .object({
    text: nonempty,
    startTime: z.number().finite().nonnegative().max(86400),
    endTime: z.number().finite().positive().max(86400),
    timing: z.enum(["exact", "estimated"]).optional(),
  })
  .passthrough()
  .refine(
    (s) => s.endTime > s.startTime,
    "Subtitr tugashi boshlanishidan keyin bo‘lsin",
  );
const quiz = z
  .object({
    question: nonempty,
    options: z.array(nonempty).min(2).max(8),
    correctIndex: z.number().int().nonnegative(),
  })
  .passthrough()
  .refine(
    (q) => q.correctIndex < q.options.length,
    "Savolning javob indeksi noto‘g‘ri",
  );
export const fields: Record<string, z.ZodTypeAny> = {
  sentenceAnalysisJson: z.array(sentence).max(2000),
  vocabularyJson: z.array(word).max(5000),
  quizzesJson: z.array(quiz).max(1000),
  subtitlesJson: z.array(subtitle).max(3000),
  phrasesJson: z.array(z.object({ phrase: nonempty }).passthrough()).max(2000),
  flashcardsJson: z
    .array(z.object({ front: nonempty, back: nonempty }).passthrough())
    .max(5000),
  wordTimestampsJson: z
    .array(
      z
        .object({
          word: nonempty,
          start: z.number().finite().nonnegative(),
          end: z.number().finite().nonnegative(),
        })
        .passthrough(),
    )
    .max(20000),
};
export const contentSchema = z
  .object({
    summaryShort: text,
    summaryDetailed: text,
    summaryShortAr: text.optional(),
    summaryDetailedAr: text.optional(),
    vocabulary: fields.vocabularyJson.refine((v) => v.length > 0),
    sentenceAnalysis: fields.sentenceAnalysisJson.refine((v) => v.length > 0),
    quizzes: fields.quizzesJson.optional(),
    subtitles: fields.subtitlesJson.optional(),
    phrases: fields.phrasesJson.optional(),
    flashcards: fields.flashcardsJson.optional(),
  })
  .passthrough();
export function validateField(field: string, data: unknown) {
  const schema = fields[field];
  return schema
    ? schema.safeParse(data)
    : {
        success: false as const,
        error: { issues: [{ message: "Noto‘g‘ri kontent maydoni" }] },
      };
}
