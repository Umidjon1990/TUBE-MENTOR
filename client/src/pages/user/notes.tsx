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
import { request, errorText } from "@/lib/learning-api";
import type { Note } from "@shared/schema";
export default function NotesPage() {
  const q = useQuery<Note[]>({
    queryKey: ["learning-notes"],
    queryFn: () => request("GET", "/api/learn/notes"),
  });
  const cache = useQueryClient();
  const [editing, setEditing] = useState<number | null>(null);
  const [text, setText] = useState("");
  const edit = useMutation({
    mutationFn: ({
      id,
      content,
      isPinned,
    }: {
      id: number;
      content?: string;
      isPinned?: boolean;
    }) =>
      request("PATCH", `/api/user/notes/${id}`, {
        ...(content !== undefined ? { content } : {}),
        ...(isPinned !== undefined ? { isPinned } : {}),
      }),
    onSuccess: () => {
      setEditing(null);
      void cache.invalidateQueries({ queryKey: ["learning-notes"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => request("DELETE", `/api/user/notes/${id}`, {}),
    onSuccess: () =>
      void cache.invalidateQueries({ queryKey: ["learning-notes"] }),
  });
  return (
    <LearningShell title="Eslatmalarim" back="/profile">
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : q.data?.length ? (
        q.data.map((n) => (
          <Panel key={n.id}>
            <div className="section-heading">
              <Link href={`/learn/${n.lessonId}`}>Dars #{n.lessonId}</Link>
              <Button
                variant="ghost"
                onClick={() => edit.mutate({ id: n.id, isPinned: !n.isPinned })}
              >
                {n.isPinned ? "Belgini olib tashlash" : "Muhim deb belgilash"}
              </Button>
            </div>
            {editing === n.id ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  edit.mutate({ id: n.id, content: text });
                }}
              >
                <label className="field-label">
                  Eslatma
                  <textarea
                    maxLength={5000}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    required
                  />
                </label>
                <Button type="submit" disabled={edit.isPending}>
                  Saqlash
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditing(null)}
                >
                  Bekor qilish
                </Button>
              </form>
            ) : (
              <>
                <p dir="auto" style={{ whiteSpace: "pre-wrap" }}>
                  {n.content}
                </p>
                <div className="editor-actions">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditing(n.id);
                      setText(n.content);
                    }}
                  >
                    Tahrirlash
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(n.id)}
                  >
                    O‘chirish
                  </Button>
                </div>
              </>
            )}
          </Panel>
        ))
      ) : (
        <EmptyState
          title="Eslatmalaringiz shu yerda saqlanadi"
          description="Darsdagi Tushun bosqichida o‘zingiz uchun izoh yozishingiz mumkin."
          href="/courses"
        />
      )}
      {(edit.error || remove.error) && (
        <p role="alert" className="inline-error">
          {errorText(edit.error || remove.error)}
        </p>
      )}
    </LearningShell>
  );
}
