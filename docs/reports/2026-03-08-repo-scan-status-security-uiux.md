# Repo Deep Scan Report — Stato, Sicurezza, UI/UX

- **Data scansione:** 2026-03-08
- **Scope:** repository `swimforge-oppidum`
- **Vincolo rispettato:** nessuna modifica al codice applicativo; solo report documentale.

## Metodo di analisi

Analisi svolta su:
1. documentazione strategica/operativa (`docs/ROADMAP.md`, `docs/SWIMFORGE_2_0_GUIDE.md`, report in `docs/reports`);
2. stato implementativo lato server/client (focus su routing, sicurezza middleware, shell UI);
3. check automatici di sicurezza dipendenze (`pnpm audit --prod`) e segreti (`pnpm secrets:scan`).

---

## 1) Stato del repo

### 1a) Esiste una roadmap aggiornata?

**Sì, esiste una roadmap operativa** in `docs/ROADMAP.md`, con orizzonte breve (2-4 settimane e 1-2 mesi) allineato a SwimForge 2.0.

Valutazione aggiornamento:
- roadmap presente e strutturata;
- strategia canonica collegata ai documenti 2.0 (02/03/2026);
- **criticità di manutenzione doc:** i link “definitive guide” e report canonici in roadmap puntano a path assoluti esterni (`/home/scima/projects/...`) e non a path relativi repo, quindi la portabilità documentale è bassa;
- non emerge un changelog successivo al pacchetto strategico 02-03 marzo 2026, quindi “aggiornata” sì sul piano contenutistico di ciclo corrente, ma **non ancora evidenza di refresh successivi**.

**Conclusione 1a:** roadmap esistente e valida come baseline operativa, con miglioramento urgente su qualità dei riferimenti e tracciamento revisioni.

### 1b) Piano d'azione in esecuzione e avanzamento

Il piano d'azione ufficiale è documentato in `docs/reports/swimforge-community-action-plan-2026-03-02.md` (10 settimane) e nella versione unificata a 12 settimane in `docs/reports/2026-03-02-unified-strategy.md`.

**Stato avanzamento inferito dai documenti + codice:**

- **Fase 0 (baseline + pruning):**
  - risulta **completata a livello di setup/reporting iniziale** (`2026-03-02-phase-0-baseline-results.md` del 2026-03-03);
  - baseline disponibile ma con volume dati molto basso (campione ridotto), quindi validità statistica limitata.

- **Fase 1 (identità nuotatore / PB Board):**
  - nel codice sono presenti endpoint e logica coerenti con il deliverable (`setManual`, `getByUser`, `clubLeaderboard`, `finaPoints` nel router gameplay/records);
  - nel report baseline compaiono note che alcuni eventi core-loop sono “non ancora presenti nello snapshot”, segnale che la strumentazione è in rollout o non ancora matura.

- **Fasi successive (Season v2, Ghost Duels 2.0, Club Rituals):**
  - pianificate e dettagliate nei documenti strategici;
  - non emerge, nella documentazione disponibile, un report di avanzamento successivo con KPI robusti che certifichi completamento end-to-end delle fasi oltre la baseline iniziale.

**Stima sintetica avanzamento piano:**
- Fase 0: **done (tecnica), non consolidata (statistica)**
- Fase 1: **in esecuzione / parzialmente implementata**
- Fase 2-3: **pianificate, stato non verificabile come completato dai soli artefatti correnti**

---

## 2) Criticità sulla sicurezza

## 2.1 Vulnerabilità dipendenze (evidenza automatica)

Da `pnpm audit --prod` risultano **6 vulnerabilità** (1 high, 4 moderate, 1 low):

1. **HIGH** — `express-rate-limit` (`>=8.2.0 <8.2.2`): bypass rate limit via IPv4-mapped IPv6.
   - versione in uso: `8.2.1`
   - remediation: upgrade a `>=8.2.2`

2. **MODERATE** — `dompurify` (`>=3.1.3 <=3.3.1`): XSS advisory.
   - versione in uso: `3.3.1`
   - remediation: upgrade a `>=3.3.2`

3. **MODERATE** — `lodash` / `lodash-es` (`<=4.17.22`): prototype pollution advisory.
   - perimetro principalmente transitive deps (es. mermaid/streamdown/recharts chain)
   - remediation: forzare/risolvere a `>=4.17.23`

