import type { ProviderServerEvent } from "../../../types/realtime";

type OpenAIRawEvent = {
  type?: unknown;
  event_id?: unknown;
  item_id?: unknown;
  response_id?: unknown;
  text?: unknown;
  transcript?: unknown;
  delta?: unknown;
  audio?: unknown;
  error?: {
    code?: unknown;
    message?: unknown;
    type?: unknown;
  };
};

function asRecord(value: unknown): OpenAIRawEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as OpenAIRawEvent;
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function getTextLike(event: OpenAIRawEvent): string | undefined {
  return getString(event.delta) ?? getString(event.text) ?? getString(event.transcript);
}

function withCommonFields(event: OpenAIRawEvent, payload: ProviderServerEvent): ProviderServerEvent {
  return {
    ...payload,
    item_id: getString(event.item_id),
    response_id: getString(event.response_id)
  };
}

export function mapOpenAITranslationEvent(rawEvent: unknown): ProviderServerEvent | null {
  const event = asRecord(rawEvent);
  const type = getString(event?.type);

  if (!event || !type) {
    return null;
  }

  if (type === "session.created" || type === "session.updated") {
    return withCommonFields(event, { type: "session.updated" });
  }

  if (type === "session.input_audio_buffer.speech_started") {
    return withCommonFields(event, { type: "input_audio_buffer.speech_started" });
  }

  if (type === "session.input_audio_buffer.speech_stopped") {
    return withCommonFields(event, { type: "input_audio_buffer.speech_stopped" });
  }

  if (type === "session.input_audio_buffer.committed") {
    return withCommonFields(event, { type: "input_audio_buffer.committed" });
  }

  if (
    type === "session.input_transcript.delta" ||
    type === "conversation.item.input_audio_transcription.delta" ||
    type === "conversation.item.input_audio_transcription.text"
  ) {
    return withCommonFields(event, {
      type: "conversation.item.input_audio_transcription.text",
      text: getTextLike(event)
    });
  }

  if (
    type === "session.input_transcript.completed" ||
    type === "conversation.item.input_audio_transcription.completed"
  ) {
    return withCommonFields(event, {
      type: "conversation.item.input_audio_transcription.completed",
      transcript: getTextLike(event)
    });
  }

  if (type === "session.output_transcript.delta" || type === "response.audio_transcript.delta") {
    return withCommonFields(event, {
      type: "response.audio_transcript.text",
      text: getTextLike(event)
    });
  }

  if (type === "session.output_transcript.completed" || type === "response.audio_transcript.done") {
    return withCommonFields(event, {
      type: "response.audio_transcript.done",
      transcript: getTextLike(event)
    });
  }

  if (type === "session.output_audio.delta" || type === "response.audio.delta") {
    return withCommonFields(event, {
      type: "response.audio.delta",
      delta: getString(event.delta) ?? getString(event.audio)
    });
  }

  if (type === "session.output_audio.done" || type === "response.audio.done") {
    return withCommonFields(event, { type: "response.audio.done" });
  }

  if (
    type === "session.output_audio_transcript.done" ||
    type === "translation.completed" ||
    type === "session.translation.completed" ||
    type === "response.done"
  ) {
    return withCommonFields(event, { type: "response.done" });
  }

  if (type === "session.closed" || type === "session.finished") {
    return withCommonFields(event, { type: "session.finished" });
  }

  if (type === "error") {
    return withCommonFields(event, {
      type: "error",
      error: {
        code: getString(event.error?.code) ?? getString(event.error?.type),
        message: getString(event.error?.message) ?? "Realtime provider error."
      }
    });
  }

  return withCommonFields(event, { type });
}
