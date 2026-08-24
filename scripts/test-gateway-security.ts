import { strict as assert } from "node:assert";
import { createServer, type Server } from "node:http";
import WebSocket from "ws";
import type { RealtimeProviderFactory } from "../server/providers/realtime-provider";

process.env.DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || "placeholder-server-only";
process.env.DASHSCOPE_WORKSPACE_ID = process.env.DASHSCOPE_WORKSPACE_ID || "placeholder-workspace";
process.env.DASHSCOPE_REGION = process.env.DASHSCOPE_REGION || "cn-beijing";

let createRealtimeProxyServer: typeof import("../server/realtime-proxy").createRealtimeProxyServer;
let createMockRealtimeProvider: typeof import("../server/providers/mock-provider").createMockRealtimeProvider;

type RunningGateway = {
  server: Server;
  url: string;
  close: () => Promise<void>;
};

function setEnv(overrides: Record<string, string | undefined>): () => void {
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);

    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        reject(new Error("Gateway test server did not expose a TCP port."));
        return;
      }

      resolve(address.port);
    });
  });
}

async function startGateway(
  env: Record<string, string | undefined>,
  options: { autoConnect?: boolean; providerFactory?: RealtimeProviderFactory } = {}
): Promise<RunningGateway> {
  if (!createRealtimeProxyServer) {
    ({ createRealtimeProxyServer } = await import("../server/realtime-proxy"));
  }

  const restoreEnv = setEnv(env);
  const server = createServer();
  const wss = createRealtimeProxyServer({
    server,
    path: "/realtime",
    autoConnect: options.autoConnect ?? false,
    providerFactory: options.providerFactory
  });
  const port = await listen(server);

  return {
    server,
    url: `ws://127.0.0.1:${port}/realtime`,
    close: async () => {
      for (const client of wss.clients) {
        client.terminate();
      }
      wss.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      restoreEnv();
    }
  };
}

function openSocket(url: string, token?: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, {
      headers: token
        ? {
            Authorization: `Bearer ${token}`
          }
        : undefined
    });
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error("Timed out waiting for WebSocket open."));
    }, 5000);

    socket.once("open", () => {
      clearTimeout(timer);
      resolve(socket);
    });

    socket.once("unexpected-response", (_request, response) => {
      clearTimeout(timer);
      reject(Object.assign(new Error(`Unexpected response: ${response.statusCode}`), { statusCode: response.statusCode }));
    });

    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function expectRejected(url: string, expectedStatusCode: number, token?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, {
      headers: token
        ? {
            Authorization: `Bearer ${token}`
          }
        : undefined
    });
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error("Timed out waiting for WebSocket rejection."));
    }, 5000);

    socket.once("open", () => {
      clearTimeout(timer);
      socket.close();
      reject(new Error("WebSocket was expected to be rejected, but opened."));
    });

    socket.once("unexpected-response", (_request, response) => {
      clearTimeout(timer);
      try {
        assert.equal(response.statusCode, expectedStatusCode);
        resolve();
      } catch (error) {
        reject(error);
      }
    });

    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function waitForProxyError(socket: WebSocket, expectedGatewayCode: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${expectedGatewayCode}.`));
    }, 5000);

    socket.on("message", (rawMessage) => {
      try {
        const message = JSON.parse(rawMessage.toString()) as { type?: string; gatewayCode?: string };

        if (message.type === "proxy.error" && message.gatewayCode === expectedGatewayCode) {
          clearTimeout(timer);
          resolve();
        }
      } catch {
        // Ignore non-json test messages.
      }
    });
  });
}

function waitForProxyStatus(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timed out waiting for proxy.status."));
    }, 5000);

    socket.on("message", (rawMessage) => {
      try {
        const message = JSON.parse(rawMessage.toString()) as { type?: string };

        if (message.type === "proxy.status") {
          clearTimeout(timer);
          resolve();
        }
      } catch {
        // Ignore non-json test messages.
      }
    });
  });
}

async function testAuthenticationDisabled() {
  const gateway = await startGateway({
    APP_ACCESS_TOKEN: undefined
  });

  try {
    const socket = await openSocket(gateway.url);
    assert.equal(socket.readyState, WebSocket.OPEN);
    socket.close();
  } finally {
    await gateway.close();
  }
}

async function testAuthenticationEnabled() {
  const gateway = await startGateway({
    APP_ACCESS_TOKEN: "test-access-token"
  });

  try {
    const missingTokenSocket = await openSocket(gateway.url);
    const missingTokenError = waitForProxyError(missingTokenSocket, "unauthorized");
    missingTokenSocket.send(JSON.stringify({ type: "browser.stop" }));
    await missingTokenError;
    missingTokenSocket.close();

    await expectRejected(gateway.url, 401, "wrong-token");

    const firstMessageAuthSocket = await openSocket(gateway.url);
    const statusPromise = waitForProxyStatus(firstMessageAuthSocket);
    firstMessageAuthSocket.send(JSON.stringify({ type: "auth", token: "test-access-token" }));
    await statusPromise;
    assert.equal(firstMessageAuthSocket.readyState, WebSocket.OPEN);
    firstMessageAuthSocket.close();

    const headerAuthSocket = await openSocket(gateway.url, "test-access-token");
    assert.equal(headerAuthSocket.readyState, WebSocket.OPEN);
    headerAuthSocket.close();
  } finally {
    await gateway.close();
  }
}

async function testOversizedMessageRejected() {
  const gateway = await startGateway({
    APP_ACCESS_TOKEN: undefined,
    MAX_MESSAGE_SIZE_BYTES: "32"
  });

  try {
    const socket = await openSocket(gateway.url);
    const errorPromise = waitForProxyError(socket, "message_size_exceeded");
    socket.send(JSON.stringify({ type: "browser.stop", padding: "x".repeat(64) }));
    await errorPromise;
    socket.close();
  } finally {
    await gateway.close();
  }
}

async function testSessionTimeoutHandled() {
  const gateway = await startGateway({
    APP_ACCESS_TOKEN: undefined,
    MAX_SESSION_DURATION_SECONDS: "1"
  });

  try {
    const socket = await openSocket(gateway.url);
    await waitForProxyError(socket, "session_duration_exceeded");
    socket.close();
  } finally {
    await gateway.close();
  }
}

async function testGatewayUsesProviderAdapter() {
  if (!createMockRealtimeProvider) {
    ({ createMockRealtimeProvider } = await import("../server/providers/mock-provider"));
  }

  const gateway = await startGateway(
    {
      APP_ACCESS_TOKEN: undefined
    },
    {
      autoConnect: true,
      providerFactory: createMockRealtimeProvider
    }
  );

  let socket: WebSocket | null = null;

  try {
    socket = await openSocket(gateway.url);
    const activeSocket = socket;
    await waitForProxyStatus(activeSocket);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out waiting for proxy.ready.")), 5000);

      activeSocket.on("message", (rawMessage) => {
        try {
          const message = JSON.parse(rawMessage.toString()) as { type?: string };

          if (message.type === "proxy.ready") {
            clearTimeout(timer);
            resolve();
          }
        } catch {
          // Ignore non-json test messages.
        }
      });
    });
  } finally {
    socket?.close();
    await gateway.close();
  }
}

async function main() {
  await testAuthenticationDisabled();
  await testAuthenticationEnabled();
  await testOversizedMessageRejected();
  await testSessionTimeoutHandled();
  await testGatewayUsesProviderAdapter();

  console.log("Gateway security tests: passed");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
