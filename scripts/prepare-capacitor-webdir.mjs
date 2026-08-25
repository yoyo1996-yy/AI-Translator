import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, "out");
const nextStaticDir = path.join(repoRoot, ".next", "static");
const nextAppDir = path.join(repoRoot, ".next", "server", "app");
const publicDir = path.join(repoRoot, "public");

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyIfExists(source, destination) {
  if (await exists(source)) {
    await cp(source, destination, { recursive: true, force: true });
  }
}

if (process.env.NEXT_OUTPUT === "export") {
  process.exit(0);
}

const indexHtml = path.join(nextAppDir, "index.html");
if (!(await exists(indexHtml))) {
  console.warn("[Capacitor] Skipping webDir preparation because .next/server/app/index.html was not found.");
  process.exit(0);
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

await cp(indexHtml, path.join(outDir, "index.html"));
await copyIfExists(path.join(nextAppDir, "_not-found.html"), path.join(outDir, "404.html"));
await copyIfExists(nextStaticDir, path.join(outDir, "_next", "static"));
await copyIfExists(publicDir, outDir);

console.log("[Capacitor] Prepared out/ web assets from the Next.js build.");
