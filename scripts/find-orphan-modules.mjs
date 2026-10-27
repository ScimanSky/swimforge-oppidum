// Lists client/src modules that no other file imports (entry points excluded).
//
// Usage: run from the repo root (paths are relative): `node scripts/find-orphan-modules.mjs`.
//
// Heuristic, not a resolver: a module counts as imported when any other file under
// client/src contains a quoted specifier ending in `/<basename>` (optionally with
// .ts/.tsx/.css). Known limits:
// - only client/src is scanned, so modules used solely by server/, shared/ or tests elsewhere
//   are reported as orphans;
// - basename matching means two files with the same basename shadow each other: an import of
//   one marks both as used (false negatives);
// - `index.ts(x)` barrels imported via their directory (`./foo`) are never matched, so they are
//   reported as orphans (false positives).
// Always confirm a hit with a targeted grep before deleting anything.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, basename } from "node:path";
const root = "client/src";
const files = [];
(function walk(d) { for (const e of readdirSync(d)) { const p = join(d, e); statSync(p).isDirectory() ? walk(p) : /\.(tsx?|css)$/.test(e) && files.push(p); } })(root);
const text = files.map(f => readFileSync(f, "utf8")).join("\n");
const entry = new Set(["main.tsx", "App.tsx", "index.css", "test-setup.ts", "vite-env.d.ts"]);
for (const f of files) {
  if (entry.has(basename(f)) || /\.test\.tsx?$/.test(f)) continue;
  const stem = relative(root, f).replace(/\.(tsx?|css)$/, "");
  const name = basename(stem);
  const re = new RegExp(`['"][^'"]*/${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\.tsx?|\\.css)?['"]`);
  if (!re.test(text.replace(readFileSync(f, "utf8"), ""))) console.log(stem);
}
