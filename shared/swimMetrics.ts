/**
 * Swim metrics grounded in swimming science: the result types, the Italian definitions shown by
 * the Statistics page and given to the AI coach, and the calendar helpers (days and Monday weeks
 * in the Rome time zone). Design: docs/plans/2026-10-29-swim-metrics-design.md.
 */

export const SWIM_METRICS_TIMEZONE = "Europe/Rome";

// ─── Result types (server → clients) ────────────────────────────────────────

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
      "Velocità critica: retta distanza = velocità critica × tempo + riserva (D′), stimata sui tuoi migliori tratti continui a stile libero in vasca tra 200 e 1500 m (tra 2 e 30 minuti) degli ultimi 90 giorni. Con un test: velocità = 200 / (tempo sui 400 − tempo sui 200).",
    source:
      "Velocità critica (Wakayoshi et al., 1992); versione 400/200 (Ginn, 1993). È il riferimento di Swim Smooth, British Triathlon e TrainingPeaks.",
    howToRead:
      "Più basso è, più sei veloce in soglia. Confrontalo con te stesso nel tempo: le stime da allenamento sono di solito un po' più lente del vero, perché raramente si nuota a tutta.",
    conventions: [
      "Affidabilità alta con almeno 3 distanze che coprono un rapporto di almeno 3 (es. 200 e 600 m); media con 2.",
      "Un test degli ultimi 90 giorni vale più della stima.",
      "Il passo soglia accettato sta tra 1:00 e 3:30 per 100 m.",
    ],
  },
  load: {
    name: "Forma e fatica",
    measures:
      "Quanto carico hai accumulato: la forma (carico medio delle ultime 6 settimane), la fatica (ultima settimana) e il loro equilibrio.",
    formula:
      "Carico della nuotata = IF³ × ore × 100, con IF = velocità della nuotata / velocità al passo soglia (massimo 1,3). Forma = media esponenziale a 42 giorni del carico giornaliero, fatica = media a 7 giorni, equilibrio = forma − fatica a fine di ieri.",
    source:
      "Carico del nuoto (sTSS) di TrainingPeaks, con il cubo che segue la resistenza dell'acqua; modello di Banister nella forma di TrainingPeaks (forma a 42 giorni, fatica a 7).",
    howToRead:
      "Equilibrio positivo: sei riposato; negativo: stai caricando. Le soglie sono convenzioni di TrainingPeaks, non regole.",
    conventions: [
      "Equilibrio sopra +15: molto riposato; se dura a lungo, la forma cala.",
      "Da +5 a +15: fresco.",
      "Da −10 a +5: neutro.",
      "Da −30 a −10: in costruzione.",
      "Sotto −30: carico alto, valuta un recupero.",
      "Forma che cresce più di 8 punti a settimana: crescita molto rapida.",
    ],
  },
  intensity: {
    name: "Intensità",
    measures:
      "Come si divide il tuo volume tra lavoro facile, medio e intenso, in base al passo di ogni giro rispetto al passo soglia.",
    formula:
      "Ogni giro attivo va in una zona secondo la sua velocità rispetto alla velocità soglia: Z1 sotto 85%, Z2 85–92%, Z3 92–97%, Z4 97–103%, Z5 sopra 103%. Si somma la distanza per zona.",
    source:
      "Zone di passo relative al passo soglia (Swim Smooth, TrainingPeaks); distribuzione dell'intensità polarizzata o piramidale (Seiler, 2010; Stöggl e Sperlich, 2014).",
    howToRead:
      "Gli studi sugli sport di resistenza indicano che la maggior parte del volume facile e una piccola parte intensa funzionano meglio di tanto lavoro medio.",
    conventions: [
      "I confini delle zone sono una convenzione.",
      "Se la zona media (Z3) supera circa il 35% del volume: molto lavoro in zona media. È un'indicazione basata sugli studi, non una regola.",
    ],
  },
  efficiency: {
    name: "Efficienza della bracciata",
    measures:
      "Quanta strada fai per ciclo di bracciata alla velocità a cui nuoti (Stroke Index).",
    formula:
      "Stroke Index = velocità × distanza per ciclo (m/s × m), media pesata sulla distanza dei giri attivi a stile libero con le bracciate. Distanza per ciclo = distanza / bracciate (una bracciata dell'orologio è un ciclo del braccio); frequenza = bracciate al minuto.",
    source: "Stroke Index (Costill et al., 1985).",
    howToRead:
      "Più alto è meglio. Confrontalo solo con la tua base nella stessa lunghezza di vasca: la spinta dal muro cambia i valori tra 25 e 50 m.",
    conventions: [
      "La base è la mediana delle tue nuotate dei 90 giorni prima delle ultime 4 settimane, nella stessa vasca.",
    ],
  },
  pacing: {
    name: "Regolarità nelle ripetute",
    measures:
      "Quanto tieni costante il passo nelle serie di ripetute e quanto cali nel finale.",
    formula:
      "Una serie è fatta di almeno 3 giri attivi consecutivi con la stessa distanza (almeno 50 m) e lo stesso stile, ignorando i recuperi. Variabilità = deviazione standard / media dei tempi × 100; calo = (media dell'ultimo terzo − media del primo terzo) / media del primo terzo × 100.",
    source:
      "Variabilità del passo (coefficiente di variazione) e calo nel finale, misure usate negli studi sul pacing e dagli allenatori.",
    howToRead:
      "Più bassa è la variabilità, più sei regolare; un calo alto vuol dire che parti troppo forte o che la serie è troppo lunga per il passo scelto.",
    conventions: [
      "Sono convenzioni nostre: variabilità sotto 2% molto regolare, 2–4% regolare, sopra 4% irregolare.",
      "Calo sopra 5%: cali nel finale.",
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

export const SWIM_METRIC_THRESHOLDS = {
  /** Above this share of Z3: «molto lavoro in zona media». */
  mediumZonePct: 35,
  /** CTL growth above this many points a week: «crescita molto rapida». */
  rampPerWeek: 8,
  /** Fade above this percent: «cali nel finale». */
  pacingFadePct: 5,
} as const;

/** Our convention: CV < 2% very even, 2–4% even, > 4% uneven. */
export function pacingCvReading(cv: number): "molto regolare" | "regolare" | "irregolare" {
  if (cv < 2) return "molto regolare";
  if (cv <= 4) return "regolare";
  return "irregolare";
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

  let week = weekStartKey(now);
  let streak = 0;
  if ((perWeek.get(week) ?? 0) >= minPerWeek) streak = 1;
  week = addDaysToKey(week, -7);
  while ((perWeek.get(week) ?? 0) >= minPerWeek) {
    streak += 1;
    week = addDaysToKey(week, -7);
  }
  return streak;
}
