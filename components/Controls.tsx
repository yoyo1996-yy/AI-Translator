"use client";

import { useRef, useState } from "react";
import { Mic, Mic2, RotateCcw, Square, Trash2, Volume2, VolumeX } from "lucide-react";
import type { AppStatus } from "../types/realtime";

type ControlsProps = {
  status: AppStatus;
  canStart: boolean;
  canPushToTalk: boolean;
  isPushToTalkActive: boolean;
  isPushToTalkBusy: boolean;
  pushToTalkLabel: string;
  muted: boolean;
  onStart: () => void | Promise<void>;
  onStop: () => void;
  onPushToTalkStart: () => void;
  onPushToTalkEnd: () => void | Promise<void>;
  onPushToTalkCancel: () => void;
  onRecoverListening: () => void;
  onClear: () => void;
  onToggleMuted: () => void;
};

export function Controls({
  status,
  canStart,
  canPushToTalk,
  isPushToTalkActive,
  isPushToTalkBusy,
  pushToTalkLabel,
  muted,
  onStart,
  onStop,
  onPushToTalkStart,
  onPushToTalkEnd,
  onPushToTalkCancel,
  onRecoverListening,
  onClear,
  onToggleMuted
}: ControlsProps) {
  const isRunning = !canStart;
  const [isBootstrappingPushToTalk, setIsBootstrappingPushToTalk] = useState(false);
  const activePointerIdRef = useRef<number | null>(null);
  const pushToTalkStartedRef = useRef(false);
  const pushToTalkAvailable = canPushToTalk || canStart || isPushToTalkActive || isBootstrappingPushToTalk;
  const pushToTalkDisabled = status === "stopping" || (!isPushToTalkActive && isPushToTalkBusy) || !pushToTalkAvailable;

  const beginPointerPushToTalk = async (pointerId: number) => {
    if (canPushToTalk) {
      pushToTalkStartedRef.current = true;
      onPushToTalkStart();
      return;
    }

    if (!canStart) {
      return;
    }

    setIsBootstrappingPushToTalk(true);
    try {
      await onStart();

      if (activePointerIdRef.current === pointerId) {
        pushToTalkStartedRef.current = true;
        onPushToTalkStart();
      }
    } finally {
      setIsBootstrappingPushToTalk(false);
    }
  };

  return (
    <div className="controls-bar" aria-label="同传控制">
      <button
        className={isPushToTalkBusy || isBootstrappingPushToTalk || isPushToTalkActive ? "push-talk-button busy" : "push-talk-button"}
        type="button"
        disabled={pushToTalkDisabled}
        onPointerDown={(event) => {
          if (pushToTalkDisabled) {
            return;
          }
          event.preventDefault();
          activePointerIdRef.current = event.pointerId;
          pushToTalkStartedRef.current = false;
          event.currentTarget.setPointerCapture(event.pointerId);
          void beginPointerPushToTalk(event.pointerId);
        }}
        onPointerUp={(event) => {
          if (activePointerIdRef.current !== event.pointerId) {
            return;
          }
          event.preventDefault();
          activePointerIdRef.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          if (pushToTalkStartedRef.current) {
            pushToTalkStartedRef.current = false;
            void onPushToTalkEnd();
          }
        }}
        onPointerCancel={(event) => {
          if (activePointerIdRef.current !== event.pointerId) {
            return;
          }
          activePointerIdRef.current = null;
          if (pushToTalkStartedRef.current) {
            pushToTalkStartedRef.current = false;
            onPushToTalkCancel();
          }
        }}
      >
        <Mic2 size={22} aria-hidden="true" />
        <span>{isBootstrappingPushToTalk ? "正在启动同传……" : pushToTalkLabel}</span>
      </button>
      <button
        className={isRunning ? "primary-button danger-button" : "primary-button"}
        type="button"
        onClick={isRunning ? onStop : onStart}
        disabled={status === "requesting_permission" || status === "connecting" || status === "stopping"}
      >
        {isRunning ? <Square size={20} aria-hidden="true" /> : <Mic size={20} aria-hidden="true" />}
        <span>{isRunning ? "停止同传" : "开始同传"}</span>
      </button>
      <div className="secondary-controls">
        <button
          className="icon-button"
          type="button"
          onClick={onRecoverListening}
          disabled={status === "idle" || status === "stopping"}
          aria-label="恢复听译"
          title="恢复听译"
        >
          <RotateCcw size={20} aria-hidden="true" />
        </button>
        <button className="icon-button" type="button" onClick={onClear} aria-label="清空字幕" title="清空字幕">
          <Trash2 size={20} aria-hidden="true" />
        </button>
        <button
          className={muted ? "icon-button active" : "icon-button"}
          type="button"
          onClick={onToggleMuted}
          aria-label={muted ? "取消静音" : "静音"}
          title={muted ? "取消静音" : "静音"}
        >
          {muted ? <VolumeX size={20} aria-hidden="true" /> : <Volume2 size={20} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
