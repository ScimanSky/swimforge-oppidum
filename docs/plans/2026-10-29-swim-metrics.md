# Metriche di nuoto reali: piano di implementazione

> **Per Claude:** sotto-skill richiesta: superpowers:executing-plans (o subagent-driven-development) per eseguire il piano task per task.

**Obiettivo:** sostituire le metriche inventate di Statistiche e del coach con sei metriche fondate:
passo soglia (CSS), forma e fatica, intensità, Stroke Index, regolarità nelle ripetute, volume.
Il design è in `docs/plans/2026-10-29-swim-metrics-design.md`: leggilo prima, vale quello in caso di
dubbio.

**Architettura:**
- Funzioni pure per metrica in `server/swim_metrics/`.
- Un aggregatore `getSwimMetrics(userId)`, con cache Redis.
- Tipi, definizioni in italiano e utilità di settimana/serie in `shared/swimMetrics.ts`, usati da
  server, coach e client.
- Nuove procedure tRPC in `statistics`; la vecchia `getAdvanced` sparisce.

**Stack:** Express + tRPC 11 + Drizzle 0.45 (Postgres), React 19 + TanStack Query 5 + recharts +
shadcn/ui, vitest/jsdom.

**Regole per chi esegue:**
- Lavora solo in `/home/scima/projects/swimforge-stats` (branch `android/advanced-metrics`).
- Mai `git stash`, in nessuna forma. Non fare push.
- Commit piccoli in inglese, ognuno chiuso dalla riga
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- TDD: prima il test che fallisce.
- Macchina con 7 GB di RAM condivisi con altri agenti:
  - durante il lavoro, `pnpm vitest run <file>`;
  - prima della suite completa e delle build controlla `free -m` e aspetta se la memoria
    disponibile è sotto 2500 MB;
  - suite completa con `pnpm test -- --maxWorkers=2`.
- Testi utente in italiano.

---

## Blocco A: server e coach

### Task A1: contratto condiviso
**Files:** create `shared/swimMetrics.ts`, `shared/swimMetrics.test.ts`.
- **Tipi del risultato**, esattamente questi (i client li importano):
```ts
export const SWIM_METRICS_TIMEZONE = "Europe/Rome";
export type Zones5 = [number, number, number, number, number]; // metres in Z1..Z5
export type CssPoint = { distanceMeters: number; seconds: number; date: string };
export type CssResult = {
  paceSecondsPer100: number; speedMps: number;
  source: "stima" | "test"; confidence: "alta" | "media" | null; // null for a test
  points: CssPoint[]; testDate: string | null;
};
export type TsbReading = "molto_riposato" | "fresco" | "neutro" | "in_costruzione" | "carico_alto";
export type SessionMetrics = {
  activityId: number; date: string; poolLengthMeters: number | null; isOpenWater: boolean;
  distanceMeters: number; movingSeconds: number; hasLaps: boolean;
  intensityFactor: number | null; stss: number | null; zoneMeters: Zones5 | null;
  strokeIndex: number | null; dpsMeters: number | null; strokeRate: number | null; swolf: number | null;
  pacingCv: number | null; pacingFade: number | null;
};
export type SwimMetrics = {
  generatedAt: string;
  sessions: SessionMetrics[]; // last 90 days, oldest first
  css: { current: CssResult | null; history: { month: string; paceSecondsPer100: number | null }[]; missing: string | null };
  load: {
    today: { ctl: number; atl: number; tsb: number; reading: TsbReading } | null;
    rampPerWeek: number | null;
    days: { date: string; stss: number; ctl: number; atl: number; tsb: number }[]; // last 90 days
    missing: string | null;
  };
  intensity: {
    last28: { zoneMeters: Zones5; easyPct: number; mediumPct: number; hardPct: number } | null;
    weeks: { weekStart: string; zoneMeters: Zones5 }[]; // last 8 weeks
    missing: string | null;
  };
  efficiency: {
    poolLengthMeters: number | null; latest: number | null; avg28: number | null;
    baseline: number | null; deltaPct: number | null; missing: string | null;
  };
  pacing: {
    cv28: number | null; fade28: number | null;
    latestSet: { date: string; distanceMeters: number; stroke: string; repSeconds: number[] } | null;
    missing: string | null;
  };
  volume: {
    weeks: { weekStart: string; km: number; sessions: number }[]; // last 12 weeks, oldest first
    avgKm4: number; avgSessions4: number; changePct: number | null; streakWeeks: number;
  };
};
```
- **Definizioni:** `SWIM_METRIC_DEFINITIONS: Record<"css" | "load" | "intensity" | "efficiency" |
  "pacing" | "volume", { name; measures; formula; source; howToRead; conventions? }>`, con i testi
  del design (§4), fonti comprese, in italiano semplice.
