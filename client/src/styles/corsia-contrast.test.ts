import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// path.resolve, not `new URL(..., import.meta.url)`: Vite rewrites that pattern into an asset URL.
const css = readFileSync(path.resolve(import.meta.dirname, "../index.css"), "utf8");

const lines = css.split("\n");

/**
 * Custom properties declared directly in the theme block `selector { ... }` (no nesting in
 * these blocks). Only a block whose selector list is just `selector` counts: derived blocks
 * such as `:root,\n.dark {` (previous line ends with a comma) are skipped, and exactly one
 * theme block must remain, so a reordering or a duplicate cannot pick the wrong one.
 */
function block(selector: string): Record<string, string> {
  const starts = lines.flatMap((line, index) =>
    line === `${selector} {` && !(lines[index - 1] ?? "").trimEnd().endsWith(",") ? [index] : [],
  );
  if (starts.length !== 1) {
    throw new Error(`atteso un solo blocco «${selector} {» in index.css, trovati ${starts.length}`);
  }
  const end = lines.indexOf("}", starts[0]);
  if (end < 0) throw new Error(`blocco ${selector} senza chiusura in index.css`);
  const tokens: Record<string, string> = {};
  for (const match of lines.slice(starts[0], end).join("\n").matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    tokens[match[1]] = match[2].trim();
  }
  return tokens;
}

function resolve(name: string, own: Record<string, string>, base: Record<string, string>): string {
  let value = own[name] ?? base[name];
  for (let hops = 0; hops < 5 && value?.startsWith("var(--"); hops += 1) {
    const ref = value.slice("var(--".length, -1);
    value = own[ref] ?? base[ref];
  }
  if (!value || !/^#[0-9a-fA-F]{6}$/.test(value)) throw new Error(`--${name} non è un colore #rrggbb: ${value}`);
  return value;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const light = block(":root");
const dark = block(".dark");
const themes: Array<[string, (name: string) => string]> = [
  ["chiaro", (name) => resolve(name, light, {})],
  ["scuro", (name) => resolve(name, dark, light)],
];

const TEXTS = ["foreground", "muted-foreground", "action-text", "xp", "success", "danger", "warning", "gold"];
const SURFACES = ["background", "card", "raised"];
const ON_FILLS: Array<[string, string]> = [
  ["primary-foreground", "primary"],
  ["destructive-foreground", "destructive"],
];

/** Tinted chip: text on a 15% fill blended over a surface (`bg-xp/15` and friends). */
const TINTS: Array<[string, string]> = [
  ["xp", "xp"],
  ["success", "success"],
  ["warning", "warning"],
  ["danger", "danger"],
  ["gold", "gold"],
  ["action-text", "primary"],
];

function tint(fill: string, surface: string, alpha = 0.15): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16);
  return `#${[1, 3, 5]
    .map((i) => Math.round(alpha * channel(fill, i) + (1 - alpha) * channel(surface, i)))
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")}`;
}

const TESTED = [...new Set([...TEXTS, ...SURFACES, ...ON_FILLS.flat(), ...TINTS.flat()])];

describe("token Corsia dichiarati in entrambi i temi", () => {
  it.each(TESTED)("--%s è dichiarato direttamente in :root e in .dark", (name) => {
    expect(light[name], `:root senza --${name}`).toBeDefined();
    expect(dark[name], `.dark senza --${name}`).toBeDefined();
  });
});

describe.each(themes)("token Corsia, tema %s", (_theme, color) => {
  it.each(TEXTS.flatMap((text) => SURFACES.map((surface) => [text, surface])))(
    "--%s su --%s almeno 4.5:1",
    (text, surface) => {
      expect(contrast(color(text), color(surface))).toBeGreaterThanOrEqual(4.5);
    },
  );
  it.each(ON_FILLS)("--%s su --%s almeno 4.5:1", (text, fill) => {
    expect(contrast(color(text), color(fill))).toBeGreaterThanOrEqual(4.5);
  });
  it.each(TINTS.flatMap(([text, fill]) => SURFACES.map((surface) => [text, fill, surface])))(
    "--%s su chip --%s al 15%% sopra --%s almeno 4.5:1",
    (text, fill, surface) => {
      expect(contrast(color(text), tint(color(fill), color(surface)))).toBeGreaterThanOrEqual(4.5);
    },
  );
});
