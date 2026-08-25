import { assertBailianProviderConfig, createBailianRealtimeProvider } from "./bailian-provider";
import { createMockRealtimeProvider } from "./mock-provider";
import { assertOpenAIProviderConfig } from "./openai/openai-config";
import { createOpenAIRealtimeProvider as createOpenAIProvider } from "./openai/openai-provider";
import { createTestRealtimeProvider } from "./test-provider";
import type { RealtimeProviderFactory } from "./interface";

export type ProviderName = "bailian" | "mock" | "test" | "openai";

export const SUPPORTED_PROVIDER_NAMES: ProviderName[] = ["bailian", "mock", "test", "openai"];

function getTrimmedEnv(name: string): string {
  const value = process.env[name];

  if (typeof value !== "string") {
    return "";
  }

  const trimmedValue = value.trim();
  process.env[name] = trimmedValue;
  return trimmedValue;
}

export function getSelectedProviderName(): ProviderName {
  const providerName = (getTrimmedEnv("TRANSLATION_PROVIDER") || "bailian").toLowerCase();

  if (SUPPORTED_PROVIDER_NAMES.includes(providerName as ProviderName)) {
    return providerName as ProviderName;
  }

  throw new Error(
    `Unsupported TRANSLATION_PROVIDER: ${providerName}. Supported values: ${SUPPORTED_PROVIDER_NAMES.join(", ")}.`
  );
}

export function createSelectedRealtimeProviderFactory(providerName: ProviderName = getSelectedProviderName()): RealtimeProviderFactory {
  switch (providerName) {
    case "mock":
      return createMockRealtimeProvider;
    case "test":
      return createTestRealtimeProvider;
    case "openai":
      return createOpenAIProvider;
    case "bailian":
    default:
      return createBailianRealtimeProvider;
  }
}

export function assertSelectedProviderConfig(providerName: ProviderName = getSelectedProviderName()): void {
  if (providerName === "bailian") {
    assertBailianProviderConfig();
    return;
  }

  if (providerName === "openai") {
    assertOpenAIProviderConfig();
  }
}

export type { RealtimeProvider, RealtimeProviderFactory } from "./interface";
