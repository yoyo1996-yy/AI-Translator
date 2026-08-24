import { createHash, randomBytes } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import { connect } from "node:tls";
import next from "next";
import { createRealtimeProxyServer } from "./realtime-proxy";
import { REALTIME_MODEL, normalizeDashScopeRegion } from "../lib/config/realtime";

const port = Number.parseInt((process.env.FC_SERVER_PORT ?? process.env.PORT ?? "9000").trim(), 10);
const hostname = process.env.HOSTNAME?.trim() || "0.0.0.0";
const realtimePath = process.env.REALTIME_PROXY_PATH?.trim() || "/realtime";
const isDev = process.env.NODE_ENV === "development";
const buildVersion = "v11-clean-secret-header";

function getTrimmedEnv(name: string): string {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function cleanSecretValue(value: string): string {
  const trimmedValue = value.trim();
  const unquotedValue =
    (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) ||
    (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"))
      ? trimmedValue.slice(1, -1).trim()
      : trimmedValue;

  return unquotedValue.replace(/\s+/g, "");
}

function getCleanSecretEnv(name: string): string {
  const value = process.env[name];
  return typeof value === "string" ? cleanSecretValue(value) : "";
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload, null, 2));
}

function checkBailianTls(): Promise<{ ok: boolean; message: string; elapsedMs: number }> {
  const startedAt = Date.now();
  const workspaceId = getTrimmedEnv("DASHSCOPE_WORKSPACE_ID");
  const region = normalizeDashScopeRegion(getTrimmedEnv("DASHSCOPE_REGION"));

  if (!workspaceId) {
    return Promise.resolve({
      ok: false,
      message: "DASHSCOPE_WORKSPACE_ID is not loaded.",
      elapsedMs: 0
    });
  }

  const servername = `${workspaceId}.${region}.maas.aliyuncs.com`;

  return new Promise((resolve) => {
    const socket = connect({
      host: servername,
      port: 443,
      servername,
      timeout: 8000
    });

    const finish = (ok: boolean, message: string) => {
      socket.destroy();
      resolve({
        ok,
        message,
        elapsedMs: Date.now() - startedAt
      });
    };

    socket.once("secureConnect", () => finish(true, "TLS connection to Bailian endpoint succeeded."));
    socket.once("timeout", () => finish(false, "TLS connection to Bailian endpoint timed out."));
    socket.once("error", (error) => finish(false, error.message));
  });
}

function getBailianRealtimeEndpoint(): string {
  const workspaceId = getTrimmedEnv("DASHSCOPE_WORKSPACE_ID");
  const region = normalizeDashScopeRegion(getTrimmedEnv("DASHSCOPE_REGION"));
  return `wss://${workspaceId}.${region}.maas.aliyuncs.com/api-ws/v1/realtime?model=${encodeURIComponent(REALTIME_MODEL)}`;
}

function parseJsonText(value: string): { code?: string; message?: string } {
  try {
    const parsed = JSON.parse(value) as { code?: unknown; message?: unknown };
    return {
      code: typeof parsed.code === "string" ? parsed.code : undefined,
      message: typeof parsed.message === "string" ? parsed.message : undefined
    };
  } catch {
    return { message: value.slice(0, 300) };
  }
}

function getSafeWorkspaceDiagnostics() {
  const workspaceId = getTrimmedEnv("DASHSCOPE_WORKSPACE_ID");

  return {
    workspaceIdLength: workspaceId.length,
    workspaceIdSha256Prefix: workspaceId ? createHash("sha256").update(workspaceId).digest("hex").slice(0, 12) : "",
    workspaceIdPatternValid: /^[A-Za-z0-9_-]+$/.test(workspaceId)
  };
}

function getSafeApiKeyDiagnostics() {
  const rawApiKey = process.env.DASHSCOPE_API_KEY;
  const trimmedApiKey = typeof rawApiKey === "string" ? rawApiKey.trim() : "";
  const apiKey = getCleanSecretEnv("DASHSCOPE_API_KEY");

  return {
    apiKeyLength: apiKey.length,
    apiKeyFormatValid: apiKey.startsWith("sk-") && !/\s/.test(apiKey),
    apiKeyHadWhitespace: typeof rawApiKey === "string" && /\s/.test(rawApiKey),
    apiKeyHadWrappingQuotes:
      (trimmedApiKey.startsWith('"') && trimmedApiKey.endsWith('"')) ||
      (trimmedApiKey.startsWith("'") && trimmedApiKey.endsWith("'"))
  };
}

function getHeaderValue(rawHeaders: string, name: string): string {
  const wanted = name.toLowerCase();
  const line = rawHeaders
    .split("\r\n")
    .find((headerLine) => headerLine.toLowerCase().startsWith(`${wanted}:`));

  return line?.split(":").slice(1).join(":").trim() ?? "";
}