- **Utilità di data:**
  - `dayKey(date, tz = SWIM_METRICS_TIMEZONE)`, formato `YYYY-MM-DD` via `Intl.DateTimeFormat("en-CA", { timeZone })`;
  - `weekStartKey(date)`: il lunedì della settimana, nel fuso;
  - `weeklyStreak(dates: Date[], now: Date, minPerWeek = 2): number`: settimane consecutive con
    almeno `minPerWeek` nuotate, contando a ritroso dalla settimana in corso. La settimana in corso
    conta se ha già raggiunto il minimo; altrimenti non interrompe, si parte dalla precedente.
- **Test:**
  - mezzanotte UTC contro Roma: 23:30Z del 26/10 è già il 27/10 a Roma;
  - cambio d'ora del 25/10/2026;
  - lunedì come inizio settimana;
  - serie: 2+2+1 nuotate nelle ultime 3 settimane dà 2; la settimana in corso con 1 nuotata non
    interrompe.
- **Commit:** `feat(metrics): shared swim metrics contract and week helpers`.

### Task A2: passo soglia, `server/swim_metrics/css.ts`
**Files:** create `server/swim_metrics/css.ts`, `css.test.ts`.
- **Funzioni:**
  - `bestEfforts(laps, from, to)`: giri attivi, in vasca, a stile libero (normalizza lo stile:
    `FREESTYLE`/`freestyle`/`Stile libero`), con distanza in {200, 300, 400, 500, 600, 800, 1000,
    1500}; il miglior tempo in movimento per distanza;
  - `estimateCss(efforts)`: regressione lineare `d = CS·t + D′` sui punti con 120 ≤ t ≤ 1800 s;
  - `cssFromTest(t200, t400)`: `200 / (t400 − t200)` m/s.
- **Condizioni della stima:**
  - servono almeno 2 punti, uno ≤ 400 m e uno ≥ 400 m;
  - se CS ≤ 0 o D′ < 0, ripiego su Ginn con 200 e 400;
  - il passo deve stare tra 60 e 210 s/100 m e non essere più veloce del miglior 200, altrimenti
    `null`.
- **Affidabilità:** «alta» con almeno 3 punti e rapporto tra distanza massima e minima ≥ 3;
  «media» altrimenti.
- **`cssHistory(laps, now, months = 6)`:** stima su 90 giorni a ritroso da ogni fine mese.
- **Test:**
  - Ginn: 180 s e 380 s danno 1 m/s, 100 s/100;
  - 3 punti allineati (200 in 160 s, 400 in 340 s, 800 in 700 s) danno CS = 1/0,9 m/s;
  - un solo punto dà `null`;
  - un passo fuori dai limiti dà `null`;
  - D′ negativo fa scattare il ripiego.
- **Commit:** `feat(metrics): critical swim speed estimate`.

### Task A3: carico e forma, `load.ts`
- **Funzioni:**
  - `sessionLoad(distanceM, movingS, cssSpeed)` restituisce `{ intensityFactor, stss }`, con
    `IF = min((d/t)/css, 1.3)` e `stss = IF³ × (t/3600) × 100`;
  - `loadSeries(dailyStss: Map<dayKey, number>, fromDay, toDay)`:
    `ctl += (tss − ctl)/42`, `atl += (tss − atl)/7`; `tsb` di un giorno = ctl − atl della fine del
    giorno precedente;
  - `tsbReading(tsb)` con le soglie del design;
  - `rampPerWeek` = ctl di oggi − ctl di 7 giorni fa.
- **Test:**
  - IF 1 per 3600 s dà 100;
  - IF tagliato a 1,3;
  - 3 giorni noti calcolati a mano;
  - tutte le letture ai confini (−30, −10, +5, +15).
- **Commit:** `feat(metrics): swim training load and form`.

### Task A4: zone di passo, `zones.ts`
- **Funzioni:**
  - `zoneOf(speedRatio)` con i confini 0,85 / 0,92 / 0,97 / 1,03 (il valore esatto del confine va
    nella zona superiore);
  - `sessionZones(laps, cssSpeed): Zones5`;
  - `intensitySplit(z)` dà `easyPct = Z1+Z2`, `mediumPct = Z3`, `hardPct = Z4+Z5`, arrotondati in
    modo che la somma faccia 100.
