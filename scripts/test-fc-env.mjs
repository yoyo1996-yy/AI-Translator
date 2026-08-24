import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const fcDir = path.join(rootDir, "deploy", "aliyun-fc", "verify-fc");
const envLocalPath = path.join(fcDir, ".env.local");

function baseEnv(overrides = {}) {
  const keep = [
    "PATH",
    "Path",
    "PATHEXT",
    "SYSTEMROOT",
    "SystemRoot",
    "WINDIR",
    "TEMP",
    "TMP",
    "COMSPEC",
    "ComSpec",
    "PROCESSOR_ARCHITECTURE"
  ];
  const env = {};

  for (const name of keep) {
    if (process.env[name]) {
      env[name] = process.env[name];
    }
  }

  return {
    ...env,
    NODE_ENV: "production",
    HOSTNAME: "0.0.0.0",
    PORT: "9000",
    REALTIME_PROXY_PATH: "/realtime",
    ...overrides
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestRoot() {
  return new Promise((resolve, reject) => {
    const request = http.get("http://127.0.0.1:9000/", (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode));
    });

    request.setTimeout(10_000, () => request.destroy(new Error("HTTP timeout")));
    request.on("error", reject);
  });
}

function testRealtimeRoute() {
  const WebSocket = require(path.join(fcDir, "node_modules", "ws"));

  return new Promise((resolve) => {
    const socket = new WebSocket("ws://127.0.0.1:9000/realtime");
    const timer = setTimeout(() => {
      socket.terminate();
      resolve(false);
    }, 10_000);

    socket.on("open", () => {
      clearTimeout(timer);
      socket.close();
      resolve(true);
    });

    socket.on("unexpected-response", () => {
      clearTimeout(timer);
      resolve(false);
    });

    socket.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

async function startServer(env) {
  const child = spawn(process.execPath, ["server/cloud-server.js"], {
    cwd: fcDir,
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";

  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  await wait(5_000);

  return {
    child,
    getOutput: () => output
  };
}

async function stopServer(child) {
  if (child.exitCode === null) {
    child.kill("SIGTERM");
    await wait(500);
  }

  if (child.exitCode === null) {
    child.kill("SIGKILL");
  }
}

async function scenarioA() {
  if (fs.existsSync(envLocalPath)) {
    fs.rmSync(envLocalPath);
  }

  const server = await startServer(
    baseEnv({
      DASHSCOPE_API_KEY: "placeholder-server-only",
      DASHSCOPE_WORKSPACE_ID: "placeholder-workspace",
      DASHSCOPE_REGION: "cn-beijing"
    })
  );

  try {
    const status = await requestRoot();
    const realtimeRoute = await testRealtimeRoute();
    const output = server.getOutput();

    if (status !== 200 || !realtimeRoute || !output.includes("http://0.0.0.0:9000")) {
      throw new Error("Scenario A failed.");
    }
  } finally {
    await stopServer(server.child);
  }
}

async function scenarioB() {
  if (fs.existsSync(envLocalPath)) {
    fs.rmSync(envLocalPath);
  }

  const server = await startServer(
    baseEnv({
      DASHSCOPE_WORKSPACE_ID: "placeholder-workspace",
      DASHSCOPE_REGION: "cn-beijing"
    })
  );

  await wait(1_000);
  const output = server.getOutput();

  if (server.child.exitCode === null) {
    await stopServer(server.child);
    throw new Error("Scenario B failed: server started without DASHSCOPE_API_KEY.");
  }

  if (
    !output.includes("Missing required environment variables:") ||
    !output.includes("DASHSCOPE_API_KEY and/or DASHSCOPE_WORKSPACE_ID.")
  ) {
    throw new Error("Scenario B failed: missing-env message was not found.");
  }
}

async function scenarioC() {
  fs.writeFileSync(
    envLocalPath,
    [
      "DASHSCOPE_API_KEY=placeholder-env-local",
      "DASHSCOPE_WORKSPACE_ID=placeholder-workspace-local",
      "DASHSCOPE_REGION=cn-beijing"
    ].join("\n"),
    "utf8"
  );

  const server = await startServer(baseEnv());

  try {
    const status = await requestRoot();
    if (status !== 200) {
      throw new Error("Scenario C failed.");
    }
  } finally {
    await stopServer(server.child);
    fs.rmSync(envLocalPath, { force: true });
  }
}

async function main() {
  if (!fs.existsSync(path.join(fcDir, "server", "cloud-server.js"))) {
    throw new Error("Missing verify-fc/server/cloud-server.js. Run npm run package:fc first.");
  }

  await scenarioA();
  await scenarioB();
  await scenarioC();

  console.log("FC env tests: passed");
}

main().catch((error) => {
  if (fs.existsSync(envLocalPath)) {
    fs.rmSync(envLocalPath, { force: true });
  }

  console.error(error.message);
  process.exit(1);
});
