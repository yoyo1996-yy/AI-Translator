"use client";

import { ConnectionStatus } from "./ConnectionStatus";
import { Controls } from "./Controls";
import { DebugPanel } from "./DebugPanel";
import { LargeTargetView } from "./LargeTargetView";
import { TranscriptPanel } from "./TranscriptPanel";
import { TranslationHistory } from "./TranslationHistory";
import { useAudioDevices } from "../hooks/useAudioDevices";
import { useRealtimeTranslation } from "../hooks/useRealtimeTranslation";
import {
  getLanguageLabel,
  PROFILE_LANGUAGE_OPTIONS
} from "../lib/config/languages";
import type { AppStatus, ConversationMode, LanguageCode } from "../types/realtime";

type OperationStatusTone = "idle" | "listen" | "speak" | "work" | "play" | "error";

function getOperationStatus(
  status: AppStatus,
  conversationMode: ConversationMode,
  userLanguageName: string,
  peerLanguageName: string,
  muted: boolean
): { label: string; detail: string; tone: OperationStatusTone } {
  if (status === "error" || conversationMode === "ERROR") {
    return {
      label: "连接异常",
      detail: "请停止后重新开始同传。",
      tone: "error"
    };
  }

  if (status === "idle") {
    return {
      label: "未开始",
      detail: `${peerLanguageName} → ${userLanguageName}`,
      tone: "idle"
    };
  }

  if (status === "requesting_permission") {
    return {
      label: "正在请求麦克风",
      detail: "等待浏览器授权。",
      tone: "work"
    };
  }

  if (status === "connecting" || status === "connected") {
    return {
      label: "正在连接服务",
      detail: "准备实时同传会话。",
      tone: "work"
    };
  }

  if (conversationMode === "PREPARING_TO_SPEAK" || conversationMode === "SOURCE_SPEAKING") {
    return {
      label: "正在录制源语言",
      detail: `松开后翻译成 ${peerLanguageName}。`,
      tone: "speak"
    };
  }

  const activeTargetLanguageName =
    conversationMode === "TRANSLATING" ||
    conversationMode === "COMMITTING_SOURCE" ||
    conversationMode === "PLAYING_TARGET"
      ? peerLanguageName
      : userLanguageName;

  if (conversationMode === "TRANSLATING" || conversationMode === "COMMITTING_SOURCE") {
    return {
      label: `正在翻译成 ${activeTargetLanguageName}`,
      detail: "等待字幕和语音返回。",
      tone: "work"
    };
  }

  if (conversationMode === "PLAYING_TARGET") {
    return {
      label: muted ? "译文语音已静音" : `正在播放 ${activeTargetLanguageName}`,
      detail: "当前句播放完成后恢复听译。",
      tone: "play"
    };
  }

  if (conversationMode === "RESTORING_LISTEN_MODE") {
    return {
      label: "正在恢复听译",
      detail: "切回 Conversation Mode。",
      tone: "work"
    };
  }

  if (conversationMode === "STOPPING" || status === "stopping") {
    return {
      label: "正在停止",
      detail: "关闭本次同传会话。",
      tone: "work"
    };
  }

  return {
    label: "Conversation Mode",
    detail: `${peerLanguageName} → ${userLanguageName}`,
    tone: "listen"
  };
}

