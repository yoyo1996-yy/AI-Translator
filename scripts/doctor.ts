import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { config as loadEnv } from "dotenv";

type CheckStatus = "PASS" | "WARN" | "FAIL" | "SKIP";

type Check = {
  status: CheckStatus;
  name: string;
  detail: string;
};

const projectRoot = process.cwd();

loadEnv({
  path: resolve(projectRoot, ".env.local"),
  override: false,
  quiet: true
});

const checks: Check[] = [];

function getTrimmedEnv(name: string): string {
  const value = process.env[name];

  if (typeof value !== "string") {
    return "";
  }

  const trimmedValue = value.trim();
  process.env[name] = trimmedValue;
  return trimmedValue;
}

function getCleanSecretEnv(name: string): string {
  const value = process.env[name];

  if (typeof value !== "string") {
    return "";
  }

  const trimmedValue = value.trim();
  const unquotedValue =
    (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) ||
    (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"))
      ? trimmedValue.slice(1, -1).trim()
      : trimmedValue;

  return unquotedValue.replace(/\s+/g, "");
}

function add(status: CheckStatus, name: string, detail: string): void {
  checks.push({ status, name, detail });
}

function commandExists(command: string, args: string[] = ["--version"]): boolean {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: true,
    stdio: "ignore"
  });

  return result.status === 0;
}

function checkNodeVersion(): void {
  const version = process.versions.node;
  const major = Number.parseInt(version.split(".")[0] ?? "0", 10);

  if (Number.isFinite(major) && major >= 20) {
    add("PASS", "Node.js version", `Node.js ${version}`);
    return;
  }

  add("FAIL", "Node.js version", `Node.js ${version}; Node.js 20 or newer is required.`);
}

function checkDependencies(): void {
  const packageJsonPath = join(projectRoot, "package.json");
  const lockPath = join(projectRoot, "package-lock.json");
  const nodeModulesPath = join(projectRoot, "node_modules");

  add(existsSync(packageJsonPath) ? "PASS" : "FAIL", "package.json", existsSync(packageJsonPath) ? "Found." : "Missing.");
  add(existsSync(lockPath) ? "PASS" : "WARN", "package lock", existsSync(lockPath) ? "Found package-lock.json." : "package-lock.json not found.");
  add(
    existsSync(nodeModulesPath) ? "PASS" : "FAIL",
    "package dependencies",
    existsSync(nodeModulesPath) ? "node_modules is installed." : "Missing node_modules. Run npm install."
  );
}

function checkEnvStructure(): void {
  const envExamplePath = join(projectRoot, ".env.example");
  const envLocalPath = join(projectRoot, ".env.local");

  add(existsSync(envExamplePath) ? "PASS" : "FAIL", ".env.example", existsSync(envExamplePath) ? "Found." : "Missing.");
  add(
    existsSync(envLocalPath) ? "PASS" : "WARN",
    ".env.local",
    existsSync(envLocalPath) ? "Found for local development." : "Missing. Copy .env.example to .env.local for local development."
  );
}

function getProviderName(): "bailian" | "mock" | "test" | "openai" | "unsupported" {
  const provider = (getTrimmedEnv("TRANSLATION_PROVIDER") || "bailian").toLowerCase();

  if (provider === "bailian" || provider === "mock" || provider === "test" || provider === "openai") {
    return provider;
  }

  return "unsupported";
}

function checkProvider(): void {
  const provider = getProviderName();

  if (provider === "unsupported") {
    add("FAIL", "TRANSLATION_PROVIDER", "Unsupported provider. Use bailian, mock, test, or openai.");
    return;
  }

  add("PASS", "TRANSLATION_PROVIDER", `Provider: ${provider}`);

  if (provider === "mock" || provider === "test") {
    add("PASS", "provider credentials", "No paid provider credentials required.");
    return;
  }

  if (provider === "openai") {
    const apiKey = getCleanSecretEnv("OPENAI_API_KEY");
    const model = getTrimmedEnv("OPENAI_REALTIME_MODEL") || "gpt-realtime-translate";

    add(apiKey ? "PASS" : "FAIL", "OPENAI_API_KEY", apiKey ? "configured" : "missing");
    add("PASS", "OPENAI_REALTIME_MODEL", model === "gpt-realtime-translate" ? "default" : "configured");
    return;
  }

  const apiKey = getCleanSecretEnv("DASHSCOPE_API_KEY");
  const workspaceId = getTrimmedEnv("DASHSCOPE_WORKSPACE_ID");
  const region = getTrimmedEnv("DASHSCOPE_REGION");

  add(apiKey ? "PASS" : "FAIL", "DASHSCOPE_API_KEY", apiKey ? "configured" : "missing");
  add(workspaceId ? "PASS" : "FAIL", "DASHSCOPE_WORKSPACE_ID", workspaceId ? "configured" : "missing");
  add(region ? "PASS" : "FAIL", "DASHSCOPE_REGION", region ? "configured" : "missing");
}

