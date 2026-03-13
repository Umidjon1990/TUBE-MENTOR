import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { X, BookmarkPlus, Check } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface WordInfo {
  word: string;
  normalized: string;
  translationUz: string;
  translationAr: string;
  contextualMeaning: string;
  partOfSpeech: string;
  pronunciation: string;
  sourceSentence: string;
  sourceSentenceUz?: string;
  sourceSentenceAr?: string;
  subtitleTime: number;
  lessonId: number;
  phraseText?: string;
  phraseTranslationUz?: string;
  phraseTranslationAr?: string;
  phraseExplanation?: string;
  grammaticalRole?: string;
  i_rab?: string;
  nahwExplanation?: string;
}

interface WordInspectorProps {
  wordInfo: WordInfo | null;
  anchorRect: DOMRect | null;
  onClose: () => void;
  isMobile: boolean;
  readOnly?: boolean;
}

function highlightWord(sentence: string, word: string, color: "cyan" | "amber" = "cyan"): JSX.Element {
  if (!word || !sentence) return <>{sentence}</>;
  const stripped = word.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "");
  const escaped = stripped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = sentence.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "").split(regex);

  const hasDiacritics = word !== stripped;
  if (hasDiacritics) {
    const idx = sentence.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "").toLowerCase().indexOf(stripped.toLowerCase());
    if (idx >= 0) {
      let origStart = -1, origEnd = -1, count = 0;
      for (let i = 0; i < sentence.length; i++) {
        if (!/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/.test(sentence[i])) {
          if (count === idx && origStart < 0) origStart = i;
          count++;
          if (count === idx + stripped.length) { origEnd = i + 1; break; }
        } else if (origStart >= 0 && origEnd < 0) {
          origEnd = i + 1;
        }
      }
      if (origStart >= 0) {
        while (origEnd < sentence.length && /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/.test(sentence[origEnd])) origEnd++;
        const before = sentence.substring(0, origStart);
        const match = sentence.substring(origStart, origEnd);
        const after = sentence.substring(origEnd);
        const cls = color === "amber"
          ? "bg-amber-500/25 text-amber-300 font-bold px-0.5 rounded"
          : "bg-cyan-500/25 text-cyan-300 font-bold px-0.5 rounded";
        return <>{before}<span className={cls}>{match}</span>{after}</>;
      }
    }
  }

  const cls = color === "amber"
    ? "bg-amber-500/25 text-amber-300 font-bold px-0.5 rounded"
    : "bg-cyan-500/25 text-cyan-300 font-bold px-0.5 rounded";
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <span key={i} className={cls}>{part}</span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export default function WordInspector({ wordInfo, anchorRect, onClose, isMobile, readOnly = false }: WordInspectorProps) {
  const [saved, setSaved] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: async (info: WordInfo) => {
      await apiRequest("POST", "/api/user/saved-words", {
        word: info.word,
        normalized: info.normalized,
        lessonId: info.lessonId,
        translationUz: info.translationUz,
        translationAr: info.translationAr,
        contextualMeaning: info.contextualMeaning,
        partOfSpeech: info.partOfSpeech,
        pronunciation: info.pronunciation,
        sourceSentence: info.sourceSentence,
        subtitleTime: info.subtitleTime,
        phraseText: info.phraseText,
        phraseTranslationUz: info.phraseTranslationUz,
        phraseTranslationAr: info.phraseTranslationAr,
        phraseExplanation: info.phraseExplanation,
      });
    },
    onSuccess: () => {
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ["/api/user/saved-words"] });
      toast({ title: "Saqlandi", description: "So'z muvaffaqiyatli saqlandi" });
    },
    onError: (err: Error) => {
      if (err.message.includes("409")) {
        setSaved(true);
        toast({ title: "Allaqachon saqlangan", description: "Bu so'z avval saqlangan" });
      } else {
        toast({ title: "Xatolik", description: "So'zni saqlashda xatolik yuz berdi", variant: "destructive" });
      }
    },
  });

  useEffect(() => {
    setSaved(false);
  }, [wordInfo?.word, wordInfo?.subtitleTime]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  useEffect(() => {
    if (!isMobile) {
      const handleClickOutside = (e: MouseEvent) => {
        if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
          onClose();
        }
      };
      const timer = setTimeout(() => document.addEventListener("mousedown", handleClickOutside), 100);
      return () => {
        clearTimeout(timer);
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isMobile, onClose]);

  if (!wordInfo) return null;

  const isArabicText = (t: string) => /[\u0600-\u06FF]/.test(t);

  const popupStyle = !isMobile && anchorRect ? (() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const popupW = Math.min(360, vw - 24);
    const popupH = 500;
    let left = anchorRect.left + anchorRect.width / 2 - popupW / 2;
    let top = anchorRect.bottom + 8;
    if (left < 12) left = 12;
    if (left + popupW > vw - 12) left = vw - popupW - 12;
    if (top + popupH > vh - 12) {
      top = anchorRect.top - popupH - 8;
      if (top < 12) top = 12;
    }
    return { left, top, width: popupW };
  })() : undefined;

  const content = (
    <div className="space-y-2.5 md:space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Arabcha so'z</p>
          <h3
            className="text-2xl font-bold text-foreground break-words"
            dir="rtl"
            style={{ fontFamily: "'Noto Naskh Arabic', 'Amiri', serif", lineHeight: "1.6" }}
            data-testid="text-inspector-word"
          >
            {wordInfo.word}
          </h3>
        </div>
        <Button
          variant="ghost" size="icon"
          className="shrink-0 h-8 w-8 md:h-7 md:w-7 -mr-1"
          onClick={onClose}
          data-testid="button-close-inspector"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="space-y-2">
        <div className="rounded-lg bg-primary/5 border border-primary/20 p-2.5">
          <p className="text-[10px] font-medium text-primary/70 uppercase tracking-wider mb-0.5">Tarjimasi</p>
          <p className="text-sm font-semibold text-foreground break-words" data-testid="text-translation-uz">
            {wordInfo.translationUz || wordInfo.contextualMeaning || "—"}
          </p>
          {wordInfo.translationUz && wordInfo.contextualMeaning && wordInfo.contextualMeaning !== wordInfo.translationUz && (
            <p className="text-xs text-muted-foreground mt-0.5 break-words" data-testid="text-contextual-meaning">
              {wordInfo.contextualMeaning}
            </p>
          )}
        </div>

        <div className="rounded-lg bg-violet-500/5 border border-violet-500/20 p-2.5">
          <p className="text-[10px] font-medium text-violet-400/70 uppercase tracking-wider mb-0.5">Sinonim</p>
          <p
            className="text-sm font-semibold text-foreground break-words"
            dir="rtl"
            style={{ fontFamily: "'Noto Naskh Arabic', 'Amiri', serif", lineHeight: "1.6" }}
            data-testid="text-synonym-ar"
          >
            {wordInfo.translationAr || "—"}
          </p>
        </div>

        <div className="rounded-lg bg-sky-500/5 border border-sky-500/20 p-2.5">
          <p className="text-[10px] font-medium text-sky-400/70 uppercase tracking-wider mb-0.5">So'z turi</p>
          <p
            className="text-sm font-semibold text-foreground break-words"
            dir="rtl"
            style={{ fontFamily: "'Noto Naskh Arabic', 'Amiri', serif", lineHeight: "1.6" }}
            data-testid="text-part-of-speech"
          >
            {wordInfo.partOfSpeech || "—"}
          </p>
        </div>

        <div className="rounded-lg bg-teal-500/5 border border-teal-500/20 p-2.5">
          <p className="text-[10px] font-medium text-teal-400/70 uppercase tracking-wider mb-1">Gapdagi o'rni</p>
          <p
            className="text-sm font-semibold text-teal-300 break-words"
            dir="rtl"
            style={{ fontFamily: "'Noto Naskh Arabic', 'Amiri', serif", lineHeight: "1.6" }}
            data-testid="text-grammatical-role"
          >
            {wordInfo.grammaticalRole || "—"}
            {wordInfo.i_rab && <span className="text-teal-400/70"> — {wordInfo.i_rab}</span>}
          </p>
          {wordInfo.nahwExplanation && (
            <p className="text-xs text-muted-foreground mt-1 break-words" data-testid="text-nahw-explanation">
              {wordInfo.nahwExplanation}
            </p>
          )}
        </div>

        {wordInfo.sourceSentence && (
          <div className="rounded-lg bg-muted/30 border border-border/30 p-2.5">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Arabcha shakli</p>
            <p
              className="text-sm text-foreground/90 leading-relaxed break-words"
              dir="rtl"
              style={{ textAlign: "right", fontFamily: "'Noto Naskh Arabic', 'Amiri', serif", lineHeight: "1.8" }}
              data-testid="text-source-sentence"
            >
              {highlightWord(wordInfo.sourceSentence, wordInfo.word, "cyan")}
            </p>
          </div>
        )}

        {wordInfo.sourceSentenceUz && (
          <div className="rounded-lg bg-primary/5 border border-primary/10 p-2.5">
            <p className="text-[10px] font-medium text-primary/60 uppercase tracking-wider mb-1.5">O'zbekcha shakli</p>
            <p className="text-sm text-foreground/80 leading-relaxed break-words" data-testid="text-source-sentence-uz">
              {wordInfo.translationUz ? highlightWord(wordInfo.sourceSentenceUz, wordInfo.translationUz.split(/[,;/]/)[0].trim(), "amber") : wordInfo.sourceSentenceUz}
            </p>
          </div>
        )}
      </div>

      {!readOnly && (
        <div className="pt-1">
          <Button
            size="sm"
            className="w-full h-10 md:h-9 text-xs"
            disabled={saved || saveMutation.isPending}
            onClick={() => saveMutation.mutate(wordInfo)}
            data-testid="button-save-word"
          >
            {saved ? (
              <>
                <Check className="w-3.5 h-3.5 mr-1.5" />
                Saqlandi
              </>
            ) : saveMutation.isPending ? (
              "Saqlanmoqda..."
            ) : (
              <>
                <BookmarkPlus className="w-3.5 h-3.5 mr-1.5" />
                Saqlash
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <div className="fixed inset-0 z-[100]" data-testid="word-inspector-mobile">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <div
          ref={popupRef}
          className="absolute bottom-0 left-0 right-0 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-background border-t border-border/50 shadow-2xl animate-in slide-in-from-bottom duration-300"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 24px)" }}
        >
          <div className="sticky top-0 bg-background z-10 pt-3 pb-2 px-5">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto" />
          </div>
          <div className="px-5 pb-6">
            {content}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={popupRef}
      className="fixed z-[100] rounded-xl bg-background/95 backdrop-blur-xl border border-border/60 shadow-2xl shadow-black/30 p-4 animate-in fade-in zoom-in-95 duration-200 max-h-[80vh] overflow-y-auto"
      style={popupStyle}
      data-testid="word-inspector-desktop"
    >
      {content}
    </div>
  );
}
