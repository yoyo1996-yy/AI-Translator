import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { INPUT_SAMPLE_RATE } from "../../../lib/config/realtime";
import { getProviderCapabilities } from "../../../lib/languages/registry";
import type { RealtimeProviderCapabilities } from "../../../lib/languages/registry";
import type { ProviderServerEvent } from "../../../types/realtime";
import {
  ProviderAuthenticationError,
  ProviderConnectionError,
  ProviderResponseError
} from "../interface";
import type {
  RealtimeProvider,
  RealtimeProviderEvent,
  RealtimeProviderEventHandler,
  RealtimeProviderSessionOptions
} from "../interface";
import {
  OPENAI_REALTIME_INPUT_SAMPLE_RATE,
  loadOpenAIProviderConfig
} from "./openai-config";
import type { OpenAIProviderConfig } from "./openai-config";
import { mapOpenAITranslationEvent } from "./openai-events";
import { toOpenAITranslationLanguage } from "./openai-language";

type ParsedProviderError = {
  code?: string;
  message?: string;
};

function parseProviderError(body: string): ParsedProviderError {
  try {
    const parsed = JSON.parse(body) as { error?: { code?: unknown; message?: unknown; type?: unknown } };

    return {
      code:
        typeof parsed.error?.code === "string"
          ? parsed.error.code
          : typeof parsed.error?.type === "string"
            ? parsed.error.type
            : undefined,
      message: typeof parsed.error?.message === "string" ? parsed.error.message : undefined
    };
  } catch {
    return {
      message: body
    };
  }
}

function createProviderError(statusCode?: number, message?: string): Error {
  if (statusCode === 401 || statusCode === 403) {
    return new ProviderAuthenticationError(message || "Realtime provider authentication failed.");
  }

  if (statusCode && statusCode >= 400) {
    return new ProviderResponseError(message || "Realtime provider returned an error response.");
  }

  return new ProviderConnectionError(message || "Realtime provider connection failed.");
}

function readPcm16Sample(audio: Buffer, sampleIndex: number): number {
  const byteIndex = Math.min(sampleIndex * 2, audio.byteLength - 2);
  return audio.readInt16LE(byteIndex);
}

export function resamplePcm16Mono(audio: Buffer, fromSampleRate: number, toSampleRate: number): Buffer {
  if (audio.byteLength === 0 || fromSampleRate === toSampleRate) {
    return audio;
  }

  const sourceSampleCount = Math.floor(audio.byteLength / 2);
  const targetSampleCount = Math.max(1, Math.round((sourceSampleCount * toSampleRate) / fromSampleRate));
  const output = Buffer.alloc(targetSampleCount * 2);

  for (let targetIndex = 0; targetIndex < targetSampleCount; targetIndex += 1) {
    const sourcePosition = (targetIndex * fromSampleRate) / toSampleRate;
    const lowerIndex = Math.floor(sourcePosition);
    const upperIndex = Math.min(lowerIndex + 1, sourceSampleCount - 1);
    const fraction = sourcePosition - lowerIndex;
    const lowerSample = readPcm16Sample(audio, lowerIndex);
    const upperSample = readPcm16Sample(audio, upperIndex);
    const sample = Math.round(lowerSample + (upperSample - lowerSample) * fraction);

    output.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), targetIndex * 2);
  }

  return output;
}

function createSessionUpdateEvent(options: RealtimeProviderSessionOptions) {
  return {
    event_id: `event_${randomUUID()}`,
    type: "session.update",
    session: {
      audio: {
        input: {
          transcription: {
            model: "gpt-4o-transcribe"
          }
        },
        output: {
          language: toOpenAITranslationLanguage(options.targetLanguage)
        }
      }
    }
  };
}

function createAudioAppendEvent(audio: Buffer) {
  const convertedAudio = resamplePcm16Mono(audio, INPUT_SAMPLE_RATE, OPENAI_REALTIME_INPUT_SAMPLE_RATE);

  return {
    event_id: `event_${randomUUID()}`,
    type: "session.input_audio_buffer.append",
    audio: convertedAudio.toString("base64")
  };
}

function createSessionCloseEvent() {
  return {
    event_id: `event_${randomUUID()}`,
    type: "session.close"
  };
}

function createTextEvent(text: string) {
  return {
    event_id: `event_${randomUUID()}`,
    type: "session.input_text.submit",
    text
  };
}

export class OpenAIRealtimeProvider implements RealtimeProvider {
  readonly name = "openai";

  private readonly config: OpenAIProviderConfig;
  private socket: WebSocket | null = null;
  private handler: RealtimeProviderEventHandler = () => {};

  constructor(config = loadOpenAIProviderConfig()) {
    this.config = config;
  }

  onEvent(handler: RealtimeProviderEventHandler): void {
    this.handler = handler;
  }

  getCapabilities(): RealtimeProviderCapabilities {
    return getProviderCapabilities("openai");
  }

  connect(): void {
    const url = new URL(this.config.endpoint);
    url.searchParams.set("model", this.config.model);
    const handshakeTimeout = Number.isFinite(this.config.connectTimeoutMs) ? this.config.connectTimeoutMs : 45000;
    const socket = new WebSocket(url, {
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
        event = mapOpenAITranslationEvent(JSON.parse(raw)) ?? undefined;
      } catch {
        event = undefined;
      }

      this.emit({
        type: "provider_message",
        raw: event ? JSON.stringify(event) : raw,
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
        const providerError = createProviderError(response.statusCode, parsed.message);

        this.emit({
          type: "provider_unexpected_response",
          statusCode: response.statusCode,
          providerCode: parsed.code,
          message: providerError.message
        });
      });
    });

    socket.on("error", (error) => {
      if (socket === this.socket) {
        this.emit({
          type: "provider_error",
          message: new ProviderConnectionError(error.message).message
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
    this.sendJson(createTextEvent(text));
  }

  commitAudio(): void {
    // OpenAI translation sessions stream continuously and do not use response.create.
    // The current official translation client events do not require an audio commit.
  }

  finishSession(): void {
    this.sendJson(createSessionCloseEvent());
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

export function createOpenAIRealtimeProvider(): RealtimeProvider {
  return new OpenAIRealtimeProvider();
}
