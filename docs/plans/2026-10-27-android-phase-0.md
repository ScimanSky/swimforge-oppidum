# Fase 0 — Pulizia e base mobile: piano di implementazione

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rimuovere dalla web app le funzioni decise come superflue (storie, stagioni, ghost track, codice morto), preparare server e client all'autenticazione da app nativa, e chiudere tre debiti piccoli (obiettivi su server, FC a riposo reale, sidebar senza mock), mantenendo la produzione invariata fino al merge.

**Architecture:** Lavoro sul branch `android/phase-0` (mai su `main`: ogni push su `main` deploya su Oracle). Rimozioni per blocchi isolati, dal meno al più intrecciato, un commit per blocco con typecheck, lint e test verdi. Le tabelle DB delle funzioni rimosse restano. L'auth nativa aggiunge un canale `Authorization: Bearer` accanto al cookie, con CSRF saltato solo in quel caso.

**Tech Stack:** React 19 + wouter + tRPC 11 + superjson, Express, Drizzle (Postgres), jose (JWT), vitest (jsdom per `client/**`), pnpm. Design approvato: `docs/plans/2026-10-27-android-phase-0-design.md`. Mappa file di riferimento: report dell'agente del 27/10 riassunto nelle note di ogni task.

**Comandi di verifica (sempre dalla root del repo):**
```bash
pnpm check   # tsc --noEmit
pnpm lint    # eslint
pnpm test    # vitest run (baseline: 40 file, 216 test)
```
**Push (il token HTTPS è scaduto):** `git push git@github.com:ScimanSky/swimforge-oppidum.git android/phase-0`

---

## Task 0: Branch e baseline

**Step 1:** `git branch --show-current` → atteso `android/phase-0` (già creato il 27/10; se manca: `git checkout -b android/phase-0 main`).

**Step 2:** `pnpm check && pnpm lint && pnpm test` → atteso tutto verde, 216 test. Se lint segnala errori preesistenti, annotarli nel commit message del Task 1 e non correggerli qui.

**Step 3:** Nessun commit.

---

## Task 1: Cancellare il codice morto

**Files (eliminare):**
- `client/src/pages/Dashboard.tsx`, `SessionInsights.tsx`, `CoachDryland.tsx`, `ClubDetail.tsx`, `ComponentShowcase.tsx`, `Auth.tsx`
- `client/src/components/Map.tsx`, `components/dashboard/` (intera cartella), `components/statistics/StatisticsAccordion.tsx`, `components/landing/` (intera cartella), `components/MobileNav.tsx`, `components/app/app-bottom-nav.tsx`, `components/ManusDialog.tsx`, `components/BubbleAnimation.tsx`, `components/MetricBox.tsx`, `components/MetricCard.tsx`, `components/StravaSection.tsx`
- `client/src/components/club/ClubAnnouncementsTab.tsx`, `ClubEventsTab.tsx`, `ClubGalleryTab.tsx`, `ClubStatsTab.tsx`
- `client/src/components/social/StoryBar.tsx`, `social/InfiniteScrollSentinel.tsx`
- `client/src/hooks/useComposition.ts`, `hooks/useMobile.tsx`, `client/src/lib/sanitize.ts`

**Step 1: Conferma che nessun file è importato** (eseguire prima di cancellare):
```bash
for f in Dashboard SessionInsights CoachDryland ClubDetail ComponentShowcase Auth Map StatisticsAccordion MobileNav app-bottom-nav ManusDialog BubbleAnimation MetricBox MetricCard StravaSection ClubAnnouncementsTab ClubEventsTab ClubGalleryTab ClubStatsTab StoryBar InfiniteScrollSentinel useComposition useMobile; do
  n=$(grep -rE "from ['\"][^'\"]*/${f}['\"]|import\(['\"][^'\"]*/${f}['\"]\)" client/src --include=*.ts --include=*.tsx | grep -v "client/src/.*/${f}\.tsx\?:" | wc -l); echo "$f $n";
done
```
Atteso: ogni riga termina con `0` (eccezione: `Auth` può matchare `pages/Auth.tsx` solo se qualcuno importa `./pages/Auth`; `App.tsx` importa `Login`/`Register`, non `Auth`). `ClubDetail` deve dare 0 perché App importa `ClubDetailEnhanced`. Se un contatore non è 0, NON cancellare quel file e annotarlo.

**Step 2: Cancella** con `git rm -r` i file e le cartelle elencati.

**Step 3: Cascata di orfani.** Script da salvare in `scripts/find-orphan-modules.mjs`:
```js
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
```
Run: `node scripts/find-orphan-modules.mjs` → elenco. Cancellare solo le voci che sono nella lista attesa dell'agente (`hooks/usePersistFn`, `next/navigation`, `components/brand/SwimForgeBrand`, primitivi `components/ui/*`) dopo aver verificato ciascuna con un grep del nome del file. Ripetere lo script finché non produce nuove voci attese. Lasciare `components/ui/*` che sono importati da `components.json`/shadcn solo se il grep conferma zero import.

**Step 4:** `pnpm check && pnpm lint && pnpm test` → verde, 216 test.

**Step 5: Commit**
```bash
git add -A && git commit -m "chore: remove unreferenced pages, components and hooks"
```

---

## Task 2: Rimuovere Ghost track

**Files:**
- Delete: `client/src/components/ghost-track/` (cartella), `server/db_ghost_challenges.ts`
- Modify: `client/src/pages/Challenges.tsx:43` (import GhostTrackTab), `:181` (`useState("ghost")` → `useState("classic")`), `:349` (testo "Ghost Track e sfide classiche…" → "Le tue sfide con la community."), `:380-385` (TabsList/TabsContent "ghost")
- Modify: `server/routers/community.router.ts:805-883` (procedure `ghostChallenges` e `ghostTrack`) e i relativi import di `db_ghost_challenges`
- Modify: `server/product_analytics.ts:17-18` (eventi `ghost_duel_create`, `ghost_track_open`)
- Keep: `drizzle/schema.ts:151` tabella `ghost_challenges`; `server/routers/auth.router.ts:337` (delete righe nel reset) resta.

