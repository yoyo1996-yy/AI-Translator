import {
  getLanguageLabel,
  getProviderCapabilities,
  normalizeProviderName,
  getSourceLanguageOptions,
  getTargetLanguageOptions
} from "../languages/registry";
import { getProfileLanguageOptions } from "../languages/profile";
import type { LanguageOption, ProviderName } from "../languages/registry";

export type { LanguageOption };
export { getLanguageLabel };

function getClientProviderName(): ProviderName {
  return normalizeProviderName(process.env.NEXT_PUBLIC_TRANSLATION_PROVIDER);
}

export const CLIENT_PROVIDER_NAME: ProviderName = getClientProviderName();
export const SOURCE_LANGUAGE_OPTIONS: LanguageOption[] = getSourceLanguageOptions(CLIENT_PROVIDER_NAME);
export const TARGET_LANGUAGE_OPTIONS: LanguageOption[] = getTargetLanguageOptions(CLIENT_PROVIDER_NAME);
export const PROFILE_LANGUAGE_OPTIONS: LanguageOption[] = getProfileLanguageOptions(
  getProviderCapabilities(CLIENT_PROVIDER_NAME)
);