4. **MODERATE** — `mdast-util-to-hast` (`>=13.0.0 <13.2.1`): unsanitized class attribute.
   - remediation: `>=13.2.1`

5. **LOW** — `qs` (`<=6.14.1`): arrayLimit bypass DoS.
   - remediation: `>=6.14.2`

## 2.2 Sicurezza applicativa (code-level)

**Punti solidi rilevati:**
- middleware security centralizzato con `helmet`, `cors`, rate limiting dedicato per scenari sensibili;
- CSRF check presente su procedure tRPC con confronto cookie/header;
- cookie session/CSRF con `secure` e `sameSite` condizionali su HTTPS;
- `trust proxy` configurato.

**Aree critiche/prioritarie:**
1. **Rate limiting vulnerabile per advisory nota** (vedi punto HIGH): impatto diretto su protezione anti-abuso.
2. **Stack sanitizzazione HTML da aggiornare** (`dompurify` advisory): potenziale impatto XSS su flussi che renderizzano contenuto user-generated.
3. **Debito transitive dependencies** (lodash/mdast/qs): da gestire con override o refresh lockfile per ridurre superficie attacco.

---

## 3) Stato UI/UX

## 3.1 Stato generale

La UI risulta in fase di **restyle strutturato** con piano esplicito (`docs/RESTYLE_IMPLEMENTATION_PLAN.md`):
- token brand “Water + Forge”,
- brand anchor persistente,
- separazione identitaria feed attività vs social,
- coerenza tra landing/auth/app shell,
- backlog di QA cross-device e micro-motion.

Nel codice client si osservano segnali coerenti con questa direzione:
- app shell con navigazione densa e segmentata (home/training/club/profile + quick access);
- naming e titolazione contestuale ampi (molti percorsi coperti);
- componenti social/feed e pattern UI modulari già presenti.

## 3.2 Valutazione UX operativa (in funzione del piano prodotto)

**Positivi:**
- base visual/strutturale matura;
- identità brand più chiara rispetto a uno stile generico fitness;
- architettura componenti ampia per iterazioni rapide.

**Gap UX ancora aperti (coerenti con documentazione):**
1. **Rischio complessità cognitiva**: molte entry point e molte destinazioni rispetto all'obiettivo “pochi rituali inevitabili”.
2. **Core loop non ancora dimostrato da KPI robusti**: baseline indica uso basso e continuità eventi insufficiente.
3. **Backlog UX non bloccante ma importante**: QA cross-device, micro-motion e rifinitura stati vuoti/copy devono essere chiusi per consistenza percepita.

**Sintesi UI/UX:** direzione buona e concreta, ma va strettamente legata al pruning funzionale e alla misurazione retention per evitare regressione in “feature overload”.

---

## Raccomandazioni immediate (priorità)

### P0 (entro 48h)
1. Patch dipendenze ad alto rischio (`express-rate-limit`, `dompurify`) e rieseguire audit.
2. Rendere i riferimenti roadmap/report **relativi al repo** (eliminare path assoluti esterni).

### P1 (entro 1 settimana)
1. Pubblicare un **progress report datato** post-baseline con stato per fase (0/1/2/3) e semaforo KPI.
2. Consolidare event instrumentation continuity (target: pass costante su daily continuity).

### P2 (entro 2 settimane)
1. Riduzione complessità IA/nav in ottica “rituali principali” (UX pruning guidato da dati).
2. Chiusura backlog QA cross-device e verifica accessibilità/contrasto su restyle.

---

## Allegato — comandi usati

- `rg -n "roadmap|piano d'azione|action plan|milestone|todo|backlog|next steps|stato" docs README.md .github -S`
- `pnpm secrets:scan`
- `pnpm audit --prod`
- `rg -n "helmet|cors|rateLimit|csrf|CRON_SECRET|jwt|cookie|secure|origin|xss|sanitize|dangerouslySetInnerHTML|exec\(|child_process|eval\(" server client shared -S`
- `rg -n "trust proxy|app.set\(['\"]trust proxy|helmet\(|applySecurityMiddleware|csrf|issueCsrfCookie" server/_core server -S`