**Step 1:** Rimuovere la tab: in `Challenges.tsx` lasciare una sola `TabsList` con `classic` o, meglio, eliminare `Tabs` e rendere il contenuto "classic" il corpo della pagina. Lo stato `sectionTab` sparisce.

**Step 2:** Rimuovere le procedure server e `db_ghost_challenges.ts`. `grep -rn "ghost" server client/src --include=*.ts --include=*.tsx` deve restituire solo `auth.router.ts:337` e lo schema.

**Step 3:** `pnpm check && pnpm lint && pnpm test` → verde.

**Step 4: Commit** `git commit -am "feat: remove ghost track"`

---

## Task 3: Modulo XP azioni social indipendente dalle stagioni

**Files:**
- Create: `server/xp_actions.ts`
- Test: `server/xp_actions.test.ts`
- Modify: `server/routers/_shared.ts:48-58` (export `awardActionXp` e `getActionXpStatus` da `../xp_actions` invece di `../season_engagement`)

**Step 1: Scrivi il test**
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock("./db", () => ({ getDb: getDbMock }));

import { ACTION_XP_DAILY_CAP, ACTION_XP_RULES, awardActionXp, getActionXpStatus } from "./xp_actions";

describe("xp_actions", () => {
  beforeEach(() => { vi.clearAllMocks(); getDbMock.mockResolvedValue(null); });

  it("keeps the historical rule table", () => {
    expect(ACTION_XP_RULES).toEqual({ comment: { xp: 16 }, splash: { xp: 10 }, reaction: { xp: 8 }, rsvp: { xp: 12 }, club_post: { xp: 20 } });
    expect(ACTION_XP_DAILY_CAP).toBe(90);
  });

  it("returns unavailable when the database is not configured", async () => {
    const result = await awardActionXp({ userId: 1, actionType: "comment", entityId: 10 });
    expect(result.awardedXp).toBe(0);
    expect(result.reason).toBe("unavailable");
  });

  it("reports an empty status without database", async () => {
    const status = await getActionXpStatus(7, new Date("2026-10-27T10:00:00Z"));
    expect(status).toMatchObject({ dayKey: "2026-10-27", earnedToday: 0, cap: 90, remaining: 90 });
  });
});
```

**Step 2:** `pnpm vitest run server/xp_actions.test.ts` → FAIL (modulo mancante).

**Step 3: Implementa** `server/xp_actions.ts` copiando da `server/season_engagement.ts` SENZA modificare la logica: `DbClient`, `ActionXpType` (esportato), `ACTION_XP_RULES` (esportato), `ACTION_XP_DAILY_CAP` (esportato), `toUtcDateKey` (cercarla nel file, ~riga 100-150), `applyXpWithUniqueDescription` (righe 197-287), `getActionXpTotalForDay` (289-304), `getActionXpBreakdownForDay` (305-335), `getActionXpStatus` (337-370), `awardActionXp` (371-437). Togliere ogni chiamata a `ensureSeasonEngagementSchema()`. Import necessari: `and, eq, lte, sql` da drizzle-orm, `getDb` da `./db`, `levelThresholds, swimmerProfiles, xpTransactions` dallo schema.

**Step 4:** `pnpm vitest run server/xp_actions.test.ts` → PASS. Aggiornare `_shared.ts`. `pnpm check && pnpm test` → verde (i test delle stagioni esistono ancora e passano).

**Step 5: Commit** `git add -A && git commit -m "refactor: move social action XP out of season engagement"`

---

## Task 4: Rimuovere le stagioni, lato server

**Files:**
- Delete: `server/season.ts`, `server/season_engagement.ts`, `server/season_mark_weekly_action.test.ts`, `server/season_weekly_focus.test.ts`
- Modify: `server/routers/gameplay.router.ts` — cancellare le costanti `SEASON_WEEKLY_ACTION_TYPES`/`SEASON_WEEKLY_ACTION_SOURCES` (43-52), `seasonRouter` (112-304), `videoRouter` (306-404) e gli import ora inutili
- Modify: `server/routers/_shared.ts:47-58` — togliere gli export da `../season` e `../season_engagement` (restano quelli di Task 3)
- Modify: `server/routers/index.ts` — togliere `seasonRouter`, `videoRouter` dall'import e `season:`/`video:` dal router
- Modify: `server/db.ts:1174-1175` e `server/routers/auth.router.ts:334-335` — le DELETE sulle tabelle runtime `season_activity_predictions` e `season_club_quest_claims` vanno avvolte così:
```ts
// Tables were created at runtime by the removed season engine; they may not exist.
try { await db.execute(sql`DELETE FROM season_activity_predictions WHERE user_id = ${userId}`); } catch { /* table absent */ }
try { await db.execute(sql`DELETE FROM season_club_quest_claims WHERE user_id = ${userId}`); } catch { /* table absent */ }
```
(adattare al codice reale di quelle righe: se usano già `sql` raw, basta il try/catch).

**Step 1:** Applicare le modifiche. `grep -rn "season" server --include=*.ts -il` deve restituire solo `db.ts`, `auth.router.ts` (le due delete) ed eventuali file di meet/club (parola "season" usata in altro senso: verificare).

**Step 2:** `pnpm check` → gli errori rimasti sono tutti nel client (atteso, risolti nel Task 5). `pnpm vitest run server` → verde.

**Step 3: Commit** `git add -A && git commit -m "feat(server): remove season engine, battle pass, missions, predictions and recap"`

---

## Task 5: Rimuovere le stagioni, lato client

**Files:**
- Delete: `client/src/pages/Season.tsx`, `client/src/components/SeasonLaunchPopup.tsx`, `client/src/lib/seasonBadgeImages.ts`, `client/src/components/video/SeasonRecapComposition.tsx`, `SeasonRecapPlayer.tsx`, `SeasonRecapDialog.tsx`, `season-recap-constants.ts`
- Modify `client/src/App.tsx`: riga 31 (lazy `SeasonPage`), 11 e 189 (`SeasonLaunchPopup`), 131 (`<Route path="/season">`), 88-90 e 96-98 (redirect `/dashboard` → `/track`)
- Modify `client/src/pages/Badges.tsx`: 16 (import), 91-94 (`seasonQuery`), 131-167 (`seasonBadges` → rimuovere e togliere da `allBadges`), 372-384 (blocco "Season attiva" → rimuovere il `motion.div`)
- Modify `client/src/components/BadgeUnlockWatcher.tsx`: 5, 28-38 (`getUnlockedSeasonValue`), 62-72 (`seasonQuery` e `isDataReady`), 118-149 (`seasonItems`)
- Modify `client/src/pages/Profile.tsx`: 308 (`seasonQuery`), 411-442 (`seasonBadgeSummary` e il suo uso in `unlockedBadges`/`totalBadges`)
- Modify `client/src/pages/Activities.tsx`: 156-160 (`seasonQuery`), 305-312 (due `Badge` Season Lv/XP: sostituire con il livello/XP del profilo se `trpc.profile.get` è già in pagina, altrimenti rimuovere)
- Modify `client/src/pages/Challenges.tsx`: 198-200 (`seasonQuery`), 343-356 (riga "Stagione in corso" e i due `Badge`)
- Modify `client/src/components/onboarding/OnboardingFlow.tsx`: 63 (step `season-hub`), 139-140, 186, 220-242, 281 (evento popup) — l'onboarding salta lo step stagione
- Modify `client/src/components/onboarding/OnboardingNudgeManager.tsx:66-68`
- Modify `client/src/components/AutoSync.tsx:22,58` (target `/season` → `/track`)
- Modify `client/src/lib/product_analytics.ts:8-9,14-16` (eventi season)
- Modify `client/src/lib/feature-flags.ts:23-25` (togliere i tre flag season)
- Modify `client/src/components/app/app-shell.tsx`: 105-108 (`isSeasonPath`), 142-148 (quick access "Season Hub"), titoli 174-195 che citano Season, `data-tour="season-hub"`
- Modify test `client/src/pages/Activities.ui.test.tsx:34-40` (mock `season.getCurrent` → rimuovere)
- Modify `.env.example:87-88`, `.env.oracle.example:73-74` (VITE_SEASON_*)

**Step 1:** Applicare. `grep -rni "season" client/src --include=*.ts --include=*.tsx` deve restare vuoto, salvo stringhe di testo non legate al codice (valutare caso per caso e rimuoverle se parlano di "Season").

**Step 2:** `pnpm check && pnpm lint && pnpm test` → verde. Il conteggio test scende (2 file server eliminati): annotare il nuovo numero.

**Step 3: Commit** `git add -A && git commit -m "feat(client): remove season hub, launch popup, season badges and recap"`

---

## Task 6: Route canoniche senza `/season/`

**Files:**
- Modify `client/src/App.tsx:99-119`: `path="/challenges"` → `Challenges`, `/challenges/:id` → `ChallengeDetail`, `/leaderboard` → `Leaderboard`, `/goals` → `Goals`; le vecchie `/season/challenges`, `/season/challenges/:id`, `/season/leaderboard`, `/season/objectives`, `/season` diventano `Redirect` verso le nuove; `/dashboard` e `/home/dashboard` → `/track`
- Modify `client/src/components/app/app-shell.tsx`: `isChallengesPath`/`isTrainingPath` (77-108), `quickAccessItems` (139-172: Classifica `/leaderboard`, Challenges `/challenges`, Obiettivi `/goals`), titoli 174-195, bottom nav 662-760 se cita `/season`
- Grep: `grep -rn '"/season' client/src` → sostituire ogni occorrenza (Login, OnboardingFlow, NotificationBell, Goals, Challenges, ChallengeDetail…)

**Step 1:** Applicare. **Step 2:** `pnpm check && pnpm lint && pnpm test` → verde.

**Step 3: Commit** `git commit -am "refactor(routes): make /challenges, /leaderboard and /goals canonical"`

---

## Task 7: Rimuovere le storie, lato server

**Files:**
- Delete: `server/routers/community.stories.router.ts`, `server/db_stories.ts`, `server/community.forwarding.ts` (se contiene solo l'inoltro storie; se gestisce anche i post, togliere solo la parte storie)
- Modify `server/routers/community.router.ts`: 18 e 774 (mount `stories`), 678 e 694-695 (scope `"stories"` di `cloudinaryVideoAuth` → solo `"posts"`)
- Modify `server/routers/community.messages.router.ts`: 35, 117-155, 205-206 (`forward` accetta solo `post`)
- Modify `server/routers/admin.router.ts`: 172 (`storyCleanupStats`), 181 (`runStoryCleanup`)
- Modify `server/db_social_enhanced.ts`: 342, 389, 450, 578 (union `messageType` senza `forward_story`)
- Modify `server/_core/index.ts`: 14 e 266-291 (endpoint `POST /api/cron/cleanup-expired-stories`)
- Keep: `drizzle/schema.ts:372-400` (tabelle), `server/db.ts:1033-1104` export e 1139-1188/1255-1261 cancellazione account (la cancellazione delle righe storie resta per privacy; se importa `db_stories.ts`, spostare le due query minime dentro `db.ts`), `auth.router.ts:306-308`
- Test: `server/routers/community.cloudinary-video-auth.test.ts:107-163` (casi "stories" → rimuovere)

**Step 1:** Applicare. `grep -rni "stor(y|ies)" server --include=*.ts` deve restituire solo schema, `db.ts` (export/cancellazione) e `auth.router.ts`.

**Step 2:** `pnpm check` (errori solo client, attesi) e `pnpm vitest run server` → verde.

**Step 3: Commit** `git add -A && git commit -m "feat(server): remove stories router, cleanup cron and story forwarding"`

---

## Task 8: Rimuovere le storie, lato client

**Files:**
- Delete: `client/src/components/social/StoryAvatar.tsx`, `StoryViewer.tsx`, `StoryCreator.tsx`, `client/src/lib/social-feed-stories.ts`, test `StoryAvatar.test.tsx`, `StoryViewer.test.tsx`, `StoryViewer.clip-range.test.ts`, `social-feed-stories.test.ts`
- Modify `client/src/pages/SocialFeed.tsx`: 6-8, 19-23, 72-74, 88-116, 180-209 (`headerStoriesSlot`), 303-312
- Modify `client/src/components/social/CreatePostSheet.tsx`: 19, 73, 303, 534 (opzione "storia")
- Modify `client/src/components/app/app-shell.tsx`: 52, 250-254, 273/277, 372, 451, 465 (`showHeaderStories`), 473, 588, 654-660, 802, 911, 942
- Modify `client/src/components/DirectMessages.tsx`: 66, 86, 103, 502, 627 (`forward_story`)
- Modify `client/src/components/social/ForwardContentDialog.tsx`: 23, 121
- Modify `client/src/pages/AdminReports.tsx`: 61-74 e ~222 (pannello pulizia storie)
- Modify test: `client/src/pages/SocialFeed.mobile.test.tsx:13-65` (mock storie), `client/src/components/social/CreatePostSheet.mobile.test.tsx:82`

**Step 1:** Applicare. `grep -rni "stor(y|ies)" client/src --include=*.ts --include=*.tsx` → vuoto (eccetto "history"/"storage": il regex sopra non li prende).

**Step 2:** `pnpm check && pnpm lint && pnpm test` → verde; annotare il nuovo numero di test.

**Step 3: Commit** `git add -A && git commit -m "feat(client): remove 24h stories"`

---

## Task 9: Config, documentazione, cron

**Files:**
- Modify `DEPLOYMENT.md:118-123`: togliere `cleanup-expired-stories` dalla lista cron; aggiungere in testa una nota: "Produzione: Oracle via `.github/workflows/deploy-oracle.yml` a ogni push su `main`; la sezione Render è storica."
- Modify `docs/ANDROID_APP_PLAN.md` §1: sostituire "Backend invariato su Render" con "Backend invariato su Oracle (docker compose)".
- Verificare che lo scheduler esterno (vedi `DEPLOYMENT.md`) non chiami più l'endpoint storie: annotare nel commit che va rimosso dallo scheduler Oracle (azione manuale del proprietario).

**Step 1:** Applicare. **Step 2:** `pnpm test` → verde. **Step 3: Commit** `git commit -am "docs: update deploy notes and cron list after phase 0 removals"`

---

## Task 10: Auth Bearer e CSRF lato server

**Files:**
- Create: `server/_core/bearer.ts`
- Create: `server/_core/csrf.ts`
- Test: `server/_core/bearer.test.ts`, `server/_core/csrf.test.ts`
- Modify: `server/_core/sdk.ts:303-311`, `server/_core/trpc.ts:21-48`, `server/_core/context.ts:26-31`, `server/middleware/security.ts:168-192`

**Step 1: Test di `bearer.ts`**
```ts
import { describe, expect, it } from "vitest";
import { extractBearerToken } from "./bearer";

