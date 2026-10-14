import { useCallback, useEffect, useRef, useState } from "react";
import { request } from "@/lib/learning-api";

/** Time comes from the server clock. Only a visible, recently active page sends active heartbeats. */
export function useLearningActivity(lessonId: number | null, enabled: boolean) {
  const session = useRef<string | null>(null);
  const touched = useRef(Date.now());
  const playback = useRef({ position: 0, index: 0, playing: false });
  const pending = useRef<Promise<unknown> | null>(null);
  const [error, setError] = useState("");
  const path = lessonId ? `/api/learn/lessons/${lessonId}` : "/api/learn";
  const flush = useCallback(
    async (hidden = false) => {
      if (!session.current || pending.current) return pending.current;
      const body = {
        id: crypto.randomUUID(),
        sessionId: session.current,
        active:
          (hidden || document.visibilityState === "visible") &&
          (playback.current.playing || Date.now() - touched.current < 45000),
        position: playback.current.position,
        segmentIndex: playback.current.index,
      };
      const sent = request("POST", `${path}/activity`, body)
        .then(() => setError(""))
        .catch((e) => {
          setError(e.message);
          if (/sessiyasini/.test(e.message)) session.current = null;
        })
        .finally(() => {
          pending.current = null;
        });
      pending.current = sent;
      return sent;
    },
    [path],
  );
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    session.current = null;
    touched.current = Date.now();
    const open = () =>
      request<{ id: string }>("POST", `${path}/sessions`, {})
        .then((data) => {
          if (!cancelled) session.current = data.id;
        })
        .catch((e) => {
          if (!cancelled) setError(e.message);
        });
    void open();
    const touch = () => {
      touched.current = Date.now();
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") void flush(true);
      else {
        touched.current = Date.now();
        void flush();
      }
    };
    const pagehide = () => {
      if (session.current)
        void fetch(`${path}/activity`, {
          method: "POST",
          credentials: "include",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: crypto.randomUUID(),
            sessionId: session.current,
            active:
              playback.current.playing || Date.now() - touched.current < 45000,
            position: playback.current.position,
            segmentIndex: playback.current.index,
          }),
        });
    };
    window.addEventListener("pointerdown", touch);
    window.addEventListener("keydown", touch);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", pagehide);
    const timer = setInterval(() => {
      if (session.current) void flush();
      else void open();
    }, 15000);
    return () => {
      cancelled = true;
      void flush(document.visibilityState === "hidden");
      clearInterval(timer);
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("keydown", touch);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", pagehide);
    };
  }, [enabled, path, flush]);
  return {
    flush,
    error,
    touch: () => {
      touched.current = Date.now();
    },
    playback: (position: number, index: number, playing: boolean) => {
      playback.current = { position, index, playing };
    },
  };
}