- **Test:** i confini; un esempio con 5 giri.
- **Commit:** `feat(metrics): pace zones from CSS`.

### Task A5: efficienza, `efficiency.ts`
- **`sessionEfficiency(laps)`:** giri attivi a stile libero con bracciate > 0.
  - Per giro: `dps = d/strokes`, `v = d/moving`, `si = v·dps`.
  - Per sessione: media pesata sulla distanza di `si` e `dps`.
  - `strokeRate = Σstrokes / (Σmoving/60)`.
  - `swolf` = la media del giro pesata sulla distanza.
- **`efficiencySummary(sessions, now)`:**
  - lunghezza di vasca = la più frequente negli ultimi 28 giorni;
  - `baseline` = mediana degli SI delle sessioni tra 118 e 28 giorni fa nella stessa vasca;
  - `deltaPct = (avg28 − baseline)/baseline × 100`;
  - senza base: `missing` = «Serve qualche settimana di nuotate per avere la tua base».
- **Test:** valori a mano; la vasca da 50 m esclusa dalla base dei 25 m.
- **Commit:** `feat(metrics): stroke index efficiency`.

### Task A6: ripetute, `pacing.ts`
- **`detectSets(laps)`:**
  - giri attivi in ordine di `lapIndex`; i recuperi (distanza 0) vengono saltati;
  - si raggruppano i giri consecutivi con la stessa distanza (≥ 50) e lo stesso stile;
  - si tengono i gruppi con almeno 3 giri.
- **`setStats(times)`:**
  - `cv = sd/mean × 100` (deviazione standard di popolazione);
  - `fade = (mean(ultimo terzo) − mean(primo terzo))/mean(primo terzo) × 100`, con un terzo =
    `ceil(n/3)` giri.
- **Per sessione:** media pesata sulla distanza delle serie.
- **`pacingSummary`:** mediane degli ultimi 28 giorni più la serie più recente.
- **Test:**
  - 8×100 con recuperi in mezzo diventa 1 serie;
  - un cambio di stile spezza la serie;
  - 2 giri non bastano;
  - cv e fade calcolati a mano.
- **Commit:** `feat(metrics): pacing in repeat sets`.

### Task A7: volume, `volume.ts`
- **`volumeSummary(activities, now)`:**
  - 12 settimane (da lunedì, fuso Roma) con km e numero di nuotate;
  - `avgKm4` e `avgSessions4` sulle 4 settimane complete più recenti;
  - `changePct` rispetto alle 4 precedenti (`null` se le precedenti sono a 0);
  - `streakWeeks` con `weeklyStreak` del Task A1.
- **Test:** settimane vuote incluse; settimana in corso.
- **Commit:** `feat(metrics): weekly volume and streak`.

### Task A8: aggregatore e cache, `server/swim_metrics/index.ts`
- **`getSwimMetrics(userId, now = new Date())`:**
  - legge le nuotate degli ultimi 180 giorni e i loro giri (`garmin_activity_laps`, una query con
    `inArray`);
  - legge il test CSS da `swimmer_profiles.preferences.cssTest`: vale se ha meno di 90 giorni;
  - calcola il CSS di ogni sessione con la stima mensile del mese della sessione, e il test se era
    valido a quella data;
  - poi carico, zone, efficienza, ripetute, volume; `sessions` sono gli ultimi 90 giorni.
- **Testi `missing`** (italiano, specifici):
  - CSS: «Servono almeno due nuotate continue a stile libero, una fino a 400 m e una da 400 m in
    su, negli ultimi 90 giorni. Oppure inserisci un test.»
  - carico e intensità senza CSS: «Servono il passo soglia e nuotate con i giri.»
- **Cache:**
  - `getOrSetCached` con chiave `swim-metrics:v1:{userId}`, TTL 3600 s;
  - aggiungi la chiave in `cacheKeys` di `server/lib/cache.ts` e a `invalidateUserCache` (le
    sincronizzazioni Garmin e Strava la chiamano già); controlla che la chiamino anche upload,
    modifica e cancellazione manuale delle nuotate, e aggiungila dove manca.
- **Test:** db finto in stile `server/db_challenges.counts.test.ts`, con 3 nuotate e i loro giri;
  forma del risultato; test CSS scaduto ignorato.
- **Commit:** `feat(metrics): swim metrics aggregate with cache`.

