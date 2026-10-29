/**
 * Swim metrics grounded in swimming science: the result types, the Italian definitions shown by
 * the Statistics page and given to the AI coach, and the calendar helpers (days and Monday weeks
 * in the Rome time zone). Design: docs/plans/2026-10-29-swim-metrics-design.md.
 */

export const SWIM_METRICS_TIMEZONE = "Europe/Rome";

// ─── Result types (server → clients) ────────────────────────────────────────

export type Zones5 = [number, number, number, number, number]; // metres in Z1..Z5
export type CssPoint = {
  distanceMeters: number; seconds: number; date: string;
  /** The CSS distance the lap matched, in the pool's unit (e.g. 200 yd is 182.9 m): for labels. */
  nominalDistance?: number; distanceUnit?: "m" | "yd";
};
/** A best effort left out of the estimate: slower per 100 m than a longer one, so submaximal. */
export type CssDroppedPoint = CssPoint & { slowerThan: CssPoint };
export type CssResult = {
  paceSecondsPer100: number; speedMps: number;
  source: "stima" | "test"; confidence: "alta" | "media" | null; // null for a test
  points: CssPoint[]; testDate: string | null;
  /** Estimate only: the fitted reserve D′ (m) and R² of distance = CS × time + D′. */
  dPrimeMeters?: number | null; r2?: number | null;
  /** Estimate only: best efforts dropped («scartato: più lento del tuo 400»). */
  droppedPoints?: CssDroppedPoint[];
};
export type TsbReading = "molto_riposato" | "fresco" | "neutro" | "in_costruzione" | "carico_alto";
export type SessionMetrics = {
  activityId: number; date: string; poolLengthMeters: number | null; isOpenWater: boolean;
  /** Total of the activity (volume). */
  distanceMeters: number; movingSeconds: number; hasLaps: boolean;
  intensityFactor: number | null; stss: number | null; zoneMeters: Zones5 | null;
  strokeIndex: number | null; dpsMeters: number | null; strokeRate: number | null; swolf: number | null;
  pacingCv: number | null; pacingFade: number | null;
  /** Σ active laps (the swum distance behind pace-derived values); null without laps. */
  swimDistanceMeters?: number | null;
  /** True when the load comes from distance / total time (no laps), as TrainingPeaks defines it. */
  loadEstimated?: boolean;
  /** Active metres not zoned: other strokes, drill, kick, no stroke (pool swims with laps). */
  unclassifiedMeters?: number | null;
  /** The CSS this swim's load and zones use: a valid test or its month's estimate; null without. */
  cssPaceSecondsPer100?: number | null; cssSource?: "stima" | "test" | null;
  /** Stroke holding in the repeat sets (distance-weighted): DPS drop and stroke rate rise, %. */
  dpsDropPct?: number | null; strokeRateRisePct?: number | null;
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
    last28: {
      zoneMeters: Zones5; easyPct: number; mediumPct: number; hardPct: number;
      /** Active metres not zoned (other strokes, drill, kick) in the 28 days. */
      unclassifiedMeters?: number;
      /** Zoned metres / all metres swum in the 28 days × 100 (whole percent). */
      coveragePct?: number;
    } | null;
    weeks: { weekStart: string; zoneMeters: Zones5; unclassifiedMeters?: number }[]; // last 8 weeks
    missing: string | null;
  };
  efficiency: {
    poolLengthMeters: number | null; latest: number | null;
    /** Median SI of the last 28 days (the name is historical). */
    avg28: number | null;
    baseline: number | null; deltaPct: number | null; missing: string | null;
    /** Swims behind avg28 and behind the baseline (same pool length). */
    n28?: number; nBaseline?: number;
    /** Median distance per cycle (m) and pace (s/100 m) of the same swims: a longer stroke or only faster? */
    dps28?: number | null; dpsBaseline?: number | null;
    pace28?: number | null; paceBaseline?: number | null;
  };
  pacing: {
    cv28: number | null; fade28: number | null;
    latestSet: {
      date: string; distanceMeters: number; stroke: string; repSeconds: number[];
      /** Distance per cycle of each rep (m); null without stroke data on every rep. */
      repDps?: number[] | null;
      /** DPS drop of this set, % (first third against last third). */
      dpsDropPct?: number | null;
    } | null;
    missing: string | null;
    /** Stroke holding: medians of the last 28 days, % (DPS drop; stroke rate rise). */
    dpsDrop28?: number | null; strokeRateRise28?: number | null;
  };
  volume: {
    weeks: { weekStart: string; km: number; sessions: number }[]; // last 12 weeks, oldest first
    avgKm4: number; avgSessions4: number; changePct: number | null; streakWeeks: number;
  };
};