describe("extractBearerToken", () => {
  it("returns the token after the Bearer prefix", () => {
    expect(extractBearerToken({ authorization: "Bearer abc.def.ghi" })).toBe("abc.def.ghi");
  });
  it("is case-insensitive on the scheme and trims spaces", () => {
    expect(extractBearerToken({ authorization: "bearer   tok " })).toBe("tok");
  });
  it("returns null for missing, empty or other schemes", () => {
    expect(extractBearerToken({})).toBeNull();
    expect(extractBearerToken({ authorization: "Basic xyz" })).toBeNull();
    expect(extractBearerToken({ authorization: "Bearer " })).toBeNull();
    expect(extractBearerToken({ authorization: ["Bearer a", "Bearer b"] })).toBe("a");
  });
});
```

**Step 2:** `pnpm vitest run server/_core/bearer.test.ts` → FAIL.

**Step 3: Implementa `server/_core/bearer.ts`**
```ts
type HeaderValue = string | string[] | undefined;

/** Reads a `Bearer <token>` Authorization header. Returns null when absent or malformed. */
export function extractBearerToken(headers: { authorization?: HeaderValue }): string | null {
  const raw = Array.isArray(headers.authorization) ? headers.authorization[0] : headers.authorization;
  if (typeof raw !== "string") return null;
  const match = /^\s*bearer\s+(.+?)\s*$/i.exec(raw);
  const token = match?.[1]?.trim();
  return token ? token : null;
}
```

**Step 4: Test di `csrf.ts`**
```ts
import { describe, expect, it } from "vitest";
import { shouldEnforceCsrf } from "./csrf";

