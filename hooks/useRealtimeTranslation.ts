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
  ClientRealtimeMessage,
  ConversationMode,
  DebugInfo,
  LanguageCode,
  ProviderServerEvent,
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
  direction: "conversation",
  sourceLanguage: "zh",
  targetLanguage: "ja",
  turnDetection: "server_vad",
  pushToTalk: "idle",
  audioForwarding: false,
  playbackQueue: "empty",
  lastServerEventType: "none"
};

function createHistoryId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getStreamingText(event: ProviderServerEvent): string {
  return `${event.text ?? ""}${event.stash ?? ""}`;
}

function mergeStreamingText(current: string, event: ProviderServerEvent): string {
  const next = getStreamingText(event);

  if (!next) {
    return current;
  }

  if (next.startsWith(current) || event.stash !== undefined || !current) {
    return next;
  }

  return `${current}${next}`;
}

function getFinalText(event: ProviderServerEvent): string {
  return event.transcript ?? event.text ?? "";
}

function getAudioDelta(event: ProviderServerEvent): string {
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
  if (message.sourceLanguage) patch.sourceLanguage = message.sourceLanguage;
  if (message.targetLanguage) patch.targetLanguage = message.targetLanguage;
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
  const [currentTargetTranslation, setCurrentTargetTranslation] = useState("");
  const [finalTargetTranslation, setFinalTargetTranslation] = useState("");
  const [showLargeTarget, setShowLargeTarget] = useState(false);
  const [sourceLanguage, setSourceLanguageState] = useState<LanguageCode>("zh");
  const [targetLanguage, setTargetLanguageState] = useState<LanguageCode>("ja");
  const [history, setHistory] = useState<TranslationHistoryItem[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [debugInfo, setDebugInfo] = useState<DebugInfo>(initialDebugInfo);
  const socketRef = useRef<WebSocket | null>(null);
  const audioForwardingRef = useRef(false);
  const activeDirectionRef = useRef<TranslationDirection>("conversation");
  const sourceLanguageRef = useRef<LanguageCode>("zh");
  const targetLanguageRef = useRef<LanguageCode>("ja");
  const turnDetectionRef = useRef<TurnDetectionMode>("server_vad");
  const conversationModeRef = useRef<ConversationMode>("LISTENING_TO_OTHER");
  const statusRef = useRef<AppStatus>("idle");
  const pendingSourceRef = useRef("");
  const pendingTranslationRef = useRef("");
  const pendingMyTranscriptRef = useRef("");
  const pendingTargetTranslationRef = useRef("");
  const targetAudioChunksRef = useRef<string[]>([]);
  const targetTranscriptDoneRef = useRef(false);
  const targetAudioDoneRef = useRef(false);
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
    setCurrentTargetTranslation("");
    setFinalTargetTranslation("");
    pendingSourceRef.current = "";
    pendingTranslationRef.current = "";
    pendingMyTranscriptRef.current = "";
    pendingTargetTranslationRef.current = "";
    targetAudioChunksRef.current = [];
    targetTranscriptDoneRef.current = false;
    pttBufferedChunksRef.current = [];
    pttReleasePendingRef.current = false;
    pttCancelPendingRef.current = false;
    if (pushToTalkTranslationTimerRef.current) {
      window.clearTimeout(pushToTalkTranslationTimerRef.current);
      pushToTalkTranslationTimerRef.current = null;
    }
    setShowLargeTarget(false);
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
        sourceLanguage: sourceLanguageRef.current,
        targetLanguage: targetLanguageRef.current
      });
    },
    [sendControl]
  );

  const setSourceLanguage = useCallback(
    (nextLanguage: LanguageCode) => {
      const canChangeLanguage =
        statusRef.current === "idle" ||
        statusRef.current === "error" ||
        conversationModeRef.current === "LISTENING_TO_OTHER";

      if (!canChangeLanguage) {
        return;
      }

      sourceLanguageRef.current = nextLanguage;
      setSourceLanguageState(nextLanguage);
      patchDebugInfo({ sourceLanguage: nextLanguage });
      setCurrentSourceTranscript("");
      setFinalSourceTranscript("");
      setCurrentTranslation("");
      setCurrentMyTranscript("");
      setFinalMyTranscript("");
      setCurrentTargetTranslation("");
      setFinalTargetTranslation("");
      setShowLargeTarget(false);
      pendingSourceRef.current = "";
      pendingTranslationRef.current = "";
      pendingMyTranscriptRef.current = "";
      pendingTargetTranslationRef.current = "";
      targetAudioChunksRef.current = [];
    },
    [patchDebugInfo]
  );

  const setTargetLanguage = useCallback(
    (nextLanguage: LanguageCode) => {
      const canChangeLanguage =
        statusRef.current === "idle" ||
        statusRef.current === "error" ||
        conversationModeRef.current === "LISTENING_TO_OTHER";

      if (!canChangeLanguage) {
        return;
      }

      targetLanguageRef.current = nextLanguage;
      setTargetLanguageState(nextLanguage);
      patchDebugInfo({ targetLanguage: nextLanguage });
      setCurrentMyTranscript("");
      setFinalMyTranscript("");
      setCurrentTargetTranslation("");
      setFinalTargetTranslation("");
      setShowLargeTarget(false);
      pendingMyTranscriptRef.current = "";
      pendingTargetTranslationRef.current = "";
      targetAudioChunksRef.current = [];
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
    activeDirectionRef.current = "conversation";
    turnDetectionRef.current = "server_vad";
    updateConversationMode("RESTORING_LISTEN_MODE");
    setPushToTalkState("idle");
    patchDebugInfo({
      direction: "conversation",
      turnDetection: "server_vad",
      pushToTalk: "idle"
    });
    requestDirection("conversation");
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
        activeDirectionRef.current === "push_to_talk" &&
        conversationModeRef.current === "TRANSLATING"
      ) {
        setErrorMessage("这次语音没有完成翻译，请再按住说一次。");
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
        activeDirectionRef.current === "push_to_talk" &&
        targetTranscriptDoneRef.current &&
        targetAudioDoneRef.current &&
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

    updateConversationMode("TRANSLATING");
    setPushToTalkState("translating");
    patchDebugInfo({ pushToTalk: "translating" });
    schedulePushToTalkTranslationTimeout();
    sendControl({ type: "browser.ptt_release" });
  }, [patchDebugInfo, restoreListenMode, schedulePushToTalkTranslationTimeout, sendControl, updateConversationMode]);

  useEffect(() => {
    playbackQueueEmptyRef.current = () => {
      if (
        activeDirectionRef.current === "push_to_talk" &&
        targetTranscriptDoneRef.current &&
        targetAudioDoneRef.current &&
        playbackQueueStateRef.current === "empty" &&
        (conversationModeRef.current === "PLAYING_TARGET" ||
          conversationModeRef.current === "TRANSLATING" ||
          conversationModeRef.current === "COMMITTING_SOURCE")
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
    activeDirectionRef.current = "conversation";
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
      sourceLanguageRef.current = message.sourceLanguage;
      setSourceLanguageState(message.sourceLanguage);
      targetLanguageRef.current = message.targetLanguage;
      setTargetLanguageState(message.targetLanguage);
      turnDetectionRef.current = message.turnDetection;
      patchDebugInfo({
        direction: message.direction,
        sourceLanguage: message.sourceLanguage,
        targetLanguage: message.targetLanguage,
        turnDetection: message.turnDetection
      });

      if (message.direction === "conversation") {
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
      targetTranscriptDoneRef.current = false;
      targetAudioDoneRef.current = false;
      targetAudioChunksRef.current = [];
      setCurrentMyTranscript("");
      setCurrentTargetTranslation("");
      setFinalTargetTranslation("");
      setShowLargeTarget(false);
      setAudioForwarding(true);
      setPushToTalkState("pressed");
      updateConversationMode("SOURCE_SPEAKING");
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

  const handleProviderEvent = useCallback(
    async (event: ProviderServerEvent) => {
      if (!event.type) {
        return;
      }

      patchDebugInfo({ lastServerEventType: event.type });

      switch (event.type) {
        case "input_audio_buffer.speech_started":
          if (activeDirectionRef.current === "conversation") {
            updateStatus("listening");
          } else {
            clearPushToTalkTranslationTimer();
            setPushToTalkState("pressed");
            updateConversationMode("SOURCE_SPEAKING");
            updateStatus("listening");
            patchDebugInfo({ pushToTalk: "pressed" });
          }
          break;
        case "input_audio_buffer.speech_stopped":
          if (activeDirectionRef.current === "conversation") {
            updateStatus("translating");
          }
          break;
        case "input_audio_buffer.committed":
          if (activeDirectionRef.current === "push_to_talk") {
            setPushToTalkState("translating");
            updateConversationMode("TRANSLATING");
            updateStatus("translating");
            patchDebugInfo({ pushToTalk: "translating" });
          } else {
            updateStatus("translating");
          }
          break;
        case "conversation.item.input_audio_transcription.text": {
          if (activeDirectionRef.current === "push_to_talk") {
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

          if (activeDirectionRef.current === "push_to_talk") {
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
          if (activeDirectionRef.current === "push_to_talk") {
            clearPushToTalkTranslationTimer();
            setErrorMessage("这次语音识别失败，请重新按住说一次。");
            restoreListenMode();
          } else {
            setErrorMessage("语音识别失败，但同传会继续监听。");
          }
          break;
        case "response.audio_transcript.text": {
          if (activeDirectionRef.current === "push_to_talk") {
            clearPushToTalkTranslationTimer();
            pendingTargetTranslationRef.current = mergeStreamingText(pendingTargetTranslationRef.current, event);
            setCurrentTargetTranslation(pendingTargetTranslationRef.current);
            setPushToTalkState("translating");
            updateConversationMode("TRANSLATING");
          } else {
            pendingTranslationRef.current = mergeStreamingText(pendingTranslationRef.current, event);
            setCurrentTranslation(pendingTranslationRef.current);
            updateStatus("translating");
          }
          break;
        }
        case "response.audio_transcript.done": {
          const text = getFinalText(event);

          if (activeDirectionRef.current === "push_to_talk") {
            clearPushToTalkTranslationTimer();
            pendingTargetTranslationRef.current = text || pendingTargetTranslationRef.current;
            targetTranscriptDoneRef.current = true;
            setFinalTargetTranslation(pendingTargetTranslationRef.current);
            setCurrentTargetTranslation(pendingTargetTranslationRef.current);
            addHistoryItem("push_to_talk", pendingMyTranscriptRef.current, pendingTargetTranslationRef.current);

            scheduleRestoreListenMode();
          } else {
            pendingTranslationRef.current = text || pendingTranslationRef.current;
            setCurrentTranslation(pendingTranslationRef.current);
            addHistoryItem("conversation", pendingSourceRef.current, pendingTranslationRef.current);
            pendingSourceRef.current = "";
            pendingTranslationRef.current = "";
          }
          break;
        }
        case "response.audio.delta": {
          clearRestoreListenTimer();
          const audioDelta = getAudioDelta(event);

          if (audioDelta) {
            if (activeDirectionRef.current === "push_to_talk") {
              clearPushToTalkTranslationTimer();
              targetAudioChunksRef.current.push(audioDelta);
              setPushToTalkState("playing");
              updateConversationMode("PLAYING_TARGET");
              patchDebugInfo({ pushToTalk: "playing" });
            } else {
              updateStatus(playback.muted ? "translating" : "playing");
            }

            await playback.appendBase64Pcm(audioDelta);
          }
          break;
        }
        case "response.audio.done":
          if (activeDirectionRef.current === "push_to_talk") {
            targetAudioDoneRef.current = true;
            scheduleRestoreListenMode();
          }
          break;
        case "response.done":
          if (activeDirectionRef.current === "push_to_talk") {
            clearPushToTalkTranslationTimer();
            targetAudioDoneRef.current = true;
            if (!targetTranscriptDoneRef.current) {
              targetTranscriptDoneRef.current = true;
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
            activeDirectionRef.current === "push_to_talk" &&
            (conversationModeRef.current === "PREPARING_TO_SPEAK" ||
              conversationModeRef.current === "COMMITTING_SOURCE") &&
            !audioForwardingRef.current;

          if (isPushToTalkPreparing) {
            pttAudioMsRef.current += countPcmDuration(chunk);

            if (pttBufferedChunksRef.current.length < 500) {
              pttBufferedChunksRef.current.push(chunk.slice(0));
            }
            return;
          }

          if (audioForwardingRef.current && socket?.readyState === WebSocket.OPEN) {
            if (activeDirectionRef.current === "push_to_talk") {
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
        direction: "conversation",
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
              if (!waitForInitialReady && message.direction === "conversation") {
                reconnectAttempts = 0;
                setErrorMessage("");
              }
              return;
            }

            if (message.type === "proxy.ready") {
              return;
            }

            await handleProviderEvent(message);
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
    handleProviderEvent,
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
      activeDirectionRef.current !== "conversation"
    ) {
      return;
    }

    setErrorMessage("");
    setAudioForwarding(false);
    activeDirectionRef.current = "push_to_talk";
    sourceLanguageRef.current = sourceLanguage;
    targetLanguageRef.current = targetLanguage;
    turnDetectionRef.current = "manual";
    pttStartedAtRef.current = performance.now();
    pttAudioMsRef.current = 0;
    pttBufferedChunksRef.current = [];
    pttReleasePendingRef.current = false;
    pttCancelPendingRef.current = false;
    targetAudioDoneRef.current = false;
    clearPushToTalkTranslationTimer();
    clearRestoreListenTimer();
    updateConversationMode("PREPARING_TO_SPEAK");
    setPushToTalkState("pressed");
    patchDebugInfo({
      direction: "push_to_talk",
      sourceLanguage,
      targetLanguage,
      turnDetection: "manual",
      pushToTalk: "pressed"
    });
    requestDirection("push_to_talk");
  }, [
    clearPushToTalkTranslationTimer,
    clearRestoreListenTimer,
    patchDebugInfo,
    requestDirection,
    setAudioForwarding,
    sourceLanguage,
    targetLanguage,
    updateConversationMode
  ]);

  const endPushToTalk = useCallback(async () => {
    if (
      conversationModeRef.current !== "PREPARING_TO_SPEAK" &&
      conversationModeRef.current !== "SOURCE_SPEAKING"
    ) {
      return;
    }

    await playback.ensureAudioContext();

    if (conversationModeRef.current === "PREPARING_TO_SPEAK") {
      pttReleasePendingRef.current = true;
      updateConversationMode("TRANSLATING");
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
      conversationModeRef.current !== "SOURCE_SPEAKING"
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
    activeDirectionRef.current = "conversation";
    turnDetectionRef.current = "server_vad";
    setPushToTalkState("idle");
    patchDebugInfo({
      direction: "conversation",
      turnDetection: "server_vad",
      pushToTalk: "idle",
      audioForwarding: false
    });

    if (statusRef.current === "idle" || statusRef.current === "stopping") {
      updateConversationMode("LISTENING_TO_OTHER");
      return;
    }

    updateConversationMode("RESTORING_LISTEN_MODE");
    requestDirection("conversation");
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

  const replayTarget = useCallback(async () => {
    if (targetAudioChunksRef.current.length === 0) {
      setErrorMessage("当前没有可重新播放的译文语音。");
      return;
    }

    playback.clearQueue();
    for (const chunk of targetAudioChunksRef.current) {
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
      conversationMode === "COMMITTING_SOURCE" ||
      conversationMode === "TRANSLATING" ||
      conversationMode === "PLAYING_TARGET" ||
      conversationMode === "RESTORING_LISTEN_MODE",
    [conversationMode]
  );
  const isPushToTalkActive = useMemo(
    () => conversationMode === "PREPARING_TO_SPEAK" || conversationMode === "SOURCE_SPEAKING",
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
    sourceLanguage,
    targetLanguage,
    currentSourceTranscript,
    finalSourceTranscript,
    currentTranslation,
    currentMyTranscript,
    finalMyTranscript,
    currentTargetTranslation,
    finalTargetTranslation,
    showLargeTarget,
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
    setSourceLanguage,
    setTargetLanguage,
    replayTarget,
    showLargeTargetView: () => setShowLargeTarget(true),
    hideLargeTargetView: () => setShowLargeTarget(false)
  };
}

