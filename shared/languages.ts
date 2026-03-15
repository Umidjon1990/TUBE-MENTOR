export const SUPPORTED_LANGUAGES = [
  {
    code: "ar",
    name: "Arab tili",
    nameLocal: "العربية",
    script: "arabic" as const,
    rtl: true,
    fontFamily: "'Noto Naskh Arabic', 'Amiri', serif",
  },
  {
    code: "en",
    name: "Ingliz tili",
    nameLocal: "English",
    script: "latin" as const,
    rtl: false,
    fontFamily: "inherit",
  },
] as const;

export type TargetLanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

export function getLanguageConfig(code: string) {
  return SUPPORTED_LANGUAGES.find(l => l.code === code) || SUPPORTED_LANGUAGES[0];
}

export function isRTLLanguage(code: string): boolean {
  return getLanguageConfig(code).rtl;
}

export function getLanguageFont(code: string): string {
  return getLanguageConfig(code).fontFamily;
}