function LanguagePicker({
  title,
  value,
  options,
  disabled,
  onChange
}: {
  title: string;
  value: LanguageCode;
  options: { code: LanguageCode; label: string }[];
  disabled: boolean;
  onChange: (languageCode: LanguageCode) => void;
}) {
  return (
    <section className="language-picker" aria-label={title}>
      <h2>{title}</h2>
      <div className="language-switch" role="group">
        {options.map((option) => (
          <button
            key={option.code}
            type="button"
            className={value === option.code ? "active" : ""}
            disabled={disabled}
            onClick={() => onChange(option.code)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  );
}

export function TranslatorApp() {
  const realtime = useRealtimeTranslation();
  const audioDevices = useAudioDevices(realtime.debugInfo.microphone === "Active");
  const targetText = realtime.currentTargetTranslation || realtime.finalTargetTranslation;
  const sourcePushToTalkText = realtime.currentMyTranscript || realtime.finalMyTranscript;
  const userLanguageName = getLanguageLabel(realtime.userLanguage);
  const peerLanguageName = getLanguageLabel(realtime.peerLanguage);
  const operationStatus = getOperationStatus(
    realtime.status,
    realtime.conversationMode,
    userLanguageName,
    peerLanguageName,
    realtime.muted
  );
  const canChangeLanguage =
    realtime.status === "idle" ||
    realtime.status === "error" ||
    realtime.conversationMode === "LISTENING_TO_OTHER";
  const pushToTalkLabel =
    realtime.conversationMode === "PREPARING_TO_SPEAK" || realtime.conversationMode === "SOURCE_SPEAKING"
      ? "松开结束并翻译"
      : realtime.conversationMode === "COMMITTING_SOURCE" || realtime.conversationMode === "TRANSLATING"
        ? `正在翻译成 ${peerLanguageName}……`
        : realtime.conversationMode === "PLAYING_TARGET"
          ? `正在播放 ${peerLanguageName}……`
          : realtime.conversationMode === "RESTORING_LISTEN_MODE"
            ? "正在恢复听译……"
            : "按住说话";

  if (realtime.showLargeTarget && realtime.finalTargetTranslation) {
    return (
      <LargeTargetView
        text={realtime.finalTargetTranslation}
        onBack={realtime.hideLargeTargetView}
        onReplay={realtime.replayTarget}
      />
    );
  }

  return (
    <main className="app-shell">
      <section className="app-frame" aria-label="AI 随身同传">
        <header className="app-header">
          <div>
            <h1>AI 随身同传</h1>
            <p>我的语言 ⇄ 对方语言</p>
          </div>
          <ConnectionStatus status={realtime.status} />
        </header>

        <div className="language-selector-grid">
          <LanguagePicker
            title="我的语言"
            value={realtime.userLanguage}
            options={PROFILE_LANGUAGE_OPTIONS}
            disabled={!canChangeLanguage}
            onChange={realtime.setUserLanguage}
          />
          <LanguagePicker
            title="对方语言"
            value={realtime.peerLanguage}
            options={PROFILE_LANGUAGE_OPTIONS}
            disabled={!canChangeLanguage}
            onChange={realtime.setPeerLanguage}
          />
        </div>

        <section className={`operation-status operation-status-${operationStatus.tone}`} aria-live="polite">
          <div>
            <span className="operation-dot" aria-hidden="true" />
            <strong>{operationStatus.label}</strong>
          </div>
          <p>{operationStatus.detail}</p>
        </section>

        {realtime.errorMessage ? <p className="error-banner">{realtime.errorMessage}</p> : null}

        <section className="audio-device-panel" aria-label="音频设备">
          <div className="transcript-heading audio-device-heading">
            <h2>音频设备</h2>
            <span>{audioDevices.supported ? "系统默认" : "不可读取"}</span>
          </div>
          <p>{audioDevices.message}</p>
          <dl>
            <div>
              <dt>麦克风</dt>
              <dd>{audioDevices.inputs[0]?.label || "系统默认麦克风"}</dd>
            </div>
            <div>
              <dt>输出</dt>
              <dd>{audioDevices.outputs[0]?.label || "系统默认输出"}</dd>
            </div>
          </dl>
        </section>

        <div className="transcript-stack">
          <TranscriptPanel
            title="对方说"
            language="对方语言"
            text={realtime.currentSourceTranscript || realtime.finalSourceTranscript}
            placeholder="Waiting for source speech..."
          />
          <TranscriptPanel
            title="我的语言"
            language="译文字幕"
            text={realtime.currentTranslation}
            placeholder="Translated subtitles will appear here."
            emphasized
          />
          <TranscriptPanel
            title="我说"
            language="我的语言"
            text={sourcePushToTalkText}
            placeholder="Hold the talk button and speak."
          />
          <section className="transcript-card target-output" aria-label="Other Person Language Output">
            <div className="transcript-heading">
              <h2>对方语言</h2>
              <span>译文语音/字幕</span>
            </div>
            <p className="transcript-text transcript-text-large">
              {targetText || `Your ${peerLanguageName} translation will appear here.`}
            </p>
            {realtime.finalTargetTranslation ? (
              <div className="target-actions">
                <button type="button" onClick={realtime.showLargeTargetView}>
                  放大给对方看
                </button>
                <button type="button" onClick={realtime.replayTarget}>
                  重新播放
                </button>
              </div>
            ) : null}
          </section>
        </div>

        <TranslationHistory items={realtime.history} />
        <DebugPanel debugInfo={realtime.debugInfo} />
      </section>

      <Controls
        status={realtime.status}
        canStart={realtime.canStart}
        canPushToTalk={realtime.canPushToTalk}
        isPushToTalkActive={realtime.isPushToTalkActive}
        isPushToTalkBusy={realtime.isPushToTalkBusy}
        pushToTalkLabel={pushToTalkLabel}
        muted={realtime.muted}
        onStart={realtime.start}
        onStop={realtime.stop}
        onPushToTalkStart={realtime.beginPushToTalk}
        onPushToTalkEnd={realtime.endPushToTalk}
        onPushToTalkCancel={realtime.cancelPushToTalk}
        onRecoverListening={realtime.recoverListening}
        onClear={realtime.clearCaptions}
        onToggleMuted={realtime.toggleMuted}
      />
    </main>
  );
}
