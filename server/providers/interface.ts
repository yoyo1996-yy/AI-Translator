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
