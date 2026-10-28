# Fase 2 — Veste grafica «Corsia»: piano di implementazione

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Portare tutto il client React (sito e app Android) dallo stile «neon» al sistema «Corsia», con la navigazione a cinque voci (Oggi · Feed · + · Allena · Community), la nuova schermata Oggi e la pulizia di tutte le pagine visibili.

**Architecture:** Branch `android/phase-2` (da `main` 783a05c). Prima cambiano le fondamenta condivise (token in `client/src/index.css`, font, primitivi shadcn, classi `.surface-panel` & co.), così tutta l'app cambia aspetto senza toccare le pagine; poi shell e navigazione (modulo puro `lib/navigation.ts`), poi le schermate chiave, poi la pulizia pagina per pagina guidata da un test «design-lint» a cricchetto, infine la rinomina dei nomi legacy. Design approvato: `docs/plans/2026-10-28-android-phase-2-design.md`. Proposta visiva: `docs/design-proposals/claude-corsia/` (guardare `renders/*.png` prima di ogni task di schermata).

**Tech Stack:** React 19, Vite 7, Tailwind 4 (`@theme inline` in `index.css`), shadcn/ui (`client/src/components/ui`), wouter 3 (`memoryLocation` per i test), tRPC 11, vitest + Testing Library (jsdom per `client/**`), `@fontsource/manrope` e `@fontsource/barlow-condensed` (OFL), Capacitor 8 (`@capacitor/status-bar`).

**Verifica sempre dalla root:** `pnpm check`, `pnpm lint` (0 errori; 28 warning preesistenti), `pnpm test` (63 file / 360 test di partenza, devono solo crescere), `pnpm build`. **Push:** `git push git@github.com:ScimanSky/swimforge-oppidum.git android/phase-2`. Mai `main` (deploya in produzione). Nessuna modifica al server, al database o a `android/` salvo dove indicato.

---

## Regole Corsia (valgono per ogni task che tocca UI)

**Colori.** `bg-accent` è il grigio di hover dei menu (non più lime) e `text-primary` è vietato come testo: si usa `text-action-text`. Solo token: `bg-background` (fondale), `bg-card` (superficie), `bg-raised` (rialzo), `border-border`, `text-foreground`, `text-muted-foreground`, `bg-primary`/`text-primary-foreground` (azione piena), `text-action-text` (azione come testo o icona), `text-xp`/`bg-xp` (solo XP, livello, record), `text-success`, `text-danger`, `text-warning`. Vietati: hex o `rgba()` fissi nei componenti, `text-white`/`bg-black/..` (salvo velo pieno su foto e testo su `bg-destructive`), gradienti decorativi, glow (`shadow-[0_0_...]`), `backdrop-blur` su card. **Un solo accento per schermata**: l'azzurro per le azioni, l'arancio solo per XP e record, il verde solo per esiti positivi.

**Tipografia.** `font-display` (Barlow Condensed 700) solo per numeri/metriche e titoli di pagina; tutto il resto Manrope (`font-sans`, default). Minimo `text-xs` (12px): niente `text-[9px|10px|11px]` né `text-[0.6xrem]`. Etichette in minuscolo (sentence case), niente `uppercase` con `tracking-*` largo. Numeri con `tabular-nums`.

**Superfici.** Le classi condivise (`.surface-panel`, `.glass-panel`, …) stanno in `@layer components`: le utility sullo stesso elemento vincono, quindi `surface-panel bg-raised` funziona. Card = `.surface-panel` o `rounded-2xl border border-border bg-card` (raggio 16px), padding 16px (`p-4`). Niente card dentro card con bordi doppi: dentro una card si separa con `border-t border-border` o `bg-raised`. Chip = `<Chip>` (§Task 7), pillola alta 28px.

**Foto.** Mai testo sopra una foto. Le foto di sfondo diventano miniature (48px, `rounded-xl object-cover`) o media a tutta larghezza senza testo sovrapposto.

**Metriche.** Sempre `<Metric value unit label>` (§Task 7): valore Barlow, unità piccola grigia, etichetta 12px. Niente anelli decorativi, niente «—» dentro cerchi: una metrica senza dato non si mostra.

**Lingua.** Tutto in italiano, date con i formatter di `lib/format.ts` (§Task 5). Glossario: Training → Allenamento; Activity Tracker → Attività; Social Home Feed → Feed; Challenges → Sfide; Challenge Details → Sfida; Leaderboard → Classifica (plurale Classifiche); Statistics / Performance Profile → Statistiche; Badges → Badge; AI Coach → Coach AI; Club Directory / Club Details → Club; Club Event → Evento; Club Meet → Gara; Club Documents → Documenti; Training Objectives → Obiettivi; Settings → Impostazioni; Profile → Profilo; Sign out → Esci; Moderation → Moderazione; Open Water → Acque libere; Pool Swim → Vasca; Swim Session → Nuotata; Pace → Passo; HR → FC; Laps → Vasche; Theme → Tema; Dark/Light → Scuro/Chiaro.

**Copy mobile.** Niente frasi da desktop («seleziona a sinistra…»). Testi brevi, verbi all'imperativo nei pulsanti.

**Comportamento invariato.** I task di stile non cambiano query, mutazioni, rotte o logica; se un test esistente cerca un testo che cambia (glossario), si aggiorna il test nello stesso commit. Gli attributi `data-tour` restano sugli elementi equivalenti.

---

## Gruppo 1 — Fondamenta

### Task 1: Token Corsia e test di contrasto

**Files:**
- Create: `client/src/styles/corsia-contrast.test.ts`
- Modify: `client/src/index.css` (blocchi `:root`, `.dark`, `@theme inline`; righe 13-219 di oggi)

**Step 1: test che fallisce.** Crea `client/src/styles/corsia-contrast.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("../index.css", import.meta.url)), "utf8");

/** Custom properties declared directly in `selector { ... }` (no nesting in these blocks). */
function block(selector: string): Record<string, string> {
  const start = css.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`blocco ${selector} non trovato in index.css`);
  const end = css.indexOf("\n}", start + 1);
  const tokens: Record<string, string> = {};
  for (const match of css.slice(start, end).matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
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

const TEXTS = ["foreground", "muted-foreground", "action-text", "xp", "success", "danger", "warning"];
const SURFACES = ["background", "card", "raised"];
const ON_FILLS: Array<[string, string]> = [
  ["primary-foreground", "primary"],
  ["destructive-foreground", "destructive"],
];

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
});
```

