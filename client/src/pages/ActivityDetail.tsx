"use client"

import AppLayout from "@/components/AppLayout"
import { trpc } from "@/lib/trpc"
import { useRoute, Link } from "wouter"
import { useEffect, useId, useMemo, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ShareActivityPicker } from "@/components/social/ShareActivityPicker"
import { Chip } from "@/components/corsia/Chip"
import { Metric, type MetricProps } from "@/components/corsia/Metric"
import { PaceBars, paceBars } from "@/components/corsia/PaceBars"
import { ShareToggle } from "@/components/corsia/ShareToggle"
import { ZoneBar } from "@/components/corsia/ZoneBar"
import { activityPlaceLabel, activitySourceLabel } from "@/lib/activity-labels"
import { activityMetrics, activityZoneSeconds } from "@/lib/activity-metrics"
import {
  NO_VALUE,
  distanceParts,
  formatDistance,
  formatInteger,
  formatPaceValue,
  formatSessionDate,
} from "@/lib/format"
import { cn } from "@/lib/utils"
import { ChevronDown, ChevronLeft, ChevronRight, Sparkles } from "lucide-react"

type RecordAny = Record<string, unknown>

type LapItem = {
  index: number
  label: string
  distance: number
  duration: number
  cumulativeSeconds: number
  pace: number | null
  bestPace: number | null
  avgHr: number | null
  maxHr: number | null
  swolf: number | null
  totalStrokes: number | null
  avgStrokes: number | null
  calories: number | null
  dominantStroke: string | null
  displayStroke: string | null
  raw: RecordAny
}

type SplitItem = {
  index: number
  label: string
  distance: number | null
  duration: number | null
  pace: number | null
  laps: number | null
  stroke: string | null
  avgHr: number | null
  swolf: number | null
  cadence: number | null
  strokes: number | null
  raw: RecordAny
}

type PersistedGarminLap = {
  id: number
  lapIndex: number | null
  distanceMeters: number | null
  durationSeconds: number | null
  movingDurationSeconds: number | null
  elapsedDurationSeconds: number | null
  averageSpeedMps: number | null
  maxSpeedMps: number | null
  averageMovingSpeedMps: number | null
  averageSwolf: number | null
  averageStrokes: number | null
  totalNumberOfStrokes: number | null
  averageSwimCadence: number | null
  calories: number | null
  avgHeartRate: number | null
  maxHeartRate: number | null
  numberOfActiveLengths: number | null
  strokeType: string | null
  startTimeGmt: string | Date | null
}

type PersistedGarminLength = {
  lapId: number
  lengthIndex: number | null
  distanceMeters: number | null
  durationSeconds: number | null
  averageSpeedMps: number | null
  maxSpeedMps: number | null
  averageSwolf: number | null
  totalNumberOfStrokes: number | null
  avgHeartRate: number | null
  maxHeartRate: number | null
  strokeType: string | null
  startTimeGmt: string | Date | null
}

type LengthRow = {
  key: string
  repeatNumber: number
  lengthNumber: number
  label: string
  distance: number
  duration: number
  cumulativeSeconds: number
  pace: number | null
  bestPace: number | null
  swolf: number | null
  avgHr: number | null
  maxHr: number | null
  totalStrokes: number | null
  avgStrokes: number | null
  calories: number | null
  stroke: string | null
}

type RepeatRow = {
  key: string
  lapId: number | null
  repeatNumber: number
  label: string
  distance: number
  duration: number
  cumulativeSeconds: number
  pace: number | null
  bestPace: number | null
  swolf: number | null
  avgHr: number | null
  maxHr: number | null
  totalStrokes: number | null
  avgStrokes: number | null
  calories: number | null
  stroke: string | null
  lengthsCount: number
  lengths: LengthRow[]
}

const STROKE_LABELS: Record<string, string> = {
  freestyle: "Stile libero",
  backstroke: "Dorso",
  breaststroke: "Rana",
  butterfly: "Farfalla",
  mixed: "Misti",
  recovery: "Recupero",
  drill: "Esercizi",
  kick: "Gambe",
}

const REPEATS_PER_PAGE = 15

const buildPaginationItems = (currentPage: number, totalPages: number): Array<number | "ellipsis"> => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const pages: Array<number | "ellipsis"> = [1]
  const start = Math.max(2, currentPage - 1)
  const end = Math.min(totalPages - 1, currentPage + 1)

  if (start > 2) pages.push("ellipsis")
  for (let page = start; page <= end; page += 1) {
    pages.push(page)
  }
  if (end < totalPages - 1) pages.push("ellipsis")

  pages.push(totalPages)
  return pages
}

const formatNumber = (value?: number | null, digits = 0) => {
  if (value === null || value === undefined) return "—"
  if (!Number.isFinite(value)) return "—"
  return digits > 0 ? Number(value).toFixed(digits).replace(".", ",") : String(Math.round(value))
}

