import { useState } from "react";
import type { Segment } from "@shared/learning";
import { alignmentProblems } from "@shared/content-validation";

export function AlignedSubtitles({
  segment,
  arabic,
  showTranslation,
  pause,
}: {
  segment: Segment;
  arabic: boolean;
  showTranslation: boolean;
  pause: () => void;
}) {
  const [active, setActive] = useState<number | null>(null);
  const valid = !alignmentProblems(
    segment.text,
    segment.translation,
    segment.alignment,
  ).length;
  function line(target: boolean) {
    const text = target ? segment.translation : segment.text;
    const parts = valid
      ? segment.alignment
          .map((a, i) => ({
            start: target ? a.targetStart : a.sourceStart,
            end: target ? a.targetEnd : a.sourceEnd,
            i,
          }))
          .sort((a, b) => a.start - b.start)
      : [];
    const nodes = [];
    let cursor = 0;
    for (const part of parts) {
      nodes.push(
        <span key={`gap-${part.i}`}>{text.slice(cursor, part.start)}</span>,
      );
      nodes.push(
        <button
          key={part.i}
          className={`aligned-part tone-${part.i % 6} ${active === part.i ? "is-selected" : ""}`}
          aria-pressed={active === part.i}
          onClick={() => {
            pause();
            setActive(part.i);
          }}
        >
          {text.slice(part.start, part.end)}
        </button>,
      );
      cursor = part.end;
    }
    nodes.push(<span key="end">{text.slice(cursor)}</span>);
    return nodes;
  }
  return (
    <div className="aligned-subtitles" onClick={pause}>
      <p
        className={arabic ? "sentence arabic" : "sentence"}
        dir={arabic ? "rtl" : "ltr"}
      >
        {line(false)}
      </p>
      {showTranslation && (
        <p className="sentence-translation" dir="ltr">
          {line(true)}
        </p>
      )}
      <small className="muted">
        Qismni bosing — video to‘xtaydi va tarjimadagi mos qism ajraladi.
      </small>
    </div>
  );
}
