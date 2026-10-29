/**
 * What the «Metriche» cards of Statistiche show: header value and reading, data basis and the
 * text summaries of the charts, from the server's `SwimMetrics`. Definitions, readings and
 * thresholds come from `shared/swimMetrics.ts`; this file only formats them in Italian.
 */

import {
  addDaysToKey,
  dayKey,
  INTENSITY_LEVELS,
  levelMeters,
  levelRanges,
  PACE_ZONES,
  pacingCvReading,
  poolLengthLabel,
  SWIM_METRIC_THRESHOLDS,
  TSB_READING_DESCRIPTIONS,
  TSB_READING_LABELS,
  type CssPoint,
  type CssResult,
  type IntensityLevel,
  type PaceZoneCode,
  type SessionMetrics,
  type SwimMetricKey,
  type SwimMetrics,
  type SwimZones,
  type Zones7,
} from "@shared/swimMetrics"
import {
  formatDayMonth,
  formatDecimal,
  formatDistance,
  formatInteger,
  formatKm,
  formatPaceValue,
  formatSignedInteger,
} from "@/lib/format"
import { STROKE_LABELS } from "@/lib/profile-stats"

export const METRIC_ORDER: readonly SwimMetricKey[] = [
  "css",
  "load",
  "intensity",
  "efficiency",
  "pacing",
  "volume",
]


export type MetricHeader = {
  /** Main value; null shows «—». */
  value: string | null
  unit?: string
  /** Short reading next to the value. */
  reading: string | null
  /** What the numbers are computed on, one sentence. */
  basis: string | null
  /** What is missing (shown when the card is open), from the server or ours. */
  missing: string | null
  /** Today's value read with the conventions, after «Come si legge» (open card). */
  readingNow?: string | null
}

// ─── Dates and times ────────────────────────────────────────────────────────

/** Local noon of a «YYYY-MM-DD» key: the same calendar day in any time zone. */
export const dateOfKey = (key: string) => {
  const [year, month, day] = key.split("-").map(Number)
  return new Date(year, month - 1, day, 12)
}

/** «2026-10-12» → «12 ott». */
export const formatKeyDayMonth = (key: string) => formatDayMonth(dateOfKey(key))

const monthFmt = {
  short: new Intl.DateTimeFormat("it-IT", { month: "short" }),
  long: new Intl.DateTimeFormat("it-IT", { month: "long" }),
}

/** «2026-10» → «ott» or «ottobre». */
export const formatMonthKey = (key: string, style: "short" | "long" = "short") =>
  monthFmt[style].format(dateOfKey(`${key}-15`))

/** Seconds → «6:20» (minutes and seconds, rounded to the second). */
export const formatClock = (seconds: number) => formatPaceValue(seconds)

/** «+2,1», «−0,4», «0,0». */
export const formatSignedDecimal = (value: number, digits: number) =>
  value > 0 && formatDecimal(value, digits) !== formatDecimal(0, digits)
    ? `+${formatDecimal(value, digits)}`
    : formatDecimal(value, digits)

/** «1 nuotata», «3 nuotate». */
export const formatSwims = (count: number) =>
  `${formatInteger(count)} ${count === 1 ? "nuotata" : "nuotate"}`
const weeks = (count: number) => `${formatInteger(count)} ${count === 1 ? "settimana" : "settimane"}`
const kmOf = (meters: number) => `${formatKm(meters)} km`

/** Today and the first day of the last 28 days, on the server's calendar (Rome). */
const windowOf = (m: SwimMetrics) => {
  const today = dayKey(new Date(m.generatedAt))
  return { today, from28: addDaysToKey(today, -27) }
}

const inLast28 = (m: SwimMetrics) => {
  const { from28 } = windowOf(m)
  return (session: SessionMetrics) => session.date >= from28
}

const median = (values: number[]) => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** Lower-case stroke name for «6 × 100 m stile libero»; empty when unknown. */
export const strokeName = (stroke: string) =>
  stroke === "drill" ? "esercizi" : (STROKE_LABELS[stroke]?.toLowerCase() ?? "")

