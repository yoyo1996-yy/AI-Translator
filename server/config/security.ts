import type { IncomingMessage } from "node:http";

export type GatewaySecurityConfig = {
  appAccessToken: string;
  authenticationEnabled: boolean;
  maxSessionDurationMs: number;
  maxAudioBytesPerSession: number;
  maxMessageSizeBytes: number;
  maxConcurrentSessionsPerClient: number;
  rateLimitWindowMs: number;
  maxConnectionAttemptsPerWindow: number;
};

export type GatewaySecurityRuntime = {
  config: GatewaySecurityConfig;
  activeSessionsByClient: Map<string, number>;
  connectionAttemptsByClient: Map<string, { count: number; resetAt: number }>;
};

const DEFAULT_MAX_SESSION_DURATION_SECONDS = 3600;
const DEFAULT_MAX_AUDIO_BYTES_PER_SESSION = 128 * 1024 * 1024;
const DEFAULT_MAX_MESSAGE_SIZE_BYTES = 1024 * 1024;
const DEFAULT_MAX_CONCURRENT_SESSIONS_PER_CLIENT = 3;
const DEFAULT_RATE_LIMIT_WINDOW_SECONDS = 60;
const DEFAULT_MAX_CONNECTION_ATTEMPTS_PER_WINDOW = 30;

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

function getPositiveIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name]?.trim();

  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadSecurityConfig(): GatewaySecurityConfig {
  const appAccessToken = getCleanSecretEnv("APP_ACCESS_TOKEN");
  const maxSessionDurationSeconds = getPositiveIntegerEnv(
    "MAX_SESSION_DURATION_SECONDS",
    DEFAULT_MAX_SESSION_DURATION_SECONDS
  );

  return {
    appAccessToken,
    authenticationEnabled: appAccessToken.length > 0,
    maxSessionDurationMs: maxSessionDurationSeconds * 1000,
    maxAudioBytesPerSession: getPositiveIntegerEnv(
      "MAX_AUDIO_BYTES_PER_SESSION",
      DEFAULT_MAX_AUDIO_BYTES_PER_SESSION
    ),
    maxMessageSizeBytes: getPositiveIntegerEnv("MAX_MESSAGE_SIZE_BYTES", DEFAULT_MAX_MESSAGE_SIZE_BYTES),
    maxConcurrentSessionsPerClient: getPositiveIntegerEnv(
      "MAX_CONCURRENT_SESSIONS_PER_CLIENT",
      DEFAULT_MAX_CONCURRENT_SESSIONS_PER_CLIENT
    ),
    rateLimitWindowMs: getPositiveIntegerEnv("RATE_LIMIT_WINDOW_SECONDS", DEFAULT_RATE_LIMIT_WINDOW_SECONDS) * 1000,
    maxConnectionAttemptsPerWindow: getPositiveIntegerEnv(
      "MAX_CONNECTION_ATTEMPTS_PER_WINDOW",
      DEFAULT_MAX_CONNECTION_ATTEMPTS_PER_WINDOW
    )
  };
}

export function createGatewaySecurityRuntime(config = loadSecurityConfig()): GatewaySecurityRuntime {
  return {
    config,
    activeSessionsByClient: new Map(),
    connectionAttemptsByClient: new Map()
  };
}

export function getClientIp(request: IncomingMessage): string {
  const forwardedFor = request.headers["x-forwarded-for"];
  const firstForwardedFor = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  const forwardedIp = firstForwardedFor?.split(",")[0]?.trim();

  return forwardedIp || request.socket.remoteAddress || "unknown";
}

export function getBearerToken(request: IncomingMessage): string {
  const authorization = request.headers.authorization;

  if (!authorization || Array.isArray(authorization)) {
    return "";
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? cleanSecretValue(match[1]) : "";
}

export function isRequestAuthenticated(request: IncomingMessage, config: GatewaySecurityConfig): boolean {
  if (!config.authenticationEnabled) {
    return true;
  }

  return getBearerToken(request) === config.appAccessToken;
}
