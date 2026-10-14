import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { generateXLSX } from "../client/src/lib/export-xlsx";
import type { LessonExportData } from "../client/src/lib/export-types";
test("vocabulary XLSX export still produces readable Arabic/Uzbek cells after dependency updates", async () => {
  const data: LessonExportData = {
    title: "Arabcha lug‘at",
    level: "A1",
    targetLanguage: "ar",
    sentences: [],
    vocabulary: [
      {
        word: "طَالِبٌ",
        translation: "o‘quvchi",
        translationAr: "",
        partOfSpeech: "noun",
        example: "أَنَا طَالِبٌ.",
      },
    ],
    quizzes: [],
    flashcards: [],
    summary: { summaryShort: "", summaryDetailed: "" },
  };
  const blob = await generateXLSX(data, {
    format: "xlsx",
    sections: ["vocabulary"],
    quizMode: "all",
    quizCount: 5,
    quizWithAnswers: true,
  });
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(await blob.arrayBuffer()));
  let arabic = false,
    uzbek = false;
  for (const sheet of book.worksheets)
    sheet.eachRow((row) =>
      row.eachCell((cell) => {
        if (cell.value === "طَالِبٌ") arabic = true;
        if (cell.value === "o‘quvchi") uzbek = true;
      }),
    );
  assert.equal(arabic, true);
  assert.equal(uzbek, true);
});
