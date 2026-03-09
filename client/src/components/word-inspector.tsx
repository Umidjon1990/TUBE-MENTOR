import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, BookmarkPlus, MessageSquareText, Check, Volume2 } from "lucide-react";
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
}

interface WordInspectorProps {
  wordInfo: WordInfo | null;
  anchorRect: DOMRect | null;
  onClose: () => void;
  isMobile: boolean;
}

function highlightWord(sentence: string, word: string): JSX.Element {
  if (!word || !sentence) return <>{sentence}</>;
  const regex = new RegExp(`(\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b)`, "gi");
  const parts = sentence.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <span key={i} className="bg-primary/30 text-primary font-semibold px-0.5 rounded">{part}</span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export default function WordInspector({ wordInfo, anchorRect, onClose, isMobile }: WordInspectorProps) {
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
    <div className="space-y-3 md:space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">Tanlangan so'z</p>
          <h3 className="text-lg font-bold text-foreground break-words" data-testid="text-inspector-word">
            {wordInfo.word}
          </h3>
          {wordInfo.pronunciation && (
            <div className="flex items-center gap-1.5 mt-0.5">
              <Volume2 className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground italic" data-testid="text-inspector-pronunciation">
                {wordInfo.pronunciation}
              </span>
            </div>
          )}
          {wordInfo.partOfSpeech && (
            <Badge variant="secondary" className="mt-1.5 text-[10px]" data-testid="badge-part-of-speech">
              {wordInfo.partOfSpeech}
            </Badge>
          )}
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

      <div className="space-y-2.5">
        {wordInfo.translationUz && (
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-2.5 md:p-3">
            <p className="text-[10px] font-medium text-primary/70 uppercase tracking-wider mb-0.5">O'zbekcha tarjima</p>
            <p className="text-sm font-medium text-foreground break-words" data-testid="text-translation-uz">{wordInfo.translationUz}</p>
          </div>
        )}

        {wordInfo.translationAr && (
          <div className="rounded-lg bg-violet-500/5 border border-violet-500/20 p-2.5 md:p-3">
            <p className="text-[10px] font-medium text-violet-400/70 uppercase tracking-wider mb-0.5">Arabcha tarjima</p>
            <p
              className="text-sm font-medium text-foreground break-words"
              dir="rtl"
              style={{
                textAlign: "right",
                fontFamily: isArabicText(wordInfo.translationAr) ? "'Noto Naskh Arabic', 'Amiri', serif" : "inherit",
                lineHeight: "1.8",
              }}
              data-testid="text-translation-ar"
            >
              {wordInfo.translationAr}
            </p>
          </div>
        )}

        {wordInfo.contextualMeaning && (
          <div className="rounded-lg bg-muted/50 border border-border/50 p-2.5 md:p-3">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">Gapdagi ma'nosi</p>
            <p className="text-sm text-foreground/90 break-words" data-testid="text-contextual-meaning">{wordInfo.contextualMeaning}</p>
          </div>
        )}

        {wordInfo.phraseText && (
          <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-2.5 md:p-3">
            <p className="text-[10px] font-medium text-amber-400/70 uppercase tracking-wider mb-0.5">Birikma ma'nosi</p>
            <p className="text-sm font-semibold text-foreground mb-1 break-words" data-testid="text-phrase">{wordInfo.phraseText}</p>
            {wordInfo.phraseTranslationUz && (
              <p className="text-xs text-foreground/80 break-words">UZ: {wordInfo.phraseTranslationUz}</p>
            )}
            {wordInfo.phraseTranslationAr && (
              <p
                className="text-xs text-foreground/80 break-words"
                dir="rtl"
                style={{
                  textAlign: "right",
                  fontFamily: isArabicText(wordInfo.phraseTranslationAr) ? "'Noto Naskh Arabic', 'Amiri', serif" : "inherit",
                  lineHeight: "1.8",
                }}
              >
                AR: {wordInfo.phraseTranslationAr}
              </p>
            )}
            {wordInfo.phraseExplanation && (
              <p className="text-xs text-muted-foreground mt-1 break-words">{wordInfo.phraseExplanation}</p>
            )}
          </div>
        )}

        {wordInfo.sourceSentence && (
          <div className="rounded-lg bg-muted/30 border border-border/30 p-2.5 md:p-3">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Shu gapdagi joyi</p>
            <div className="space-y-0">
              <div className="rounded-md bg-background/60 border border-border/20 px-2.5 py-1.5">
                <p className="text-[9px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-0.5">Asl matn</p>
                <p className="text-xs text-foreground/80 leading-relaxed break-words" data-testid="text-source-sentence">
                  {highlightWord(wordInfo.sourceSentence, wordInfo.word)}
                </p>
              </div>
              {wordInfo.sourceSentenceUz && (
                <div className="rounded-md bg-primary/5 border border-primary/10 px-2.5 py-1.5 mt-1">
                  <p className="text-[9px] font-medium text-primary/60 uppercase tracking-wider mb-0.5">O'zbekcha</p>
                  <p className="text-xs text-primary/70 leading-relaxed break-words" data-testid="text-source-sentence-uz">
                    {wordInfo.translationUz ? highlightWord(wordInfo.sourceSentenceUz, wordInfo.translationUz.split(/[,;/]/)[0].trim()) : wordInfo.sourceSentenceUz}
                  </p>
                </div>
              )}
              {wordInfo.sourceSentenceAr && (
                <div className="rounded-md bg-violet-500/5 border border-violet-500/10 px-2.5 py-1.5 mt-1">
                  <p className="text-[9px] font-medium text-violet-400/60 uppercase tracking-wider mb-0.5">Arabcha</p>
                  <p
                    className="text-xs text-violet-400/70 leading-relaxed break-words"
                    dir="rtl"
                    style={{
                      textAlign: "right",
                      fontFamily: isArabicText(wordInfo.sourceSentenceAr) ? "'Noto Naskh Arabic', 'Amiri', serif" : "inherit",
                      lineHeight: "1.8",
                    }}
                    data-testid="text-source-sentence-ar"
                  >
                    {wordInfo.translationAr ? highlightWord(wordInfo.sourceSentenceAr, wordInfo.translationAr.split(/[,;/]/)[0].trim()) : wordInfo.sourceSentenceAr}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          className="flex-1 h-10 md:h-9 text-xs"
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
              <span className="truncate">Mening so'zlarimga qo'shish</span>
            </>
          )}
        </Button>
        <Button
          size="sm" variant="outline"
          className="h-10 md:h-9 text-xs shrink-0"
          onClick={() => {
            toast({ title: "Shu gapni tushuntir", description: `"${wordInfo.sourceSentence}"` });
          }}
          data-testid="button-explain-sentence"
        >
          <MessageSquareText className="w-3.5 h-3.5 mr-1" />
          <span className="hidden sm:inline">Tushuntir</span>
        </Button>
      </div>
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
