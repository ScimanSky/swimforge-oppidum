"use client"

import AppLayout from "@/components/AppLayout"
import { trpc } from "@/lib/trpc"
import { useRoute, Link } from "wouter"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ArrowLeft,
  Droplets,
  Timer,
  HeartPulse,
  Gauge,
  MapPin,
  Trophy,
} from "lucide-react"

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

const formatPace = (secondsPer100m?: number | null, distanceMeters?: number | null, durationSeconds?: number | null) => {
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

const formatNumber = (value?: number | null, suffix?: string) => {
  if (value === null || value === undefined || Number.isNaN(value)) return "—"
  return `${value}${suffix ?? ""}`
}

const toNumber = (value: any) => {
  if (value === null || value === undefined || value === "") return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

const pickFirst = (obj: any, keys: string[]) => {
  if (!obj) return null
  for (const key of keys) {
    const value = obj[key]
    if (value !== null && value !== undefined) {
      return value
    }
  }
  return null
}

const getDistanceMeters = (obj: any) =>
  toNumber(
    pickFirst(obj, [
      "distance",
      "distanceMeters",
      "distanceInMeters",
      "totalDistance",
      "distance_meters",
    ])
  )

const getDurationSeconds = (obj: any) =>
  toNumber(
    pickFirst(obj, [
      "duration",
      "durationSeconds",
      "elapsedDuration",
      "movingDuration",
      "activeDuration",
      "duration_seconds",
    ])
  )

const getSpeedMps = (obj: any) => {
  const raw = toNumber(
    pickFirst(obj, ["averageSpeed", "avgSpeed", "averageMovingSpeed", "avgMovingSpeed"])
  )
  if (!raw) return null
  return raw > 15 ? raw / 3.6 : raw
}

const getPacePer100m = (obj: any) => {
  const pace = toNumber(
    pickFirst(obj, ["avgPacePer100m", "averagePace", "avgPace", "pacePer100m"])
  )
  if (pace && pace > 0) return pace
  const speed = getSpeedMps(obj)
  if (speed && speed > 0) return 100 / speed
  const distance = getDistanceMeters(obj)
  const duration = getDurationSeconds(obj)
  if (distance && duration) return duration / (distance / 100)
  return null
}

export default function ActivityDetail() {
  const [, params] = useRoute<{ id: string }>("/activities/:id")
  const activityId = params?.id ? Number(params.id) : NaN
  const activityQuery = trpc.activities.get.useQuery(
    { id: activityId },
    { enabled: Number.isFinite(activityId) }
  )

  const activity = activityQuery.data
  const isLoading = activityQuery.isLoading
  const garminDetails = (activity?.rawData as any)?.garmin_details ?? null

  const avgSpeedKmh =
    activity?.distanceMeters && activity?.durationSeconds
      ? (activity.distanceMeters / 1000) / (activity.durationSeconds / 3600)
      : null

  const hrZones = [
    { label: "Z1", seconds: activity?.hrZone1Seconds ?? 0 },
    { label: "Z2", seconds: activity?.hrZone2Seconds ?? 0 },
    { label: "Z3", seconds: activity?.hrZone3Seconds ?? 0 },
    { label: "Z4", seconds: activity?.hrZone4Seconds ?? 0 },
    { label: "Z5", seconds: activity?.hrZone5Seconds ?? 0 },
  ]
  const totalHrSeconds = hrZones.reduce((sum, zone) => sum + (zone.seconds || 0), 0)
  const hasDbHrZones = hrZones.some((zone) => (zone.seconds || 0) > 0)

  const garminSummarySource = garminDetails?.details ?? garminDetails?.activity ?? null
  const garminDistance = garminSummarySource ? getDistanceMeters(garminSummarySource) : null
  const garminDuration = garminSummarySource ? getDurationSeconds(garminSummarySource) : null
  const garminPace = garminSummarySource ? getPacePer100m(garminSummarySource) : null
  const garminSpeed = garminSummarySource ? getSpeedMps(garminSummarySource) : null
  const garminStrokeType = garminSummarySource
    ? pickFirst(garminSummarySource, ["strokeType", "swimStrokeType", "avgStrokeType"])
    : null

  const summaryMetrics = [
    { label: "Distanza", value: garminDistance ? formatDistance(garminDistance) : "—" },
    { label: "Durata", value: garminDuration ? formatDuration(garminDuration) : "—" },
    { label: "Pace medio", value: garminPace ? formatPace(garminPace, garminDistance ?? 0, garminDuration ?? 0) : "—" },
    { label: "Velocità media", value: garminSpeed ? `${(garminSpeed * 3.6).toFixed(1)} km/h` : "—" },
    { label: "Calorie", value: formatNumber(toNumber(pickFirst(garminSummarySource, ["calories", "caloriesBurned"]))) },
    { label: "FC media", value: formatNumber(toNumber(pickFirst(garminSummarySource, ["averageHR", "avgHeartRate"])), " bpm") },
    { label: "FC max", value: formatNumber(toNumber(pickFirst(garminSummarySource, ["maxHR", "maxHeartRate"])), " bpm") },
    { label: "SWOLF", value: formatNumber(toNumber(pickFirst(garminSummarySource, ["averageSwolf", "avgSwolf"]))) },
    { label: "Stile", value: garminStrokeType ? String(garminStrokeType) : "—" },
    { label: "Vasche", value: formatNumber(toNumber(pickFirst(garminSummarySource, ["lapCount", "totalLaps"]))) },
    { label: "Lunghezza vasca", value: formatNumber(toNumber(pickFirst(garminSummarySource, ["poolLength", "poolLengthMeters"])), " m") },
  ].filter((item) => item.value !== "—")

  const normalizeStrokeDistanceCm = (value: any) => {
    const num = toNumber(value)
    if (!num) return null
    return num < 10 ? num * 100 : num
  }

  const techMetrics = {
    swolf:
      activity?.avgSwolf ??
      toNumber(pickFirst(garminSummarySource, ["averageSwolf", "avgSwolf"])),
    avgStrokeDistance:
      activity?.avgStrokeDistance ??
      normalizeStrokeDistanceCm(
        pickFirst(garminSummarySource, ["avgStrokeDistance", "averageStrokeDistance"])
      ),
    avgStrokes:
      activity?.avgStrokes ??
      toNumber(pickFirst(garminSummarySource, ["avgStrokes", "averageStrokes"])),
    avgStrokeCadence:
      activity?.avgStrokeCadence ??
      toNumber(pickFirst(garminSummarySource, ["avgStrokeCadenceRpm", "avgStrokeCadence"])),
    trainingEffect:
      activity?.trainingEffect ??
      toNumber(pickFirst(garminSummarySource, ["aerobicTrainingEffect", "trainingEffect"])),
    anaerobicTrainingEffect:
      activity?.anaerobicTrainingEffect ??
      toNumber(pickFirst(garminSummarySource, ["anaerobicTrainingEffect"])),
    vo2MaxValue:
      activity?.vo2MaxValue ??
      toNumber(pickFirst(garminSummarySource, ["vO2MaxValue", "vo2MaxValue"])),
    recoveryTimeHours:
      activity?.recoveryTimeHours ??
      (() => {
        const minutes = toNumber(pickFirst(garminSummarySource, ["recoveryTime", "recoveryTimeMinutes"]))
        return minutes ? Math.round(minutes / 60) : null
      })(),
    avgStress:
      activity?.avgStress ??
      toNumber(pickFirst(garminSummarySource, ["averageStress", "avgStress"])),
  }

  const displayAvgHr =
    activity?.avgHeartRate ??
    toNumber(pickFirst(garminSummarySource, ["averageHR", "avgHeartRate"]))
  const displayMaxHr =
    activity?.maxHeartRate ??
    toNumber(pickFirst(garminSummarySource, ["maxHR", "maxHeartRate"]))
  const displayRestingHr =
    activity?.restingHeartRate ??
    toNumber(pickFirst(garminSummarySource, ["restingHeartRate"]))

  const normalizeZones = (zones: any) => {
    if (!zones) return []
    const map: Record<string, number> = {}
    if (Array.isArray(zones)) {
      zones.forEach((zone) => {
        const zoneNum = zone?.zoneNumber ?? zone?.zone ?? zone?.zoneIndex
        const seconds =
          toNumber(
            pickFirst(zone, ["secsInZone", "seconds", "timeInSeconds", "value"])
          ) ?? 0
        if (zoneNum) {
          map[`Z${zoneNum}`] = seconds
        }
      })
    } else if (typeof zones === "object") {
      const zoneValues = [
        zones.zone1TimeInSeconds ?? zones.zone1 ?? zones.zone1Seconds,
        zones.zone2TimeInSeconds ?? zones.zone2 ?? zones.zone2Seconds,
        zones.zone3TimeInSeconds ?? zones.zone3 ?? zones.zone3Seconds,
        zones.zone4TimeInSeconds ?? zones.zone4 ?? zones.zone4Seconds,
        zones.zone5TimeInSeconds ?? zones.zone5 ?? zones.zone5Seconds,
      ]
      zoneValues.forEach((value, index) => {
        map[`Z${index + 1}`] = toNumber(value) ?? 0
      })
    }
    return Object.entries(map).map(([label, seconds]) => ({ label, seconds }))
  }

  const garminHrZones = normalizeZones(garminDetails?.hr_zones)
  const displayHrZones = hasDbHrZones ? hrZones : garminHrZones
  const displayHrTotal = displayHrZones.reduce((sum, zone) => sum + (zone.seconds || 0), 0)
  const garminPowerZones = normalizeZones(garminDetails?.power_zones)
  const garminSplits = Array.isArray(garminDetails?.splits) ? garminDetails.splits : []
  const garminTypedSplits = Array.isArray(garminDetails?.typed_splits) ? garminDetails.typed_splits : []
  const garminSplitSummaries = Array.isArray(garminDetails?.split_summaries)
    ? garminDetails.split_summaries
    : []
  const garminWeather = garminDetails?.weather ?? null
  const garminGear = garminDetails?.gear ?? null
  const garminExerciseSets = Array.isArray(garminDetails?.exercise_sets)
    ? garminDetails.exercise_sets
    : []

  const strokeLabels: Record<string, string> = {
    freestyle: "Stile libero",
    backstroke: "Dorso",
    breaststroke: "Rana",
    butterfly: "Farfalla",
    mixed: "Misto",
  }

  const normalizeStrokeKey = (value: any) => {
    if (!value) return "mixed"
    const raw = String(value).toLowerCase().replace(/\s+/g, "_")
    if (raw.includes("free") || raw.includes("stile") || raw.includes("crawl")) return "freestyle"
    if (raw.includes("back") || raw.includes("dorso")) return "backstroke"
    if (raw.includes("breast") || raw.includes("rana")) return "breaststroke"
    if (raw.includes("butter") || raw.includes("farf")) return "butterfly"
    if (raw.includes("mix")) return "mixed"
    return raw
  }

  const typedSplitsSummary = garminTypedSplits.reduce(
    (acc: Record<string, { distance: number; duration: number; laps: number; count: number }>, split) => {
      const strokeKey = normalizeStrokeKey(
        pickFirst(split, ["strokeType", "swimStrokeType", "avgStrokeType", "stroke", "type"])
      )
      const distance = getDistanceMeters(split) ?? 0
      const duration = getDurationSeconds(split) ?? 0
      const laps = toNumber(pickFirst(split, ["lapCount", "totalLaps", "numLaps", "laps"])) ?? 0
      if (!acc[strokeKey]) {
        acc[strokeKey] = { distance: 0, duration: 0, laps: 0, count: 0 }
      }
      acc[strokeKey].distance += distance
      acc[strokeKey].duration += duration
      acc[strokeKey].laps += laps
      acc[strokeKey].count += 1
      return acc
    },
    {}
  )

  const typedSplitsSummaryList = Object.entries(typedSplitsSummary).map(([strokeKey, data]) => {
    const pace = data.distance > 0 ? data.duration / (data.distance / 100) : null
    return {
      strokeKey,
      label: strokeLabels[strokeKey] ?? strokeKey,
      distance: data.distance,
      duration: data.duration,
      laps: data.laps || data.count,
      pace,
    }
  })

  const renderMetricRow = (label: string, value: string) => (
    <div key={label} className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  )

  const renderSplitCard = (split: any, index: number) => {
    const distance = getDistanceMeters(split)
    const duration = getDurationSeconds(split)
    const pace = getPacePer100m(split)
    const avgHr = toNumber(pickFirst(split, ["averageHR", "avgHeartRate", "avgHR"]))
    const swolf = toNumber(pickFirst(split, ["averageSwolf", "avgSwolf"]))
    const stroke = pickFirst(split, ["strokeType", "swimStrokeType", "avgStrokeType", "stroke"])
    const cadence = toNumber(pickFirst(split, ["avgStrokeCadence", "avgStrokeCadenceRpm", "avgCadence"]))
    const strokes = toNumber(pickFirst(split, ["avgStrokes", "averageStrokes", "strokes"]))
    return (
      <div key={`split-${index}`} className="rounded-lg border border-border bg-background/60 p-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Lap {index + 1}</span>
          {stroke ? <span className="capitalize">{stroke}</span> : null}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <span>Distanza: {distance ? formatDistance(distance) : "—"}</span>
          <span>Durata: {duration ? formatDuration(duration) : "—"}</span>
          <span>Pace: {pace ? formatPace(pace, distance ?? 0, duration ?? 0) : "—"}</span>
          <span>FC: {avgHr ? `${avgHr} bpm` : "—"}</span>
          <span>SWOLF: {swolf ?? "—"}</span>
          <span>Cadenza: {cadence ? `${cadence} spm` : "—"}</span>
          <span>Bracciate: {strokes ?? "—"}</span>
        </div>
      </div>
    )
  }

  const renderExerciseSet = (set: any, index: number) => {
    const name = pickFirst(set, ["exerciseName", "name", "exercise", "activity"])
    const reps = toNumber(pickFirst(set, ["reps", "repetitions"]))
    const weight = toNumber(pickFirst(set, ["weight", "weightKg", "weight_kg"]))
    const duration = toNumber(pickFirst(set, ["duration", "durationSeconds"]))
    return (
      <div key={`exercise-${index}`} className="rounded-lg border border-border bg-background/60 p-3 text-xs">
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Set {index + 1}</span>
          {name ? <span className="font-medium text-foreground">{name}</span> : null}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <span>Ripetizioni: {reps ?? "—"}</span>
          <span>Peso: {weight ? `${weight} kg` : "—"}</span>
          <span>Durata: {duration ? formatDuration(duration) : "—"}</span>
        </div>
      </div>
    )
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/activities">
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">Dettaglio attività</p>
            <h1 className="text-2xl font-display font-bold text-foreground">
              {activity?.activityName || "Swim Session"}
            </h1>
          </div>
          {activity?.activitySource && (
            <Badge variant="secondary" className="text-xs capitalize">
              {activity.activitySource}
            </Badge>
          )}
        </div>

        {isLoading ? (
          <Card className="bg-card border-border">
            <CardContent className="p-6 space-y-4">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
        ) : !activity ? (
          <Card className="bg-card border-border">
            <CardContent className="p-6 text-sm text-muted-foreground">
              Attività non trovata.
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="font-display">Riepilogo</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-border bg-background/60 p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Droplets className="size-4 text-primary" />
                    Distanza
                  </div>
                  <p className="mt-2 text-lg font-semibold text-foreground">
                    {formatDistance(activity.distanceMeters)}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-background/60 p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Timer className="size-4 text-primary" />
                    Durata
                  </div>
                  <p className="mt-2 text-lg font-semibold text-foreground">
                    {formatDuration(activity.durationSeconds)}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-background/60 p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Gauge className="size-4 text-primary" />
                    Pace medio
                  </div>
                  <p className="mt-2 text-lg font-semibold text-foreground">
                    {formatPace(activity.avgPacePer100m, activity.distanceMeters, activity.durationSeconds)}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-background/60 p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Trophy className="size-4 text-primary" />
                    XP
                  </div>
                  <p className="mt-2 text-lg font-semibold text-foreground">
                    +{activity.xpEarned ?? 0}
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="font-display">Dettagli sessione</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Data</span>
                    <span className="font-medium text-foreground">{formatDateTime(activity.activityDate)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Tipo</span>
                    <span className="font-medium text-foreground">
                      {activity.isOpenWater ? "Acque libere" : "Vasca"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Stile</span>
                    <span className="font-medium text-foreground capitalize">
                      {activity.strokeType ?? "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Lunghezza vasca</span>
                    <span className="font-medium text-foreground">
                      {formatNumber(activity.poolLengthMeters, " m")}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Numero vasche</span>
                    <span className="font-medium text-foreground">{formatNumber(activity.lapsCount)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Velocità media</span>
                    <span className="font-medium text-foreground">
                      {avgSpeedKmh ? `${avgSpeedKmh.toFixed(2)} km/h` : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Calorie</span>
                    <span className="font-medium text-foreground">{formatNumber(activity.calories)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Luogo</span>
                    <span className="font-medium text-foreground flex items-center gap-1">
                      {activity.location ? <MapPin className="size-3 text-muted-foreground" /> : null}
                      {activity.location ?? "—"}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="font-display">Tecnica & Efficienza</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">SWOLF medio</span>
                    <span className="font-medium text-foreground">{formatNumber(techMetrics.swolf)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Distanza media bracciata</span>
                    <span className="font-medium text-foreground">{formatNumber(techMetrics.avgStrokeDistance, " cm")}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Bracciate per vasca</span>
                    <span className="font-medium text-foreground">{formatNumber(techMetrics.avgStrokes)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Cadenza bracciata</span>
                    <span className="font-medium text-foreground">{formatNumber(techMetrics.avgStrokeCadence, " spm")}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Training effect</span>
                    <span className="font-medium text-foreground">{formatNumber(techMetrics.trainingEffect)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Anaerobic TE</span>
                    <span className="font-medium text-foreground">{formatNumber(techMetrics.anaerobicTrainingEffect)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">VO2 max</span>
                    <span className="font-medium text-foreground">{formatNumber(techMetrics.vo2MaxValue)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Recupero</span>
                    <span className="font-medium text-foreground">{formatNumber(techMetrics.recoveryTimeHours, " h")}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Stress medio</span>
                    <span className="font-medium text-foreground">{formatNumber(techMetrics.avgStress)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="font-display">Frequenza cardiaca</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-border bg-background/60 p-3">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <HeartPulse className="size-4 text-primary" />
                        Media
                      </div>
                      <p className="mt-2 text-lg font-semibold text-foreground">
                        {formatNumber(displayAvgHr, " bpm")}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-background/60 p-3">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <HeartPulse className="size-4 text-primary" />
                        Massima
                      </div>
                      <p className="mt-2 text-lg font-semibold text-foreground">
                        {formatNumber(displayMaxHr, " bpm")}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-background/60 p-3">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <HeartPulse className="size-4 text-primary" />
                        Riposo
                      </div>
                      <p className="mt-2 text-lg font-semibold text-foreground">
                        {formatNumber(displayRestingHr, " bpm")}
                      </p>
                    </div>
                  </div>

                  {displayHrTotal > 0 ? (
                    <div className="space-y-2">
                      {displayHrZones.map((zone) => {
                        const percent = displayHrTotal
                          ? Math.round((zone.seconds / displayHrTotal) * 100)
                          : 0
                        return (
                          <div key={zone.label} className="flex items-center gap-3">
                            <span className="w-8 text-xs text-muted-foreground">{zone.label}</span>
                            <div className="h-2 flex-1 rounded-full bg-muted">
                              <div
                                className="h-2 rounded-full bg-primary"
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {Math.round(zone.seconds / 60)} min · {percent}%
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Zone cardio non disponibili.</p>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="font-display">Dettagli Garmin avanzati</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {!garminDetails ? (
                  <p className="text-xs text-muted-foreground">
                    Dettagli Garmin non disponibili. Assicurati di essere connesso a Garmin e
                    ricarica la pagina.
                  </p>
                ) : (
                  <>
                    {summaryMetrics.length > 0 && (
                      <div className="rounded-lg border border-border bg-background/60 p-4 space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase">Riepilogo Garmin</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {summaryMetrics.map((item) => renderMetricRow(item.label, item.value))}
                        </div>
                      </div>
                    )}

                    {garminSplits.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase">Splits (laps)</p>
                        <div className="grid gap-3 md:grid-cols-2">
                          {garminSplits.map(renderSplitCard)}
                        </div>
                      </div>
                    )}

                    {garminTypedSplits.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase">Splits per stile</p>
                        {typedSplitsSummaryList.length > 0 && (
                          <div className="grid gap-3 sm:grid-cols-2">
                            {typedSplitsSummaryList.map((summary) => (
                              <div
                                key={summary.strokeKey}
                                className="rounded-lg border border-border bg-background/60 p-4"
                              >
                                <div className="flex items-center justify-between">
                                  <p className="text-sm font-semibold text-foreground">{summary.label}</p>
                                  <Badge variant="secondary" className="text-xs">
                                    {summary.laps} vasche
                                  </Badge>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                                  <span>Distanza: {summary.distance ? formatDistance(summary.distance) : "—"}</span>
                                  <span>Durata: {summary.duration ? formatDuration(summary.duration) : "—"}</span>
                                  <span>Pace: {summary.pace ? formatPace(summary.pace, summary.distance, summary.duration) : "—"}</span>
                                  <span>Lap: {summary.laps}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        <details className="rounded-lg border border-border bg-background/60 p-3">
                          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                            Dettaglio laps per stile
                          </summary>
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            {garminTypedSplits.map(renderSplitCard)}
                          </div>
                        </details>
                      </div>
                    )}

                    {garminSplitSummaries.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase">Riepilogo splits</p>
                        <div className="grid gap-3 md:grid-cols-2">
                          {garminSplitSummaries.map(renderSplitCard)}
                        </div>
                      </div>
                    )}

                    {garminWeather && (
                      <div className="rounded-lg border border-border bg-background/60 p-4 space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase">Meteo</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {renderMetricRow("Temperatura", formatNumber(toNumber(pickFirst(garminWeather, ["temperature", "temp"])),"°C"))}
                          {renderMetricRow("Umidità", formatNumber(toNumber(pickFirst(garminWeather, ["humidity"])), "%"))}
                          {renderMetricRow("Vento", formatNumber(toNumber(pickFirst(garminWeather, ["windSpeed", "wind_speed"])), " km/h"))}
                          {renderMetricRow("Condizioni", String(pickFirst(garminWeather, ["condition", "conditions", "summary"]) ?? "—"))}
                        </div>
                      </div>
                    )}

                    {garminPowerZones.length > 0 && (
                      <div className="rounded-lg border border-border bg-background/60 p-4 space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase">Zone potenza</p>
                        {garminPowerZones.map((zone) => {
                          const total = garminPowerZones.reduce((sum, z) => sum + (z.seconds || 0), 0)
                          const percent = total ? Math.round((zone.seconds / total) * 100) : 0
                          return (
                            <div key={zone.label} className="flex items-center gap-3">
                              <span className="w-8 text-xs text-muted-foreground">{zone.label}</span>
                              <div className="h-2 flex-1 rounded-full bg-muted">
                                <div className="h-2 rounded-full bg-primary" style={{ width: `${percent}%` }} />
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {Math.round((zone.seconds || 0) / 60)} min · {percent}%
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {garminGear && (
                      <div className="rounded-lg border border-border bg-background/60 p-4 space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase">Gear</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {renderMetricRow(
                            "Nome",
                            String(pickFirst(garminGear, ["name", "gearName", "displayName"]) ?? "—")
                          )}
                          {renderMetricRow(
                            "Tipo",
                            String(pickFirst(garminGear, ["type", "gearType"]) ?? "—")
                          )}
                        </div>
                      </div>
                    )}

                    {garminExerciseSets.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase">Exercise sets</p>
                        <div className="grid gap-3 md:grid-cols-2">
                          {garminExerciseSets.map(renderExerciseSet)}
                        </div>
                      </div>
                    )}

                    <details className="rounded-lg border border-border bg-background/60 p-3">
                      <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                        Mostra dati Garmin completi (JSON)
                      </summary>
                      <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs text-foreground">
                        {JSON.stringify(garminDetails, null, 2)}
                      </pre>
                    </details>
                  </>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  )
}
