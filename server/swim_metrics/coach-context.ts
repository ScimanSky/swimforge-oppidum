/**
 * The swim metrics as text for the AI coach (chat, Coach page insights, workout generation):
 * the values with source, reliability, sample sizes and readings, the zones A1–C3 with the
 * athlete's paces and how they feel, the last swims, and a compact glossary built on the shared
 * definitions, so the coach and the interface say the same things.
 */
import {
  INTENSITY_LEVELS,
  PACE_ZONE_CODES,
  PACE_ZONES,
  SWIM_METRIC_DEFINITIONS,
  SWIM_METRIC_THRESHOLDS,
  TSB_BOUNDS,
  TSB_READING_DESCRIPTIONS,
  addDaysToKey,
  dayKey,
  pacingCvReading,
  poolLengthLabel,
  zoneRpeLabel,
  type CssPoint,
  type PaceZoneCode,
  type PaceZoneRange,
  type SwimMetrics,
  type SwimZones,
} from "@shared/swimMetrics";
import { safetyRulesText, type PoolHistory } from "../ai_coach_safety";

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

/** «più lento di 2:08», «2:01–2:08», «più veloce di 1:44» (per 100 m). */
export function zonePaceText(range: Pick<PaceZoneRange, "fastPace" | "slowPace">): string {
  if (range.slowPace === null) return `più lento di ${clock(range.fastPace!)}`;
  if (range.fastPace === null) return `più veloce di ${clock(range.slowPace)}`;
  return `${clock(range.fastPace)}–${clock(range.slowPace)}`;
}

function zonesHeader(m: SwimMetrics): string {
  const tail = "valgono per lo stile libero; dalla più lenta alla più esplosiva";
  if (m.zones.source === "manuali") {
    return `ZONE DI PASSO A1–C3 (zone manuali inserite dall'atleta, al posto di quelle dal passo soglia; ${tail})`;
  }
  const css = m.css.current;
  if (m.zones.source === "auto" && css) {
    return `ZONE DI PASSO A1–C3 (zone automatiche dal passo soglia ${clock(css.paceSecondsPer100)}/100 m, ${css.source}; ${tail})`;
  }
  return "ZONE DI PASSO A1–C3 (passi non disponibili: servono il passo soglia o le zone dell'atleta; usa livello e fatica percepita)";
}

/**
 * The seven zones with the athlete's paces (never speed percentages), level, maximum rep, how
 * they feel and what they train: the coach explains each zone it uses with these words.
 */
function zonesBlock(m: SwimMetrics): string[] {
  const ranges = new Map(m.zones.ranges.map((range) => [range.code, range]));
  return [
    zonesHeader(m),
    ...PACE_ZONES.map((zone) => {
      const range = ranges.get(zone.code);
      const pace = range ? `: ${zonePaceText(range)}/100 m` : "";
      const maxRep = zone.maxRepMeters ? ` · max ${zone.maxRepMeters} m a ripetuta` : "";
      return `- ${zone.code} ${zone.name} · livello ${zone.level}${pace}${maxRep} · ${zone.breathing}, ${zone.talkTest}, RPE ${zoneRpeLabel(zone)} · ${zone.purpose}`;
    }),
  ];
}

/** «A1 30%, A2 42%, …» for the zones with metres (whole percent of the zoned metres). */
function zoneShares(zoneMeters: number[]): string | null {
  const total = zoneMeters.reduce((sum, metres) => sum + metres, 0);
  if (total <= 0) return null;
  return zoneMeters
    .map((metres, index) => (metres > 0 ? `${PACE_ZONE_CODES[index]} ${Math.round((metres / total) * 100)}%` : null))
    .filter((part) => part !== null)
    .join(", ");
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
  if (m.load.threshold?.source === "zone manuali") {
    line += ` · soglia del carico: confine B2/C1 delle zone manuali (${clock(m.load.threshold.paceSecondsPer100)}/100 m), perché manca il passo soglia`;
  }
  return line;
}

