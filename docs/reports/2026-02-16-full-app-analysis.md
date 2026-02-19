# SwimForge - Analisi Completa Web App

**Data:** 16 Febbraio 2026
**Scope:** UI/UX, Sicurezza, Architettura, Performance, Data Model
**Ambiente:** Render (frontend + backend) + Supabase (DB) + Redis (cache/rate-limit) + ImageKit (media) + Rollbar (error tracking)

---

## Indice

1. [UI/UX & Design System](#1-uiux--design-system)
2. [Sicurezza](#2-sicurezza)
3. [Architettura & Qualit&agrave; Codice](#3-architettura--qualità-codice)
4. [Performance & Infrastruttura](#4-performance--infrastruttura)
5. [Data Model & Business Logic](#5-data-model--business-logic)
6. [Piano d'Azione Prioritizzato](#6-piano-dazione-prioritizzato)

---

## 1. UI/UX & Design System

### 1.1 Punti di Forza

| Area | Stato | Note |
|------|-------|------|
| Design tokens (OKLch color space) | Eccellente | CSS vars ben organizzati con light/dark theme |
| Componenti Radix/shadcn (80+ file) | Eccellente | CVA per button variants, data-slot attributes |
| Responsive design | Eccellente | Mobile-first, breakpoints coerenti (sm/md/lg/xl) |
| Code splitting | Eccellente | 36 pagine lazy-loaded con Suspense |
| Loading/empty states | Eccellente | Skeleton shimmer, empty feed CTA, pull-to-refresh |
| Animazioni | Buono | Framer Motion con `useReducedMotion` rispettato |
| Navigazione e routing | Eccellente | 41 route con redirect legacy, deep linking |
| Error boundary | Buono | Chunk reload automatico, loop prevention |

### 1.2 Problemi

#### CRITICO - Nessun sistema i18n

- Tutte le stringhe UI hardcoded in italiano
- Alcune date formattate con `en-US` (`Activities.tsx:57`) invece di `it-IT`
- Nessuna libreria i18n (react-i18next o simile)
- **Impatto:** Impossibile supportare altre lingue senza refactoring completo

#### IMPORTANTE - Accessibilit&agrave;

- Aria-label mancanti su form input e elementi interattivi in vari componenti
- `aria-current="page"` presente nella nav (`app-shell.tsx:101`) ma mancante in altre aree
- Contrasto colori neon (electric-cyan, electric-lime) da testare con WCAG AA/AAA
- Feed post images con `alt=""` vuoto invece di descrizione o `aria-hidden`

#### MINORE

- `NotFound.tsx` usa colori inline `oklch(...)` invece di CSS variables
- Funzioni `formatDistance()`, `formatDuration()` duplicate in pi&ugrave; pagine invece di usare `lib/format.ts`
- Header mostra "Neon Soft Dark" (nome tema) - potrebbe confondere gli utenti
- Manca `will-change` hint per elementi animati frequentemente

---

## 2. Sicurezza

### 2.1 Problemi Critici

#### 2.1.1 `fixBadgeUrls` esposto come `publicProcedure`

- **File:** `server/routers/admin.router.ts:129-131`
- **Descrizione:** Endpoint che esegue `UPDATE profile_badges SET badge_image_url = ...` accessibile senza NESSUNA autenticazione
- **Impatto:** Chiunque pu&ograve; chiamare questo endpoint e modificare dati nel database
- **Fix:** Cambiare a `protectedProcedure` + admin role check

```typescript
// ATTUALE (VULNERABILE)
fixBadgeUrls: publicProcedure.mutation(async () => {
    const { fixBadgeUrls } = await import("../fix_badge_urls");
    return await fixBadgeUrls();
})

// FIX
fixBadgeUrls: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
    const { fixBadgeUrls } = await import("../fix_badge_urls");
    return await fixBadgeUrls();
})
```

#### 2.1.2 `recalculateAllProgress` senza admin check

- **File:** `server/routers/challenges.router.ts:83-101`
- **Descrizione:** Usa `protectedProcedure` (autenticato) ma non verifica il ruolo admin
- **Impatto:** Qualsiasi utente loggato pu&ograve; triggerare ricalcoli massivi su tutte le sfide
- **Fix:** Aggiungere `if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" })`

### 2.2 Problemi Alti

#### 2.2.1 Token JWT con scadenza 1 anno

- **File:** `server/routers/auth.router.ts:35,65,159` + `shared/const.ts:2`
- **Descrizione:** `ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365` usato come default per tutti i token
- **Impatto:** Token compromesso = accesso per un anno intero
- **Raccomandazione:** Ridurre a 1-2 ore + implementare refresh token pattern

### 2.3 Problemi Medi

| # | Problema | File | Dettaglio |
|---|----------|------|-----------|
| 1 | Login accetta `.min(1)` per password | `auth.router.ts:49` | Registrazione richiede `.min(6)`, incoerente |
| 2 | CSP: `scriptSrc` include `cdn.jsdelivr.net` senza SRI | `security.ts:176` | Rischio script injection da CDN compromesso |
| 3 | CSP: `unsafe-inline` per stili | `security.ts:177` | Riduce protezione XSS |
| 4 | CSP: `imgSrc`/`mediaSrc` con `https:` wildcard | `security.ts:179-180` | Qualsiasi dominio HTTPS permesso |
| 5 | DB SSL con `rejectUnauthorized: false` | `db.ts:49` | Certificato server non verificato |
| 6 | CORS dev mode accetta richieste senza Origin | `security.ts:149` | Solo in development |
| 7 | bcryptjs versione potenzialmente problematica | `package.json` | v3.0.3 vs stable 2.4.3 |

### 2.4 Punti Positivi

- Cookie: `httpOnly: true`, `secure: true`, `sameSite: "lax"` (`cookies.ts:42-47`)
- Rate limiting Redis-backed con 6 limiter specializzati (login, registration, API, garmin, AI, comments)
- Token version invalidation per logout globale (`logoutAllDevices`)
- Input validation Zod su tutti i router tRPC
- Query parametrizzate Drizzle ORM (nessuna SQL injection trovata)
- `sanitize-html` per XSS prevention (solo tag `b,i,em,strong,p,br` permessi)
- Magic number detection per upload file (JPEG/PNG/WEBP signatures)
- Image resizing con Sharp (max 1080x1920 stories, 1920x1080 profilo)
- ImageKit token HMAC-SHA1 con scadenza 10 minuti e folder per-user
- Health endpoint esclusi dal rate limiting
- Env vars critiche obbligatorie in produzione (`requireEnv` throws in prod)
- Nessun secret committato nel repository

---

## 3. Architettura & Qualit&agrave; Codice

### 3.1 Struttura Progetto

```
swimforge-oppidum-cloud/
├── client/src/                    # React frontend (Vite)
│   ├── pages/                     # 36 page components (lazy loaded)
│   ├── components/                # 100+ UI e feature components
│   │   ├── app/                   # Layout (AppShell)
│   │   ├── ui/                    # Radix/shadcn (80+ file)
│   │   ├── social/                # Feed, post, commenti
│   │   ├── club/                  # Club components
│   │   ├── dashboard/             # Dashboard widgets
│   │   └── ...
│   ├── lib/                       # 9 utility files (trpc, format, sanitize)
│   ├── hooks/                     # 3 custom hooks
│   └── contexts/                  # ThemeContext
├── server/                        # Node.js/Express backend
│   ├── _core/                     # 21 core infrastructure files
│   ├── routers/                   # 10 tRPC domain routers
│   ├── middleware/                # 4 middleware files
│   ├── lib/                       # 10 utility libraries
│   ├── db_*.ts                    # 15+ database layer files
│   └── cron_*.ts                  # Cron job logic
├── drizzle/                       # Schema + migrations
├── shared/                        # const, types, errors
└── tests/                         # 5 test files
```

**Valutazione:** Stack moderno e ben organizzato (React 19, Vite 7, tRPC 11, Drizzle 0.44, TypeScript 5.9)

### 3.2 Problemi Critici

#### 3.2.1 ClubDetail duplicato

- `client/src/pages/ClubDetail.tsx` - **1,875 righe** (vecchio, non pi&ugrave; usato)
- `client/src/pages/ClubDetailEnhanced.tsx` - **855 righe** (nuovo, importato da App.tsx)
- **Fix:** Eliminare `ClubDetail.tsx`

#### 3.2.2 Test coverage < 5%

Solo 5 file di test per 100+ componenti e 15+ moduli backend:

1. `tests/xp.test.ts`
2. `server/lib/redis-rate-limit-store.test.ts`
3. `server/auth.logout.test.ts`
4. `server/garmin.test.ts`
5. `client/src/components/ui/button.test.tsx`

**Aree completamente non testate:** auth flow, database layer, tRPC procedures, rendering componenti, error handling

#### 3.2.3 39 istanze di `as any`

- 20 file server + 19 file client
- Riduce significativamente la type safety nonostante `strict: true` nel tsconfig
- **Effort stimato:** 6-8 ore per sostituirli con tipi corretti

### 3.3 Problemi Medi

| # | Problema | Dettaglio |
|---|----------|-----------|
| 1 | 15+ file `db_*.ts` con logica sovrapposta | `db_social.ts` + `db_social_enhanced.ts` hanno overlap |
| 2 | 3 cron endpoint con auth logic duplicata | `index.ts:94-184` - estrarre in middleware |
| 3 | Nessuna documentazione architetturale | N&eacute; schema docs n&eacute; architecture docs |
| 4 | 3 pattern di notifica diversi | `NotificationBell`, `BadgeUnlockNotification`, `ActivityInsightNotification` |

### 3.4 Punti di Forza

- tRPC + Zod = API type-safe end-to-end
- Error handling strutturato: Winston logger, circuit breaker DB, Rollbar
- Code splitting su tutte le 36 pagine con ErrorBoundary per chunk failures
- `_shared.ts` centralizza re-export comuni tra router
- Cookie management sicuro con session token versioning
- Circuit breaker pattern con retry esponenziale per DB connection

---

## 4. Performance & Infrastruttura

### 4.1 Database Performance

#### CRITICO - Indici mancanti

Nessun indice esplicito dichiarato nello schema Drizzle (oltre a PK e unique). Colonne da indicizzare:

| Tabella | Colonna | Motivazione |
|---------|---------|-------------|
| `social_posts` | `user_id` | Feed utente |
| `social_posts` | `club_id` | Feed club |
| `social_posts` | `created_at DESC` | Feed globale |
| `swimming_activities` | `user_id, activity_date DESC` | Stats, feed |
| `social_comments` | `post_id` | Commenti per post |
| `story_reactions` | `story_id` | Aggregazione reazioni |
| `story_views` | `story_id` | Conteggio views |
| `xp_transactions` | `user_id, created_at DESC` | Audit XP |
| `user_badges` | `user_id` | Badge utente |

**Impatto stimato:** -40% a -60% latenza query

#### ALTO - N+1 Query nel feed

- `db_social.ts:39-95` - Feed query con 5+ LEFT JOIN e subquery nested
- `db_stories.ts:77-96` - `getActiveStories()` aggrega in memoria invece che nel DB
- `db_stories.ts:433,471` - Query individuali per nomi attori invece di batch

#### MEDIO - Pool connessioni

- `db.ts:47-54` - Pool max=10, min=1, idle 30s, connect timeout 5s
- Potenziale bottleneck sotto carico
- Non configurabile via env var

### 4.2 API & Backend

| Problema | Priorit&agrave; | Dettaglio |
|----------|----------|-----------|
| Cron cleanup stories seriale | P0 | Delete ImageKit una alla volta, no parallelismo |
| AI skill evaluation senza paginazione | P1 | Loop su tutti gli utenti |
| `express.json({ limit: "50mb" })` | P2 | Pu&ograve; bloccare event loop |
| Nessun APM | P2 | No query timing, no endpoint latency tracking |
| Nessun distributed lock per cron | P2 | Esecuzioni duplicate se multiple istanze |

### 4.3 Frontend Bundle

| Problema | Priorit&agrave; | Dettaglio |
|----------|----------|-----------|
| Nessuna config `manualChunks` in Vite | P2 | Vite default splitting |
| Dipendenze pesanti | P2 | Framer Motion ~1.3MB, Recharts, 16+ Radix packages |
| Lucide-react icon set intero | P3 | Tree-shaking parziale |
| Bundle stimato > 300KB pre-gzip | P3 | |

### 4.4 Caching (Redis)

**TTL configurati:**

| Risorsa | TTL | Valutazione |
|---------|-----|-------------|
| Attivit&agrave; | 60s | Appropriato |
| Leaderboard | 120s | Appropriato |
| Profilo | 1800s (30min) | Appropriato |
| User stats | 300s (5min) | Appropriato |
| Badge | 86400s (24h) | Appropriato |

**Punti di forza:** Distributed lock anti-stampede, graceful degradation se Redis down

**Problemi:**
- Nessuna metrica cache hit/miss
- Invalidazione non proattiva su update profilo
- Cache log a livello INFO (potenzialmente spam)

### 4.5 Monitoring

**Presente:**
- Winston logger con file rotation (10MB max, 10 file)
- Rollbar per error tracking in produzione
- Health check `/health` (DB, Redis, Garmin, storage)
- Readiness probe `/ready` (Kubernetes-compatible)

**Mancante:**
- APM (Application Performance Monitoring)
- SQL query timing
- Endpoint latency tracking
- Redis pool metrics
- Log level configurabile via env var

### 4.6 Real-time (Supabase)

- `NotificationBell.tsx`, `DirectMessages.tsx` usano `.subscribe()`
- Nessun cleanup esplicito su unmount visibile (rischio memory leak)
- Ogni componente sottoscrive indipendentemente (no multiplexing)
- Nessun fallback polling se realtime fallisce

---

## 5. Data Model & Business Logic

### 5.1 Schema Overview

**38 tabelle** organizzate in 7 domini:

| Dominio | Tabelle | Note |
|---------|---------|------|
| Auth & Profili | 4 | users, swimmerProfiles, garminTokens, stravaTokens |
| Attivit&agrave; | 6 | swimmingActivities, laps, lengths, ghost, weeklyStats, records |
| Gamification | 6 | badgeDefinitions, userBadges, achievements, xpTransactions, levels |
| Social | 9 | posts, splashes, comments, follows, hidden, reports, reactions, stories |
| Club | 7 | clubs, members, invites, events, attendees, announcements, media |
| Notifiche & Messaggi | 2 | notifications, directMessages |
| AI/Cache | 3 | insightsCache, activityInsights, workouts |

### 5.2 Problemi Critici

#### 5.2.1 80+ Foreign Key mancanti

Solo **3 FK** definite nell'intero schema (tutte su garmin laps/lengths). Mancano FK per:

- `socialPosts.userId` → `users`
- `socialPosts.activityId` → `swimmingActivities`
- `socialPosts.clubId` → `communityClubs`
- `socialComments.postId` → `socialPosts`
- `communityClubMembers.clubId` → `communityClubs`
- `communityClubMembers.userId` → `users`
- `userBadges.userId` → `users`
- `xpTransactions.userId` → `users`
- ... e circa 70+ altre relazioni

**Impatto:** Eliminando un record padre, i record figli restano orfani nel database

#### 5.2.2 `deleteUserAccount()` incompleto - Rischio GDPR

**File:** `server/db.ts:962-1003`

La funzione cancella SOLO:
1. `social_hidden_posts` (dove `user_id = userId`)
2. `social_post_reports` (dove `reporter = userId`)
3. `users` (il record utente)

**Dati personali NON cancellati:**
- `swimmingActivities` (attivit&agrave; dell'utente)
- `socialPosts` (post dell'utente)
- `socialComments` (commenti)
- `socialSplashes` (like)
- `socialFollows` (follower/following)
- `stories` (con file ImageKit)
- `directMessages` (messaggi privati)
- `communityClubMembers` (membership)
- `userNotifications` (notifiche)
- `userBadges`, `xpTransactions`, `personalRecords`
- ... e 20+ altre tabelle

#### 5.2.3 Race condition su `weeklyStats`

**File:** `server/db.ts` (updateWeeklyStats)

Pattern read-modify-write senza lock:
```typescript
const existing = await getWeeklyStats(userId, weekStart);
if (existing) {
  await db.update(weeklyStats).set({
    sessionsCount: existing.sessionsCount + sessions, // RACE CONDITION
  })
}
```

**Fix:** Usare `SET col = col + val` atomico in SQL

### 5.3 Problemi Alti

| # | Problema | Dettaglio |
|---|----------|-----------|
| 1 | Soft delete post non cascata | Commenti, reazioni, report restano su post con `isDeleted=true` |
| 2 | Story cleanup non idempotente | File ImageKit non ritentati se delete fallisce - restano per sempre |
| 3 | Nessun sistema di blocking | Utenti non possono bloccare follower indesiderati |
| 4 | Nessuna privacy a livello DB | `privacySettings` &egrave; un campo JSON, nessun enforcement in query |
| 5 | Notifiche best-effort | Errori silenziati con try/catch vuoto, nessun retry |

### 5.4 Problemi Medi

| # | Problema | Dettaglio |
|---|----------|-----------|
| 1 | XP exploitabile | Attivit&agrave; manuali senza validazione pace realistica |
| 2 | Report senza auto-action | N report non nascondono automaticamente il post |
| 3 | Nessun sistema ban/timeout | Report non prevengono ulteriori post |
| 4 | Re-report resetta status | `onConflictDoUpdate` riapre report risolti |
| 5 | Story cleanup limitato a 2000/run | Backlog possibile se cron salta |
| 6 | Nessun audit trail per azioni admin | Cambio ruoli club non loggato |

### 5.5 Punti di Forza

- **Unique constraints** su tutte le tabelle many-to-many (no double-splash, no double-follow, etc.)
- **Conflict resolution** ben implementata (`onConflictDoNothing`, `onConflictDoUpdate`)
- **Promozione automatica** del membro pi&ugrave; anziano quando lo staff lascia un club
- **Report workflow** completo (open → in_review → resolved/rejected)
- **Token version** per invalidazione sessioni globale
- **Enum ben definiti** (roles, stroke types, badge categories, XP reasons)
- **Cascade delete** su garmin laps/lengths

### 5.6 Flusso Dati: Attivit&agrave; → XP

```
Utente crea attivit&agrave;
  ↓
[swimmingActivities] insert con xpEarned
  ↓
[xpTransactions] audit entry (reason: activity)
  ↓
[swimmerProfiles] totalXp += xpEarned
  ↓
[levelThresholds] check level up
  ↓
checkAndAwardBadges()
  ↓ (se badge sbloccato)
[userBadges] insert
[xpTransactions] audit entry (reason: badge)
[swimmerProfiles] totalXp += badgeXpReward
```

### 5.7 Flusso Dati: Cancellazione Utente (INCOMPLETO)

```
deleteUserAccount(userId)
  ↓
DELETE social_hidden_posts (user_id)
  ↓
DELETE social_post_reports (reporter/handler)
  ↓
DELETE users (id)
  ↓
[DATI ORFANI - 30+ tabelle]
├── swimmingActivities
├── socialPosts, socialComments, socialSplashes
├── socialFollows
├── stories (+ file ImageKit non cancellati)
├── directMessages
├── communityClubMembers
├── userNotifications
├── userBadges, xpTransactions
└── ... 20+ altre tabelle
```

---

## 6. Piano d'Azione Prioritizzato

### Immediato (questa settimana)

| # | Azione | Tipo | File | Effort |
|---|--------|------|------|--------|
| 1 | Fix `fixBadgeUrls`: `publicProcedure` → `protectedProcedure` + admin check | Sicurezza | `admin.router.ts:129` | 10 min |
| 2 | Fix `recalculateAllProgress`: aggiungere admin role check | Sicurezza | `challenges.router.ts:83` | 10 min |
| 3 | Completare `deleteUserAccount()` con cascade su tutte le tabelle | GDPR | `db.ts:962` | 2-3h |
| 4 | Eliminare `ClubDetail.tsx` (vecchio, non usato) | Cleanup | `pages/ClubDetail.tsx` | 5 min |
| 5 | Aggiungere indici DB sulle FK principali (migration SQL) | Performance | `drizzle/` | 1h |
| 6 | Fix race condition `weeklyStats` (atomic increment) | Data integrity | `db.ts` | 30 min |

### A breve (2-4 settimane)

| # | Azione | Tipo | Effort |
|---|--------|------|--------|
| 7 | Ridurre JWT expiration (1-2h) + refresh token | Sicurezza | 4-6h |
| 8 | Enforcement password minimo 8 char su login | Sicurezza | 15 min |
| 9 | Restringere CSP `imgSrc`/`mediaSrc` a domini specifici | Sicurezza | 30 min |
| 10 | Aggiungere FK constraints (migration con validazione dati) | Data integrity | 4-6h |
| 11 | Rimuovere 39 `as any` con tipi corretti | Type safety | 6-8h |
| 12 | Consolidare `db_social.ts` + `db_social_enhanced.ts` | Manutenibilit&agrave; | 4-6h |
| 13 | Batch processing per cron cleanup stories (parallelize ImageKit deletes) | Performance | 2-3h |
| 14 | Cascade soft-delete post (pulire commenti/reazioni) | Data integrity | 2h |

### Medio termine (1-2 mesi)

| # | Azione | Tipo | Effort |
|---|--------|------|--------|
| 15 | Portare test coverage dal 5% al 30-50% | Affidabilit&agrave; | 2-4 settimane |
| 16 | Ottimizzare bundle Vite (manual chunks, tree-shaking) | Performance | 4-6h |
| 17 | Aggiungere APM monitoring (New Relic/Datadog) | Observability | 4h |
| 18 | Pool DB configurabile via env var, aumentare a 30-50 in prod | Scalabilit&agrave; | 2h |
| 19 | Implementare sistema di blocking utenti | Privacy | 8-12h |
| 20 | Validazione pace attivit&agrave; manuali | Anti-cheat | 2h |
| 21 | Auto-hide post con N+ report | Moderazione | 4h |
| 22 | Retry mechanism per ImageKit file deletion | Affidabilit&agrave; | 3h |
| 23 | Distributed lock per cron jobs (Redis) | Scalabilit&agrave; | 3h |

### Lungo termine

| # | Azione | Tipo | Effort |
|---|--------|------|--------|
| 24 | Implementare i18n (react-i18next) | Internazionalizzazione | 2-3 settimane |
| 25 | Queue-based notifications (Redis Bull) | Affidabilit&agrave; | 1-2 settimane |
| 26 | GDPR data export API | Compliance | 1 settimana |
| 27 | Supabase realtime connection pooling + polling fallback | Scalabilit&agrave; | 1 settimana |
| 28 | Accessibility audit completo (WCAG AA) | A11y | 1-2 settimane |

---

## Impatto Stimato

Se implementati i fix P0 + P1 (punti 1-14):

| Metrica | Miglioramento stimato |
|---------|----------------------|
| Latenza query DB | -40% a -60% |
| Tempi risposta API | -20% a -30% |
| Tempo esecuzione cron | -50% a -70% |
| Vulnerabilit&agrave; critiche | Da 2 a 0 |
| Rischio GDPR | Eliminato |
| Data integrity | Significativamente migliorata |

---

*Report generato tramite analisi statica del codice. Nessuna modifica applicata al codebase.*