describe("shouldEnforceCsrf", () => {
  const base = { type: "mutation" as const, hasSessionCookie: true, hasBearer: false, env: "production", disabled: false };
  it("enforces for cookie-authenticated mutations", () => expect(shouldEnforceCsrf(base)).toBe(true));
  it("skips queries", () => expect(shouldEnforceCsrf({ ...base, type: "query" })).toBe(false));
  it("skips anonymous requests", () => expect(shouldEnforceCsrf({ ...base, hasSessionCookie: false })).toBe(false));
  it("skips bearer-authenticated requests even with a cookie", () => expect(shouldEnforceCsrf({ ...base, hasBearer: true })).toBe(false));
  it("skips in test env or when disabled", () => {
    expect(shouldEnforceCsrf({ ...base, env: "test" })).toBe(false);
    expect(shouldEnforceCsrf({ ...base, disabled: true })).toBe(false);
  });
});
```

**Step 5:** `pnpm vitest run server/_core/csrf.test.ts` → FAIL.

**Step 6: Implementa `server/_core/csrf.ts`**
```ts
export type CsrfDecisionInput = {
  type: "query" | "mutation" | "subscription";
  hasSessionCookie: boolean;
  hasBearer: boolean;
  env: string | undefined;
  disabled: boolean;
};

/**
 * CSRF only matters when the browser attaches credentials by itself (the session cookie).
 * A Bearer header is never attached automatically, and a cross-site fetch with a custom
 * header is blocked by the CORS preflight, so bearer-authenticated requests are exempt.
 */
