import type { RealtimeProvider, RealtimeProviderEvent, RealtimeProviderEventHandler } from "./interface";
import { getProviderCapabilities } from "../../lib/languages/registry";
import type { RealtimeProviderCapabilities } from "../../lib/languages/registry";

export class MockRealtimeProvider implements RealtimeProvider {
  readonly name = "mock";

  private handler: RealtimeProviderEventHandler = () => {};
  private open = false;
  private connecting = false;

  onEvent(handler: RealtimeProviderEventHandler): void {
    this.handler = handler;
  }

  getCapabilities(): RealtimeProviderCapabilities {
    return getProviderCapabilities("mock");
  }

  connect(): void {
    this.connecting = true;
    setTimeout(() => {
      this.connecting = false;
      this.open = true;
      this.emit({ type: "provider_connected" });
    }, 10);
  }

  updateSession(): void {
    setTimeout(() => {
      this.emit({
        type: "provider_message",
        raw: JSON.stringify({ type: "session.updated" }),
        event: { type: "session.updated" }
      });
    }, 10);
  }

  sendAudio(): void {
    // Intentionally empty. The mock provider only verifies Gateway protocol flow.
  }

  sendText(): void {
    // Intentionally empty. The mock provider only verifies Gateway protocol flow.
  }

  commitAudio(): void {
    this.emit({
      type: "provider_message",
      raw: JSON.stringify({ type: "input_audio_buffer.committed" }),
      event: { type: "input_audio_buffer.committed" }
    });
  }

  finishSession(): void {
    this.emit({
      type: "provider_message",
      raw: JSON.stringify({ type: "session.finished" }),
      event: { type: "session.finished" }
    });
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

  private emit(event: RealtimeProviderEvent): void {
    this.handler(event);
  }
}

export function createMockRealtimeProvider(): RealtimeProvider {
  return new MockRealtimeProvider();
}
