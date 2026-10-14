import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  LearningShell,
  Panel,
  Loading,
  ErrorState,
  EmptyState,
} from "@/components/learning-shell";
import { request, errorText, speak } from "@/lib/learning-api";
import type { Flashcard } from "@shared/schema";
export default function FlashcardsPage() {
  const q = useQuery<Flashcard[]>({
    queryKey: ["archived-cards"],
    queryFn: () => request("GET", "/api/learn/cards"),
  });
  const [shown, setShown] = useState<number[]>([]);
  const cache = useQueryClient();
  const rate = useMutation({
    mutationFn: ({
      id,
      confidenceLevel,
    }: {
      id: number;
      confidenceLevel: number;
    }) => request("PATCH", `/api/user/flashcards/${id}`, { confidenceLevel }),
    onSuccess: () =>
      void cache.invalidateQueries({ queryKey: ["archived-cards"] }),
  });
  return (
    <LearningShell title="Oldingi kartochkalarim" back="/profile">
      <Panel>
        <p>
          Avval saqlangan kartochkalar. Yangi dars lug‘ati kundalik takrorlash
          bo‘limida rejalashtiriladi.
        </p>
        <Link className="quiet-link" href="/review">
          Kundalik takrorlashga o‘tish
        </Link>
      </Panel>
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : q.data?.length ? (
        q.data.map((c) => (
          <Panel key={c.id}>
            <h2
              className={/[\u0600-\u06ff]/.test(c.frontText) ? "arabic" : ""}
              dir="auto"
            >
              {c.frontText}
            </h2>
            <Button
              variant="ghost"
              onClick={() =>
                speak(
                  c.frontText,
                  /[\u0600-\u06ff]/.test(c.frontText) ? "ar" : "en",
                )
              }
            >
              Talaffuzini eshitish
            </Button>
            {shown.includes(c.id) ? (
              <>
                <p dir="auto">{c.backText}</p>
                <div className="editor-actions">
                  {[
                    [1, "Qiyin"],
                    [3, "O‘rta"],
                    [5, "Oson"],
                  ].map(([n, t]) => (
                    <Button
                      key={n}
                      variant="outline"
                      disabled={rate.isPending}
                      onClick={() =>
                        rate.mutate({ id: c.id, confidenceLevel: Number(n) })
                      }
                    >
                      {t}
                    </Button>
                  ))}
                </div>
                <small>Oxirgi baho: {c.confidenceLevel}/5</small>
              </>
            ) : (
              <Button onClick={() => setShown((a) => [...a, c.id])}>
                Javobni ko‘rsatish
              </Button>
            )}
          </Panel>
        ))
      ) : (
        <EmptyState
          title="Oldingi kartochkalar yo‘q"
          description="Darsdagi lug‘atni saqlang va kundalik takrorlashdan foydalaning."
          href="/review"
          action="Takrorlashni ochish"
        />
      )}
      {rate.error && (
        <p role="alert" className="inline-error">
          {errorText(rate.error)}
        </p>
      )}
    </LearningShell>
  );
}
