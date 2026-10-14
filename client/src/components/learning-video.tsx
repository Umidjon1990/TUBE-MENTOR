import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useId,
} from "react";
import {
  Play,
  Pause,
  Repeat2,
  SkipBack,
  SkipForward,
  ExternalLink,
} from "lucide-react";
import { youtubeId, type Segment } from "@shared/learning";
import { Button } from "@/components/ui/button";

let ready: Promise<void> | null = null;
function loadPlayer() {
  if ((window as any).YT?.Player) return Promise.resolve();
  if (!ready)
    ready = new Promise<void>((resolve, reject) => {
      const previous = (window as any).onYouTubeIframeAPIReady;
      (window as any).onYouTubeIframeAPIReady = () => {
        previous?.();
        resolve();
      };
      if (
        !document.querySelector(
          'script[src="https://www.youtube.com/iframe_api"]',
        )
      ) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        script.onerror = () => {
          ready = null;
          reject(new Error("Video xizmatiga ulanib bo‘lmadi"));
        };
        document.head.appendChild(script);
      }
      setTimeout(() => {
        if (!(window as any).YT?.Player) {
          ready = null;
          reject(new Error("Video xizmatiga ulanib bo‘lmadi"));
        }
      }, 15000);
    });
  return ready;
}
export interface VideoHandle {
  seek: (time: number, end?: number | null) => void;
  pause: () => void;
}
interface Props {
  url: string | null;
  segments: Segment[];
  position: number;
  onProgress: (position: number, index: number, playing: boolean) => void;
  onSegment: (index: number) => void;
  initialPosition?: number;
}
export const LearningVideo = forwardRef<VideoHandle, Props>(
  function LearningVideo(
    { url, segments, onProgress, onSegment, initialPosition = 0 },
    ref,
  ) {
    const mount = useRef<HTMLDivElement>(null);
    const player = useRef<any>(null);
    const stopAt = useRef<number | null>(null);
    const callbacks = useRef({ onProgress, onSegment });
    callbacks.current = { onProgress, onSegment };
    const loopRef = useRef(false);
    const loopIndex = useRef(0);
    const segmentRef = useRef(0);
    const id = useId().replace(/:/g, "");
    const [playing, setPlaying] = useState(false);
    const [loop, setLoop] = useState(false);
    const [speed, setSpeed] = useState(1);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState("");
    const [current, setCurrent] = useState(0);
    const videoId = youtubeId(url);
    useImperativeHandle(
      ref,
      () => ({
        seek: (time, end) => {
          if (player.current?.seekTo) {
            stopAt.current = end ?? null;
            player.current.seekTo(Math.max(0, time), true);
            player.current.playVideo();
          }
        },
        pause: () => player.current?.pauseVideo?.(),
      }),
      [],
    );
    useEffect(() => {
      let cancelled = false;
      let interval: ReturnType<typeof setInterval> | undefined;
      setLoaded(false);
      setError("");
      if (!videoId) {
        setError("Bu darsning video havolasi hali tayyor emas");
        return;
      }
      void loadPlayer()
        .then(() => {
          if (cancelled || !mount.current) return;
          const node = document.createElement("div");
          node.id = `tube-player-${id}`;
          mount.current.replaceChildren(node);
          player.current = new (window as any).YT.Player(node.id, {
            width: "100%",
            height: "100%",
            videoId,
            playerVars: {
              controls: 1,
              playsinline: 1,
              rel: 0,
              origin: window.location.origin,
            },
            events: {
              onReady: () => {
                if (cancelled) return;
                setLoaded(true);
                if (initialPosition > 0)
                  player.current.seekTo(initialPosition, true);
              },
              onStateChange: (event: any) => {
                if (cancelled) return;
                setPlaying(event.data === 1);
              },
              onError: () => {
                if (!cancelled)
                  setError(
                    "Video bu yerda ochilmadi. YouTube orqali ko‘rish mumkin.",
                  );
              },
            },
          });
          interval = setInterval(() => {
            const p = player.current;
            if (!p?.getCurrentTime) return;
            const time = Number(p.getCurrentTime()) || 0;
            const isPlaying = p.getPlayerState?.() === 1;
            const repeated = segments[loopIndex.current];
            if (
              loopRef.current &&
              repeated?.start !== null &&
              repeated?.end !== null &&
              repeated &&
              time >= repeated.end - 0.08
            ) {
              p.seekTo(repeated.start, true);
              return;
            }
            let index = segments.findIndex(
              (s) =>
                s.start !== null &&
                s.end !== null &&
                time >= s.start &&
                time < s.end,
            );
            if (index < 0) index = segmentRef.current;
            else segmentRef.current = index;
            setCurrent(index);
            callbacks.current.onProgress(time, index, isPlaying);
            const segment = segments[index];
            if (stopAt.current !== null && time >= stopAt.current) {
              p.pauseVideo();
              stopAt.current = null;
            }
          }, 200);
        })
        .catch((e) => {
          if (!cancelled) setError(e.message);
        });
      return () => {
        cancelled = true;
        if (interval) clearInterval(interval);
        try {
          player.current?.destroy?.();
        } catch {}
        player.current = null;
      };
    }, [videoId, id, segments]);
    function seek(index: number) {
      const s = segments[index];
      if (!s) return;
      segmentRef.current = index;
      loopIndex.current = index;
      setCurrent(index);
      callbacks.current.onSegment(index);
      if (s.start !== null) {
        stopAt.current = null;
        player.current?.seekTo?.(s.start, true);
        player.current?.playVideo?.();
      }
    }
    return (
      <section className="learning-video" aria-label="Dars videosi">
        <div className="video-frame" ref={mount} />
        {error && (
          <div className="video-error" role="status">
            <p>{error}</p>
            {videoId && (
              <a
                href={`https://www.youtube.com/watch?v=${videoId}`}
                target="_blank"
                rel="noreferrer"
                className="quiet-link"
              >
                YouTube’da ochish <ExternalLink size={16} />
              </a>
            )}
          </div>
        )}
        <div className="video-actions">
          <Button
            variant="outline"
            aria-label={playing ? "Videoni to‘xtatish" : "Videoni boshlash"}
            disabled={!loaded}
            onClick={() =>
              playing
                ? player.current?.pauseVideo?.()
                : player.current?.playVideo?.()
            }
          >
            {playing ? <Pause size={20} /> : <Play size={20} />}
          </Button>
          <Button
            variant="outline"
            aria-label="Oldingi gap"
            disabled={!loaded || current <= 0}
            onClick={() => seek(current - 1)}
          >
            <SkipBack size={20} />
          </Button>
          <Button
            variant="outline"
            aria-label="Keyingi gap"
            disabled={!loaded || current >= segments.length - 1}
            onClick={() => seek(current + 1)}
          >
            <SkipForward size={20} />
          </Button>
          <Button
            variant="outline"
            aria-pressed={loop}
            disabled={!loaded || segments[current]?.timing !== "exact"}
            onClick={() => {
              loopIndex.current = current;
              loopRef.current = !loop;
              setLoop(!loop);
            }}
          >
            <Repeat2 size={18} />
            <span>Takror</span>
          </Button>
          <label className="speed-select">
            <span className="sr-only">Video tezligi</span>
            <select
              aria-label="Video tezligi"
              value={speed}
              disabled={!loaded}
              onChange={(e) => {
                setSpeed(Number(e.target.value));
                player.current?.setPlaybackRate?.(Number(e.target.value));
              }}
            >
              {[0.5, 0.75, 1, 1.25, 1.5].map((n) => (
                <option key={n} value={n}>
                  {n}×
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
    );
  },
);