// ─── Definitions (one text for the interface and the coach) ─────────────────

export type SwimMetricKey = "css" | "load" | "intensity" | "efficiency" | "pacing" | "volume";

export type SwimMetricDefinition = {
  /** Name shown in the interface. */
  name: string;
  /** What it measures, in one sentence. */
  measures: string;
  /** How it is calculated. */
  formula: string;
  /** Study or coaching method it comes from. */
  source: string;
  /** How to read the value, in one line. */
  howToRead: string;
  /** Thresholds that are conventions, said as such. */
  conventions?: string[];
};

export const SWIM_METRIC_DEFINITIONS: Record<SwimMetricKey, SwimMetricDefinition> = {
  css: {
    name: "Passo soglia",
    measures:
      "Il passo per 100 m che puoi tenere a lungo senza andare in debito: separa il lavoro aerobico da quello intenso.",
    formula:
      "Velocità critica: retta distanza = velocità critica × tempo + riserva (D′), stimata con i minimi quadrati sui tuoi migliori tratti continui a stile libero in vasca tra 200 e 1500 m (tra 2 e 30 minuti, ±3% sulla distanza; in vasca da 25 yd conta la distanza in yard) degli ultimi 90 giorni. Un tratto più lento per 100 m di uno più lungo non era a tutta e viene scartato; se D′ esce negativo la retta passa per l'origine. Serve un tratto lungo almeno il doppio del più corto. Con un test: velocità = 200 / (tempo sui 400 − tempo sui 200).",
    source:
      "Velocità critica (Wakayoshi et al., 1992); versione 400/200 (Ginn, 1993). È il riferimento di Swim Smooth, British Triathlon e TrainingPeaks.",
    howToRead:
      "Più basso è, più sei veloce in soglia. Confrontalo con te stesso nel tempo: le stime da allenamento sono di solito un po' più lente del vero, perché raramente si nuota a tutta.",
    conventions: [
      "Affidabilità alta con almeno 3 distanze che coprono un rapporto di almeno 3 (es. 200 e 600 m), riserva D′ tra 0 e 50 m e R² di almeno 0,98; media negli altri casi.",
      "Un test vale per 90 giorni dalla sua data (quel giorno compreso) e solo in avanti: le nuotate prima del test usano la stima del loro mese.",
      "Il passo soglia accettato sta tra 1:00 e 3:30 per 100 m e non è più veloce del tratto più corto usato.",
    ],
  },
  load: {
    name: "Forma e fatica",
    measures:
      "Quanto carico hai accumulato: la forma (carico medio delle ultime 6 settimane), la fatica (ultima settimana) e il loro equilibrio.",
    formula:
      "Carico = IF³ × ore × 100, con IF = velocità / velocità al passo soglia (massimo 1,3). Si calcola giro per giro sui tratti nuotati (tempo in movimento), come le zone; TrainingPeaks usa la durata totale con le pause, per questo nelle sedute a intervalli il nostro carico è un po' più alto. IF della nuotata = (media pesata sul tempo degli IF³ dei giri)^(1/3). Nuotate senza giri: IF = (distanza / durata totale) / velocità soglia, come TrainingPeaks (carico stimato). Forma = media esponenziale a 42 giorni del carico giornaliero, fatica = media a 7 giorni, equilibrio = forma − fatica a fine di ieri.",
    source:
      "Carico del nuoto (sTSS) di TrainingPeaks, con il cubo che segue la resistenza dell'acqua; modello di Banister nella forma di TrainingPeaks (forma a 42 giorni, fatica a 7).",
    howToRead:
      "Equilibrio positivo: sei riposato; negativo: stai caricando. Le soglie sono convenzioni di TrainingPeaks, non regole.",
    conventions: [
      "Equilibrio sopra +25: molto riposato (rischio di perdere forma se dura).",
      "Da +5 (escluso) a +25: fresco.",
      "Da −10 a +5: neutro.",
      "Da −30 a −10 (escluso): in costruzione.",
      "Sotto −30: carico alto.",
      "Forma che cresce più di 8 punti a settimana: crescita molto rapida.",
      "Giri non a stile libero (altri stili, tecnica, gambe, stile non registrato): IF fisso 0,80, perché il passo soglia è a stile libero. È una convenzione nostra.",
    ],
  },
  intensity: {
    name: "Intensità",
    measures:
      "Come si divide il tuo volume tra lavoro facile, medio e intenso, in base al passo di ogni giro rispetto al passo soglia.",
    formula:
      "Ogni giro attivo a stile libero va in una zona secondo la sua velocità rispetto alla velocità soglia: Z1 sotto 85%, Z2 85–92%, Z3 92–97%, Z4 97–103%, Z5 sopra 103% (in passo: passo soglia / percentuale). Si somma la distanza per zona. Gli altri stili, la tecnica e le gambe restano non classificati; la copertura è la quota dei metri delle ultime 4 settimane che sta nelle zone.",
    source:
      "Zone di passo relative al passo soglia (Swim Smooth, TrainingPeaks); distribuzione dell'intensità polarizzata o piramidale (Seiler, 2010; Stöggl e Sperlich, 2014).",
    howToRead:
      "Gli studi sugli sport di resistenza indicano che la maggior parte del volume facile e una piccola parte intensa funzionano meglio di tanto lavoro medio.",
    conventions: [
      "I confini delle zone sono una convenzione.",
      "Le zone valgono solo per lo stile libero, perché il passo soglia è a stile libero: gli altri stili non sono classificati.",
      "Se la zona media (Z3) supera circa il 35% del volume: molto lavoro in zona media. È un'indicazione basata sugli studi, non una regola.",
    ],
  },
  efficiency: {
    name: "Efficienza della bracciata",
    measures:
      "Quanta strada fai per ciclo di bracciata alla velocità a cui nuoti (Stroke Index).",
    formula:
      "Stroke Index = velocità × distanza per ciclo (m/s × m), media pesata sulla distanza dei giri attivi a stile libero con le bracciate. Distanza per ciclo = distanza / bracciate (una bracciata dell'orologio è un ciclo del braccio); frequenza = bracciate al minuto. Si usano solo i giri con 0,9–3,2 m per ciclo e almeno 15 cicli al minuto (fuori da questi valori il conteggio delle bracciate è sbagliato o nel giro c'è una sosta). Il valore delle ultime 4 settimane è la mediana delle nuotate.",
    source: "Stroke Index (Costill et al., 1985).",
    howToRead:
      "Più alto è meglio. Confrontalo solo con la tua base nella stessa lunghezza di vasca: la spinta dal muro cambia i valori tra 25 e 50 m.",
    conventions: [
      "La base è la mediana delle tue nuotate dei 90 giorni prima delle ultime 4 settimane, nella stessa vasca; servono almeno 3 nuotate.",
      "Accanto allo Stroke Index ci sono la distanza per ciclo e il passo: se sale lo Stroke Index ma non la distanza per ciclo, vai solo più veloce.",
    ],
  },
  pacing: {
    name: "Regolarità e tenuta nelle ripetute",
    measures:
      "Quanto tieni costante il passo nelle serie di ripetute, quanto cali nel finale e quanto tieni la bracciata (la distanza per bracciata) fino in fondo.",
    formula:
      "Una serie è fatta di almeno 3 giri attivi consecutivi con la stessa distanza (almeno 50 m) e lo stesso stile; un recupero più lungo di 1 minuto e del doppio dei recuperi precedenti della serie (es. tra riscaldamento e serie centrale) ne apre una nuova. Variabilità = deviazione standard campionaria (n − 1) / media dei tempi × 100; calo = (media dell'ultimo terzo − media del primo terzo) / media del primo terzo × 100. Tenuta della bracciata, sulle serie con le bracciate di ogni ripetuta: calo della distanza per bracciata = (media del primo terzo − media dell'ultimo terzo) / media del primo terzo × 100; aumento della frequenza calcolato allo stesso modo.",
    source:
      "Variabilità del passo (coefficiente di variazione) e calo nel finale, misure usate negli studi sul pacing e dagli allenatori. Con la fatica la distanza per bracciata si accorcia e la frequenza sale (Craig e Pendergast, 1979; Keskinen e Komi, 1993).",
    howToRead:
      "Più bassa è la variabilità, più sei regolare; un calo alto vuol dire che parti troppo forte o che la serie è troppo lunga per il passo scelto. Se nel finale la distanza per bracciata cala, la fatica ti accorcia la bracciata: è il segnale da allenare.",
    conventions: [
      "Sono convenzioni nostre: variabilità sotto 2% molto regolare, 2–4% regolare, sopra 4% irregolare.",
      "Calo sopra 5%: cali nel finale.",
      "Distanza per bracciata che cala più del 5% nel finale: la bracciata si accorcia nel finale (convenzione nostra).",
    ],
  },
  volume: {
    name: "Volume e costanza",
    measures: "Quanti km e quante nuotate fai a settimana e da quante settimane nuoti con regolarità.",
    formula:
      "Km e nuotate per settimana (lunedì–domenica, ora italiana); medie delle ultime 4 settimane complete e differenza % dalle 4 precedenti. Serie: settimane consecutive con almeno 2 nuotate; la settimana in corso non la interrompe finché non è finita.",
    source: "Misura diretta del volume di allenamento.",
    howToRead:
      "La costanza conta più dei picchi: aumenti graduali del volume sono più sostenibili di salti improvvisi.",
  },
};

