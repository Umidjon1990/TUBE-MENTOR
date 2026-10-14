import test from "node:test";
import assert from "node:assert/strict";
import {
  lessonSegments,
  normalizeAnswer,
  gradeAnswer,
  scheduleReview,
  youtubeId,
  localDay,
  publishedLesson,
  publicationProblems,
} from "../shared/learning";
import { contentSchema, validateField } from "../shared/content-validation";
import { processManualTranscript } from "../server/services/transcript";
import type { Lesson } from "../shared/schema";

test("Arabic answer normalization tolerates diacritics and punctuation but retains different letters", () => {
  assert.equal(normalizeAnswer("أَنَا طَالِبٌ."), "انا طالب");
  assert.notEqual(normalizeAnswer("مدرسة"), normalizeAnswer("مدرسه"));
  assert.notEqual(normalizeAnswer("على"), normalizeAnswer("علي"));
  assert.equal(
    gradeAnswer(
      {
        id: "q",
        type: "recall",
        prompt: "",
        answer: "أَذْهَبُ",
        explanation: "",
      },
      "اذهب",
    ),
    true,
  );
});
test("multi-row captions map to one canonical sentence, preserving grammatical context", () => {
  const segments = lessonSegments({
    subtitlesJson: [
      { text: "أَنَا طَالِبٌ", startTime: 1, endTime: 3 },
      { text: "فِي الْمَدْرَسَةِ.", startTime: 3, endTime: 6 },
      { text: "هَذَا كِتَابٌ.", startTime: 8, endTime: 10 },
    ],
    sentenceAnalysisJson: [
      {
        sentence: "أَنَا طَالِبٌ فِي الْمَدْرَسَةِ.",
        translation: "Men maktabda o‘quvchiman",
        lineIndices: [0, 1],
        wordMap: [
          {
            word: "طَالِبٌ",
            translation: "o‘quvchi",
            i_rab: "خبر مرفوع",
            root: "ط ل ب",
          },
        ],
      },
      { sentence: "هَذَا كِتَابٌ.", translation: "Bu kitob" },
    ],
  });
  assert.equal(segments.length, 2);
  assert.equal(segments[0].start, 1);
  assert.equal(segments[0].end, 6);
  assert.equal(segments[0].timing, "exact");
  assert.equal(segments[0].words[0].i_rab, "خبر مرفوع");
  assert.equal(segments[1].translation, "Bu kitob");
});
test("missing or mismatched data never receives invented timing or translation", () => {
  const rows = lessonSegments({
    subtitlesJson: [{ text: "السلام", startTime: 0, endTime: 4 }],
    sentenceAnalysisJson: [{ sentence: "مختلف", translation: "Boshqa gap" }],
  });
  assert.equal(rows[0].translation, "");
  assert.equal(
    lessonSegments({
      subtitlesJson: null,
      sentenceAnalysisJson: [{ sentence: "السلام" }],
    })[0].timing,
    "missing",
  );
});
test("SRT/VTT cue milliseconds survive manual import", () => {
  const r = processManualTranscript(
    "WEBVTT\n\n00:00:01.500 --> 00:00:04.250\nأَنَا طَالِبٌ.\n\n00:00:05.000 --> 00:00:09.000\nهَذَا كِتَابٌ.\n",
  );
  assert.equal(r.timedSubtitles?.[0].startTime, 1.5);
  assert.equal(r.timedSubtitles?.[0].endTime, 4.25);
  assert.equal(r.sentences.length, 2);
});
test("review scheduling changes independently for hard and easy recall", () => {
  const now = new Date("2026-10-14T12:00:00Z");
  const initial = { repetitions: 0, intervalDays: 0, ease: 2.5 };
  assert.equal(scheduleReview(initial, "hard", now).intervalDays, 1);
  assert.equal(scheduleReview(initial, "easy", now).intervalDays, 3);
  assert.equal(
    scheduleReview({ ...initial, repetitions: 2, intervalDays: 7 }, "hard", now)
      .repetitions,
    0,
  );
  assert.equal(
    localDay(new Date("2026-10-14T21:00:00Z"), "Asia/Tashkent"),
    "2026-10-15",
  );
});
test("only real YouTube hostnames and IDs are accepted", () => {
  assert.equal(
    youtubeId("https://youtube.com.evil.test/watch?v=jNQXAC9IVRw"),
    null,
  );
  assert.equal(youtubeId("javascript:alert(1)"), null);
  assert.equal(youtubeId("https://youtu.be/jNQXAC9IVRw"), "jNQXAC9IVRw");
});
test("validation rejects invalid answers and timestamps and preserves rich Arabic fields", () => {
  assert.equal(
    validateField("quizzesJson", [
      { question: "Q", options: ["a", "b"], correctIndex: 2 },
    ]).success,
    false,
  );
  assert.equal(
    validateField("subtitlesJson", [{ text: "x", startTime: 4, endTime: 2 }])
      .success,
    false,
  );
  const value = contentSchema.parse({
    summaryShort: "x",
    summaryDetailed: "y",
    vocabulary: [{ word: "طالب", translation: "o‘quvchi", root: "ط ل ب" }],
    sentenceAnalysis: [
      {
        sentence: "أنا طالب",
        translation: "Men o‘quvchiman",
        wordMap: [{ word: "طالب", translation: "o‘quvchi", i_rab: "خبر" }],
      },
    ],
  });
  assert.equal(value.sentenceAnalysis[0].wordMap[0].i_rab, "خبر");
});
test("published revisions remain stable and mock content cannot become public", () => {
  const original = {
    id: 1,
    title: "Old",
    status: "published",
    publishedAt: new Date(),
    aiMetaJson: { provider: "manual" },
    transcriptSource: "manual",
  } as Lesson;
  const edited = {
    ...original,
    title: "Draft",
    status: "draft",
    publishedSnapshot: { ...original },
  } as Lesson;
  assert.equal(publishedLesson(edited)?.title, "Old");
  assert.equal(
    publishedLesson({ ...original, aiMetaJson: { provider: "mock" } }),
    undefined,
  );
  assert.ok(
    publicationProblems({
      ...original,
      subtitlesJson: null,
      sentenceAnalysisJson: null,
      vocabularyJson: null,
    }).length > 0,
  );
});
