import { assertBailianProviderConfig, createBailianRealtimeProvider } from "./bailian-provider";
import { createMockRealtimeProvider } from "./mock-provider";
import { createTestRealtimeProvider } from "./test-provider";
import type { RealtimeProviderFactory } from "./interface";

export type ProviderName = "bailian" | "mock" | "test";

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

  if (providerName === "mock") {
    return "mock";
  }

  if (providerName === "test") {
    return "test";
  }

  return "bailian";
}

export function createSelectedRealtimeProviderFactory(providerName: ProviderName = getSelectedProviderName()): RealtimeProviderFactory {
  switch (providerName) {
    case "mock":
      return createMockRealtimeProvider;
    case "test":
      return createTestRealtimeProvider;
    case "bailian":
    default:
      return createBailianRealtimeProvider;
  }
}

export function assertSelectedProviderConfig(providerName: ProviderName = getSelectedProviderName()): void {
  if (providerName === "bailian") {
    assertBailianProviderConfig();
  }
}

export type { RealtimeProvider, RealtimeProviderFactory } from "./interface";
