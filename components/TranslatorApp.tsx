"use client";

import { ConnectionStatus } from "./ConnectionStatus";
import { Controls } from "./Controls";
import { DebugPanel } from "./DebugPanel";
import { LargeJapaneseView } from "./LargeJapaneseView";
import { TranscriptPanel } from "./TranscriptPanel";
import { TranslationHistory } from "./TranslationHistory";
import { useAudioDevices } from "../hooks/useAudioDevices";
import { useRealtimeTranslation } from "../hooks/useRealtimeTranslation";
import type { AppStatus, ConversationMode } from "../types/realtime";

type OperationStatusTone = "idle" | "listen" | "speak" | "work" | "play" | "error";

function getOperationStatus(
  status: AppStatus,
  conversationMode: ConversationMode,
  partnerLanguageName: string,
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
      detail: `当前目标语言：${partnerLanguageName}`,
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

  if (conversationMode === "PREPARING_TO_SPEAK" || conversationMode === "SPEAKING_CHINESE") {
    return {
      label: "正在录中文",
      detail: `松开后翻译成${partnerLanguageName}。`,
      tone: "speak"
    };
  }

  if (conversationMode === "TRANSLATING_TO_JAPANESE" || conversationMode === "COMMITTING_CHINESE") {
    return {
      label: `正在翻译成${partnerLanguageName}`,
      detail: "等待字幕和语音返回。",
      tone: "work"
    };
  }

  if (conversationMode === "PLAYING_JAPANESE") {
    return {
      label: muted ? "译文语音已静音" : `正在播放${partnerLanguageName}`,
      detail: "当前句播放完成后恢复听译。",
      tone: "play"
    };
  }

  if (conversationMode === "RESTORING_LISTEN_MODE") {
    return {
      label: "正在恢复听译",
      detail: "切回对方发言监听。",
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
    label: "正在听对方",
    detail: `对方发言 → 中文，你说中文 → ${partnerLanguageName}。`,
    tone: "listen"
  };
}

export function TranslatorApp() {
  const realtime = useRealtimeTranslation();
  const audioDevices = useAudioDevices(realtime.debugInfo.microphone === "Active");
  const partnerText = realtime.currentJapaneseTranslation || realtime.finalJapaneseTranslation;
  const myTranscript = realtime.currentMyTranscript || realtime.finalMyTranscript;
  const partnerLanguageName = realtime.partnerLanguage === "ja" ? "日语" : "英语";
  const partnerNativeName = realtime.partnerLanguage === "ja" ? "日本語" : "English";
  const operationStatus = getOperationStatus(
    realtime.status,
    realtime.conversationMode,
    partnerLanguageName,
    realtime.muted
  );
  const canChangePartnerLanguage =
    realtime.status === "idle" ||
    realtime.status === "error" ||
    realtime.conversationMode === "LISTENING_TO_OTHER";
  const pushToTalkLabel =
    realtime.conversationMode === "PREPARING_TO_SPEAK" || realtime.conversationMode === "SPEAKING_CHINESE"
        ? "松开结束并翻译"
        : realtime.conversationMode === "COMMITTING_CHINESE" || realtime.conversationMode === "TRANSLATING_TO_JAPANESE"
        ? `正在翻译成${partnerLanguageName}……`
        : realtime.conversationMode === "PLAYING_JAPANESE"
          ? `正在播放${partnerLanguageName}……`
          : realtime.conversationMode === "RESTORING_LISTEN_MODE"
            ? "正在恢复听译……"
            : "按住说中文";

  if (realtime.showLargeJapanese && realtime.finalJapaneseTranslation) {
    return (
      <LargeJapaneseView
        text={realtime.finalJapaneseTranslation}
        onBack={realtime.hideLargeJapaneseView}
        onReplay={realtime.replayJapanese}
      />
    );
  }

  return (
    <main className="app-shell">
      <section className="app-frame" aria-label="AI 随身同传">
        <header className="app-header">
          <div>
            <h1>AI 随身同传</h1>
            <p>中文 ⇄ {partnerNativeName}</p>
          </div>
          <ConnectionStatus status={realtime.status} />
        </header>

        <div className="language-switch" role="group" aria-label="选择对方语言">
          <button
            type="button"
            className={realtime.partnerLanguage === "ja" ? "active" : ""}
            disabled={!canChangePartnerLanguage}
            onClick={() => realtime.setPartnerLanguage("ja")}
          >
            日本語
          </button>
          <button
            type="button"
            className={realtime.partnerLanguage === "en" ? "active" : ""}
            disabled={!canChangePartnerLanguage}
            onClick={() => realtime.setPartnerLanguage("en")}
          >
            English
          </button>
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
            language="原语言"
            text={realtime.currentSourceTranscript || realtime.finalSourceTranscript}
            placeholder="等待对方说话..."
          />
          <TranscriptPanel
            title="中文"
            language="中文翻译"
            text={realtime.currentTranslation}
            placeholder="翻译会实时显示在这里。"
            emphasized
          />
          <TranscriptPanel title="我说" language="中文" text={myTranscript} placeholder="按住底部按钮后开始说中文。" />
          <section className="transcript-card japanese-output" aria-label={partnerLanguageName}>
            <div className="transcript-heading">
              <h2>{partnerLanguageName}</h2>
              <span>给对方听/看</span>
            </div>
            <p className="transcript-text transcript-text-large">
              {partnerText || `你的${partnerLanguageName}翻译会显示在这里。`}
            </p>
            {realtime.finalJapaneseTranslation ? (
              <div className="japanese-actions">
                <button type="button" onClick={realtime.showLargeJapaneseView}>
                  放大给对方看
                </button>
                <button type="button" onClick={realtime.replayJapanese}>
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
