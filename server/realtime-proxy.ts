import { existsSync, readFileSync } from "node:fs";
import type { IncomingMessage, Server } from "node:http";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import WebSocket, { WebSocketServer } from "ws";
import {
  PROXY_PORT,
  SESSION_FINISH_TIMEOUT_MS
} from "../lib/config/realtime";
import {
  type GatewaySecurityConfig,
  type GatewaySecurityRuntime,
  createGatewaySecurityRuntime,
  getBearerToken,
  getClientIp,
  isRequestAuthenticated,
} from "./config/security";
import {
  assertSelectedProviderConfig,
  createSelectedRealtimeProviderFactory,
  type RealtimeProvider,
  type RealtimeProviderFactory
} from "./providers";
import type {
  BrowserControlMessage,
  LanguageCode,
  TranslationDirection,
  TurnDetectionMode
} from "../types/realtime";

loadEnv({ path: resolve(process.cwd(), ".env.local"), override: false, quiet: true });

function getTrimmedEnv(name: string): string {
  const value = process.env[name];

  if (typeof value !== "string") {
    return "";
  }

  const trimmedValue = value.trim();
  process.env[name] = trimmedValue;
  return trimmedValue;
}

const debugRealtime = (getTrimmedEnv("DEBUG_REALTIME") || "false").toLowerCase() === "true";
const enableTranslationGlossary = (getTrimmedEnv("ENABLE_TRANSLATION_GLOSSARY") || "false").toLowerCase() === "true";
const proxyHost = getTrimmedEnv("REALTIME_PROXY_HOST") || "127.0.0.1";
const proxyPort = Number.parseInt(getTrimmedEnv("PORT") || getTrimmedEnv("REALTIME_PROXY_PORT") || String(PROXY_PORT), 10);
const proxyPath = getTrimmedEnv("REALTIME_PROXY_PATH") || undefined;
const allowedOrigins = getTrimmedEnv("ALLOWED_ORIGINS")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const DIRECTION_SWITCH_GRACE_MS = 250;

type TranslationGlossary = {
  zh_to_ja?: Record<string, string>;
  zh_to_en?: Record<string, string>;
  other_to_zh?: Record<string, string>;
};

const defaultGlossary: Required<TranslationGlossary> = {
  zh_to_ja: {
    "AI 随身同传": "AIポータブル同時通訳",
    "人工智能": "人工知能",
    "机器学习": "機械学習",
    "实时翻译": "リアルタイム翻訳",
    "同传": "同時通訳"
  },
  zh_to_en: {
    "AI 随身同传": "AI Portable Interpreter",
    "人工智能": "Artificial Intelligence",
    "机器学习": "Machine Learning",
    "实时翻译": "realtime translation",
    "同传": "simultaneous interpretation"
  },
  other_to_zh: {
    "AI Portable Interpreter": "AI 随身同传",
    "Artificial Intelligence": "人工智能",
    "Machine Learning": "机器学习",
    "realtime translation": "实时翻译",
    "simultaneous interpretation": "同传",
    "人工知能": "人工智能",
    "機械学習": "机器学习",
    "リアルタイム翻訳": "实时翻译",
    "同時通訳": "同传"
  }
};

function log(message: string): void {
  console.log(message);
}

function debug(message: string): void {
  if (debugRealtime) {
    console.log(message);
  }
}

function normalizePhrases(phrases: unknown): Record<string, string> {
  if (!phrases || typeof phrases !== "object" || Array.isArray(phrases)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(phrases as Record<string, unknown>)
      .map(([source, target]) => [source.trim(), typeof target === "string" ? target.trim() : ""])
      .filter(([source, target]) => source && target)
  );
}

function loadGlossary(): Required<TranslationGlossary> {
  const glossaryPath = resolve(process.cwd(), "translation-glossary.json");

  if (!existsSync(glossaryPath)) {
    return defaultGlossary;
  }

  try {
    const parsed = JSON.parse(readFileSync(glossaryPath, "utf8")) as TranslationGlossary;

    return {
      zh_to_ja: {
        ...defaultGlossary.zh_to_ja,
        ...normalizePhrases(parsed.zh_to_ja)
      },
      zh_to_en: {
        ...defaultGlossary.zh_to_en,
        ...normalizePhrases(parsed.zh_to_en)
      },
      other_to_zh: {
        ...defaultGlossary.other_to_zh,
        ...normalizePhrases(parsed.other_to_zh)
      }
    };
  } catch (error) {
    console.warn("[Glossary] ignored invalid translation-glossary.json.");
    debug(error instanceof Error ? error.message : String(error));
    return defaultGlossary;
  }
}

