import { useCallback, useEffect, useRef, useState } from "react";

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("tube-mentor-recordings", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("clips");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function saveClip(key: string, blob: Blob) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("clips", "readwrite");
    tx.objectStore("clips").put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
async function readClip(key: string): Promise<Blob | null> {
  const db = await database();
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const request = db
      .transaction("clips", "readonly")
      .objectStore("clips")
      .get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return blob;
}

export function useRecorder(key: string) {
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [recording, setRecording] = useState(false);
  const [pending, setPending] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  const generation = useRef(0);
  const stop = useCallback(() => {
    if (recorder.current?.state === "recording") recorder.current.stop();
    if (timer.current) clearInterval(timer.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    if (mounted.current) setRecording(false);
  }, []);
  useEffect(() => {
    generation.current++;
    mounted.current = true;
    setPending(false);
    setBlob(null);
    setSeconds(0);
    setError("");
    let cancelled = false;
    void readClip(key)
      .then((b) => {
        if (!cancelled) setBlob(b);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      mounted.current = false;
      stop();
    };
  }, [key, stop]);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);
  async function start() {
    setError("");
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError(
        "Bu qurilmada ovoz yozish mavjud emas. HTTPS orqali yangilangan brauzerda oching.",
      );
      return;
    }
    const version = generation.current;
    setPending(true);
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current || version !== generation.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      const mime = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const instance = new MediaRecorder(
        media,
        mime ? { mimeType: mime } : undefined,
      );
      recorder.current = instance;
      const chunks: BlobPart[] = [];
      instance.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      instance.onstop = () => {
        media.getTracks().forEach((t) => t.stop());
        const clip = new Blob(chunks, {
          type: instance.mimeType || "audio/webm",
        });
        if (clip.size && mounted.current && version === generation.current) {
          setBlob(clip);
          void saveClip(key, clip).catch(() =>
            setError(
              "Yozuvni qurilmada saqlab bo‘lmadi. Hozir qayta eshitishingiz mumkin.",
            ),
          );
        }
        if (mounted.current && version === generation.current)
          setRecording(false);
      };
      instance.onerror = () => {
        stop();
        setError("Ovoz yozishda xatolik. Qayta urinib ko‘ring.");
      };
      setSeconds(0);
      setRecording(true);
      instance.start();
      let elapsed = 0;
      timer.current = setInterval(() => {
        elapsed++;
        setSeconds(elapsed);
        if (elapsed >= 60) stop();
      }, 1000);
    } catch {
      setError(
        "Mikrofonga ruxsat berilmadi yoki mikrofon band. Ruxsatni tekshirib qayta urinib ko‘ring.",
      );
      stream.current?.getTracks().forEach((t) => t.stop());
    } finally {
      if (mounted.current && version === generation.current) setPending(false);
    }
  }
  return {
    recording,
    pending,
    seconds,
    url,
    hasRecording: Boolean(blob),
    error,
    start,
    stop,
  };
}
