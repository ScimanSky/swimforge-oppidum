#!/usr/bin/env node
/**
 * Runs after `vite build --mode native`: removes from dist/public the heavy static
 * folders that the native app loads from the website instead (VITE_ASSET_BASE_URL,
 * see client/src/lib/asset-base.ts), so they are not packed into the APK.
 * Never run it before the web build: the web serves these folders itself.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "dist/public");
const REMOTE_FOLDERS = ["images", "profile_badges", "badges_new", "videos"];
// Not referenced by the client at all (kept on the web only as a source file).
const UNUSED_FILES = ["swimforge-logo_original.png"];

function dirSize(target) {
  const stat = fs.statSync(target);
  if (!stat.isDirectory()) return stat.size;
  return fs.readdirSync(target).reduce((total, entry) => total + dirSize(path.join(target, entry)), 0);
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

// Without an asset base the app would reference the pruned files locally: refuse.
const assetBase = loadEnv("native", ROOT, "VITE_").VITE_ASSET_BASE_URL ?? "";
if (!assetBase.trim()) {
  console.error("prune-native-bundle: VITE_ASSET_BASE_URL is empty in the native env (.env.native), not pruning");
  process.exit(1);
}

if (!fs.existsSync(path.join(OUT_DIR, "index.html"))) {
  console.error(`prune-native-bundle: ${OUT_DIR}/index.html not found, run the native build first`);
  process.exit(1);
}

for (const folder of [...REMOTE_FOLDERS, ...UNUSED_FILES]) {
  const target = path.join(OUT_DIR, folder);
  if (!fs.existsSync(target)) continue;
  const size = dirSize(target);
  fs.rmSync(target, { recursive: true, force: true });
  console.log(`prune-native-bundle: removed ${folder} (${mb(size)})`);
}

const remaining = fs.readdirSync(OUT_DIR).sort();
console.log(`prune-native-bundle: dist/public is now ${mb(dirSize(OUT_DIR))}: ${remaining.join(", ")}`);
