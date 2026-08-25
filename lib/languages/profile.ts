import type { LanguageCode, TranslationDirection } from "../../types/realtime";
import {
  getLanguageLabel,
  getProviderCapabilities,
  isSameLanguagePair,
  isSupportedLanguagePair
} from "./registry";
import type {
  LanguageOption,
  LanguagePair,
  ProviderName,
  RealtimeProviderCapabilities
} from "./registry";

export type { LanguagePair };

export type LanguageProfile = {
  userLanguage: LanguageCode;
  peerLanguage: LanguageCode;
};

export type LanguageProfileValidationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      message: string;
    };

export const LANGUAGE_PROFILE_STORAGE_KEY = "ai-translator-language-profile";

export const DEFAULT_LANGUAGE_PROFILE: LanguageProfile = {
  userLanguage: "zh",
  peerLanguage: "ja"
};

export function serializeLanguageProfile(profile: LanguageProfile): string {
  return JSON.stringify(profile);
}

export function parseLanguageProfile(value: string | null): LanguageProfile | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<LanguageProfile>;

    if (typeof parsed.userLanguage === "string" && typeof parsed.peerLanguage === "string") {
      return {
        userLanguage: parsed.userLanguage,
        peerLanguage: parsed.peerLanguage
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function getListeningDirection(profile: LanguageProfile): LanguagePair {
  return {
    sourceLanguage: profile.peerLanguage,
    targetLanguage: profile.userLanguage
  };
}

export function getPushToTalkDirection(profile: LanguageProfile): LanguagePair {
  return {
    sourceLanguage: profile.userLanguage,
    targetLanguage: profile.peerLanguage
  };
}

export function getDirectionLanguagePair(
  profile: LanguageProfile,
  direction: TranslationDirection
): LanguagePair {
  return direction === "conversation" ? getListeningDirection(profile) : getPushToTalkDirection(profile);
}

export function getProfileFromDirection(
  direction: TranslationDirection,
  pair: LanguagePair
): LanguageProfile {
  if (direction === "conversation") {
    return {
      userLanguage: pair.targetLanguage,
      peerLanguage: pair.sourceLanguage
    };
  }

  return {
    userLanguage: pair.sourceLanguage,
    peerLanguage: pair.targetLanguage
  };
}

export function getProfileLanguageOptions(
  capabilities: RealtimeProviderCapabilities
): LanguageOption[] {
  return capabilities.supportedTargetLanguages
    .filter(
      (languageCode) =>
        languageCode !== "auto" &&
        capabilities.supportedSourceLanguages.includes(languageCode)
    )
    .map((languageCode) => ({
      code: languageCode,
      label: getLanguageLabel(languageCode)
    }));
}

export function validateLanguageProfile(
  profile: LanguageProfile,
  capabilities: RealtimeProviderCapabilities
): LanguageProfileValidationResult {
  if (isSameLanguagePair(profile.userLanguage, profile.peerLanguage)) {
    return {
      ok: false,
      message: "Please select two different languages."
    };
  }

  if (!isSupportedLanguagePair(capabilities, getListeningDirection(profile))) {
    return {
      ok: false,
      message: `Unsupported language pair. sourceLanguage: ${profile.peerLanguage}; targetLanguage: ${profile.userLanguage}`
    };
  }

  if (!isSupportedLanguagePair(capabilities, getPushToTalkDirection(profile))) {
    return {
      ok: false,
      message: `Unsupported language pair. sourceLanguage: ${profile.userLanguage}; targetLanguage: ${profile.peerLanguage}`
    };
  }

  return {
    ok: true
  };
}

export function validateProviderLanguageProfile(
  providerName: ProviderName,
  profile: LanguageProfile
): LanguageProfileValidationResult {
  return validateLanguageProfile(profile, getProviderCapabilities(providerName));
}
