import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Subtitles, Languages, MousePointerClick, Lock,
  Monitor, Play, Pause, SkipBack, SkipForward,
  Repeat, RotateCcw, ChevronDown, ChevronUp,
  Minus, Plus, ZoomIn, ZoomOut, Type
} from "lucide-react";
import WordInspector, { type WordInfo } from "./word-inspector";

export interface SubtitleItem {
  id: number;
  sentenceIndex: number;
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

export interface WordMapEntry {
  word: string;
  normalized: string;
  translationUz: string;
  translationAr: string;
  contextualMeaning: string;
}

export interface SentenceWordMap {
  sentenceIndex: number;
  wordMap: WordMapEntry[];
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
  const regex = /([^\p{L}\p{N}'']*)([\p{L}\p{N}'']+)([^\p{L}\p{N}'']*)/gu;
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

interface SubtitlePlayerProps {
  youtubeUrl: string;
  subtitles: SubtitleItem[];
  lessonId?: number;
  vocabulary?: VocabLookup[];
  phrases?: PhraseLookup[];
  sentenceWordMaps?: SentenceWordMap[];
  className?: string;
}

export default function SubtitlePlayer({ youtubeUrl, subtitles, lessonId, vocabulary = [], phrases = [], sentenceWordMaps = [], className = "" }: SubtitlePlayerProps) {
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
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isLooping, setIsLooping] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [subtitleZoom, setSubtitleZoom] = useState(1);

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

    const wmEntry = wordMapLookup.get(subtitle.sentenceIndex)?.get(cleanWord.toLowerCase());
    const vocabEntry = vocabMap.get(cleanWord.toLowerCase());
    const phraseEntry = findPhraseForWord(cleanWord, subtitle.originalText);

