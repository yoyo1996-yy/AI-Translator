export const REALTIME_MODEL = "qwen3.5-livetranslate-flash-realtime";
export const ASR_MODEL = "qwen3-asr-flash-realtime";
export const SUPPORTED_DASHSCOPE_REGIONS = ["cn-beijing", "ap-southeast-1"] as const;
export type DashScopeRegion = (typeof SUPPORTED_DASHSCOPE_REGIONS)[number];
export const DEFAULT_REGION: DashScopeRegion = "cn-beijing";
export const INPUT_SAMPLE_RATE = 16000;
export const OUTPUT_SAMPLE_RATE = 24000;
export const PROXY_PORT = 3001;
export const DEV_PROXY_WS_URL = `ws://127.0.0.1:${PROXY_PORT}`;
export const SESSION_FINISH_TIMEOUT_MS = 5000;
export const MIN_PUSH_TO_TALK_MS = 300;
export const RECONNECT_BASE_DELAY_MS = 800;
export const RECONNECT_MAX_DELAY_MS = 6000;
export const RECONNECT_MAX_ATTEMPTS = 5;

export function normalizeDashScopeRegion(value: string | undefined): DashScopeRegion {
  const trimmed = value?.trim();

  if (trimmed === "ap-southeast-1") {
    return "ap-southeast-1";
  }

  return "cn-beijing";
}

export function getBrowserRealtimeProxyUrl(): string {
  const configured = process.env.NEXT_PUBLIC_REALTIME_PROXY_URL?.trim();

  if (configured) {
    return configured;
  }

  if (typeof window === "undefined") {
    return DEV_PROXY_WS_URL;
  }

  const isLocalHost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

  if (isLocalHost) {
    return DEV_PROXY_WS_URL;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/realtime`;
}
