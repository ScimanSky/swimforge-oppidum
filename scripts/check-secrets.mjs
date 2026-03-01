#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";

const TEXT_EXT_ALLOWLIST = new Set([
  ".cjs",
  ".conf",
  ".css",
  ".env",
  ".example",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".mjs",
  ".md",
  ".mts",
  ".sh",
  ".sql",
  ".svg",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);

const BLOCKED_SECRET_EXTENSIONS = new Set([".key", ".pem", ".p12", ".pfx"]);

const SECRET_PATTERNS = [
  { name: "private-key", regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g },
  { name: "aws-access-key-id", regex: /AKIA[0-9A-Z]{16}/g },
  { name: "github-token", regex: /\bgh(?:p|o|u|s|r)_[A-Za-z0-9]{36,}\b/g },
  { name: "slack-token", regex: /\bxox(?:b|p|a|r|s)-[A-Za-z0-9-]{10,}\b/g },
  { name: "stripe-key", regex: /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
  { name: "google-api-key", regex: /\bAIza[0-9A-Za-z\\-_]{35}\b/g },
  {
    name: "supabase-service-role-jwt-assignment",
    regex:
      /\bSUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*["']?eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  },
];

function getTrackedFiles() {
  const output = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" });
  return output.split("\0").filter(Boolean);
}

function isLikelyText(pathname, buffer) {
  const extension = extname(pathname).toLowerCase();
  if (TEXT_EXT_ALLOWLIST.has(extension)) return true;
  if (buffer.includes(0)) return false;
  return true;
}

function findLineNumber(content, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (content[i] === "\n") line += 1;
  }
  return line;
}

function main() {
  const files = getTrackedFiles();
  const findings = [];

  for (const file of files) {
    const extension = extname(file).toLowerCase();
    if (BLOCKED_SECRET_EXTENSIONS.has(extension)) {
      findings.push({
        file,
        line: 1,
        rule: "blocked-secret-file-extension",
      });
      continue;
    }

    let buffer;
    try {
      buffer = readFileSync(file);
    } catch {
      continue;
    }

    if (!isLikelyText(file, buffer)) continue;
    const content = buffer.toString("utf8");

    for (const pattern of SECRET_PATTERNS) {
      pattern.regex.lastIndex = 0;
      for (const match of content.matchAll(pattern.regex)) {
        findings.push({
          file,
          line: findLineNumber(content, match.index ?? 0),
          rule: pattern.name,
        });
      }
    }
  }

  if (findings.length === 0) {
    console.log("Secrets scan passed (no high-confidence leaks detected).");
    return;
  }

  console.error("Secrets scan failed. Potential leaks detected:");
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} [${finding.rule}]`);
  }
  process.exit(1);
}

main();
