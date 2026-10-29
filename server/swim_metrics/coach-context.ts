/**
 * The swim metrics as text for the AI coach (chat, Coach page insights, workout generation):
 * the values with source, reliability, sample sizes and readings, the zones as paces, the last
 * swims, and a compact glossary built on the shared definitions, so the coach and the interface
 * say the same things.
 */
import {
  SWIM_METRIC_DEFINITIONS,
  SWIM_METRIC_THRESHOLDS,
  TSB_BOUNDS,
  TSB_READING_DESCRIPTIONS,
  addDaysToKey,
  dayKey,
  pacingCvReading,
  poolLengthLabel,
  zonePaceRanges,
  type CssPoint,
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

/** m:ss from seconds (the total is rounded first: 119.6 is 2:00). */
function clock(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** «06/10» from «2026-10-06». */
const shortDate = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
/** «20/10/2026» from «2026-10-20». */
const longDate = (day: string) => `${shortDate(day)}/${day.slice(0, 4)}`;

/** «200 m» or «200 yd»: the matched CSS distance when known, else the metres. */
const distanceLabel = (p: CssPoint) =>
  p.nominalDistance ? `${p.nominalDistance} ${p.distanceUnit ?? "m"}` : `${p.distanceMeters} m`;

function cssLine(m: SwimMetrics): string {
  const css = m.css.current;
  if (!css) return `- Passo soglia (CSS): non disponibile. ${m.css.missing ?? ""}`.trimEnd();
  const pace = `${clock(css.paceSecondsPer100)}/100 m`;
  if (css.source === "test") return `- Passo soglia (CSS): ${pace} — test del ${longDate(css.testDate ?? "")} (400 e 200 m a tutta)`;
  const points = css.points.map((p) => `${distanceLabel(p)} in ${clock(p.seconds)} il ${shortDate(p.date)}`).join("; ");
  const dropped = (css.droppedPoints ?? [])
    .map((p) => `; scartato ${distanceLabel(p)} in ${clock(p.seconds)} il ${shortDate(p.date)} (più lento del tuo ${distanceLabel(p.slowerThan)})`)
    .join("");
  return `- Passo soglia (CSS): ${pace} — stima dai tuoi tratti continui, affidabilità ${css.confidence} (${points}${dropped}); le stime da allenamento sono di solito un po' più lente del vero`;
}

/** The zone boundaries as paces for today's CSS (never speed percentages alone). */
function zonesLine(m: SwimMetrics): string | null {
  const css = m.css.current;
  if (!css) return null;
  const zones = zonePaceRanges(css.paceSecondsPer100).map(({ zone, name, fastPace, slowPace }) => {
    const label = `Z${zone} ${name}`;
    if (slowPace === null) return `${label} più lento di ${clock(fastPace!)}`;
    if (fastPace === null) return `${label} più veloce di ${clock(slowPace)}`;
    return `${label} ${clock(fastPace)}–${clock(slowPace)}`;
  });
  return `- Zone di passo per questo passo soglia (solo stile libero): ${zones.join(" · ")} (per 100 m)`;
}

/** Swims with a load in the last 42 days (the «forma» window) and how many had no laps. */
function loadSample(m: SwimMetrics): string | null {
  const today = dayKey(new Date(m.generatedAt));
  const from = addDaysToKey(today, -41);
  const withLoad = m.sessions.filter((s) => s.date >= from && s.date <= today && s.stss !== null);
  if (withLoad.length === 0) return null;
  const estimated = withLoad.filter((s) => s.loadEstimated).length;
  const lapLess = estimated > 0 ? `, ${estimated} senza giri (stimato su distanza e durata totale)` : "";
  return `carico di ${withLoad.length} nuotate nelle ultime 6 settimane${lapLess}`;
}

function loadLine(m: SwimMetrics): string {
  const today = m.load.today;
  if (!today) return `- Forma e fatica: non disponibile. ${m.load.missing ?? ""}`.trimEnd();
  let line = `- Forma e fatica: forma ${num(today.ctl)} · fatica ${num(today.atl)} · equilibrio ${signed(today.tsb)} (${TSB_READING_DESCRIPTIONS[today.reading]}), cioè forma − fatica a fine di ieri`;
  if (m.load.rampPerWeek !== null) {
    line += ` · forma ${signed(m.load.rampPerWeek)} punti in 7 giorni`;
    if (m.load.rampPerWeek > SWIM_METRIC_THRESHOLDS.rampPerWeek) line += " (crescita molto rapida)";
  }
  const sample = loadSample(m);
  if (sample) line += ` · ${sample}`;
  return line;
}

function intensityLine(m: SwimMetrics): string {
  const last28 = m.intensity.last28;
  if (!last28) return `- Intensità: non disponibile. ${m.intensity.missing ?? ""}`.trimEnd();
  let line = `- Intensità (ultimi 28 giorni, zone di passo dal passo soglia, solo stile libero): facile ${last28.easyPct}% · medio ${last28.mediumPct}% · intenso ${last28.hardPct}%`;
  if (last28.mediumPct > SWIM_METRIC_THRESHOLDS.mediumZonePct) line += " (molto lavoro in zona media)";
  if (last28.coveragePct !== undefined) {
    const unclassified = last28.unclassifiedMeters
      ? ` (non classificati ${num(last28.unclassifiedMeters / 1000)} km: altri stili, tecnica, gambe)`
      : "";
    line += ` · copertura ${last28.coveragePct}% del volume${unclassified}`;
  }
  return line;
}

/** A longer stroke, a shorter one, or the same stroke at another pace. */
function dpsReading(changePct: number): string {
  if (changePct >= 1) return "più strada per bracciata";
  if (changePct <= -1) return "bracciata più corta";
  return "distanza per bracciata invariata, lo Stroke Index cambia per il passo";
}

function efficiencyLine(m: SwimMetrics): string {
  const e = m.efficiency;
  if (e.latest === null || e.avg28 === null) return `- Efficienza della bracciata: non disponibile. ${e.missing ?? ""}`.trimEnd();
  const n28 = e.n28 !== undefined ? ` su ${e.n28} nuotate` : "";
  let line = `- Efficienza della bracciata (Stroke Index, vasca ${poolLengthLabel(e.poolLengthMeters)}): ultima nuotata ${num(e.latest, 2)} · mediana 28 giorni ${num(e.avg28, 2)}${n28}`;
  if (e.baseline !== null && e.deltaPct !== null) {
    const nBase = e.nBaseline !== undefined ? ` su ${e.nBaseline} nuotate` : "";
    line += ` · base ${num(e.baseline, 2)}${nBase} (${signed(e.deltaPct)}%)`;
  } else if (e.missing) {
    line += ` · ${e.missing}`;
  }
  if (e.dps28 != null) {
    line += ` · distanza per bracciata ${num(e.dps28, 2)} m`;
    if (e.dpsBaseline != null && e.dpsBaseline > 0) {
      const change = ((e.dps28 - e.dpsBaseline) / e.dpsBaseline) * 100;
      line += ` (base ${num(e.dpsBaseline, 2)} m, ${signed(change)}%: ${dpsReading(change)})`;
    }
  }
  if (e.pace28 != null) {
    line += ` · passo ${clock(e.pace28)}/100 m`;
    if (e.paceBaseline != null) line += ` (base ${clock(e.paceBaseline)}/100 m)`;
  }
  return line;
}

const shortening = (dropPct: number) => dropPct > SWIM_METRIC_THRESHOLDS.dpsDropPct;

function pacingLine(m: SwimMetrics): string {
  const p = m.pacing;
  const name = SWIM_METRIC_DEFINITIONS.pacing.name;
  if (p.cv28 === null) return `- ${name}: non disponibile. ${p.missing ?? ""}`.trimEnd();
  let line = `- ${name} (ultimi 28 giorni): variabilità ${num(p.cv28)}% (${pacingCvReading(p.cv28)})`;
  if (p.fade28 !== null) {
    line += ` · calo nel finale ${signed(p.fade28)}%`;
    if (p.fade28 > SWIM_METRIC_THRESHOLDS.pacingFadePct) line += " (cali nel finale)";
  }
  if (p.dpsDrop28 != null) {
    line += ` · distanza per bracciata nel finale ${signed(-p.dpsDrop28)}%`;
    if (shortening(p.dpsDrop28)) line += " (la bracciata si accorcia nel finale)";
    if (p.strokeRateRise28 != null) line += ` · frequenza ${signed(p.strokeRateRise28)}%`;
  }
  if (p.latestSet) {
    const set = p.latestSet;
    line += ` · ultima serie ${set.repSeconds.length}×${set.distanceMeters} ${STROKE_NAMES[set.stroke] ?? set.stroke} il ${shortDate(set.date)}: ${set.repSeconds.map(clock).join(", ")}`;
    if (set.repDps && set.repDps.length > 0) {
      const drop =
        set.dpsDropPct != null
          ? `: ${signed(-set.dpsDropPct)}%${shortening(set.dpsDropPct) ? ", la bracciata si accorcia nel finale" : ""}`
          : "";
      line += ` (distanza per bracciata ${set.repDps.map((d) => num(d, 2)).join(", ")} m${drop})`;
    }
  }
  return line;
}

function volumeLine(m: SwimMetrics): string {
  const v = m.volume;
  const change = v.changePct === null ? "" : ` (${signed(v.changePct, 0)}% sulle 4 precedenti)`;
  return `- Volume e costanza (ultime 4 settimane complete): ${num(v.avgKm4)} km e ${num(v.avgSessions4)} nuotate a settimana${change} · serie: ${v.streakWeeks} settimane di fila con almeno 2 nuotate`;
}

function swimLine(s: SwimMetrics["sessions"][number]): string {
  const parts = [shortDate(s.date), `${num(s.distanceMeters / 1000)} km`, s.isOpenWater ? "acque libere" : `vasca ${poolLengthLabel(s.poolLengthMeters)}`];
  if (s.intensityFactor !== null) parts.push(`IF ${num(s.intensityFactor, 2)}`);
  if (s.stss !== null) parts.push(`carico ${Math.round(s.stss)}${s.loadEstimated ? " (stimato, senza giri)" : ""}`);
  if (s.zoneMeters) {
    const total = s.zoneMeters.reduce((sum, metres) => sum + metres, 0);
    if (total > 0) {
      parts.push(`zone ${s.zoneMeters.map((metres, i) => `Z${i + 1} ${Math.round((metres / total) * 100)}%`).join(", ")}`);
    }
  }
  return `- ${parts.join(" · ")}`;
}

/** Compact block of the six metrics, the zone paces and the last 5 swims. */
export function swimMetricsForCoach(m: SwimMetrics): string {
  const last5 = m.sessions.slice(-5).reverse();
  return [
    "METRICHE DI NUOTO (calcolate da SwimForge sui dati dell'atleta; confronti solo con sé stesso)",
    cssLine(m),
    zonesLine(m),
    loadLine(m),
    intensityLine(m),
    efficiencyLine(m),
    pacingLine(m),
    volumeLine(m),
    "ULTIME 5 NUOTATE",
    ...(last5.length ? last5.map(swimLine) : ["- nessuna nuotata negli ultimi 90 giorni"]),
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

/**
 * Compact glossary for every coach turn (≤ 1,500 characters): what each metric is, its source
 * and the readings. The interface keeps the full definitions (SWIM_METRIC_DEFINITIONS).
 */
export function swimMetricsGlossary(): string {
  const d = SWIM_METRIC_DEFINITIONS;
  const t = SWIM_METRIC_THRESHOLDS;
  const b = TSB_BOUNDS;
  const lines = [
    `- ${d.css.name}: passo/100 m sostenibile a lungo; velocità critica (Wakayoshi 1992) dai migliori tratti continui a stile libero, o test 400/200 (Ginn 1993); le stime sono di solito un po' più lente del vero.`,
    `- ${d.load.name}: carico (sTSS, TrainingPeaks) = IF³ × ore × 100 sui giri nuotati; giri non a stile libero IF 0,80 (convenzione nostra); forma 42 giorni, fatica 7, equilibrio = forma − fatica a fine di ieri: sopra +${b.veryRestedAbove} molto riposato, da +${b.freshAbove} a +${b.veryRestedAbove} fresco, da ${signed(b.neutralFrom, 0)} a +${b.freshAbove} neutro, da ${signed(b.buildingFrom, 0)} a ${signed(b.neutralFrom, 0)} in costruzione, sotto ${signed(b.buildingFrom, 0)} carico alto.`,
    `- ${d.intensity.name}: zone Z1–Z5 dal passo soglia, solo stile libero (passi nel blocco sopra); Z3 oltre il ${t.mediumZonePct}% = molto lavoro medio (Seiler).`,
    `- ${d.efficiency.name}: Stroke Index = velocità × distanza per bracciata (Costill 1985), contro la tua base nella stessa vasca; se sale ma la distanza per bracciata no, vai solo più veloce.`,
    `- ${d.pacing.name}: variabilità sotto 2% molto regolare, 2–4% regolare, oltre irregolare; calo nel finale oltre ${t.pacingFadePct}%; distanza per bracciata che cala oltre ${t.dpsDropPct}% = la bracciata si accorcia con la fatica (Craig e Pendergast 1979).`,
    `- ${d.volume.name}: km e nuotate a settimana; serie = settimane di fila con almeno 2 nuotate.`,
  ];
  return ["GLOSSARIO DELLE METRICHE (breve)", ...lines].join("\n");
}

/** Instructions for the model about the metrics. */
export const SWIM_METRICS_COACH_RULES = [
  "- usa solo le metriche del blocco METRICHE DI NUOTO (spiegate nel GLOSSARIO) e i dati del contesto; citale quando servono;",
  "- se l'affidabilità del passo soglia è media, se è una stima o se mancano dati, dillo chiaramente;",
  "- per i passi delle serie usa le zone di passo in m:ss/100 m del blocco METRICHE, mai solo percentuali della velocità; le zone valgono per lo stile libero;",
  "- se il calo nel finale o il calo della distanza per bracciata sono alti, proponi una progressione della resistenza (ripetute brevi con poco recupero → serie spezzate → nuoto continuo) ed esercizi tecnici per allungare la bracciata (es. conteggio delle bracciate, scivolamento, catch-up); non limitarti a «nuota di più»;",
  "- non inventare altri indici o punteggi e non confrontare l'atleta con valori di altri nuotatori o di campioni.",
].join("\n");
