"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  INPUT_SAMPLE_RATE,
  MIN_PUSH_TO_TALK_MS,
  RECONNECT_BASE_DELAY_MS,
  RECONNECT_MAX_ATTEMPTS,
  RECONNECT_MAX_DELAY_MS,
  getBrowserRealtimeProxyUrl
} from "../lib/config/realtime";
import type {
  AppStatus,
  BailianServerEvent,
  ClientRealtimeMessage,
  ConversationMode,
  DebugInfo,
  PartnerLanguage,
  ProxyErrorMessage,
  ProxyModeReadyMessage,
  ProxyStatusMessage,
  PushToTalkState,
  TranslationDirection,
  TranslationHistoryItem,
  TurnDetectionMode
} from "../types/realtime";
import { useAudioPlayback } from "./useAudioPlayback";
import { useMicrophone } from "./useMicrophone";

const FINISH_WAIT_MS = 7000;
const PUSH_TO_TALK_TRANSLATION_TIMEOUT_MS = 12000;
const INITIAL_REALTIME_READY_TIMEOUT_MS = 45000;

const initialDebugInfo: DebugInfo = {
  browserWs: "Disconnected",
  bailianWs: "Disconnected",
  microphone: "Stopped",
  audioContext: "unavailable",
  realtimeSession: "Disconnected",
  direction: "other_to_chinese",
  partnerLanguage: "ja",
  turnDetection: "server_vad",
  pushToTalk: "idle",
  audioForwarding: false,
  playbackQueue: "empty",
  lastServerEventType: "none"
};

function createHistoryId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getStreamingText(event: BailianServerEvent): string {
  return `${event.text ?? ""}${event.stash ?? ""}`;
}

function mergeStreamingText(current: string, event: BailianServerEvent): string {
  const next = getStreamingText(event);

  if (!next) {
    return current;
  }

  if (next.startsWith(current) || event.stash !== undefined || !current) {
    return next;
  }

  return `${current}${next}`;
}

function getFinalText(event: BailianServerEvent): string {
  return event.transcript ?? event.text ?? "";
}

function getAudioDelta(event: BailianServerEvent): string {
  return event.delta ?? event.audio ?? "";
}

function getUserFriendlyError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "无法访问麦克风，请检查浏览器权限。";
    }

    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return "未找到可用麦克风。";
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "翻译服务暂时不可用。";
}

function isProxyStatusMessage(message: ClientRealtimeMessage): message is ProxyStatusMessage {
  return message.type === "proxy.status";
}

function isProxyErrorMessage(message: ClientRealtimeMessage): message is ProxyErrorMessage {
  return message.type === "proxy.error";
}

function isProxyModeReadyMessage(message: ClientRealtimeMessage): message is ProxyModeReadyMessage {
  return message.type === "proxy.mode_ready";
}

function compactDebugPatch(message: ProxyStatusMessage): Partial<DebugInfo> {
  const patch: Partial<DebugInfo> = {};

  if (message.browserWs) patch.browserWs = message.browserWs;
  if (message.bailianWs) patch.bailianWs = message.bailianWs;
  if (message.realtimeSession) patch.realtimeSession = message.realtimeSession;
  if (message.direction) patch.direction = message.direction;
  if (message.partnerLanguage) patch.partnerLanguage = message.partnerLanguage;
  if (message.turnDetection) patch.turnDetection = message.turnDetection;
  if (typeof message.audioForwarding === "boolean") patch.audioForwarding = message.audioForwarding;
  if (message.lastServerEventType) patch.lastServerEventType = message.lastServerEventType;

  return patch;
}

