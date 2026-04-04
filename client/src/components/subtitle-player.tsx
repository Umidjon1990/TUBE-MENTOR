import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Subtitles, Languages,
  Monitor, Play, Pause, SkipBack, SkipForward,
  Repeat, RotateCcw, ChevronDown, ChevronUp,
  Minus, Plus, ZoomIn, ZoomOut, Type
} from "lucide-react";
import WordInspector, { type WordInfo } from "./word-inspector";

export interface SubtitleItem {
  id: number;
  sentenceIndex: number;
  sentenceIndices: number[];
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
  example?: string;
  difficulty?: string;
}

export interface WordMapEntry {
  word: string;
  normalized: string;
  translationUz: string;
  translationAr: string;
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

export interface WordTimestampItem {
  word: string;
  start: number;
  end: number;
}

export function parseWordTimestamps(json: unknown): WordTimestampItem[] {
  if (!Array.isArray(json)) return [];
  return json.filter(
    (item): item is WordTimestampItem =>
      typeof item === "object" && item !== null &&
      typeof item.word === "string" &&
      typeof item.start === "number" &&
      typeof item.end === "number"
  );
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

interface SubtitlePlayerProps {
  youtubeUrl: string;
  subtitles: SubtitleItem[];
  lessonId?: number;
  vocabulary?: VocabLookup[];
  sentenceWordMaps?: SentenceWordMap[];
  wordTimestamps?: WordTimestampItem[];
  className?: string;
  initialSeekTime?: number;
  seekNonce?: number;
  readOnly?: boolean;
  targetLanguage?: string;
}

export default function SubtitlePlayer({ youtubeUrl, subtitles, lessonId, vocabulary = [], sentenceWordMaps = [], wordTimestamps = [], className = "", initialSeekTime, seekNonce, readOnly = false, targetLanguage = "ar" }: SubtitlePlayerProps) {
  const videoId = useMemo(() => extractVideoId(youtubeUrl), [youtubeUrl]);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const wordPlaybackEndRef = useRef<number | null>(null);

  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("both");
  const translationLang: TranslationLang = "uz";
  const panelMode: PanelMode = "auto";
  const [selectedWord, setSelectedWord] = useState<WordInfo | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isLooping, setIsLooping] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(() => window.innerWidth < 768);
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
    for (let i = subtitles.length - 1; i >= 0; i--) {
      if (currentTime >= subtitles[i].endTime) {
        const nextStart = i + 1 < subtitles.length ? subtitles[i + 1].startTime : Infinity;
        if (currentTime < nextStart) return i;
        break;
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

  const wordMapLookup = useMemo(() => {
    const m = new Map<number, Map<string, WordMapEntry>>();
    for (const swm of sentenceWordMaps) {
      const inner = new Map<string, WordMapEntry>();
      for (const wm of swm.wordMap) {
        inner.set(wm.normalized, wm);
        const wordLower = wm.word.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "").toLowerCase();
        if (wordLower !== wm.normalized) {
          inner.set(wordLower, wm);
        }
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

  const findWordTiming = useCallback((word: string, subtitleStartTime: number): { start: number; end: number } | null => {
    if (!wordTimestamps.length) return null;
    const cleanWord = word.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "").toLowerCase();
    if (!cleanWord) return null;
    const candidates = wordTimestamps.filter(wt => {
      const wtClean = wt.word.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "").toLowerCase();
      return wtClean === cleanWord || wtClean.includes(cleanWord) || cleanWord.includes(wtClean);
    });
    if (!candidates.length) return null;
    let best = candidates[0];
    let bestDist = Math.abs(best.start - subtitleStartTime);
    for (let i = 1; i < candidates.length; i++) {
      const dist = Math.abs(candidates[i].start - subtitleStartTime);
      if (dist < bestDist) { best = candidates[i]; bestDist = dist; }
    }
    return { start: best.start, end: best.end };
  }, [wordTimestamps]);

  const playWordAudio = useCallback((word: string, subtitleStartTime: number) => {
    if (!playerRef.current || !isReady) return;
    const timing = findWordTiming(word, subtitleStartTime);
    if (!timing) return;
    wordPlaybackEndRef.current = timing.end + 0.3;
    playerRef.current.seekTo(timing.start, true);
    playerRef.current.playVideo();
  }, [isReady, findWordTiming]);

  const handleWordClick = useCallback((word: string, subtitle: SubtitleItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const cleanWord = word.replace(/[^\p{L}\p{N}]/gu, "");
    if (!cleanWord) return;

    if (!selectedWord) {
      wasPlayingRef.current = isPlaying;
    }

    playWordAudio(cleanWord, subtitle.startTime);

    const normalizedWord = normalizeArabic(cleanWord).toLowerCase();
    const plainWord = cleanWord.toLowerCase();
    let wmEntry: WordMapEntry | undefined;
    let matchedSentenceIndex = -1;
    for (const si of subtitle.sentenceIndices) {
      wmEntry = wordMapLookup.get(si)?.get(normalizedWord) || wordMapLookup.get(si)?.get(plainWord);
      if (wmEntry) { matchedSentenceIndex = si; break; }
    }
    if (!wmEntry) {
      for (const [si, innerMap] of wordMapLookup) {
        wmEntry = innerMap.get(normalizedWord) || innerMap.get(plainWord);
        if (wmEntry) { matchedSentenceIndex = si; break; }
      }
    }
    const vocabEntry = vocabMap.get(normalizedWord) || vocabMap.get(plainWord);

    const transAr = wmEntry?.translationAr || vocabEntry?.translationAr || "";

    const hasWordTiming = !!findWordTiming(cleanWord, subtitle.startTime);

    setSelectedWord({
      word: cleanWord,
      normalized: cleanWord.toLowerCase(),
      translationUz: wmEntry?.translationUz || vocabEntry?.translation || "",
      translationAr: transAr,
      pronunciation: "",
      sourceSentence: subtitle.originalText,
      sourceSentenceUz: subtitle.translationUz || "",
      sourceSentenceAr: subtitle.translationAr || "",
      subtitleTime: subtitle.startTime,
      lessonId: lessonId || 0,
      hasAudio: hasWordTiming,
    });
    setAnchorRect(rect);
  }, [vocabMap, wordMapLookup, lessonId, isReady, isPlaying, selectedWord, normalizeArabic, playWordAudio, findWordTiming]);

  const closeInspector = useCallback(() => {
    setSelectedWord(null);
    setAnchorRect(null);
    wordPlaybackEndRef.current = null;
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
        width: "100%",
        height: "100%",
        playerVars: { autoplay: 0, modestbranding: 1, rel: 0, cc_load_policy: 0, iv_load_policy: 3, playsinline: 1 },
        events: {
          onReady: () => {
            setIsReady(true);
            if (initialSeekTime && initialSeekTime > 0) {
              playerRef.current?.seekTo(initialSeekTime, true);
              playerRef.current?.playVideo();
            }
          },
          onStateChange: (event: any) => {
            setIsPlaying(event.data === window.YT.PlayerState.PLAYING);
            if (event.data === window.YT.PlayerState.PAUSED || event.data === window.YT.PlayerState.ENDED) {
              wordPlaybackEndRef.current = null;
            }
          },
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
    if (initialSeekTime != null && initialSeekTime >= 0 && isReady && playerRef.current) {
      playerRef.current.seekTo(initialSeekTime, true);
      playerRef.current.playVideo();
    }
  }, [initialSeekTime, seekNonce, isReady]);

  useEffect(() => {
    if (isPlaying && playerRef.current) {
      timerRef.current = setInterval(() => {
        try {
          const t = playerRef.current.getCurrentTime();
          if (typeof t === "number") {
            setCurrentTime(t);
            if (wordPlaybackEndRef.current !== null && t >= wordPlaybackEndRef.current) {
              playerRef.current.pauseVideo();
              wordPlaybackEndRef.current = null;
            }
          }
        } catch {}
      }, 150);
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
    wordPlaybackEndRef.current = null;
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

  const subtitleWordTimings = useMemo(() => {
    if (!subtitles.length) return new Map<number, { start: number; end: number }[]>();
    const map = new Map<number, { start: number; end: number }[]>();
    for (const sub of subtitles) {
      const subWords = wordTimestamps.length > 0
        ? wordTimestamps.filter(wt => wt.start >= sub.startTime - 0.15 && wt.end <= sub.endTime + 0.5)
        : [];
      if (subWords.length > 0) {
        map.set(sub.id, subWords.map(w => ({ start: w.start, end: w.end })));
      } else {
        const tokens = tokenizeText(sub.originalText).filter(t => t.word);
        const duration = sub.endTime - sub.startTime;
        const wordDur = tokens.length > 0 ? duration / tokens.length : duration;
        const timings: { start: number; end: number }[] = [];
        for (let i = 0; i < tokens.length; i++) {
          timings.push({ start: sub.startTime + i * wordDur, end: sub.startTime + (i + 1) * wordDur });
        }
        map.set(sub.id, timings);
      }
    }
    return map;
  }, [wordTimestamps, subtitles]);

  const getWordKaraokeState = useCallback((subtitle: SubtitleItem, wordIndex: number): "past" | "active" | "future" | null => {
    const timings = subtitleWordTimings.get(subtitle.id);
    if (!timings || !timings.length) return null;
    const wt = timings[wordIndex];
    if (!wt) return null;
    if (currentTime >= wt.end) return "past";
    if (currentTime >= wt.start) return "active";
    return "future";
  }, [subtitleWordTimings, currentTime]);

  const renderClickableWords = useCallback((text: string, subtitle: SubtitleItem, isOverlay: boolean) => {
    const tokens = tokenizeText(text);
    const textIsArabic = isArabic(text);
    const isActive = activeIndex >= 0 && subtitles[activeIndex]?.id === subtitle.id;
    const hasKaraoke = isActive && subtitleWordTimings.has(subtitle.id);
    let wordCounter = 0;

    return (
      <span
        dir={textIsArabic ? "rtl" : "ltr"}
        className="block break-words"
        style={{
          textAlign: isOverlay ? "center" : textIsArabic ? "right" : "left",
          fontFamily: textIsArabic ? "'Noto Naskh Arabic', 'Amiri', serif" : "inherit",
          lineHeight: textIsArabic ? "1.8" : "1.6",
        }}
      >
        {tokens.map((t, i) => {
          const wi = t.word ? wordCounter++ : -1;
          const karaokeState = hasKaraoke && t.word ? getWordKaraokeState(subtitle, wi) : null;

          let karaokeClass = "";
          if (karaokeState === "active") {
            karaokeClass = isOverlay
              ? "text-cyan-300 bg-cyan-400/30 shadow-[0_0_12px_rgba(0,255,255,0.4)] scale-105"
              : "text-primary bg-primary/20 shadow-[0_0_8px_hsl(var(--primary)/0.3)] scale-105";
          } else if (karaokeState === "past") {
            karaokeClass = isOverlay
              ? "text-white/50"
              : "text-foreground/40";
          }

          return (
            <span key={i}>
              {t.prefix && <span>{t.prefix}</span>}
              {t.word && (
                <span
                  className={`cursor-pointer rounded transition-all duration-100 ${karaokeClass} ${
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
          );
        })}
      </span>
    );
  }, [handleWordClick, subtitleWordTimings, activeIndex, subtitles, currentTime, getWordKaraokeState]);

  const renderTranslationText = useCallback((text: string, isOverlayCtx: boolean) => {
    const textIsArabic = isArabic(text);
    return (
      <span
        dir={textIsArabic ? "rtl" : "ltr"}
        className="block break-words"
        style={{
          textAlign: isOverlayCtx ? "center" : textIsArabic ? "right" : "left",
          fontFamily: textIsArabic ? "'Noto Naskh Arabic', 'Amiri', serif" : "inherit",
          lineHeight: textIsArabic ? "1.8" : "1.5",
        }}
      >
        {text}
      </span>
    );
  }, []);

  const getAdaptiveFontSize = useCallback((text: string, isTranslation?: boolean) => {
    const len = text.length;
    const textHasArabic = isArabic(text);
    if (isTranslation) {
      if (textHasArabic) {
        if (len > 120) return "clamp(13px, 2.2vw, 16px)";
        if (len > 80) return "clamp(14px, 2.5vw, 18px)";
        if (len > 50) return "clamp(15px, 2.8vw, 19px)";
        return "clamp(16px, 3vw, 21px)";
      }
      if (len > 120) return "clamp(11px, 2vw, 14px)";
      if (len > 80) return "clamp(12px, 2.2vw, 15px)";
      if (len > 50) return "clamp(13px, 2.5vw, 16px)";
      return "clamp(13px, 2.8vw, 17px)";
    }
    if (textHasArabic) {
      if (len > 120) return "clamp(14px, 2.5vw, 18px)";
      if (len > 80) return "clamp(16px, 3vw, 20px)";
      if (len > 50) return "clamp(18px, 3.5vw, 23px)";
      if (len > 30) return "clamp(19px, 3.8vw, 25px)";
      return "clamp(21px, 4vw, 27px)";
    }
    if (len > 120) return "clamp(13px, 2.2vw, 16px)";
    if (len > 80) return "clamp(14px, 2.5vw, 18px)";
    if (len > 50) return "clamp(15px, 3vw, 20px)";
    if (len > 30) return "clamp(16px, 3.2vw, 22px)";
    return "clamp(17px, 3.5vw, 24px)";
  }, []);

  const renderOverlayText = useCallback((item: SubtitleItem) => {
    const translation = getTranslation(item);
    const originalFontSize = getAdaptiveFontSize(item.originalText);
    const translationFontSize = translation ? getAdaptiveFontSize(translation, true) : undefined;

    if (displayMode === "original") {
      return (
        <div className="pointer-events-auto text-center" data-testid="text-subtitle-overlay-original">
          <div className="font-medium leading-relaxed text-white break-words" dir="auto" style={{ fontSize: originalFontSize }}>
            {renderClickableWords(item.originalText, item, true)}
          </div>
        </div>
      );
    }
    if (displayMode === "translation") {
      return (
        <div className="text-center" data-testid="text-subtitle-overlay-translation">
          <div className="font-medium leading-relaxed text-white break-words" dir="auto" style={{ fontSize: translation ? translationFontSize : originalFontSize }}>
            {translation ? renderTranslationText(translation, true) : renderClickableWords(item.originalText, item, true)}
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-1.5 pointer-events-auto text-center">
        <div className="font-semibold leading-relaxed text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] break-words" dir="auto" data-testid="text-subtitle-overlay-original" style={{ fontSize: originalFontSize }}>
          {renderClickableWords(item.originalText, item, true)}
        </div>
        {translation && (
          <div className="leading-relaxed text-cyan-200/90 drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)] break-words" dir="auto" data-testid="text-subtitle-overlay-translation" style={{ fontSize: translationFontSize }}>
            {renderTranslationText(translation, true)}
          </div>
        )}
      </div>
    );
  }, [displayMode, getTranslation, getAdaptiveFontSize, renderClickableWords, renderTranslationText]);

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
      <div className="sticky top-0 z-20 bg-background pb-0 md:pb-1 space-y-0 md:space-y-1">
        <div className="relative overflow-hidden bg-black">
          <div className="relative aspect-video">
            <div ref={playerContainerRef} className="absolute inset-0 z-0" />
          </div>
        </div>

        {activeSubtitle && (
          <div className="bg-black/95 px-3 md:px-6 py-2 md:py-3" data-testid="subtitle-overlay">
            <div
              className="max-w-full"
              style={{ transform: `scale(${subtitleZoom})`, transformOrigin: "center top" }}
            >
              {renderOverlayText(activeSubtitle)}
            </div>
          </div>
        )}

        {hasSubtitles && (
        <div className="md:rounded-lg glass border-y md:border border-border/50 px-1 py-0.5" data-testid="learning-controls">
          <div className="flex items-center flex-wrap gap-y-0.5">
            <div className="flex items-center">
              <Button
                variant="ghost" size="icon"
                className="h-7 w-7"
                onClick={togglePlayPause}
                disabled={!isReady}
                title={isPlaying ? "Pauza" : "Ijro etish"}
                data-testid="button-play-pause"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </Button>
              <Button
                variant="ghost" size="icon"
                className="h-7 w-7"
                onClick={goToPrevSubtitle}
                disabled={!isReady || !hasSubtitles}
                title="Oldingi subtitle"
                data-testid="button-prev-subtitle"
              >
                <SkipBack className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost" size="icon"
                className="h-7 w-7"
                onClick={replayCurrentSubtitle}
                disabled={!isReady || activeIndex < 0}
                title="Qayta eshitish"
                data-testid="button-replay"
              >
                <Repeat className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost" size="icon"
                className="h-7 w-7"
                onClick={goToNextSubtitle}
                disabled={!isReady || !hasSubtitles}
                title="Keyingi subtitle"
                data-testid="button-next-subtitle"
              >
                <SkipForward className="w-3 h-3" />
              </Button>
              <Button
                variant={isLooping ? "default" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => setIsLooping(!isLooping)}
                title="Takrorlash"
                data-testid="button-loop"
              >
                <Repeat className="w-3 h-3" />
              </Button>
            </div>

            <div className="w-px h-4 bg-border/40 mx-0.5" />

            <div className="flex items-center">
              <Button
                variant="ghost" size="icon"
                className="h-6 w-6"
                onClick={() => changeSpeed(-1)}
                disabled={playbackRate <= 0.5}
                title="Sekinroq"
                data-testid="button-speed-down"
              >
                <Minus className="w-2.5 h-2.5" />
              </Button>
              <span className="text-[9px] font-mono w-[1.5rem] text-center font-medium" data-testid="text-speed">
                {playbackRate}x
              </span>
              <Button
                variant="ghost" size="icon"
                className="h-6 w-6"
                onClick={() => changeSpeed(1)}
                disabled={playbackRate >= 2}
                title="Tezroq"
                data-testid="button-speed-up"
              >
                <Plus className="w-2.5 h-2.5" />
              </Button>
              <div className="w-px h-4 bg-border/40 mx-0.5" />
              <Button
                variant="ghost" size="icon"
                className="h-6 w-6"
                onClick={() => setSubtitleZoom(z => Math.max(0.7, +(z - 0.1).toFixed(1)))}
                disabled={subtitleZoom <= 0.7}
                title="Matn kichikroq"
                data-testid="button-zoom-out"
              >
                <ZoomOut className="w-2.5 h-2.5" />
              </Button>
              <span className="text-[8px] font-mono w-[1.4rem] text-center text-muted-foreground" data-testid="text-zoom">
                {Math.round(subtitleZoom * 100)}%
              </span>
              <Button
                variant="ghost" size="icon"
                className="h-6 w-6"
                onClick={() => setSubtitleZoom(z => Math.min(1.6, +(z + 0.1).toFixed(1)))}
                disabled={subtitleZoom >= 1.6}
                title="Matn kattaroq"
                data-testid="button-zoom-in"
              >
                <ZoomIn className="w-2.5 h-2.5" />
              </Button>
            </div>

            <div className="ml-auto flex items-center gap-0.5">
              <div className="flex items-center gap-0 rounded-md glass border border-border/50 p-0.5">
                <Button
                  variant={displayMode === "original" ? "default" : "ghost"}
                  size="sm"
                  className="h-6 text-[9px] md:text-[10px] px-1 md:px-1.5"
                  onClick={() => setDisplayMode("original")}
                  data-testid="button-mode-original"
                >
                  Asl
                </Button>
                <Button
                  variant={displayMode === "both" ? "default" : "ghost"}
                  size="sm"
                  className="h-6 text-[9px] md:text-[10px] px-1 md:px-1.5"
                  onClick={() => setDisplayMode("both")}
                  data-testid="button-mode-both"
                >
                  Ikkalasi
                </Button>
                <Button
                  variant={displayMode === "translation" ? "default" : "ghost"}
                  size="sm"
                  className="h-6 text-[9px] md:text-[10px] px-1 md:px-1.5"
                  onClick={() => setDisplayMode("translation")}
                  data-testid="button-mode-translation"
                >
                  Tarjima
                </Button>
              </div>
              <span className="text-[9px] font-mono text-muted-foreground hidden md:block" data-testid="text-current-time">
                {formatTime(currentTime)}
              </span>
            </div>
          </div>
        </div>
      )}
      </div>

      {hasSubtitles && (
        <div
          className="md:rounded-lg glass border-y md:border border-border/50 overflow-hidden transition-all duration-300 mt-1"
          data-testid="subtitle-panel"
        >
          <div
            className="flex items-center justify-between px-2 md:px-3 py-1 border-b border-border/30 hover:bg-white/5 transition-colors cursor-pointer"
            onClick={() => setPanelCollapsed(!panelCollapsed)}
            data-testid="button-toggle-panel"
          >
            <div className="flex items-center gap-1.5">
              <Subtitles className="w-3.5 h-3.5 text-primary" />
              <span className="text-[10px] md:text-xs font-medium">Subtitlelar</span>
              {activeIndex >= 0 && (
                <span className="text-[9px] text-primary font-mono">
                  {activeIndex + 1}/{subtitles.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {panelCollapsed ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronUp className="w-3 h-3 text-muted-foreground" />}
            </div>
          </div>

          {!panelCollapsed && (
            <div
              ref={panelRef}
              className="max-h-[50vh] md:max-h-[60vh] overflow-y-auto scroll-smooth"
              style={{ fontSize: `${14 * subtitleZoom}px` }}
            >
              <div className="p-1.5 md:p-2 divide-y divide-border/20">
                {subtitles.map((item, idx) => {
                  const isActive = idx === activeIndex;
                  const translation = getTranslation(item);
                  const originalIsArabic = isArabic(item.originalText);

                  return (
                    <div
                      key={item.id}
                      data-subtitle-idx={idx}
                      className={`w-full rounded-lg px-2.5 md:px-3 py-2.5 md:py-3 transition-all duration-200 group
                        ${isActive
                          ? "bg-primary/10 border border-primary/30 shadow-sm shadow-primary/5 ring-1 ring-primary/20"
                          : "hover:bg-white/5 border border-transparent"
                        }
                        ${idx > 0 && !isActive ? "mt-0.5" : ""}`}
                      data-testid={`button-subtitle-line-${idx}`}
                    >
                      <div className="flex items-start gap-2 md:gap-3">
                        <div className="shrink-0 flex flex-col items-center gap-1 mt-0.5">
                          <button
                            className={`w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center transition-colors ${
                              isActive
                                ? "bg-primary/20 text-primary hover:bg-primary/30"
                                : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground/70"
                            }`}
                            onClick={() => seekTo(item.startTime)}
                            data-testid={`button-play-subtitle-${idx}`}
                          >
                            <Play className="w-3 h-3 ml-0.5" />
                          </button>
                          <span
                            className={`font-mono text-center transition-colors ${
                              isActive ? "text-primary font-bold" : "text-muted-foreground"
                            }`}
                            style={{ fontSize: "0.6em" }}
                          >
                            {formatTime(item.startTime)}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          {(displayMode === "original" || displayMode === "both") && (
                            <div className={`leading-relaxed transition-colors ${
                              isActive ? "text-foreground font-medium" : "text-foreground/70"
                            }`}>
                              {isActive ? (
                                <div style={{ fontSize: originalIsArabic ? "1.15em" : "0.95em" }}>
                                  {renderClickableWords(item.originalText, item, false)}
                                </div>
                              ) : (
                                <p
                                  className="cursor-pointer break-words"
                                  dir={originalIsArabic ? "rtl" : "ltr"}
                                  style={{
                                    textAlign: originalIsArabic ? "right" : "left",
                                    fontFamily: originalIsArabic ? "'Noto Naskh Arabic', 'Amiri', serif" : "inherit",
                                    lineHeight: originalIsArabic ? "2" : "1.6",
                                    fontSize: originalIsArabic ? "1.05em" : "0.95em",
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
                              className={`leading-relaxed transition-colors cursor-pointer break-words ${
                                displayMode === "both" ? "mt-1.5" : ""
                              } ${isActive ? "text-primary/80" : "text-muted-foreground"}`}
                              style={{ fontSize: "0.88em" }}
                              onClick={() => seekTo(item.startTime)}
                            >
                              {renderTranslationText(translation, false)}
                            </div>
                          )}
                          {displayMode === "translation" && !translation && (
                            <p
                              className={`leading-relaxed cursor-pointer break-words ${
                                isActive ? "text-foreground font-medium" : "text-foreground/70"
                              }`}
                              style={{
                                textAlign: "left",
                                fontSize: originalIsArabic ? "1.05em" : "0.95em",
                              }}
                              onClick={() => seekTo(item.startTime)}
                            >
                              {item.originalText}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 flex items-center gap-1">
                          {isActive && (
                            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                          )}
                          <span className="text-[9px] font-mono text-muted-foreground/60">
                            {idx + 1}/{subtitles.length}
                          </span>
                        </div>
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
          onPlayWord={playWordAudio}
          isMobile={isMobile}
          readOnly={readOnly}
          targetLanguage={targetLanguage}
        />
      )}
    </div>
  );
}