function checkGatewayConfig(): void {
  const portValue = getTrimmedEnv("PORT") || getTrimmedEnv("REALTIME_PROXY_PORT") || "3001";
  const port = Number.parseInt(portValue, 10);
  const realtimePath = getTrimmedEnv("REALTIME_PROXY_PATH") || "/realtime";

  add(Number.isFinite(port) && port > 0 ? "PASS" : "FAIL", "Gateway port", Number.isFinite(port) && port > 0 ? `configured/default: ${port}` : "Invalid port.");
  add(realtimePath.startsWith("/") ? "PASS" : "FAIL", "REALTIME_PROXY_PATH", realtimePath.startsWith("/") ? realtimePath : "Must start with /.");
}

function checkGatewaySecurity(): void {
  add("PASS", "APP_ACCESS_TOKEN", getCleanSecretEnv("APP_ACCESS_TOKEN") ? "enabled" : "disabled");
}

function checkAndroid(): void {
  const androidPath = join(projectRoot, "android");
  const wrapperPath = join(androidPath, "gradlew");
  const wrapperBatPath = join(androidPath, "gradlew.bat");
  const wrapperPropertiesPath = join(androidPath, "gradle", "wrapper", "gradle-wrapper.properties");

  if (!existsSync(androidPath)) {
    add("SKIP", "Android project", "android/ not found.");
    return;
  }

  add("PASS", "Android project", "android/ found.");
  add(
    existsSync(wrapperPath) || existsSync(wrapperBatPath) ? "PASS" : "WARN",
    "Android Gradle wrapper",
    existsSync(wrapperPath) || existsSync(wrapperBatPath) ? "Gradle wrapper found." : "Gradle wrapper missing."
  );

  if (existsSync(wrapperPropertiesPath)) {
    const wrapperProperties = readFileSync(wrapperPropertiesPath, "utf8");
    const hasLocalDistribution = /distributionUrl\s*=.*(?:[A-Za-z]:\\|file:)/i.test(wrapperProperties);
    add(hasLocalDistribution ? "FAIL" : "PASS", "Gradle distribution", hasLocalDistribution ? "Uses a local machine path." : "Portable distribution URL.");
  } else {
    add("WARN", "Gradle distribution", "gradle-wrapper.properties missing.");
  }

  const androidHome = getTrimmedEnv("ANDROID_HOME") || getTrimmedEnv("ANDROID_SDK_ROOT");
  add(
    androidHome && existsSync(androidHome) ? "PASS" : "SKIP",
    "Android SDK",
    androidHome && existsSync(androidHome) ? "Android SDK path exists." : "ANDROID_HOME/ANDROID_SDK_ROOT not configured; needed only for Android builds."
  );
}

function checkDocker(): void {
  add(commandExists("docker") ? "PASS" : "SKIP", "Docker", commandExists("docker") ? "Docker CLI available." : "Docker not installed; needed only for Docker deployment.");
}

function checkGeneratedArtifacts(): void {
  const nextPath = join(projectRoot, ".next");
  const fcBuildPath = join(projectRoot, ".fc-build");

  if (existsSync(nextPath)) {
    const nextStats = statSync(nextPath);
    add(nextStats.isDirectory() ? "PASS" : "WARN", "Next.js build cache", nextStats.isDirectory() ? ".next exists from a previous build." : ".next is not a directory.");
  } else {
    add("SKIP", "Next.js build cache", ".next not present; npm run build creates it.");
  }

  if (existsSync(fcBuildPath)) {
    const fcStats = statSync(fcBuildPath);
    add(fcStats.isDirectory() ? "PASS" : "WARN", "FC server build output", fcStats.isDirectory() ? ".fc-build exists from a previous build." : ".fc-build is not a directory.");
  } else {
    add("SKIP", "FC server build output", ".fc-build not present; npm run build:fc-server creates it.");
  }
}

function printResult(): void {
  for (const check of checks) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }

  const hasFail = checks.some((check) => check.status === "FAIL");
  const hasWarn = checks.some((check) => check.status === "WARN");
  const result = hasFail ? "FAIL" : hasWarn ? "PASS WITH WARNINGS" : "PASS";

  console.log("");
  console.log("Doctor result:");
  console.log(result);

  if (hasFail) {
    console.log("");
    console.log("See docs/configuration.md and docs/getting-started.md.");
    process.exit(1);
  }
}

function main(): void {
  checkNodeVersion();
  checkDependencies();
  checkEnvStructure();
  checkProvider();
  checkGatewayConfig();
  checkGatewaySecurity();
  checkAndroid();
  checkDocker();
  checkGeneratedArtifacts();
  printResult();
}

main();