### Task A9: procedure tRPC
**Files:** `server/routers/admin.router.ts` (statisticsRouter ~righe 170-205).
- **Procedure:**
  - `getMetrics`: protetta, solo l'utente corrente, restituisce `getSwimMetrics(ctx.user.id)`;
  - `setCssTest`: input `{ t200Seconds: 90..420, t400Seconds: 180..900, date: YYYY-MM-DD non
    futura }`, con il rifiuto se `t400/t200` è fuori da 1,9–2,4 (messaggio in italiano); salva
    nelle preferences senza toccare le altre chiavi e invalida la cache;
  - `clearCssTest`;
  - `getInsights`: suggerimenti AI dalle nuove metriche (Task A10).
- **Da togliere:** `getAdvanced`.
- **Test:**
  - validazione;
  - le altre chiavi delle preferences restano intatte;
  - le procedure richiedono il login;
  - si leggono solo i propri dati.
- **Commit:** `feat(metrics): statistics procedures for swim metrics`.

### Task A10: coach e pulizia
- **Contesto per l'AI**, in `server/swim_metrics/coach-context.ts`:
  - `swimMetricsForCoach(m: SwimMetrics): string` scrive un blocco compatto: CSS con fonte e
    affidabilità, TSB con lettura e rampa, quote facile/medio/intenso, SI con delta dalla base,
    CV e calo, km e nuotate a settimana, serie, ultime 5 sessioni (data, km, IF, sTSS, zone in %);
  - `swimMetricsGlossary()` è generato da `SWIM_METRIC_DEFINITIONS`.
- **`server/ai_coach_chat.ts`:**
  - sostituisci `advanced` (`getAdvancedMetrics`) con `getSwimMetrics` e le righe «Performance
    Index…ACS» con i due blocchi sopra;
  - aggiungi alle istruzioni: «Usa solo queste metriche; citale quando servono; se l'affidabilità
    è bassa o mancano dati, dillo; non inventare altri indici».
- **`server/ai_insights.ts`:** l'input diventa `SwimMetrics`, con lo stesso meccanismo di cache.
  `getInsights` lo chiama.
- **Da eliminare:**
  - `server/advanced_metrics.ts` e i suoi test;
  - `getAdvancedMetrics` da `server/db_statistics.ts`, con il calcolo della serie
    lunedì/mercoledì/venerdì;
  - ogni import rimasto.
  - Usa grep per i vecchi nomi: `swimmingEfficiencyIndex`, `technicalConsistencyIndex`,
    `strokeEfficiencyRating`, `aerobicCapacityScore`, `recoveryReadinessScore`,
    `progressiveOverloadIndex`, `performanceIndex`, `consistencyScore`. Il client lo sistema il
    Blocco B.
- **Test:** il contesto del coach contiene «Passo soglia» e non contiene «SEI», «ACS», «Performance
  Index».
- **Commit:** `feat(coach): coach reads the new swim metrics` e `refactor(metrics): remove invented
  advanced metrics`.

### Task A11: verifica del blocco A
- `pnpm check` può fallire solo per il client che usa ancora `getAdvanced`: annotalo, lo chiude il
  Blocco B.
- Tutti i test server verdi.
- Avvio del server compilato:
  - `pnpm build`;
  - `node dist/index.js` con
    `NODE_ENV=production PORT=3999 JWT_SECRET=test-secret-32-chars-long-xxxxxxxx
    DATABASE_URL=postgres://u:p@127.0.0.1:1/x SUPABASE_URL=https://example.supabase.co
    SUPABASE_ANON_KEY=dummy`;
  - verifica `/healthz` 200, poi ferma il server.

---

## Blocco B: client

### Task B1: serie in settimane
**Files:** `client/src/lib/profile-stats.ts` (`TRAINING_DAYS`, `getStreaks`), i suoi test, e i
punti dove Profilo (`client/src/pages/Profile.tsx`) e Sfide (`client/src/pages/Challenges.tsx`)
mostrano la serie.
- **Comportamento:** `getStreaks` usa `weeklyStreak` di `shared/swimMetrics.ts`. La serie migliore
  è la serie più lunga di settimane consecutive con almeno 2 nuotate.
