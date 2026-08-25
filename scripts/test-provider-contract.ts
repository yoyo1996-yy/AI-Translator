import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getProviderCapabilities
} from "../lib/languages/registry";
import {
  DEFAULT_LANGUAGE_PROFILE,
  getListeningDirection,
  getPushToTalkDirection
} from "../lib/languages/profile";
import { validateProviderLanguagePair } from "../server/language-session";
import {
  createSelectedRealtimeProviderFactory,
  getSelectedProviderName,
  SUPPORTED_PROVIDER_NAMES
} from "../server/providers";
import type {
  RealtimeProvider,
  RealtimeProviderEvent,
  RealtimeProviderSessionOptions
} from "../server/providers/interface";
import { mapOpenAITranslationEvent } from "../server/providers/openai/openai-events";
import type { ProviderServerEvent } from "../types/realtime";

const repoRoot = process.cwd();
const allowedNeutralEventTypes = new Set([
  "session.updated",
  "input_audio_buffer.speech_started",
  "input_audio_buffer.speech_stopped",
  "input_audio_buffer.committed",
  "conversation.item.input_audio_transcription.text",
  "conversation.item.input_audio_transcription.completed",
  "response.audio_transcript.text",
  "response.audio_transcript.done",
  "response.audio.delta",
  "response.audio.done",
  "response.done",
  "session.finished",
  "error"
]);

const sessionOptions: RealtimeProviderSessionOptions = {
  direction: "conversation",
  sourceLanguage: "ja",
  targetLanguage: "zh",
  turnDetection: "server_vad",
  corpusPhrases: {}
};

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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertProviderShape(provider: RealtimeProvider): void {
  for (const methodName of [
    "connect",
    "updateSession",
    "sendAudio",
    "sendText",
    "commitAudio",
    "finishSession",
    "close",
    "terminate",
    "isOpen",
    "isConnecting",
    "getCapabilities",
    "onEvent"
  ] as const) {
    assert.equal(typeof provider[methodName], "function", `${provider.name}.${methodName} should be implemented.`);
  }
}

function assertNeutralEvent(event: ProviderServerEvent | null | undefined, context: string): asserts event is ProviderServerEvent {
  assert.ok(event?.type, `${context} should produce an event type.`);
  assert.ok(allowedNeutralEventTypes.has(event.type), `${context} produced non-neutral event type: ${event.type}`);
  assert.equal(event.type.startsWith("session.output_"), false, `${context} leaked an OpenAI output event.`);
  assert.equal(event.type.startsWith("qwen."), false, `${context} leaked a Qwen event.`);
  assert.equal(event.type.startsWith("dashscope."), false, `${context} leaked a DashScope event.`);
  assert.equal(event.type.startsWith("bailian."), false, `${context} leaked a Bailian event.`);
}

function assertNeutralEvents(events: ProviderServerEvent[], context: string): void {
  for (const event of events) {
    assertNeutralEvent(event, context);
  }
}

function testProviderShapeMatrix(): void {
  for (const providerName of SUPPORTED_PROVIDER_NAMES) {
    withEnv(
      {
        TRANSLATION_PROVIDER: providerName,
        DASHSCOPE_API_KEY: "placeholder",
        DASHSCOPE_WORKSPACE_ID: "placeholder",
        DASHSCOPE_REGION: "cn-beijing",
        OPENAI_API_KEY: "placeholder"
      },
      () => {
        const provider = createSelectedRealtimeProviderFactory()();

        assert.equal(provider.name, providerName);
        assertProviderShape(provider);
        assert.deepEqual(provider.getCapabilities(), getProviderCapabilities(providerName));
      }
    );
  }
}

function testProviderFactorySelection(): void {
  withEnv({ TRANSLATION_PROVIDER: undefined }, () => {
    assert.equal(getSelectedProviderName(), "bailian");
  });

  for (const providerName of SUPPORTED_PROVIDER_NAMES) {
    withEnv({ TRANSLATION_PROVIDER: providerName }, () => {
      assert.equal(getSelectedProviderName(), providerName);
    });
  }

  withEnv({ TRANSLATION_PROVIDER: "invalid-provider" }, () => {
    assert.throws(() => getSelectedProviderName(), /Unsupported TRANSLATION_PROVIDER: invalid-provider/);
  });
}

