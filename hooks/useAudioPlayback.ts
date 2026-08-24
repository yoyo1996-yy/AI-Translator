"use client";

import { useCallback, useRef, useState } from "react";
import { base64ToPcm16, pcm16ToAudioBuffer } from "../lib/audio/pcm";

type PlaybackOptions = {
  onStateChange?: (state: AudioContextState | "unavailable") => void;
  onQueueStateChange?: (state: "empty" | "playing") => void;
  onQueueEmpty?: () => void;
};

export function useAudioPlayback(options: PlaybackOptions = {}) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const appendChainRef = useRef<Promise<void>>(Promise.resolve());
  const queueGenerationRef = useRef(0);
  const [muted, setMuted] = useState(false);
  const [audioContextState, setAudioContextState] = useState<AudioContextState | "unavailable">("unavailable");
  const [queueState, setQueueState] = useState<"empty" | "playing">("empty");

  const updateContextState = useCallback(
    (state: AudioContextState | "unavailable") => {
      setAudioContextState(state);
      options.onStateChange?.(state);
    },
    [options]
  );

  const updateQueueState = useCallback(
    (state: "empty" | "playing") => {
      setQueueState(state);
      options.onQueueStateChange?.(state);

      if (state === "empty") {
        options.onQueueEmpty?.();
      }
    },
    [options]
  );

  const ensureAudioContext = useCallback(async () => {
    if (!audioContextRef.current || audioContextRef.current.state === "closed") {
      audioContextRef.current = new AudioContext();
      audioContextRef.current.onstatechange = () => {
        updateContextState(audioContextRef.current?.state ?? "unavailable");
      };
      nextStartTimeRef.current = audioContextRef.current.currentTime;
    }

    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }

    updateContextState(audioContextRef.current.state);
    return audioContextRef.current;
  }, [updateContextState]);

  const appendBase64Pcm = useCallback(
    (base64: string, ignoreMuted = false) => {
      if ((!ignoreMuted && muted) || !base64) {
        return Promise.resolve();
      }

      const queueGeneration = queueGenerationRef.current;
      const appendTask = appendChainRef.current
        .catch(() => {})
        .then(async () => {
          const context = await ensureAudioContext();
          const pcm = base64ToPcm16(base64);

          if (pcm.samples.length === 0 || queueGeneration !== queueGenerationRef.current) {
            return;
          }

          const audioBuffer = pcm16ToAudioBuffer(context, pcm.samples, pcm.sampleRate);
          const source = context.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(context.destination);

          if (sourcesRef.current.length === 0) {
            nextStartTimeRef.current = context.currentTime;
          }

          const startTime = Math.max(context.currentTime + 0.02, nextStartTimeRef.current);
          source.start(startTime);
          nextStartTimeRef.current = startTime + audioBuffer.duration;
          sourcesRef.current.push(source);
          updateQueueState("playing");

          source.onended = () => {
            sourcesRef.current = sourcesRef.current.filter((item) => item !== source);

            if (sourcesRef.current.length === 0 && audioContextRef.current) {
              updateContextState(audioContextRef.current.state);
              updateQueueState("empty");
            }
          };
        });

      appendChainRef.current = appendTask;
      return appendTask;
    },
    [ensureAudioContext, muted, updateContextState, updateQueueState]
  );

  const clearQueue = useCallback(() => {
    queueGenerationRef.current += 1;

    for (const source of sourcesRef.current) {
      try {
        source.stop();
      } catch {
        // Source may already be stopped.
      }
      source.disconnect();
    }

    sourcesRef.current = [];
    appendChainRef.current = Promise.resolve();

    if (audioContextRef.current) {
      nextStartTimeRef.current = audioContextRef.current.currentTime;
      updateContextState(audioContextRef.current.state);
    }
    updateQueueState("empty");
  }, [updateContextState, updateQueueState]);

  const flushPendingAppends = useCallback(async () => {
    await appendChainRef.current.catch(() => {});
  }, []);

  const closeAudioContext = useCallback(async () => {
    clearQueue();

    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      await audioContextRef.current.close();
    }

    audioContextRef.current = null;
    updateContextState("closed");
  }, [clearQueue, updateContextState]);

  return {
    audioContextRef,
    audioContextState,
    queueState,
    muted,
    setMuted,
    ensureAudioContext,
    appendBase64Pcm,
    flushPendingAppends,
    clearQueue,
    closeAudioContext
  };
}
