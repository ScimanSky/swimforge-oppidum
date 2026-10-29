/**
 * What the «Metriche» cards of Statistiche show: header value and reading, data basis and the
 * text summaries of the charts, from the server's `SwimMetrics`. Definitions, readings and
 * thresholds come from `shared/swimMetrics.ts`; this file only formats them in Italian.
 */

import {
  addDaysToKey,
  dayKey,
  pacingCvReading,
  SWIM_METRIC_THRESHOLDS,
  TSB_READING_LABELS,
  type CssResult,
  type SessionMetrics,
  type SwimMetricKey,
  type SwimMetrics,
  type Zones5,
} from "@shared/swimMetrics"
import {
  formatDayMonth,
  formatDecimal,
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

/** Names of the pace zones Z1..Z5 (the bounds are in the shared definition). */
export const PACE_ZONE_NAMES = ["Facile", "Aerobico", "Medio", "Soglia", "Sopra soglia"] as const

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
const formatSignedDecimal = (value: number, digits: number) =>
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

const mean = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null

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

/** «400 m in 6:10 · 14 ott», fastest distance last. */
export const cssPointLabel = (point: CssResult["points"][number]) =>
  `${formatInteger(point.distanceMeters)} m in ${formatClock(point.seconds)} · ${formatKeyDayMonth(point.date)}`

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
    basis: `Carico di ${formatSwims(counted)} degli ultimi 90 giorni (la curva parte da 180 giorni fa).`,
    missing: m.load.missing,
  }
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

const zoneSum = (zones: Zones5, from: number, to: number) =>
  zones.slice(from, to + 1).reduce((sum, meters) => sum + meters, 0)

function intensityHeader(m: SwimMetrics): MetricHeader {
  const last28 = m.intensity.last28
  if (!last28) return { value: null, reading: null, basis: null, missing: m.intensity.missing }
  const counted = m.sessions.filter(session => session.zoneMeters && inLast28(m)(session)).length
  const total = zoneSum(last28.zoneMeters, 0, 4)
  return {
    value: `${formatInteger(last28.easyPct)}%`,
    unit: "facile",
    reading:
      last28.mediumPct > SWIM_METRIC_THRESHOLDS.mediumZonePct
        ? "molto lavoro in zona media"
        : `${formatInteger(last28.mediumPct)}% medio, ${formatInteger(last28.hardPct)}% intenso`,
    basis: `Su ${formatSwims(counted)} con i giri degli ultimi 28 giorni (${kmOf(total)}).`,
    missing: m.intensity.missing,
  }
}

export function intensityChartSummary(weeksData: SwimMetrics["intensity"]["weeks"]): string {
  const total = weeksData.reduce(
    (sum, week) => week.zoneMeters.map((meters, index) => sum[index] + meters) as Zones5,
    [0, 0, 0, 0, 0] as Zones5
  )
  return `Ultime 8 settimane: ${kmOf(zoneSum(total, 0, 4))} con i giri, ${formatKm(
    zoneSum(total, 0, 1)
  )} in Z1–Z2 (facile), ${formatKm(total[2])} in Z3 (medio), ${formatKm(zoneSum(total, 3, 4))} in Z4–Z5 (intenso).`
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
  const counted = efficiencySessions(m).filter(inLast28(m)).length
  return {
    value: formatDecimal(e.avg28, 2),
    reading:
      e.deltaPct === null
        ? `vasca da ${formatInteger(e.poolLengthMeters)} m`
        : `${formatSignedInteger(e.deltaPct)}% sulla tua base`,
    basis: `Media di ${formatSwims(counted)} in vasca da ${formatInteger(e.poolLengthMeters)} m degli ultimi 28 giorni.`,
    missing: e.missing,
  }
}

/** Distance per cycle and stroke rate, averaged over the sessions of the last 28 days. */
export function efficiencyDetails(m: SwimMetrics) {
  const recent = efficiencySessions(m).filter(inLast28(m))
  return {
    dps: mean(recent.flatMap(session => (session.dpsMeters === null ? [] : [session.dpsMeters]))),
    strokeRate: mean(recent.flatMap(session => (session.strokeRate === null ? [] : [session.strokeRate]))),
  }
}

export function efficiencyChartSummary(m: SwimMetrics): string | null {
  const sessions = efficiencySessions(m)
  if (sessions.length === 0 || m.efficiency.poolLengthMeters === null) return null
  const values = sessions.map(session => session.strokeIndex)
  const base =
    m.efficiency.baseline === null ? "" : `; la tua base è ${formatDecimal(m.efficiency.baseline, 2)}`
  return `Stroke Index per nuotata in vasca da ${formatInteger(
    m.efficiency.poolLengthMeters
  )} m, ultimi 90 giorni: ${formatSwims(sessions.length)}, da ${formatDecimal(Math.min(...values), 2)} a ${formatDecimal(
    Math.max(...values),
    2
  )}, ultima ${formatDecimal(values[values.length - 1], 2)}${base}.`
}

// ─── Regolarità nelle ripetute ──────────────────────────────────────────────

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
 * «6:20» → 380 seconds. Also «6.20», «6,20» and «6'20» (phone keyboards without «:»); null
 * when it is not minutes and two-digit seconds.
 */
export function parseMinSec(input: string): number | null {
  const match = input.trim().match(/^(\d{1,2})\s*[:.,']\s*([0-5]\d)$/)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}
