import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

test("long transcripts retain all 70 sentences and rich grammar across provider chunks", async () => {
  let calls = 0;
  let truncate = false;
  const provider = createServer(async (req, res) => {
    let data = "";
    for await (const chunk of req) data += chunk;
    const body = JSON.parse(data);
    const text = body.messages.at(-1).content as string;
    const list = text.split("# GAPLAR RO'YXATI")[1].split("# TRANSKRIPT:")[0];
    const sentences = list.split("\n").flatMap((line) => {
      const m = line.match(/^\d+\. (.+)$/);
      return m ? [m[1]] : [];
    });
    calls++;
    const sentenceAnalysis = sentences.map((sentence) => ({
      sentence,
      translation: "Tarjima",
      wordMap: [
        {
          word: "Sentence",
          translationUz: "Gap",
          root: "test-root",
          grammaticalRole: "Subject",
        },
      ],
    }));
    if (truncate) sentenceAnalysis.pop();
    const content = {
      summaryShort: "Summary",
      summaryDetailed: "Details",
      vocabulary: [{ word: "Sentence", translation: "Gap", root: "test-root" }],
      sentenceAnalysis,
      quizzes: [
        { question: "Meaning?", options: ["Gap", "So‘z"], correctIndex: 0 },
      ],
      phrases: [{ phrase: "Good morning", translation: "Xayrli tong" }],
    };
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        id: "test-completion",
        object: "chat.completion",
        created: 0,
        model: "test",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: JSON.stringify(content) },
            finish_reason: "stop",
          },
        ],
      }),
    );
  });
  await new Promise<void>((r) => provider.listen(0, "127.0.0.1", r));
  delete process.env.OPENAI_API_KEY;
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "local-test-only";
  process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = `http://127.0.0.1:${(provider.address() as import("node:net").AddressInfo).port}/v1`;
  try {
    const { generateLessonContent } = await import(
      "../server/services/ai-generator"
    );
    const sentences = Array.from(
      { length: 70 },
      (_, i) => `Sentence ${i + 1} ${"long source text ".repeat(18)}.`,
    );
    const generated = await generateLessonContent(
      sentences.join("\n"),
      sentences,
      "A1",
      "en",
    );
    assert.equal(generated.sentenceAnalysisJson.length, 70);
    assert.equal(generated.aiMetaJson.sentenceCount, 70);
    assert.equal(
      generated.sentenceAnalysisJson.at(-1)?.sentence,
      sentences.at(-1),
    );
    assert.equal(
      (generated.sentenceAnalysisJson[0].wordMap[0] as any).root,
      "test-root",
    );
    assert.equal((generated.vocabularyJson[0] as any).root, "test-root");
    assert.equal(generated.phrasesJson.length, 1);
    assert.ok(calls >= 4);
    truncate = true;
    await assert.rejects(
      () =>
        generateLessonContent(
          "Sentence one. Sentence two.",
          ["Sentence one.", "Sentence two."],
          "A1",
          "en",
        ),
      /barcha gaplarni/,
    );
  } finally {
    delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    delete process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    await new Promise<void>((r) => provider.close(() => r()));
  }
});
