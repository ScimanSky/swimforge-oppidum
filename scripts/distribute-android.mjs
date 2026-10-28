#!/usr/bin/env node
// Builds the debug APK and uploads it to Firebase App Distribution (group "owner").
// Usage: node scripts/distribute-android.mjs [--no-bump] [--no-build] [--group alias] [--notes "text"]
// Requires: firebase CLI login (npx firebase-tools), android/app/google-services.json,
// JAVA_HOME + ANDROID_HOME in the environment, .env.native at the repo root.
import { readFile, writeFile } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const gradleFile = resolve(root, "android/app/build.gradle");
const servicesFile = resolve(root, "android/app/google-services.json");
const apk = resolve(root, "android/app/build/outputs/apk/debug/app-debug.apk");
const metadataFile = resolve(root, "android/app/build/outputs/apk/debug/output-metadata.json");
const PACKAGE_NAME = "it.swimforge.app";
const PROJECT_ID = "swimforge-oppidum";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
const group = option("--group", "owner");

function run(cmd, cmdArgs, opts = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(cmd, cmdArgs, { stdio: "inherit", cwd: root, ...opts });
    child.on("exit", (code) => (code === 0 ? resolveRun() : reject(new Error(`${cmd} ${cmdArgs.join(" ")} exited with ${code}`))));
    child.on("error", reject);
  });
}

async function readAppId() {
  const config = JSON.parse(await readFile(servicesFile, "utf8"));
  if (config.project_info?.project_id !== PROJECT_ID) throw new Error(`google-services.json is not for ${PROJECT_ID}`);
  const client = (config.client ?? []).find((c) => c.client_info?.android_client_info?.package_name === PACKAGE_NAME);
  const appId = client?.client_info?.mobilesdk_app_id;
  if (!/^1:\d+:android:[a-f0-9]+$/.test(appId ?? "")) throw new Error(`No Android app ${PACKAGE_NAME} in google-services.json`);
  return appId;
}

async function bumpVersion() {
  const gradle = await readFile(gradleFile, "utf8");
  const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  const current = Number(/versionCode\s+(\d+)/.exec(gradle)?.[1] ?? "0");
  const next = current + 1;
  const versionName = `${pkg.version}.${next}`;
  const updated = gradle
    .replace(/versionCode\s+\d+/, `versionCode ${next}`)
    .replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`);
  await writeFile(gradleFile, updated);
  return { versionCode: next, versionName };
}

async function readBuiltVersion() {
  const metadata = JSON.parse(await readFile(metadataFile, "utf8"));
  const element = metadata.elements?.[0];
  if (metadata.applicationId !== PACKAGE_NAME || !element) throw new Error("output-metadata.json does not describe the SwimForge debug APK");
  return { versionCode: element.versionCode, versionName: element.versionName };
}

async function releaseNotes() {
  const custom = option("--notes", null);
  if (custom) return custom;
  const { stdout: sha } = await execFileAsync("git", ["rev-parse", "--short", "HEAD"], { cwd: root });
  const { stdout: branch } = await execFileAsync("git", ["branch", "--show-current"], { cwd: root });
  const { stdout: log } = await execFileAsync("git", ["log", "-5", "--format=- %s"], { cwd: root });
  return `SwimForge Android ${branch.trim()} @ ${sha.trim()}\n${log.trim()}`;
}

const appId = await readAppId();
if (!flag("--no-bump")) {
  const v = await bumpVersion();
  console.log(`versionCode ${v.versionCode}, versionName ${v.versionName}`);
}
if (!flag("--no-build")) {
  await run("pnpm", ["build:native"]);
  await run("npx", ["cap", "sync", "android"]);
  await run("./gradlew", ["assembleDebug"], { cwd: resolve(root, "android") });
}
const built = await readBuiltVersion();
const notes = await releaseNotes();
console.log(`Distributing ${built.versionName} (${built.versionCode}) to group "${group}"…`);
await run("npx", ["-y", "firebase-tools@latest", "appdistribution:distribute", apk, "--app", appId, "--project", PROJECT_ID, "--groups", group, "--release-notes", notes]);
console.log("Done. Testers receive an email from Firebase App Distribution.");