- **Etichette e unità:** «Serie attuale» e «Serie migliore», unità «sett.» (singolare
  «settimana», plurale «settimane» dove c'è spazio).
- **Testo di spiegazione:** «Settimane di fila con almeno 2 nuotate».
- **Commit:** `feat(stats): streak in weeks with at least two swims`.

### Task B2: riquadri delle metriche
**Files:** `client/src/pages/Statistics.tsx` (sezione «Analisi avanzate», ~righe 413-525), nuovo
`client/src/components/stats/MetricCards.tsx` (e un file per grafico se serve), test.
- **Struttura:**
  - la sezione si chiama «Metriche»;
  - sei riquadri dentro `Accordion type="multiple"`, tutti chiusi all'avvio;
  - il trigger mostra nome, valore principale e lettura breve.
- **Valori principali:**

  | Metrica | Valore | Lettura |
  |---|---|---|
  | CSS | `m:ss/100 m` | «stima, affidabilità media» o «test del 12/10» |
  | Forma | TSB con segno | lettura in italiano |
  | Intensità | «72% facile» | |
  | Efficienza | SI con 2 decimali | «+4% sulla tua media» |
  | Ripetute | «CV 2,8%» | lettura |
  | Volume | «7,4 km/sett.» | «serie: 5 settimane» |

- **Contenuto aperto:**
  - il grafico, montato solo quando il riquadro è aperto;
  - una riga «Come si legge» da `SWIM_METRIC_DEFINITIONS.howToRead`;
  - la base dei dati (es. «su 18 nuotate degli ultimi 90 giorni»);
  - il pulsante «Come si calcola», che apre un Dialog con formula, fonte e convenzioni;
  - per CSS, «Inserisci un test» (Task B3).
- **Grafici** (recharts; colori `--chart-1..5`, zone `--zone-1..5`; niente gradienti; assi e
  tooltip in italiano; numeri con `client/src/lib/format.ts`; `role="img"` con `aria-label` di
  sintesi):
  - CSS: linea della storia mensile, con i punti usati elencati sotto;
  - Forma: linee CTL e ATL più barre TSB, ultimi 90 giorni;
  - Intensità: barre impilate settimanali Z1..Z5, con legenda «Facile, Aerobico, Medio, Soglia,
    Sopra soglia»;
  - Efficienza: SI per sessione (punti e linea) con la linea di base tratteggiata; sotto, due
    numeri: DPS media 28 giorni e frequenza;
  - Ripetute: barre dei tempi della serie più recente e linea del CV per sessione;
  - Volume: barre km/settimana per 12 settimane, con il numero di nuotate nel tooltip.
- **Dati insufficienti:** «—» nel trigger; aperto, il testo `missing`.
- **Caricamento ed errore:** `LoadingSkeleton` e `LoadError` (`components/corsia/LoadState`).
- **Da eliminare:** `client/src/data/metricsDefinitions.ts`, se nessuno lo usa più.
- **Test:**
  - riquadri chiusi all'avvio;
  - aprendone uno compare la sintesi del grafico;
  - «—» e il testo quando mancano i dati;
  - il Dialog «Come si calcola»;
  - in jsdom, mock di `ResponsiveContainer` come negli altri test del repo.
- **Commit:** `feat(stats): metric cards with charts`.

### Task B3: test CSS
- **Dialog** «Test del passo soglia», con istruzioni brevi: «Dopo il riscaldamento: 400 m a tutta,
  recupero completo (5-10 minuti facili), 200 m a tutta».
- **Campi:**
  - tempo 400 e tempo 200, con input `m:ss` validato;
  - data (default oggi).
- **Azioni:**
  - salva con `setCssTest`, con errori mostrati sotto i campi;
  - «Rimuovi test» con `clearCssTest`;
  - dopo il salvataggio, invalida `statistics.getMetrics`.
- **Test:** validazione `m:ss`; invio; errore dal server mostrato.
- **Commit:** `feat(stats): CSS test entry`.

### Task B4: pagina Coach
- **`client/src/pages/Coach.tsx`** (~righe 216 e 299): usa `statistics.getInsights` al posto di
  `getAdvanced().insights`; aggiorna i test.
- **Pulizia:** con grep nel client, nessun uso rimasto di `getAdvanced` né dei vecchi nomi.
- **Commit:** `refactor(coach): insights from the new swim metrics`.

### Task B5: verifica finale
- `pnpm check`, `pnpm test -- --maxWorkers=2`, `pnpm lint` (0 errori, al massimo 28 avvisi),
  `pnpm build`, `pnpm build:native`.
- Il ratchet `client/src/styles/design-lint.test.ts` resta verde, senza nuovi file in PENDING.
- **Rapporto:**
  - commit;
  - il valore delle sei metriche su un esempio realistico dei test;
  - cosa resta aperto.
