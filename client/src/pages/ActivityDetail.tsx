"use client"

import AppLayout from "@/components/AppLayout"
import { trpc } from "@/lib/trpc"
import { useRoute, Link } from "wouter"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { MetricOrb } from "@/components/metrics/MetricOrb"
import { cn } from "@/lib/utils"
import {
  ArrowLeft,
  Clock3,
  Droplets,
  Gauge,
  HeartPulse,
  Waves,
} from "lucide-react"

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

const STROKE_LABELS: Record<string, string> = {
  freestyle: "Freestyle",
  backstroke: "Backstroke",
  breaststroke: "Breaststroke",
  butterfly: "Butterfly",
  mixed: "Mixed",
  drill: "Drill",
  kick: "Kick",
}

const formatDistance = (meters?: number | null) => {
  if (!meters && meters !== 0) return "—"
  if (meters === 0) return "0 m"
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`
}

const formatDuration = (seconds?: number | null) => {
  if (!seconds && seconds !== 0) return "—"
  if (seconds === 0) return "0 min"
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes} min`
}

const formatSplitDuration = (seconds?: number | null) => {
  if (!seconds && seconds !== 0) return "—"
  if (seconds === 0) return "0:00"
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.round(seconds % 60)
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`
}

const formatPace = (
  secondsPer100m?: number | null,
  distanceMeters?: number | null,
  durationSeconds?: number | null,
) => {
  const pace =
    secondsPer100m && secondsPer100m > 0
      ? secondsPer100m
      : distanceMeters && durationSeconds
        ? durationSeconds / (distanceMeters / 100)
        : null
  if (!pace || !Number.isFinite(pace)) return "—"
  const minutes = Math.floor(pace / 60)
  const seconds = Math.round(pace % 60)
  return `${minutes}:${seconds.toString().padStart(2, "0")}/100m`
}

const formatDateTime = (value?: string | Date | null) => {
  if (!value) return "—"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "—"
  return parsed.toLocaleString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
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
  if (normalized.includes("free")) return "freestyle"
  if (normalized.includes("back")) return "backstroke"
  if (normalized.includes("breast")) return "breaststroke"
  if (normalized.includes("fly") || normalized.includes("butter")) return "butterfly"
  if (normalized.includes("drill")) return "drill"
  if (normalized.includes("kick")) return "kick"
  if (normalized.includes("mix") || normalized.includes("medley")) return "mixed"
  return normalized
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
  const persistedLapSource = useMemo(() => {
    if (!Array.isArray((activity as any)?.garminLaps)) return [] as unknown[]
    return (activity as any).garminLaps as unknown[]
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

      return {
        index,
        label: distance === 0 ? "Recovery" : `Lap ${index + 1}`,
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
      const stroke = normalizeStrokeKey(
        pickFirst(split, ["strokeType", "swimStrokeType", "avgStrokeType", "stroke", "type"]),
      ) ?? activityStroke
      const strokeLabel = stroke ? STROKE_LABELS[stroke] ?? stroke : null

      return {
        index,
        label: strokeLabel ? `Split ${index + 1} · ${strokeLabel}` : `Split ${index + 1}`,
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

  const fallbackSplitRows = useMemo<SplitItem[]>(
    () =>
      laps.map((lap, index) => ({
        index,
        label: `${lap.label} · ${getStrokeLabel(lap.dominantStroke)}`,
        distance: lap.distance,
        duration: lap.duration,
        pace: lap.pace,
        laps: 1,
        stroke: lap.dominantStroke,
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

  if (!Number.isFinite(activityId)) {
    return (
      <AppLayout>
        <div className="compact-shell p-3 lg:p-0">
          <div className="surface-panel p-6 text-sm text-muted-foreground">Attività non valida.</div>
        </div>
      </AppLayout>
    )
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="compact-shell space-y-3 p-3 lg:p-0">
          <div className="surface-panel p-5">
            <Skeleton className="h-8 w-60" />
            <Skeleton className="mt-2 h-4 w-80" />
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            <div className="surface-panel p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, idx) => (
                <Skeleton key={idx} className="h-16 w-full" />
              ))}
            </div>
            <div className="surface-panel p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, idx) => (
                <Skeleton key={idx} className="h-10 w-full" />
              ))}
            </div>
          </div>
        </div>
      </AppLayout>
    )
  }

  if (!activity) {
    return (
      <AppLayout>
        <div className="compact-shell p-3 lg:p-0">
          <div className="surface-panel p-6 text-sm text-muted-foreground">Attività non trovata.</div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="compact-shell space-y-3 p-3 lg:p-0">
        <section className="surface-panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Button variant="ghost-neon" size="sm" asChild>
                  <Link href="/track">
                    <ArrowLeft className="size-4" />
                    Torna alle attività
                  </Link>
                </Button>
                <Badge variant="outline">Dettaglio Laps</Badge>
              </div>
              <h1 className="mt-2 text-2xl font-display font-bold neon-gradient-text">Laps & Splits</h1>
              <p className="text-sm text-muted-foreground">
                {activity.activityName || "Swim Session"} · {formatDateTime(activity.activityDate)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Lap: {laps.length}</Badge>
              <Badge variant="outline">Split: {splits.length}</Badge>
            </div>
          </div>
        </section>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <section className="surface-panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-display font-semibold text-foreground">Laps</h2>
              <span className="text-xs text-muted-foreground">Seleziona un lap per vedere tutti i dettagli</span>
            </div>

            {laps.length === 0 ? (
              <div className="rounded-xl border border-border/70 bg-card/40 p-4 text-sm text-muted-foreground">
                Nessun lap disponibile per questa attività.
              </div>
            ) : (
              <div className="space-y-2">
                <div className="max-h-[40dvh] space-y-2 overflow-y-auto pr-1">
                  {laps.map((lap, index) => {
                    const strokeLabel = lap.dominantStroke
                      ? STROKE_LABELS[lap.dominantStroke] ?? lap.dominantStroke
                      : "—"
                    return (
                      <button
                        key={`lap-row-${index}`}
                        type="button"
                        onClick={() => setSelectedLapIdx(index)}
                        className={cn(
                          "w-full rounded-xl border p-3 text-left transition-colors",
                          selectedLapIdx === index
                            ? "border-[var(--electric-cyan)]/60 bg-[color-mix(in_oklch,var(--electric-cyan)_12%,transparent)]"
                            : "border-border/70 bg-card/35 hover:border-[var(--electric-cyan)]/40",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-foreground">{lap.label}</p>
                          <Badge variant="outline" className="text-[10px]">{strokeLabel}</Badge>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                          <span className="inline-flex items-center gap-1"><Droplets className="size-3.5" /> {formatDistance(lap.distance)}</span>
                          <span className="inline-flex items-center gap-1"><Clock3 className="size-3.5" /> {formatSplitDuration(lap.duration)}</span>
                          <span className="inline-flex items-center gap-1"><Gauge className="size-3.5" /> {lap.pace ? formatPace(lap.pace, lap.distance, lap.duration) : "—"}</span>
                          <span className="inline-flex items-center gap-1"><HeartPulse className="size-3.5" /> {lap.avgHr ? `${lap.avgHr} bpm` : "—"}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>

                {selectedLap ? (
                  <div className="rounded-xl border border-border/70 bg-card/35 p-3">
                    <h3 className="mb-2 text-sm font-semibold text-foreground">Metriche lap selezionato</h3>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      <MetricOrb
                        label="Distanza"
                        value={formatDistance(selectedLap.distance)}
                        progress={Math.max(0, Math.min(100, Math.round((selectedLap.distance / 100) * 100)))}
                        helper="lap"
                        tone="cyan"
                        size="sm"
                        icon={<Droplets className="size-3.5" />}
                      />
                      <MetricOrb
                        label="Durata"
                        value={formatSplitDuration(selectedLap.duration)}
                        progress={Math.max(0, Math.min(100, Math.round((selectedLap.duration / 90) * 100)))}
                        helper="tempo"
                        tone="sky"
                        size="sm"
                        icon={<Clock3 className="size-3.5" />}
                      />
                      <MetricOrb
                        label="Pace"
                        value={selectedLap.pace ? formatPace(selectedLap.pace, selectedLap.distance, selectedLap.duration) : "—"}
                        progress={
                          selectedLap.pace
                            ? Math.max(0, Math.min(100, Math.round((180 - selectedLap.pace) / 1.5)))
                            : 0
                        }
                        helper="min/100m"
                        tone="lime"
                        size="sm"
                        icon={<Gauge className="size-3.5" />}
                      />
                      <MetricOrb
                        label="SWOLF"
                        value={selectedLap.swolf ?? "—"}
                        progress={
                          selectedLap.swolf
                            ? Math.max(0, Math.min(100, Math.round((60 - selectedLap.swolf) * 2.2)))
                            : 0
                        }
                        helper="efficienza"
                        tone="amber"
                        size="sm"
                        icon={<Waves className="size-3.5" />}
                      />
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-3">
                      <span>Stile: {getStrokeLabel(selectedLap.dominantStroke ?? activityStroke)}</span>
                      <span>Cumulato: {formatSplitDuration(selectedLap.cumulativeSeconds)}</span>
                      <span>Pace migliore: {selectedLap.bestPace ? formatPace(selectedLap.bestPace, selectedLap.distance, selectedLap.duration) : "—"}</span>
                      <span>FC media: {selectedLap.avgHr ? `${selectedLap.avgHr} bpm` : "—"}</span>
                      <span>FC max: {selectedLap.maxHr ? `${selectedLap.maxHr} bpm` : "—"}</span>
                      <span>Bracciate totali: {selectedLap.totalStrokes ?? "—"}</span>
                      <span>Bracciate medie: {selectedLap.avgStrokes ?? "—"}</span>
                      <span>Calorie: {selectedLap.calories ? `${selectedLap.calories}` : "—"}</span>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </section>

          <section className="surface-panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-display font-semibold text-foreground">Splits</h2>
              <span className="text-xs text-muted-foreground">
                {splits.length > 0
                  ? "Panoramica split con tutti i valori disponibili"
                  : "Split non disponibili: mostrati i dati lap sul lato destro"}
              </span>
            </div>

            <div className="space-y-2">
              <div className="max-h-[40dvh] space-y-2 overflow-y-auto pr-1">
                {effectiveSplits.map((split, index) => {
                  const strokeLabel = getStrokeLabel(split.stroke)
                  return (
                    <button
                      key={`split-row-${index}`}
                      type="button"
                      onClick={() => setSelectedSplitIdx(index)}
                      className={cn(
                        "w-full rounded-xl border p-3 text-left transition-colors",
                        selectedSplitIdx === index
                          ? "border-[var(--electric-lime)]/60 bg-[color-mix(in_oklch,var(--electric-lime)_11%,transparent)]"
                          : "border-border/70 bg-card/35 hover:border-[var(--electric-lime)]/45",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground">{split.label}</p>
                        <Badge variant="outline" className="text-[10px]">{strokeLabel}</Badge>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                        <span className="inline-flex items-center gap-1"><Droplets className="size-3.5" /> {formatDistance(split.distance)}</span>
                        <span className="inline-flex items-center gap-1"><Clock3 className="size-3.5" /> {formatDuration(split.duration)}</span>
                        <span className="inline-flex items-center gap-1"><Gauge className="size-3.5" /> {split.pace ? formatPace(split.pace, split.distance ?? 0, split.duration ?? 0) : "—"}</span>
                        <span className="inline-flex items-center gap-1"><HeartPulse className="size-3.5" /> {split.avgHr ? `${split.avgHr} bpm` : "—"}</span>
                      </div>
                    </button>
                  )
                })}
              </div>

              {selectedEffectiveSplit ? (
                <div className="rounded-xl border border-border/70 bg-card/35 p-3">
                  <h3 className="mb-2 text-sm font-semibold text-foreground">Metriche split selezionato</h3>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricOrb
                      label="Distanza"
                      value={formatDistance(selectedEffectiveSplit.distance)}
                      progress={Math.max(0, Math.min(100, Math.round(((selectedEffectiveSplit.distance ?? 0) / 100) * 100)))}
                      helper="split"
                      tone="cyan"
                      size="sm"
                      icon={<Droplets className="size-3.5" />}
                    />
                    <MetricOrb
                      label="Durata"
                      value={formatSplitDuration(selectedEffectiveSplit.duration)}
                      progress={Math.max(0, Math.min(100, Math.round(((selectedEffectiveSplit.duration ?? 0) / 90) * 100)))}
                      helper="tempo"
                      tone="sky"
                      size="sm"
                      icon={<Clock3 className="size-3.5" />}
                    />
                    <MetricOrb
                      label="Pace"
                      value={selectedEffectiveSplit.pace ? formatPace(selectedEffectiveSplit.pace, selectedEffectiveSplit.distance ?? 0, selectedEffectiveSplit.duration ?? 0) : "—"}
                      progress={
                        selectedEffectiveSplit.pace
                          ? Math.max(0, Math.min(100, Math.round((180 - selectedEffectiveSplit.pace) / 1.5)))
                          : 0
                      }
                      helper="min/100m"
                      tone="lime"
                      size="sm"
                      icon={<Gauge className="size-3.5" />}
                    />
                    <MetricOrb
                      label="SWOLF"
                      value={selectedEffectiveSplit.swolf ?? "—"}
                      progress={
                        selectedEffectiveSplit.swolf
                          ? Math.max(0, Math.min(100, Math.round((60 - selectedEffectiveSplit.swolf) * 2.2)))
                          : 0
                      }
                      helper="efficienza"
                      tone="amber"
                      size="sm"
                      icon={<Waves className="size-3.5" />}
                    />
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-3">
                    <span>Stile: {getStrokeLabel(selectedEffectiveSplit.stroke ?? activityStroke)}</span>
                    <span>Lap inclusi: {selectedEffectiveSplit.laps ?? 1}</span>
                    <span>FC media: {selectedEffectiveSplit.avgHr ? `${selectedEffectiveSplit.avgHr} bpm` : "—"}</span>
                    <span>Bracciate: {selectedEffectiveSplit.strokes ?? "—"}</span>
                    <span>Cadence: {selectedEffectiveSplit.cadence ?? "—"}</span>
                    <span>Calorie: {toNumber(pickFirst(selectedEffectiveSplit.raw, ["calories", "caloriesBurned"])) ?? "—"}</span>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-border/70 bg-card/40 p-4 text-sm text-muted-foreground">
                  Nessun dato split/lap disponibile per questa attività.
                </div>
              )}
            </div>
          </section>
        </div>

        {(laps.length === 0 && splits.length === 0) ? (
          <section className="surface-panel p-4 text-sm text-muted-foreground">
            Nessun dato laps/splits disponibile in questa attività. Se proviene da sync esterna, verifica che il provider includa i dettagli estesi.
          </section>
        ) : null}
      </div>
    </AppLayout>
  )
}
