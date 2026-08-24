import type { LanguageCode } from "../../types/realtime";

export type LanguageOption = {
  code: LanguageCode;
  label: string;
};

export const SOURCE_LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: "zh", label: "中文" },
  { code: "auto", label: "Auto" },
  { code: "en", label: "English" },
  { code: "ja", label: "日本語" }
];

export const TARGET_LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: "ja", label: "日本語" },
  { code: "en", label: "English" },
  { code: "zh", label: "中文" }
];

export function getLanguageLabel(languageCode: LanguageCode): string {
  return (
    [...SOURCE_LANGUAGE_OPTIONS, ...TARGET_LANGUAGE_OPTIONS].find((option) => option.code === languageCode)?.label ??
    languageCode
  );
}
