import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Play, Pause, SkipBack, SkipForward,
  Repeat, Minus, Plus, ZoomIn, ZoomOut,
  Headphones, ChevronDown, ChevronUp
} from "lucide-react";
import WordInspector, { type WordInfo } from "./word-inspector";
import type { SubtitleItem, VocabLookup, SentenceWordMap, WordMapEntry } from "./subtitle-player";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

function extractVideoId(url: string): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
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
  const regex = /([^\p{L}\p{N}\p{M}'']*)([\p{L}\p{N}\p{M}'']+)([^\p{L}\p{N}\p{M}'']*)/gu;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ prefix: text.slice(lastIndex, match.index), word: "", suffix: "" });
    }
    tokens.push({ prefix: match[1], word: match[2], suffix: match[3] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    tokens.push({ prefix: text.slice(lastIndex), word: "", suffix: "" });
  }
  return tokens;
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

type DisplayMode = "original" | "both" | "translation";

interface ShadowingPlayerProps {
  youtubeUrl: string;
  subtitles: SubtitleItem[];
  lessonId?: number;
  vocabulary?: VocabLookup[];
  sentenceWordMaps?: SentenceWordMap[];
  className?: string;
  readOnly?: boolean;
  targetLanguage?: string;
}

export default function ShadowingPlayer({ youtubeUrl, subtitles, lessonId, vocabulary = [], sentenceWordMaps = [], className = "", readOnly = false, targetLanguage = "ar" }: ShadowingPlayerProps) {
  const videoId = useMemo(() => extractVideoId(youtubeUrl), [youtubeUrl]);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("both");
  const [selectedWord, setSelectedWord] = useState<WordInfo | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [playingIndex, setPlayingIndex] = useState(-1);
  const [isLooping, setIsLooping] = useState(false);
  const [textZoom, setTextZoom] = useState(1);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const activeIndex = useMemo(() => {
    if (!subtitles.length) return -1;
    for (let i = 0; i < subtitles.length; i++) {
      if (currentTime >= subtitles[i].startTime && currentTime < subtitles[i].endTime) {
        return i;
      }
    }
    return -1;
  }, [currentTime, subtitles]);

  const vocabMap = useMemo(() => {
    const m = new Map<string, VocabLookup>();
    for (const v of vocabulary) {
      m.set(v.word.toLowerCase(), v);
    }
    return m;
  }, [vocabulary]);

  const wordMapLookup = useMemo(() => {
    const m = new Map<number, Map<string, WordMapEntry>>();
    for (const swm of sentenceWordMaps) {
      const inner = new Map<string, WordMapEntry>();
      for (const wm of swm.wordMap) {
        inner.set(wm.normalized, wm);
      }
      m.set(swm.sentenceIndex, inner);
    }
    return m;
  }, [sentenceWordMaps]);

  const wasPlayingRef = useRef(false);

  const stripArabicDiacritics = useCallback((t: string) =>
    t.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, ""), []);
  const normalizeArabic = useCallback((t: string) =>
    stripArabicDiacritics(t).replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي"), [stripArabicDiacritics]);

  const handleWordClick = useCallback((word: string, subtitle: SubtitleItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const cleanWord = word.replace(/[^\p{L}\p{N}]/gu, "");
    if (!cleanWord) return;

    if (!selectedWord) {
      wasPlayingRef.current = isPlaying;
      if (playerRef.current && isReady && isPlaying) {
        playerRef.current.pauseVideo();
      }
    }

    const normalizedWord = normalizeArabic(cleanWord).toLowerCase();
    let wmEntry: WordMapEntry | undefined;
    for (const si of subtitle.sentenceIndices) {
      wmEntry = wordMapLookup.get(si)?.get(normalizedWord);
      if (wmEntry) break;
    }
    const vocabEntry = vocabMap.get(normalizedWord) || vocabMap.get(cleanWord.toLowerCase());

    setSelectedWord({
      word: cleanWord,
      normalized: cleanWord.toLowerCase(),
      translationUz: wmEntry?.translationUz || vocabEntry?.translation || "",
      translationAr: wmEntry?.translationAr || vocabEntry?.translationAr || "",
      pronunciation: "",
      sourceSentence: subtitle.originalText,
      sourceSentenceUz: subtitle.translationUz || "",
      sourceSentenceAr: subtitle.translationAr || "",
      subtitleTime: subtitle.startTime,
      lessonId: lessonId || 0,
    });
    setAnchorRect(rect);
  }, [vocabMap, wordMapLookup, lessonId, isReady, isPlaying, selectedWord, normalizeArabic]);

  const closeInspector = useCallback(() => {
    setSelectedWord(null);
    setAnchorRect(null);
    if (wasPlayingRef.current && playerRef.current && isReady) {
      playerRef.current.playVideo();
      wasPlayingRef.current = false;
    }
  }, [isReady]);

  useEffect(() => {
    if (!videoId) return;
    const loadAPI = () => {
      if (window.YT && window.YT.Player) { createPlayer(); return; }
      const existing = document.querySelector('script[src*="youtube.com/iframe_api"]');
      if (!existing) {
        const tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
      }
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prev) prev();
        createPlayer();
      };
    };

    const createPlayer = () => {
      if (!playerContainerRef.current) return;
      if (playerRef.current) { try { playerRef.current.destroy(); } catch {} }
      const containerDiv = document.createElement("div");
      containerDiv.id = `yt-shadow-${videoId}`;
      playerContainerRef.current.innerHTML = "";
      playerContainerRef.current.appendChild(containerDiv);
      playerRef.current = new window.YT.Player(containerDiv.id, {
        videoId,
        width: "1",
        height: "1",
        playerVars: { autoplay: 0, modestbranding: 1, rel: 0, cc_load_policy: 0, iv_load_policy: 3, playsinline: 1 },
        events: {
          onReady: () => setIsReady(true),
          onStateChange: (event: any) => setIsPlaying(event.data === window.YT.PlayerState.PLAYING),
        },
      });
    };
    loadAPI();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (playerRef.current) { try { playerRef.current.destroy(); } catch {} }
    };
  }, [videoId]);

  useEffect(() => {
    if (isPlaying && playerRef.current) {
      timerRef.current = setInterval(() => {
        try {
          const t = playerRef.current.getCurrentTime();
          if (typeof t === "number") setCurrentTime(t);
        } catch {}
      }, 150);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isPlaying]);

  useEffect(() => {
    if (playingIndex < 0 || !subtitles.length || !playerRef.current || !isReady) return;
    const sub = subtitles[playingIndex];
    const nextSub = subtitles[playingIndex + 1];
    const effectiveEnd = nextSub ? Math.min(sub.endTime, nextSub.startTime) : sub.endTime;
    if (currentTime >= effectiveEnd) {
      if (isLooping) {
        playerRef.current.seekTo(sub.startTime, true);
      } else {
        playerRef.current.pauseVideo();
        setPlayingIndex(-1);
      }
    }
  }, [currentTime, playingIndex, subtitles, isReady, isLooping]);

  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const el = listRef.current.querySelector(`[data-shadow-idx="${activeIndex}"]`) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [activeIndex]);

  const seekTo = useCallback((time: number) => {
    if (playerRef.current && isReady) {
      playerRef.current.seekTo(time, true);
      setCurrentTime(time);
    }
  }, [isReady]);

  const playSentence = useCallback((idx: number) => {
    if (!playerRef.current || !isReady || !subtitles[idx]) return;
    const sub = subtitles[idx];
    playerRef.current.seekTo(sub.startTime, true);
    playerRef.current.playVideo();
    setPlayingIndex(idx);
    setCurrentTime(sub.startTime);
  }, [isReady, subtitles]);

  const pausePlayback = useCallback(() => {
    if (playerRef.current && isReady) {
      playerRef.current.pauseVideo();
    }
    setPlayingIndex(-1);
  }, [isReady]);

  const toggleSentence = useCallback((idx: number) => {
    if (playingIndex === idx && isPlaying) {
      pausePlayback();
    } else {
      playSentence(idx);
    }
  }, [playingIndex, isPlaying, playSentence, pausePlayback]);

  const changeSpeed = useCallback((delta: number) => {
    if (!playerRef.current || !isReady) return;
    const idx = SPEED_OPTIONS.indexOf(playbackRate);
    const newIdx = Math.max(0, Math.min(SPEED_OPTIONS.length - 1, idx + delta));
    const newRate = SPEED_OPTIONS[newIdx];
    playerRef.current.setPlaybackRate(newRate);
    setPlaybackRate(newRate);
  }, [playbackRate, isReady]);

  const goToPrev = useCallback(() => {
    const current = playingIndex >= 0 ? playingIndex : (activeIndex >= 0 ? activeIndex : 0);
    const target = Math.max(0, current - 1);
    playSentence(target);
  }, [playingIndex, activeIndex, playSentence]);

  const goToNext = useCallback(() => {
    const current = playingIndex >= 0 ? playingIndex : (activeIndex >= 0 ? activeIndex : -1);
    const target = Math.min(subtitles.length - 1, current + 1);
    playSentence(target);
  }, [playingIndex, activeIndex, subtitles.length, playSentence]);

  const renderClickableWords = useCallback((text: string, subtitle: SubtitleItem) => {
    const tokens = tokenizeText(text);
    const textIsArabic = isArabic(text);
    return (
      <span
        dir={textIsArabic ? "rtl" : "ltr"}
        className="block break-words"
        style={{
          textAlign: textIsArabic ? "right" : "left",
          fontFamily: textIsArabic ? "'Noto Naskh Arabic', 'Amiri', serif" : "inherit",
          lineHeight: textIsArabic ? "2" : "1.8",
        }}
      >
        {tokens.map((t, i) => (
          <span key={i}>
            {t.prefix && <span>{t.prefix}</span>}
            {t.word && (
              <span
                className="cursor-pointer rounded transition-all duration-150 hover:bg-primary/15 active:bg-primary/25 hover:text-primary px-0.5 hover:underline hover:decoration-primary/40 hover:underline-offset-2"
                onClick={(e) => handleWordClick(t.word, subtitle, e)}
                data-testid={`shadow-word-${t.word.toLowerCase()}-${i}`}
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

  if (!videoId || !subtitles.length) {
    return (
      <div className={`rounded-xl bg-card/50 border border-border/30 p-8 text-center ${className}`}>
        <Headphones className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Shadowing uchun subtitle ma'lumotlari mavjud emas</p>
      </div>
    );
  }

  return (
    <div className={`${className}`}>
      <div className="absolute w-0 h-0 overflow-hidden" aria-hidden="true">
        <div ref={playerContainerRef} />
      </div>

      <div className="md:rounded-lg glass border-y md:border border-border/50 px-2 py-1.5 mb-2" data-testid="shadowing-controls">
        <div className="flex items-center flex-wrap gap-y-1">
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goToPrev} disabled={!isReady} title="Oldingi gap" data-testid="shadow-prev">
              <SkipBack className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant={isLooping ? "default" : "ghost"}
              size="icon"
              className="h-7 w-7"
              onClick={() => setIsLooping(!isLooping)}
              title={isLooping ? "Takrorlash yoqilgan" : "Takrorlash"}
              data-testid="shadow-loop"
            >
              <Repeat className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goToNext} disabled={!isReady} title="Keyingi gap" data-testid="shadow-next">
              <SkipForward className="w-3.5 h-3.5" />
            </Button>
          </div>

          <div className="w-px h-4 bg-border/40 mx-1" />

          <div className="flex items-center">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => changeSpeed(-1)} disabled={playbackRate <= 0.5} data-testid="shadow-speed-down">
              <Minus className="w-2.5 h-2.5" />
            </Button>
            <span className="text-[10px] font-mono w-8 text-center font-medium" data-testid="shadow-speed">{playbackRate}x</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => changeSpeed(1)} disabled={playbackRate >= 2} data-testid="shadow-speed-up">
              <Plus className="w-2.5 h-2.5" />
            </Button>

            <div className="w-px h-4 bg-border/40 mx-1" />

            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setTextZoom(z => Math.max(0.7, +(z - 0.1).toFixed(1)))} disabled={textZoom <= 0.7} data-testid="shadow-zoom-out">
              <ZoomOut className="w-2.5 h-2.5" />
            </Button>
            <span className="text-[8px] font-mono w-6 text-center text-muted-foreground">{Math.round(textZoom * 100)}%</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setTextZoom(z => Math.min(1.6, +(z + 0.1).toFixed(1)))} disabled={textZoom >= 1.6} data-testid="shadow-zoom-in">
              <ZoomIn className="w-2.5 h-2.5" />
            </Button>
          </div>

          <div className="ml-auto flex items-center gap-0.5">
            <div className="flex items-center gap-0 rounded-md glass border border-border/50 p-0.5">
              <Button variant={displayMode === "original" ? "default" : "ghost"} size="sm" className="h-6 text-[9px] md:text-[10px] px-1 md:px-1.5" onClick={() => setDisplayMode("original")} data-testid="shadow-mode-original">
                Asl
              </Button>
              <Button variant={displayMode === "both" ? "default" : "ghost"} size="sm" className="h-6 text-[9px] md:text-[10px] px-1 md:px-1.5" onClick={() => setDisplayMode("both")} data-testid="shadow-mode-both">
                Ikkalasi
              </Button>
              <Button variant={displayMode === "translation" ? "default" : "ghost"} size="sm" className="h-6 text-[9px] md:text-[10px] px-1 md:px-1.5" onClick={() => setDisplayMode("translation")} data-testid="shadow-mode-translation">
                Tarjima
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div ref={listRef} className="space-y-2 pb-4" data-testid="shadowing-sentences">
        {subtitles.map((sub, idx) => {
          const isCurrent = idx === activeIndex && isPlaying;
          const isThisPlaying = idx === playingIndex && isPlaying;
          const translation = sub.translationUz;

          return (
            <div
              key={sub.id}
              data-shadow-idx={idx}
              className={`md:rounded-lg border transition-all duration-200 px-3 md:px-4 py-3 ${
                isCurrent
                  ? "border-primary/40 bg-primary/5 shadow-[0_0_12px_hsl(var(--primary)/0.1)]"
                  : "border-border/20 bg-card/30 hover:bg-card/60 hover:border-border/40"
              }`}
              data-testid={`shadow-sentence-${idx}`}
            >
              <div className="flex items-start gap-3">
                <div className="shrink-0 pt-0.5">
                  <Button
                    variant={isThisPlaying ? "default" : "outline"}
                    size="icon"
                    className={`h-9 w-9 rounded-full transition-all ${
                      isThisPlaying
                        ? "bg-primary text-primary-foreground shadow-[0_0_12px_hsl(var(--primary)/0.3)]"
                        : "border-border/50 hover:border-primary/50 hover:bg-primary/10"
                    }`}
                    onClick={() => toggleSentence(idx)}
                    disabled={!isReady}
                    data-testid={`shadow-play-${idx}`}
                  >
                    {isThisPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                  </Button>
                </div>

                <div className="flex-1 min-w-0 space-y-1" style={{ transform: `scale(${textZoom})`, transformOrigin: "top left" }}>
                  {(displayMode === "original" || displayMode === "both") && (
                    <div className="text-foreground/90" data-testid={`shadow-text-${idx}`}>
                      {renderClickableWords(sub.originalText, sub)}
                    </div>
                  )}
                  {(displayMode === "translation" || displayMode === "both") && translation && (
                    <p
                      className={`text-sm text-muted-foreground leading-relaxed ${displayMode === "translation" ? "" : "mt-1"}`}
                      dir={isArabic(translation) ? "rtl" : "ltr"}
                      style={{ fontFamily: isArabic(translation) ? "'Noto Naskh Arabic', 'Amiri', serif" : "inherit" }}
                      data-testid={`shadow-translation-${idx}`}
                    >
                      {translation}
                    </p>
                  )}
                </div>

                <div className="shrink-0 flex flex-col items-end gap-1">
                  <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono text-muted-foreground/60">
                    {formatTime(sub.startTime)}
                  </Badge>
                  <span className="text-[9px] text-muted-foreground/40">{idx + 1}/{subtitles.length}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selectedWord && (
        <WordInspector
          wordInfo={selectedWord}
          anchorRect={anchorRect}
          onClose={closeInspector}
          isMobile={isMobile}
          readOnly={readOnly}
          targetLanguage={targetLanguage}
        />
      )}
    </div>
  );
}
