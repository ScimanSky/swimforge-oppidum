# Fase 0 — Pulizia e base mobile: design (27 ottobre 2026)

Stato: **approvato dal proprietario il 27/10/2026** ("Sì, ma solo il piano": piano scritto,
esecuzione da avviare su richiesta). Contesto: `docs/ANDROID_APP_PLAN.md` §3-§5.

## Decisioni che vincolano il design

| Tema | Decisione |
|---|---|
| Architettura app | Capacitor sul client React esistente |
| Gamification | Restano XP, livelli, badge del badge engine, classifiche. Via stagioni, battle pass, missioni, weekly focus, predizioni, club quest, recap Remotion, core loop v2 |
| Badge di stagione | Eliminati (non trasformati) |
| Storie 24h | Rimosse (UI, router, cron, inoltro nei DM). Tabelle conservate |
| Ghost track | Rimosso |
| Meet, storia club, automazioni AI club | Restano dietro i flag spenti, nessun intervento |
| Home "Oggi" | Fase 3, non qui |
| Dati | Nessuna migrazione distruttiva: le tabelle delle funzioni rimosse restano nel DB |

## 1. Dove si lavora

- Branch `android/phase-0` da `main`, pushato su `origin` a ogni commit.
- **Mai su `main` prima della fine**: `.github/workflows/deploy-oracle.yml` deploya in
  produzione a ogni push su `main` (docker compose su Oracle, health check su
  `https://swimforge.it/ready`). `DEPLOYMENT.md` parla ancora di Render ed è obsoleto.
- Merge su `main` solo con `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm build` verdi e
  dopo la prova manuale del proprietario in locale.
- Baseline misurata il 27/10: typecheck pulito, 40 file di test, 216 test verdi in 17 s.

## 2. Rimozioni

Ordine: dal più isolato al più intrecciato, un commit per blocco, test verdi a ogni commit.