export function shouldEnforceCsrf(input: CsrfDecisionInput): boolean {
  if (input.env === "test" || input.disabled) return false;
  if (input.type !== "mutation") return false;
  if (input.hasBearer) return false;
  return input.hasSessionCookie;
}
```

**Step 7: Collega.** In `trpc.ts` il middleware diventa:
```ts
const csrfProtection = t.middleware(async (opts) => {
  const cookies = parseCookieHeader(opts.ctx.req.headers.cookie ?? "");
  const enforce = shouldEnforceCsrf({
    type: opts.type,
    hasSessionCookie: Boolean(cookies[COOKIE_NAME]),
    hasBearer: extractBearerToken(opts.ctx.req.headers) !== null,
    env: process.env.NODE_ENV,
    disabled: process.env.DISABLE_CSRF_PROTECTION === "true",
  });
  if (!enforce) return opts.next();
  const csrfCookie = cookies[CSRF_COOKIE_NAME];
  const csrfHeaderRaw = opts.ctx.req.headers["x-csrf-token"];
  const csrfHeader = Array.isArray(csrfHeaderRaw) ? csrfHeaderRaw[0] : csrfHeaderRaw;
  if (!csrfCookie || !csrfHeader || csrfHeader !== csrfCookie) {
    throw new TRPCError({ code: "FORBIDDEN", message: "CSRF validation failed" });
  }
  return opts.next();
});
```
In `sdk.ts` `authenticateRequest` (righe 303-311):
```ts
const cookies = this.parseCookies(req.headers.cookie);
const bearerToken = extractBearerToken(req.headers);
const sessionCookie = bearerToken ?? cookies.get(COOKIE_NAME);
const session = await this.verifySession(sessionCookie);
if (!session) {
  throw ForbiddenError(bearerToken ? "Invalid bearer session" : "Invalid session cookie");
}
```
In `context.ts` righe 26-31: emettere il cookie CSRF solo se `extractBearerToken(opts.req.headers) === null`.
In `security.ts` righe 170-176: default origini `'https://swimforge-frontend.onrender.com,https://swimforge.it,https://localhost,capacitor://localhost'`; `allowedHeaders` aggiunge `'x-swimforge-client'`.

**Step 8:** `pnpm vitest run server/_core` → PASS; `pnpm check && pnpm lint && pnpm test` → verde.

**Step 9: Commit** `git add -A && git commit -m "feat(auth): accept bearer session tokens and exempt them from CSRF"`

---

## Task 11: `syncSupabaseUser` restituisce il token ai client nativi

**Files:**
- Modify: `server/routers/auth.router.ts:195-211`
- Create: `shared/native.ts` con `export const NATIVE_CLIENT_HEADER = "x-swimforge-client"; export const NATIVE_CLIENT_VALUE = "native";`
- Test: `server/routers/auth.native-token.test.ts`

**Step 1: Test** (stile `community.toggle-share.test.ts`; mock di `../_core/supabase`, `../db`, `../_core/sdk`, `../_core/cookies`, `../legal` o il modulo che esporta `ensureRequiredLegalConsents`: verificare il nome con `grep -n ensureRequiredLegalConsents server/routers/auth.router.ts`):
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  verifySupabaseAccessToken: vi.fn(),
  getUserByEmail: vi.fn(),
  updateUserLastSignedIn: vi.fn(),
  createSessionToken: vi.fn(),
  ensureRequiredLegalConsents: vi.fn(),
}));
vi.mock("../_core/supabase", () => ({ verifySupabaseAccessToken: m.verifySupabaseAccessToken }));
vi.mock("../db", () => ({ getUserByEmail: m.getUserByEmail, updateUserLastSignedIn: m.updateUserLastSignedIn, createOAuthUser: vi.fn() }));
vi.mock("../_core/sdk", () => ({ sdk: { createSessionToken: m.createSessionToken } }));
// adattare il percorso del modulo di ensureRequiredLegalConsents
vi.mock("../legal_consents", () => ({ ensureRequiredLegalConsents: m.ensureRequiredLegalConsents }));

import { authRouter } from "./auth.router";

function ctx(headers: Record<string, string>) {
  return { user: null, req: { protocol: "https", headers } as any, res: { cookie: vi.fn() } as any };
}

describe("auth.syncSupabaseUser native token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.verifySupabaseAccessToken.mockResolvedValue({ id: "sb-1", email: "a@b.it", app_metadata: { provider: "email" }, user_metadata: {} });
    m.getUserByEmail.mockResolvedValue({ id: 5, email: "a@b.it", name: "A", sessionTokenVersion: 1 });
    m.updateUserLastSignedIn.mockResolvedValue(undefined);
    m.createSessionToken.mockResolvedValue("jwt-token");
    m.ensureRequiredLegalConsents.mockResolvedValue(undefined);
  });
  const input = { accessToken: "sb-access", user: { id: "sb-1", email: "a@b.it", name: null } };

  it("omits the token for web clients", async () => {
    const result = await authRouter.createCaller(ctx({})).syncSupabaseUser(input);
    expect(result).not.toHaveProperty("sessionToken");
  });

  it("returns the token for native clients", async () => {
    const result = await authRouter.createCaller(ctx({ "x-swimforge-client": "native" })).syncSupabaseUser(input);
    expect(result.sessionToken).toBe("jwt-token");
  });
});
```
Se `authRouter` importa moduli che si connettono al DB all'import, mockare anche quelli (vedere come fa `server/auth.logout.test.ts`).

**Step 2:** `pnpm vitest run server/routers/auth.native-token.test.ts` → FAIL (manca `sessionToken`).

**Step 3: Implementa** in `auth.router.ts` dopo `await ensureRequiredLegalConsents(...)`:
```ts
const clientHeader = ctx.req.headers[NATIVE_CLIENT_HEADER];
const isNativeClient = (Array.isArray(clientHeader) ? clientHeader[0] : clientHeader) === NATIVE_CLIENT_VALUE;
return {
  success: true,
  isNewUser,
  user: { id: user.id, email: user.email, name: user.name },
  ...(isNativeClient ? { sessionToken } : {}),
};
```

**Step 4:** test PASS; `pnpm check && pnpm lint && pnpm test` → verde.

**Step 5: Commit** `git add -A && git commit -m "feat(auth): return session token to native clients"`

---

## Task 12: Client pronto per il nativo

**Files:**
- Create: `client/src/lib/platform.ts`, `client/src/lib/session-token.ts`, `client/src/lib/trpc-headers.ts`
- Test: `client/src/lib/session-token.test.ts`, `client/src/lib/trpc-headers.test.ts`
- Modify: `client/src/main.tsx:40-66`, `client/src/pages/Login.tsx:71-80` (onSuccess della mutation), `client/src/pages/AuthCallback.tsx:118`, `client/src/pages/Register.tsx` (stesso punto di sync), `client/src/components/app/app-shell.tsx:557-573`, `client/src/_core/hooks/useAuth.ts:21-29`