// ─── Passo soglia ───────────────────────────────────────────────────────────

/**
 * How each source of the CSS reads in the header and in the data basis. A new source (e.g.
 * Garmin) is one more entry; TypeScript asks for it when the shared type grows.
 */
const CSS_SOURCES: Record<CssResult["source"], { reading: (css: CssResult) => string; basis: (css: CssResult) => string }> = {
  stima: {
    reading: css => (css.confidence ? `stima, affidabilità ${css.confidence}` : "stima"),
    basis: css =>
      `Stima su ${formatInteger(css.points.length)} tratti continui a stile libero in vasca degli ultimi 90 giorni.`,
  },
  test: {
    reading: css => (css.testDate ? `test del ${formatKeyDayMonth(css.testDate)}` : "test"),
    basis: css => (css.testDate ? `Dal tuo test del ${formatKeyDayMonth(css.testDate)}.` : "Dal tuo test."),
  },
}

/** «stima, affidabilità media» or «test del 12 ott». */
export const cssReadingText = (css: CssResult) => CSS_SOURCES[css.source].reading(css)

function cssHeader(m: SwimMetrics): MetricHeader {
  const css = m.css.current
  if (!css) return { value: null, reading: null, basis: null, missing: m.css.missing }
  const source = CSS_SOURCES[css.source]
  return {
    value: formatPaceValue(css.paceSecondsPer100),
    unit: "/100 m",
    reading: source.reading(css),
    basis: source.basis(css),
    missing: null,
  }
}

/** «400 m», or «200 yd» for an effort in a 25-yard pool (the CSS distance it matched). */
export const cssDistanceLabel = (point: CssPoint) =>
  point.distanceUnit === "yd" && point.nominalDistance
    ? `${formatInteger(point.nominalDistance)} yd`
    : `${formatInteger(point.nominalDistance ?? point.distanceMeters)} m`

/** Pace per 100 m (real metres) of an effort. */
const cssPointPace = (point: CssPoint) => (point.seconds / point.distanceMeters) * 100

/** «400 m in 6:57 · 20 ott». */
export const cssPointLabel = (point: CssPoint) =>
  `${cssDistanceLabel(point)} in ${formatClock(point.seconds)} · ${formatKeyDayMonth(point.date)}`

/** «300 m in 5:56 · 29 set, a 1:59/100 m: più lento del tuo 400 m (1:44/100 m)». */
export const cssDroppedLabel = (point: NonNullable<CssResult["droppedPoints"]>[number]) =>
  `${cssPointLabel(point)}, a ${formatPaceValue(cssPointPace(point))}/100 m: più lento del tuo ${cssDistanceLabel(
    point.slowerThan
  )} (${formatPaceValue(cssPointPace(point.slowerThan))}/100 m)`

/** The fitted line of an estimate: «Retta … su 2 tratti: riserva D′ 16 m, R² 1,00 …»; null for a test. */
export function cssFitText(css: CssResult): string | null {
  if (css.source !== "stima" || css.dPrimeMeters == null || css.r2 == null) return null
  const twoPoints = css.points.length === 2 ? " (con due tratti la retta passa per entrambi: R² è sempre 1)" : ""
  return `Retta distanza = velocità × tempo + D′ su ${formatInteger(css.points.length)} tratti: riserva D′ ${formatInteger(
    css.dPrimeMeters
  )} m, R² ${formatDecimal(css.r2, 2)}${twoPoints}.`
}

export function cssChartSummary(history: SwimMetrics["css"]["history"]): string {
  const months = history.map(
    entry =>
      `${formatMonthKey(entry.month, "long")} ${
        entry.paceSecondsPer100 === null ? "nessuna stima" : formatPaceValue(entry.paceSecondsPer100)
      }`
  )
  return `Passo soglia a fine mese, per 100 m: ${months.join(", ")}.`
}

// ─── Forma e fatica ─────────────────────────────────────────────────────────

