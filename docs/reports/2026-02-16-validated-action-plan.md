# SwimForge - Piano Operativo Validato (P0/P1)

**Data:** 16 Febbraio 2026  
**Fonte:** Review del report `2026-02-16-full-app-analysis.md` + verifica codice live  
**Obiettivo:** backlog operativo con soli punti confermati o immediatamente riproducibili

---

## P0 (immediato)

### 1) Migrazione DB mancante che rompe feed/post
- **Sintomo:** errori 500 su `community.feed`, `community.clubs.feed`, `community.toggleShare` quando il backend usa `media_urls`, `tagged_user_ids`, `hashtags`.
- **Riferimenti:**
  - `server/db_social.ts`
  - `server/db_clubs.ts`
  - `drizzle/0024_add_post_media_tags_hashtags.sql`
- **Azione:**
  1. Eseguire SQL migration `0024` sul DB Supabase usato da Render.
  2. Verificare colonne in `public.social_posts`.
- **Accettazione:**
  - Nessun 500 su feed globale/club.
  - `toggleShare` e creazione post con media funzionanti.

### 2) Endpoint admin esposto pubblicamente (`fixBadgeUrls`)
- **Rischio:** mutazione dati senza autenticazione.
- **Riferimento:** `server/routers/admin.router.ts:129`
- **Azione:**
  - Cambiare `publicProcedure` in `protectedProcedure`.
  - Aggiungere check `ctx.user.role === "admin"`.
- **Accettazione:**
  - Utente non admin riceve `FORBIDDEN`.
  - Admin può eseguire la mutazione.

### 3) Endpoint “recalculate all challenges” senza role-check admin
- **Rischio:** qualsiasi utente autenticato può triggerare ricalcolo massivo.
- **Riferimento:** `server/routers/challenges.router.ts:84`
- **Azione:** aggiungere check ruolo admin.
- **Accettazione:**
  - Non-admin: `FORBIDDEN`.
  - Admin: job eseguito normalmente.

### 4) Cancellazione account incompleta (rischio dati residui)
- **Riferimento:** `server/db.ts:962`
- **Stato attuale:** la transaction elimina solo subset (`social_hidden_posts`, `social_post_reports`, `users`) e si affida implicitamente alle FK/cascade.
- **Azione:**
  - Definire esplicitamente policy di delete per domini sensibili (DM, notifiche, stories/ImageKit, membership).
  - Aggiungere cleanup esterno best-effort per file media non coperti da cascade DB.
- **Accettazione:**
  - Delete account lascia zero residui personali previsti dalla policy.
  - Log strutturati per cleanup falliti + retry strategy.

### 5) Race condition su update weekly stats
- **Riferimento:** `server/db.ts:752`
- **Problema:** read-modify-write (`existing + delta`) non atomico.
- **Azione:**
  - Passare a update atomico SQL (`SET sessions_count = sessions_count + ...`) con upsert.
- **Accettazione:**
  - Con aggiornamenti concorrenti non si perdono incrementi.
  - Test concorrente ripetibile verde.

---

## P1 (breve termine, 2-4 settimane)

### 6) Session token troppo lungo (1 anno)
- **Riferimenti:**
  - `shared/const.ts:2`
  - `server/routers/auth.router.ts:35`
  - `server/routers/auth.router.ts:65`
- **Azione:**
  - Ridurre TTL access session.
  - Introdurre strategia refresh/rotation.
- **Accettazione:**
  - Sessione lunga supportata via refresh, non via token statico annuale.

### 7) Validazione password incoerente in login
- **Riferimento:** `server/routers/auth.router.ts:49`
- **Azione:** allineare requisiti minimi password su register/login.
- **Accettazione:** policy password consistente su tutti i path auth.

### 8) Hardening CSP
- **Riferimento:** `server/middleware/security.ts:176+`
- **Azione:**
  - Restringere `imgSrc`/`mediaSrc` (evitare wildcard `https:` quando non necessario).
  - Ridurre dipendenze da `unsafe-inline` dove possibile.
- **Accettazione:** CSP più restrittiva senza regressioni funzionali.

### 9) Rimozione codice morto `ClubDetail.tsx`
- **Riferimenti:**
  - `client/src/App.tsx:34` (usa `ClubDetailEnhanced`)
  - `client/src/pages/ClubDetail.tsx` (non route-attivo, 1875 righe)
- **Azione:** eliminare file legacy e riferimenti indiretti.
- **Accettazione:** build/test verdi, nessun import orfano.

### 10) Riduzione `as any` nelle aree critiche
- **Misura attuale:** `112` occorrenze (`rg -o "as any" server client | wc -l`)
- **Azione:**
  - Priorità su auth, router tRPC, feed/social, db layer.
- **Accettazione:** riduzione significativa nelle aree core (target iniziale: -40%).

### 11) Coerenza locale date (`it-IT`)
- **Riferimenti:**
  - `client/src/pages/Activities.tsx:57`
  - `client/src/pages/Activities.tsx:62`
  - `client/src/components/dashboard/header.tsx:13`
  - `client/src/components/dashboard/recent-activities.tsx:53`
- **Azione:** uniformare formatter e centralizzare helper.
- **Accettazione:** UI con formati data/ora coerenti.

### 12) Test minimi su flussi ad alto rischio
- **Azione:**
  - Aggiungere test per:
    - gate admin (`fixBadgeUrls`, `recalculateAllProgress`)
    - feed query con nuovi campi post
    - creazione post con media/tag/hashtag
    - update weekly stats atomico
- **Accettazione:** suite CI copre i regression point introdotti.

---

## Note di validazione rispetto al report originale

### Confermato
- `fixBadgeUrls` pubblico
- `recalculateAllProgress` senza admin-check
- token sessione a 1 anno
- race condition `weeklyStats`
- file club legacy non utilizzato

### Da ridimensionare/correggere
- “FK mancanti” e “indici assenti” non sono totalmente corretti: esistono già molte FK/indici in:
  - `drizzle/migrations/0004_add_foreign_keys.sql`
  - `drizzle/migrations/0005_add_indexes_and_unique.sql`
- realtime cleanup/fallback presenti:
  - `client/src/components/NotificationBell.tsx:93`
  - `client/src/components/DirectMessages.tsx:147`