**Step 1: Test `trpc-headers`**
```ts
import { describe, expect, it } from "vitest";
import { buildTrpcHeaders } from "./trpc-headers";

describe("buildTrpcHeaders", () => {
  it("adds the csrf header on the web", () => {
    const h = buildTrpcHeaders({ isNative: false, csrfToken: "c%20t", nativeToken: null });
    expect(h.get("x-csrf-token")).toBe("c t");
    expect(h.get("authorization")).toBeNull();
  });
  it("adds bearer and client headers on native", () => {
    const h = buildTrpcHeaders({ isNative: true, csrfToken: null, nativeToken: "jwt" });
    expect(h.get("authorization")).toBe("Bearer jwt");
    expect(h.get("x-swimforge-client")).toBe("native");
  });
  it("keeps existing headers", () => {
    const h = buildTrpcHeaders({ isNative: false, csrfToken: null, nativeToken: null }, { "content-type": "application/json" });
    expect(h.get("content-type")).toBe("application/json");
  });
});
```
**Step 2: Test `session-token`**
```ts
import { beforeEach, describe, expect, it } from "vitest";
import { clearNativeSessionToken, getNativeSessionToken, setNativeSessionToken } from "./session-token";

describe("session-token", () => {
  beforeEach(() => localStorage.clear());
  it("stores and reads the token", () => { setNativeSessionToken("t"); expect(getNativeSessionToken()).toBe("t"); });
  it("clears the token", () => { setNativeSessionToken("t"); clearNativeSessionToken(); expect(getNativeSessionToken()).toBeNull(); });
  it("survives a broken storage", () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error("blocked"); };
    expect(getNativeSessionToken()).toBeNull();
    Storage.prototype.getItem = original;
  });
});
```
**Step 3:** `pnpm vitest run client/src/lib` → FAIL (moduli mancanti).

**Step 4: Implementa**
```ts
// client/src/lib/platform.ts
type CapacitorGlobal = { isNativePlatform?: () => boolean };
/** True inside the Capacitor shell (phase 1). Always false in the browser. */
export function isNativePlatform(): boolean {
  const cap = (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;
  try { return Boolean(cap?.isNativePlatform?.()); } catch { return false; }
}
```
```ts
// client/src/lib/session-token.ts
const KEY = "swimforge:nativeSessionToken"; // phase 1: move to @capacitor/preferences
export function getNativeSessionToken(): string | null { try { return localStorage.getItem(KEY); } catch { return null; } }
export function setNativeSessionToken(token: string): void { try { localStorage.setItem(KEY, token); } catch { /* ignore */ } }
export function clearNativeSessionToken(): void { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
```
```ts
// client/src/lib/trpc-headers.ts
import { NATIVE_CLIENT_HEADER, NATIVE_CLIENT_VALUE } from "@shared/native";
export function buildTrpcHeaders(
  input: { isNative: boolean; csrfToken: string | null; nativeToken: string | null },
  init?: HeadersInit,
): Headers {
  const headers = new Headers(init ?? {});
  if (input.isNative) {
    headers.set(NATIVE_CLIENT_HEADER, NATIVE_CLIENT_VALUE);
    if (input.nativeToken) headers.set("authorization", `Bearer ${input.nativeToken}`);
    return headers;
  }
  if (input.csrfToken) headers.set("x-csrf-token", decodeURIComponent(input.csrfToken));
  return headers;
}
```
In `main.tsx` la `fetch` del link diventa:
```ts
fetch(input, init) {
  const csrfToken = typeof document === "undefined" ? null : readCsrfCookie(); // estrarre la lettura esistente in una funzione locale
  const headers = buildTrpcHeaders({ isNative: isNativePlatform(), csrfToken, nativeToken: getNativeSessionToken() }, init?.headers);
  return globalThis.fetch(input, { ...(init ?? {}), headers, credentials: "include" });
},
```
Login/AuthCallback/Register: nel callback `onSuccess` della mutation `syncSupabaseUser`, `if ("sessionToken" in data && data.sessionToken) setNativeSessionToken(data.sessionToken)`. Logout (`app-shell.tsx:557-573` e `useAuth.ts`): chiamare `clearNativeSessionToken()`.

**Step 5:** `pnpm vitest run client/src/lib` → PASS; `pnpm check && pnpm lint && pnpm test` → verde.

**Step 6: Commit** `git add -A && git commit -m "feat(client): native session token plumbing behind isNativePlatform"`

---

## Task 13: Obiettivi personalizzati sul server

**Files:**
- Modify: `drizzle/schema.ts` (aggiungere in fondo)
- Create: migrazione con `pnpm db:generate` → `drizzle/0033_add_user_goals.sql` + snapshot
- Create: `server/db_goals.ts`, `server/routers/goals.router.ts`
- Test: `server/routers/goals.router.test.ts`
- Modify: `server/routers/index.ts` (mount `goals`), `client/src/pages/Goals.tsx` (74-75, 278-345, 369-387)

**Step 1: Schema**
```ts
export const userGoals = pgTable("user_goals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  title: varchar("title", { length: 120 }).notNull(),
  category: varchar("category", { length: 32 }).notNull().default("distance"),
  targetValue: real("target_value"),
  unit: varchar("unit", { length: 24 }),
  currentValue: real("current_value").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userGoalsUserIdx: index("idx_user_goals_user").on(table.userId),
}));
export type UserGoal = typeof userGoals.$inferSelect;
```
Run: `pnpm db:generate` → crea `drizzle/0033_*.sql`; rinominare in `0033_add_user_goals.sql` solo se drizzle lo consente (altrimenti lasciare il nome generato e aggiornare `drizzle/meta/_journal.json` di conseguenza). `pnpm db:validate` → OK.