function loadHeader(m: SwimMetrics): MetricHeader {
  const today = m.load.today
  if (!today) return { value: null, reading: null, basis: null, missing: m.load.missing }
  const counted = m.sessions.filter(session => session.stss !== null).length
  return {
    value: formatSignedInteger(today.tsb),
    reading: TSB_READING_LABELS[today.reading],
    basis: `Carico di ${formatSwims(counted)} degli ultimi 90 giorni (la curva parte da 180 giorni fa).${
      m.load.threshold?.source === "zone manuali"
        ? ` Con le tue zone, la soglia del carico è il loro confine tra B2 e C1 (${formatPaceValue(
            m.load.threshold.paceSecondsPer100
          )}), anche quando c'è un passo soglia.`
        : ""
    }`,
    missing: m.load.missing,
    readingNow: `Oggi l'equilibrio è ${formatSignedInteger(today.tsb)}: ${TSB_READING_DESCRIPTIONS[today.reading]}.`,
  }
}

/** «2 nuotate senza giri: carico stimato …» for the swims of the 90 days whose load is estimated. */
export function loadEstimatedText(m: SwimMetrics): string | null {
  const estimated = m.sessions.filter(session => session.loadEstimated && session.stss !== null).length
  if (estimated === 0) return null
  return `${formatSwims(estimated)} senza giri: carico stimato su distanza e durata totale, come fa TrainingPeaks.`
}

/** «Forma +2,1 punti nell'ultima settimana», with the convention when it grows too fast. */
export function loadRampText(ramp: number | null): string | null {
  if (ramp === null) return null
  const text = `Forma ${formatSignedDecimal(ramp, 1)} punti nell'ultima settimana`
  return ramp > SWIM_METRIC_THRESHOLDS.rampPerWeek ? `${text}: crescita molto rapida.` : `${text}.`
}

export function loadChartSummary(load: SwimMetrics["load"]): string | null {
  if (!load.today || load.days.length === 0) return null
  const first = load.days[0]
  return `Ultimi 90 giorni: forma da ${formatInteger(first.ctl)} a ${formatInteger(load.today.ctl)}, fatica ${formatInteger(
    load.today.atl
  )}, equilibrio ${formatSignedInteger(load.today.tsb)} (${TSB_READING_LABELS[load.today.reading]}).`
}

// ─── Intensità ──────────────────────────────────────────────────────────────

const zoneSum = (zones: Zones7, from: number, to: number) =>
  zones.slice(from, to + 1).reduce((sum, meters) => sum + meters, 0)

function intensityHeader(m: SwimMetrics): MetricHeader {
  const last28 = m.intensity.last28
  if (!last28) return { value: null, reading: null, basis: null, missing: m.intensity.missing }
  const counted = m.sessions.filter(session => session.zoneMeters && inLast28(m)(session)).length
  const total = zoneSum(last28.zoneMeters, 0, 6)
  // «64% in zona A · 16% B · 20% C»: the zone letters, never the level words.
  const shares = `${formatInteger(last28.mediumPct)}% B · ${formatInteger(last28.hardPct)}% C`
  return {
    value: `${formatInteger(last28.easyPct)}%`,
    unit: "in zona A",
    reading:
      last28.mediumPct > SWIM_METRIC_THRESHOLDS.mediumZonePct ? `${shares}: molto lavoro in zona B` : shares,
    basis: `Su ${formatSwims(counted)} in vasca con i giri degli ultimi 28 giorni: ${kmOf(total)} a stile libero nelle zone.`,
    missing: m.intensity.missing,
  }
}

/** The swims of the 28 days whose metres are not zoned at all, by reason. */
const UNZONED_SWIMS: { label: string; matches: (session: SessionMetrics) => boolean }[] = [
  { label: "in acque libere", matches: session => session.isOpenWater },
  { label: "di nuotate senza giri", matches: session => !session.isOpenWater && !session.hasLaps },
  { label: "di nuotate senza passo soglia", matches: session => !session.isOpenWater && session.hasLaps },
]

