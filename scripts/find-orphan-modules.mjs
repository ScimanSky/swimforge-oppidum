// Lists client/src modules that no other file imports (entry points excluded).
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
