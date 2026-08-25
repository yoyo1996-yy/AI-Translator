export const OPENAI_REALTIME_TRANSLATION_ENDPOINT = "wss://api.openai.com/v1/realtime/translations";
export const DEFAULT_OPENAI_REALTIME_TRANSLATION_MODEL = "gpt-realtime-translate";
export const OPENAI_REALTIME_INPUT_SAMPLE_RATE = 24000;

export type OpenAIProviderConfig = {
  apiKey: string;
  model: string;
  endpoint: string;
  connectTimeoutMs: number;
};

function getTrimmedEnv(name: string): string {
  const value = process.env[name];

  if (typeof value !== "string") {
    return "";
  }

  const trimmedValue = value.trim();
  process.env[name] = trimmedValue;
  return trimmedValue;
}

function cleanSecretValue(value: string): string {
  const trimmedValue = value.trim();
  const unquotedValue =
    (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) ||
    (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"))
      ? trimmedValue.slice(1, -1).trim()
      : trimmedValue;

  return unquotedValue.replace(/\s+/g, "");
}

function getCleanSecretEnv(name: string): string {
  const value = process.env[name];
  return typeof value === "string" ? cleanSecretValue(value) : "";
}

export function loadOpenAIProviderConfig(): OpenAIProviderConfig {
  return {
    apiKey: getCleanSecretEnv("OPENAI_API_KEY"),
    model: getTrimmedEnv("OPENAI_REALTIME_MODEL") || DEFAULT_OPENAI_REALTIME_TRANSLATION_MODEL,
    endpoint: OPENAI_REALTIME_TRANSLATION_ENDPOINT,
    connectTimeoutMs: Number.parseInt(getTrimmedEnv("PROVIDER_CONNECT_TIMEOUT_MS") || "45000", 10)
  };
}

export function assertOpenAIProviderConfig(): void {
  const config = loadOpenAIProviderConfig();

  if (!config.apiKey) {
    console.error("Missing required environment variables:");
    console.error("- OPENAI_API_KEY");
    console.error("Provider: openai");
    console.error("See: docs/providers/openai.md");
    process.exit(1);
  }
}