const translationGlossary = loadGlossary();

function getCorpusPhrases(
  direction: TranslationDirection,
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode
): Record<string, string> {
  if (direction === "conversation" && targetLanguage === "zh") {
    return translationGlossary.other_to_zh;
  }

  if (sourceLanguage === "zh" && targetLanguage === "en") {
    return translationGlossary.zh_to_en;
  }

  if (sourceLanguage === "zh" && targetLanguage === "ja") {
    return translationGlossary.zh_to_ja;
  }

  return {};
}

function safeSend(browserSocket: WebSocket, payload: unknown): void {
  if (browserSocket.readyState === WebSocket.OPEN) {
    browserSocket.send(JSON.stringify(payload));
  }
}

function forwardRaw(browserSocket: WebSocket, payload: string): void {
  if (browserSocket.readyState === WebSocket.OPEN) {
    browserSocket.send(payload);
  }
}

function getTurnDetection(direction: TranslationDirection): TurnDetectionMode {
  return direction === "push_to_talk" ? "manual" : "server_vad";
}

function verifyBrowserOrigin(origin: string | undefined, done: (result: boolean, code?: number, name?: string) => void): void {
    if (allowedOrigins.length === 0 || !origin || allowedOrigins.includes(origin)) {
      done(true);
      return;
    }

    done(false, 403, "Forbidden origin");
}

function getMessageByteLength(rawMessage: WebSocket.RawData): number {
  if (Buffer.isBuffer(rawMessage)) {
    return rawMessage.byteLength;
  }

  if (Array.isArray(rawMessage)) {
    return rawMessage.reduce((total, chunk) => total + chunk.byteLength, 0);
  }

  return rawMessage.byteLength;
}

function verifyGatewayClient(
  runtime: GatewaySecurityRuntime,
  request: IncomingMessage,
  origin: string | undefined,
  done: (result: boolean, code?: number, name?: string) => void
): void {
  verifyBrowserOrigin(origin, (originAllowed, originCode, originName) => {
    if (!originAllowed) {
      done(false, originCode, originName);
      return;
    }

    const clientId = getClientIp(request);
    const now = Date.now();
    const attempt = runtime.connectionAttemptsByClient.get(clientId);
    const nextAttempt =
      attempt && attempt.resetAt > now
        ? {
            count: attempt.count + 1,
            resetAt: attempt.resetAt
          }
        : {
            count: 1,
            resetAt: now + runtime.config.rateLimitWindowMs
          };

    runtime.connectionAttemptsByClient.set(clientId, nextAttempt);

    if (nextAttempt.count > runtime.config.maxConnectionAttemptsPerWindow) {
      done(false, 429, "Too many connection attempts");
      return;
    }

    const bearerToken = getBearerToken(request);
    if (
      runtime.config.authenticationEnabled &&
      bearerToken &&
      bearerToken !== runtime.config.appAccessToken
    ) {
      done(false, 401, "Unauthorized");
      return;
    }

    const activeSessions = runtime.activeSessionsByClient.get(clientId) ?? 0;
    if (activeSessions >= runtime.config.maxConcurrentSessionsPerClient) {
      done(false, 429, "Too many concurrent sessions");
      return;
    }

    done(true);
  });
}