function checkBailianWebSocket(): Promise<{
  ok: boolean;
  stage: string;
  elapsedMs: number;
  statusCode?: number;
  aliyunCode?: string;
  message?: string;
}> {
  const startedAt = Date.now();
  const apiKey = getCleanSecretEnv("DASHSCOPE_API_KEY");
  const workspaceId = getTrimmedEnv("DASHSCOPE_WORKSPACE_ID");

  if (!apiKey || !workspaceId) {
    return Promise.resolve({
      ok: false,
      stage: "env",
      elapsedMs: 0,
      message: "DASHSCOPE_API_KEY and/or DASHSCOPE_WORKSPACE_ID is not loaded."
    });
  }

  return new Promise((resolve) => {
    let done = false;
    const endpoint = new URL(getBailianRealtimeEndpoint());
    const socket = connect({
      host: endpoint.hostname,
      port: 443,
      servername: endpoint.hostname,
      timeout: 12000
    });
    let responseBuffer = "";
    let responseHeaders = "";
    let expectedBodyLength: number | undefined;

    const finish = (result: {
      ok: boolean;
      stage: string;
      statusCode?: number;
      aliyunCode?: string;
      message?: string;
    }) => {
      if (done) {
        return;
      }

      done = true;
      clearTimeout(timer);
      socket.destroy();
      resolve({
        ...result,
        elapsedMs: Date.now() - startedAt
      });
    };

    const timer = setTimeout(() => {
      finish({
        ok: false,
        stage: "timeout",
        message: "Bailian WebSocket HTTP Upgrade timed out."
      });
    }, 12000);

    socket.once("secureConnect", () => {
      const websocketKey = randomBytes(16).toString("base64");
      socket.write(
        [
          `GET ${endpoint.pathname}${endpoint.search} HTTP/1.1`,
          `Host: ${endpoint.host}`,
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Key: ${websocketKey}`,
          "Sec-WebSocket-Version: 13",
          `Authorization: Bearer ${apiKey}`,
          "",
          ""
        ].join("\r\n")
      );
    });

    const finishUnexpectedResponse = () => {
      const [rawHeaders, body = ""] = responseBuffer.split("\r\n\r\n", 2);
      const statusLine = rawHeaders.split("\r\n")[0] ?? "";
      const statusCode = Number.parseInt(statusLine.split(" ")[1] ?? "", 10);
      const parsed = parseJsonText(body.trim());

      finish({
        ok: false,
        stage: "unexpected-response",
        statusCode: Number.isFinite(statusCode) ? statusCode : undefined,
        aliyunCode: parsed.code,
        message: parsed.message || statusLine
      });
    };

    socket.on("data", (chunk) => {
      responseBuffer += chunk.toString("utf8");

      if (!responseBuffer.includes("\r\n\r\n")) {
        return;
      }

      const [rawHeaders, body = ""] = responseBuffer.split("\r\n\r\n", 2);
      responseHeaders ||= rawHeaders;
      const statusLine = responseHeaders.split("\r\n")[0] ?? "";
      const statusCode = Number.parseInt(statusLine.split(" ")[1] ?? "", 10);

      if (statusCode === 101) {
        finish({
          ok: true,
          stage: "upgrade",
          statusCode,
          message: "Bailian WebSocket HTTP Upgrade succeeded."
        });
        return;
      }

      const contentLength = Number.parseInt(getHeaderValue(responseHeaders, "content-length"), 10);
      expectedBodyLength = Number.isFinite(contentLength) ? contentLength : undefined;

      if (expectedBodyLength === undefined || Buffer.byteLength(body, "utf8") >= expectedBodyLength) {
        finishUnexpectedResponse();
      }
    });

    socket.once("end", finishUnexpectedResponse);
    socket.once("close", () => {
      if (!done && responseHeaders) {
        finishUnexpectedResponse();
      }
    });

    socket.once("timeout", () => {
      finish({
        ok: false,
        stage: "timeout",
        message: "Bailian WebSocket HTTP Upgrade timed out."
      });
    });

    socket.once("error", (error) => {
      finish({
        ok: false,
        stage: "error",
        message: error.message
      });
    });
  });
}

async function main() {
  const app = next({
    dev: isDev,
    hostname,
    port
  });
  const handle = app.getRequestHandler();

  await app.prepare();

  const server = createServer((request, response) => {
    response.setHeader("Content-Disposition", "inline");

    if (request.url === "/_health/app") {
      writeJson(response, 200, {
        ok: true,
        buildVersion,
        nodeEnv: process.env.NODE_ENV,
        realtimePath,
        dashscopeApiKeyLoaded: Boolean(getTrimmedEnv("DASHSCOPE_API_KEY")),
        dashscopeWorkspaceIdLoaded: Boolean(getTrimmedEnv("DASHSCOPE_WORKSPACE_ID")),
        dashscopeRegion: normalizeDashScopeRegion(getTrimmedEnv("DASHSCOPE_REGION")),
        ...getSafeApiKeyDiagnostics(),
        ...getSafeWorkspaceDiagnostics()
      });
      return;
    }

    if (request.url === "/_health/bailian") {
      void checkBailianTls().then((result) => {
        writeJson(response, result.ok ? 200 : 502, {
          buildVersion,
          bailianTls: result
        });
      });
      return;
    }

    if (request.url === "/_health/bailian-ws") {
      void checkBailianWebSocket().then((result) => {
        writeJson(response, result.ok ? 200 : 502, {
          buildVersion,
          bailianWebSocket: result
        });
      });
      return;
    }

    void handle(request, response);
  });
  server.timeout = 0;
  server.keepAliveTimeout = 0;
  server.requestTimeout = 0;
  server.headersTimeout = 0;

  createRealtimeProxyServer({
    server,
    path: realtimePath
  });

  server.listen(port, hostname, () => {
    console.log(`[Cloud] listening on http://${hostname}:${port}`);
    console.log(`[Cloud] realtime websocket path ${realtimePath}`);
    console.log(`[Cloud] build ${buildVersion}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