/** «1:42» or «1:02:05»; rounded to whole seconds before splitting (119.6 s → «2:00», never «1:60»). */
const formatSplitDuration = (value?: number | null) => {
  if (!value && value !== 0) return "—"
  if (!Number.isFinite(value)) return "—"
  const seconds = Math.round(value)
  if (seconds === 0) return "0:00"
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`
}

/** «1:52 /100», as in the summary metrics; «—» without a valid pace (never another pace instead). */
const formatPacePer100 = (secondsPer100m?: number | null) => {
  const value = formatPaceValue(Number(secondsPer100m ?? 0))
  return value === NO_VALUE ? NO_VALUE : `${value} /100`
}

const toNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

const pickFirst = (obj: RecordAny | null | undefined, keys: string[]) => {
  if (!obj) return null
  for (const key of keys) {
    const value = obj[key]
    if (value !== null && value !== undefined) return value
  }
  return null
}

const asRecord = (value: unknown): RecordAny | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as RecordAny
}

const getDistanceMeters = (obj: RecordAny | null | undefined) =>
  toNumber(
    pickFirst(obj, ["distance", "distanceMeters", "distanceInMeters", "totalDistance", "distance_meters"]),
  )

const getDurationSeconds = (obj: RecordAny | null | undefined) =>
  toNumber(
    pickFirst(obj, ["duration", "durationSeconds", "elapsedDuration", "movingDuration", "activeDuration"]),
  )

const getSpeedMps = (obj: RecordAny | null | undefined) => {
  const raw = toNumber(
    pickFirst(obj, ["averageSpeed", "avgSpeed", "averageMovingSpeed", "avgMovingSpeed"]),
  )
  if (!raw) return null
  return raw > 15 ? raw / 3.6 : raw
}

const getPacePer100m = (obj: RecordAny | null | undefined) => {
  const pace = toNumber(pickFirst(obj, ["avgPacePer100m", "averagePace", "avgPace", "pacePer100m"]))
  if (pace && pace > 0) return pace
  const speed = getSpeedMps(obj)
  if (speed && speed > 0) return 100 / speed
  const distance = getDistanceMeters(obj)
  const duration = getDurationSeconds(obj)
  if (distance && duration) return duration / (distance / 100)
  return null
}

const getActivityStrokeKey = (activity: any) => {
  const rawData = asRecord(activity?.rawData)
  const garminDetails = asRecord(rawData?.garmin_details)
  const summary = asRecord(garminDetails?.summaryDTO)
  return normalizeStrokeKey(
    activity?.strokeType ??
      activity?.stroke_type ??
      activity?.stroke ??
      pickFirst(summary, ["swimStrokeType", "strokeType", "stroke"]) ??
      pickFirst(garminDetails, ["swimStrokeType", "strokeType", "stroke"]),
  )
}

const getStrokeLabel = (value: string | null | undefined) => {
  if (!value) return "—"
  return STROKE_LABELS[value] ?? value
}

const normalizeStrokeKey = (value: unknown) => {
  if (!value) return null
  const normalized = String(value).toLowerCase()
  if (normalized.includes("recovery") || normalized.includes("rest") || normalized.includes("recuper")) {
    return "recovery"
  }
  if (normalized.includes("free")) return "freestyle"
  if (normalized.includes("back")) return "backstroke"
  if (normalized.includes("breast")) return "breaststroke"
  if (normalized.includes("fly") || normalized.includes("butter")) return "butterfly"
  if (normalized.includes("drill")) return "drill"
  if (normalized.includes("kick")) return "kick"
  if (normalized.includes("mix") || normalized.includes("medley")) return "mixed"
  return normalized
}

const positiveNumber = (value: unknown) => {
  const number = Number(value ?? 0)
  return Number.isFinite(number) && number > 0 ? number : null
}

/** The summary keeps the 2×3 grid of `Sessione.png`: the first six metrics in display order. */
const SUMMARY_METRICS = 6

/** Distance, time, pace and SWOLF of a lap, split, repeat or length (only those with data). */
const segmentMetrics = (segment: {
  distance?: number | null
  duration?: number | null
  pace?: number | null
  swolf?: number | null
}): MetricProps[] => {
  const metrics: MetricProps[] = []
  const distance = positiveNumber(segment.distance)
  if (distance) metrics.push({ ...distanceParts(distance), label: "Distanza" })
  const duration = positiveNumber(segment.duration)
  if (duration) metrics.push({ value: formatSplitDuration(duration), label: "Tempo" })
  const pace = positiveNumber(segment.pace)
  if (pace) metrics.push({ value: formatPaceValue(pace), unit: "/100", label: "Passo", tone: "action" })
  const swolf = positiveNumber(segment.swolf)
  if (swolf) metrics.push({ value: String(Math.round(swolf)), label: "SWOLF" })
  return metrics
}

/** «100 m · 1:42 · 1:42 /100 · 142 bpm», skipping missing values. */
const segmentLine = (segment: {
  distance?: number | null
  duration?: number | null
  pace?: number | null
  avgHr?: number | null
}) =>
  [
    positiveNumber(segment.distance) ? formatDistance(segment.distance) : null,
    positiveNumber(segment.duration) ? formatSplitDuration(segment.duration) : null,
    positiveNumber(segment.pace) ? formatPacePer100(segment.pace) : null,
    positiveNumber(segment.avgHr) ? `${Math.round(Number(segment.avgHr))} bpm` : null,
  ]
    .filter(Boolean)
    .join(" · ")

type DetailItem = { label: string; value: string | number | null | undefined }

/** Metrics and details of the selected lap/split/repeat; missing values are left out. */
function SegmentDetail({
  title,
  metrics,
  details,
}: {
  title: string
  metrics: MetricProps[]
  details: DetailItem[]
}) {
  const shown = details.filter(
    (item) => item.value !== null && item.value !== undefined && item.value !== "" && item.value !== NO_VALUE,
  )
  return (
    <div className="rounded-xl bg-raised p-3">
      <p className="text-sm font-semibold">{title}</p>
      {metrics.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {metrics.map((metric) => (
            <Metric key={metric.label} {...metric} size="sm" />
          ))}
        </div>
      ) : null}
      {shown.length > 0 ? (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
          {shown.map((item) => (
            <div key={item.label} className="min-w-0">
              <dt className="text-muted-foreground">{item.label}</dt>
              <dd className="font-semibold tabular-nums">{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  )
}

function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-raised p-4 text-sm text-muted-foreground">{children}</p>
}

/** Selectable row (lap or split): title, stroke chip, the values it has. */
function SegmentButton({
  title,
  stroke,
  line,
  selected,
  onSelect,
}: {
  title: string
  stroke: string | null
  line: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "w-full rounded-xl border p-3 text-left transition-colors",
        selected ? "border-action-text bg-primary/10" : "border-border bg-card hover:bg-raised",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold">{title}</span>
        {stroke ? <Chip>{stroke}</Chip> : null}
      </span>
      {line ? (
        <span className="mt-1 block text-xs text-muted-foreground tabular-nums">{line}</span>
      ) : null}
    </button>
  )
}

function RepeatPagination({
  currentPage,
  totalPages,
  items,
  onGoTo,
  className,
}: {
  currentPage: number
  totalPages: number
  items: Array<number | "ellipsis">
  onGoTo: (page: number) => void
  className?: string
}) {
  return (
    <div className={cn("mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3", className)}>
      <p className="text-xs text-muted-foreground tabular-nums">
        Pagina {currentPage} di {totalPages}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onGoTo(currentPage - 1)}
          disabled={currentPage === 1}
          aria-label="Vai alla pagina precedente delle ripetute"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Precedente
        </Button>
        {items.map((item, index) =>
          item === "ellipsis" ? (
            <span key={`ellipsis-${index}`} className="px-1.5 text-xs text-muted-foreground" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onGoTo(item)}
              aria-label={`Vai alla pagina ${item} delle ripetute`}
              aria-current={item === currentPage ? "page" : undefined}
              className={cn(
                "min-h-10 min-w-10 rounded-lg border px-2 text-xs font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                item === currentPage
                  ? "border-action-text bg-primary/15 text-foreground"
                  : "border-border text-muted-foreground hover:bg-raised hover:text-foreground",
              )}
            >
              {item}
            </button>
          ),
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onGoTo(currentPage + 1)}
          disabled={currentPage === totalPages}
          aria-label="Vai alla pagina successiva delle ripetute"
        >
          Successiva
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  )
}

export default function ActivityDetail() {
  const [, trackParams] = useRoute<{ id: string }>("/track/:id")
  const [, legacyParams] = useRoute<{ id: string }>("/activities/:id")
  const activityId = trackParams?.id
    ? Number(trackParams.id)
    : legacyParams?.id
      ? Number(legacyParams.id)
      : NaN

  const activityQuery = trpc.activities.get.useQuery(
    { id: activityId },
    { enabled: Number.isFinite(activityId) },
  )

  const activity = activityQuery.data
  const isLoading = activityQuery.isLoading
  const activityStroke = getActivityStrokeKey(activity)
  const garminDetails = (activity?.rawData as any)?.garmin_details ?? null
  const [detailView, setDetailView] = useState<"laps-splits" | "repeats">("laps-splits")
  const persistedLapSource = useMemo(() => {
    if (!Array.isArray((activity as any)?.garminLaps)) return [] as PersistedGarminLap[]
    return (activity as any).garminLaps as PersistedGarminLap[]
  }, [activity])
  const persistedLengthSource = useMemo(() => {
    if (!Array.isArray((activity as any)?.garminLengths)) return [] as PersistedGarminLength[]
    return (activity as any).garminLengths as PersistedGarminLength[]
  }, [activity])

  const lapSource = useMemo(() => {
    if (persistedLapSource.length > 0) return persistedLapSource
    if (Array.isArray(garminDetails?.splits?.lapDTOs)) return garminDetails.splits.lapDTOs as unknown[]
    if (Array.isArray(garminDetails?.splits)) return garminDetails.splits as unknown[]
    if (Array.isArray(garminDetails?.laps)) return garminDetails.laps as unknown[]
    return [] as unknown[]
  }, [garminDetails, persistedLapSource])

  const splitSource = useMemo(() => {
    if (Array.isArray(garminDetails?.typed_splits?.splits)) return garminDetails.typed_splits.splits as unknown[]
    if (Array.isArray(garminDetails?.typed_splits)) return garminDetails.typed_splits as unknown[]
    if (Array.isArray(garminDetails?.split_summaries?.splitSummaries)) {
      return garminDetails.split_summaries.splitSummaries as unknown[]
    }
    if (Array.isArray(garminDetails?.split_summaries)) return garminDetails.split_summaries as unknown[]
    return lapSource
  }, [garminDetails, lapSource])

  const repeatRows = useMemo<RepeatRow[]>(() => {
    if (persistedLapSource.length === 0) return []

    const lengthsByLapId = new Map<number, PersistedGarminLength[]>()
    for (const length of persistedLengthSource) {
      const list = lengthsByLapId.get(length.lapId) ?? []
      list.push(length)
      lengthsByLapId.set(length.lapId, list)
    }

    const rows: RepeatRow[] = []
    let globalCumulative = 0

    persistedLapSource
      .slice()
      .sort((a, b) => (a.lapIndex ?? 0) - (b.lapIndex ?? 0))
      .forEach((lap, index) => {
        const distance = lap.distanceMeters ?? 0
        const duration = lap.durationSeconds ?? 0
        globalCumulative += duration
        const lapLengths = (lengthsByLapId.get(lap.id) ?? [])
          .slice()
          .sort((a, b) => (a.lengthIndex ?? 0) - (b.lengthIndex ?? 0))

        let localCumulative = 0
        const lengthRows: LengthRow[] = lapLengths.map((length, lengthIdx) => {
          const lengthDistance = length.distanceMeters ?? 0
          const lengthDuration = length.durationSeconds ?? 0
          localCumulative += lengthDuration
          const parsedStroke = normalizeStrokeKey(length.strokeType) ?? activityStroke
          const stroke = lengthDistance === 0 ? "recovery" : parsedStroke
          const pace = lengthDistance > 0 && lengthDuration > 0 ? lengthDuration / (lengthDistance / 100) : null
          const bestPace = length.maxSpeedMps && length.maxSpeedMps > 0 ? 100 / length.maxSpeedMps : null

          return {
            key: `${lap.id}-${length.lengthIndex ?? lengthIdx + 1}`,
            repeatNumber: lap.lapIndex ?? index + 1,
            lengthNumber: length.lengthIndex ?? lengthIdx + 1,
            label: `${lap.lapIndex ?? index + 1}.${length.lengthIndex ?? lengthIdx + 1}`,
            distance: lengthDistance,
            duration: lengthDuration,
            cumulativeSeconds: localCumulative,
            pace,
            bestPace,
            swolf: length.averageSwolf ?? null,
            avgHr: length.avgHeartRate ?? null,
            maxHr: length.maxHeartRate ?? null,
            totalStrokes: length.totalNumberOfStrokes ?? null,
            avgStrokes: null,
            calories: null,
            stroke,
          }
        })

        const strokeVotes = new Map<string, number>()
        for (const length of lengthRows) {
          if (!length.stroke || length.stroke === "recovery") continue
          strokeVotes.set(length.stroke, (strokeVotes.get(length.stroke) ?? 0) + 1)
        }
        const fallbackStrokeFromLengths =
          strokeVotes.size > 0
            ? Array.from(strokeVotes.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
            : null
        const parsedLapStroke = normalizeStrokeKey(lap.strokeType) ?? fallbackStrokeFromLengths ?? activityStroke
        const stroke = distance === 0 ? "recovery" : parsedLapStroke
        const lengthsCount =
          lap.numberOfActiveLengths ??
          lengthRows.filter((length) => length.distance > 0).length ??
          0

        rows.push({
          key: `repeat-${lap.id}`,
          lapId: lap.id,
          repeatNumber: lap.lapIndex ?? index + 1,
          label: distance === 0 ? "Recupero" : `Ripetuta ${lap.lapIndex ?? index + 1}`,
          distance,
          duration,
          cumulativeSeconds: globalCumulative,
          pace: distance > 0 && duration > 0 ? duration / (distance / 100) : null,
          bestPace: lap.maxSpeedMps && lap.maxSpeedMps > 0 ? 100 / lap.maxSpeedMps : null,
          swolf: lap.averageSwolf ?? null,
          avgHr: lap.avgHeartRate ?? null,
          maxHr: lap.maxHeartRate ?? null,
          totalStrokes: lap.totalNumberOfStrokes ?? null,
          avgStrokes: lap.averageStrokes ?? null,
          calories: lap.calories ?? null,
          stroke,
          lengthsCount,
          lengths: lengthRows,
        })
      })

    return rows
  }, [activityStroke, persistedLapSource, persistedLengthSource])

  const laps = useMemo<LapItem[]>(() => {
    let cumulative = 0
    return lapSource.map((rawLap, index) => {
      const lap = asRecord(rawLap) ?? {}
      const distance = getDistanceMeters(lap) ?? 0
      const duration =
        toNumber(pickFirst(lap, ["duration", "movingDuration", "elapsedDuration", "durationSeconds"])) ?? 0
      cumulative += duration

      const avgSpeed = getSpeedMps(lap)
      const maxSpeed = toNumber(pickFirst(lap, ["maxSpeed", "peakSpeed"]))

      const lengthDTOs = Array.isArray(lap["lengthDTOs"]) ? (lap["lengthDTOs"] as unknown[]) : []
      const strokeVotes = new Map<string, number>()
      lengthDTOs.forEach((lengthDto) => {
        const rec = asRecord(lengthDto)
        if (!rec) return
        const stroke = normalizeStrokeKey(
          pickFirst(rec, ["swimStrokeType", "strokeType", "stroke", "avgStrokeType"]),
        )
        if (!stroke) return
        strokeVotes.set(stroke, (strokeVotes.get(stroke) ?? 0) + 1)
      })
      const dominantStroke =
        strokeVotes.size > 0
          ? Array.from(strokeVotes.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
          : normalizeStrokeKey(pickFirst(lap, ["swimStrokeType", "strokeType", "stroke"])) ?? activityStroke
      const isRecovery = distance === 0
      const displayStroke = isRecovery ? "recovery" : dominantStroke

      return {
        index,
        label: isRecovery ? "Recupero" : `Giro ${index + 1}`,
        distance,
        duration,
        cumulativeSeconds: cumulative,
        pace: distance > 0 ? duration / (distance / 100) : null,
        bestPace: maxSpeed && maxSpeed > 0 ? 100 / maxSpeed : null,
        avgHr: toNumber(pickFirst(lap, ["averageHR", "avgHeartRate", "avgHR"])),
        maxHr: toNumber(pickFirst(lap, ["maxHR", "maxHeartRate"])),
        swolf: toNumber(pickFirst(lap, ["averageSWOLF", "averageSwolf", "avgSwolf"])),
        totalStrokes: toNumber(pickFirst(lap, ["totalNumberOfStrokes", "totalStrokes"])),
        avgStrokes: toNumber(pickFirst(lap, ["averageStrokes", "avgStrokes"])),
        calories: toNumber(pickFirst(lap, ["calories", "caloriesBurned"])),
        dominantStroke,
        displayStroke,
        raw: lap,
      }
    })
  }, [lapSource, activityStroke])

  const splits = useMemo<SplitItem[]>(() => {
    return splitSource.map((rawSplit, index) => {
      const split = asRecord(rawSplit) ?? {}
      const distance = getDistanceMeters(split)
      const duration = getDurationSeconds(split)
      const pace = getPacePer100m(split)
      const parsedStroke = normalizeStrokeKey(
        pickFirst(split, ["strokeType", "swimStrokeType", "avgStrokeType", "stroke", "type"]),
      ) ?? activityStroke
      const stroke = (distance ?? 0) === 0 ? "recovery" : parsedStroke
      const strokeLabel = stroke ? STROKE_LABELS[stroke] ?? stroke : null

      return {
        index,
        label: strokeLabel ? `Frazione ${index + 1} · ${strokeLabel}` : `Frazione ${index + 1}`,
        distance,
        duration,
        pace,
        laps: toNumber(pickFirst(split, ["lapCount", "totalLaps", "numLaps", "laps"])),
        stroke,
        avgHr: toNumber(pickFirst(split, ["averageHR", "avgHeartRate", "avgHR"])),
        swolf: toNumber(pickFirst(split, ["averageSwolf", "avgSwolf", "averageSWOLF"])),
        cadence: toNumber(pickFirst(split, ["avgStrokeCadence", "avgStrokeCadenceRpm", "avgCadence"])),
        strokes: toNumber(pickFirst(split, ["avgStrokes", "averageStrokes", "strokes"])),
        raw: split,
      }
    })
  }, [splitSource, activityStroke])

  const [selectedLapIdx, setSelectedLapIdx] = useState(0)
  const [selectedSplitIdx, setSelectedSplitIdx] = useState(0)
  const [expandedRepeatKeys, setExpandedRepeatKeys] = useState<Record<string, boolean>>({})
  const [selectedRepeatKey, setSelectedRepeatKey] = useState<string | null>(null)
  const [selectedLengthKey, setSelectedLengthKey] = useState<string | null>(null)
  const [currentRepeatPage, setCurrentRepeatPage] = useState(1)

  const totalRepeatPages = useMemo(
    () => Math.max(1, Math.ceil(repeatRows.length / REPEATS_PER_PAGE)),
    [repeatRows.length],
  )

  const pagedRepeatRows = useMemo(() => {
    const start = (currentRepeatPage - 1) * REPEATS_PER_PAGE
    return repeatRows.slice(start, start + REPEATS_PER_PAGE)
  }, [currentRepeatPage, repeatRows])

  const repeatPaginationItems = useMemo(
    () => buildPaginationItems(currentRepeatPage, totalRepeatPages),
    [currentRepeatPage, totalRepeatPages],
  )

  const fallbackSplitRows = useMemo<SplitItem[]>(
    () =>
      laps.map((lap, index) => ({
        index,
        label: lap.displayStroke === "recovery" ? "Recupero" : `${lap.label} · ${getStrokeLabel(lap.displayStroke)}`,
        distance: lap.distance,
        duration: lap.duration,
        pace: lap.pace,
        laps: 1,
        stroke: lap.displayStroke,
        avgHr: lap.avgHr,
        swolf: lap.swolf,
        cadence: null,
        strokes: lap.totalStrokes,
        raw: lap.raw,
      })),
    [laps],
  )
  const effectiveSplits = splits.length > 0 ? splits : fallbackSplitRows

  useEffect(() => {
    if (selectedLapIdx > laps.length - 1) setSelectedLapIdx(0)
  }, [laps.length, selectedLapIdx])

  useEffect(() => {
    if (selectedSplitIdx > effectiveSplits.length - 1) setSelectedSplitIdx(0)
  }, [effectiveSplits.length, selectedSplitIdx])

  const selectedLap = laps[selectedLapIdx] ?? null
  const selectedEffectiveSplit = effectiveSplits[selectedSplitIdx] ?? null

  useEffect(() => {
    if (repeatRows.length === 0 || pagedRepeatRows.length === 0) {
      setSelectedRepeatKey(null)
      setSelectedLengthKey(null)
      return
    }
    if (!selectedRepeatKey) {
      setSelectedRepeatKey(pagedRepeatRows[0].key)
      setSelectedLengthKey(null)
      return
    }
    if (!pagedRepeatRows.some((row) => row.key === selectedRepeatKey)) {
      setSelectedRepeatKey(pagedRepeatRows[0].key)
      setSelectedLengthKey(null)
    }
  }, [repeatRows.length, pagedRepeatRows, selectedRepeatKey])

  useEffect(() => {
    if (currentRepeatPage > totalRepeatPages) {
      setCurrentRepeatPage(totalRepeatPages)
    }
  }, [currentRepeatPage, totalRepeatPages])

  useEffect(() => {
    setExpandedRepeatKeys({})
    setSelectedLengthKey(null)
  }, [currentRepeatPage])

  const selectedRepeat = useMemo(
    () => repeatRows.find((row) => row.key === selectedRepeatKey) ?? null,
    [repeatRows, selectedRepeatKey],
  )

  const selectedLength = useMemo(
    () => selectedRepeat?.lengths.find((length) => length.key === selectedLengthKey) ?? null,
    [selectedRepeat, selectedLengthKey],
  )

  const selectedRepeatMetricSource = selectedLength ?? selectedRepeat

  const toggleRepeat = (repeatKey: string) => {
    setExpandedRepeatKeys((prev) => ({ ...prev, [repeatKey]: !prev[repeatKey] }))
  }

  const goToRepeatPage = (nextPage: number) => {
    const clampedPage = Math.max(1, Math.min(totalRepeatPages, nextPage))
    if (clampedPage === currentRepeatPage) return
    setCurrentRepeatPage(clampedPage)
  }

  const [sharePickerOpen, setSharePickerOpen] = useState(false)
  const utils = trpc.useUtils()
  const detailTitleId = useId()
  const lapsTitleId = useId()
  const splitsTitleId = useId()
  const repeatsTitleId = useId()
  const selectedMetricsTitleId = useId()

  const paceRows = useMemo(() => {
    const source =
      repeatRows.length > 0
        ? repeatRows.map((row) => ({ number: row.repeatNumber, distance: row.distance, pace: row.pace }))
        : laps.map((lap) => ({ number: lap.index + 1, distance: lap.distance, pace: lap.pace }))
    return paceBars(source.filter((row) => row.distance > 0))
  }, [laps, repeatRows])

  if (!Number.isFinite(activityId)) {
    return (
      <AppLayout>
        <p className="surface-panel p-5 text-sm text-muted-foreground">Attività non valida.</p>
      </AppLayout>
    )
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="space-y-4" role="status">
          <span className="sr-only">Caricamento…</span>
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-[164px] rounded-2xl" />
          <Skeleton className="h-[200px] rounded-2xl" />
        </div>
      </AppLayout>
    )
  }

  if (!activity) {
    return (
      <AppLayout>
        <p className="surface-panel p-5 text-sm text-muted-foreground">Attività non trovata.</p>
      </AppLayout>
    )
  }

  const sessionDate = formatSessionDate(activity.activityDate)
  const headerLine = [
    sessionDate !== NO_VALUE ? sessionDate : null,
    activityPlaceLabel(activity),
    activitySourceLabel(activity.activitySource),
  ]
    .filter(Boolean)
    .join(" · ")
  const summaryMetrics = activityMetrics(activity).slice(0, SUMMARY_METRICS)
  const zoneSeconds = activityZoneSeconds(activity)
  const lengthsTotal = repeatRows.reduce((sum, row) => sum + row.lengths.length, 0)
  const counts = [
    laps.length ? `${laps.length} giri` : null,
    splits.length ? `${splits.length} frazioni` : null,
    repeatRows.length ? `${repeatRows.length} ripetute` : null,
    lengthsTotal ? `${lengthsTotal} vasche` : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <AppLayout>
      <div className="space-y-6">
        <header>
          {headerLine ? <p className="text-sm text-muted-foreground">{headerLine}</p> : null}
          <h2 className="mt-1 break-words font-display text-[40px] font-bold leading-none text-foreground">
            {activity.activityName || "Nuotata"}
          </h2>
          {activity.xpEarned ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Chip tone="xp" className="h-8 px-3.5 text-sm">
                +{formatInteger(activity.xpEarned)} XP
              </Chip>
            </div>
          ) : null}
        </header>

        {summaryMetrics.length > 0 ? (
          <ul
            aria-label="Metriche della sessione"
            className="surface-panel grid grid-cols-3 overflow-hidden p-0"
          >
            {summaryMetrics.map(({ id, ...metric }, index) => (
              <li
                key={id}
                className={cn(
                  "min-w-0 border-border p-3 sm:p-4",
                  index % 3 !== 0 && "border-l",
                  index >= 3 && "border-t",
                )}
              >
                {/* 24px on phones: three ~85px columns at 360px still hold «1.234 kcal». */}
                <Metric {...metric} size="responsive" />
              </li>
            ))}
          </ul>
        ) : null}

        {paceRows || zoneSeconds ? (
          <div className={cn("grid gap-4", paceRows && zoneSeconds && "lg:grid-cols-2")}>
            {paceRows ? (
              <section className="surface-panel p-4 sm:p-5" aria-labelledby={`${detailTitleId}-pace`}>
                <h3 id={`${detailTitleId}-pace`} className="mb-4 text-base font-bold">
                  Passo per ripetuta
                </h3>
                <PaceBars bars={paceRows} />
              </section>
            ) : null}
            {zoneSeconds ? (
              <section className="surface-panel p-4 sm:p-5" aria-labelledby={`${detailTitleId}-zones`}>
                <h3 id={`${detailTitleId}-zones`} className="mb-4 text-base font-bold">
                  Zone cardio
                </h3>
                <ZoneBar seconds={zoneSeconds} />
              </section>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-3">
          <ShareToggle
            activityId={activity.id}
            shared={Boolean(activity.shareToFeed)}
            className="surface-panel px-4 py-3"
          />
          <div className="flex items-center justify-end gap-3">
            {!activity.shareToFeed ? (
              <Button type="button" size="lg" className="flex-1" onClick={() => setSharePickerOpen(true)}>
                Condividi con foto o commento
              </Button>
            ) : null}
            <Button variant="outline" size="icon-lg" asChild>
              <Link href="/coach?tab=session-iq" aria-label="Coach AI" title="Coach AI">
                <Sparkles className="size-5" aria-hidden />
              </Link>
            </Button>
          </div>
        </div>

        <section aria-labelledby={detailTitleId} className="space-y-4">
          <div>
            <h3 id={detailTitleId} className="text-base font-bold">
              Dettaglio vasche
            </h3>
            {counts ? <p className="mt-1 text-sm text-muted-foreground tabular-nums">{counts}</p> : null}
          </div>

          <Tabs
            value={detailView}
            onValueChange={(value) => setDetailView(value as "laps-splits" | "repeats")}
            className="gap-4"
          >
            <TabsList aria-label="Vista del dettaglio">
              <TabsTrigger value="laps-splits">Giri e frazioni</TabsTrigger>
              <TabsTrigger value="repeats">Ripetute</TabsTrigger>
            </TabsList>

            <TabsContent value="laps-splits" className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-2">
                <section className="surface-panel min-w-0 p-4" aria-labelledby={lapsTitleId}>
                  <h4 id={lapsTitleId} className="mb-3 text-base font-bold">
                    Giri
                  </h4>
                  {laps.length === 0 ? (
                    <EmptyNote>Nessun giro disponibile per questa attività.</EmptyNote>
                  ) : (
                    <div className="space-y-3">
                      <ul className="max-h-[40dvh] space-y-2 overflow-y-auto pr-1">
                        {laps.map((lap, index) => (
                          <li key={`lap-row-${index}`}>
                            <SegmentButton
                              title={lap.label}
                              stroke={lap.displayStroke ? getStrokeLabel(lap.displayStroke) : null}
                              line={segmentLine(lap)}
                              selected={selectedLapIdx === index}
                              onSelect={() => setSelectedLapIdx(index)}
                            />
                          </li>
                        ))}
                      </ul>

                      {selectedLap ? (
                        <SegmentDetail
                          title={`${selectedLap.label} selezionato`}
                          metrics={segmentMetrics(selectedLap)}
                          details={[
                            { label: "Stile", value: getStrokeLabel(selectedLap.displayStroke ?? activityStroke) },
                            { label: "Cumulato", value: formatSplitDuration(selectedLap.cumulativeSeconds) },
                            {
                              label: "Passo migliore",
                              value: formatPacePer100(selectedLap.bestPace),
                            },
                            { label: "FC media", value: selectedLap.avgHr ? `${selectedLap.avgHr} bpm` : null },
                            { label: "FC massima", value: selectedLap.maxHr ? `${selectedLap.maxHr} bpm` : null },
                            { label: "Bracciate totali", value: selectedLap.totalStrokes },
                            { label: "Bracciate medie", value: selectedLap.avgStrokes },
                            { label: "Calorie", value: selectedLap.calories || null },
                          ]}
                        />
                      ) : null}
                    </div>
                  )}
                </section>

                <section className="surface-panel min-w-0 p-4" aria-labelledby={splitsTitleId}>
                  <h4 id={splitsTitleId} className="text-base font-bold">
                    Frazioni
                  </h4>
                  {splits.length === 0 && laps.length > 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">Frazioni non disponibili: mostro i giri.</p>
                  ) : null}
                  <div className="mt-3 space-y-3">
                    {effectiveSplits.length > 0 ? (
                      <ul className="max-h-[40dvh] space-y-2 overflow-y-auto pr-1">
                        {effectiveSplits.map((split, index) => (
                          <li key={`split-row-${index}`}>
                            <SegmentButton
                              title={split.label}
                              stroke={split.stroke ? getStrokeLabel(split.stroke) : null}
                              line={segmentLine(split)}
                              selected={selectedSplitIdx === index}
                              onSelect={() => setSelectedSplitIdx(index)}
                            />
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {selectedEffectiveSplit ? (
                      <SegmentDetail
                        title="Frazione selezionata"
                        metrics={segmentMetrics(selectedEffectiveSplit)}
                        details={[
                          {
                            label: "Stile",
                            value: getStrokeLabel(selectedEffectiveSplit.stroke ?? activityStroke),
                          },
                          { label: "Giri inclusi", value: selectedEffectiveSplit.laps ?? 1 },
                          {
                            label: "FC media",
                            value: selectedEffectiveSplit.avgHr ? `${selectedEffectiveSplit.avgHr} bpm` : null,
                          },
                          { label: "Bracciate", value: selectedEffectiveSplit.strokes },
                          { label: "Cadenza", value: selectedEffectiveSplit.cadence },
                          {
                            label: "Calorie",
                            value: toNumber(pickFirst(selectedEffectiveSplit.raw, ["calories", "caloriesBurned"])),
                          },
                        ]}
                      />
                    ) : (
                      <EmptyNote>Nessun dato su frazioni o giri per questa attività.</EmptyNote>
                    )}
                  </div>
                </section>
              </div>

              {laps.length === 0 && splits.length === 0 ? (
                <EmptyNote>
                  Nessun dato su giri e frazioni in questa attività. Se viene da una sincronizzazione esterna,
                  controlla che il servizio includa i dettagli estesi.
                </EmptyNote>
              ) : null}
            </TabsContent>

            <TabsContent value="repeats">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                <section className="surface-panel min-w-0 p-4" aria-labelledby={repeatsTitleId}>
                  <h4 id={repeatsTitleId} className="mb-3 text-base font-bold">
                    Ripetute
                  </h4>

                  {repeatRows.length === 0 ? (
                    <EmptyNote>Nessun dato sulle ripetute in questa attività.</EmptyNote>
                  ) : (
                    <>
                      <div className="hidden overflow-x-auto xl:block">
                        <table className="w-full min-w-[1350px] text-xs tabular-nums">
                          <thead>
                            <tr className="border-b border-border text-muted-foreground">
                              <th className="px-2 py-2 text-left font-medium">Ripetute</th>
                              <th className="px-2 py-2 text-left font-medium">Stile</th>
                              <th className="px-2 py-2 text-right font-medium">Vasche</th>
                              <th className="px-2 py-2 text-right font-medium">Distanza</th>
                              <th className="px-2 py-2 text-right font-medium">Tempo</th>
                              <th className="px-2 py-2 text-right font-medium">Tempo cumulato</th>
                              <th className="px-2 py-2 text-right font-medium">Passo medio</th>
                              <th className="px-2 py-2 text-right font-medium">Passo migliore</th>
                              <th className="px-2 py-2 text-right font-medium">SWOLF medio</th>
                              <th className="px-2 py-2 text-right font-medium">FC media</th>
                              <th className="px-2 py-2 text-right font-medium">FC massima</th>
                              <th className="px-2 py-2 text-right font-medium">Totale bracciate</th>
                              <th className="px-2 py-2 text-right font-medium">Bracciate medie</th>
                              <th className="px-2 py-2 text-right font-medium">Calorie</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pagedRepeatRows.flatMap((repeat) => {
                              const isRepeatSelected = selectedRepeatKey === repeat.key && !selectedLength
                              const isExpanded = Boolean(expandedRepeatKeys[repeat.key])
                              const rows = [
                                <tr
                                  key={repeat.key}
                                  onClick={() => {
                                    setSelectedRepeatKey(repeat.key)
                                    setSelectedLengthKey(null)
                                  }}
                                  className={cn(
                                    "cursor-pointer border-b border-border transition-colors",
                                    isRepeatSelected ? "bg-primary/15" : "hover:bg-raised",
                                  )}
                                >
                                  <td className="px-2 py-2">
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        toggleRepeat(repeat.key)
                                      }}
                                      aria-expanded={isExpanded}
                                      aria-label={`Vasche della ripetuta ${repeat.repeatNumber}`}
                                      className="inline-flex items-center gap-1 font-semibold text-foreground"
                                    >
                                      {isExpanded ? (
                                        <ChevronDown className="size-4" aria-hidden />
                                      ) : (
                                        <ChevronRight className="size-4" aria-hidden />
                                      )}
                                      {repeat.repeatNumber}
                                    </button>
                                  </td>
                                  <td className="px-2 py-2">{getStrokeLabel(repeat.stroke)}</td>
                                  <td className="px-2 py-2 text-right">{repeat.lengthsCount}</td>
                                  <td className="px-2 py-2 text-right">{formatDistance(repeat.distance)}</td>
                                  <td className="px-2 py-2 text-right">{formatSplitDuration(repeat.duration)}</td>
                                  <td className="px-2 py-2 text-right">{formatSplitDuration(repeat.cumulativeSeconds)}</td>
                                  <td className="px-2 py-2 text-right">{formatPacePer100(repeat.pace)}</td>
                                  <td className="px-2 py-2 text-right">{formatPacePer100(repeat.bestPace)}</td>
                                  <td className="px-2 py-2 text-right">{formatNumber(repeat.swolf)}</td>
                                  <td className="px-2 py-2 text-right">{formatNumber(repeat.avgHr)}</td>
                                  <td className="px-2 py-2 text-right">{formatNumber(repeat.maxHr)}</td>
                                  <td className="px-2 py-2 text-right">{formatNumber(repeat.totalStrokes)}</td>
                                  <td className="px-2 py-2 text-right">{formatNumber(repeat.avgStrokes, 1)}</td>
                                  <td className="px-2 py-2 text-right">{formatNumber(repeat.calories)}</td>
                                </tr>,
                              ]

                              if (!isExpanded) return rows

                              return rows.concat(
                                repeat.lengths.map((length) => {
                                  const isLengthSelected = selectedLength?.key === length.key
                                  return (
                                    <tr
                                      key={length.key}
                                      onClick={() => {
                                        setSelectedRepeatKey(repeat.key)
                                        setSelectedLengthKey(length.key)
                                      }}
                                      className={cn(
                                        "cursor-pointer border-b border-border",
                                        isLengthSelected ? "bg-primary/15" : "bg-raised/50 hover:bg-raised",
                                      )}
                                    >
                                      <td className="px-2 py-2 pl-6 text-muted-foreground">{length.label}</td>
                                      <td className="px-2 py-2">{getStrokeLabel(length.stroke)}</td>
                                      <td className="px-2 py-2 text-right">1</td>
                                      <td className="px-2 py-2 text-right">{formatDistance(length.distance)}</td>
                                      <td className="px-2 py-2 text-right">{formatSplitDuration(length.duration)}</td>
                                      <td className="px-2 py-2 text-right">{formatSplitDuration(length.cumulativeSeconds)}</td>
                                      <td className="px-2 py-2 text-right">{formatPacePer100(length.pace)}</td>
                                      <td className="px-2 py-2 text-right">{formatPacePer100(length.bestPace)}</td>
                                      <td className="px-2 py-2 text-right">{formatNumber(length.swolf)}</td>
                                      <td className="px-2 py-2 text-right">{formatNumber(length.avgHr)}</td>
                                      <td className="px-2 py-2 text-right">{formatNumber(length.maxHr)}</td>
                                      <td className="px-2 py-2 text-right">{formatNumber(length.totalStrokes)}</td>
                                      <td className="px-2 py-2 text-right">{formatNumber(length.avgStrokes, 1)}</td>
                                      <td className="px-2 py-2 text-right">{formatNumber(length.calories)}</td>
                                    </tr>
                                  )
                                }),
                              )
                            })}
                          </tbody>
                        </table>
                      </div>

                      {totalRepeatPages > 1 ? (
                        <RepeatPagination
                          className="hidden xl:flex"
                          currentPage={currentRepeatPage}
                          totalPages={totalRepeatPages}
                          items={repeatPaginationItems}
                          onGoTo={goToRepeatPage}
                        />
                      ) : null}

                      <ul className="space-y-2 xl:hidden">
                        {pagedRepeatRows.map((repeat) => {
                          const isExpanded = Boolean(expandedRepeatKeys[repeat.key])
                          const rowDetailSource =
                            selectedRepeatKey === repeat.key
                              ? (selectedLength?.key && repeat.lengths.some((length) => length.key === selectedLength.key)
                                ? selectedLength
                                : repeat)
                              : repeat
                          return (
                            <li key={repeat.key} className="rounded-xl border border-border p-3">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedRepeatKey(repeat.key)
                                  setSelectedLengthKey(null)
                                  toggleRepeat(repeat.key)
                                }}
                                aria-expanded={isExpanded}
                                className="flex w-full items-start justify-between gap-2 text-left"
                              >
                                <span className="min-w-0">
                                  <span className="block text-sm font-semibold text-foreground">
                                    Ripetuta {repeat.repeatNumber}
                                  </span>
                                  <span className="block text-xs text-muted-foreground tabular-nums">
                                    {getStrokeLabel(repeat.stroke)} · {repeat.lengthsCount} vasche ·{" "}
                                    {formatDistance(repeat.distance)}
                                  </span>
                                </span>
                                <span className="inline-flex items-center gap-2">
                                  <Chip className="tabular-nums">{formatSplitDuration(repeat.duration)}</Chip>
                                  {isExpanded ? (
                                    <ChevronDown className="size-4" aria-hidden />
                                  ) : (
                                    <ChevronRight className="size-4" aria-hidden />
                                  )}
                                </span>
                              </button>

                              {isExpanded ? (
                                <div className="mt-3 space-y-2">
                                  {repeat.lengths.map((length) => (
                                    <SegmentButton
                                      key={length.key}
                                      title={`Vasca ${length.label}`}
                                      stroke={getStrokeLabel(length.stroke)}
                                      line={segmentLine(length)}
                                      selected={selectedLength?.key === length.key}
                                      onSelect={() => {
                                        setSelectedRepeatKey(repeat.key)
                                        setSelectedLengthKey(length.key)
                                      }}
                                    />
                                  ))}

                                  <SegmentDetail
                                    title={
                                      rowDetailSource && "lengths" in rowDetailSource
                                        ? "Ripetuta selezionata"
                                        : "Vasca selezionata"
                                    }
                                    metrics={rowDetailSource ? segmentMetrics(rowDetailSource) : []}
                                    details={[
                                      { label: "Stile", value: getStrokeLabel(rowDetailSource?.stroke) },
                                      {
                                        label: "Tempo cumulato",
                                        value: formatSplitDuration(rowDetailSource?.cumulativeSeconds),
                                      },
                                      {
                                        label: "Passo migliore",
                                        value: formatPacePer100(rowDetailSource?.bestPace),
                                      },
                                      {
                                        label: "FC media",
                                        value: rowDetailSource?.avgHr ? `${formatNumber(rowDetailSource.avgHr)} bpm` : null,
                                      },
                                      {
                                        label: "FC massima",
                                        value: rowDetailSource?.maxHr ? `${formatNumber(rowDetailSource.maxHr)} bpm` : null,
                                      },
                                      { label: "Bracciate", value: formatNumber(rowDetailSource?.totalStrokes) },
                                      { label: "Bracciate medie", value: formatNumber(rowDetailSource?.avgStrokes, 1) },
                                      { label: "Calorie", value: formatNumber(rowDetailSource?.calories) },
                                    ]}
                                  />
                                </div>
                              ) : null}
                            </li>
                          )
                        })}
                      </ul>

                      {totalRepeatPages > 1 ? (
                        <RepeatPagination
                          className="xl:hidden"
                          currentPage={currentRepeatPage}
                          totalPages={totalRepeatPages}
                          items={repeatPaginationItems}
                          onGoTo={goToRepeatPage}
                        />
                      ) : null}
                    </>
                  )}
                </section>

                <section
                  className="surface-panel hidden min-w-0 space-y-3 p-4 xl:block"
                  aria-labelledby={selectedMetricsTitleId}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h4 id={selectedMetricsTitleId} className="text-base font-bold">
                      Metriche selezionate
                    </h4>
                    {selectedLength || selectedRepeat ? (
                      <span className="text-xs text-muted-foreground">
                        {selectedLength ? `Vasca ${selectedLength.label}` : `Ripetuta ${selectedRepeat?.repeatNumber}`}
                      </span>
                    ) : null}
                  </div>

                  {selectedRepeatMetricSource ? (
                    <SegmentDetail
                      title={selectedLength ? "Vasca" : "Ripetuta"}
                      metrics={segmentMetrics(selectedRepeatMetricSource)}
                      details={[
                        { label: "Stile", value: getStrokeLabel(selectedRepeatMetricSource.stroke) },
                        {
                          label: "Tempo cumulato",
                          value: formatSplitDuration(selectedRepeatMetricSource.cumulativeSeconds),
                        },
                        {
                          label: "Passo migliore",
                          value: formatPacePer100(selectedRepeatMetricSource.bestPace),
                        },
                        {
                          label: "FC media",
                          value: selectedRepeatMetricSource.avgHr
                            ? `${formatNumber(selectedRepeatMetricSource.avgHr)} bpm`
                            : null,
                        },
                        {
                          label: "FC massima",
                          value: selectedRepeatMetricSource.maxHr
                            ? `${formatNumber(selectedRepeatMetricSource.maxHr)} bpm`
                            : null,
                        },
                        { label: "Totale bracciate", value: formatNumber(selectedRepeatMetricSource.totalStrokes) },
                        { label: "Bracciate medie", value: formatNumber(selectedRepeatMetricSource.avgStrokes, 1) },
                        { label: "Calorie", value: formatNumber(selectedRepeatMetricSource.calories) },
                        ...(selectedRepeat
                          ? [{ label: "Vasche nella ripetuta", value: formatNumber(selectedRepeat.lengthsCount) }]
                          : []),
                      ]}
                    />
                  ) : (
                    <EmptyNote>Scegli una ripetuta o una vasca per vederne le metriche.</EmptyNote>
                  )}
                </section>
              </div>
            </TabsContent>
          </Tabs>
        </section>
      </div>

      <ShareActivityPicker
        open={sharePickerOpen}
        onOpenChange={setSharePickerOpen}
        initialActivityId={activity.id}
        onShared={async () => {
          await Promise.all([
            utils.activities.get.invalidate({ id: activity.id }),
            utils.activities.list.invalidate(),
          ])
        }}
      />
    </AppLayout>
  )
}
