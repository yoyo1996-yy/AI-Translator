"use client";

import { useCallback, useRef, useState } from "react";

type StartMicrophoneOptions = {
  audioContext: AudioContext;
  onAudioChunk: (chunk: ArrayBuffer) => void;
};

type MicrophoneNodes = {
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  processor: AudioWorkletNode;
  silentGain: GainNode;
};

async function requestMicrophoneStream(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "OverconstrainedError") {
      return navigator.mediaDevices.getUserMedia({ audio: true });
    }

    throw error;
  }
}

export function useMicrophone() {
  const nodesRef = useRef<MicrophoneNodes | null>(null);
  const moduleContextRef = useRef<AudioContext | null>(null);
  const [active, setActive] = useState(false);

  const stop = useCallback(() => {
    const nodes = nodesRef.current;

    if (!nodes) {
      setActive(false);
      return;
    }

    nodes.processor.port.onmessage = null;
    nodes.source.disconnect();
    nodes.processor.disconnect();
    nodes.silentGain.disconnect();
    nodes.stream.getTracks().forEach((track) => track.stop());
    nodesRef.current = null;
    setActive(false);
  }, []);

  const start = useCallback(
    async ({ audioContext, onAudioChunk }: StartMicrophoneOptions) => {
      stop();

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("当前浏览器不支持麦克风采集。");
      }

      if (moduleContextRef.current !== audioContext) {
        await audioContext.audioWorklet.addModule("/audio/microphone-worklet.js");
        moduleContextRef.current = audioContext;
      }

      const stream = await requestMicrophoneStream();
      const source = audioContext.createMediaStreamSource(stream);
      const processor = new AudioWorkletNode(audioContext, "microphone-pcm-processor");
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;

      processor.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        onAudioChunk(event.data);
      };

      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioContext.destination);

      nodesRef.current = {
        stream,
        source,
        processor,
        silentGain
      };
      setActive(true);
    },
    [stop]
  );

  return {
    active,
    start,
    stop
  };
}
