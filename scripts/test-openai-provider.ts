import { strict as assert } from "node:assert";
import {
  mapOpenAITranslationEvent
} from "../server/providers/openai/openai-events";
import {
  OpenAIRealtimeProvider,
  resamplePcm16Mono
} from "../server/providers/openai/openai-provider";
import {
  createSelectedRealtimeProviderFactory,
  getSelectedProviderName
} from "../server/providers";

function withEnv<T>(patch: Record<string, string | undefined>, run: () => T): T {
  const previousValues = new Map<string, string | undefined>();

  for (const key of Object.keys(patch)) {
    previousValues.set(key, process.env[key]);
    const value = patch[key];

    if (typeof value === "undefined") {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return run();
  } finally {
    for (const [key, value] of previousValues.entries()) {
      if (typeof value === "undefined") {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function testOpenAIReadyMapping(): void {
  const event = mapOpenAITranslationEvent({ type: "session.updated" });

  assert.deepEqual(event, {
    type: "session.updated",
    item_id: undefined,
    response_id: undefined
  });
}

function testOpenAISourceTranscriptMapping(): void {
  const event = mapOpenAITranslationEvent({
    type: "session.input_transcript.delta",
    delta: "hello"
  });

  assert.deepEqual(event, {
    type: "conversation.item.input_audio_transcription.text",
    text: "hello",
    item_id: undefined,
    response_id: undefined
  });
}

function testOpenAITranslationTranscriptMapping(): void {
  const delta = mapOpenAITranslationEvent({
    type: "session.output_transcript.delta",
    delta: "こんにちは"
  });
  const done = mapOpenAITranslationEvent({
    type: "session.output_transcript.completed",
    transcript: "こんにちは"
  });

  assert.deepEqual(delta, {
    type: "response.audio_transcript.text",
    text: "こんにちは",
    item_id: undefined,
    response_id: undefined
  });
  assert.deepEqual(done, {
    type: "response.audio_transcript.done",
    transcript: "こんにちは",
    item_id: undefined,
    response_id: undefined
  });
}

function testOpenAIAudioMapping(): void {
  const event = mapOpenAITranslationEvent({
    type: "session.output_audio.delta",
    delta: "AAAA"
  });

  assert.deepEqual(event, {
    type: "response.audio.delta",
    delta: "AAAA",
    item_id: undefined,
    response_id: undefined
  });
}

function testOpenAIErrorMapping(): void {
  const event = mapOpenAITranslationEvent({
    type: "error",
    error: {
      type: "invalid_request_error",
      message: "Invalid request."
    }
  });

  assert.deepEqual(event, {
    type: "error",
    error: {
      code: "invalid_request_error",
      message: "Invalid request."
    },
    item_id: undefined,
    response_id: undefined
  });
}

function testProviderFactorySelection(): void {
  withEnv({ TRANSLATION_PROVIDER: undefined }, () => {
    assert.equal(getSelectedProviderName(), "bailian");
    assert.equal(createSelectedRealtimeProviderFactory()().name, "bailian");
  });

  withEnv(
    {
      TRANSLATION_PROVIDER: "bailian",
      DASHSCOPE_API_KEY: "placeholder",
      DASHSCOPE_WORKSPACE_ID: "placeholder",
      DASHSCOPE_REGION: "cn-beijing"
    },
    () => {
      assert.equal(getSelectedProviderName(), "bailian");
      assert.equal(createSelectedRealtimeProviderFactory()().name, "bailian");
    }
  );

  withEnv({ TRANSLATION_PROVIDER: "openai", OPENAI_API_KEY: "placeholder" }, () => {
    assert.equal(getSelectedProviderName(), "openai");
    assert.equal(createSelectedRealtimeProviderFactory()().name, "openai");
  });

  withEnv({ TRANSLATION_PROVIDER: "mock" }, () => {
    assert.equal(getSelectedProviderName(), "mock");
    assert.equal(createSelectedRealtimeProviderFactory()().name, "mock");
  });

  withEnv({ TRANSLATION_PROVIDER: "unsupported-provider" }, () => {
    assert.throws(
      () => getSelectedProviderName(),
      /Unsupported TRANSLATION_PROVIDER: unsupported-provider/
    );
  });
}

function testOpenAICapabilities(): void {
  const provider = new OpenAIRealtimeProvider({
    apiKey: "placeholder",
    model: "gpt-realtime-translate",
    endpoint: "wss://api.openai.com/v1/realtime/translations",
    connectTimeoutMs: 1000
  });
  const capabilities = provider.getCapabilities();

  assert.deepEqual(capabilities.supportedTargetLanguages.sort(), ["en", "ja", "zh"]);
  assert.equal(capabilities.supportsSpeechRecognition, true);
  assert.equal(capabilities.supportsTranslation, true);
  assert.equal(capabilities.supportsSpeechOutput, true);
}

function testInputAudioResampling(): void {
  const input = Buffer.alloc(160 * 2);
  const output = resamplePcm16Mono(input, 16000, 24000);

  assert.equal(output.byteLength, 240 * 2);
}

function testLiveIntegrationGuard(): void {
  if (process.env.RUN_OPENAI_INTEGRATION_TEST === "1" && process.env.OPENAI_API_KEY?.trim()) {
    console.log("Paid OpenAI integration test enabled.");
    console.log("LIVE TEST: SKIPPED - fixture tests do not open a paid session by default.");
    return;
  }

  console.log("LIVE TEST: SKIPPED - OPENAI_API_KEY not configured or RUN_OPENAI_INTEGRATION_TEST not enabled.");
}

function main(): void {
  testOpenAIReadyMapping();
  testOpenAISourceTranscriptMapping();
  testOpenAITranslationTranscriptMapping();
  testOpenAIAudioMapping();
  testOpenAIErrorMapping();
  testProviderFactorySelection();
  testOpenAICapabilities();
  testInputAudioResampling();
  testLiveIntegrationGuard();

  console.log("OpenAI provider tests: passed");
}

main();