export function attachRealtimeProxy(
  wss: WebSocketServer,
  options: {
    autoConnect?: boolean;
    securityRuntime?: GatewaySecurityRuntime;
    providerFactory?: RealtimeProviderFactory;
  } = {}
): WebSocketServer {
  log("[Proxy] realtime websocket attached");

  const autoConnect = options.autoConnect ?? true;
  const securityRuntime = options.securityRuntime ?? createGatewaySecurityRuntime();
  const providerFactory = options.providerFactory ?? createSelectedRealtimeProviderFactory();

  wss.on("connection", (browserSocket, request) => {
  log("[Browser] connected");

  let providerSession: RealtimeProvider | null = null;
  let currentDirection: TranslationDirection = "conversation";
  let currentSourceLanguage: LanguageCode = "zh";
  let currentTargetLanguage: LanguageCode = "ja";
  let currentTurnDetection: TurnDetectionMode = "server_vad";
  let currentSessionReady = false;
  let pendingSwitchDirection: TranslationDirection | null = null;
  let stopRequested = false;
  let finishTimer: NodeJS.Timeout | null = null;
  let hasLoggedAudioStreaming = false;
  let hasLoggedPttStreaming = false;
  let hasLoggedTargetPlayback = false;
  let hasLoggedTargetTranslationStart = false;
  let authenticated = isRequestAuthenticated(request, securityRuntime.config);
  let sessionAudioBytes = 0;
  let sessionClosed = false;
  const clientId = getClientIp(request);
  const activeSessions = securityRuntime.activeSessionsByClient.get(clientId) ?? 0;
  let sessionDurationTimer: NodeJS.Timeout | null = setTimeout(() => {
    closeWithGatewayError("session_duration_exceeded", "Gateway session duration limit exceeded.");
  }, securityRuntime.config.maxSessionDurationMs);

  securityRuntime.activeSessionsByClient.set(clientId, activeSessions + 1);

  const cleanupSecuritySession = () => {
    if (sessionClosed) {
      return;
    }

    sessionClosed = true;

    if (sessionDurationTimer) {
      clearTimeout(sessionDurationTimer);
      sessionDurationTimer = null;
    }

    const currentSessions = securityRuntime.activeSessionsByClient.get(clientId) ?? 0;
    if (currentSessions <= 1) {
      securityRuntime.activeSessionsByClient.delete(clientId);
    } else {
      securityRuntime.activeSessionsByClient.set(clientId, currentSessions - 1);
    }
  };

  const cleanupFinishTimer = () => {
    if (finishTimer) {
      clearTimeout(finishTimer);
      finishTimer = null;
    }
  };

  const closeWithGatewayError = (gatewayCode: string, message: string) => {
    stopRequested = true;
    safeSend(browserSocket, {
      type: "proxy.error",
      gatewayCode,
      message
    });
    closeProvider();
    setTimeout(closeBrowser, 50);
  };

  const authTimer =
    securityRuntime.config.authenticationEnabled && !authenticated
      ? setTimeout(() => {
          closeWithGatewayError("unauthorized", "Gateway authentication required.");
        }, 10_000)
      : null;

  const startProviderSession = () => {
    safeSend(browserSocket, {
      type: "proxy.status",
      browserWs: "Connected",
      bailianWs: autoConnect ? "Connecting" : "Disconnected",
      realtimeSession: autoConnect ? "Connecting" : "Disconnected",
      direction: currentDirection,
      sourceLanguage: currentSourceLanguage,
      targetLanguage: currentTargetLanguage,
      turnDetection: currentTurnDetection
    });

    if (autoConnect) {
      connectProvider("conversation");
    }
  };

  const sendStatus = (patch: object = {}) => {
    safeSend(browserSocket, {
      type: "proxy.status",
      browserWs: browserSocket.readyState === WebSocket.OPEN ? "Connected" : "Disconnected",
      bailianWs: providerSession?.isOpen() ? "Connected" : "Disconnected",
      realtimeSession: currentSessionReady ? "Connected" : "Connecting",
      sourceLanguage: currentSourceLanguage,
      targetLanguage: currentTargetLanguage,
      direction: currentDirection,
      turnDetection: currentTurnDetection,
      ...patch
    });
  };

  const closeBrowser = () => {
    if (browserSocket.readyState === WebSocket.OPEN) {
      browserSocket.close();
    }
  };

  const closeProvider = () => {
    cleanupFinishTimer();
    if (providerSession && (providerSession.isOpen() || providerSession.isConnecting())) {
      providerSession.close();
    }
  };

  const finishCurrentSession = (afterFinish?: TranslationDirection, fastSwitch = false) => {
    pendingSwitchDirection = afterFinish ?? null;
    currentSessionReady = false;

    if (providerSession?.isOpen()) {
      providerSession.finishSession();
      if (fastSwitch && pendingSwitchDirection) {
        finishTimer = setTimeout(() => {
          const nextDirection = pendingSwitchDirection;
          pendingSwitchDirection = null;
          closeProvider();

          if (nextDirection) {
            connectProvider(nextDirection);
          }
        }, DIRECTION_SWITCH_GRACE_MS);
        return;
      }

      finishTimer = setTimeout(() => {
        debug("[Session] finish timeout");
        closeProvider();
        if (pendingSwitchDirection) {
          const nextDirection = pendingSwitchDirection;
          pendingSwitchDirection = null;
          connectProvider(nextDirection);
        } else {
          closeBrowser();
        }
      }, SESSION_FINISH_TIMEOUT_MS);
      return;
    }

    if (
      pendingSwitchDirection &&
      providerSession &&
      providerSession.isConnecting()
    ) {
      const nextDirection = pendingSwitchDirection;
      pendingSwitchDirection = null;
      closeProvider();
      connectProvider(nextDirection);
      return;
    }

    if (pendingSwitchDirection) {
      const nextDirection = pendingSwitchDirection;
      pendingSwitchDirection = null;
      connectProvider(nextDirection);
    } else {
      closeBrowser();
    }
  };

  const connectProvider = (direction: TranslationDirection) => {
    cleanupFinishTimer();
    currentDirection = direction;
    currentTurnDetection = getTurnDetection(direction);
    currentSessionReady = false;
    hasLoggedAudioStreaming = false;
    hasLoggedPttStreaming = false;
    hasLoggedTargetPlayback = false;
    hasLoggedTargetTranslationStart = false;

    log("[Provider] connecting");
    sendStatus({
      bailianWs: "Connecting",
      realtimeSession: "Connecting"
    });

    const provider = providerFactory();
    providerSession = provider;
    const providerConnectTimeoutMs = Number.parseInt(
      getTrimmedEnv("PROVIDER_CONNECT_TIMEOUT_MS") || getTrimmedEnv("BAILIAN_CONNECT_TIMEOUT_MS") || "45000",
      10
    );
    const providerConnectTimer = setTimeout(
      () => {
        if (provider !== providerSession || currentSessionReady) {
          return;
        }

        safeSend(browserSocket, {
          type: "proxy.error",
          message: "Realtime provider connection timed out. Check public internet access and provider environment variables."
        });
        log("[Provider] connection timeout");
        provider.terminate();
      },
      Number.isFinite(providerConnectTimeoutMs) ? providerConnectTimeoutMs : 45000
    );

    provider.onEvent((providerEvent) => {
      if (provider !== providerSession) {
        return;
      }

      switch (providerEvent.type) {
        case "provider_connected":
          const providerSourceLanguage =
            direction === "conversation" ? currentTargetLanguage : currentSourceLanguage;
          const providerTargetLanguage =
            direction === "conversation" ? currentSourceLanguage : currentTargetLanguage;

          log("[Provider] connected");
          log(
            direction === "push_to_talk"
              ? `[Direction] ${providerSourceLanguage} -> ${providerTargetLanguage}`
              : `[Direction] ${providerSourceLanguage} -> ${providerTargetLanguage}`
          );
          provider.updateSession({
            direction,
            sourceLanguage: providerSourceLanguage,
            targetLanguage: providerTargetLanguage,
            turnDetection: currentTurnDetection,
            corpusPhrases: enableTranslationGlossary
              ? getCorpusPhrases(direction, providerSourceLanguage, providerTargetLanguage)
              : {}
          });
          sendStatus();
          break;
        case "provider_message": {
          const event = providerEvent.event;
          const messageText = providerEvent.raw;

          if (!event?.type) {
            debug("[Provider] received non-json message");
            forwardRaw(browserSocket, messageText);
            return;
          }

          safeSend(browserSocket, {
            type: "proxy.status",
            lastServerEventType: event.type,
            direction: currentDirection,
            turnDetection: currentTurnDetection
          });
          debug(`[Provider] event ${event.type}`);

          switch (event.type) {
            case "session.updated":
              clearTimeout(providerConnectTimer);
              currentSessionReady = true;
              if (currentDirection === "push_to_talk") {
                log(`[Session] push-to-talk ${currentSourceLanguage} -> ${currentTargetLanguage} ready`);
              } else {
                log(`[Session] conversation ${currentTargetLanguage} -> ${currentSourceLanguage} ready`);
              }
              safeSend(browserSocket, {
                type: "proxy.mode_ready",
                direction: currentDirection,
                sourceLanguage: currentSourceLanguage,
                targetLanguage: currentTargetLanguage,
                turnDetection: currentTurnDetection
              });
              safeSend(browserSocket, { type: "proxy.ready" });
              sendStatus({
                realtimeSession: "Connected"
              });
              break;
            case "input_audio_buffer.speech_started":
              log("[VAD] speech started");
              break;
            case "input_audio_buffer.speech_stopped":
              log("[VAD] speech stopped");
              break;
            case "conversation.item.input_audio_transcription.completed":
              log("[ASR] completed");
              break;
            case "input_audio_buffer.committed":
              log("[Audio] committed");
              break;
            case "response.audio_transcript.text":
              if (currentDirection === "push_to_talk" && !hasLoggedTargetTranslationStart) {
                hasLoggedTargetTranslationStart = true;
                log("[Translation] target started");
              }
              break;
            case "response.audio_transcript.done":
              log(
                currentDirection === "push_to_talk"
                  ? `[Translation] ${currentTargetLanguage} completed`
                  : "[Translation] completed"
              );
              break;
            case "response.audio.delta":
              if (currentDirection === "push_to_talk" && !hasLoggedTargetPlayback) {
                hasLoggedTargetPlayback = true;
                log("[Playback] target started");
              }
              break;
            case "session.finished":
              cleanupFinishTimer();
              log("[Session] finished");
              currentSessionReady = false;

              if (pendingSwitchDirection) {
                const nextDirection = pendingSwitchDirection;
                pendingSwitchDirection = null;
                closeProvider();
                connectProvider(nextDirection);
                return;
              }

              safeSend(browserSocket, {
                type: "proxy.status",
                realtimeSession: "Finished",
                bailianWs: "Finished"
              });
              forwardRaw(browserSocket, messageText);
              closeProvider();
              if (stopRequested) {
                setTimeout(closeBrowser, 300);
              }
              return;
            case "error":
              safeSend(browserSocket, {
                type: "proxy.error",
                aliyunCode: event.error?.code,
                message: event.error?.message || "Realtime API error."
              });
              break;
            default:
              break;
          }

          forwardRaw(browserSocket, messageText);
          break;
        }
        case "provider_unexpected_response":
          clearTimeout(providerConnectTimer);
          safeSend(browserSocket, {
            type: "proxy.error",
            statusCode: providerEvent.statusCode,
            aliyunCode: providerEvent.providerCode,
            message: providerEvent.message || "无法连接翻译服务。"
          });
          log(`[Provider] connection failed ${providerEvent.statusCode ?? "unknown"}`);
          closeBrowser();
          break;
        case "provider_error":
          clearTimeout(providerConnectTimer);
          safeSend(browserSocket, {
            type: "proxy.error",
            message: providerEvent.message
          });
          log("[Provider] error");
          break;
        case "provider_closed":
          clearTimeout(providerConnectTimer);
          currentSessionReady = false;
          safeSend(browserSocket, {
            type: "proxy.status",
            bailianWs: "Disconnected",
            realtimeSession: pendingSwitchDirection ? "Connecting" : "Finished"
          });
          break;
        default:
          break;
      }
    });

    provider.connect();
  };

  if (authenticated) {
    startProviderSession();
  } else {
    safeSend(browserSocket, {
      type: "proxy.status",
      browserWs: "Connected",
      bailianWs: "Disconnected",
      realtimeSession: "Disconnected",
      direction: currentDirection,
      turnDetection: currentTurnDetection
    });
  }

  browserSocket.on("message", (rawMessage, isBinary) => {
    const messageByteLength = getMessageByteLength(rawMessage);

    if (messageByteLength > securityRuntime.config.maxMessageSizeBytes) {
      closeWithGatewayError("message_size_exceeded", "Gateway message size limit exceeded.");
      return;
    }

    if (!authenticated) {
      if (isBinary) {
        closeWithGatewayError("unauthorized", "Gateway authentication required.");
        return;
      }

      try {
        const message = JSON.parse(rawMessage.toString()) as BrowserControlMessage;

        if (message.type === "auth" && message.token === securityRuntime.config.appAccessToken) {
          authenticated = true;
          if (authTimer) {
            clearTimeout(authTimer);
          }
          startProviderSession();
          return;
        }
      } catch {
        // Fall through to unauthorized handling.
      }

      closeWithGatewayError("unauthorized", "Gateway authentication required.");
      return;
    }

    if (isBinary) {
      if (!currentSessionReady || !providerSession?.isOpen() || pendingSwitchDirection) {
        return;
      }

      if (!hasLoggedAudioStreaming) {
        hasLoggedAudioStreaming = true;
        log(currentDirection === "push_to_talk" ? "[PTT] streaming source audio" : "[Audio] streaming");
      }

      if (currentDirection === "push_to_talk" && !hasLoggedPttStreaming) {
        hasLoggedPttStreaming = true;
        log("[PTT] streaming source audio");
      }

      const audio = Buffer.isBuffer(rawMessage)
        ? rawMessage
        : Array.isArray(rawMessage)
          ? Buffer.concat(rawMessage)
          : Buffer.from(rawMessage);

      sessionAudioBytes += audio.byteLength;
      if (sessionAudioBytes > securityRuntime.config.maxAudioBytesPerSession) {
        closeWithGatewayError("audio_limit_exceeded", "Gateway audio limit exceeded for this session.");
        return;
      }

      providerSession.sendAudio(audio);
      return;
    }

    try {
      const message = JSON.parse(rawMessage.toString()) as BrowserControlMessage;

      if (message.type === "browser.stop") {
        stopRequested = true;
        finishCurrentSession();
        return;
      }

      if (message.type === "browser.ptt_release") {
        log("[PTT] released");
        if (currentDirection === "push_to_talk" && providerSession?.isOpen()) {
          providerSession.commitAudio();
        }
        return;
      }

      if (message.type === "browser.set_direction") {
        const nextSourceLanguage = message.sourceLanguage ?? currentSourceLanguage;
        const nextTargetLanguage = message.targetLanguage ?? currentTargetLanguage;
        const sameSessionConfig =
          message.direction === currentDirection &&
          nextSourceLanguage === currentSourceLanguage &&
          nextTargetLanguage === currentTargetLanguage;

        if (sameSessionConfig && currentSessionReady) {
          safeSend(browserSocket, {
            type: "proxy.mode_ready",
            direction: currentDirection,
            sourceLanguage: currentSourceLanguage,
            targetLanguage: currentTargetLanguage,
            turnDetection: currentTurnDetection
          });
          return;
        }

        currentSourceLanguage = nextSourceLanguage;
        currentTargetLanguage = nextTargetLanguage;

        if (message.direction === "push_to_talk") {
          log("[PTT] pressed");
          log(`[Session] switching to ${currentSourceLanguage} -> ${currentTargetLanguage} manual`);
        } else {
          log(`[Session] restoring ${currentTargetLanguage} -> ${currentSourceLanguage} VAD`);
        }

        finishCurrentSession(message.direction, true);
      }
    } catch {
      debug("[Browser] ignored invalid message");
    }
  });

  browserSocket.on("close", () => {
    log("[Browser] disconnected");
    stopRequested = true;
    if (authTimer) {
      clearTimeout(authTimer);
    }
    cleanupSecuritySession();
    closeProvider();
  });

  browserSocket.on("error", () => {
    log("[Browser] error");
    stopRequested = true;
    if (authTimer) {
      clearTimeout(authTimer);
    }
    cleanupSecuritySession();
    closeProvider();
  });
  });

  return wss;
}

