import type { Lesson } from "./schema";

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export const STAGES = [
  "listen",
  "understand",
  "shadow",
  "practice",
  "vocabulary",
] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABELS: Record<Stage, string> = {
  listen: "Tingla",
  understand: "Tushun",
  shadow: "Takrorla",
  practice: "Mustahkamla",
  vocabulary: "Lug‘at testi",
};

export function cefrLevel(level: string) {
  const value = level.toUpperCase();
  if ((CEFR_LEVELS as readonly string[]).includes(value)) return value;
  return (
    (
      {
        beginner: "A1",
        elementary: "A2",
        intermediate: "B1",
        upper_intermediate: "B2",
        advanced: "C1",
      } as Record<string, string>
    )[level] || "A1"
  );
}

export function normalizeAnswer(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/[’‘ʻʼ`]/g, "'")
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
export function youtubeId(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!/^(https?):$/.test(u.protocol)) return null;
    const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
    const id =
      host === "youtu.be"
        ? u.pathname.split("/")[1]
        : host === "youtube.com"
          ? u.searchParams.get("v") ||
            u.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1]
          : null;
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
export function localDay(date: Date, timezone = "Asia/Tashkent") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function isDemoContent(
  lesson: Pick<Lesson, "aiMetaJson" | "transcriptSource">,
) {
  const meta = record(lesson.aiMetaJson);
  return meta.provider === "mock" || lesson.transcriptSource === "demo";
}
export function publishedLesson(lesson: Lesson): Lesson | undefined {
  const candidate: Lesson =
    lesson.publishedSnapshot && lesson.publishedAt
      ? {
          ...lesson,
          ...(lesson.publishedSnapshot as Partial<Lesson>),
          status: "published",
        }
      : lesson;
  return candidate.status === "published" && !isDemoContent(candidate)
    ? candidate
    : undefined;
}
export function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}
export function array(value: unknown): Record<string, any>[] {
  return Array.isArray(value) ? value.map(record) : [];
}
const str = (v: unknown) => (typeof v === "string" ? v : "");

export interface LessonWord {
  word: string;
  normalized: string;
  meaning: string;
  translationAr: string;
  sourceSentence: string;
  subtitleTime: number | null;
  pronunciation: string;
  contextualMeaning: string;
  grammarNotes: string;
  partOfSpeech: string;
  grammaticalRole?: string;
  i_rab?: string;
  root?: string;
}
export interface Segment {
  id: string;
  index: number;
  text: string;
  translation: string;
  start: number | null;
  end: number | null;
  timing: "exact" | "estimated" | "missing";
  words: LessonWord[];
  grammarNotes: string;
  sentenceType: string;
}

/** Canonical mapping for all learner views. Missing timestamps are never replaced by fake 8-second gaps. */
export function lessonSegments(
  lesson: Pick<Lesson, "subtitlesJson" | "sentenceAnalysisJson">,
): Segment[] {
  const subs = array(lesson.subtitlesJson);
  const analyses = array(lesson.sentenceAnalysisJson);
  const used = new Set<number>();
  const mapped: {
    text: string;
    source: Record<string, any>;
    analysis: Record<string, any>;
    indices: number[];
    exact: boolean;
  }[] = [];
  const normalizedSubs = subs.map((s) =>
    normalizeAnswer(str(s.text || s.originalText)),
  );
  let cursor = 0;
  for (const a of analyses) {
    const text = str(a.sentence || a.text);
    if (!text.trim()) continue;
    const norm = normalizeAnswer(text);
    let indices: number[] = Array.isArray(a.lineIndices)
      ? a.lineIndices.filter(
          (i: unknown) =>
            Number.isInteger(i) && Number(i) >= 0 && Number(i) < subs.length,
        )
      : [];
    indices = [...new Set(indices)].sort((x, y) => x - y);
    let exact =
      indices.length > 0 &&
      indices.every(
        (n, i) => !used.has(n) && (i === 0 || n === indices[i - 1] + 1),
      ) &&
      normalizeAnswer(
        indices.map((i) => str(subs[i].text || subs[i].originalText)).join(" "),
      ) === norm;
    if (!exact) {
      indices = [];
      for (let i = cursor; i < subs.length; i++) {
        if (used.has(i)) continue;
        let combined = "";
        for (let j = i; j < Math.min(subs.length, i + 30); j++) {
          if (used.has(j)) break;
          combined = normalizeAnswer(combined + " " + normalizedSubs[j]);
          if (combined === norm) {
            indices = Array.from({ length: j - i + 1 }, (_, n) => i + n);
            exact = true;
            break;
          }
          if (combined.length > norm.length + 3) break;
        }
        if (exact) break;
      }
    }
    if (indices.length) {
      indices.forEach((i) => used.add(i));
      cursor = Math.max(cursor, indices.at(-1)! + 1);
      mapped.push({
        text,
        source: subs[indices[0]],
        analysis: a,
        indices,
        exact,
      });
    } else if (!subs.length)
      mapped.push({ text, source: a, analysis: a, indices: [], exact: true });
  }
  for (const [i, s] of subs.entries())
    if (!used.has(i))
      mapped.push({
        text: str(s.text || s.originalText),
        source: s,
        analysis: {},
        indices: [i],
        exact: true,
      });
  mapped.sort(
    (a, b) =>
      (a.indices[0] ?? Number.MAX_SAFE_INTEGER) -
      (b.indices[0] ?? Number.MAX_SAFE_INTEGER),
  );
  return mapped
    .filter((m) => m.text.trim())
    .map((m, i) => {
      const a = m.analysis;
      const s = m.source;
      const first = m.indices.length ? subs[m.indices[0]] : s;
      const last = m.indices.length ? subs[m.indices.at(-1)!] : s;
      const start =
        typeof first.startTime === "number" &&
        Number.isFinite(first.startTime) &&
        first.startTime >= 0
          ? first.startTime
          : null;
      const end =
        typeof last.endTime === "number" &&
        Number.isFinite(last.endTime) &&
        start !== null &&
        last.endTime > start
          ? last.endTime
          : null;
      const timing: Segment["timing"] =
        start === null || end === null
          ? "missing"
          : m.exact &&
              m.indices.every((index) => subs[index].timing !== "estimated") &&
              s.timing !== "estimated"
            ? "exact"
            : "estimated";
      const words = array(a.wordMap || s.wordMap).map((w) => ({
        ...w,
        word: str(w.word),
        normalized: normalizeAnswer(str(w.word)),
        meaning: str(w.contextualMeaning || w.translationUz || w.translation),
        translationAr: str(w.translationAr),
        sourceSentence: m.text,
        subtitleTime: start,
        pronunciation: str(w.pronunciation),
        contextualMeaning: str(w.contextualMeaning),
        grammarNotes: str(w.grammarNotes || a.grammarNotes),
        partOfSpeech: str(w.partOfSpeech),
        root: str(w.root),
        i_rab: str(w.i_rab),
        grammaticalRole: str(w.grammaticalRole),
      }));
      return {
        id: `segment-${i}`,
        index: i,
        text: m.text,
        translation: str(
          a.translation || a.translationUz || s.translationUz || s.translation,
        ),
        start,
        end,
        timing,
        words,
        grammarNotes: str(a.grammarNotes || s.grammarNotes),
        sentenceType: str(a.sentenceType),
      };
    });
}

export function lessonVocabulary(
  lesson: Pick<
    Lesson,
    "vocabularyJson" | "sentenceAnalysisJson" | "subtitlesJson"
  >,
): LessonWord[] {
  const segments = lessonSegments(lesson);
  const seen = new Set<string>();
  const words: LessonWord[] = [];
  for (const v of array(lesson.vocabularyJson)) {
    const word = str(v.word);
    const normalized = normalizeAnswer(word);
    const meaning = str(v.translationUz || v.translation || v.meaning);
    if (!normalized || !meaning || seen.has(normalized)) continue;
    seen.add(normalized);
    const segment = segments.find(
      (s) =>
        s.words.some((w) => w.normalized === normalized) ||
        normalizeAnswer(s.text).split(" ").includes(normalized),
    );
    const mapped = segment?.words.find((w) => w.normalized === normalized);
    words.push({
      ...mapped,
      ...v,
      word,
      normalized,
      meaning,
      translationAr: str(v.translationAr),
      sourceSentence: segment?.text || str(v.example),
      subtitleTime: segment?.start ?? null,
      pronunciation: str(v.pronunciation),
      contextualMeaning: str(mapped?.contextualMeaning),
      grammarNotes: str(mapped?.grammarNotes),
      partOfSpeech: str(v.partOfSpeech),
      root: str(v.root || mapped?.root),
      i_rab: str(v.i_rab || mapped?.i_rab),
      grammaticalRole: str(v.grammaticalRole || mapped?.grammaticalRole),
    });
  }
  if (!words.length) {
    for (const segment of segments)
      for (const word of segment.words)
        if (word.meaning && !seen.has(word.normalized)) {
          seen.add(word.normalized);
          words.push(word);
        }
  }
  return words;
}

export interface Question {
  id: string;
  type: "choice" | "recall" | "order" | "dictation" | "gap";
  prompt: string;
  options?: string[];
  tokens?: string[];
  cueTime?: number | null;
  word?: LessonWord;
  answer: string;
  alternatives?: string[];
  explanation: string;
}
export type PublicQuestion = Omit<
  Question,
  "answer" | "alternatives" | "explanation" | "word"
> & { word?: { normalized: string } };
export function publicQuestion(q: Question): PublicQuestion {
  const { answer, alternatives, explanation, word, ...rest } = q;
  return {
    ...rest,
    ...(word ? { word: { normalized: word.normalized } } : {}),
  };
}
export function buildQuestions(
  lesson: Lesson,
  kind: "practice" | "vocabulary",
): Question[] {
  const words = lessonVocabulary(lesson);
  const segments = lessonSegments(lesson);
  const questions: Question[] = [];
  if (kind === "practice") {
    for (const [i, q] of array(lesson.quizzesJson).entries()) {
      if (
        !q.question ||
        !Array.isArray(q.options) ||
        !Number.isInteger(q.correctIndex) ||
        !q.options[q.correctIndex]
      )
        continue;
      questions.push({
        id: `quiz-${i}`,
        type: "choice",
        prompt: str(q.question),
        options: q.options.map(str),
        answer: str(q.options[q.correctIndex]),
        explanation: str(q.explanation),
      });
    }
    for (const segment of segments.slice(0, 3)) {
      const tokens = segment.text.trim().split(/\s+/);
      if (tokens.length >= 3 && tokens.length <= 16)
        questions.push({
          id: `order-${segment.index}`,
          type: "order",
          prompt: segment.translation || "So‘zlarni to‘g‘ri tartibga qo‘ying",
          tokens: [...tokens.slice(1), tokens[0]],
          answer: segment.text,
          cueTime: segment.start,
          explanation: segment.translation,
        });
      if (segment.timing === "exact")
        questions.push({
          id: `dictation-${segment.index}`,
          type: "dictation",
          prompt: "Eshitgan gapingizni yozing",
          answer: segment.text,
          cueTime: segment.start,
          explanation: segment.translation,
        });
    }
    return questions.slice(0, 10);
  }
  for (const [i, word] of words.slice(0, 8).entries()) {
    if (i % 3 === 0) {
      const others = words
        .filter(
          (w) => w.normalized !== word.normalized && w.meaning !== word.meaning,
        )
        .map((w) => w.meaning);
      const options = [...new Set([word.meaning, ...others.slice(0, 3)])];
      if (options.length >= 2) {
        const offset = i % options.length;
        questions.push({
          id: `meaning-${i}`,
          type: "choice",
          prompt: `Ma’nosini toping: ${word.word}`,
          options: [...options.slice(offset), ...options.slice(0, offset)],
          answer: word.meaning,
          word,
          explanation: `${word.word} — ${word.meaning}`,
        });
        continue;
      }
    }
    if (
      i % 3 === 2 &&
      word.sourceSentence &&
      normalizeAnswer(word.sourceSentence).split(" ").includes(word.normalized)
    ) {
      const tokens = word.sourceSentence.split(/\s+/);
      const position = tokens.findIndex(
        (t) => normalizeAnswer(t) === word.normalized,
      );
      tokens[position] = "_____";
      questions.push({
        id: `gap-${i}`,
        type: "gap",
        prompt: tokens.join(" "),
        answer: word.word,
        word,
        explanation: word.sourceSentence,
      });
    } else
      questions.push({
        id: `recall-${i}`,
        type: "recall",
        prompt: `${lesson.targetLanguage === "en" ? "Inglizchasini" : "Arabchasini"} yozing: ${word.meaning}`,
        answer: word.word,
        word,
        explanation: word.sourceSentence || word.meaning,
      });
  }
  return questions;
}
export function gradeAnswer(q: Question, answer: string) {
  const value = normalizeAnswer(answer);
  return (
    Boolean(value) &&
    [q.answer, ...(q.alternatives || [])].some(
      (a) => normalizeAnswer(a) === value,
    )
  );
}

export function scheduleReview(
  card: { repetitions: number; intervalDays: number; ease: number },
  rating: "hard" | "medium" | "easy",
  now = new Date(),
) {
  const ease = Math.max(
    1.3,
    Math.min(
      3,
      card.ease + (rating === "hard" ? -0.2 : rating === "easy" ? 0.15 : 0),
    ),
  );
  const repetitions = rating === "hard" ? 0 : card.repetitions + 1;
  const intervalDays =
    rating === "hard"
      ? 1
      : card.repetitions === 0
        ? rating === "easy"
          ? 3
          : 1
        : card.repetitions === 1
          ? rating === "easy"
            ? 7
            : 3
          : Math.max(
              1,
              Math.round(
                card.intervalDays * ease * (rating === "easy" ? 1.2 : 1),
              ),
            );
  return {
    repetitions,
    intervalDays,
    ease,
    dueAt: new Date(now.getTime() + intervalDays * 86400000),
  };
}
export function publicationProblems(lesson: Lesson): string[] {
  const errors: string[] = [];
  const segments = lessonSegments(lesson);
  if (isDemoContent(lesson))
    errors.push("Namuna AI kontentini nashr qilish mumkin emas");
  if (!youtubeId(lesson.youtubeUrl))
    errors.push("To‘g‘ri YouTube video havolasi kerak");
  if (!segments.length || segments.some((s) => s.timing !== "exact"))
    errors.push("Barcha subtitrlarning aniq vaqtlari kerak");
  if (segments.some((s) => !s.translation))
    errors.push("Har bir gapning o‘zbekcha tarjimasi kerak");
  if (!lessonVocabulary(lesson).length)
    errors.push("Dars lug‘ati va tarjimalari kerak");
  if (!buildQuestions(lesson, "practice").length)
    errors.push("Kamida bitta tekshiriladigan mashq kerak");
  return errors;
}