/**
 * How much of the 28 days' volume the zones cover, and what stays out: «Zone calcolate sul 72% del
 * volume delle ultime 4 settimane. Fuori dalle zone: 1,2 km di altri stili, tecnica o gambe; 2 km
 * in acque libere.» Null without zones.
 */
export function intensityCoverageText(m: SwimMetrics): string | null {
  const last28 = m.intensity.last28
  if (!last28 || last28.coveragePct === undefined) return null
  if (last28.coveragePct >= 100) return "Zone calcolate su tutto il volume delle ultime 4 settimane."
  const recent = m.sessions.filter(inLast28(m)).filter(session => session.zoneMeters === null)
  const outside = [
    last28.unclassifiedMeters ? `${formatDistance(last28.unclassifiedMeters)} di altri stili, tecnica o gambe` : null,
    ...UNZONED_SWIMS.map(({ label, matches }) => {
      const meters = recent.filter(matches).reduce((sum, session) => sum + session.distanceMeters, 0)
      return meters > 0 ? `${formatDistance(meters)} ${label}` : null
    }),
  ].filter(part => part !== null)
  const coverage = `Zone calcolate sul ${formatInteger(last28.coveragePct)}% del volume delle ultime 4 settimane.`
  return outside.length > 0 ? `${coverage} Fuori dalle zone: ${outside.join("; ")}.` : coverage
}

/** The intensity card shows the seven zones A1–C3 or the five levels aligned to them. */
export type ZoneView = "zone" | "livelli"

/** Fill of each zone (`--pace-*`, cool to warm). Colour is never the only cue: names stay. */
export const PACE_ZONE_COLOR: Record<PaceZoneCode, string> = {
  A1: "var(--pace-a1)",
  A2: "var(--pace-a2)",
  B1: "var(--pace-b1)",
  B2: "var(--pace-b2)",
  C1: "var(--pace-c1)",
  C2: "var(--pace-c2)",
  C3: "var(--pace-c3)",
}

/** A level takes the colour of one of its zones (Soglia the amber of C1, Sopra soglia the orange of C2). */
export const LEVEL_COLOR: Record<IntensityLevel, string> = {
  Facile: PACE_ZONE_COLOR.A1,
  Aerobico: PACE_ZONE_COLOR.A2,
  Medio: PACE_ZONE_COLOR.B1,
  Soglia: PACE_ZONE_COLOR.C1,
  "Sopra soglia": PACE_ZONE_COLOR.C2,
}

/** «più lento di 2:08», «2:01–2:08», «più veloce di 1:44» (per 100 m). */
export function formatZonePace(range: { fastPace: number | null; slowPace: number | null }): string {
  if (range.slowPace === null) return `più lento di ${formatPaceValue(range.fastPace!)}`
  if (range.fastPace === null) return `più veloce di ${formatPaceValue(range.slowPace)}`
  return `${formatPaceValue(range.fastPace)}–${formatPaceValue(range.slowPace)}`
}

export type ZoneTableRow = {
  key: string
  /** «B2 Fondo medio-alto» or «Soglia». */
  label: string
  /** The level of a zone, or the zones of a level («B2 e C1»). */
  detail: string
  pace: string
  /** «max 200 m» for C1–C3. */
  maxRep: string | null
  color: string
}

const joinCodes = (codes: readonly string[]) =>
  codes.length > 1 ? `${codes.slice(0, -1).join(", ")} e ${codes[codes.length - 1]}` : codes[0]

/** The zones in effect as rows of the table: seven zones or five levels, with the user's paces. */
export function zoneTableRows(zones: SwimZones, view: ZoneView): ZoneTableRow[] {
  if (view === "livelli") {
    return levelRanges(zones.ranges).map(range => ({
      key: range.level,
      label: range.level,
      detail: joinCodes(range.codes),
      pace: formatZonePace(range),
      maxRep: null,
      color: LEVEL_COLOR[range.level],
    }))
  }
  return zones.ranges.map(range => ({
    key: range.code,
    label: `${range.code} ${range.name}`,
    detail: range.level,
    pace: formatZonePace(range),
    maxRep: range.maxRepMeters ? `max ${formatInteger(range.maxRepMeters)} m` : null,
    color: PACE_ZONE_COLOR[range.code],
  }))
}