    setSelectedWord({
      word: cleanWord,
      normalized: cleanWord.toLowerCase(),
      translationUz: wmEntry?.translationUz || vocabEntry?.translation || "",
      translationAr: wmEntry?.translationAr || vocabEntry?.translationAr || "",
      contextualMeaning: wmEntry?.contextualMeaning || vocabEntry?.example || "",
      partOfSpeech: vocabEntry?.partOfSpeech || "",
      pronunciation: "",
      sourceSentence: subtitle.originalText,
      sourceSentenceUz: subtitle.translationUz || "",
      sourceSentenceAr: subtitle.translationAr || "",
      subtitleTime: subtitle.startTime,
      lessonId: lessonId || 0,
      phraseText: phraseEntry?.phrase,
      phraseTranslationUz: phraseEntry?.translation,
      phraseTranslationAr: phraseEntry?.translationAr,
      phraseExplanation: phraseEntry?.context,
    });
    setAnchorRect(rect);
  }, [vocabMap, wordMapLookup, findPhraseForWord, lessonId, isReady, isPlaying, selectedWord]);

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
      containerDiv.id = `yt-player-${videoId}`;
      playerContainerRef.current.innerHTML = "";
      playerContainerRef.current.appendChild(containerDiv);
      playerRef.current = new window.YT.Player(containerDiv.id, {
        videoId,
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
      }, 200);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isPlaying]);

  useEffect(() => {
    if (!isLooping || activeIndex < 0 || !subtitles.length || !playerRef.current || !isReady) return;
    const sub = subtitles[activeIndex];
    if (currentTime >= sub.endTime - 0.15) {
      playerRef.current.seekTo(sub.startTime, true);
    }
  }, [currentTime, isLooping, activeIndex, subtitles, isReady]);

  useEffect(() => {
    if (panelMode !== "auto" || activeIndex < 0 || !panelRef.current || panelCollapsed) return;
    const el = panelRef.current.querySelector(`[data-subtitle-idx="${activeIndex}"]`) as HTMLElement | null;
    if (el && panelRef.current) {
      const panel = panelRef.current;
      const elTop = el.offsetTop - panel.offsetTop;
      const elHeight = el.offsetHeight;
      const panelHeight = panel.clientHeight;
      const scrollTarget = elTop - (panelHeight / 2) + (elHeight / 2);
      panel.scrollTo({ top: scrollTarget, behavior: "smooth" });
    }
  }, [activeIndex, panelMode, panelCollapsed]);

  const seekTo = useCallback((time: number) => {
    if (playerRef.current && isReady) {
      playerRef.current.seekTo(time, true);
      setCurrentTime(time);
    }
  }, [isReady]);

  const togglePlayPause = useCallback(() => {
    if (!playerRef.current || !isReady) return;
    if (isPlaying) playerRef.current.pauseVideo();
    else playerRef.current.playVideo();
  }, [isPlaying, isReady]);

  const changeSpeed = useCallback((delta: number) => {
    if (!playerRef.current || !isReady) return;
    const idx = SPEED_OPTIONS.indexOf(playbackRate);
    const newIdx = Math.max(0, Math.min(SPEED_OPTIONS.length - 1, idx + delta));
    const newRate = SPEED_OPTIONS[newIdx];
    playerRef.current.setPlaybackRate(newRate);
    setPlaybackRate(newRate);
  }, [playbackRate, isReady]);

  const skipSeconds = useCallback((sec: number) => {
    if (!playerRef.current || !isReady) return;
    const t = Math.max(0, currentTime + sec);
    playerRef.current.seekTo(t, true);
    setCurrentTime(t);
  }, [currentTime, isReady]);

  const goToPrevSubtitle = useCallback(() => {
    if (!subtitles.length) return;
    const target = activeIndex > 0 ? activeIndex - 1 : 0;
    seekTo(subtitles[target].startTime);
  }, [activeIndex, subtitles, seekTo]);

  const goToNextSubtitle = useCallback(() => {
    if (!subtitles.length) return;
    const target = activeIndex < subtitles.length - 1 ? activeIndex + 1 : subtitles.length - 1;
    seekTo(subtitles[target].startTime);
  }, [activeIndex, subtitles, seekTo]);

  const replayCurrentSubtitle = useCallback(() => {
    if (activeIndex >= 0 && subtitles[activeIndex]) {
      seekTo(subtitles[activeIndex].startTime);
    }
  }, [activeIndex, subtitles, seekTo]);

  const getTranslation = useCallback((item: SubtitleItem) => {
    return translationLang === "uz" ? item.translationUz : item.translationAr;
  }, [translationLang]);

  const renderClickableWords = useCallback((text: string, subtitle: SubtitleItem, isOverlay: boolean) => {
    const tokens = tokenizeText(text);
    const textIsArabic = isArabic(text);
    return (
      <span
        dir={textIsArabic ? "rtl" : "ltr"}
        className="block break-words"
        style={{
          textAlign: textIsArabic ? "right" : isOverlay ? "center" : "left",
          fontFamily: textIsArabic ? "'Noto Naskh Arabic', 'Amiri', serif" : "inherit",
          lineHeight: textIsArabic ? "1.8" : "1.6",
        }}
      >
        {tokens.map((t, i) => (
          <span key={i}>
            {t.prefix && <span>{t.prefix}</span>}
            {t.word && (
              <span
                className={`cursor-pointer rounded transition-all duration-150 ${
                  isOverlay
                    ? "hover:bg-cyan-400/20 active:bg-cyan-400/30 hover:text-cyan-100 px-0.5 py-0.5 md:px-1 hover:shadow-[0_0_8px_rgba(0,200,255,0.15)]"
                    : "hover:bg-primary/15 active:bg-primary/25 hover:text-primary px-0.5 hover:underline hover:decoration-primary/40 hover:underline-offset-2"
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

  const renderTranslationText = useCallback((text: string, isOverlayCtx: boolean) => {
    const textIsArabic = isArabic(text);
    return (
      <span
        dir={textIsArabic ? "rtl" : "ltr"}
        className="block break-words"
        style={{
          textAlign: textIsArabic ? "right" : isOverlayCtx ? "center" : "left",
          fontFamily: textIsArabic ? "'Noto Naskh Arabic', 'Amiri', serif" : "inherit",
          lineHeight: textIsArabic ? "1.8" : "1.5",
        }}
      >
        {text}
      </span>
    );
  }, []);

  const renderOverlayText = useCallback((item: SubtitleItem) => {
    const translation = getTranslation(item);

    if (displayMode === "original") {
      return (
        <div className="pointer-events-auto" data-testid="text-subtitle-overlay-original">
          <div className="text-sm md:text-base lg:text-lg font-medium leading-relaxed text-white">
            {renderClickableWords(item.originalText, item, true)}
          </div>
        </div>
      );
    }
    if (displayMode === "translation") {
      return (
        <div data-testid="text-subtitle-overlay-translation">
          <div className="text-sm md:text-base lg:text-lg font-medium leading-relaxed text-white">
            {translation ? renderTranslationText(translation, true) : renderClickableWords(item.originalText, item, true)}
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-1.5 pointer-events-auto">
        <div className="text-sm md:text-base lg:text-lg font-semibold leading-relaxed text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" data-testid="text-subtitle-overlay-original">
          {renderClickableWords(item.originalText, item, true)}
        </div>
        {translation && (
          <div className="text-xs md:text-sm lg:text-base leading-relaxed text-cyan-200/90 drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]" data-testid="text-subtitle-overlay-translation">
            {renderTranslationText(translation, true)}
          </div>
        )}
      </div>
    );
  }, [displayMode, getTranslation, renderClickableWords, renderTranslationText]);

  if (!videoId) {
    return (
      <div className={`rounded-xl overflow-hidden bg-black/50 aspect-video flex items-center justify-center ${className}`}>
        <p className="text-muted-foreground text-sm">Video mavjud emas</p>
      </div>
    );
  }

  const hasSubtitles = subtitles.length > 0;

  return (
    <div className={`${className}`}>
      <div className="sticky top-0 z-20 bg-background pb-2 md:pb-3 space-y-2 md:space-y-3">
        <div className="relative rounded-xl overflow-hidden bg-black shadow-2xl shadow-black/50">
          <div className="relative aspect-video">
            <div ref={playerContainerRef} className="absolute inset-0 z-0" />
            {activeSubtitle && (
              <div className="absolute bottom-3 md:bottom-4 left-0 right-0 z-10 flex justify-center px-1" data-testid="subtitle-overlay">
                <div
                  className="px-5 md:px-6 py-2 md:py-2.5 rounded-xl bg-gradient-to-br from-black/80 to-black/70 backdrop-blur-xl border border-cyan-400/20 shadow-[0_4px_24px_rgba(0,0,0,0.5),0_0_12px_rgba(0,200,255,0.08)]"
                  style={{ fontSize: `${subtitleZoom * 100}%` }}
                >
                  {renderOverlayText(activeSubtitle)}
                </div>
              </div>
            )}
          </div>
        </div>

        {hasSubtitles && (
        <div className="flex items-center gap-1 md:gap-1.5 rounded-xl glass border border-border/50 p-1 md:p-1.5 overflow-x-auto" data-testid="learning-controls">
          <Button
            variant="ghost" size="icon"
            className="h-8 w-8 md:h-9 md:w-9 shrink-0"
            onClick={togglePlayPause}
            disabled={!isReady}
            title={isPlaying ? "Pauza" : "Ijro etish"}
            data-testid="button-play-pause"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </Button>

          <div className="w-px h-5 bg-border/50 shrink-0 hidden sm:block" />

          <Button
            variant="ghost" size="icon"
            className="h-8 w-8 md:h-9 md:w-9 shrink-0"
            onClick={() => skipSeconds(-5)}
            disabled={!isReady}
            title="5 soniya orqaga"
            data-testid="button-back-5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>

          <Button
            variant="ghost" size="icon"
            className="h-8 w-8 md:h-9 md:w-9 shrink-0"
            onClick={goToPrevSubtitle}
            disabled={!isReady || !hasSubtitles}
            title="Oldingi subtitle"
            data-testid="button-prev-subtitle"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </Button>

          <Button
            variant="ghost" size="icon"
            className="h-8 w-8 md:h-9 md:w-9 shrink-0"
            onClick={replayCurrentSubtitle}
            disabled={!isReady || activeIndex < 0}
            title="Qayta eshitish"
            data-testid="button-replay"
          >
            <Repeat className="w-3.5 h-3.5" />
          </Button>

          <Button
            variant="ghost" size="icon"
            className="h-8 w-8 md:h-9 md:w-9 shrink-0"
            onClick={goToNextSubtitle}
            disabled={!isReady || !hasSubtitles}
            title="Keyingi subtitle"
            data-testid="button-next-subtitle"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </Button>

          <Button
            variant="ghost" size="icon"
            className="h-8 w-8 md:h-9 md:w-9 shrink-0"
            onClick={() => skipSeconds(5)}
            disabled={!isReady}
            title="5 soniya oldinga"
            data-testid="button-forward-5"
          >
            <RotateCcw className="w-3.5 h-3.5 scale-x-[-1]" />
          </Button>

          <div className="w-px h-5 bg-border/50 shrink-0 hidden sm:block" />

          <Button
            variant={isLooping ? "default" : "ghost"}
            size="sm"
            className="h-8 md:h-9 text-[10px] md:text-xs px-2 shrink-0"
            onClick={() => setIsLooping(!isLooping)}
            title="Hozirgi gapni takrorlash"
            data-testid="button-loop"
          >
            <Repeat className="w-3 h-3 mr-1" />
            <span className="hidden sm:inline">Takror</span>
          </Button>

          <div className="w-px h-5 bg-border/50 shrink-0 hidden sm:block" />

          <div className="flex items-center gap-0.5 shrink-0">
            <Button
              variant="ghost" size="icon"
              className="h-7 w-7"
              onClick={() => changeSpeed(-1)}
              disabled={playbackRate <= 0.5}
              title="Sekinroq"
              data-testid="button-speed-down"
            >
              <Minus className="w-3 h-3" />
            </Button>
            <span className="text-[10px] md:text-xs font-mono min-w-[2.5rem] text-center font-medium" data-testid="text-speed">
              {playbackRate}x
            </span>
            <Button
              variant="ghost" size="icon"
              className="h-7 w-7"
              onClick={() => changeSpeed(1)}
              disabled={playbackRate >= 2}
              title="Tezroq"
              data-testid="button-speed-up"
            >
              <Plus className="w-3 h-3" />
            </Button>
          </div>

          <div className="w-px h-5 bg-border/50 shrink-0 hidden sm:block" />

          <div className="flex items-center gap-0.5 shrink-0">
            <Button
              variant="ghost" size="icon"
              className="h-7 w-7"
              onClick={() => setSubtitleZoom(z => Math.max(0.7, +(z - 0.1).toFixed(1)))}
              disabled={subtitleZoom <= 0.7}
              title="Kichikroq"
              data-testid="button-zoom-out"
            >
              <ZoomOut className="w-3 h-3" />
            </Button>
            <span className="text-[9px] md:text-[10px] font-mono min-w-[1.8rem] text-center text-muted-foreground" data-testid="text-zoom">
              {Math.round(subtitleZoom * 100)}%
            </span>
            <Button
              variant="ghost" size="icon"
              className="h-7 w-7"
              onClick={() => setSubtitleZoom(z => Math.min(1.6, +(z + 0.1).toFixed(1)))}
              disabled={subtitleZoom >= 1.6}
              title="Kattaroq"
              data-testid="button-zoom-in"
            >
              <ZoomIn className="w-3 h-3" />
            </Button>
          </div>

          <div className="flex-1" />

          <span className="text-[10px] md:text-xs font-mono text-muted-foreground shrink-0 hidden sm:block" data-testid="text-current-time">
            {formatTime(currentTime)}
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
        <div className="flex items-center gap-0.5 md:gap-1 rounded-lg glass border border-border/50 p-0.5 md:p-1">
          <Button
            variant={displayMode === "original" ? "default" : "ghost"}
            size="sm"
            className="h-7 text-[10px] md:text-xs px-1.5 md:px-3"
            onClick={() => setDisplayMode("original")}
            data-testid="button-mode-original"
          >
            <Monitor className="w-3 h-3 mr-0.5 md:mr-1 hidden sm:block" />
            Asl matn
          </Button>
          <Button
            variant={displayMode === "both" ? "default" : "ghost"}
            size="sm"
            className="h-7 text-[10px] md:text-xs px-1.5 md:px-3"
            onClick={() => setDisplayMode("both")}
            data-testid="button-mode-both"
          >
            <Subtitles className="w-3 h-3 mr-0.5 md:mr-1 hidden sm:block" />
            Asl + tarjima
          </Button>
          <Button
            variant={displayMode === "translation" ? "default" : "ghost"}
            size="sm"
            className="h-7 text-[10px] md:text-xs px-1.5 md:px-3"
            onClick={() => setDisplayMode("translation")}
            data-testid="button-mode-translation"
          >
            <Languages className="w-3 h-3 mr-0.5 md:mr-1 hidden sm:block" />
            Tarjima
          </Button>
        </div>

        <div className="flex items-center gap-0.5 md:gap-1 rounded-lg glass border border-border/50 p-0.5 md:p-1">
          <Button
            variant={translationLang === "uz" ? "default" : "ghost"}
            size="sm"
            className="h-7 text-[10px] md:text-xs px-1.5 md:px-3"
            onClick={() => setTranslationLang("uz")}
            data-testid="button-lang-uz"
          >
            O'zbekcha
          </Button>
          <Button
            variant={translationLang === "ar" ? "default" : "ghost"}
            size="sm"
            className="h-7 text-[10px] md:text-xs px-1.5 md:px-3"
            onClick={() => setTranslationLang("ar")}
            data-testid="button-lang-ar"
          >
            Arabcha
          </Button>
        </div>

        <div className="flex items-center gap-0.5 md:gap-1 rounded-lg glass border border-border/50 p-0.5 md:p-1 ml-auto">
          <Button
            variant={panelMode === "auto" ? "default" : "ghost"}
            size="sm"
            className="h-7 text-[10px] md:text-xs px-1.5 md:px-3"
            onClick={() => setPanelMode("auto")}
            data-testid="button-panel-auto"
          >
            <MousePointerClick className="w-3 h-3 mr-0.5 md:mr-1 hidden sm:block" />
            Auto
          </Button>
          <Button
            variant={panelMode === "fixed" ? "default" : "ghost"}
            size="sm"
            className="h-7 text-[10px] md:text-xs px-1.5 md:px-3"
            onClick={() => setPanelMode("fixed")}
            data-testid="button-panel-fixed"
          >
            <Lock className="w-3 h-3 mr-0.5 md:mr-1 hidden sm:block" />
            Joyida
          </Button>
        </div>
      </div>
      </div>

      {hasSubtitles && (
        <div
          className="rounded-xl glass border border-border/50 overflow-hidden transition-all duration-300 mt-2 md:mt-3"
          data-testid="subtitle-panel"
        >
          <button
            className="w-full flex items-center justify-between px-3 md:px-4 py-2 border-b border-border/30 hover:bg-white/5 transition-colors cursor-pointer"
            onClick={() => setPanelCollapsed(!panelCollapsed)}
            data-testid="button-toggle-panel"
          >
            <div className="flex items-center gap-2">
              <Subtitles className="w-4 h-4 text-primary" />
              <span className="text-xs md:text-sm font-medium">Subtitle paneli</span>
              {activeIndex >= 0 && (
                <Badge variant="outline" className="text-[9px] md:text-[10px] border-primary/30 text-primary">
                  {activeIndex + 1}/{subtitles.length}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[9px] md:text-[10px]">
                {subtitles.length} qator
              </Badge>
              {panelCollapsed ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />}
            </div>
          </button>

          {!panelCollapsed && (
            <div
              ref={panelRef}
              className="max-h-[200px] md:max-h-[320px] overflow-y-auto scroll-smooth"
            >
              <div className="p-1.5 md:p-2 divide-y divide-border/20">
                {subtitles.map((item, idx) => {
                  const isActive = idx === activeIndex;
                  const translation = getTranslation(item);
                  const originalIsArabic = isArabic(item.originalText);
                  const translationIsArabic = translationLang === "ar" || (translation ? isArabic(translation) : false);

                  return (
                    <div
                      key={item.id}
                      data-subtitle-idx={idx}
                      className={`w-full rounded-lg px-2.5 md:px-3 py-2 md:py-2.5 transition-all duration-200 group
                        ${isActive
                          ? "bg-primary/10 border border-primary/30 shadow-sm shadow-primary/5 ring-1 ring-primary/20"
                          : "hover:bg-white/5 border border-transparent"
                        }
                        ${idx > 0 && !isActive ? "mt-0.5" : ""}`}
                      data-testid={`button-subtitle-line-${idx}`}
                    >
                      <div className="flex items-start gap-1.5 md:gap-2">
                        <span
                          className={`text-[9px] md:text-[10px] font-mono mt-0.5 md:mt-1 shrink-0 w-8 md:w-10 transition-colors cursor-pointer ${
                            isActive ? "text-primary font-bold" : "text-muted-foreground group-hover:text-foreground/70"
                          }`}
                          onClick={() => seekTo(item.startTime)}
                        >
                          {formatTime(item.startTime)}
                        </span>
                        <div className="flex-1 min-w-0">
                          {(displayMode === "original" || displayMode === "both") && (
                            <div className={`text-xs md:text-sm leading-relaxed transition-colors ${
                              isActive ? "text-foreground font-medium" : "text-foreground/70"
                            }`}>
                              {isActive ? (
                                renderClickableWords(item.originalText, item, false)
                              ) : (
                                <p
                                  className="cursor-pointer break-words"
                                  dir={originalIsArabic ? "rtl" : "ltr"}
                                  style={{
                                    textAlign: originalIsArabic ? "right" : "left",
                                    fontFamily: originalIsArabic ? "'Noto Naskh Arabic', 'Amiri', serif" : "inherit",
                                    lineHeight: originalIsArabic ? "1.8" : "1.6",
                                  }}
                                  onClick={() => seekTo(item.startTime)}
                                >
                                  {item.originalText}
                                </p>
                              )}
                            </div>
                          )}
                          {(displayMode === "translation" || displayMode === "both") && translation && (
                            <div
                              className={`text-[11px] md:text-xs leading-relaxed transition-colors cursor-pointer break-words ${
                                displayMode === "both" ? "mt-0.5" : ""
                              } ${isActive ? "text-primary/80" : "text-muted-foreground"}`}
                              onClick={() => seekTo(item.startTime)}
                            >
                              {renderTranslationText(translation, false)}
                            </div>
                          )}
                          {displayMode === "translation" && !translation && (
                            <p
                              className={`text-xs md:text-sm leading-relaxed cursor-pointer break-words ${
                                isActive ? "text-foreground font-medium" : "text-foreground/70"
                              }`}
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
          )}
        </div>
      )}

      {!hasSubtitles && (
        <div className="rounded-xl glass border border-border/50 p-6 text-center mt-2 md:mt-3" data-testid="no-subtitles">
          <Subtitles className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Subtitle ma'lumotlari mavjud emas</p>
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