// ─── Readings (conventions shared by the interface and the coach) ──────────

export const TSB_READING_LABELS: Record<TsbReading, string> = {
  molto_riposato: "molto riposato",
  fresco: "fresco",
  neutro: "neutro",
  in_costruzione: "in costruzione",
  carico_alto: "carico alto",
};

/** The reading with its note, for longer texts (coach, card details). */
export const TSB_READING_DESCRIPTIONS: Record<TsbReading, string> = {
  molto_riposato: "molto riposato (rischio di perdere forma se dura)",
  fresco: "fresco",
  neutro: "neutro",
  in_costruzione: "in costruzione",
  carico_alto: "carico alto",
};

/**
 * TrainingPeaks bands of the balance (TSB), explicit and non-overlapping:
 * molto riposato > +25 ≥ fresco > +5 ≥ neutro ≥ −10 > in costruzione ≥ −30 > carico alto.
 */
export const TSB_BOUNDS = { veryRestedAbove: 25, freshAbove: 5, neutralFrom: -10, buildingFrom: -30 } as const;

/** Reading of a balance value with the TSB_BOUNDS bands. */
export function tsbReadingOf(tsb: number): TsbReading {
  if (tsb > TSB_BOUNDS.veryRestedAbove) return "molto_riposato";
  if (tsb > TSB_BOUNDS.freshAbove) return "fresco";
  if (tsb >= TSB_BOUNDS.neutralFrom) return "neutro";
  if (tsb >= TSB_BOUNDS.buildingFrom) return "in_costruzione";
  return "carico_alto";
}

