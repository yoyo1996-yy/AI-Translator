import type {
  RealtimeProvider,
  RealtimeProviderEvent,
  RealtimeProviderEventHandler,
  RealtimeProviderSessionOptions
} from "./interface";

const TEST_AUDIO_DELTA = Buffer.from([0, 0, 0, 0]).toString("base64");

export class TestRealtimeProvider implements RealtimeProvider {
  readonly name = "test";

  private handler: RealtimeProviderEventHandler = () => {};
  private open = false;
  private connecting = false;
  private receivedAudioBytes = 0;
  private sessionOptions: RealtimeProviderSessionOptions | null = null;
  private speechStarted = false;

  onEvent(handler: RealtimeProviderEventHandler): void {
    this.handler = handler;
  }

  connect(): void {
    this.connecting = true;
    setTimeout(() => {
      this.connecting = false;
      this.open = true;
      this.emit({ type: "provider_connected" });
    }, 5);
  }

  updateSession(options: RealtimeProviderSessionOptions): void {
    this.sessionOptions = options;
    this.emitProviderMessage({ type: "session.updated" });
  }

  sendAudio(audio: Buffer): void {
    this.receivedAudioBytes += audio.byteLength;

    if (!this.speechStarted) {
      this.speechStarted = true;
      this.emitProviderMessage({ type: "input_audio_buffer.speech_started" });
    }
  }

  sendText(text: string): void {
    this.emitProviderMessage({
      type: "conversation.item.input_audio_transcription.completed",
      text
    });
    this.emitTranslatedResponse(`translated: ${text || "test text"}`);
  }

  commitAudio(): void {
    const sourceText = this.receivedAudioBytes > 0 ? "test source speech" : "test empty speech";
    this.emitProviderMessage({ type: "input_audio_buffer.speech_stopped" });
    this.emitProviderMessage({ type: "input_audio_buffer.committed" });
    this.emitProviderMessage({
      type: "conversation.item.input_audio_transcription.completed",
      transcript: sourceText
    });
    this.emitTranslatedResponse(`test translation to ${this.sessionOptions?.targetLanguage ?? "target"}`);
  }

  finishSession(): void {
    this.emitProviderMessage({ type: "session.finished" });
    this.open = false;
  }

  close(): void {
    if (!this.open && !this.connecting) {
      return;
    }

    this.open = false;
    this.connecting = false;
    this.emit({ type: "provider_closed" });
  }

  terminate(): void {
    this.close();
  }

  isOpen(): boolean {
    return this.open;
  }

  isConnecting(): boolean {
    return this.connecting;
  }

  private emitTranslatedResponse(text: string): void {
    this.emitProviderMessage({
      type: "response.audio_transcript.text",
      text
    });
    this.emitProviderMessage({
      type: "response.audio_transcript.done",
      transcript: text
    });
    this.emitProviderMessage({
      type: "response.audio.delta",
      delta: TEST_AUDIO_DELTA
    });
    this.emitProviderMessage({ type: "response.audio.done" });
    this.emitProviderMessage({ type: "response.done" });
  }

  private emitProviderMessage(event: { type: string; text?: string; transcript?: string; delta?: string }): void {
    this.emit({
      type: "provider_message",
      raw: JSON.stringify(event),
      event
    });
  }

  private emit(event: RealtimeProviderEvent): void {
    this.handler(event);
  }
}

export function createTestRealtimeProvider(): RealtimeProvider {
  return new TestRealtimeProvider();
}