**Step 2:** `pnpm vitest run client/src/styles/corsia-contrast.test.ts` → FAIL («--foreground non è un colore #rrggbb: oklch(...)»).

**Step 3: token.** In `client/src/index.css` sostituisci il blocco `:root { ... }` (righe 13-91) con:

```css
:root {
  /* Corsia · tema chiaro «Cloro» (docs/plans/2026-10-28-android-phase-2-design.md §3.1) */
  --background: #F4F7F9;
  --foreground: #0D1B27;
  --card: #FFFFFF;
  --card-foreground: #0D1B27;
  --popover: #FFFFFF;
  --popover-foreground: #0D1B27;
  --raised: #E7EDF2;
  --card-elevated: #E7EDF2;
  --border: #DCE4EA;
  --input: #DCE4EA;

  --primary: #34C6EB;
  --primary-foreground: #062030;
  --action-text: #056A96;
  --ring: #056A96;
  --secondary: #E7EDF2;
  --secondary-foreground: #0D1B27;
  --muted: #E7EDF2;
  --muted-foreground: #556677;
  --accent: #E7EDF2;
  --accent-foreground: #0D1B27;

  --xp: #983F0C;
  --success: #116846;
  --warning: #785400;
  --danger: #A62B2B;
  --destructive: #A62B2B;
  --destructive-foreground: #FFFFFF;
  --gold: #74570E;
  --gold-light: #74570E;

  --chart-1: #34C6EB;
  --chart-2: #2C8FB8;
  --chart-3: #5CD6A0;
  --chart-4: #FFB27A;
  --chart-5: #FF8B47;
  --zone-1: #3D5770;
  --zone-2: #2C8FB8;
  --zone-3: #34C6EB;
  --zone-4: #FFB27A;
  --zone-5: #FF8B47;

  /* Legacy aliases: removed in Task 22 (rename). Text-safe mapping. */
  --electric-cyan: var(--action-text);
  --electric-lime: var(--success);
  --electric-coral: var(--danger);
  --electric-violet: var(--muted-foreground);
  --forge-orange: var(--xp);
  --forge-orange-soft: color-mix(in oklch, var(--xp) 16%, transparent);
  --ink: #062030;
  --neon-glow: transparent;
  --neon-soft: transparent;
  --forge-glow: transparent;
  --surface-glow: transparent;
  --chip-cyan: var(--action-text);
  --chip-emerald: var(--success);
  --chip-amber: var(--muted-foreground);
  --chip-rose: var(--danger);
  --chip-sky: var(--muted-foreground);
  --chip-violet: var(--muted-foreground);
  --navy: var(--card);
  --navy-light: var(--raised);
  --azure: var(--action-text);
  --badge-spotlight: var(--raised);
  --badge-ring: var(--border);
  --badge-shadow: transparent;

  --z-base: 1;
  --z-nav: 40;
  --z-header: 50;
  --z-overlay: 60;
  --z-modal: 70;
  --z-toast: 80;

  --radius: 0.75rem;
  --sidebar: var(--card);
  --sidebar-foreground: var(--foreground);
  --sidebar-primary: var(--primary);
  --sidebar-primary-foreground: var(--primary-foreground);
  --sidebar-accent: var(--raised);
  --sidebar-accent-foreground: var(--foreground);
  --sidebar-border: var(--border);
  --sidebar-ring: var(--ring);
}
```

e il blocco `.dark { ... }` (righe 93-160) con:

```css
.dark {
  /* Corsia · tema scuro (default) */
  --background: #0A1520;
  --foreground: #ECF3F8;
  --card: #111E2B;
  --card-foreground: #ECF3F8;
  --popover: #111E2B;
  --popover-foreground: #ECF3F8;
  --raised: #182838;
  --card-elevated: #182838;
  --border: #233649;
  --input: #233649;

  --primary: #34C6EB;
  --primary-foreground: #062030;
  --action-text: #34C6EB;
  --ring: #34C6EB;
  --secondary: #182838;
  --secondary-foreground: #ECF3F8;
  --muted: #182838;
  --muted-foreground: #93A6B8;
  --accent: #182838;
  --accent-foreground: #ECF3F8;

  --xp: #FF8B47;
  --success: #5CD6A0;
  --warning: #F2C14E;
  --danger: #FF7B7B;
  --destructive: #FF7B7B;
  --destructive-foreground: #0A1520;
  --gold: #E8B84A;
  --gold-light: #E8B84A;
}
```

(I token non ridefiniti nel `.dark`, come grafici, zone e alias, ereditano da `:root`: gli alias puntano a `var(...)` e quindi seguono il tema.)

Nel blocco `@theme inline` aggiungi, accanto ai `--color-*` esistenti:

```css
  --color-raised: var(--raised);
  --color-action-text: var(--action-text);
  --color-xp: var(--xp);
  --color-zone-1: var(--zone-1);
  --color-zone-2: var(--zone-2);
  --color-zone-3: var(--zone-3);
  --color-zone-4: var(--zone-4);
  --color-zone-5: var(--zone-5);
```

**Aggiornamento dopo la review (28/10):** valori del chiaro scuriti per i chip al 15% (sopra già aggiornati), `color-scheme` in entrambi i blocchi, token derivati (alias, `--sidebar-*`, `--azure: var(--primary)`) spostati in un blocco `:root, .dark`, test esteso (token dichiarati in entrambi i blocchi, `gold`, chip al 15%), `client/public/theme-init.js` per il tema prima del primo disegno.

**Step 4:** `pnpm vitest run client/src/styles/corsia-contrast.test.ts` → PASS (46 casi). Poi `pnpm check && pnpm test && pnpm build` → verdi.

**Step 5:** commit `feat(ui): Corsia design tokens with contrast test`.

### Task 2: Font Barlow Condensed e Manrope nel bundle

**Files:** `package.json`/`pnpm-lock.yaml`, `client/src/main.tsx`, `client/src/index.css` (`@theme inline`, `@layer base`).

1. `pnpm add @fontsource/manrope@5.3.0 @fontsource/barlow-condensed@5.3.0`.
2. Verifica i nomi dei file: `ls node_modules/@fontsource/manrope | grep latin-` (attesi `latin-400.css` … `latin-700.css`). Importa solo il sottoinsieme latin (copre l'italiano), in `client/src/main.tsx` prima di `import "./index.css"`:

```ts
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/barlow-condensed/latin-600.css";
import "@fontsource/barlow-condensed/latin-700.css";
```

3. In `@theme inline` sostituisci le due righe dei font:

```css
  --font-sans: "Manrope", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  --font-display: "Barlow Condensed", "Manrope", "Segoe UI", Arial, sans-serif;
```

4. In `@layer base`, regola `body`: `@apply bg-background text-foreground font-sans antialiased;` più `font-size: 15px; line-height: 1.5;`.
5. Verifica: `pnpm build` e poi `ls dist/public/assets | grep -E "manrope|barlow" | head` (file `.woff2` presenti); `pnpm build:native` e stesso controllo (i font devono restare nel bundle nativo: lo script di prune non tocca `assets/`). Rimetti la build web con `pnpm build`.
6. Commit `feat(ui): bundle Manrope and Barlow Condensed (Corsia typography)`.

### Task 3: Classi condivise piatte (`index.css`)

**Files:** `client/src/index.css` (sezioni da riga ~238 a fine file).

Ridefinisci (stesso nome, nuovo corpo) senza toccare i componenti:
- `.surface-panel`: `position: relative; border-radius: 16px; border: 1px solid var(--border); background: var(--card); transition: border-color 150ms ease;`. Elimina la regola `.surface-panel::before` e il `@media (max-width: 767px)` che cambia il raggio. Mantieni `.surface-panel>* { position: relative; }` senza `z-index`.
- `.dashboard-shell .surface-panel, .compact-shell .surface-panel`: solo `border-color: var(--border); background: var(--card);` (via ombre, blur e rim neon); elimina le loro regole `::before`.
- `.dashboard-shell .stream-card:hover, .compact-shell .stream-card:hover`: `border-color: color-mix(in oklch, var(--action-text) 45%, var(--border));`.
- `.neon-gradient-text`: `color: inherit;` (nessun background, clip o text-shadow).
- `.sf-wordmark`: `font-family: var(--font-display); font-weight: 700; letter-spacing: 0;` (via `text-transform`).
- `.sf-brand-anchor`, `.sf-social-card`, `.sf-activity-card`, `.glass-panel`, `.ei-border-gradient`, `.bento-surface`: `border: 1px solid var(--border); background: var(--card); box-shadow: none;` (+ `border-radius: 16px` dove c'era), niente `backdrop-filter`. Gli hover con glow diventano solo `border-color` come sopra.
- `.sf-activity-badge`: chip XP: `display:inline-flex; align-items:center; gap:.35rem; height:28px; padding:0 .75rem; border-radius:999px; background: color-mix(in oklch, var(--xp) 15%, transparent); color: var(--xp); font-size: .75rem; font-weight: 600;` (via bordo, maiuscolo, tracking).
- `.neon-outline`: `box-shadow: 0 0 0 1px var(--border);`.
- `.ei-bg-grid`, `.ei-blob`, `.ei-blob-lime`, `.ei-blob-coral`, `.orb-lane` (entrambe le definizioni): `display: none;`.
- `.shimmer-bg`: lascia l'animazione ma usa `var(--raised)`/`var(--card)` al posto di colori neon (leggi la definizione e sostituisci i colori).
- `.landing-*`, `.stream-*`, `.badge-*`: sostituisci solo eventuali riferimenti a `--electric-*`/glow con i token Corsia; nessun cambio di layout.

Verifica: `pnpm build`; `grep -n "electric-\|neon-glow\|neon-soft\|backdrop-filter" client/src/index.css` deve mostrare solo il blocco alias del Task 1. Commit `feat(ui): flatten shared surfaces to Corsia cards`.

### Task 4: Primitivi shadcn (`button`, `badge`, `tabs`, `input`, `progress`)

**Files:** `client/src/components/ui/{button,badge,tabs,input,progress}.tsx`; Create `client/src/components/ui/variants.test.ts`.

**Step 1: test che fallisce** (`client/src/components/ui/variants.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { buttonVariants } from "./button";
import { badgeVariants } from "./badge";

const BANNED = [/shadow-\[0_0/, /\buppercase\b/, /tracking-widest/, /linear-gradient/, /neon-(?:glow|soft)/, /-translate-y-/];

const buttonVariantNames = ["default", "neon", "outline-neon", "ghost-neon", "destructive", "outline", "secondary", "ghost", "link"] as const;
const badgeVariantNames = ["default", "secondary", "destructive", "outline", "neon", "rank-gold", "rank-silver", "rank-bronze"] as const;

describe("Corsia variants", () => {
  it.each(buttonVariantNames)("button %s è piatto", (variant) => {
    const classes = buttonVariants({ variant });
    for (const pattern of BANNED) expect(classes).not.toMatch(pattern);
  });
  it("i bottoni hanno almeno 44px di altezza di default", () => {
    expect(buttonVariants({})).toMatch(/\bh-11\b/);
  });
  it.each(badgeVariantNames)("badge %s è piatto", (variant) => {
    const classes = badgeVariants({ variant });
    for (const pattern of BANNED) expect(classes).not.toMatch(pattern);
    expect(classes).not.toMatch(/text-\[0\.6\d*rem\]/);
  });
});
```

Se `badgeVariants` non è esportato, esportalo da `badge.tsx` (`export { Badge, badgeVariants }`).

**Step 2:** `pnpm vitest run client/src/components/ui/variants.test.ts` → FAIL.

**Step 3: implementazione.**
- `button.tsx`, base: `"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 aria-invalid:border-destructive"`. Varianti:
  - `default` e `neon`: `"bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80"`
  - `outline` e `outline-neon`: `"border border-border bg-transparent text-foreground hover:bg-raised"`
  - `ghost`: `"text-foreground hover:bg-raised"`; `ghost-neon`: `"text-action-text hover:bg-raised"`
  - `secondary`: `"bg-secondary text-secondary-foreground hover:bg-secondary/80"`
  - `destructive`: `"bg-destructive text-destructive-foreground hover:bg-destructive/90"`
  - `link`: `"text-action-text underline-offset-4 hover:underline"`
  - size: `default: "h-11 px-4 has-[>svg]:px-3"`, `sm: "h-10 rounded-lg gap-1.5 px-3 has-[>svg]:px-2.5"`, `lg: "h-12 rounded-xl px-6 text-base has-[>svg]:px-4"`, icone invariate.
- `badge.tsx`: base `rounded-full px-2.5 py-0.5 text-xs font-semibold`; `neon`: `"border-transparent bg-primary/15 text-action-text"`; `rank-gold`: `"border-transparent bg-[var(--gold)]/15 text-[var(--gold)]"`; `rank-silver`: `"border-transparent bg-raised text-foreground"`; `rank-bronze`: `"border-transparent bg-xp/15 text-xp"`; `outline`: `"border-border text-foreground"`.
- `tabs.tsx`: `TabsList` → `"inline-flex min-h-11 w-full sm:w-fit items-center justify-start rounded-xl border border-border bg-card p-1 overflow-x-auto text-muted-foreground"`; `TabsTrigger` → togli gradiente, glow e `hover:-translate-y-0.5`; stato attivo `"data-[state=active]:bg-foreground data-[state=active]:text-background"`, inattivo `"text-muted-foreground hover:text-foreground"`, `text-sm font-semibold rounded-lg px-3 py-1.5 min-h-9`.
- `input.tsx`: rimuovi `focus-visible:shadow-[0_0_18px_var(--neon-soft)]`.
- `progress.tsx`: rimuovi `shadow-[0_0_12px_var(--neon-soft)]`.

**Step 4:** test → PASS; `pnpm check && pnpm test` verdi. **Step 5:** commit `feat(ui): flat Corsia variants for button, badge, tabs, input, progress`.

### Task 5: Formatter italiani e riepilogo settimana

**Files:** Modify `client/src/lib/format.ts`; Create `client/src/lib/format.test.ts`, `client/src/lib/week-summary.ts`, `client/src/lib/week-summary.test.ts`.

**Step 1: test** (`format.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { formatDayMonth, formatDistance, formatDurationParts, formatKm, formatPaceValue, formatSessionDate, formatWeekdayDayMonth, paceSecondsPer100m } from "./format";

const monday = new Date(2026, 9, 26, 10, 47); // lun 26 ott 2026, ora locale

describe("formatter Corsia", () => {
  it("data sessione", () => expect(formatSessionDate(monday)).toBe("lun 26 ott · 10:47"));
  it("giorno e mese", () => expect(formatDayMonth(monday)).toBe("26 ott"));
  it("giorno della settimana, giorno e mese", () => expect(formatWeekdayDayMonth(monday)).toBe("lun 26 ott"));
  it("accetta stringhe ISO", () => expect(formatDayMonth(monday.toISOString())).toBe("26 ott"));
  it("km con virgola", () => {
    expect(formatKm(3200)).toBe("3,2");
    expect(formatKm(12_700)).toBe("12,7");
    expect(formatKm(0)).toBe("0");
  });
  it("distanza con virgola", () => {
    expect(formatDistance(3200)).toBe("3,2 km");
    expect(formatDistance(800)).toBe("800 m");
  });
  it("durata in parti", () => {
    expect(formatDurationParts(3720)).toEqual({ value: "1:02", unit: "h" });
    expect(formatDurationParts(3000)).toEqual({ value: "50", unit: "min" });
    expect(formatDurationParts(0)).toBeNull();
  });
  it("passo", () => {
    expect(formatPaceValue(112)).toBe("1:52");
    expect(paceSecondsPer100m({ avgPacePer100m: 112, distanceMeters: 1000, durationSeconds: 1300 })).toBe(112);
    expect(paceSecondsPer100m({ avgPacePer100m: null, distanceMeters: 1000, durationSeconds: 1300 })).toBe(130);
    expect(paceSecondsPer100m({ distanceMeters: 0, durationSeconds: 100 })).toBeNull();
  });
});
```

`week-summary.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { startOfWeek, summarizeWeek } from "./week-summary";

const wednesday = new Date(2026, 9, 28, 18, 0);
const at = (day: number, hour = 8) => new Date(2026, 9, day, hour, 0).toISOString();

describe("riepilogo settimana", () => {
  it("la settimana parte lunedì alle 00:00", () => {
    expect(startOfWeek(wednesday)).toEqual(new Date(2026, 9, 26, 0, 0, 0, 0));
    expect(startOfWeek(new Date(2026, 10, 1, 9))).toEqual(new Date(2026, 9, 26)); // domenica 1 nov
  });
  it("somma solo le attività della settimana corrente", () => {
    const summary = summarizeWeek([
      { activityDate: at(25), distanceMeters: 5000, xpEarned: 300 }, // domenica precedente
      { activityDate: at(26), distanceMeters: 3200, xpEarned: 180 },
      { activityDate: at(28, 7), distanceMeters: 2400, xpEarned: 120 },
      { activityDate: at(28, 19), distanceMeters: 1000, xpEarned: null },
    ], wednesday);
    expect(summary.totalMeters).toBe(6600);
    expect(summary.sessions).toBe(3);
    expect(summary.xp).toBe(300);
    expect(summary.days.map((day) => day.label)).toEqual(["L", "M", "M", "G", "V", "S", "D"]);
    expect(summary.days.map((day) => day.meters)).toEqual([3200, 0, 3400, 0, 0, 0, 0]);
    expect(summary.days.findIndex((day) => day.isToday)).toBe(2);
  });
});
```

**Step 2:** `pnpm vitest run client/src/lib/format.test.ts client/src/lib/week-summary.test.ts` → FAIL.

**Step 3: implementazione.** In `format.ts` (lascia invariate `formatDuration`, `formatPace`, `formatTimeAgo`, `getInitials`; cambia `formatDistance` per usare `formatKm`):

```ts
type DateInput = string | Date;
const toDate = (value: DateInput) => (value instanceof Date ? value : new Date(value));
const weekdayFmt = new Intl.DateTimeFormat("it-IT", { weekday: "short" });
const dayMonthFmt = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" });
const kmFmt = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 });

/** «lun 26 ott · 10:47» */
export const formatSessionDate = (value: DateInput) => {
  const date = toDate(value);
  return `${weekdayFmt.format(date)} ${dayMonthFmt.format(date)} · ${timeFmt.format(date)}`;
};
/** «26 ott» */
export const formatDayMonth = (value: DateInput) => dayMonthFmt.format(toDate(value));
/** «lun 26 ott» */
export const formatWeekdayDayMonth = (value: DateInput) => {
  const date = toDate(value);
  return `${weekdayFmt.format(date)} ${dayMonthFmt.format(date)}`;
};
/** Kilometres with Italian decimal comma, no unit: 3200 → «3,2». */
export const formatKm = (meters: number) => kmFmt.format(Math.round(meters / 100) / 10);

export const formatDistance = (meters?: number | null) => {
  if (!meters) return "—";
  return meters >= 1000 ? `${formatKm(meters)} km` : `${Math.round(meters)} m`;
};

/** 3720 s → { value: "1:02", unit: "h" }; 3000 s → { value: "50", unit: "min" }; 0 → null. */
export const formatDurationParts = (seconds?: number | null): { value: string; unit: string } | null => {
  if (!seconds || seconds <= 0) return null;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return { value: String(minutes), unit: "min" };
  return { value: `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`, unit: "h" };
};

/** Seconds per 100 m → «1:52». */
export const formatPaceValue = (secondsPer100m: number) => {
  const total = Math.round(secondsPer100m);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/** Stored pace when present, otherwise duration / (distance / 100); null without distance. */
export const paceSecondsPer100m = (activity: { avgPacePer100m?: number | null; distanceMeters?: number | null; durationSeconds?: number | null }) => {
  if (activity.avgPacePer100m && activity.avgPacePer100m > 0) return activity.avgPacePer100m;
  if (!activity.distanceMeters || activity.distanceMeters <= 0 || !activity.durationSeconds) return null;
  return activity.durationSeconds / (activity.distanceMeters / 100);
};
```

`week-summary.ts`:

```ts
export type WeekActivity = { activityDate: string | Date; distanceMeters: number; xpEarned?: number | null };
export type WeekDay = { label: string; meters: number; isToday: boolean };
export type WeekSummary = { totalMeters: number; sessions: number; xp: number; days: WeekDay[] };

const LABELS = ["L", "M", "M", "G", "V", "S", "D"];

/** Monday 00:00 local time of the week containing `now`. */
export function startOfWeek(now: Date): Date {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const offset = (start.getDay() + 6) % 7; // Monday = 0
  start.setDate(start.getDate() - offset);
  return start;
}

export function summarizeWeek(activities: readonly WeekActivity[], now: Date): WeekSummary {
  const start = startOfWeek(now);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const todayIndex = (now.getDay() + 6) % 7;
  const days: WeekDay[] = LABELS.map((label, index) => ({ label, meters: 0, isToday: index === todayIndex }));
  let sessions = 0;
  let xp = 0;
  for (const activity of activities) {
    const date = activity.activityDate instanceof Date ? activity.activityDate : new Date(activity.activityDate);
    if (date < start || date >= end) continue;
    const index = (date.getDay() + 6) % 7; // exact in local time, also across DST changes
    days[index].meters += activity.distanceMeters;
    sessions += 1;
    xp += activity.xpEarned ?? 0;
  }
  return { totalMeters: days.reduce((sum, day) => sum + day.meters, 0), sessions, xp, days };
}
```

**Step 4:** test → PASS; `pnpm test` intero verde (cerca con `grep -rn "formatDistance" client/src` eventuali test o snapshot che si aspettano il punto decimale e aggiornali). **Step 5:** commit `feat(client): Italian formatters and week summary`.

### Task 6: Modulo di navigazione

**Files:** Create `client/src/lib/navigation.ts`, `client/src/lib/navigation.test.ts`.

```ts
// navigation.ts
export type TabId = "today" | "feed" | "train" | "community";
export type HubId = "train" | "community";
export type SectionTab = { label: string; path: string; match: (path: string) => boolean; dataTour?: string };

export const TODAY_PATH = "/today";
export const FEED_PATH = "/home";

export const normalizePath = (location: string) => {
  const path = location.split("?")[0].split("#")[0] || "/";
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
};

const starts = (...prefixes: string[]) => (path: string) => prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

const isToday = starts(TODAY_PATH);
const isFeed = (path: string) => path === FEED_PATH || starts("/post", "/home/report", "/report/post")(path);
const isTrain = starts("/track", "/activities", "/goals", "/profile/performance", "/statistics", "/coach", "/session-iq");
const isCommunity = starts("/home/community", "/community", "/leaderboard", "/challenges", "/season");

export const NAV_TABS: ReadonlyArray<{ id: TabId; label: string; path: string; match: (path: string) => boolean; dataTour?: string }> = [
  { id: "today", label: "Oggi", path: TODAY_PATH, match: isToday },
  { id: "feed", label: "Feed", path: FEED_PATH, match: isFeed },
  { id: "train", label: "Allena", path: "/track", match: isTrain, dataTour: "track-section" },
  { id: "community", label: "Community", path: "/home/community", match: isCommunity, dataTour: "club-directory" },
];

export const HUB_TABS: Record<HubId, readonly SectionTab[]> = {
  train: [
    { label: "Attività", path: "/track", match: (path) => path === "/track" || path === "/activities" },
    { label: "Obiettivi", path: "/goals", match: starts("/goals") },
    { label: "Statistiche", path: "/profile/performance", match: starts("/profile/performance", "/statistics") },
    { label: "Coach AI", path: "/coach", match: starts("/coach"), dataTour: "ai-coach-btn" },
  ],
  community: [
    { label: "Club", path: "/home/community", match: (path) => path === "/home/community" || path === "/community" },
    { label: "Classifiche", path: "/leaderboard", match: starts("/leaderboard") },
    { label: "Sfide", path: "/challenges", match: (path) => path === "/challenges", dataTour: "challenges-list" },
  ],
};

export function activeTabForPath(location: string): TabId | null {
  const path = normalizePath(location);
  return NAV_TABS.find((tab) => tab.match(path))?.id ?? null;
}

/** The hub whose sub-tabs are shown on this page (hub root pages only, not detail pages). */
export function hubForPath(location: string): HubId | null {
  const path = normalizePath(location);
  for (const hub of Object.keys(HUB_TABS) as HubId[]) {
    if (HUB_TABS[hub].some((tab) => tab.match(path))) return hub;
  }
  return null;
}

const TITLES: Array<[(path: string) => boolean, string]> = [
  [isToday, "Oggi"],
  [(path) => path === FEED_PATH, "Feed"],
  [starts("/post"), "Post"],
  [starts("/track", "/activities"), "Allena"],
  [(path) => hubForPath(path) === "train", "Allena"],
  [(path) => /^\/challenges\/[^/]+$/.test(path), "Sfida"],
  [(path) => hubForPath(path) === "community", "Community"],
  [(path) => /^\/community\/club\/[^/]+\/event\//.test(path), "Evento"],
  [(path) => /^\/community\/club\/[^/]+\/meet\//.test(path), "Gara"],
  [(path) => /^\/community\/club\/[^/]+\/documents/.test(path), "Documenti"],
  [starts("/community/club", "/community/invite"), "Club"],
  [starts("/badges"), "Badge"],
  [starts("/profile", "/u"), "Profilo"],
  [starts("/settings"), "Impostazioni"],
  [starts("/messages"), "Messaggi"],
  [starts("/admin"), "Moderazione"],
];

export function pageTitleForPath(location: string): string {
  const path = normalizePath(location);
  return TITLES.find(([match]) => match(path))?.[1] ?? "SwimForge";
}

/** Where a back button goes when there is no in-app history; null on tab roots. */
export function parentPathForPath(location: string): string | null {
  const path = normalizePath(location);
  if (/^\/track\/[^/]+$/.test(path)) return "/track";
  if (/^\/post\/[^/]+$/.test(path)) return FEED_PATH;
  if (/^\/challenges\/[^/]+$/.test(path)) return "/challenges";
  if (/^\/community\/club\/[^/]+\/.+/.test(path)) return path.split("/").slice(0, 4).join("/");
  if (/^\/community\/(?:club|invite)\/[^/]+$/.test(path)) return "/home/community";
  if (/^\/u\/[^/]+$/.test(path) || path === "/badges" || path === "/settings") return "/profile";
  return null;
}

export const homePathForPlatform = (isNative: boolean) => (isNative ? TODAY_PATH : FEED_PATH);
```

Test (`navigation.test.ts`), almeno:
- `normalizePath("/track/?x=1#a") === "/track"`, `normalizePath("/") === "/"`.
- `activeTabForPath`: `/today`→today; `/home`, `/post/9`→feed; `/track`, `/track/4`, `/goals`, `/profile/performance`, `/coach`→train; `/home/community`, `/community/club/3`, `/leaderboard`, `/challenges/2`→community; `/profile`, `/messages`, `/settings`, `/badges`→null.
- `hubForPath`: `/track`, `/goals`, `/coach`→train; `/track/4`→null; `/home/community`, `/leaderboard`, `/challenges`→community; `/challenges/2`, `/community/club/3`→null.
- `pageTitleForPath`: `/today` «Oggi», `/home` «Feed», `/track` «Allena», `/track/4` «Allena», `/home/community` «Community», `/challenges/2` «Sfida», `/community/club/3/event/5` «Evento», `/community/club/3` «Club», `/profile` «Profilo», `/settings` «Impostazioni», `/messages` «Messaggi», `/admin/reports` «Moderazione».
- `parentPathForPath`: `/track/4`→`/track`; `/post/9`→`/home`; `/challenges/2`→`/challenges`; `/community/club/3/workouts`→`/community/club/3`; `/community/club/3`→`/home/community`; `/u/8`→`/profile`; `/home`, `/today`, `/track`, `/messages`→null.
- `homePathForPlatform(true) === "/today"`, `(false) === "/home"`.

Commit `feat(client): navigation model for the five-tab shell`.

### Task 7: Primitivi Corsia

**Files:** Create `client/src/components/corsia/{Metric,Chip,SectionTabs,LevelCard,WeekBars,ActivityCard}.tsx`, `client/src/components/corsia/corsia.test.tsx`.

Codice (completo):

```tsx
// Metric.tsx
import { cn } from "@/lib/utils";

type MetricTone = "default" | "action" | "xp";
const TONE: Record<MetricTone, string> = { default: "text-foreground", action: "text-action-text", xp: "text-xp" };
const SIZE = { md: "text-[28px]", lg: "text-[36px]", xl: "text-[56px]" } as const;

export type MetricProps = {
  value: string;
  unit?: string;
  label: string;
  tone?: MetricTone;
  size?: keyof typeof SIZE;
  className?: string;
};

/** Corsia metric: big Barlow number, small grey unit, 12px label. */
export function Metric({ value, unit, label, tone = "default", size = "md", className }: MetricProps) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className={cn("font-display font-bold leading-none tabular-nums", SIZE[size], TONE[tone])}>
        {value}
        {unit ? <span className="ml-1 text-[0.5em] font-semibold text-muted-foreground">{unit}</span> : null}
      </p>
      <p className="mt-1.5 truncate text-xs font-medium text-muted-foreground">{label}</p>
    </div>
  );
}
```

```tsx
// Chip.tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type ChipTone = "neutral" | "action" | "xp" | "success";
const TONE: Record<ChipTone, string> = {
  neutral: "bg-raised text-foreground",
  action: "bg-primary/15 text-action-text",
  xp: "bg-xp/15 text-xp",
  success: "bg-success/15 text-success",
};

export function Chip({ tone = "neutral", className, children }: { tone?: ChipTone; className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 text-xs font-semibold", TONE[tone], className)}>
      {children}
    </span>
  );
}
```

```tsx
// SectionTabs.tsx
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { normalizePath, type SectionTab } from "@/lib/navigation";

/** Sub-sections of a hub (Allena, Community): links with an underline on the active one. */
export function SectionTabs({ tabs, ariaLabel }: { tabs: readonly SectionTab[]; ariaLabel: string }) {
  const [location] = useLocation();
  const path = normalizePath(location);
  return (
    <nav aria-label={ariaLabel} className="-mx-4 mb-4 overflow-x-auto border-b border-border px-4 md:mx-0 md:px-0">
      <ul className="flex min-w-max gap-6">
        {tabs.map((tab) => {
          const active = tab.match(path);
          return (
            <li key={tab.path}>
              <Link
                href={tab.path}
                aria-current={active ? "page" : undefined}
                data-tour={tab.dataTour}
                className={cn(
                  "relative inline-flex h-12 items-center text-[15px] font-semibold transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
                {active ? <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] rounded-full bg-primary" /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

```tsx
// LevelCard.tsx
import { Link } from "wouter";
import { cn } from "@/lib/utils";

export type LevelCardProps = { level: number; totalXp: number; nextLevelXp: number | null; xpToNextLevel: number };

const nf = new Intl.NumberFormat("it-IT");
const progressPercent = (totalXp: number, nextLevelXp: number | null) =>
  nextLevelXp && nextLevelXp > 0 ? Math.max(0, Math.min(100, (totalXp / nextLevelXp) * 100)) : 100;

function Bar({ percent, className }: { percent: number; className?: string }) {
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-raised", className)} role="progressbar" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-xp" style={{ width: `${percent}%` }} />
    </div>
  );
}

/** Profile level card (Corsia «Season» board without season and missions). */
export function LevelCard({ level, totalXp, nextLevelXp, xpToNextLevel }: LevelCardProps) {
  return (
    <section className="surface-panel p-5" aria-label="Livello">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Livello</p>
          <p className="font-display text-[64px] font-bold leading-none tabular-nums">{level}</p>
        </div>
        {nextLevelXp ? (
          <div className="text-right">
            <p className="font-display text-[34px] font-bold leading-none text-xp tabular-nums">{nf.format(xpToNextLevel)} XP</p>
            <p className="mt-1 text-sm text-muted-foreground">al livello {level + 1}</p>
          </div>
        ) : null}
      </div>
      <Bar percent={progressPercent(totalXp, nextLevelXp)} className="mt-5" />
      <p className="mt-3 text-sm text-muted-foreground">{nf.format(totalXp)} XP totali</p>
    </section>
  );
}

/** One-line level strip for the Today screen; links to the profile. */
export function LevelStrip({ level, totalXp, nextLevelXp, xpToNextLevel }: LevelCardProps) {
  return (
    <Link href="/profile" className="surface-panel block p-4 hover:border-action-text/40">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-semibold">Livello {level}</p>
        {nextLevelXp ? (
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-xp">{nf.format(xpToNextLevel)} XP</span> al {level + 1}
          </p>
        ) : null}
      </div>
      <Bar percent={progressPercent(totalXp, nextLevelXp)} className="mt-3" />
    </Link>
  );
}
```

```tsx
// WeekBars.tsx
import { cn } from "@/lib/utils";
import type { WeekDay } from "@/lib/week-summary";

/** Seven bars Mon-Sun; today in the action colour. */
export function WeekBars({ days }: { days: readonly WeekDay[] }) {
  const max = Math.max(1, ...days.map((day) => day.meters));
  return (
    <div className="flex items-end gap-2" aria-hidden>
      {days.map((day, index) => (
        <div key={index} className="flex w-6 flex-col items-center gap-1.5">
          <div className="flex h-16 w-full items-end">
            <div
              className={cn("w-full rounded-md", day.isToday ? "bg-primary" : "bg-muted-foreground/30")}
              style={{ height: day.meters > 0 ? `${Math.max(12, (day.meters / max) * 100)}%` : "4px" }}
            />
          </div>
          <span className={cn("text-xs", day.isToday ? "font-semibold text-foreground" : "text-muted-foreground")}>{day.label}</span>
        </div>
      ))}
    </div>
  );
}
```

```tsx
// ActivityCard.tsx
import { Waves } from "lucide-react";
import { Link } from "wouter";
import { Chip } from "./Chip";
import { Metric } from "./Metric";
import { cn } from "@/lib/utils";
import { formatDurationParts, formatKm, formatPaceValue, formatSessionDate, paceSecondsPer100m } from "@/lib/format";

export type ActivityCardData = {
  id: number;
  activityName?: string | null;
  activityDate: string | Date;
  distanceMeters: number;
  durationSeconds: number;
  avgPacePer100m?: number | null;
  avgHeartRate?: number | null;
  xpEarned?: number | null;
  isOpenWater?: boolean | null;
  poolLengthMeters?: number | null;
};

/** Corsia activity card: icon tile, title, date, XP chip, up to four metrics. */
export function ActivityCard({ activity, href, onSelect, selected = false }: {
  activity: ActivityCardData;
  href?: string;
  onSelect?: () => void;
  selected?: boolean;
}) {
  const openWater = Boolean(activity.isOpenWater);
  const where = openWater ? "Acque libere" : `Vasca ${activity.poolLengthMeters ?? 25}m`;
  const duration = formatDurationParts(activity.durationSeconds);
  const pace = paceSecondsPer100m(activity);
  const body = (
    <>
      <div className="flex items-start gap-3">
        <span className={cn("inline-flex size-12 shrink-0 items-center justify-center rounded-xl", openWater ? "bg-success/15 text-success" : "bg-primary/15 text-action-text")}>
          <Waves className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-bold">{activity.activityName || "Nuotata"}</p>
          <p className="truncate text-sm text-muted-foreground">{formatSessionDate(activity.activityDate)} · {where}</p>
        </div>
        {activity.xpEarned ? <Chip tone="xp">+{activity.xpEarned}</Chip> : null}
      </div>
      <div className="mt-4 grid grid-cols-4 gap-3 border-t border-border pt-4">
        <Metric value={formatKm(activity.distanceMeters)} unit="km" label="Distanza" />
        {duration ? <Metric value={duration.value} unit={duration.unit} label="Durata" /> : null}
        {pace ? <Metric value={formatPaceValue(pace)} label="Passo /100" tone="action" /> : null}
        {activity.avgHeartRate ? <Metric value={String(Math.round(activity.avgHeartRate))} label="FC media" /> : null}
      </div>
    </>
  );
  const className = cn("surface-panel block w-full p-4 text-left transition-colors hover:border-action-text/40", selected && "border-action-text");
  if (onSelect) return <button type="button" onClick={onSelect} className={className} aria-pressed={selected}>{body}</button>;
  return <Link href={href ?? `/track/${activity.id}`} className={className}>{body}</Link>;
}
```

Anche `client/src/components/ui/surface.tsx`: togli `hover:-translate-y-px` e `transform` dalla transizione (niente movimento al passaggio del mouse; resta solo il cambio di colore del bordo).

Test `corsia.test.tsx` (Testing Library; per `SectionTabs` usa `import { Router } from "wouter"` e `import { memoryLocation } from "wouter/memory-location"` con `<Router hook={memoryLocation({ path: "/goals" }).hook}>`):
1. `Metric` mostra valore, unità ed etichetta.
2. `Chip tone="xp"` contiene il testo.
3. `SectionTabs` con `HUB_TABS.train` su `/goals`: «Obiettivi» ha `aria-current="page"`, «Attività» no.
4. `LevelCard` con `{ level: 12, totalXp: 8420, nextLevelXp: 9000, xpToNextLevel: 580 }` mostra «12», «580 XP», «al livello 13», «8.420 XP totali».
5. `ActivityCard` senza FC non mostra «FC media»; con `xpEarned: 180` mostra «+180»; link a `/track/7`.

Commit `feat(ui): Corsia primitives (metric, chip, section tabs, level card, week bars, activity card)`.

### Task 8: Test «design-lint» a cricchetto

**Files:** Create `client/src/styles/design-lint.test.ts`.

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Not new URL(.., import.meta.url): under vitest/jsdom Vite rewrites it into an asset URL.
const SRC = path.resolve(import.meta.dirname, "..");

function sourceFiles(dir = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    if (!/\.(tsx|ts|css)$/.test(name) || /\.test\.tsx?$/.test(name)) return [];
    return [path.relative(SRC, full).split(path.sep).join("/")];
  });
}

const RULES = {
  "testo-piccolo": /text-\[(?:[5-9]|10|11)px\]|text-\[0\.[5-6]\d*rem\]/,
  "alone-neon": /neon-glow|neon-soft|forge-glow|shadow-\[0_0_/,
  "maiuscolo-spaziato": /\buppercase\b[^"'`\n]*\btracking-(?:\[[^\]]+\]|wide|wider|widest)|\btracking-(?:\[[^\]]+\]|wide|wider|widest)[^"'`\n]*\buppercase\b/,
  "testo-gradiente": /neon-gradient-text|bg-clip-text/,
  "token-legacy": /electric-(?:cyan|lime|coral|violet)|forge-orange/,
  "variante-neon": /variant=["'](?:neon|outline-neon|ghost-neon)["']/,
  "testo-primario": /(?<![\w-])text-primary(?![\w-])/,
  "accento-lime": /(?<![\w-])(?:text|border|ring|from|to|via)-accent(?![\w-])/,
  "gradiente": /bg-gradient-to-|bg-(?:linear|radial|conic)-|(?:linear|radial|conic)-gradient\(/,
  "sfocatura": /backdrop-blur|backdrop-filter/,
} as const;
type Rule = keyof typeof RULES;

/** Files allowed to match a rule for good (justify each entry). */
const EXEMPT: Partial<Record<Rule, readonly string[]>> = {
  gradiente: ["index.css"], // skeleton shimmer animation
};

/**
 * Files still to clean, per rule. Ratchet: a file leaves the list in the task that cleans it
 * and can never come back; at the end of phase 2 every list is empty.
 */
const PENDING: Record<Rule, string[]> = {
  "testo-piccolo": [],
  "alone-neon": [],
  "maiuscolo-spaziato": [],
  "testo-gradiente": [],
  "token-legacy": [],
  "variante-neon": [],
  "testo-primario": [],
  "accento-lime": [],
  "gradiente": [],
  "sfocatura": [],
};

const contents = new Map(sourceFiles().map((file) => [file, readFileSync(path.join(SRC, file), "utf8")]));
const offenders = (rule: Rule) =>
  [...contents]
    .filter(([file, text]) => RULES[rule].test(text) && !EXEMPT[rule]?.includes(file))
    .map(([file]) => file)
    .sort();

describe("design-lint Corsia", () => {
  for (const rule of Object.keys(RULES) as Rule[]) {
    it(`${rule}: nessun file fuori elenco`, () => {
      expect(offenders(rule).filter((file) => !PENDING[rule].includes(file))).toEqual([]);
    });
    it(`${rule}: elenco aggiornato (togliere i file ripuliti)`, () => {
      const current = offenders(rule);
      expect(PENDING[rule].filter((file) => !current.includes(file))).toEqual([]);
    });
  }
});
```

1. Esegui `pnpm vitest run client/src/styles/design-lint.test.ts`: i test «nessun file fuori elenco» falliscono e stampano gli elenchi attuali.
2. Copia ogni elenco, ordinato, nel relativo `PENDING` (percorsi relativi a `client/src`, es. `"pages/Activities.tsx"`). `index.css` comparirà in `token-legacy` e `testo-gradiente` (alias e definizione): resta fino al Task 22.
3. Riesegui → PASS. `pnpm test` verde.
4. Robustezza del test di contrasto (`client/src/styles/corsia-contrast.test.ts`): `block()` deve scegliere il blocco del tema e non il blocco derivato `:root,\n.dark {`. Cerca tutte le righe `^<selettore> \{$`, scarta quelle precedute da una riga che finisce con `,`, e fallisci se ne resta più o meno di una.
5. Commit `test(ui): Corsia design-lint ratchet`.

Da qui in poi **ogni task di schermata o pulizia toglie da `PENDING` i file che ripulisce** (e il test lo impone).

---

## Gruppo 2 — Shell e navigazione

### Task 9: Shell Corsia (`app-shell.tsx`)

**Files:** Modify `client/src/components/app/app-shell.tsx`; Create `client/src/components/app/app-shell.test.tsx`.

Riscrittura della parte di navigazione; **invariati**: heartbeat, listener `swimforge:open-create-post`, `handleLogout` (ordine: `unregisterPushToken` → logout → `clearNativeSessionToken` → `supabase.auth.signOut`), `CreatePostSheet`, `OnboardingNudgeManager`, transizione di pagina (togli solo il `filter: blur(...)`).
1. Elimina `quickAccessItems`, `athleteTopNav`, `AthleteDesktopNav`, `athleteTitleForPath`, `adminTitleForPath`, gli helper `is*Path` locali, `mobileSectionsOpen` e il foglio «Sezioni». Usa `NAV_TABS`, `activeTabForPath`, `hubForPath`, `HUB_TABS`, `pageTitleForPath`, `parentPathForPath` da `@/lib/navigation`.
2. **Header** (`fixed top-0 z-50 h-16 border-b border-border bg-background`, niente blur): a sinistra, se `parentPathForPath(path)` non è null, un pulsante indietro (`ChevronLeft`, `aria-label="Indietro"`: `history.length > 1 ? history.back() : navigate(parent)`); poi il titolo: su `/home` il marchio (icona `Droplet` in `text-action-text` + «SwimForge» in `font-display text-[26px] font-bold`), altrove `pageTitleForPath(path)` in `font-display text-[26px] font-bold`. A destra `NotificationBell`, `DirectMessages mode="link"`, avatar con menu: «Profilo» (`/profile`, `data-tour="profile-stats"` resta nella pagina profilo), «Impostazioni», «Moderazione» (solo admin), separatore, «Esci» (`isLoggingOut ? "Uscita…" : "Esci"`). Togli la voce tema dal menu (va nel profilo, Task 15). Su desktop il nome accanto all'avatar resta.
3. **Barra in basso** (`lg:hidden`, `fixed bottom-0 z-50 border-t border-border bg-background`, `data-tour="main-navigation"`): griglia di 5 colonne `h-16`: Oggi (`Sun`), Feed (`Newspaper`), «+» al centro (pulsante `size-12 rounded-2xl bg-primary text-primary-foreground`, `aria-label="Crea"`, `data-tour="create-post"`), Allena (`Waves`, `data-tour="track-section"`), Community (`Users`, `data-tour="club-directory"`). Voce attiva: icona e testo `text-action-text`, `aria-current="page"`; inattiva `text-muted-foreground`. Etichette `text-xs font-semibold`.
4. **Foglio «Crea»** (stessa animazione di oggi, superficie `bg-card border-border rounded-2xl`): «Nuovo post» (apre `CreatePostSheet`), «Messaggio» (`/messages?new=1`), «Bozza IA del post» (stesso testo precompilato di oggi), «Sincronizza Garmin» (`trpc.garmin.sync.useMutation`, `daysBack: 7`; prima controlla `trpc.garmin.status` → se non collegato naviga a `/settings?tab=connections`; toast come in `Settings.tsx:257-273`, poi `utils.activities.list.invalidate()` e `utils.profile.get.invalidate()`).
5. **Barra laterale desktop** (`hidden lg:flex fixed inset-y-0 left-0 w-[232px] border-r border-border bg-background pt-20`): le quattro voci di `NAV_TABS` più il pulsante «Crea» pieno azione che apre lo stesso menu; voce attiva `bg-raised text-foreground`; niente espansione al passaggio del mouse. `main` passa a `lg:pl-[232px]`.
6. **Sotto-schede:** in `main`, prima di `children`, `const hub = hubForPath(path)` e, se presente, `<SectionTabs tabs={HUB_TABS[hub]} ariaLabel={hub === "train" ? "Sezioni di Allena" : "Sezioni di Community"} />`. Elimina la riga del titolo piccolo in maiuscolo sopra il contenuto.
7. `main`: `pt-20 pb-24 lg:pb-8`, contenitore `mx-auto max-w-[1100px] px-4 md:px-6`.
8. Rimuovi import inutilizzati (lint) e la dipendenza da `useTheme` se non serve più.

Test `app-shell.test.tsx` (mock di `@/lib/trpc`, `@/lib/supabase`, `@/lib/push`, `@/components/NotificationBell`, `@/components/DirectMessages`, `@/components/social/CreatePostSheet`, `@/components/onboarding/OnboardingNudgeManager` come nei test esistenti; `Router` con `memoryLocation`):
- su `/goals`: la barra mostra «Oggi», «Feed», «Allena», «Community»; «Allena» ha `aria-current="page"`; le sotto-schede mostrano «Obiettivi» attivo.
- su `/track/4`: nessuna sotto-scheda, c'è il pulsante «Indietro».
- il pulsante «Crea» apre il foglio con le quattro azioni.
- nessun testo «Sezioni», «Training», «Sign out».

Commit `feat(ui): five-tab Corsia shell with hub sub-tabs`.

### Task 10: Rotte, home per piattaforma, tema nativo, tour

**Files:** `client/src/App.tsx`, `client/src/pages/Today.tsx` (segnaposto, completato nel Task 11), `client/src/lib/auth-sync.ts` (+ test), `client/src/pages/Home.tsx`, `client/src/lib/native-runtime.ts` (+ test), `client/src/contexts/ThemeContext.tsx`, `client/src/components/onboarding/OnboardingFlow.tsx`, `client/index.html` (solo `<title>`).

1. `App.tsx`: `const Today = lazy(() => import("./pages/Today"))` e `<Route path="/today" component={Today} />` prima di `/home`.
2. `auth-sync.ts`: `HOME_PATH` non più costante fissa: `postLoginPath(isNewUser)` restituisce `ONBOARDING_PATH` oppure `homePathForPlatform(isNativePlatform())`. Aggiorna/aggiungi i test (mock di `./platform`): web → `/home`, nativo → `/today`, nuovo utente → onboarding.
3. `Home.tsx` (landing `/`): se autenticato → `window.location.href = homePathForPlatform(isNativePlatform())`; se **nativo e non autenticato** → `/login` (la landing pubblica resta solo sul web).
4. `native-runtime.ts`: `shouldExitOnBack` esce su `TODAY_PATH` (non più `/home`); aggiorna i test (`/today` esce, `/home` con history torna indietro). Aggiungi ed esporta:

```ts
export const NATIVE_THEME_COLORS = { dark: "#0A1520", light: "#F4F7F9" } as const;

/** Status bar follows the app theme. No-op on the web. */
export function syncNativeStatusBar(theme: "dark" | "light"): void {
  if (!isNativePlatform()) return;
  StatusBar.setStyle({ style: theme === "dark" ? Style.Dark : Style.Light }).catch(() => {});
  StatusBar.setBackgroundColor({ color: NATIVE_THEME_COLORS[theme] }).catch(() => {});
}
```
   e togli le due chiamate `StatusBar.*` da `initNativeRuntime` (le fa il tema).
5. `ThemeContext.tsx`: nell'effetto che applica la classe chiama `syncNativeStatusBar(theme)`; esponi anche `setTheme(theme)` nel contesto (serve al selettore «Aspetto» del Task 15), mantenendo `toggleTheme`.
6. `OnboardingFlow.tsx`: aggiorna i testi dei passi: navigazione «Cinque voci: Oggi, Feed, il tasto +, Allena e Community.»; `track-section` «Allena raccoglie attività, obiettivi, statistiche e Coach AI.»; `challenges-list` «Le sfide sono in Community, accanto ai club e alle classifiche.»; `badges-nav` «I badge sono nel tuo profilo.» (sposta `data-tour="badges-nav"` sull'anteprima badge del profilo nel Task 15).
7. `client/index.html`: `<title>SwimForge</title>`. **Nessun** `viewport-fit=cover`: Capacitor 8 (SystemBars, `insetsHandling: "css"` di default) mantiene la WebView dentro le barre di sistema, come oggi.
8. `Today.tsx` segnaposto: `AppLayout` con un paragrafo «Oggi» (il Task 11 lo sostituisce).

Verifica: `pnpm check && pnpm test && pnpm build && pnpm build:native`. Commit `feat(client): Today route, platform home, theme-aware status bar`.

---

## Gruppo 3 — Schermate chiave

### Task 11: Schermata Oggi

**Files:** `client/src/pages/Today.tsx`, Create `client/src/pages/Today.ui.test.tsx`.

Dati (tutti già esistenti):
- `trpc.activities.list.useQuery({ limit: 50, offset: 0, source: "all" })` → `summarizeWeek(data ?? [], new Date())` e ultima attività = prima per `activityDate` decrescente.
- `trpc.profile.get.useQuery(undefined, { staleTime: 120_000 })` → `level`, `totalXp`, `nextLevelXp`, `xpToNextLevel`.
- `trpc.garmin.status.useQuery(undefined, { staleTime: 300_000 })` → `connected`.
- `trpc.activityInsights.list.useQuery({ limit: 1, offset: 0 })` → righe SQL grezze (`activity_id`, `summary`): mostra `summary` solo se `activity_id === ultimaAttività.id`, troncato a 2 righe (`line-clamp-2`).
- Sincronizza: stessa mutazione e stessi toast del foglio «Crea» (Task 9). Estrai un hook condiviso `client/src/hooks/useGarminQuickSync.ts` (`{ sync, isPending, connected }`) e usalo in entrambi i posti.

Struttura (dall'alto), dentro `AppLayout`:
1. Sottotitolo `formatWeekdayDayMonth(new Date())` in `text-sm text-muted-foreground` (il titolo «Oggi» è nell'header).
2. Card «Questa settimana» (`surface-panel p-5`, come la card in testa a `renders/Attivita.png`): a sinistra `Metric size="xl" value={formatKm(totalMeters)} unit="km" label=…` con sotto «{sessions} nuotate» e, se `xp > 0`, «+{xp} XP» in `text-xp`; a destra `WeekBars`.
3. «Ultima nuotata»: titolo sezione `text-[17px] font-bold`, poi `ActivityCard` e, se c'è, il riassunto del coach in una riga sotto (`text-sm text-muted-foreground`, icona `Sparkles` in `text-action-text`).
4. `LevelStrip`.
5. Azioni rapide, griglia 2×2 di pulsanti `surface-panel h-20` con icona e testo: «Sincronizza Garmin» (se `connected === false` diventa «Collega Garmin» → `/settings?tab=connections`), «Nuovo post» (`window.dispatchEvent(new CustomEvent("swimforge:open-create-post"))`), «Coach AI» (`/coach`), «Obiettivi» (`/goals`).
- Caricamento: `Skeleton` per settimana e ultima nuotata. Nessuna attività: card «Ancora nessuna nuotata» con il pulsante di sincronizzazione o di collegamento Garmin. Errore query: testo «Non riesco a caricare i dati» e pulsante «Riprova» (`refetch`).

Test `Today.ui.test.tsx` (mock tRPC come `Activities.ui.test.tsx`, `AppLayout` sostituito da un div, `vi.useFakeTimers({ now: new Date(2026, 9, 28, 18) })` o `vi.setSystemTime`):
- con due attività della settimana (3200 m lun, 2400 m mer) mostra «5,6» e «2 nuotate»;
- mostra la card dell'ultima nuotata con il nome dell'attività del mercoledì;
- mostra «Livello 12» e «580 XP»;
- con `garmin.status` `{ connected: false }` mostra «Collega Garmin»;
- senza attività mostra «Ancora nessuna nuotata».

Commit `feat(client): Today screen (week, last swim, level, quick actions)`.

### Task 12: Feed

**Files:** `client/src/pages/SocialFeed.tsx`, `client/src/components/social/{FeedPost,FeedPostHeader,FeedPostMetrics,FeedPostActions,FeedPostComments,FeedSubTabs,FeedSkeleton,FollowStarterCard,FeedSidebar,ShareActivityPicker,UploadStatusPill,ForwardContentDialog,CreatePostSheet}.tsx`.

Riferimento: `renders/Feed.png` (senza la riga delle storie, già rimossa in fase 0).
- `FeedSubTabs`: sotto-schede Per te · Seguiti · Club con lo stesso stile di `SectionTabs` (sottolineatura azione), mantenendo le API e il testo usati dal test (`tab-seguiti-perte` è un testo del mock: non cambia).
- `FeedPostHeader`: avatar 44px, nome `font-semibold`, sotto «{club o fonte} · {formatTimeAgo}» in `text-sm text-muted-foreground`; menu «…» invariato.
- `FeedPostMetrics`: riscritto con `Metric` (distanza, passo in tono azione, durata; FC e SWOLF solo se presenti, massimo 4), dentro `rounded-2xl border border-border bg-card p-4`; via `colorMap` e glow. Il record personale come `Chip tone="success"`.
- `FeedPostActions`: reazione con cuore pieno `text-xp` quando attiva, conteggi `text-sm`, condividi a destra.
- `FeedPost`: separatore tra post `border-b border-border`, niente card con ombra attorno al post; media a tutta larghezza con `rounded-xl`, nessun testo sovrapposto.
- Stati vuoti e scheletri con le superfici Corsia; testi invariati (il test cerca «Condividi la prima sessione» e «Segui altri nuotatori»).
- Togli i file ripuliti da `PENDING`. `pnpm test` verde (in particolare `SocialFeed.mobile.test.tsx` e `CreatePostSheet.mobile.test.tsx`).

Commit `feat(ui): Corsia feed`.

### Task 13: Allena · Attività (lista)

**Files:** `client/src/pages/Activities.tsx`, `client/src/pages/Activities.ui.test.tsx` (solo se servono mock nuovi).

Riferimento: `renders/Attivita.png`.
- In testa la card «Questa settimana» (stessa del Task 11: estrai `client/src/components/corsia/WeekCard.tsx` e usala in entrambe le schermate).
- Filtro: `Tabs` con «Tutte», «Vasca», «Acque libere» (non più «Open Water») e il `Select` ordinamento con `aria-label="Ordina"`.
- Lista: `ActivityCard` al posto del bottone con foto di sfondo, `MiniMetricRing` e `MetricOrb` (eliminali dal file se non più usati). Sotto `xl` (1280px) il tocco apre `/track/:id` (`href`); da `xl` in su resta la selezione con il pannello a destra (`onSelect` + `selected`). Usa `useMediaQuery`/`matchMedia` con guardia per jsdom (se `window.matchMedia` non esiste, considera desktop così il test esistente resta valido) oppure rendi entrambe le varianti con classi `xl:hidden`/`hidden xl:block`.
- Pannello di dettaglio (xl): titolo `font-display text-3xl`, data con `formatSessionDate`, chip «Vasca»/«Acque libere», interruttore «Condividi nel feed» (il test lo cerca con questo nome), griglia di `Metric`, pulsante «Dettaglio vasche» (`variant="outline"`).
- Rimuovi la testata con livello/XP in cima (il livello è nel profilo e su Oggi) e ogni frase da desktop.
- Togli da `PENDING`. Commit `feat(ui): Corsia activity list`.

### Task 14: Allena · dettaglio attività

**Files:** `client/src/pages/ActivityDetail.tsx` (1.442 righe) e i componenti che importa solo lui (verifica con `grep -rn "from \"@/components/.*\"" client/src/pages/ActivityDetail.tsx`).

Riferimento: `renders/Sessione.png`.
- Testata: «{formatSessionDate} · {Vasca 25m | Acque libere} · {Garmin|Strava|Manuale}» in `text-sm text-muted-foreground`, titolo `font-display text-[40px] font-bold`, chip XP e record.
- Griglia 2×3 di `Metric` in una sola card con divisori (`grid grid-cols-3 divide-x divide-y divide-border` o bordi equivalenti): Distanza, Durata, Passo medio (azione), FC media, FC massima, Calorie (solo quelle con dato).
- Grafici esistenti (vasche, passo, FC): colori da `var(--chart-*)` e zone da `var(--zone-1..5)`; via gradienti `<linearGradient>` decorativi e glow; assi e etichette `text-xs`/`fill-muted-foreground`. Barra delle zone cardio come nella tavola (segmenti con la palette zone e percentuali sotto, la zona prevalente in grassetto).
- Pulsanti in fondo: «Condividi nel feed» (pieno) e coach AI (icona `Sparkles`, outline), comportamento invariato.
- Etichette in italiano (glossario), niente maiuscolo spaziato, niente «—» nei cerchi.
- Togli da `PENDING`. Commit `feat(ui): Corsia activity detail`.

### Task 15: Profilo

**Files:** `client/src/pages/Profile.tsx`, `client/src/pages/Badges.tsx` (solo l'ingresso dal profilo), `client/src/components/ThemeToggleButton.tsx` (eliminalo se non più usato; `ClubDetailEnhanced.tsx` lo importa: sostituisci lì con niente, il tema sta nel profilo).
- In testa: avatar, nome (`font-display text-[30px]`, via `neon-gradient-text`), badge profilo come `Chip`, follower/seguiti.
- `LevelCard` con i dati di `profile.get`; `data-tour="profile-stats"` sulla sezione statistiche come oggi.
- Anteprima badge: griglia di 6 con «Vedi tutti» → `/badges`, `data-tour="badges-nav"`.
- Sezione «Aspetto»: due opzioni «Scuro» e «Chiaro» (`role="radiogroup"`, `setTheme` dal Task 10), stato attivo con bordo `border-action-text`.
- Collegamenti «Statistiche» (`/profile/performance`) e «Impostazioni» (`/settings`).
- Togli da `PENDING`. Commit `feat(ui): Corsia profile with level card and appearance`.

**Fine gruppo 3:** il coordinatore distribuisce una build di prova (`pnpm android:distribute`) al proprietario.

---

## Gruppo 4 — Pulizia pagina per pagina

Per ogni task: applica le **Regole Corsia** ai file elencati e a quelli importati solo da loro; togli i file da `PENDING`; `pnpm check && pnpm test && pnpm lint` verdi; commit `style(ui): Corsia cleanup <area>`. Nessun cambio di logica. Guarda la pagina a 390px nella build di prova prima e dopo, se possibile.

### Task 16: Allena · Obiettivi, Statistiche, Coach AI
`pages/Goals.tsx`, `pages/Statistics.tsx`, `pages/Coach.tsx` e i loro componenti (`components/coach/*`, `components/statistics/*` se esistono: verifica gli import). Togli le testate duplicate (il titolo «Allena» e le sotto-schede li dà la shell). Grafici con `--chart-*`/`--zone-*`.

### Task 17: Community · Club, Classifiche, Sfide, Badge
`pages/Community.tsx`, `pages/Leaderboard.tsx`, `pages/Challenges.tsx`, `pages/ChallengeDetail.tsx`, `pages/Badges.tsx`. Podio e posizioni: oro/argento/bronzo con le varianti `rank-*` del Task 4, niente glow.

### Task 18: Pagine del club
`pages/ClubDetailEnhanced.tsx`, `ClubEventDetail.tsx`, `ClubWorkoutsPage.tsx`, `ClubWorkoutDetailPage.tsx`, `ClubPbLeaderboardPage.tsx`, `ClubDocumentsPage.tsx`, `ClubCoachModeration.tsx`, `ClubInvite.tsx`, `components/club/*`. Le pagine dietro flag spenti (`ClubMeetDetail`, `ClubMeetProgramBuilder`, `ClubHistory*`) ricevono solo le sostituzioni meccaniche necessarie a svuotare `PENDING`, nessun ridisegno.

### Task 19: Social e messaggi
`pages/Messages.tsx`, `pages/PostDetail.tsx`, `pages/ReportPost.tsx`, `pages/PublicProfile.tsx`, `pages/AdminReports.tsx`, `components/DirectMessages*.tsx`, `components/NotificationBell.tsx` e i componenti di notifica.

### Task 20: Accesso, impostazioni, landing, pagine legali
`pages/Login.tsx`, `Register.tsx`, `ForgotPassword.tsx`, `ResetPassword.tsx`, `AuthCallback.tsx`, `Settings.tsx`, `Home.tsx` (landing pubblica: stessi token, niente blob/griglie neon), `Privacy.tsx`, `Terms.tsx`, `CookiePolicy.tsx`, `NotFound.tsx`, `components/CookieBanner.tsx`, `components/onboarding/*`, `components/BadgeUnlockNotification.tsx`, `PbCelebrationNotification.tsx`, `ActivityInsightNotification.tsx`, `GarminSection.tsx`.

### Task 21: Coda
Tutti i file ancora presenti in `PENDING` per le regole `testo-piccolo`, `alone-neon`, `maiuscolo-spaziato`, `testo-gradiente`, `testo-primario`, `accento-lime`, `gradiente`. Alla fine queste liste sono vuote (i gradienti dei grafici SVG `<linearGradient>` non rientrano nella regola).

---

## Gruppo 5 — Rinomina e chiusura

### Task 22: Rinomina dei nomi legacy
**Files:** tutto `client/src` (sostituzioni meccaniche), `client/src/index.css`, `components/ui/{button,badge}.tsx`, `variants.test.ts`.
1. Varianti: `variant="neon"` → `variant="default"` (se il componente è `Badge`, → `variant="secondary"` o `Chip`, a seconda del contesto), `variant="outline-neon"` → `variant="outline"`, `variant="ghost-neon"` → `variant="ghost"` più `className` con `text-action-text` dove il testo era colorato. Poi elimina le varianti `neon`, `outline-neon`, `ghost-neon` da `button.tsx` e `neon` da `badge.tsx`; aggiorna `variants.test.ts`.
2. Token: `var(--electric-cyan)` → `var(--action-text)` (o classe `text-action-text`/`border-action-text`/`bg-primary` dove è un riempimento), `--electric-lime` → `--success`, `--electric-coral` → `--danger`, `--electric-violet` → `--muted-foreground`, `--forge-orange` → `--xp`, `--forge-orange-soft` → `color-mix(in oklch, var(--xp) 16%, transparent)`, `--chip-*` → token Corsia; `--neon-*`, `--forge-glow`, `--surface-glow`: elimina gli usi. Poi elimina gli alias dal blocco `:root, .dark` e da `@theme inline` (`--color-neon-*`, `--color-chip-*`, `--color-surface-glow`).
3. `.neon-gradient-text`: rimuovi la classe da tutti i JSX e la definizione da `index.css`.
4. Elimina la regola `.surface-panel > * { position: relative; }` da `@layer utilities` (le decorazioni assolute nei pannelli sono state tolte dai task di pagina; verifica con grep che nessun figlio diretto di un `surface-panel` usi ancora `absolute` per decorazioni).
5. `PENDING` di `token-legacy`, `variante-neon` e `testo-gradiente` vuoti; `pnpm check && pnpm test && pnpm build && pnpm build:native` verdi.
Commit `refactor(ui): drop legacy neon names`.

### Task 23: Documentazione
- `docs/ANDROID_APP_PLAN.md` §5 Fase 2: nota «Completata il …» con lo stato; §7 eventuali decisioni nuove.
- `docs/ANDROID_APP.md`: navigazione a cinque voci, home per piattaforma (`/today` nell'app, `/home` sul web), tema e barra di stato.
- `docs/plans/2026-10-28-android-phase-2-design.md`: «Stato: implementato» e differenze rispetto al design, se ce ne sono.
- `docs/design-proposals/claude-corsia/README.md`: una riga in testa che rimanda al design implementato.
Commit `docs: phase 2 documentation`.

### Task 24: Verifica finale (coordinatore)
1. `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm build:native`, `pnpm audit --prod --audit-level=high`.
2. **Avvio locale del server compilato** (lezione dell'hotfix del 28/10): `pnpm build`, poi `node dist/index.js` con `NODE_ENV=production PORT=3999 JWT_SECRET=… DATABASE_URL=postgres://u:p@127.0.0.1:1/x SUPABASE_URL=https://example.supabase.co SUPABASE_ANON_KEY=dummy`; attendere `server:listening`; `/healthz` 200 e `/` 200.
3. Build di prova sul Pixel (`pnpm android:distribute`): screenshot via `adb.exe -P 5038 exec-out screencap -p` di Oggi, Feed, Allena (lista e dettaglio), Community, Profilo, in tema scuro e chiaro; controllo che la barra in basso non sia coperta dalla barra gesti.
4. Desktop 1280px: WebView di debug via `chrome://inspect`/CDP (`adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`, `Emulation.setDeviceMetricsOverride` 1280×800, `Page.captureScreenshot`) sulle stesse schermate.
5. Review finale dell'intero branch (agente Fable), correzioni, PR verso `main` con gli screenshot, merge, deploy, controllo esterno `curl https://swimforge.it/ready`.