export const SWIM_METRIC_THRESHOLDS = {
  /** Above this share of Z3: «molto lavoro in zona media». */
  mediumZonePct: 35,
  /** CTL growth above this many points a week: «crescita molto rapida». */
  rampPerWeek: 8,
  /** Fade above this percent: «cali nel finale». */
  pacingFadePct: 5,
  /** Distance per cycle dropping above this percent: «la bracciata si accorcia nel finale». */
  dpsDropPct: 5,
} as const;

/** Our convention: CV < 2% very even, 2–4% even, > 4% uneven. */
export function pacingCvReading(cv: number): "molto regolare" | "regolare" | "irregolare" {
  if (cv < 2) return "molto regolare";
  if (cv <= 4) return "regolare";
  return "irregolare";
}

// ─── Pools ──────────────────────────────────────────────────────────────────

/** A 25-yard pool (22.86 m; the database keeps whole metres, so 23). */
export function isYardPool(poolLengthMeters: number | null | undefined): boolean {
  return typeof poolLengthMeters === "number" && Math.abs(poolLengthMeters - 22.86) <= 0.5;
}

/** «25 m», «50 m», or «25 yd» for a 22.86 m pool. */
export function poolLengthLabel(poolLengthMeters: number | null | undefined): string {
  if (poolLengthMeters === null || poolLengthMeters === undefined) return "vasca non indicata";
  return isYardPool(poolLengthMeters) ? "25 yd" : `${poolLengthMeters} m`;
}

