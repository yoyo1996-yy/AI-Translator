"use client";

import { useCallback, useEffect, useState } from "react";

export type VisibleAudioDevice = {
  id: string;
  label: string;
  kind: MediaDeviceKind;
};

export type AudioDeviceInfoState = {
  supported: boolean;
  canReadLabels: boolean;
  inputs: VisibleAudioDevice[];
  outputs: VisibleAudioDevice[];
  message: string;
  refresh: () => Promise<void>;
};

function toVisibleDevice(device: MediaDeviceInfo, index: number): VisibleAudioDevice {
  return {
    id: device.deviceId || `${device.kind}-${index}`,
    label: device.label || "系统默认设备",
    kind: device.kind
  };
}

export function useAudioDevices(isMicrophoneActive: boolean): AudioDeviceInfoState {
  const [supported, setSupported] = useState(false);
  const [canReadLabels, setCanReadLabels] = useState(false);
  const [inputs, setInputs] = useState<VisibleAudioDevice[]>([]);
  const [outputs, setOutputs] = useState<VisibleAudioDevice[]>([]);
  const [message, setMessage] = useState("使用手机系统当前默认麦克风和声音输出。");

  const refresh = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setSupported(false);
      setCanReadLabels(false);
      setInputs([]);
      setOutputs([]);
      setMessage("当前浏览器不支持读取音频设备列表，将使用系统默认设备。");
      return;
    }

    setSupported(true);

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((device) => device.kind === "audioinput").map(toVisibleDevice);
      const audioOutputs = devices.filter((device) => device.kind === "audiooutput").map(toVisibleDevice);
      const labelsVisible = devices.some((device) => Boolean(device.label));

      setInputs(audioInputs);
      setOutputs(audioOutputs);
      setCanReadLabels(labelsVisible);
      setMessage(labelsVisible ? "已读取可见音频设备，实际输入/输出仍由手机系统控制。" : "浏览器暂未开放设备名称，将使用系统默认设备。");
    } catch {
      setInputs([]);
      setOutputs([]);
      setCanReadLabels(false);
      setMessage("无法读取设备列表，将使用系统默认设备。");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [isMicrophoneActive, refresh]);

  useEffect(() => {
    if (!navigator.mediaDevices?.addEventListener) {
      return;
    }

    const handleChange = () => {
      void refresh();
    };

    navigator.mediaDevices.addEventListener("devicechange", handleChange);
    return () => navigator.mediaDevices.removeEventListener("devicechange", handleChange);
  }, [refresh]);

  return {
    supported,
    canReadLabels,
    inputs,
    outputs,
    message,
    refresh
  };
}