export type ZoneShareItem = { key: string; label: string; meters: number; color: string }

/** Metres per zone (A1..C3) or per level, labelled and coloured, for the split bar and the legend. */
export function zoneShareItems(zoneMeters: Zones7, view: ZoneView): ZoneShareItem[] {
  if (view === "livelli") {
    const meters = levelMeters(zoneMeters)
    return INTENSITY_LEVELS.map((level, index) => ({
      key: level,
      label: level,
      meters: meters[index],
      color: LEVEL_COLOR[level],
    }))
  }
  return PACE_ZONES.map((zone, index) => ({
    key: zone.code,
    label: `${zone.code} ${zone.name}`,
    meters: zoneMeters[index],
    color: PACE_ZONE_COLOR[zone.code],
  }))
}

/** Where the zones come from: the threshold pace and its source, or the user's own bounds. */
export function zonesSourceText(m: SwimMetrics): string | null {
  if (m.zones.source === "manuali") {
    return m.zones.manualUpdatedAt
      ? `Le tue zone, inserite il ${formatDayMonth(m.zones.manualUpdatedAt)}.`
      : "Le tue zone, inserite da te."
  }
  const css = m.css.current
  if (m.zones.source !== "auto" || !css) return null
  return `Calcolate dal tuo passo soglia ${formatPaceValue(css.paceSecondsPer100)} (${cssReadingText(
    css
  )}), che è il confine tra B2 e C1.`
}

export function intensityChartSummary(weeksData: SwimMetrics["intensity"]["weeks"], view: ZoneView): string {
  const total = weeksData.reduce(
    (sum, week) => week.zoneMeters.map((meters, index) => sum[index] + meters) as Zones7,
    [0, 0, 0, 0, 0, 0, 0] as Zones7
  )
  const unclassified = weeksData.reduce((sum, week) => sum + (week.unclassifiedMeters ?? 0), 0)
  const zoned =
    view === "livelli"
      ? `Ultime 8 settimane: ${kmOf(zoneSum(total, 0, 6))} a stile libero nelle zone: ${levelMeters(total)
          .map((meters, index) => `${INTENSITY_LEVELS[index]} ${formatKm(meters)}`)
          .join(", ")}`
      : `Ultime 8 settimane: ${kmOf(zoneSum(total, 0, 6))} a stile libero nelle zone, ${formatKm(
          zoneSum(total, 0, 1)
        )} in zona A (A1–A2), ${formatKm(zoneSum(total, 2, 3))} in zona B (B1–B2), ${formatKm(
          zoneSum(total, 4, 6)
        )} in zona C (C1–C3)`
  return unclassified > 0
    ? `${zoned}; ${kmOf(unclassified)} di altri stili, tecnica o gambe non classificati.`
    : `${zoned}.`
}

// ─── Efficienza ─────────────────────────────────────────────────────────────

/** Sessions of the chart: the pool length of the summary, with a Stroke Index. */
export const efficiencySessions = (m: SwimMetrics) =>
  m.sessions.filter(
    (session): session is SessionMetrics & { strokeIndex: number } =>
      session.strokeIndex !== null &&
      !session.isOpenWater &&
      session.poolLengthMeters === m.efficiency.poolLengthMeters
  )