// ─── Calendar helpers ───────────────────────────────────────────────────────

const dayFormatters = new Map<string, Intl.DateTimeFormat>();

function dayFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = dayFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dayFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Calendar day «YYYY-MM-DD» of an instant in the given time zone (Rome by default). */
export function dayKey(date: Date, tz: string = SWIM_METRICS_TIMEZONE): string {
  return dayFormatter(tz).format(date);
}

/** Pure calendar arithmetic on a «YYYY-MM-DD» key (no time zone involved). */
export function addDaysToKey(key: string, days: number): string {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

/** Whole days from key `a` to key `b` (positive when b is later). */
export function daysBetweenKeys(a: string, b: string): number {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}

/** Monday of the week of a «YYYY-MM-DD» key. */
export function weekStartOfKey(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sunday
  return addDaysToKey(key, -((weekday + 6) % 7));
}

/** Monday («YYYY-MM-DD») of the week of an instant, in the Rome time zone. */
export function weekStartKey(date: Date, tz: string = SWIM_METRICS_TIMEZONE): string {
  return weekStartOfKey(dayKey(date, tz));
}

/**
 * Consecutive weeks (Monday to Sunday, Rome) with at least `minPerWeek` swims, counting back
 * from the current week. The current week counts once it has the minimum; until then it does
 * not break the streak, which starts from the previous week.
 */
export function weeklyStreak(dates: Date[], now: Date, minPerWeek = 2): number {
  const perWeek = new Map<string, number>();
  for (const date of dates) {
    const key = weekStartKey(date);
    perWeek.set(key, (perWeek.get(key) ?? 0) + 1);
  }
  return weeklyStreakFromCounts(perWeek, now, minPerWeek);
}

/** weeklyStreak from swims already counted per week (keys: the Monday «YYYY-MM-DD», Rome). */
export function weeklyStreakFromCounts(
  perWeek: Map<string, number> | Record<string, number>,
  now: Date,
  minPerWeek = 2,
): number {
  const count = (week: string) =>
    (perWeek instanceof Map ? perWeek.get(week) : perWeek[week]) ?? 0;
  let week = weekStartKey(now);
  let streak = 0;
  if (count(week) >= minPerWeek) streak = 1;
  week = addDaysToKey(week, -7);
  while (count(week) >= minPerWeek) {
    streak += 1;
    week = addDaysToKey(week, -7);
  }
  return streak;
}