export function useRealtimeTranslation() {
  const [status, setStatus] = useState<AppStatus>("idle");
  const [conversationMode, setConversationMode] = useState<ConversationMode>("LISTENING_TO_OTHER");
  const [pushToTalkState, setPushToTalkState] = useState<PushToTalkState>("idle");
  const [currentSourceTranscript, setCurrentSourceTranscript] = useState("");
  const [finalSourceTranscript, setFinalSourceTranscript] = useState("");
  const [currentTranslation, setCurrentTranslation] = useState("");
  const [currentMyTranscript, setCurrentMyTranscript] = useState("");
  const [finalMyTranscript, setFinalMyTranscript] = useState("");
  const [currentJapaneseTranslation, setCurrentJapaneseTranslation] = useState("");
  const [finalJapaneseTranslation, setFinalJapaneseTranslation] = useState("");
  const [showLargeJapanese, setShowLargeJapanese] = useState(false);
  const [partnerLanguage, setPartnerLanguageState] = useState<PartnerLanguage>("ja");
  const [history, setHistory] = useState<TranslationHistoryItem[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [debugInfo, setDebugInfo] = useState<DebugInfo>(initialDebugInfo);
  const socketRef = useRef<WebSocket | null>(null);
  const audioForwardingRef = useRef(false);
  const activeDirectionRef = useRef<TranslationDirection>("other_to_chinese");
  const partnerLanguageRef = useRef<PartnerLanguage>("ja");
  const turnDetectionRef = useRef<TurnDetectionMode>("server_vad");
  const conversationModeRef = useRef<ConversationMode>("LISTENING_TO_OTHER");
  const statusRef = useRef<AppStatus>("idle");
  const pendingSourceRef = useRef("");
  const pendingTranslationRef = useRef("");
  const pendingMyTranscriptRef = useRef("");
  const pendingJapaneseTranslationRef = useRef("");
  const japaneseAudioChunksRef = useRef<string[]>([]);
  const japaneseTranscriptDoneRef = useRef(false);
  const japaneseAudioDoneRef = useRef(false);
  const restoreListenTimerRef = useRef<number | null>(null);
  const pushToTalkTranslationTimerRef = useRef<number | null>(null);
  const playbackQueueStateRef = useRef<"empty" | "playing">("empty");
  const pttBufferedChunksRef = useRef<ArrayBuffer[]>([]);
  const pttReleasePendingRef = useRef(false);
  const pttCancelPendingRef = useRef(false);
  const pttStartedAtRef = useRef(0);
  const pttAudioMsRef = useRef(0);
  const finishTimerRef = useRef<number | null>(null);
  const initialReadyResolverRef = useRef<(() => void) | null>(null);
  const initialReadyRejectRef = useRef<((error: Error) => void) | null>(null);
  const playbackQueueEmptyRef = useRef<() => void>(() => {});

  const patchDebugInfo = useCallback((patch: Partial<DebugInfo>) => {
    setDebugInfo((current) => ({
      ...current,
      ...patch
    }));
  }, []);

  const updateStatus = useCallback((nextStatus: AppStatus) => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  }, []);

  const updateConversationMode = useCallback((nextMode: ConversationMode) => {
    conversationModeRef.current = nextMode;
    setConversationMode(nextMode);
  }, []);

  const setAudioForwarding = useCallback(
    (enabled: boolean) => {
      audioForwardingRef.current = enabled;
      patchDebugInfo({ audioForwarding: enabled });
    },
    [patchDebugInfo]
  );

  const playback = useAudioPlayback({
    onStateChange: (audioContext) => patchDebugInfo({ audioContext }),
    onQueueStateChange: (playbackQueue) => {
      playbackQueueStateRef.current = playbackQueue;
      patchDebugInfo({ playbackQueue });
    },
    onQueueEmpty: () => playbackQueueEmptyRef.current()
  });
  const microphone = useMicrophone();

  const sendControl = useCallback((payload: object) => {
    const socket = socketRef.current;

    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  }, []);

  const countPcmDuration = useCallback((chunk: ArrayBuffer) => {
    return (chunk.byteLength / 2 / INPUT_SAMPLE_RATE) * 1000;
  }, []);

  const flushBufferedPushToTalkAudio = useCallback(() => {
    const socket = socketRef.current;

    if (socket?.readyState !== WebSocket.OPEN || pttBufferedChunksRef.current.length === 0) {
      pttBufferedChunksRef.current = [];
      return;
    }

    for (const chunk of pttBufferedChunksRef.current) {
      socket.send(chunk);
    }

    pttBufferedChunksRef.current = [];
  }, []);

  const addHistoryItem = useCallback((direction: TranslationDirection, source: string, translation: string) => {
    const normalizedSource = source.trim();
    const normalizedTranslation = translation.trim();

    if (!normalizedSource && !normalizedTranslation) {
      return;
    }

    setHistory((items) =>
      [
        {
          id: createHistoryId(),
          direction,
          source: normalizedSource,
          translation: normalizedTranslation,
          createdAt: Date.now()
        },
        ...items
      ].slice(0, 20)
    );
  }, []);

  const resetCurrentCaptions = useCallback(() => {
    setCurrentSourceTranscript("");
    setFinalSourceTranscript("");
    setCurrentTranslation("");
    setCurrentMyTranscript("");
    setFinalMyTranscript("");
    setCurrentJapaneseTranslation("");
    setFinalJapaneseTranslation("");
    pendingSourceRef.current = "";
    pendingTranslationRef.current = "";
    pendingMyTranscriptRef.current = "";
    pendingJapaneseTranslationRef.current = "";
    japaneseAudioChunksRef.current = [];
    japaneseTranscriptDoneRef.current = false;
    pttBufferedChunksRef.current = [];
    pttReleasePendingRef.current = false;
    pttCancelPendingRef.current = false;
    if (pushToTalkTranslationTimerRef.current) {
      window.clearTimeout(pushToTalkTranslationTimerRef.current);
      pushToTalkTranslationTimerRef.current = null;
    }
    setShowLargeJapanese(false);
  }, []);

  const clearFinishTimer = useCallback(() => {
    if (finishTimerRef.current) {
      window.clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }
  }, []);

  const clearRestoreListenTimer = useCallback(() => {
    if (restoreListenTimerRef.current) {
      window.clearTimeout(restoreListenTimerRef.current);
      restoreListenTimerRef.current = null;
    }
  }, []);

  const clearPushToTalkTranslationTimer = useCallback(() => {
    if (pushToTalkTranslationTimerRef.current) {
      window.clearTimeout(pushToTalkTranslationTimerRef.current);
      pushToTalkTranslationTimerRef.current = null;
    }
  }, []);

  const requestDirection = useCallback(
    (direction: TranslationDirection) => {
      sendControl({
        type: "browser.set_direction",
        direction,
        partnerLanguage: partnerLanguageRef.current
      });
    },
    [sendControl]
  );

  const setPartnerLanguage = useCallback(
    (nextLanguage: PartnerLanguage) => {
      const canChangeLanguage =
        statusRef.current === "idle" ||
        statusRef.current === "error" ||
        conversationModeRef.current === "LISTENING_TO_OTHER";

      if (!canChangeLanguage) {
        return;
      }

      partnerLanguageRef.current = nextLanguage;
      setPartnerLanguageState(nextLanguage);
      patchDebugInfo({ partnerLanguage: nextLanguage });
      setCurrentMyTranscript("");
      setFinalMyTranscript("");
      setCurrentJapaneseTranslation("");
      setFinalJapaneseTranslation("");
      setShowLargeJapanese(false);
      pendingMyTranscriptRef.current = "";
      pendingJapaneseTranslationRef.current = "";
      japaneseAudioChunksRef.current = [];
    },
    [patchDebugInfo]
  );

  const restoreListenMode = useCallback(() => {
    if (statusRef.current === "idle" || statusRef.current === "stopping") {
      return;
    }

    clearRestoreListenTimer();
    clearPushToTalkTranslationTimer();
    setAudioForwarding(false);
    activeDirectionRef.current = "other_to_chinese";
    turnDetectionRef.current = "server_vad";
    updateConversationMode("RESTORING_LISTEN_MODE");
    setPushToTalkState("idle");
    patchDebugInfo({
      direction: "other_to_chinese",
      turnDetection: "server_vad",
      pushToTalk: "idle"
    });
    requestDirection("other_to_chinese");
  }, [
    clearPushToTalkTranslationTimer,
    clearRestoreListenTimer,
    patchDebugInfo,
    requestDirection,
    setAudioForwarding,
    updateConversationMode
  ]);

  const schedulePushToTalkTranslationTimeout = useCallback(() => {
    clearPushToTalkTranslationTimer();
    pushToTalkTranslationTimerRef.current = window.setTimeout(() => {
      if (
        activeDirectionRef.current === "chinese_to_partner" &&
        conversationModeRef.current === "TRANSLATING_TO_JAPANESE"
      ) {
        setErrorMessage("这次中文语音没有完成翻译，请再按住说一次。");
        restoreListenMode();
      }
    }, PUSH_TO_TALK_TRANSLATION_TIMEOUT_MS);
  }, [clearPushToTalkTranslationTimer, restoreListenMode]);

  const scheduleRestoreListenMode = useCallback(() => {
    clearRestoreListenTimer();
    restoreListenTimerRef.current = window.setTimeout(() => {
      void (async () => {
        await playback.flushPendingAppends();

      if (
        activeDirectionRef.current === "chinese_to_partner" &&
        japaneseTranscriptDoneRef.current &&
        japaneseAudioDoneRef.current &&
        playbackQueueStateRef.current === "empty"
      ) {
        restoreListenMode();
      }
      })();
    }, 150);
  }, [clearRestoreListenTimer, playback, restoreListenMode]);

  const finishRealtimePushToTalk = useCallback(() => {
    const elapsedMs = performance.now() - pttStartedAtRef.current;
    const recordedMs = Math.max(elapsedMs, pttAudioMsRef.current);

    if (recordedMs < MIN_PUSH_TO_TALK_MS) {
      restoreListenMode();
      return;
    }

    updateConversationMode("TRANSLATING_TO_JAPANESE");
    setPushToTalkState("translating");
    patchDebugInfo({ pushToTalk: "translating" });
    schedulePushToTalkTranslationTimeout();
    sendControl({ type: "browser.ptt_release" });
  }, [patchDebugInfo, restoreListenMode, schedulePushToTalkTranslationTimeout, sendControl, updateConversationMode]);

  useEffect(() => {
    playbackQueueEmptyRef.current = () => {
      if (
        activeDirectionRef.current === "chinese_to_partner" &&
        japaneseTranscriptDoneRef.current &&
        japaneseAudioDoneRef.current &&
        playbackQueueStateRef.current === "empty" &&
        (conversationModeRef.current === "PLAYING_JAPANESE" ||
          conversationModeRef.current === "TRANSLATING_TO_JAPANESE" ||
          conversationModeRef.current === "COMMITTING_CHINESE")
      ) {
        scheduleRestoreListenMode();
      }
    };
  }, [playback.queueState, scheduleRestoreListenMode]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      if (
        statusRef.current !== "idle" &&
        statusRef.current !== "stopping" &&
        socketRef.current?.readyState !== WebSocket.OPEN
      ) {
        setErrorMessage("页面已恢复，正在检查连接状态……");
        updateStatus("connecting");
      }
    };

    window.addEventListener("pageshow", handleVisibilityChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pageshow", handleVisibilityChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [updateStatus]);

  const hardCleanup = useCallback(async () => {
    clearFinishTimer();
    clearRestoreListenTimer();
    clearPushToTalkTranslationTimer();
    setAudioForwarding(false);
    microphone.stop();
    patchDebugInfo({
      microphone: "Stopped",
      pushToTalk: "idle"
    });
    setPushToTalkState("idle");
    playback.clearQueue();

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.close();
    }

    socketRef.current = null;
    await playback.closeAudioContext();
    patchDebugInfo({
      browserWs: "Disconnected",
      bailianWs: "Disconnected",
      realtimeSession: "Finished",
      microphone: "Stopped",
      audioForwarding: false
    });
    activeDirectionRef.current = "other_to_chinese";
    turnDetectionRef.current = "server_vad";
    updateConversationMode("LISTENING_TO_OTHER");
    updateStatus("idle");
  }, [
    clearFinishTimer,
    clearPushToTalkTranslationTimer,
    clearRestoreListenTimer,
    microphone,
    patchDebugInfo,
    playback,
    setAudioForwarding,
    updateConversationMode,
    updateStatus
  ]);

  const handleModeReady = useCallback(
    (message: ProxyModeReadyMessage) => {
      activeDirectionRef.current = message.direction;
      partnerLanguageRef.current = message.partnerLanguage;
      setPartnerLanguageState(message.partnerLanguage);
      turnDetectionRef.current = message.turnDetection;
      patchDebugInfo({
        direction: message.direction,
        partnerLanguage: message.partnerLanguage,
        turnDetection: message.turnDetection
      });

      if (message.direction === "other_to_chinese") {
        clearPushToTalkTranslationTimer();
        setAudioForwarding(true);
        updateConversationMode("LISTENING_TO_OTHER");
        updateStatus("listening");
        initialReadyResolverRef.current?.();
        initialReadyResolverRef.current = null;
        initialReadyRejectRef.current = null;
        return;
      }

      clearRestoreListenTimer();
      clearPushToTalkTranslationTimer();
      japaneseTranscriptDoneRef.current = false;
      japaneseAudioDoneRef.current = false;
      japaneseAudioChunksRef.current = [];
      setCurrentMyTranscript("");
      setCurrentJapaneseTranslation("");
      setFinalJapaneseTranslation("");
      setShowLargeJapanese(false);
      setAudioForwarding(true);
      setPushToTalkState("pressed");
      updateConversationMode("SPEAKING_CHINESE");
      updateStatus("listening");
      patchDebugInfo({
        pushToTalk: "pressed"
      });

      flushBufferedPushToTalkAudio();

      if (pttCancelPendingRef.current) {
        pttCancelPendingRef.current = false;
        setAudioForwarding(false);
        restoreListenMode();
        return;
      }

      if (pttReleasePendingRef.current) {
        pttReleasePendingRef.current = false;
        setAudioForwarding(false);
        finishRealtimePushToTalk();
      }
    },
    [
      clearRestoreListenTimer,
      clearPushToTalkTranslationTimer,
      finishRealtimePushToTalk,
      flushBufferedPushToTalkAudio,
      patchDebugInfo,
      restoreListenMode,
      setAudioForwarding,
      updateConversationMode,
      updateStatus
    ]
  );

  const handleBailianEvent = useCallback(
    async (event: BailianServerEvent) => {
      if (!event.type) {
        return;
      }

      patchDebugInfo({ lastServerEventType: event.type });

      switch (event.type) {
        case "input_audio_buffer.speech_started":
          if (activeDirectionRef.current === "other_to_chinese") {
            updateStatus("listening");
          } else {
            clearPushToTalkTranslationTimer();
            setPushToTalkState("pressed");
            updateConversationMode("SPEAKING_CHINESE");
            updateStatus("listening");
            patchDebugInfo({ pushToTalk: "pressed" });
          }
          break;
        case "input_audio_buffer.speech_stopped":
          if (activeDirectionRef.current === "other_to_chinese") {
            updateStatus("translating");
          }
          break;
        case "input_audio_buffer.committed":
          if (activeDirectionRef.current === "chinese_to_partner") {
            setPushToTalkState("translating");
            updateConversationMode("TRANSLATING_TO_JAPANESE");
            updateStatus("translating");
            patchDebugInfo({ pushToTalk: "translating" });
          } else {
            updateStatus("translating");
          }
          break;
        case "conversation.item.input_audio_transcription.text": {
          if (activeDirectionRef.current === "chinese_to_partner") {
            pendingMyTranscriptRef.current = mergeStreamingText(pendingMyTranscriptRef.current, event);
            setCurrentMyTranscript(pendingMyTranscriptRef.current);
          } else {
            pendingSourceRef.current = mergeStreamingText(pendingSourceRef.current, event);
            setCurrentSourceTranscript(pendingSourceRef.current);
          }
          break;
        }
        case "conversation.item.input_audio_transcription.completed": {
          const text = getFinalText(event);

          if (activeDirectionRef.current === "chinese_to_partner") {
            pendingMyTranscriptRef.current = text || pendingMyTranscriptRef.current;
            setFinalMyTranscript(pendingMyTranscriptRef.current);
            setCurrentMyTranscript(pendingMyTranscriptRef.current);
          } else {
            pendingSourceRef.current = text || pendingSourceRef.current;
            setFinalSourceTranscript(pendingSourceRef.current);
            setCurrentSourceTranscript(pendingSourceRef.current);
          }
          break;
        }
        case "conversation.item.input_audio_transcription.failed":
          if (activeDirectionRef.current === "chinese_to_partner") {
            clearPushToTalkTranslationTimer();
            setErrorMessage("这次中文语音识别失败，请重新按住说中文。");
            restoreListenMode();
          } else {
            setErrorMessage("语音识别失败，但同传会继续监听。");
          }
          break;
        case "response.audio_transcript.text": {
          if (activeDirectionRef.current === "chinese_to_partner") {
            clearPushToTalkTranslationTimer();
            pendingJapaneseTranslationRef.current = mergeStreamingText(pendingJapaneseTranslationRef.current, event);
            setCurrentJapaneseTranslation(pendingJapaneseTranslationRef.current);
            setPushToTalkState("translating");
            updateConversationMode("TRANSLATING_TO_JAPANESE");
          } else {
            pendingTranslationRef.current = mergeStreamingText(pendingTranslationRef.current, event);
            setCurrentTranslation(pendingTranslationRef.current);
            updateStatus("translating");
          }
          break;
        }
        case "response.audio_transcript.done": {
          const text = getFinalText(event);

          if (activeDirectionRef.current === "chinese_to_partner") {
            clearPushToTalkTranslationTimer();
            pendingJapaneseTranslationRef.current = text || pendingJapaneseTranslationRef.current;
            japaneseTranscriptDoneRef.current = true;
            setFinalJapaneseTranslation(pendingJapaneseTranslationRef.current);
            setCurrentJapaneseTranslation(pendingJapaneseTranslationRef.current);
            addHistoryItem("chinese_to_partner", pendingMyTranscriptRef.current, pendingJapaneseTranslationRef.current);

            scheduleRestoreListenMode();
          } else {
            pendingTranslationRef.current = text || pendingTranslationRef.current;
            setCurrentTranslation(pendingTranslationRef.current);
            addHistoryItem("other_to_chinese", pendingSourceRef.current, pendingTranslationRef.current);
            pendingSourceRef.current = "";
            pendingTranslationRef.current = "";
          }
          break;
        }
        case "response.audio.delta": {
          clearRestoreListenTimer();
          const audioDelta = getAudioDelta(event);

          if (audioDelta) {
            if (activeDirectionRef.current === "chinese_to_partner") {
              clearPushToTalkTranslationTimer();
              japaneseAudioChunksRef.current.push(audioDelta);
              setPushToTalkState("playing");
              updateConversationMode("PLAYING_JAPANESE");
              patchDebugInfo({ pushToTalk: "playing" });
            } else {
              updateStatus(playback.muted ? "translating" : "playing");
            }

            await playback.appendBase64Pcm(audioDelta);
          }
          break;
        }
        case "response.audio.done":
          if (activeDirectionRef.current === "chinese_to_partner") {
            japaneseAudioDoneRef.current = true;
            scheduleRestoreListenMode();
          }
          break;
        case "response.done":
          if (activeDirectionRef.current === "chinese_to_partner") {
            clearPushToTalkTranslationTimer();
            japaneseAudioDoneRef.current = true;
            if (!japaneseTranscriptDoneRef.current) {
              japaneseTranscriptDoneRef.current = true;
            }
            scheduleRestoreListenMode();
          }
          break;
        case "session.finished":
          await hardCleanup();
          break;
        case "error":
          setErrorMessage(event.error?.message || "翻译服务暂时不可用。");
          updateConversationMode("ERROR");
          updateStatus("error");
          break;
        default:
          break;
      }
    },
    [
      addHistoryItem,
      hardCleanup,
      patchDebugInfo,
      playback,
      scheduleRestoreListenMode,
      clearRestoreListenTimer,
      clearPushToTalkTranslationTimer,
      restoreListenMode,
      updateConversationMode,
      updateStatus
    ]
  );

  const start = useCallback(async () => {
    if (statusRef.current !== "idle" && statusRef.current !== "error") {
      return;
    }

    setErrorMessage("");
    resetCurrentCaptions();
    updateStatus("requesting_permission");
    updateConversationMode("LISTENING_TO_OTHER");

    try {
      const audioContext = await playback.ensureAudioContext();
      await microphone.start({
        audioContext,
        onAudioChunk: (chunk) => {
          const socket = socketRef.current;
          const isPushToTalkPreparing =
            activeDirectionRef.current === "chinese_to_partner" &&
            (conversationModeRef.current === "PREPARING_TO_SPEAK" ||
              conversationModeRef.current === "COMMITTING_CHINESE") &&
            !audioForwardingRef.current;

          if (isPushToTalkPreparing) {
            pttAudioMsRef.current += countPcmDuration(chunk);

            if (pttBufferedChunksRef.current.length < 500) {
              pttBufferedChunksRef.current.push(chunk.slice(0));
            }
            return;
          }

          if (audioForwardingRef.current && socket?.readyState === WebSocket.OPEN) {
            if (activeDirectionRef.current === "chinese_to_partner") {
              pttAudioMsRef.current += countPcmDuration(chunk);
            }

            socket.send(chunk);
          }
        }
      });

      patchDebugInfo({
        audioContext: audioContext.state,
        microphone: "Active"
      });

      updateStatus("connecting");
      patchDebugInfo({
        browserWs: "Connecting",
        bailianWs: "Connecting",
        realtimeSession: "Connecting",
        direction: "other_to_chinese",
        turnDetection: "server_vad"
      });

      const proxyUrl = getBrowserRealtimeProxyUrl();
      let reconnectAttempts = 0;
      let reconnectTimer: number | null = null;

      const openBrowserSocket = (waitForInitialReady: boolean) =>
        new Promise<void>((resolve, reject) => {
          let browserSocketOpened = false;

          if (
            socketRef.current &&
            (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING)
          ) {
            socketRef.current.close();
          }

          const socket = new WebSocket(proxyUrl);
          socket.binaryType = "arraybuffer";
          socketRef.current = socket;

          const timeout = window.setTimeout(() => {
            if (socketRef.current === socket && socket.readyState === WebSocket.CONNECTING) {
              socket.close();
            }

            if (waitForInitialReady) {
              reject(
                new Error(
                  browserSocketOpened
                    ? "云端代理已连接，但百炼 Realtime 长时间未就绪，请检查 Function Compute 是否允许访问公网。"
                    : "无法连接翻译服务，请重新连接。"
                )
              );
            }
          }, INITIAL_REALTIME_READY_TIMEOUT_MS);

          const scheduleReconnect = () => {
            if (
              statusRef.current === "idle" ||
              statusRef.current === "stopping" ||
              reconnectAttempts >= RECONNECT_MAX_ATTEMPTS
            ) {
              if (reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
                setErrorMessage("连接已断开，请停止后重新开始同传。");
                updateConversationMode("ERROR");
                updateStatus("error");
              }
              return;
            }

            reconnectAttempts += 1;
            const delay = Math.min(
              RECONNECT_MAX_DELAY_MS,
              RECONNECT_BASE_DELAY_MS * 2 ** Math.max(0, reconnectAttempts - 1)
            );
            setErrorMessage("正在重新连接……");
            updateStatus("connecting");
            updateConversationMode("RESTORING_LISTEN_MODE");

            reconnectTimer = window.setTimeout(() => {
              reconnectTimer = null;
              void openBrowserSocket(false);
            }, delay);
          };

          initialReadyResolverRef.current = () => {
            window.clearTimeout(timeout);
            reconnectAttempts = 0;
            setErrorMessage("");
            resolve();
          };
          initialReadyRejectRef.current = reject;

          socket.onopen = () => {
            if (socketRef.current !== socket) {
              socket.close();
              return;
            }

            patchDebugInfo({ browserWs: "Connected" });
            browserSocketOpened = true;
          };

          socket.onerror = () => {
            if (socketRef.current !== socket) {
              return;
            }

            window.clearTimeout(timeout);
            if (waitForInitialReady) {
              reject(new Error("无法连接翻译服务，请重新连接。"));
            }
          };

          socket.onclose = () => {
            if (socketRef.current !== socket) {
              return;
            }

            window.clearTimeout(timeout);
            if (reconnectTimer) {
              window.clearTimeout(reconnectTimer);
              reconnectTimer = null;
            }
            patchDebugInfo({
              browserWs: "Disconnected",
              bailianWs: "Disconnected",
              audioForwarding: false
            });
            setAudioForwarding(false);

            if (waitForInitialReady) {
              reject(new Error("无法连接翻译服务，请重新连接。"));
              return;
            }

            scheduleReconnect();
          };

          socket.onmessage = async (event: MessageEvent<string>) => {
            if (socketRef.current !== socket) {
              return;
            }

            let message: ClientRealtimeMessage;

            try {
              message = JSON.parse(event.data) as ClientRealtimeMessage;
            } catch {
              return;
            }

            if (isProxyStatusMessage(message)) {
              patchDebugInfo(compactDebugPatch(message));
              return;
            }

            if (isProxyErrorMessage(message)) {
              setErrorMessage(message.message || "翻译服务暂时不可用。");
              updateConversationMode("ERROR");
              updateStatus("error");
              window.clearTimeout(timeout);
              initialReadyRejectRef.current?.(new Error(message.message || "翻译服务暂时不可用。"));
              return;
            }

            if (isProxyModeReadyMessage(message)) {
              handleModeReady(message);
              if (!waitForInitialReady && message.direction === "other_to_chinese") {
                reconnectAttempts = 0;
                setErrorMessage("");
              }
              return;
            }

            if (message.type === "proxy.ready") {
              return;
            }

            await handleBailianEvent(message);
          };
        });

      await openBrowserSocket(true);
    } catch (error) {
      console.error(error);
      setErrorMessage(getUserFriendlyError(error));
      updateConversationMode("ERROR");
      updateStatus("error");
      setAudioForwarding(false);
      microphone.stop();
      patchDebugInfo({ microphone: "Stopped" });
      playback.clearQueue();
    }
  }, [
    countPcmDuration,
    handleBailianEvent,
    handleModeReady,
    microphone,
    patchDebugInfo,
    playback,
    resetCurrentCaptions,
    setAudioForwarding,
    updateConversationMode,
    updateStatus
  ]);

  const beginPushToTalk = useCallback(() => {
    if (
      statusRef.current === "idle" ||
      conversationModeRef.current !== "LISTENING_TO_OTHER" ||
      activeDirectionRef.current !== "other_to_chinese"
    ) {
      return;
    }

    setErrorMessage("");
    setAudioForwarding(false);
    activeDirectionRef.current = "chinese_to_partner";
    partnerLanguageRef.current = partnerLanguage;
    turnDetectionRef.current = "manual";
    pttStartedAtRef.current = performance.now();
    pttAudioMsRef.current = 0;
    pttBufferedChunksRef.current = [];
    pttReleasePendingRef.current = false;
    pttCancelPendingRef.current = false;
    japaneseAudioDoneRef.current = false;
    clearPushToTalkTranslationTimer();
    clearRestoreListenTimer();
    updateConversationMode("PREPARING_TO_SPEAK");
    setPushToTalkState("pressed");
    patchDebugInfo({
      direction: "chinese_to_partner",
      partnerLanguage,
      turnDetection: "manual",
      pushToTalk: "pressed"
    });
    requestDirection("chinese_to_partner");
  }, [
    clearPushToTalkTranslationTimer,
    clearRestoreListenTimer,
    partnerLanguage,
    patchDebugInfo,
    requestDirection,
    setAudioForwarding,
    updateConversationMode
  ]);

  const endPushToTalk = useCallback(async () => {
    if (
      conversationModeRef.current !== "PREPARING_TO_SPEAK" &&
      conversationModeRef.current !== "SPEAKING_CHINESE"
    ) {
      return;
    }

    await playback.ensureAudioContext();

    if (conversationModeRef.current === "PREPARING_TO_SPEAK") {
      pttReleasePendingRef.current = true;
      updateConversationMode("TRANSLATING_TO_JAPANESE");
      setPushToTalkState("translating");
      patchDebugInfo({ pushToTalk: "translating" });
      schedulePushToTalkTranslationTimeout();
      return;
    }

    setAudioForwarding(false);
    finishRealtimePushToTalk();
  }, [
    finishRealtimePushToTalk,
    patchDebugInfo,
    playback,
    schedulePushToTalkTranslationTimeout,
    setAudioForwarding,
    updateConversationMode
  ]);

  const cancelPushToTalk = useCallback(() => {
    if (
      conversationModeRef.current !== "PREPARING_TO_SPEAK" &&
      conversationModeRef.current !== "SPEAKING_CHINESE"
    ) {
      return;
    }

    if (conversationModeRef.current === "PREPARING_TO_SPEAK") {
      pttCancelPendingRef.current = true;
      updateConversationMode("RESTORING_LISTEN_MODE");
      return;
    }

    setAudioForwarding(false);
    restoreListenMode();
  }, [restoreListenMode, setAudioForwarding, updateConversationMode]);

  const recoverListening = useCallback(() => {
    clearFinishTimer();
    clearRestoreListenTimer();
    clearPushToTalkTranslationTimer();
    playback.clearQueue();
    resetCurrentCaptions();
    setErrorMessage("");
    setAudioForwarding(false);
    activeDirectionRef.current = "other_to_chinese";
    turnDetectionRef.current = "server_vad";
    setPushToTalkState("idle");
    patchDebugInfo({
      direction: "other_to_chinese",
      turnDetection: "server_vad",
      pushToTalk: "idle",
      audioForwarding: false
    });

    if (statusRef.current === "idle" || statusRef.current === "stopping") {
      updateConversationMode("LISTENING_TO_OTHER");
      return;
    }

    updateConversationMode("RESTORING_LISTEN_MODE");
    requestDirection("other_to_chinese");
  }, [
    clearFinishTimer,
    clearPushToTalkTranslationTimer,
    clearRestoreListenTimer,
    patchDebugInfo,
    playback,
    requestDirection,
    resetCurrentCaptions,
    setAudioForwarding,
    updateConversationMode
  ]);

  const stop = useCallback(async () => {
    if (statusRef.current === "idle" || statusRef.current === "stopping") {
      return;
    }

    updateStatus("stopping");
    updateConversationMode("STOPPING");
    setAudioForwarding(false);
    microphone.stop();
    patchDebugInfo({ microphone: "Stopped", audioForwarding: false });
    playback.clearQueue();

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "browser.stop" }));
      finishTimerRef.current = window.setTimeout(() => {
        void hardCleanup();
      }, FINISH_WAIT_MS);
      return;
    }

    await hardCleanup();
  }, [hardCleanup, microphone, patchDebugInfo, playback, setAudioForwarding, updateConversationMode, updateStatus]);

  const clearCaptions = useCallback(() => {
    resetCurrentCaptions();
    setHistory([]);
    setErrorMessage("");
  }, [resetCurrentCaptions]);

  const toggleMuted = useCallback(() => {
    playback.setMuted((current) => {
      const nextMuted = !current;

      if (nextMuted) {
        playback.clearQueue();
      }

      return nextMuted;
    });
  }, [playback]);

  const replayJapanese = useCallback(async () => {
    if (japaneseAudioChunksRef.current.length === 0) {
      setErrorMessage("当前没有可重新播放的译文语音。");
      return;
    }

    playback.clearQueue();
    for (const chunk of japaneseAudioChunksRef.current) {
      await playback.appendBase64Pcm(chunk, true);
    }
  }, [playback]);

  const canStart = useMemo(() => status === "idle" || status === "error", [status]);
  const canPushToTalk = useMemo(
    () => status !== "idle" && conversationMode === "LISTENING_TO_OTHER" && debugInfo.realtimeSession === "Connected",
    [conversationMode, debugInfo.realtimeSession, status]
  );
  const isPushToTalkBusy = useMemo(
    () =>
      conversationMode === "COMMITTING_CHINESE" ||
      conversationMode === "TRANSLATING_TO_JAPANESE" ||
      conversationMode === "PLAYING_JAPANESE" ||
      conversationMode === "RESTORING_LISTEN_MODE",
    [conversationMode]
  );
  const isPushToTalkActive = useMemo(
    () => conversationMode === "PREPARING_TO_SPEAK" || conversationMode === "SPEAKING_CHINESE",
    [conversationMode]
  );

  return {
    status,
    conversationMode,
    pushToTalkState,
    canStart,
    canPushToTalk,
    isPushToTalkActive,
    isPushToTalkBusy,
    partnerLanguage,
    currentSourceTranscript,
    finalSourceTranscript,
    currentTranslation,
    currentMyTranscript,
    finalMyTranscript,
    currentJapaneseTranslation,
    finalJapaneseTranslation,
    showLargeJapanese,
    history,
    errorMessage,
    debugInfo: {
      ...debugInfo,
      microphone: microphone.active ? "Active" : debugInfo.microphone,
      audioContext: playback.audioContextState,
      pushToTalk: pushToTalkState,
      playbackQueue: playback.queueState
    },
    muted: playback.muted,
    start,
    stop,
    beginPushToTalk,
    endPushToTalk,
    cancelPushToTalk,
    recoverListening,
    clearCaptions,
    toggleMuted,
    setPartnerLanguage,
    replayJapanese,
    showLargeJapaneseView: () => setShowLargeJapanese(true),
    hideLargeJapaneseView: () => setShowLargeJapanese(false)
  };
}

