export type AppStatus =
  | "idle"
  | "requesting_permission"
  | "connecting"
  | "connected"
  | "listening"
  | "translating"
  | "playing"
  | "stopping"
  | "error";

export type LanguageCode = string;
export type TranslationDirection = "conversation" | "push_to_talk";
export type TurnDetectionMode = "server_vad" | "manual";
export type PushToTalkState = "idle" | "pressed" | "translating" | "playing";

export type ConversationMode =
  | "LISTENING_TO_OTHER"
  | "PREPARING_TO_SPEAK"
  | "SOURCE_SPEAKING"
  | "COMMITTING_SOURCE"
  | "TRANSLATING"
  | "PLAYING_TARGET"
  | "RESTORING_LISTEN_MODE"
  | "STOPPING"
  | "ERROR";

export type ConnectionFlag = "Connected" | "Disconnected" | "Connecting" | "Finished";
export type MicrophoneFlag = "Active" | "Stopped";

export type TranslationHistoryItem = {
  id: string;
  direction: TranslationDirection;
  source: string;
  translation: string;
  createdAt: number;
};

export type DebugInfo = {
  browserWs: ConnectionFlag;
  bailianWs: ConnectionFlag;
  microphone: MicrophoneFlag;
  audioContext: AudioContextState | "unavailable";
  realtimeSession: ConnectionFlag;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  direction: TranslationDirection;
  turnDetection: TurnDetectionMode;
  pushToTalk: PushToTalkState;
  audioForwarding: boolean;
  playbackQueue: "empty" | "playing";
  lastServerEventType: string;
};

export type ProxyStatusMessage = {
  type: "proxy.status";
  browserWs?: ConnectionFlag;
  bailianWs?: ConnectionFlag;
  microphone?: MicrophoneFlag;
  realtimeSession?: ConnectionFlag;
  sourceLanguage?: LanguageCode;
  targetLanguage?: LanguageCode;
  direction?: TranslationDirection;
  turnDetection?: TurnDetectionMode;
  audioForwarding?: boolean;
  lastServerEventType?: string;
};

export type ProxyReadyMessage = {
  type: "proxy.ready";
};

export type ProxyModeReadyMessage = {
  type: "proxy.mode_ready";
  direction: TranslationDirection;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  turnDetection: TurnDetectionMode;
};

export type ProxyErrorMessage = {
  type: "proxy.error";
  gatewayCode?: string;
  statusCode?: number;
  aliyunCode?: string;
  message: string;
};

export type BrowserControlMessage = {
  type: "browser.stop";
} | {
  type: "auth";
  token: string;
} | {
  type: "browser.set_direction";
  direction: TranslationDirection;
  sourceLanguage?: LanguageCode;
  targetLanguage?: LanguageCode;
} | {
  type: "browser.ptt_release";
};

export type ProviderServerEvent = {
  type?: string;
  item_id?: string;
  response_id?: string;
  text?: string;
  stash?: string;
  transcript?: string;
  delta?: string;
  audio?: string;
  error?: {
    code?: string;
    message?: string;
  };
};

export type ClientRealtimeMessage =
  | ProxyStatusMessage
  | ProxyReadyMessage
  | ProxyModeReadyMessage
  | ProxyErrorMessage
  | ProviderServerEvent;
