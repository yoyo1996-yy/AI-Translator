import {
  getProviderSessionLanguagePair,
  isSameLanguagePair,
  isSupportedLanguagePair
} from "../lib/languages/registry";
import type { LanguagePair, RealtimeProviderCapabilities } from "../lib/languages/registry";
import type { LanguageCode, TranslationDirection } from "../types/realtime";

export type LanguagePairValidationResult =
  | {
      ok: true;
      providerPair: LanguagePair;
    }
  | {
      ok: false;
      providerPair: LanguagePair;
      gatewayCode: "same_language_pair" | "unsupported_language_pair";
      message: string;
    };

export function getProviderSessionLanguages(
  direction: TranslationDirection,
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode
): LanguagePair {
  return getProviderSessionLanguagePair(direction, {
    sourceLanguage,
    targetLanguage
  });
}

export function validateProviderLanguagePair(
  providerName: string,
  capabilities: RealtimeProviderCapabilities,
  direction: TranslationDirection,
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode
): LanguagePairValidationResult {
  const providerPair = getProviderSessionLanguages(direction, sourceLanguage, targetLanguage);

  if (isSameLanguagePair(providerPair.sourceLanguage, providerPair.targetLanguage)) {
    return {
      ok: false,
      providerPair,
      gatewayCode: "same_language_pair",
      message: `Unsupported language pair: sourceLanguage and targetLanguage must be different. sourceLanguage: ${providerPair.sourceLanguage}; targetLanguage: ${providerPair.targetLanguage}; provider: ${providerName}`
    };
  }

  if (!isSupportedLanguagePair(capabilities, providerPair)) {
    return {
      ok: false,
      providerPair,
      gatewayCode: "unsupported_language_pair",
      message: `Unsupported language pair. sourceLanguage: ${providerPair.sourceLanguage}; targetLanguage: ${providerPair.targetLanguage}; provider: ${providerName}`
    };
  }

  return {
    ok: true,
    providerPair
  };
}