function testFixtureEventContracts(): void {
  const bailianFixtureEvents: ProviderServerEvent[] = [
    { type: "session.updated" },
    { type: "conversation.item.input_audio_transcription.text", text: "hello" },
    { type: "conversation.item.input_audio_transcription.completed", transcript: "hello" },
    { type: "response.audio_transcript.text", text: "你好" },
    { type: "response.audio_transcript.done", transcript: "你好" },
    { type: "response.audio.delta", delta: "AAAA" },
    { type: "response.done" },
    { type: "error", error: { code: "provider_error", message: "Provider error." } }
  ];

  const openAIEvents = [
    mapOpenAITranslationEvent({ type: "session.updated" }),
    mapOpenAITranslationEvent({ type: "session.input_transcript.delta", delta: "hello" }),
    mapOpenAITranslationEvent({ type: "session.input_transcript.completed", transcript: "hello" }),
    mapOpenAITranslationEvent({ type: "session.output_transcript.delta", delta: "你好" }),
    mapOpenAITranslationEvent({ type: "session.output_transcript.completed", transcript: "你好" }),
    mapOpenAITranslationEvent({ type: "session.output_audio.delta", delta: "AAAA" }),
    mapOpenAITranslationEvent({ type: "translation.completed" }),
    mapOpenAITranslationEvent({
      type: "error",
      error: {
        type: "invalid_request_error",
        message: "Invalid request."
      }
    })
  ];

  assertNeutralEvents(bailianFixtureEvents, "Bailian fixtures");
  assertNeutralEvents(openAIEvents.filter((event): event is ProviderServerEvent => Boolean(event)), "OpenAI fixtures");
}

async function collectProviderLifecycleEvents(providerName: "mock" | "test"): Promise<ProviderServerEvent[]> {
  const provider = withEnv({ TRANSLATION_PROVIDER: providerName }, () => createSelectedRealtimeProviderFactory()());
  const events: ProviderServerEvent[] = [];

  provider.onEvent((event: RealtimeProviderEvent) => {
    if (event.type === "provider_message" && event.event) {
      events.push(event.event);
    }
  });

  provider.connect();
  await wait(20);
  provider.updateSession(sessionOptions);
  provider.sendAudio(Buffer.from([0, 0, 0, 0]));
  provider.commitAudio();
  provider.finishSession();
  provider.close();
  await wait(20);

  return events;
}

async function testMockAndTestProviderEventContracts(): Promise<void> {
  const mockEvents = await collectProviderLifecycleEvents("mock");
  const testEvents = await collectProviderLifecycleEvents("test");

  assertNeutralEvents(mockEvents, "Mock provider lifecycle");
  assertNeutralEvents(testEvents, "Test provider lifecycle");
}

function testLanguageCapabilities(): void {
  const expectedPairs = [
    { sourceLanguage: "zh", targetLanguage: "ja" },
    { sourceLanguage: "ja", targetLanguage: "zh" },
    { sourceLanguage: "zh", targetLanguage: "en" },
    { sourceLanguage: "en", targetLanguage: "zh" }
  ];

  for (const providerName of SUPPORTED_PROVIDER_NAMES) {
    const capabilities = getProviderCapabilities(providerName);

    for (const pair of expectedPairs) {
      const result = validateProviderLanguagePair(
        providerName,
        capabilities,
        "conversation",
        pair.sourceLanguage,
        pair.targetLanguage
      );

      assert.equal(result.ok, true, `${providerName} should support ${pair.sourceLanguage} -> ${pair.targetLanguage}`);
    }
  }
}

function testBidirectionalDirectionContract(): void {
  assert.deepEqual(getListeningDirection(DEFAULT_LANGUAGE_PROFILE), {
    sourceLanguage: "ja",
    targetLanguage: "zh"
  });
  assert.deepEqual(getPushToTalkDirection(DEFAULT_LANGUAGE_PROFILE), {
    sourceLanguage: "zh",
    targetLanguage: "ja"
  });

  const englishUserProfile = {
    userLanguage: "en",
    peerLanguage: "zh"
  };

  assert.deepEqual(getListeningDirection(englishUserProfile), {
    sourceLanguage: "zh",
    targetLanguage: "en"
  });
  assert.deepEqual(getPushToTalkDirection(englishUserProfile), {
    sourceLanguage: "en",
    targetLanguage: "zh"
  });
}