**Step 2: Test del router** (mock di `../db_goals` nello stile di `community.toggle-share.test.ts`):
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
const g = vi.hoisted(() => ({ listUserGoals: vi.fn(), createUserGoal: vi.fn(), updateUserGoal: vi.fn(), deleteUserGoal: vi.fn() }));
vi.mock("../db_goals", () => g);
import { goalsRouter } from "./goals.router";
const ctx = { user: { id: 42 } as any, req: { protocol: "https", headers: {} } as any, res: {} as any };

describe("goals router", () => {
  beforeEach(() => vi.clearAllMocks());
  it("lists the caller's goals", async () => {
    g.listUserGoals.mockResolvedValue([{ id: 1 }]);
    expect(await goalsRouter.createCaller(ctx).list()).toEqual([{ id: 1 }]);
    expect(g.listUserGoals).toHaveBeenCalledWith(42);
  });
  it("creates with trimmed title", async () => {
    g.createUserGoal.mockResolvedValue({ id: 2 });
    await goalsRouter.createCaller(ctx).create({ title: "  8 km  ", category: "distance", targetValue: 8, unit: "km" });
    expect(g.createUserGoal).toHaveBeenCalledWith(42, { title: "8 km", category: "distance", targetValue: 8, unit: "km" });
  });
  it("rejects an empty title", async () => {
    await expect(goalsRouter.createCaller(ctx).create({ title: "  ", category: "distance", targetValue: null, unit: null })).rejects.toThrow();
  });
  it("deletes only the caller's goal", async () => {
    g.deleteUserGoal.mockResolvedValue(true);
    await goalsRouter.createCaller(ctx).remove({ id: 9 });
    expect(g.deleteUserGoal).toHaveBeenCalledWith(42, 9);
  });
});
```
**Step 3:** `pnpm vitest run server/routers/goals.router.test.ts` → FAIL.

**Step 4: Implementa `server/db_goals.ts`** (con `getDb()` da `./db`, `eq, and, desc` da drizzle-orm):
```ts
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "./db";
import { userGoals, type UserGoal } from "../drizzle/schema";

export type GoalInput = { title: string; category: string; targetValue: number | null; unit: string | null };

export async function listUserGoals(userId: number): Promise<UserGoal[]> {
  const db = await getDb(); if (!db) return [];
  return db.select().from(userGoals).where(eq(userGoals.userId, userId)).orderBy(desc(userGoals.createdAt));
}
export async function createUserGoal(userId: number, input: GoalInput): Promise<UserGoal | null> {
  const db = await getDb(); if (!db) return null;
  const [row] = await db.insert(userGoals).values({ userId, ...input }).returning();
  return row ?? null;
}
export async function updateUserGoal(userId: number, id: number, input: Partial<GoalInput> & { currentValue?: number }): Promise<UserGoal | null> {
  const db = await getDb(); if (!db) return null;
  const [row] = await db.update(userGoals).set({ ...input, updatedAt: new Date() })
    .where(and(eq(userGoals.id, id), eq(userGoals.userId, userId))).returning();
  return row ?? null;
}
export async function deleteUserGoal(userId: number, id: number): Promise<boolean> {
  const db = await getDb(); if (!db) return false;
  const rows = await db.delete(userGoals).where(and(eq(userGoals.id, id), eq(userGoals.userId, userId))).returning({ id: userGoals.id });
  return rows.length > 0;
}
```
**`server/routers/goals.router.ts`**
```ts
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { createUserGoal, deleteUserGoal, listUserGoals, updateUserGoal } from "../db_goals";

const goalInput = z.object({
  title: z.string().trim().min(1).max(120),
  category: z.string().min(1).max(32),
  targetValue: z.number().positive().nullable(),
  unit: z.string().max(24).nullable(),
});

export const goalsRouter = router({
  list: protectedProcedure.query(({ ctx }) => listUserGoals(ctx.user.id)),
  create: protectedProcedure.input(goalInput).mutation(({ ctx, input }) => createUserGoal(ctx.user.id, input)),
  update: protectedProcedure
    .input(goalInput.partial().extend({ id: z.number().int().positive(), currentValue: z.number().min(0).optional() }))
    .mutation(({ ctx, input }) => { const { id, ...rest } = input; return updateUserGoal(ctx.user.id, id, rest); }),
  remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ ctx, input }) => deleteUserGoal(ctx.user.id, input.id)),
});
```
Mount in `routers/index.ts`: `goals: goalsRouter`.

**Step 5: Client `Goals.tsx`.** Sostituire lo stato `customGoals` con `trpc.goals.list.useQuery()` e le tre mutation; mappare le righe server alla forma usata in pagina (`progress = target ? min(100, round(current/target*100)) : 0`, `status`, `deadline: "Da iniziare"`, `milestones: []`). Migrazione una tantum: in un `useEffect`, se `localStorage["swimforge:customGoals"]` contiene un array, per ogni voce con `title` chiamare `create` e alla fine `localStorage.removeItem`. `addSuggestedGoal` chiama `create`; `removeCustomGoal` chiama `remove`; `saveEditGoal` chiama `update`.

**Step 6:** test PASS; `pnpm check && pnpm lint && pnpm test && pnpm db:validate` → verde.

**Step 7: Commit** `git add -A && git commit -m "feat(goals): persist custom goals on the server"`

---

## Task 14: FC a riposo dalle attività

**Files:**
- Create: `server/lib/resting-hr.ts`, Test: `server/lib/resting-hr.test.ts`
- Modify: `server/db_statistics.ts:421`

**Step 1: Test**
```ts
import { describe, expect, it } from "vitest";
import { resolveBaselineRestingHr } from "./resting-hr";

