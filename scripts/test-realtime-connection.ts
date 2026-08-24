import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import WebSocket from "ws";

const ENV_LOCAL_PATH = resolve(process.cwd(), ".env.local");

loadEnv({ path: ENV_LOCAL_PATH, override: false, quiet: true });

const MODEL = "qwen3.5-livetranslate-flash-realtime";
const DEFAULT_REGION = "cn-beijing";
const CONNECTION_TIMEOUT_MS = 15_000;

type RealtimeEvent = {
  type?: string;
  error?: {
    code?: string;
    message?: string;
  };
};

type ConnectionResult = {
  success: boolean;
  statusCode?: number;
  aliyunCode?: string;
  message?: string;
};

type SafeDiagnostics = {
  apiKeyLoaded: boolean;
  workspaceIdLoaded: boolean;
  regionLoaded: boolean;
  apiKeyFormatValid: boolean;
};

function getTrimmedEnv(name: string): string {
  const value = process.env[name];

  if (typeof value !== "string") {
    return "";
  }

  const trimmedValue = value.trim();
  process.env[name] = trimmedValue;
  return trimmedValue;
}

function getSafeDiagnostics(): SafeDiagnostics {
  const rawApiKey = process.env.DASHSCOPE_API_KEY;
  const apiKey = getTrimmedEnv("DASHSCOPE_API_KEY");
  const workspaceId = getTrimmedEnv("DASHSCOPE_WORKSPACE_ID");
  const region = getTrimmedEnv("DASHSCOPE_REGION");

  return {
    apiKeyLoaded: apiKey.length > 0,
    workspaceIdLoaded: workspaceId.length > 0,
    regionLoaded: region.length > 0,
    apiKeyFormatValid: apiKey.length > 0 && apiKey.startsWith("sk-") && !/[\r\n]/.test(rawApiKey ?? "")
  };
}

function getEndpoint(workspaceId: string, region: string): string {
  const encodedModel = encodeURIComponent(MODEL);
  return `wss://${workspaceId}.${region}.maas.aliyuncs.com/api-ws/v1/realtime?model=${encodedModel}`;
}

function parseAliyunError(body: string): Pick<ConnectionResult, "aliyunCode" | "message"> {
  try {
    const parsed = JSON.parse(body) as { code?: unknown; message?: unknown };

    return {
      aliyunCode: typeof parsed.code === "string" ? parsed.code : undefined,
      message: typeof parsed.message === "string" ? parsed.message : undefined
    };
  } catch {
    return {
      message: body || undefined
    };
  }
}

function printSafeDiagnostics(diagnostics: SafeDiagnostics): void {
  console.log(`DASHSCOPE_API_KEY loaded: ${diagnostics.apiKeyLoaded}`);
  console.log(`DASHSCOPE_WORKSPACE_ID loaded: ${diagnostics.workspaceIdLoaded}`);
  console.log(`DASHSCOPE_REGION loaded: ${diagnostics.regionLoaded}`);
  console.log(`API key format valid: ${diagnostics.apiKeyFormatValid}`);
}

function printConnectionResult(result: ConnectionResult): void {
  console.log(`Realtime connection: ${result.success ? "success" : "failed"}`);

  if (!result.success) {
    console.log(`HTTP/WebSocket status code: ${result.statusCode ?? "unknown"}`);
    console.log(`Aliyun error code: ${result.aliyunCode ?? "unknown"}`);
    console.log(`message: ${result.message ?? "unknown"}`);
  }
}

async function testRealtimeConnection(): Promise<ConnectionResult> {
  const apiKey = getTrimmedEnv("DASHSCOPE_API_KEY");
  const workspaceId = getTrimmedEnv("DASHSCOPE_WORKSPACE_ID");
  const region = getTrimmedEnv("DASHSCOPE_REGION") || DEFAULT_REGION;
  const endpoint = getEndpoint(workspaceId, region);

  return new Promise<ConnectionResult>((resolve) => {
    const timeout = setTimeout(() => {
      socket.close();
      resolve({
        success: false,
        message: "Timed out waiting for session.updated."
      });
    }, CONNECTION_TIMEOUT_MS);

    const socket = new WebSocket(endpoint, {
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    });

    const cleanup = () => {
      clearTimeout(timeout);
      socket.removeAllListeners();
    };

    socket.on("open", () => {
      const event = {
        event_id: `event_${randomUUID()}`,
        type: "session.update",
        session: {
          modalities: ["text", "audio"],
          input_audio_format: "pcm",
          output_audio_format: "pcm",
          sample_rate: 16000,
          input_audio_transcription: {
            model: "qwen3-asr-flash-realtime"
          },
          translation: {
            language: "zh"
          },
          turn_detection: {
            type: "server_vad"
          }
        }
      };

      socket.send(JSON.stringify(event));
    });

    socket.on("message", (rawMessage) => {
      let event: RealtimeEvent;

      try {
        event = JSON.parse(rawMessage.toString()) as RealtimeEvent;
      } catch {
        return;
      }

      if (event.type === "session.updated") {
        socket.send(
          JSON.stringify({
            event_id: `event_${randomUUID()}`,
            type: "session.finish"
          })
        );
        cleanup();
        socket.close();
        resolve({
          success: true
        });
        return;
      }

      if (event.type === "error") {
        cleanup();
        socket.close();
        resolve({
          success: false,
          aliyunCode: event.error?.code,
          message: event.error?.message || "Realtime API returned an error."
        });
      }
    });

    socket.on("unexpected-response", (_request, response) => {
      cleanup();
      const chunks: Buffer[] = [];

      response.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });

      response.on("end", () => {
        const responseBody = Buffer.concat(chunks).toString("utf8").trim();
        const message = responseBody
          ? `Unexpected HTTP response: ${response.statusCode}. ${responseBody}`
          : `Unexpected HTTP response: ${response.statusCode}`;

        const aliyunError = parseAliyunError(responseBody);

        resolve({
          success: false,
          statusCode: response.statusCode,
          aliyunCode: aliyunError.aliyunCode,
          message: aliyunError.message ?? message
        });
      });
    });

    socket.on("error", (error) => {
      cleanup();
      resolve({
        success: false,
        message: error.message
      });
    });
  });
}

async function main(): Promise<void> {
  const diagnostics = getSafeDiagnostics();
  printSafeDiagnostics(diagnostics);

  if (!diagnostics.apiKeyLoaded) {
    console.log("Realtime connection: failed");
    console.log("HTTP/WebSocket status code: not requested");
    console.log("Aliyun error code: not requested");
    console.log("message: Missing required environment variables: DASHSCOPE_API_KEY and/or DASHSCOPE_WORKSPACE_ID.");
    process.exitCode = 1;
    return;
  }

  const result = await testRealtimeConnection();
  printConnectionResult(result);
  process.exitCode = result.success ? 0 : 1;
}

main().catch((error: Error) => {
  printConnectionResult({
    success: false,
    message: error.message
  });
  process.exit(1);
});