function runDoctorWithEnv(envPatch: Record<string, string>): { status: number | null; output: string } {
  const bin = join(repoRoot, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
  const result = spawnSync(bin, ["scripts/doctor.ts"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ...envPatch,
      DASHSCOPE_API_KEY: envPatch.DASHSCOPE_API_KEY ?? "",
      DASHSCOPE_WORKSPACE_ID: envPatch.DASHSCOPE_WORKSPACE_ID ?? "",
      DASHSCOPE_REGION: envPatch.DASHSCOPE_REGION ?? "",
      OPENAI_API_KEY: envPatch.OPENAI_API_KEY ?? "",
      OPENAI_REALTIME_MODEL: envPatch.OPENAI_REALTIME_MODEL ?? ""
    },
    shell: process.platform === "win32"
  });

  return {
    status: result.status,
    output: `${result.stdout}\n${result.stderr}\n${result.error?.message ?? ""}`
  };
}

function testDoctorProviderMatrix(): void {
  const mock = runDoctorWithEnv({ TRANSLATION_PROVIDER: "mock" });
  assert.equal(mock.status, 0);
  assert.match(mock.output, /\[PASS\] provider credentials: No paid provider credentials required\./);

  const bailianMissing = runDoctorWithEnv({ TRANSLATION_PROVIDER: "bailian" });
  assert.notEqual(bailianMissing.status, 0);
  assert.match(bailianMissing.output, /\[FAIL\] DASHSCOPE_API_KEY: missing/);
  assert.doesNotMatch(bailianMissing.output, /OPENAI_API_KEY: missing/);

  const openAIMissing = runDoctorWithEnv({ TRANSLATION_PROVIDER: "openai" });
  assert.notEqual(openAIMissing.status, 0);
  assert.match(openAIMissing.output, /\[FAIL\] OPENAI_API_KEY: missing/);
  assert.doesNotMatch(openAIMissing.output, /DASHSCOPE_API_KEY: missing/);

  const openAIConfigured = runDoctorWithEnv({
    TRANSLATION_PROVIDER: "openai",
    OPENAI_API_KEY: "placeholder"
  });
  assert.equal(openAIConfigured.status, 0);
  assert.match(openAIConfigured.output, /\[PASS\] OPENAI_API_KEY: configured/);
  assert.doesNotMatch(openAIConfigured.output, /placeholder/);
}

function testCostGuards(): void {
  const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  const ciWorkflow = readFileSync(join(repoRoot, ".github", "workflows", "ci.yml"), "utf8");
  const openAITest = readFileSync(join(repoRoot, "scripts", "test-openai-provider.ts"), "utf8");

  assert.match(packageJson.scripts?.test ?? "", /test-provider-contract/);
  assert.match(ciWorkflow, /npm test --if-present/);
  assert.doesNotMatch(ciWorkflow, /OPENAI_API_KEY|DASHSCOPE_API_KEY|RUN_OPENAI_INTEGRATION_TEST/);
  assert.match(openAITest, /LIVE TEST: SKIPPED/);
  assert.doesNotMatch(openAITest, /\.connect\(\)/);
}

function testClientIsolation(): void {
  const clientFiles = [
    "components",
    "hooks",
    "app",
    "android"
  ];
  const forbiddenPattern = /OPENAI_API_KEY|DASHSCOPE_API_KEY|session\.output_audio|session\.output_transcript|qwen|dashscope/i;

  for (const directory of clientFiles) {
    const result = spawnSync("git", ["grep", "-n", "-I", "-E", forbiddenPattern.source, "--", directory], {
      cwd: repoRoot,
      encoding: "utf8",
      shell: false
    });

    assert.equal(result.status, 1, `Client/vendor isolation violation in ${directory}:\n${result.stdout}`);
  }
}

async function main(): Promise<void> {
  testProviderShapeMatrix();
  testProviderFactorySelection();
  testFixtureEventContracts();
  await testMockAndTestProviderEventContracts();
  testLanguageCapabilities();
  testBidirectionalDirectionContract();
  testDoctorProviderMatrix();
  testCostGuards();
  testClientIsolation();

  console.log("Provider contract tests: passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
