import { strict as assert } from "node:assert";
import { createServer, type Server } from "node:http";
import WebSocket from "ws";

process.env.TRANSLATION_PROVIDER = "mock";
process.env.REALTIME_PROXY_PATH = "/realtime";
process.env.APP_ACCESS_TOKEN = "";

type RunningGateway = {
  server: Server;
  url: string;
  close: () => Promise<void>;
};

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        reject(new Error("Gateway smoke server did not expose a TCP port."));
        return;
      }

      resolve(address.port);
    });
  });
}

function getHttpStatus(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    fetch(url)
      .then((response) => resolve(response.status))
      .catch(reject);
  });
}

function waitForMessage(socket: WebSocket, type: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${type}.`));
    }, 5000);

    socket.on("message", (rawMessage) => {
      try {
        const message = JSON.parse(rawMessage.toString()) as { type?: string };

        if (message.type === type) {
          clearTimeout(timer);
          resolve();
        }
      } catch {
        // Ignore non-json test messages.
      }
    });
  });
}

function openSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
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
      reject(new Error(`Unexpected WebSocket response: ${response.statusCode}`));
    });

    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function startGateway(): Promise<RunningGateway> {
  const { createRealtimeProxyServer } = await import("../server/realtime-proxy");
  const server = createServer((request, response) => {
    if (request.url === "/health" || request.url === "/_health") {
      response.statusCode = 200;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ status: "ok", realtimePath: "/realtime", provider: "mock" }));
      return;
    }

    response.statusCode = 404;
    response.end("Not Found");
  });
  const wss = createRealtimeProxyServer({
    server,
    path: "/realtime",
    autoConnect: true
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
    }
  };
}

async function main(): Promise<void> {
  const gateway = await startGateway();
  let socket: WebSocket | null = null;

  try {
    const healthUrl = gateway.url.replace("ws://", "http://").replace("/realtime", "/health");
    const status = await getHttpStatus(healthUrl);
    assert.equal(status, 200);

    socket = await openSocket(gateway.url);
    await waitForMessage(socket, "proxy.ready");
    socket.close();

    console.log("Gateway smoke test: passed");
  } finally {
    socket?.terminate();
    await gateway.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
