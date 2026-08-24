import type {
  BailianServerEvent,
  PartnerLanguage,
  TranslationDirection,
  TurnDetectionMode
} from "../../types/realtime";

export type RealtimeProviderSessionOptions = {
  direction: TranslationDirection;
  partnerLanguage: PartnerLanguage;
  turnDetection: TurnDetectionMode;
  corpusPhrases: Record<string, string>;
};

export type RealtimeProviderEvent =
  | {
      type: "open";
    }
  | {
      type: "message";
      raw: string;
      event?: BailianServerEvent;
    }
  | {
      type: "unexpected-response";
      statusCode?: number;
      providerCode?: string;
      message?: string;
    }
  | {
      type: "error";
      message: string;
    }
  | {
      type: "close";
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
