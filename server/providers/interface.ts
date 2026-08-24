import type {
  ProviderServerEvent,
  LanguageCode,
  TranslationDirection,
  TurnDetectionMode
} from "../../types/realtime";

export type RealtimeProviderSessionOptions = {
  direction: TranslationDirection;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  turnDetection: TurnDetectionMode;
  corpusPhrases: Record<string, string>;
};

export type RealtimeProviderEvent =
  | {
      type: "provider_connected";
    }
  | {
      type: "provider_message";
      raw: string;
      event?: ProviderServerEvent;
    }
  | {
      type: "provider_unexpected_response";
      statusCode?: number;
      providerCode?: string;
      message?: string;
    }
  | {
      type: "provider_error";
      message: string;
    }
  | {
      type: "provider_closed";
    };

export type RealtimeProviderEventHandler = (event: RealtimeProviderEvent) => void;

export class ProviderConnectionError extends Error {
  constructor(message = "Realtime provider connection failed.") {
    super(message);
    this.name = "ProviderConnectionError";
  }
}

export class ProviderAuthenticationError extends Error {
  constructor(message = "Realtime provider authentication failed.") {
    super(message);
    this.name = "ProviderAuthenticationError";
  }
}

export class ProviderResponseError extends Error {
  constructor(message = "Realtime provider returned an invalid response.") {
    super(message);
    this.name = "ProviderResponseError";
  }
}

export interface RealtimeProvider {
  readonly name: string;

  connect(): void;
  updateSession(options: RealtimeProviderSessionOptions): void;
  sendAudio(audio: Buffer): void;
  sendText(text: string): void;
  commitAudio(): void;
  finishSession(): void;
  close(): void;
  terminate(): void;
  isOpen(): boolean;
  isConnecting(): boolean;
  onEvent(handler: RealtimeProviderEventHandler): void;
}

export type RealtimeProviderFactory = () => RealtimeProvider;
