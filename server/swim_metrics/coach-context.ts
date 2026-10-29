/**
 * The swim metrics as text for the AI coach (chat, Coach page insights, workout generation):
 * the values with source, reliability and readings, the last swims, and a glossary generated
 * from the shared definitions, so the coach and the interface say the same things.
 */
import {
  SWIM_METRIC_DEFINITIONS,
  SWIM_METRIC_THRESHOLDS,
  TSB_READING_LABELS,
  pacingCvReading,
  type SwimMetrics,
} from "@shared/swimMetrics";

const STROKE_NAMES: Record<string, string> = {
  freestyle: "stile libero",
  backstroke: "dorso",
  breaststroke: "rana",
  butterfly: "farfalla",
  mixed: "misti",
  drill: "tecnica",
  other: "stile non indicato",
};

const num = (value: number, decimals = 1) => value.toFixed(decimals).replace(".", ",");
const signed = (value: number, decimals = 1) =>
  `${value > 0 ? "+" : value < 0 ? "−" : ""}${num(Math.abs(value), decimals)}`;

/** m:ss from seconds. */
function clock(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** «06/10» from «2026-10-06». */
const shortDate = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
/** «20/10/2026» from «2026-10-20». */
const longDate = (day: string) => `${shortDate(day)}/${day.slice(0, 4)}`;

function cssLine(m: SwimMetrics): string {
  const css = m.css.current;
  if (!css) return `- Passo soglia (CSS): non disponibile. ${m.css.missing ?? ""}`.trimEnd();
  const pace = `${clock(css.paceSecondsPer100)}/100 m`;
  if (css.source === "test") return `- Passo soglia (CSS): ${pace} — test del ${longDate(css.testDate ?? "")} (400 e 200 m a tutta)`;
  const points = css.points.map((p) => `${p.distanceMeters} m in ${clock(p.seconds)} il ${shortDate(p.date)}`).join("; ");
  return `- Passo soglia (CSS): ${pace} — stima dai tuoi tratti continui, affidabilità ${css.confidence} (${points}); le stime da allenamento sono di solito un po' più lente del vero`;
}

function loadLine(m: SwimMetrics): string {
  const today = m.load.today;
  if (!today) return `- Forma e fatica: non disponibile. ${m.load.missing ?? ""}`.trimEnd();
  let line = `- Forma e fatica: forma ${num(today.ctl)} · fatica ${num(today.atl)} · equilibrio ${signed(today.tsb)} (${TSB_READING_LABELS[today.reading]})`;
  if (m.load.rampPerWeek !== null) {
    line += ` · forma ${signed(m.load.rampPerWeek)} punti in 7 giorni`;
    if (m.load.rampPerWeek > SWIM_METRIC_THRESHOLDS.rampPerWeek) line += " (crescita molto rapida)";
  }
  return line;
}

function intensityLine(m: SwimMetrics): string {
  const last28 = m.intensity.last28;
  if (!last28) return `- Intensità: non disponibile. ${m.intensity.missing ?? ""}`.trimEnd();
  let line = `- Intensità (ultimi 28 giorni, zone di passo dal passo soglia): facile ${last28.easyPct}% · medio ${last28.mediumPct}% · intenso ${last28.hardPct}%`;
  if (last28.mediumPct > SWIM_METRIC_THRESHOLDS.mediumZonePct) line += " (molto lavoro in zona media)";
  return line;
}

function efficiencyLine(m: SwimMetrics): string {
  const e = m.efficiency;
  if (e.latest === null || e.avg28 === null) return `- Efficienza della bracciata: non disponibile. ${e.missing ?? ""}`.trimEnd();
  let line = `- Efficienza della bracciata (Stroke Index, vasca ${e.poolLengthMeters} m): ultima nuotata ${num(e.latest, 2)} · media 28 giorni ${num(e.avg28, 2)}`;
  if (e.baseline !== null && e.deltaPct !== null) line += ` · base ${num(e.baseline, 2)} (${signed(e.deltaPct)}%)`;
  else if (e.missing) line += ` · ${e.missing}`;
  return line;
}

function pacingLine(m: SwimMetrics): string {
  const p = m.pacing;
  if (p.cv28 === null) return `- Regolarità nelle ripetute: non disponibile. ${p.missing ?? ""}`.trimEnd();
  let line = `- Regolarità nelle ripetute (ultimi 28 giorni): variabilità ${num(p.cv28)}% (${pacingCvReading(p.cv28)})`;
  if (p.fade28 !== null) {
    line += ` · calo nel finale ${signed(p.fade28)}%`;
    if (p.fade28 > SWIM_METRIC_THRESHOLDS.pacingFadePct) line += " (cali nel finale)";
  }
  if (p.latestSet) {
    const set = p.latestSet;
    line += ` · ultima serie ${set.repSeconds.length}×${set.distanceMeters} ${STROKE_NAMES[set.stroke] ?? set.stroke} il ${shortDate(set.date)}: ${set.repSeconds.map(clock).join(", ")}`;
  }
  return line;
}

function volumeLine(m: SwimMetrics): string {
  const v = m.volume;
  const change = v.changePct === null ? "" : ` (${signed(v.changePct, 0)}% sulle 4 precedenti)`;
  return `- Volume e costanza (ultime 4 settimane complete): ${num(v.avgKm4)} km e ${num(v.avgSessions4)} nuotate a settimana${change} · serie: ${v.streakWeeks} settimane di fila con almeno 2 nuotate`;
}

function swimLine(s: SwimMetrics["sessions"][number]): string {
  const parts = [shortDate(s.date), `${num(s.distanceMeters / 1000)} km`, s.isOpenWater ? "acque libere" : `vasca ${s.poolLengthMeters ?? "?"} m`];
  if (s.intensityFactor !== null) parts.push(`IF ${num(s.intensityFactor, 2)}`);
  if (s.stss !== null) parts.push(`carico ${Math.round(s.stss)}`);
  if (s.zoneMeters) {
    const total = s.zoneMeters.reduce((sum, metres) => sum + metres, 0);
    if (total > 0) {
      parts.push(`zone ${s.zoneMeters.map((metres, i) => `Z${i + 1} ${Math.round((metres / total) * 100)}%`).join(", ")}`);
    }
  }
  return `- ${parts.join(" · ")}`;
}

/** Compact block of the six metrics and the last 5 swims. */
export function swimMetricsForCoach(m: SwimMetrics): string {
  const last5 = m.sessions.slice(-5).reverse();
  return [
    "METRICHE DI NUOTO (calcolate da SwimForge sui dati dell'atleta; confronti solo con sé stesso)",
    cssLine(m),
    loadLine(m),
    intensityLine(m),
    efficiencyLine(m),
    pacingLine(m),
    volumeLine(m),
    "ULTIME 5 NUOTATE",
    ...(last5.length ? last5.map(swimLine) : ["- nessuna nuotata negli ultimi 90 giorni"]),
  ].join("\n");
}

/** What each metric is, how it is calculated, its source and how to read it. */
export function swimMetricsGlossary(): string {
  const lines = Object.values(SWIM_METRIC_DEFINITIONS).map((d) => {
    const conventions = d.conventions?.length ? ` Convenzioni: ${d.conventions.join(" ")}` : "";
    return `- ${d.name}: ${d.measures} Calcolo: ${d.formula} Fonte: ${d.source} Lettura: ${d.howToRead}${conventions}`;
  });
  return ["GLOSSARIO DELLE METRICHE", ...lines].join("\n");
}

/** Instructions for the model about the metrics. */
export const SWIM_METRICS_COACH_RULES = [
  "- usa solo le metriche del blocco METRICHE DI NUOTO (spiegate nel GLOSSARIO) e i dati del contesto; citale quando servono;",
  "- se l'affidabilità del passo soglia è media, se è una stima o se mancano dati, dillo chiaramente;",
  "- non inventare altri indici o punteggi e non confrontare l'atleta con valori di altri nuotatori o di campioni.",
].join("\n");