function efficiencyHeader(m: SwimMetrics): MetricHeader {
  const e = m.efficiency
  if (e.avg28 === null || e.poolLengthMeters === null) {
    return { value: null, reading: null, basis: null, missing: e.missing }
  }
  const pool = poolLengthLabel(e.poolLengthMeters)
  const counted = e.n28 ?? efficiencySessions(m).filter(inLast28(m)).length
  const base =
    e.nBaseline === undefined
      ? "."
      : e.baseline === null
        ? `; nei 90 giorni precedenti ${e.nBaseline === 1 ? "c'è" : "ci sono"} ${formatSwims(e.nBaseline)} in questa vasca.`
        : `; la tua base è la mediana di ${formatSwims(e.nBaseline)} dei 90 giorni precedenti.`
  return {
    value: formatDecimal(e.avg28, 2),
    reading: e.deltaPct === null ? `vasca da ${pool}` : `${formatSignedInteger(e.deltaPct)}% sulla tua base`,
    basis: `Mediana di ${formatSwims(counted)} in vasca da ${pool} degli ultimi 28 giorni${base}`,
    missing: e.missing,
  }
}

/** Median stroke rate (cycles per minute) of the swims of the last 28 days in the summary's pool. */
export function efficiencyStrokeRate(m: SwimMetrics): number | null {
  return median(
    efficiencySessions(m)
      .filter(inLast28(m))
      .flatMap(session => (session.strokeRate === null ? [] : [session.strokeRate]))
  )
}

export type EfficiencyRow = { label: string; recent: string; baseline: string | null }

/**
 * Stroke Index, distance per cycle and pace of the last 4 weeks against the base (medians of the
 * same swims), and in one sentence whether the Stroke Index moved with the stroke length or only
 * with the speed. Compared as shown: distance per cycle to the centimetre, pace to the second.
 */
export function efficiencyComparison(e: SwimMetrics["efficiency"]): { rows: EfficiencyRow[]; reading: string | null } {
  // Units in the row label, so the values fit a 360 px column.
  const dps = (value: number | null | undefined) => (value == null ? null : formatDecimal(value, 2))
  const pace = (value: number | null | undefined) => (value == null ? null : formatPaceValue(value))
  const rows: EfficiencyRow[] = []
  if (e.avg28 !== null) {
    rows.push({ label: "Stroke Index", recent: formatDecimal(e.avg28, 2), baseline: e.baseline === null ? null : formatDecimal(e.baseline, 2) })
  }
  if (e.dps28 != null) rows.push({ label: "Distanza per ciclo (m)", recent: dps(e.dps28)!, baseline: dps(e.dpsBaseline) })
  if (e.pace28 != null) rows.push({ label: "Passo (/100 m)", recent: pace(e.pace28)!, baseline: pace(e.paceBaseline) })

  const siChange = e.deltaPct == null ? 0 : Math.round(e.deltaPct)
  if (siChange === 0 || e.dps28 == null || e.dpsBaseline == null || e.pace28 == null || e.paceBaseline == null) {
    return { rows, reading: null }
  }
  const dpsChange = Math.round(e.dps28 * 100) - Math.round(e.dpsBaseline * 100)
  const paceChange = Math.round(e.pace28) - Math.round(e.paceBaseline) // negative: faster
  let reading: string
  if (siChange > 0) {
    reading =
      dpsChange <= 0
        ? "Lo Stroke Index sale solo perché vai più veloce: la distanza per ciclo non cresce."
        : paceChange < 0
          ? "Lo Stroke Index sale con una bracciata più lunga e un passo più veloce."
          : "Lo Stroke Index sale con una bracciata più lunga."
  } else {
    reading =
      dpsChange >= 0
        ? "Lo Stroke Index scende perché vai più piano: la distanza per ciclo non cala."
        : paceChange > 0
          ? "Lo Stroke Index scende con una bracciata più corta e un passo più lento."
          : "Lo Stroke Index scende con una bracciata più corta."
  }
  return { rows, reading }
}

export function efficiencyChartSummary(m: SwimMetrics): string | null {
  const sessions = efficiencySessions(m)
  if (sessions.length === 0 || m.efficiency.poolLengthMeters === null) return null
  const values = sessions.map(session => session.strokeIndex)
  const base =
    m.efficiency.baseline === null ? "" : `; la tua base è ${formatDecimal(m.efficiency.baseline, 2)}`
  return `Stroke Index per nuotata in vasca da ${poolLengthLabel(m.efficiency.poolLengthMeters)}, ultimi 90 giorni: ${formatSwims(sessions.length)}, da ${formatDecimal(Math.min(...values), 2)} a ${formatDecimal(
    Math.max(...values),
    2
  )}, ultima ${formatDecimal(values[values.length - 1], 2)}${base}.`
}