function intensityLine(m: SwimMetrics): string {
  const last28 = m.intensity.last28;
  if (!last28) return `- Intensità: non disponibile. ${m.intensity.missing ?? ""}`.trimEnd();
  let line = `- Intensità (ultimi 28 giorni, zone A1–C3, solo stile libero): facile (A1–A2) ${last28.easyPct}% · medio (B1–B2) ${last28.mediumPct}% · intenso (C1–C3) ${last28.hardPct}%`;
  if (last28.mediumPct > SWIM_METRIC_THRESHOLDS.mediumZonePct) line += " (molto lavoro in zona media)";
  const shares = zoneShares(last28.zoneMeters);
  if (shares) line += ` · per zona ${shares}`;
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
  const shares = s.zoneMeters ? zoneShares(s.zoneMeters) : null;
  if (shares) parts.push(`zone ${shares}`);
  return `- ${parts.join(" · ")}`;
}

/** Compact block of the six metrics, the zones A1–C3 and the last 5 swims. */
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
    ...zonesBlock(m),
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
    `- ${d.intensity.name}: zone A1–C3 (passi e sensazioni nel blocco ZONE), solo stile libero; facile = A1–A2, medio = B1–B2, intenso = C1–C3; medio oltre il ${t.mediumZonePct}% = molto lavoro medio (Seiler).`,
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
  "- per i passi delle serie usa le zone A1–C3 del blocco ZONE DI PASSO, in m:ss/100 m, mai solo percentuali della velocità; le zone valgono per lo stile libero;",
  "- se il calo nel finale o il calo della distanza per bracciata sono alti, proponi una progressione della resistenza (ripetute brevi con poco recupero → serie spezzate → nuoto continuo) ed esercizi tecnici per allungare la bracciata (es. conteggio delle bracciate, scivolamento, catch-up); non limitarti a «nuota di più»;",
  "- non inventare altri indici o punteggi e non confrontare l'atleta con valori di altri nuotatori o di campioni.",
].join("\n");

const MAX_REP_LIMITS = PACE_ZONES.filter((zone) => zone.maxRepMeters !== null)
  .map((zone) => `${zone.code} ${zone.maxRepMeters} m`)
  .join(", ");

/** The pace of a zone of the athlete («1:49–1:54/100 m»), or «m:ss–m:ss/100 m» without zones. */
export function zonePaceOrPlaceholder(zones: SwimZones | null, code: PaceZoneCode): string {
  const range = zones?.source ? zones.ranges.find((candidate) => candidate.code === code) : undefined;
  return `${range ? zonePaceText(range) : "m:ss–m:ss"}/100 m`;
}

/**
 * How the coach writes workouts with the zones A1–C3 (chat and workout generation): every rep
 * with zone, level and pace (the example with the athlete's own B2), within the maximum rep and
 * the safety limits, each zone explained in plain words.
 */
export function paceZoneCoachRules(zones: SwimZones | null, history: PoolHistory | null = null): string {
  const b2 = zonePaceOrPlaceholder(zones, "B2").replace("/100 m", "");
  return [
    `- ogni ripetuta di un allenamento che proponi ha il codice della zona, il livello e il passo obiettivo dalle zone dell'atleta, per esempio «6×100 B2 · Soglia ${b2}, rec. 20″»; senza passi (manca il passo soglia) usa zona, livello e fatica percepita (RPE) e dillo;`,
    `- non superare mai la ripetuta massima: ${MAX_REP_LIMITS} (per esempio non 4×300 in C1, ma 8×150);`,
    ...(history?.usualPoolLengthMeters && history.usualPoolLengthMeters >= 45
      ? ["- l'atleta nuota in vasca da 50 m: il C3 si fa su una vasca, 25 m sprint + 25 m facile (repMeters 50);"]
      : []),
    `- ${safetyRulesText(history)};`,
    "- l'atleta sta imparando le zone e il suo allenatore non le usa: spiega in breve, con parole semplici, ogni zona che usi: sensazione (respiro, quanto riesci a parlare, fatica da 1 a 10), passo e a cosa serve;",
    `- l'allenamento deve potersi seguire anche senza conoscere le zone: accanto al codice scrivi sempre il livello (${INTENSITY_LEVELS.join(", ")}) e il passo;`,
    "- le zone valgono per lo stile libero senza attrezzi: negli altri stili, nella tecnica, nelle gambe e con pinne, palette o pull buoy usa zona e livello come sensazione di sforzo, senza passo.",
  ].join("\n");
}
