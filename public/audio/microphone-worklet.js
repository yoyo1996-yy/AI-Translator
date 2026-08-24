class MicrophonePcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetSampleRate = 16000;
    this.pending = new Float32Array(0);
    this.position = 0;
    this.output = [];
    this.chunkSize = 1024;
  }

  process(inputs) {
    const input = inputs[0];
    const channel = input && input[0];

    if (!channel || channel.length === 0) {
      return true;
    }

    const data = new Float32Array(this.pending.length + channel.length);
    data.set(this.pending, 0);
    data.set(channel, this.pending.length);

    const ratio = sampleRate / this.targetSampleRate;
    let position = this.position;

    while (position < data.length) {
      const sample = data[Math.floor(position)] || 0;
      const clipped = Math.max(-1, Math.min(1, sample));
      this.output.push(clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff);
      position += ratio;

      if (this.output.length >= this.chunkSize) {
        this.flush();
      }
    }

    const consumed = Math.max(0, Math.floor(position) - 1);
    this.pending = data.slice(consumed);
    this.position = position - consumed;

    return true;
  }

  flush() {
    const pcm = new Int16Array(this.output.length);

    for (let index = 0; index < this.output.length; index += 1) {
      pcm[index] = this.output[index];
    }

    this.output = [];
    this.port.postMessage(pcm.buffer, [pcm.buffer]);
  }
}

registerProcessor("microphone-pcm-processor", MicrophonePcmProcessor);
