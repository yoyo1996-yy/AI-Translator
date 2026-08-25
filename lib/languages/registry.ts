import type { LanguageCode, TranslationDirection } from "../../types/realtime";

export type LanguageDefinition = {
  code: LanguageCode;
  displayName: string;
  nativeName: string;
  aliases: string[];
  enabled: boolean;
};

export type LanguageOption = {
  code: LanguageCode;
  label: string;
};

export type RealtimeProviderCapabilities = {
  supportedSourceLanguages: LanguageCode[];
  supportedTargetLanguages: LanguageCode[];
  supportsSpeechRecognition: boolean;
  supportsTranslation: boolean;
  supportsSpeechOutput: boolean;
};

export type LanguagePair = {
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
};

export type ProviderName = "bailian" | "mock" | "test";

export const AUTO_SOURCE_LANGUAGE_OPTION: LanguageOption = {
  code: "auto",
  label: "Auto"
};

export const LANGUAGE_DEFINITIONS: LanguageDefinition[] = [
  {
    code: "zh",
    displayName: "Chinese",
    nativeName: "中文",
    aliases: ["zh-CN", "Chinese", "Mandarin"],
    enabled: true
  },
  {
    code: "ja",
    displayName: "Japanese",
    nativeName: "日本語",
    aliases: ["Japanese"],
    enabled: true
  },
  {
    code: "en",
    displayName: "English",
    nativeName: "English",
    aliases: ["English"],
    enabled: true
  }
];

const enabledLanguageCodes = LANGUAGE_DEFINITIONS.filter((language) => language.enabled).map((language) => language.code);

export const COMMON_REALTIME_PROVIDER_CAPABILITIES: RealtimeProviderCapabilities = {
  supportedSourceLanguages: ["auto", ...enabledLanguageCodes],
  supportedTargetLanguages: enabledLanguageCodes,
  supportsSpeechRecognition: true,
  supportsTranslation: true,
  supportsSpeechOutput: true
};

export const PROVIDER_CAPABILITIES: Record<ProviderName, RealtimeProviderCapabilities> = {
  bailian: COMMON_REALTIME_PROVIDER_CAPABILITIES,
  mock: COMMON_REALTIME_PROVIDER_CAPABILITIES,
  test: COMMON_REALTIME_PROVIDER_CAPABILITIES
};

export function normalizeProviderName(value: string | undefined): ProviderName {
  const providerName = value?.trim().toLowerCase();

  if (providerName === "mock" || providerName === "test") {
    return providerName;
  }

  return "bailian";
}

export function getLanguageDefinition(languageCode: LanguageCode): LanguageDefinition | undefined {
  return LANGUAGE_DEFINITIONS.find((language) => language.code === languageCode);
}

export function getLanguageLabel(languageCode: LanguageCode): string {
  if (languageCode === AUTO_SOURCE_LANGUAGE_OPTION.code) {
    return AUTO_SOURCE_LANGUAGE_OPTION.label;
  }

  return getLanguageDefinition(languageCode)?.nativeName ?? languageCode;
}

export function getProviderCapabilities(providerName: ProviderName): RealtimeProviderCapabilities {
  return PROVIDER_CAPABILITIES[providerName];
}

export function getLanguageOptions(languageCodes: LanguageCode[]): LanguageOption[] {
  return languageCodes.map((code) => ({
    code,
    label: getLanguageLabel(code)
  }));
}

export function getSourceLanguageOptions(providerName: ProviderName): LanguageOption[] {
  return getLanguageOptions(getProviderCapabilities(providerName).supportedSourceLanguages);
}

export function getTargetLanguageOptions(providerName: ProviderName): LanguageOption[] {
  return getLanguageOptions(getProviderCapabilities(providerName).supportedTargetLanguages);
}

export function isSameLanguagePair(sourceLanguage: LanguageCode, targetLanguage: LanguageCode): boolean {
  return sourceLanguage === targetLanguage;
}

export function getProviderSessionLanguagePair(
  direction: TranslationDirection,
  pair: LanguagePair
): LanguagePair {
  void direction;
  return pair;
}

export function isSupportedLanguagePair(capabilities: RealtimeProviderCapabilities, pair: LanguagePair): boolean {
  return (
    capabilities.supportedSourceLanguages.includes(pair.sourceLanguage) &&
    capabilities.supportedTargetLanguages.includes(pair.targetLanguage) &&
    !isSameLanguagePair(pair.sourceLanguage, pair.targetLanguage)
  );
}
