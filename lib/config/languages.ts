import {
  getLanguageLabel,
  normalizeProviderName,
  getSourceLanguageOptions,
  getTargetLanguageOptions
} from "../languages/registry";
import type { LanguageOption, ProviderName } from "../languages/registry";

export type { LanguageOption };
export { getLanguageLabel };

function getClientProviderName(): ProviderName {
  return normalizeProviderName(process.env.NEXT_PUBLIC_TRANSLATION_PROVIDER);
}

export const SOURCE_LANGUAGE_OPTIONS: LanguageOption[] = getSourceLanguageOptions(getClientProviderName());
export const TARGET_LANGUAGE_OPTIONS: LanguageOption[] = getTargetLanguageOptions(getClientProviderName());
