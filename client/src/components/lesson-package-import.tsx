import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { lessonPackageSchema } from "@shared/content-validation";
import type { Lesson } from "@shared/schema";
import { request, errorText } from "@/lib/learning-api";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/learning-shell";

export function LessonPackageImport({
  onCreated,
}: {
  onCreated: (lesson: Lesson) => void;
}) {
  const [text, setText] = useState("");
  const [fileError, setFileError] = useState("");
  const [checked, setChecked] = useState(false);
  let parsed: ReturnType<typeof lessonPackageSchema.safeParse> | undefined;
  let syntaxError = "";
  if (text.trim()) {
    try {
      parsed = lessonPackageSchema.safeParse(JSON.parse(text));
    } catch {
      syntaxError = "JSON sintaksisi noto‘g‘ri";
    }
  }
  const create = useMutation({
    mutationFn: () =>
      request<{ lesson: Lesson }>("POST", "/api/admin/lesson-package", {
        package: parsed?.success ? parsed.data : null,
      }),
    onSuccess: (result) => onCreated(result.lesson),
  });
  const errors = syntaxError
    ? [syntaxError]
    : parsed && !parsed.success
      ? parsed.error.issues.map((i) => i.message)
      : [];
  return (
    <Panel>
      <h2>JSONdan dars yaratish</h2>
      <p>
        ChatGPT tayyorlagan faylni yuklang yoki matnini qo‘ying. API kaliti
        kerak emas. Dars avval qoralama bo‘ladi.
      </p>
      <p>
        <a className="quiet-link" href="/lesson-package-prompt.txt" download>
          ChatGPT uchun yo‘riqnoma
        </a>{" "}
        ·{" "}
        <a className="quiet-link" href="/lesson-package-example.json" download>
          JSON namuna
        </a>
      </p>
      <label className="field-label">
        JSON fayl
        <input
          type="file"
          accept=".json,application/json"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) {
              setFileError("Fayl 2 MB dan oshmasin");
              return;
            }
            setFileError("");
            setText(await file.text());
            setChecked(false);
            create.reset();
          }}
        />
      </label>
      <label className="field-label">
        JSON matni
        <textarea
          rows={10}
          maxLength={2000000}
          spellCheck={false}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setChecked(false);
            create.reset();
          }}
        />
      </label>
      {fileError && <p role="alert">{fileError}</p>}
      {!!errors.length && (
        <div role="alert" className="validation-problems">
          {[...new Set(errors)].slice(0, 12).map((error, i) => (
            <p key={i}>{error}</p>
          ))}
        </div>
      )}
      {parsed?.success && (
        <div className="package-preview">
          <h3>
            {parsed.data.metadata.title} · {parsed.data.metadata.level}
          </h3>
          <p>
            {parsed.data.content.subtitles.length} subtitr ·{" "}
            {parsed.data.content.vocabulary.length} so‘z ·{" "}
            {parsed.data.content.quizzes?.length} test
          </p>
          <p>{parsed.data.content.summaryShort}</p>
          <details>
            <summary>Gaplar va testlarni ko‘rish</summary>
            {parsed.data.content.sentenceAnalysis.map((s: any, i: number) => (
              <div key={i}>
                <p
                  dir={
                    parsed.data.metadata.targetLanguage === "ar" ? "rtl" : "ltr"
                  }
                >
                  {s.sentence}
                </p>
                <p>{s.translation || s.translationUz}</p>
                <small>{s.grammarNotes}</small>
              </div>
            ))}
            {parsed.data.content.quizzes?.map((q: any, i: number) => (
              <div key={i}>
                <strong>{q.question}</strong>
                <p>{q.options.join(" / ")}</p>
                <p>
                  Javob: {q.options[q.correctIndex]} — {q.explanation}
                </p>
              </div>
            ))}
          </details>
          <label className="consent-row">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            Ko‘rinishni ko‘rdim, qoralama sifatida saqlayman
          </label>
        </div>
      )}
      {create.error && (
        <p role="alert" className="inline-error">
          {errorText(create.error)}
        </p>
      )}
      <Button
        disabled={!parsed?.success || !checked || create.isPending}
        onClick={() => create.mutate()}
      >
        {create.isPending ? "Saqlanmoqda…" : "Qoralama yaratish"}
      </Button>
    </Panel>
  );
}