export function createRealtimeProxyServer(
  options: {
    server?: Server;
    host?: string;
    port?: number;
    path?: string;
    autoConnect?: boolean;
    securityConfig?: GatewaySecurityConfig;
    providerFactory?: RealtimeProviderFactory;
  } = {}
): WebSocketServer {
  if (!options.providerFactory) {
    assertSelectedProviderConfig();
  }

  const securityRuntime = createGatewaySecurityRuntime(options.securityConfig);
  const wss = options.server
    ? new WebSocketServer({
        server: options.server,
        path: options.path,
        verifyClient: ({ origin, req }, done) => verifyGatewayClient(securityRuntime, req, origin, done)
      })
    : new WebSocketServer({
        host: options.host ?? proxyHost,
        port: options.port ?? (Number.isFinite(proxyPort) ? proxyPort : PROXY_PORT),
        path: options.path ?? proxyPath,
        verifyClient: ({ origin, req }, done) => verifyGatewayClient(securityRuntime, req, origin, done)
      });

  return attachRealtimeProxy(wss, {
    autoConnect: options.autoConnect,
    securityRuntime,
    providerFactory: options.providerFactory
  });
}

export function startStandaloneRealtimeProxy(): WebSocketServer {
  const port = Number.isFinite(proxyPort) ? proxyPort : PROXY_PORT;
  log(`[Proxy] listening on ws://${proxyHost}:${port}${proxyPath ?? ""}`);
  return createRealtimeProxyServer({
    host: proxyHost,
    port,
    path: proxyPath
  });
}
