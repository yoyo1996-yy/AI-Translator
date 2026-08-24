import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import {
  ASR_MODEL,
  INPUT_SAMPLE_RATE,
  REALTIME_MODEL,
  normalizeDashScopeRegion
} from "../../lib/config/realtime";
import type { ProviderServerEvent } from "../../types/realtime";
import type {
  RealtimeProvider,
  RealtimeProviderEvent,
  RealtimeProviderEventHandler,
  RealtimeProviderSessionOptions
} from "./interface";

type ParsedProviderError = {
  code?: string;
  message?: string;
};

type BailianProviderConfig = {
  apiKey: string;
  workspaceId: string;
  region: string;
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

function parseProviderError(body: string): ParsedProviderError {
  try {
    const parsed = JSON.parse(body) as { code?: unknown; message?: unknown };

    return {
      code: typeof parsed.code === "string" ? parsed.code : undefined,
      message: typeof parsed.message === "string" ? parsed.message : undefined
    };
  } catch {
    return {
      message: body
    };
  }
}

function loadBailianProviderConfig(): BailianProviderConfig {
  return {
    apiKey: getCleanSecretEnv("DASHSCOPE_API_KEY"),
    workspaceId: getTrimmedEnv("DASHSCOPE_WORKSPACE_ID"),
    region: normalizeDashScopeRegion(getTrimmedEnv("DASHSCOPE_REGION")),
    connectTimeoutMs: Number.parseInt(
      getTrimmedEnv("PROVIDER_CONNECT_TIMEOUT_MS") || getTrimmedEnv("BAILIAN_CONNECT_TIMEOUT_MS") || "45000",
      10
    )
  };
}

export function assertBailianProviderConfig(): void {
  const config = loadBailianProviderConfig();

  if (!config.apiKey || !config.workspaceId) {
    console.error("Missing required environment variables:");
    console.error("DASHSCOPE_API_KEY and/or DASHSCOPE_WORKSPACE_ID.");
    process.exit(1);
  }
}

function getEndpoint(config: BailianProviderConfig): string {
  const encodedModel = encodeURIComponent(REALTIME_MODEL);
  return `wss://${config.workspaceId}.${config.region}.maas.aliyuncs.com/api-ws/v1/realtime?model=${encodedModel}`;
}

function createSessionUpdateEvent(options: RealtimeProviderSessionOptions) {
  const isPushToTalk = options.direction === "push_to_talk";
  const transcriptionLanguage =
    options.sourceLanguage && options.sourceLanguage !== "auto" ? { language: options.sourceLanguage } : {};

  return {
    event_id: `event_${randomUUID()}`,
    type: "session.update",
    session: {
      modalities: ["text", "audio"],
      sample_rate: INPUT_SAMPLE_RATE,
      input_audio_format: "pcm",
      output_audio_format: "pcm",
      input_audio_transcription: {
        model: ASR_MODEL,
        ...transcriptionLanguage
      },
      translation: {
        language: options.targetLanguage,
        ...(Object.keys(options.corpusPhrases).length > 0
          ? {
              corpus: {
                phrases: options.corpusPhrases
              }
            }
          : {})
      },
      turn_detection: isPushToTalk
        ? null
        : {
            type: "server_vad",
            threshold: 0.2,
            silence_duration_ms: 1000
          }
    }
  };
}

function createAudioAppendEvent(audio: Buffer) {
  return {
    event_id: `event_${randomUUID()}`,
    type: "input_audio_buffer.append",
    audio: audio.toString("base64")
  };
}

function createSessionFinishEvent() {
  return {
    event_id: `event_${randomUUID()}`,
    type: "session.finish"
  };
}

function createAudioCommitEvent() {
  return {
    event_id: `event_${randomUUID()}`,
    type: "input_audio_buffer.commit"
  };
}

export class BailianRealtimeProvider implements RealtimeProvider {
  readonly name = "bailian";

  private readonly config: BailianProviderConfig;
  private socket: WebSocket | null = null;
  private handler: RealtimeProviderEventHandler = () => {};

  constructor(config = loadBailianProviderConfig()) {
    this.config = config;
  }

  onEvent(handler: RealtimeProviderEventHandler): void {
    this.handler = handler;
  }

  connect(): void {
    const handshakeTimeout = Number.isFinite(this.config.connectTimeoutMs) ? this.config.connectTimeoutMs : 45000;
    const socket = new WebSocket(getEndpoint(this.config), {
      family: 4,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`
      },
      handshakeTimeout,
      perMessageDeflate: false
    });

    this.socket = socket;

    socket.on("open", () => {
      if (socket === this.socket) {
        this.emit({ type: "provider_connected" });
      }
    });

    socket.on("message", (rawMessage) => {
      if (socket !== this.socket) {
        return;
      }

      const raw = rawMessage.toString();
      let event: ProviderServerEvent | undefined;

      try {
        event = JSON.parse(raw) as ProviderServerEvent;
      } catch {
        event = undefined;
      }

      this.emit({
        type: "provider_message",
        raw,
        event
      });
    });

    socket.on("unexpected-response", (_request, response) => {
      const chunks: Buffer[] = [];

      response.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });

      response.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8").trim();
        const parsed = parseProviderError(body);

        this.emit({
          type: "provider_unexpected_response",
          statusCode: response.statusCode,
          providerCode: parsed.code,
          message: parsed.message || "无法连接翻译服务。"
        });
      });
    });

    socket.on("error", (error) => {
      if (socket === this.socket) {
        this.emit({
          type: "provider_error",
          message: error.message
        });
      }
    });

    socket.on("close", () => {
      if (socket === this.socket) {
        this.emit({ type: "provider_closed" });
      }
    });
  }

  updateSession(options: RealtimeProviderSessionOptions): void {
    this.sendJson(createSessionUpdateEvent(options));
  }

  sendAudio(audio: Buffer): void {
    this.sendJson(createAudioAppendEvent(audio));
  }

  sendText(text: string): void {
    this.sendJson({
      event_id: `event_${randomUUID()}`,
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text
          }
        ]
      }
    });
  }

  commitAudio(): void {
    this.sendJson(createAudioCommitEvent());
  }

  finishSession(): void {
    this.sendJson(createSessionFinishEvent());
  }

  close(): void {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      this.socket.close();
    }
  }

  terminate(): void {
    this.socket?.terminate();
  }

  isOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  isConnecting(): boolean {
    return this.socket?.readyState === WebSocket.CONNECTING;
  }

  private sendJson(payload: unknown): void {
    if (this.isOpen()) {
      this.socket?.send(JSON.stringify(payload));
    }
  }

  private emit(event: RealtimeProviderEvent): void {
    this.handler(event);
  }
}

export function createBailianRealtimeProvider(): RealtimeProvider {
  return new BailianRealtimeProvider();
}
