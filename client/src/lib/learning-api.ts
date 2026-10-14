import { queryClient } from "./queryClient";
export async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: "include",
    signal,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const data = await response.json().catch(() => null);
  if (response.status === 401 && path !== "/api/auth/login")
    queryClient.setQueryData(["/api/auth/me"], null);
  if (!response.ok)
    throw new Error(
      data?.message || "So‘rov bajarilmadi. Qayta urinib ko‘ring.",
    );
  return data as T;
}
export function speak(text: string, language = "ar") {
  if (!("speechSynthesis" in window)) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language === "ar" ? "ar-SA" : "en-US";
  utterance.rate = 0.85;
  const voice = window.speechSynthesis
    .getVoices()
    .find((v) => v.lang.startsWith(language));
  if (voice) utterance.voice = voice;
  window.speechSynthesis.speak(utterance);
  return true;
}
export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Qayta urinib ko‘ring";
