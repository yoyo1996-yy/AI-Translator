import { OUTPUT_SAMPLE_RATE } from "../config/realtime";

type DecodedPcm = {
  samples: Int16Array;
  sampleRate: number;
};

function readAscii(view: DataView, offset: number, length: number): string {
  let value = "";

  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(view.getUint8(offset + index));
  }

  return value;
}

function decodeWavPcm16(bytes: Uint8Array): DecodedPcm | null {
  if (bytes.byteLength < 44) {
    return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (readAscii(view, 0, 4) !== "RIFF" || readAscii(view, 8, 4) !== "WAVE") {
    return null;
  }

  let offset = 12;
  let sampleRate = OUTPUT_SAMPLE_RATE;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= view.byteLength) {
    const chunkId = readAscii(view, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkDataOffset = offset + 8;

    if (chunkId === "fmt " && chunkSize >= 16) {
      sampleRate = view.getUint32(chunkDataOffset + 4, true);
    }

    if (chunkId === "data") {
      dataOffset = chunkDataOffset;
      dataSize = chunkSize;
      break;
    }

    offset = chunkDataOffset + chunkSize + (chunkSize % 2);
  }

  if (dataOffset < 0 || dataSize <= 0) {
    return null;
  }

  const sampleCount = Math.floor(dataSize / 2);
  const samples = new Int16Array(sampleCount);

  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] = view.getInt16(dataOffset + index * 2, true);
  }

  return {
    samples,
    sampleRate
  };
}

export function base64ToPcm16(base64: string): DecodedPcm {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const wav = decodeWavPcm16(bytes);

  if (wav) {
    return wav;
  }

  const sampleCount = Math.floor(bytes.byteLength / 2);
  const samples = new Int16Array(sampleCount);
  const view = new DataView(bytes.buffer);

  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] = view.getInt16(index * 2, true);
  }

  return {
    samples,
    sampleRate: OUTPUT_SAMPLE_RATE
  };
}

export function pcm16ToAudioBuffer(context: AudioContext, pcm: Int16Array, sampleRate = OUTPUT_SAMPLE_RATE): AudioBuffer {
  const audioBuffer = context.createBuffer(1, pcm.length, sampleRate);
  const channel = audioBuffer.getChannelData(0);

  for (let index = 0; index < pcm.length; index += 1) {
    channel[index] = Math.max(-1, Math.min(1, pcm[index] / 32768));
  }

  return audioBuffer;
}