1. **Codice morto** confermato senza import (pagine Dashboard, SessionInsights,
   CoachDryland, ClubDetail, ComponentShowcase, Auth; componenti Map, dashboard/*,
   StatisticsAccordion, landing/*, MobileNav, app-bottom-nav, ManusDialog,
   BubbleAnimation, MetricBox, MetricCard, StravaSection, club/ClubAnnouncementsTab,
   ClubEventsTab, ClubGalleryTab, ClubStatsTab, social/StoryBar,
   social/InfiniteScrollSentinel; hooks useComposition, useMobile; lib/sanitize) più la
   cascata di orfani verificata con uno script di grep (hooks/usePersistFn,
   next/navigation, brand/SwimForgeBrand, primitivi `ui/*` non più importati).
2. **Ghost track**: tab e componente, procedure `ghostChallenges` e `ghostTrack`,
   `db_ghost_challenges.ts`, eventi analytics. La tab predefinita di Sfide diventa
   "classic".
3. **XP per azioni social** spostato da `season_engagement.ts` a un modulo autonomo
   `server/xp_actions.ts` con le stesse regole (comment 16, splash 10, reaction 8,
   rsvp 12, club_post 20, cap 90/giorno, descrizione `action_xp:<giorno>:<tipo>:<id>`),
   senza `ensureSeasonEngagementSchema`. Chiamanti: community.router, reactions.router,
   clubs.router.
4. **Stagioni, server**: `season.ts`, `season_engagement.ts`, `seasonRouter`,
   `videoRouter.seasonRecap`, costanti, export in `_shared.ts`, mount in
   `routers/index.ts`, test `season_*.test.ts`. Le cancellazioni di righe delle tabelle
   runtime `season_activity_predictions` e `season_club_quest_claims` in `db.ts` e
   `auth.router.ts` restano, protette da try/catch perché le tabelle possono non esistere.
5. **Stagioni, client**: `Season.tsx`, `SeasonLaunchPopup`, `seasonBadgeImages`,
   `video/SeasonRecap*`, `season-recap-constants`; riferimenti in App, Badges,
   BadgeUnlockWatcher, Profile, Activities, Challenges, OnboardingFlow,
   OnboardingNudgeManager, AutoSync, product_analytics, feature-flags, app-shell.
   Remotion resta perché l'onboarding lo usa.
6. **Route**: `/challenges`, `/leaderboard`, `/goals` diventano canoniche; `/season/*`,
   `/dashboard`, `/home/dashboard` restano come redirect.
7. **Storie, server**: `community.stories.router.ts`, `db_stories.ts`, cron
   `/api/cron/cleanup-expired-stories`, procedure admin, inoltro `forward_story`,
   `community.forwarding.ts`, scope Cloudinary "stories", union `messageType`. Le
   cancellazioni delle righe storie nell'eliminazione account restano (privacy).
8. **Storie, client**: componenti, `social-feed-stories.ts`, SocialFeed, CreatePostSheet,
   app-shell (`showHeaderStories`), DirectMessages, ForwardContentDialog, AdminReports;
   test aggiornati o eliminati.
9. **Config e docs**: variabili `VITE_SEASON_*` dagli `.env.example`, lista cron in
   `DEPLOYMENT.md`, nota Oracle vs Render.

## 3. Base per il nativo

- **Server**: `sdk.authenticateRequest` accetta `Authorization: Bearer <session JWT>`
  e lo preferisce al cookie quando presente. La verifica è la stessa (`verifySession`,
  `tokenVersion`). Il controllo CSRF (`trpc.ts`) salta quando c'è un Bearer: il browser
  non aggiunge mai da solo quell'header, e una fetch cross-site con header custom passa
  dal preflight CORS, che resta chiuso alle origini non consentite. Il context non emette
  il cookie CSRF quando l'auth arriva dall'header. `syncSupabaseUser` restituisce anche
  `sessionToken` solo se la richiesta porta `x-swimforge-client: native`.
- **CORS**: origini `https://localhost` e `capacitor://localhost` aggiunte al default di
  `ALLOWED_ORIGINS`; header `x-swimforge-client` consentito.
- **Client**: `lib/platform.ts` (`isNativePlatform()` legge `window.Capacitor`, quindi
  oggi è false e diventa true da sola in fase 1), `lib/session-token.ts` (token in
  localStorage sotto `swimforge:nativeSessionToken`, in fase 1 passerà a Preferences),
  `lib/trpc-headers.ts` (funzione pura che compone gli header: CSRF sul web, Bearer e
  `x-swimforge-client` sul nativo). Login, AuthCallback e Register salvano il token se
  arriva; logout lo cancella.
- **Fuori fase**: ritorno Google OAuth su schema nativo (serve il plugin App), push.

## 4. Correzioni piccole

- **Obiettivi**: tabella `user_goals` (id, user_id, title, category, target_value,
  unit, current_value, created_at, updated_at), migrazione `0033_add_user_goals`,
  `server/db_goals.ts`, router `goals` (list, create, update, remove), `Goals.tsx` passa
  a tRPC con migrazione una tantum dei goal trovati in localStorage.
- **FC a riposo**: `server/lib/resting-hr.ts` calcola la mediana dei `restingHeartRate`
  validi (30-120) delle attività del periodo, fallback 60; usato in `db_statistics.ts`.
- **Sidebar feed**: flag `mockSections` eliminato, mock di utenti e club hub eliminati,
  i link del footer restano come configurazione reale.

## 5. Verifica

- Per ogni commit: `pnpm check`, `pnpm lint`, `pnpm test`.
- Test nuovi: `xp_actions` (percorso senza DB e auto-azione), `csrf` (funzione pura),
  Bearer extraction, `syncSupabaseUser` con e senza header nativo, router `goals`,
  `resting-hr`, `trpc-headers`, `session-token`.
- Fine fase: `pnpm build`, avvio locale con `.env.local` e checklist manuale del
  proprietario (login email, login Google, feed, DM, attività, badge, classifica, sfide,
  obiettivi, statistiche, profilo, logout). Poi merge su `main`.
