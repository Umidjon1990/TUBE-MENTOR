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
export const alignmentSchema = z
  .object({
    sourceStart: z.number().int().nonnegative(),
    sourceEnd: z.number().int().positive(),
    targetStart: z.number().int().nonnegative(),
    targetEnd: z.number().int().positive(),
  })
  .strict();
const sentence = z
  .object({
    sentence: nonempty,
    translation: short.optional(),
    translationUz: short.optional(),
    grammarNotes: short.optional(),
    sentenceType: short.optional(),
    alignment: z.array(alignmentSchema).max(150).optional(),
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
    word: nonempty.optional(),
    kind: z.enum(["practice", "vocabulary"]).optional(),
    explanation: short.optional(),
    skill: short.optional(),
    distractorRationale: z.array(nonempty).max(8).optional(),
    options: z.array(nonempty).min(2).max(8),
    correctIndex: z.number().int().nonnegative(),
  })
  .passthrough()
  .refine(
    (q) => q.correctIndex < q.options.length,
    "Savolning javob indeksi noto‘g‘ri",
  )
  .refine(
    (q) =>
      new Set(
        q.options.map((v) => v.normalize("NFKC").toLocaleLowerCase().trim()),
      ).size === q.options.length,
    "Javob variantlari takrorlanmasin",
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

/** UTF-16 offsets match JavaScript slice. No inferred or reordered translations. */
export function alignmentProblems(
  sentence: string,
  translation: string,
  alignment: z.infer<typeof alignmentSchema>[],
) {
  const errors: string[] = [];
  for (const [i, item] of alignment.entries()) {
    if (
      item.sourceStart >= item.sourceEnd ||
      item.sourceEnd > sentence.length ||
      item.targetStart >= item.targetEnd ||
      item.targetEnd > translation.length
    )
      errors.push(`Moslik ${i + 1}: matn chegarasi noto‘g‘ri`);
    if (
      alignment
        .slice(0, i)
        .some(
          (a) =>
            (item.sourceStart < a.sourceEnd &&
              a.sourceStart < item.sourceEnd) ||
            (item.targetStart < a.targetEnd && a.targetStart < item.targetEnd),
        )
    )
      errors.push(`Moslik ${i + 1}: qismlar ustma-ust kelmoqda`);
  }
  return errors;
}
export const lessonPackageSchema = z
  .object({
    schemaVersion: z.literal(1),
    metadata: z
      .object({
        title: z.string().trim().min(2).max(200),
        youtubeUrl: z
          .string()
          .url()
          .max(2048)
          .refine((value) => {
            try {
              const u = new URL(value);
              const h = u.hostname.replace(/^www\./, "");
              return (
                u.protocol === "https:" &&
                ((h === "youtu.be" && /^\/[\w-]{11}$/.test(u.pathname)) ||
                  (h === "youtube.com" &&
                    (/^[\w-]{11}$/.test(u.searchParams.get("v") || "") ||
                      /^\/(shorts|embed)\/[\w-]{11}$/.test(u.pathname))))
              );
            } catch {
              return false;
            }
          }, "To‘g‘ri HTTPS YouTube havolasi kerak"),
        targetLanguage: z.enum(["ar", "en"]),
        level: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]),
      })
      .strict(),
    content: contentSchema,
  })
  .strict()
  .superRefine((pkg, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    const c = pkg.content;
    if (!c.summaryShort.trim() || !c.summaryDetailed.trim())
      issue("Xulosalar bo‘sh bo‘lmasin");
    if (!c.subtitles?.length) issue("Aniq vaqtli subtitrlar kerak");
    if (!c.quizzes?.some((q: any) => q.kind !== "vocabulary"))
      issue("Mustahkamlash testi kerak");
    if (!c.quizzes?.some((q: any) => q.kind === "vocabulary"))
      issue("Dars oxiridagi lug‘at testi kerak");
    let previousEnd = 0;
    for (const s of c.subtitles || []) {
      if (s.timing !== "exact")
        issue("Taxminiy vaqt bilan nashr qilib bo‘lmaydi");
      if (s.startTime < previousEnd)
        issue("Subtitr vaqtlari tartibli va ustma-ust tushmagan bo‘lsin");
      previousEnd = s.endTime;
    }
    const covered = new Set<number>();
    for (const [i, s] of c.sentenceAnalysis.entries()) {
      for (const [offset, index] of (s.lineIndices || []).entries()) {
        if (
          covered.has(index) ||
          (offset > 0 && index !== s.lineIndices[offset - 1] + 1)
        )
          issue(`${i + 1}-gap: subtitr bog‘lanishi takroriy yoki uzilgan`);
        covered.add(index);
      }
      const translation = s.translation || s.translationUz || "";
      if (!translation.trim() || !s.grammarNotes?.trim() || !s.wordMap?.length)
        issue(`${i + 1}-gap: tarjima, tahlil va so‘zlar kerak`);
      if (!s.alignment?.length) issue(`${i + 1}-gap: rangli mosliklar kerak`);
      for (const error of alignmentProblems(
        s.sentence,
        translation,
        s.alignment || [],
      ))
        issue(`${i + 1}-gap: ${error}`);
      if (
        !s.lineIndices?.length ||
        s.lineIndices.some((n: number) => !c.subtitles?.[n]) ||
        new Set(s.lineIndices).size !== s.lineIndices.length
      )
        issue(`${i + 1}-gap: lineIndices noto‘g‘ri`);
      else if (
        s.lineIndices
          .map((n: number) => c.subtitles[n].text)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim() !== s.sentence.replace(/\s+/g, " ").trim()
      )
        issue(`${i + 1}-gap subtitr matniga mos emas`);
    }
    if (covered.size !== (c.subtitles || []).length)
      issue("Har bir subtitrga gap tahlili kerak");
    for (const w of c.vocabulary)
      if (!(w.translationUz || w.translation || w.meaning)?.trim())
        issue(`${w.word}: lug‘at tarjimasi kerak`);
    for (const q of c.quizzes || []) {
      if (!q.explanation?.trim()) issue("Har bir testga javob izohi kerak");
      if (!q.skill?.trim()) issue("Test tekshiradigan ko‘nikma kerak");
      if (
        q.kind === "vocabulary" &&
        (!q.word || !c.vocabulary.some((w: any) => w.word === q.word))
      )
        issue("Lug‘at testi word orqali dars lug‘atidagi so‘zga bog‘lansin");
      if (
        !Array.isArray(q.distractorRationale) ||
        q.distractorRationale.length !== q.options.length ||
        q.distractorRationale.some(
          (r: unknown) => typeof r !== "string" || !r.trim(),
        )
      )
        issue("Har variant uchun chalg‘ituvchi sababini izohlang");
    }
  });
