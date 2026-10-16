import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  lessonPackageSchema,
  alignmentProblems,
} from "../shared/content-validation";
import {
  shuffleQuestions,
  buildQuestions,
  publicQuestion,
  gradeAnswer,
  type Question,
} from "../shared/learning";
const sample = () =>
  JSON.parse(readFileSync("client/public/lesson-package-example.json", "utf8"));
test("lesson package validates timed, aligned content and rejects overlapping or false mappings", () => {
  assert.equal(lessonPackageSchema.safeParse(sample()).success, true);
  const bad = sample();
  bad.content.sentenceAnalysis[0].alignment[0].sourceEnd = 500;
  assert.equal(lessonPackageSchema.safeParse(bad).success, false);
  const overlap = sample();
  overlap.content.subtitles.push({
    ...overlap.content.subtitles[0],
    startTime: 1,
  });
  assert.equal(lessonPackageSchema.safeParse(overlap).success, false);
  const mismatch = sample();
  mismatch.content.sentenceAnalysis[0].sentence = "غير مطابق";
  assert.equal(lessonPackageSchema.safeParse(mismatch).success, false);
  assert.ok(
    alignmentProblems("abc", "xyz", [
      { sourceStart: 0, sourceEnd: 2, targetStart: 0, targetEnd: 2 },
      { sourceStart: 1, sourceEnd: 3, targetStart: 2, targetEnd: 3 },
    ]).length,
  );
});
test("test quality rejects duplicate variants, missing rationale and missing final vocabulary assessment", () => {
  for (const change of [
    (p: any) =>
      (p.content.quizzes[0].options[1] = p.content.quizzes[0].options[0]),
    (p: any) => delete p.content.quizzes[0].explanation,
    (p: any) => delete p.content.quizzes[0].distractorRationale,
    (p: any) =>
      (p.content.quizzes = p.content.quizzes.filter(
        (q: any) => q.kind !== "vocabulary",
      )),
  ]) {
    const p = sample();
    change(p);
    assert.equal(lessonPackageSchema.safeParse(p).success, false);
  }
});
test("shuffle preserves question IDs and answers; choices distinguish Arabic vowel marks", () => {
  const questions: Question[] = [
    {
      id: "a",
      type: "choice",
      prompt: "a",
      options: ["عَلَم", "عِلْم"],
      answer: "عِلْم",
      explanation: "",
    },
    {
      id: "b",
      type: "choice",
      prompt: "b",
      options: ["x", "y"],
      answer: "y",
      explanation: "",
    },
  ];
  const mixed = shuffleQuestions(questions, () => 0);
  assert.deepEqual(questions[0].options, ["عَلَم", "عِلْم"]);
  assert.deepEqual(
    mixed.map((q) => q.id),
    ["b", "a"],
  );
  assert.equal(gradeAnswer(mixed[1], "عَلَم"), false);
  assert.equal(gradeAnswer(mixed[1], "عِلْم"), true);
  assert.equal(mixed[1].answer, questions[0].answer);
});

test("curated vocabulary questions retain the word reference for wrong-answer review", () => {
  const p = sample();
  const lesson = {
    vocabularyJson: p.content.vocabulary,
    sentenceAnalysisJson: p.content.sentenceAnalysis,
    subtitlesJson: p.content.subtitles,
    quizzesJson: p.content.quizzes,
  } as any;
  assert.equal(buildQuestions(lesson, "vocabulary")[0].word?.word, "طَالِبٌ");
  delete p.content.quizzes[1].word;
  assert.equal(lessonPackageSchema.safeParse(p).success, false);
});


test('learner question payload does not expose answer-bearing vocabulary metadata', () => {
  const p = sample();
  const lesson = {vocabularyJson:p.content.vocabulary, sentenceAnalysisJson:p.content.sentenceAnalysis, subtitlesJson:p.content.subtitles, quizzesJson:p.content.quizzes} as any;
  const question = publicQuestion(buildQuestions(lesson, 'vocabulary')[0]);
  for (const key of ['answer', 'alternatives', 'explanation', 'word']) assert.equal(key in question, false);
});