describe("resolveBaselineRestingHr", () => {
  it("falls back to 60 without data", () => expect(resolveBaselineRestingHr([])).toBe(60));
  it("ignores null and implausible values", () => expect(resolveBaselineRestingHr([{ restingHeartRate: null }, { restingHeartRate: 5 }, { restingHeartRate: 180 }, { restingHeartRate: 52 }])).toBe(52));
  it("uses the median", () => expect(resolveBaselineRestingHr([{ restingHeartRate: 50 }, { restingHeartRate: 70 }, { restingHeartRate: 54 }])).toBe(54));
});
```
**Step 2:** → FAIL. **Step 3: Implementa**
```ts
export const DEFAULT_RESTING_HR = 60;
/** Median of plausible resting heart rates (30-120 bpm); 60 when none is available. */
export function resolveBaselineRestingHr(activities: Array<{ restingHeartRate?: number | null }>): number {
  const values = activities
    .map((a) => a.restingHeartRate)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 30 && v <= 120)
    .sort((a, b) => a - b);
  if (values.length === 0) return DEFAULT_RESTING_HR;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : Math.round((values[mid - 1] + values[mid]) / 2);
}
```
In `db_statistics.ts:421`: `const baselineRestingHR = resolveBaselineRestingHr(currentActivities);`

**Step 4:** PASS, suite verde. **Step 5: Commit** `git add -A && git commit -m "fix(stats): derive resting HR baseline from recent activities"`

---

## Task 15: Sidebar del feed senza mock

**Files:**
- Modify: `client/src/lib/ui-view-models/feed-sidebar.ts` (togliere `mockSectionsEnabled`, `STITCH_WHO_TO_FOLLOW_MOCK`, `STITCH_CLUB_HUB_ITEMS_MOCK`; `clubHub: []` sempre; spostare `STITCH_FEED_FOOTER_LINKS` in una costante locale `FEED_FOOTER_LINKS`)
- Delete: `client/src/mocks/stitch/feed-sidebar.ts` (e la cartella `mocks/stitch` se resta vuota)
- Modify: `client/src/components/social/FeedSidebar.tsx:107-110` (chiamata senza flag; rimuovere il blocco "Club Hub" 160-176 che ora è sempre vuoto)
- Modify: `client/src/lib/feature-flags.ts:19` (togliere `mockSections`), `.env.example` (`VITE_UI_MOCK_SECTIONS` se presente)
- Test: cercare `grep -rn "feed-sidebar\|mockSections" client/src --include=*.test.*` e aggiornare

**Step 1:** Applicare. **Step 2:** `pnpm check && pnpm lint && pnpm test` → verde. **Step 3: Commit** `git commit -am "chore(feed): drop sidebar mock data"`

---

## Task 16: Verifica finale e consegna

**Step 1:** `pnpm check && pnpm lint && pnpm test && pnpm build` → tutto verde; annotare il numero finale di test nel messaggio di consegna.

**Step 2:** `git grep -n -i -E "season|stories|ghost" -- client server shared | grep -v -E "schema.ts|db.ts|auth.router.ts|history|storage"` → nessuna riga residua inattesa.

**Step 3:** Avvio locale `pnpm dev` con `.env.local` del proprietario e checklist manuale: login email, login Google, feed, DM, attività, badge, classifica, sfide, obiettivi (creazione e migrazione da localStorage), statistiche, profilo, logout.

**Step 4:** Push del branch; aprire una PR `android/phase-0 → main` con il riepilogo e i numeri di test. Il merge (che deploya su Oracle) lo decide il proprietario. Dopo il merge: rimuovere il job `cleanup-expired-stories` dallo scheduler Oracle (manuale).

**Step 5:** Aggiornare `docs/ANDROID_APP_PLAN.md` §5 marcando la fase 0 come completata, con data.

---

## Task 17 (aggiunto il 27/10 dopo l'approvazione, su richiesta del proprietario): python-garminconnect 0.3.20 e stato MFA persistente

**Perché qui:** il gate della Fase 1 richiede una sync Garmin funzionante dall'app; la 0.3.5
pinnata soffre del login mobile che rispondeva 429 da aprile (riparato nella 0.3.20) e perde
lo stato MFA a ogni riavvio del container.

**Files:**
- Modify: `garmin-service/requirements.txt` (`garminconnect==0.3.20`; `curl_cffi` arriva come dipendenza)
- Modify: `garmin-service/main.py` — `save_client_tokens` (264-276): usare solo l'API pubblica `client.login(tokenstore=<dir utente>)` per leggere/scrivere i token (la libreria salva `garmin_tokens.json` con 0600 nella dir indicata) e togliere i rami `client.client.dump` / `client.garth.dump`; `pending_mfa` (55-60, 441-451, 507-572): salvare il `client_state` restituito da `login()` nel token store cifrato per utente (stesso meccanismo dei token, chiave già usata dal servizio o `GARMIN_STATE_KEY` via Fernet della dipendenza `cryptography`), con TTL 10 minuti, e in `/auth/mfa` ricaricarlo da disco se non è in memoria, poi `Garmin().resume_login(client_state, code)`; cancellare il file a login completato o scaduto
- Create: `garmin-service/mfa_state.py` (funzioni pure: `serialize_state(state, now) -> bytes`, `load_state(blob, now, ttl) -> dict | None`) e `garmin-service/test_mfa_state.py` (pytest: round-trip, scadenza, blob corrotto → None)
- Modify: `garmin-service/GARMIN_AUTH_NOTES.md` — sostituire le note su garth con: versione 0.3.20, flusso `return_on_mfa` + `resume_login` cross-process, errori 427 = blocco Garmin (non ritentare in loop), Python ≥ 3.12

**Step 1:** scrivere `test_mfa_state.py` e vederlo fallire: `cd garmin-service && /home/scima/.local/opt/garminconnect-venv/bin/python -m pytest -q` (installare `pytest` nel venv se manca: `pip3 --python /home/scima/.local/opt/garminconnect-venv/bin/python install pytest`).

**Step 2:** implementare `mfa_state.py`; test verdi.

**Step 3:** aggiornare `main.py` e `requirements.txt`; verificare l'import con il venv 0.3.20: `cd garmin-service && /home/scima/.local/opt/garminconnect-venv/bin/python -c "import main"` (deve caricare senza errori con le env minime del servizio).

**Step 4:** `docker build -t swimforge-garmin:test garmin-service/` → build OK (immagine `python:3.12-slim`, `curl_cffi` ha wheel manylinux).

**Step 5:** prova reale a carico del proprietario in locale: login con MFA, riavvio del processo tra `/auth/login` e `/auth/mfa`, sync di un'attività. Non eseguire login automatici ripetuti: un 427 indica blocco Garmin.

**Step 6: Commit** `git add -A && git commit -m "feat(garmin): upgrade python-garminconnect to 0.3.20 and persist MFA state"`