// ─── Regolarità e tenuta nelle ripetute ─────────────────────────────────────

function pacingHeader(m: SwimMetrics): MetricHeader {
  const p = m.pacing
  if (p.cv28 === null) return { value: null, reading: null, basis: null, missing: p.missing }
  const counted = m.sessions.filter(session => session.pacingCv !== null && inLast28(m)(session)).length
  const fades = p.fade28 !== null && p.fade28 > SWIM_METRIC_THRESHOLDS.pacingFadePct
  return {
    value: `${formatDecimal(p.cv28, 1)}%`,
    unit: "variabilità",
    reading: `${pacingCvReading(p.cv28)}${fades ? ", cali nel finale" : ""}`,
    basis: `Mediana di ${formatSwims(counted)} con serie di ripetute degli ultimi 28 giorni.`,
    missing: p.missing,
  }
}

/** «6 × 100 m stile libero». */
export function setTitle(set: NonNullable<SwimMetrics["pacing"]["latestSet"]>): string {
  const stroke = strokeName(set.stroke)
  return `${formatInteger(set.repSeconds.length)} × ${formatInteger(set.distanceMeters)} m${stroke ? ` ${stroke}` : ""}`
}

export function pacingSetSummary(set: NonNullable<SwimMetrics["pacing"]["latestSet"]>): string {
  return `Ultima serie, ${formatKeyDayMonth(set.date)}: ${setTitle(set)} in ${set.repSeconds
    .map(formatClock)
    .join(", ")}.`
}

/** «la bracciata si accorcia nel finale» above the shared threshold, else «la bracciata tiene». */
export const dpsDropReading = (dropPct: number) =>
  dropPct > SWIM_METRIC_THRESHOLDS.dpsDropPct ? "la bracciata si accorcia nel finale" : "la bracciata tiene"

/** Distance per cycle of each rep of the latest set, with its drop and reading; null without stroke data. */
export function pacingDpsSummary(set: NonNullable<SwimMetrics["pacing"]["latestSet"]>): string | null {
  if (!set.repDps || set.repDps.length === 0) return null
  const values = `${set.repDps.map(dps => formatDecimal(dps, 2)).join(", ")} m`
  if (set.dpsDropPct == null) return `Distanza per bracciata nell'ultima serie: ${values}.`
  const change =
    set.dpsDropPct >= 0
      ? `cala del ${formatDecimal(set.dpsDropPct, 1)}%`
      : `cresce del ${formatDecimal(-set.dpsDropPct, 1)}%`
  return `Distanza per bracciata nell'ultima serie: ${values}; dal primo all'ultimo terzo ${change}: ${dpsDropReading(
    set.dpsDropPct
  )}.`
}

/**
 * «Tenuta della bracciata»: median DPS drop and stroke rate rise of the last 28 days, the reading
 * and the swims behind them; what is missing without stroke data in the sets.
 */
export function strokeHolding(m: SwimMetrics): {
  dpsChange: number | null
  strokeRateRise: number | null
  text: string
} | null {
  const p = m.pacing
  if (p.cv28 === null) return null
  if (p.dpsDrop28 == null) {
    return {
      dpsChange: null,
      strokeRateRise: null,
      text: "servono serie con le bracciate registrate in ogni ripetuta.",
    }
  }
  const counted = m.sessions.filter(session => session.dpsDropPct != null && inLast28(m)(session)).length
  const change =
    p.dpsDrop28 >= 0
      ? `cala del ${formatDecimal(p.dpsDrop28, 1)}%`
      : `cresce del ${formatDecimal(-p.dpsDrop28, 1)}%`
  const rate =
    p.strokeRateRise28 == null
      ? ""
      : `, la frequenza ${p.strokeRateRise28 >= 0 ? "sale" : "scende"} del ${formatDecimal(Math.abs(p.strokeRateRise28), 1)}%`
  return {
    dpsChange: -p.dpsDrop28,
    strokeRateRise: p.strokeRateRise28 ?? null,
    text: `dal primo all'ultimo terzo delle serie la distanza per bracciata ${change}${rate}: ${dpsDropReading(
      p.dpsDrop28
    )}. Mediana di ${formatSwims(counted)} degli ultimi 28 giorni.`,
  }
}

