import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Subtitles, Languages, MousePointerClick, Lock,
  Monitor
} from "lucide-react";
import WordInspector, { type WordInfo } from "./word-inspector";

export interface SubtitleItem {
  id: number;
  startTime: number;
  endTime: number;
  originalText: string;
  translationUz: string;
  translationAr: string;
}

export interface VocabLookup {
  word: string;
  translation: string;
  translationAr?: string;
  partOfSpeech?: string;
  example?: string;
  difficulty?: string;
}

export interface PhraseLookup {
  phrase: string;
  translation: string;
  translationAr?: string;
  context?: string;
}

type DisplayMode = "original" | "both" | "translation";
type TranslationLang = "uz" | "ar";
type PanelMode = "auto" | "fixed";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

function extractVideoId(url: string): string | null {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function isArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

function tokenizeText(text: string): { prefix: string; word: string; suffix: string }[] {
  const tokens: { prefix: string; word: string; suffix: string }[] = [];
  const regex = /([^\p{L}\p{N}'']*)([\p{L}\p{N}'']+)([^\p{L}\p{N}'']*)/gu;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const gap = text.slice(lastIndex, match.index);
      tokens.push({ prefix: gap, word: "", suffix: "" });
    }
    tokens.push({ prefix: match[1], word: match[2], suffix: match[3] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    tokens.push({ prefix: text.slice(lastIndex), word: "", suffix: "" });
  }
  return tokens;
}

interface SubtitlePlayerProps {
  youtubeUrl: string;
  subtitles: SubtitleItem[];
  lessonId?: number;
  vocabulary?: VocabLookup[];
  phrases?: PhraseLookup[];
  className?: string;
}

export default function SubtitlePlayer({ youtubeUrl, subtitles, lessonId, vocabulary = [], phrases = [], className = "" }: SubtitlePlayerProps) {
  const videoId = useMemo(() => extractVideoId(youtubeUrl), [youtubeUrl]);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("both");
  const [translationLang, setTranslationLang] = useState<TranslationLang>("uz");
  const [panelMode, setPanelMode] = useState<PanelMode>("auto");
  const [selectedWord, setSelectedWord] = useState<WordInfo | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const activeIndex = useMemo(() => {
    for (let i = 0; i < subtitles.length; i++) {
      if (currentTime >= subtitles[i].startTime && currentTime < subtitles[i].endTime) {
        return i;
      }
    }
    return -1;
  }, [currentTime, subtitles]);

  const activeSubtitle = activeIndex >= 0 ? subtitles[activeIndex] : null;

  const vocabMap = useMemo(() => {
    const m = new Map<string, VocabLookup>();
    for (const v of vocabulary) {
      m.set(v.word.toLowerCase(), v);
    }
    return m;
  }, [vocabulary]);

  const findPhraseForWord = useCallback((word: string, sentence: string): PhraseLookup | null => {
    const lower = sentence.toLowerCase();
    for (const p of phrases) {
      if (lower.includes(p.phrase.toLowerCase()) && p.phrase.toLowerCase().includes(word.toLowerCase())) {
        return p;
      }
    }
    return null;
  }, [phrases]);

  const handleWordClick = useCallback((word: string, subtitle: SubtitleItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const cleanWord = word.replace(/[^\p{L}\p{N}]/gu, "");
    if (!cleanWord) return;

    const vocabEntry = vocabMap.get(cleanWord.toLowerCase());
    const phraseEntry = findPhraseForWord(cleanWord, subtitle.originalText);

    const info: WordInfo = {
      word: cleanWord,
      normalized: cleanWord.toLowerCase(),
      translationUz: vocabEntry?.translation || subtitle.translationUz || "",
      translationAr: vocabEntry?.translationAr || "",
      contextualMeaning: vocabEntry?.example || "",
      partOfSpeech: vocabEntry?.partOfSpeech || "",
      pronunciation: "",
      sourceSentence: subtitle.originalText,
      subtitleTime: subtitle.startTime,
      lessonId: lessonId || 0,
      phraseText: phraseEntry?.phrase,
      phraseTranslationUz: phraseEntry?.translation,
      phraseTranslationAr: phraseEntry?.translationAr,
      phraseExplanation: phraseEntry?.context,
    };

    setSelectedWord(info);
    setAnchorRect(rect);
  }, [vocabMap, findPhraseForWord, lessonId]);

  const closeInspector = useCallback(() => {
    setSelectedWord(null);
    setAnchorRect(null);
  }, []);

  useEffect(() => {
    if (!videoId) return;

    const loadAPI = () => {
      if (window.YT && window.YT.Player) {
        createPlayer();
        return;
      }
      const existingScript = document.querySelector('script[src*="youtube.com/iframe_api"]');
      if (!existingScript) {
        const tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
      }
      window.onYouTubeIframeAPIReady = () => createPlayer();
    };

    const createPlayer = () => {
      if (!playerContainerRef.current) return;
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch {}
      }

      const containerDiv = document.createElement("div");
      containerDiv.id = `yt-player-${videoId}`;
      playerContainerRef.current.innerHTML = "";
      playerContainerRef.current.appendChild(containerDiv);

      playerRef.current = new window.YT.Player(containerDiv.id, {
        videoId,
        playerVars: {
          autoplay: 0,
          modestbranding: 1,
          rel: 0,
          cc_load_policy: 0,
          iv_load_policy: 3,
          playsinline: 1,
        },
        events: {
          onReady: () => setIsReady(true),
          onStateChange: (event: any) => {
            const playing = event.data === window.YT.PlayerState.PLAYING;
            setIsPlaying(playing);
          },
        },
      });
    };

    loadAPI();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch {}
      }
    };
  }, [videoId]);

  useEffect(() => {
    if (isPlaying && playerRef.current) {
      timerRef.current = setInterval(() => {
        try {
          const t = playerRef.current.getCurrentTime();
          if (typeof t === "number") setCurrentTime(t);
        } catch {}
      }, 250);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying]);

  useEffect(() => {
    if (panelMode !== "auto" || activeIndex < 0 || !panelRef.current) return;
    const el = panelRef.current.querySelector(`[data-subtitle-idx="${activeIndex}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeIndex, panelMode]);

  const seekTo = useCallback((time: number) => {
    if (playerRef.current && isReady) {
      playerRef.current.seekTo(time, true);
      setCurrentTime(time);
    }
  }, [isReady]);

  const getTranslation = useCallback((item: SubtitleItem) => {
    return translationLang === "uz" ? item.translationUz : item.translationAr;
  }, [translationLang]);

  const renderClickableWords = useCallback((text: string, subtitle: SubtitleItem, isOverlay: boolean) => {
    const tokens = tokenizeText(text);
    const textIsArabic = isArabic(text);
    return (
      <span dir={textIsArabic ? "rtl" : "ltr"} style={{ textAlign: textIsArabic ? "right" : isOverlay ? "center" : "left", display: "block" }}>
        {tokens.map((t, i) => (
          <span key={i}>
            {t.prefix && <span>{t.prefix}</span>}
            {t.word && (
              <span
                className={`cursor-pointer transition-all duration-150 rounded-sm ${
                  isOverlay
                    ? "hover:bg-white/20 hover:text-cyan-200 px-0.5 py-0.5"
                    : "hover:bg-primary/15 hover:text-primary px-0.5"
                }`}
                onClick={(e) => handleWordClick(t.word, subtitle, e)}
                data-testid={`word-${t.word.toLowerCase()}-${i}`}
              >
                {t.word}
              </span>
            )}
            {t.suffix && <span>{t.suffix}</span>}
          </span>
        ))}
      </span>
    );
  }, [handleWordClick]);

  const renderOverlayText = useCallback((item: SubtitleItem) => {
    const translation = getTranslation(item);
    const isActive = true;

    if (displayMode === "original") {
      return (
        <div className="pointer-events-auto" data-testid="text-subtitle-overlay-original">
          <p className="text-sm md:text-base lg:text-lg font-medium leading-relaxed text-white">
            {renderClickableWords(item.originalText, item, true)}
          </p>
        </div>
      );
    }
    if (displayMode === "translation") {
      const translationIsArabic = translationLang === "ar" || isArabic(translation);
      return (
        <div data-testid="text-subtitle-overlay-translation">
          <p
            className="text-sm md:text-base lg:text-lg font-medium leading-relaxed text-white"
            dir={translationIsArabic ? "rtl" : "ltr"}
            style={{ textAlign: translationIsArabic ? "right" : "center" }}
          >
            {translation || item.originalText}
          </p>
        </div>
      );
    }
    return (
      <div className="space-y-1 pointer-events-auto">
        <p className="text-sm md:text-base lg:text-lg font-semibold leading-relaxed text-white" data-testid="text-subtitle-overlay-original">
          {renderClickableWords(item.originalText, item, true)}
        </p>
        {translation && (
          <p
            className="text-xs md:text-sm lg:text-base leading-relaxed text-cyan-200/90"
            dir={translationLang === "ar" || isArabic(translation) ? "rtl" : "ltr"}
            style={{ textAlign: translationLang === "ar" || isArabic(translation) ? "right" : "center" }}
            data-testid="text-subtitle-overlay-translation"
          >
            {translation}
          </p>
        )}
      </div>
    );
  }, [displayMode, translationLang, getTranslation, renderClickableWords]);

  if (!videoId) {
    return (
      <div className={`rounded-xl overflow-hidden bg-black/50 aspect-video flex items-center justify-center ${className}`}>
        <p className="text-muted-foreground text-sm">Video mavjud emas</p>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="relative rounded-xl overflow-hidden bg-black shadow-2xl shadow-black/50">
        <div className="relative aspect-video">
          <div ref={playerContainerRef} className="absolute inset-0 z-0" />

          {activeSubtitle && (
            <div className="absolute bottom-3 left-3 right-3 z-10" data-testid="subtitle-overlay">
              <div className="mx-auto max-w-[90%] md:max-w-[80%] px-4 py-2.5 rounded-lg bg-black/70 backdrop-blur-md border border-white/10 shadow-lg">
                {renderOverlayText(activeSubtitle)}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg glass border border-border/50 p-1">
          <Button
            variant={displayMode === "original" ? "default" : "ghost"}
            size="sm"
            className="h-7 text-[11px] md:text-xs px-2 md:px-3"
            onClick={() => setDisplayMode("original")}
            data-testid="button-mode-original"
          >
            <Monitor className="w-3 h-3 mr-1 hidden sm:block" />
            Faqat asl matn
          </Button>
          <Button
            variant={displayMode === "both" ? "default" : "ghost"}
            size="sm"
            className="h-7 text-[11px] md:text-xs px-2 md:px-3"
            onClick={() => setDisplayMode("both")}
            data-testid="button-mode-both"
          >
            <Subtitles className="w-3 h-3 mr-1 hidden sm:block" />
            Asl + tarjima
          </Button>
          <Button
            variant={displayMode === "translation" ? "default" : "ghost"}
            size="sm"
            className="h-7 text-[11px] md:text-xs px-2 md:px-3"
            onClick={() => setDisplayMode("translation")}
            data-testid="button-mode-translation"
          >
            <Languages className="w-3 h-3 mr-1 hidden sm:block" />
            Faqat tarjima
          </Button>
        </div>

        <div className="flex items-center gap-1 rounded-lg glass border border-border/50 p-1">
          <Button
            variant={translationLang === "uz" ? "default" : "ghost"}
            size="sm"
            className="h-7 text-[11px] md:text-xs px-2 md:px-3"
            onClick={() => setTranslationLang("uz")}
            data-testid="button-lang-uz"
          >
            O'zbekcha
          </Button>
          <Button
            variant={translationLang === "ar" ? "default" : "ghost"}
            size="sm"
            className="h-7 text-[11px] md:text-xs px-2 md:px-3"
            onClick={() => setTranslationLang("ar")}
            data-testid="button-lang-ar"
          >
            Arabcha
          </Button>
        </div>

        <div className="flex items-center gap-1 rounded-lg glass border border-border/50 p-1 ml-auto">
          <Button
            variant={panelMode === "auto" ? "default" : "ghost"}
            size="sm"
            className="h-7 text-[11px] md:text-xs px-2 md:px-3"
            onClick={() => setPanelMode("auto")}
            data-testid="button-panel-auto"
          >
            <MousePointerClick className="w-3 h-3 mr-1 hidden sm:block" />
            Auto kuzatish
          </Button>
          <Button
            variant={panelMode === "fixed" ? "default" : "ghost"}
            size="sm"
            className="h-7 text-[11px] md:text-xs px-2 md:px-3"
            onClick={() => setPanelMode("fixed")}
            data-testid="button-panel-fixed"
          >
            <Lock className="w-3 h-3 mr-1 hidden sm:block" />
            Joyida turish
          </Button>
        </div>
      </div>

      {subtitles.length > 0 && (
        <div
          className="rounded-xl glass border border-border/50 overflow-hidden"
          data-testid="subtitle-panel"
        >
          <div className="flex items-center justify-between px-4 py-2 border-b border-border/30">
            <div className="flex items-center gap-2">
              <Subtitles className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Hozirgi subtitle</span>
            </div>
            <Badge variant="secondary" className="text-[10px]">
              {subtitles.length} qator
            </Badge>
          </div>

          <div
            ref={panelRef}
            className="max-h-[240px] md:max-h-[320px] overflow-y-auto scroll-smooth"
          >
            <div className="p-2 space-y-0.5">
              {subtitles.map((item, idx) => {
                const isActive = idx === activeIndex;
                const translation = getTranslation(item);
                const originalIsArabic = isArabic(item.originalText);
                const translationIsArabic = translationLang === "ar" || isArabic(translation);

                return (
                  <div
                    key={item.id}
                    data-subtitle-idx={idx}
                    className={`w-full rounded-lg px-3 py-2 transition-all duration-200 group
                      ${isActive
                        ? "bg-primary/15 border border-primary/40 shadow-sm shadow-primary/10"
                        : "hover:bg-white/5 border border-transparent"
                      }`}
                    data-testid={`button-subtitle-line-${idx}`}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`text-[10px] font-mono mt-1 shrink-0 w-10 transition-colors cursor-pointer ${
                          isActive ? "text-primary font-bold" : "text-muted-foreground group-hover:text-foreground/70"
                        }`}
                        onClick={() => seekTo(item.startTime)}
                      >
                        {formatTime(item.startTime)}
                      </span>
                      <div className="flex-1 min-w-0">
                        {(displayMode === "original" || displayMode === "both") && (
                          <div className={`text-sm leading-relaxed transition-colors ${
                            isActive ? "text-foreground font-medium" : "text-foreground/70"
                          }`}>
                            {isActive ? (
                              renderClickableWords(item.originalText, item, false)
                            ) : (
                              <p
                                className="cursor-pointer"
                                dir={originalIsArabic ? "rtl" : "ltr"}
                                style={{ textAlign: originalIsArabic ? "right" : "left" }}
                                onClick={() => seekTo(item.startTime)}
                              >
                                {item.originalText}
                              </p>
                            )}
                          </div>
                        )}
                        {(displayMode === "translation" || displayMode === "both") && translation && (
                          <p
                            className={`text-xs leading-relaxed transition-colors cursor-pointer ${
                              displayMode === "both" ? "mt-0.5" : ""
                            } ${isActive ? "text-primary/80" : "text-muted-foreground"}`}
                            dir={translationIsArabic ? "rtl" : "ltr"}
                            style={{ textAlign: translationIsArabic ? "right" : "left" }}
                            onClick={() => seekTo(item.startTime)}
                          >
                            {translation}
                          </p>
                        )}
                        {displayMode === "translation" && !translation && (
                          <p
                            className={`text-sm leading-relaxed cursor-pointer ${isActive ? "text-foreground font-medium" : "text-foreground/70"}`}
                            style={{ textAlign: "left" }}
                            onClick={() => seekTo(item.startTime)}
                          >
                            {item.originalText}
                          </p>
                        )}
                      </div>
                      {isActive && (
                        <div className="shrink-0 mt-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {selectedWord && (
        <WordInspector
          wordInfo={selectedWord}
          anchorRect={anchorRect}
          onClose={closeInspector}
          isMobile={isMobile}
        />
      )}
    </div>
  );
}
