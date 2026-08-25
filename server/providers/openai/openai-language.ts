import type { LanguageCode } from "../../../types/realtime";

const OPENAI_LANGUAGE_MAP: Record<string, string> = {
  zh: "zh",
  ja: "ja",
  en: "en"
};

export function toOpenAITranslationLanguage(languageCode: LanguageCode): string {
  return OPENAI_LANGUAGE_MAP[languageCode] ?? languageCode;
}