export const pacingSessions = (m: SwimMetrics) =>
  m.sessions.filter((session): session is SessionMetrics & { pacingCv: number } => session.pacingCv !== null)

export function pacingCvSummary(m: SwimMetrics): string | null {
  const sessions = pacingSessions(m)
  if (sessions.length === 0) return null
  const values = sessions.map(session => session.pacingCv)
  return `Variabilità per nuotata negli ultimi 90 giorni: ${formatSwims(sessions.length)}, da ${formatDecimal(
    Math.min(...values),
    1
  )}% a ${formatDecimal(Math.max(...values), 1)}%, ultima ${formatDecimal(values[values.length - 1], 1)}%.`
}

// ─── Volume e costanza ──────────────────────────────────────────────────────

const VOLUME_MISSING = "Nessuna nuotata nelle ultime 12 settimane."

function volumeHeader(m: SwimMetrics): MetricHeader {
  const v = m.volume
  const total = v.weeks.reduce((sum, week) => sum + week.sessions, 0)
  if (total === 0) return { value: null, reading: null, basis: null, missing: VOLUME_MISSING }
  const km = v.weeks.reduce((sum, week) => sum + week.km, 0)
  return {
    value: formatKm(v.avgKm4 * 1000),
    unit: "km/sett.",
    reading: `serie: ${weeks(v.streakWeeks)}`,
    basis: `Ultime 12 settimane: ${formatSwims(total)}, ${kmOf(km * 1000)}. Le medie usano le 4 settimane complete più recenti.`,
    missing: null,
  }
}

export function volumeChartSummary(volume: SwimMetrics["volume"]): string | null {
  if (volume.weeks.length === 0) return null
  const complete = volume.weeks.slice(0, -1)
  const current = volume.weeks[volume.weeks.length - 1]
  const best = complete.reduce((top, week) => (week.km > top.km ? week : top), complete[0] ?? current)
  return `Km per settimana nelle ultime 12 settimane: massimo ${kmOf(best.km * 1000)} nella settimana del ${formatKeyDayMonth(
    best.weekStart
  )}; settimana in corso ${kmOf(current.km * 1000)} con ${formatSwims(current.sessions)}.`
}

// ─── All headers ────────────────────────────────────────────────────────────

export function metricHeaders(m: SwimMetrics): Record<SwimMetricKey, MetricHeader> {
  return {
    css: cssHeader(m),
    load: loadHeader(m),
    intensity: intensityHeader(m),
    efficiency: efficiencyHeader(m),
    pacing: pacingHeader(m),
    volume: volumeHeader(m),
  }
}

// ─── CSS test entry ─────────────────────────────────────────────────────────

/**
 * «6:20» → 380 seconds. Also «6.20», «6,20», «6'20» and «6’20» (phone keyboards without «:»),
 * with tenths: «1:48.5» and «1:48,5» → 108.5; null when it is not minutes and two-digit
 * seconds.
 */
export function parseMinSec(input: string): number | null {
  const match = input.trim().match(/^(\d{1,2})\s*[:.,'’′]\s*([0-5]\d)(?:[.,](\d))?$/)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2]) + (match[3] ? Number(match[3]) / 10 : 0)
}

/** «1:48,5», or «1:50» when the tenths are zero: a pace as the editors show and read it. */
export function formatClockTenths(seconds: number): string {
  const tenths = Math.round(seconds * 10)
  const whole = Math.floor(tenths / 10)
  const tenth = tenths % 10
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}${tenth ? `,${tenth}` : ""}`
}
