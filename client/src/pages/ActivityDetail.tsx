"use client"

import AppLayout from "@/components/AppLayout"
import { trpc } from "@/lib/trpc"
import { useRoute, Link } from "wouter"
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Surface, SurfaceContent, SurfaceHeader, SurfaceTitle } from "@/components/ui/surface"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { MetricOrb } from "@/components/metrics/MetricOrb"
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

const formatSplitDuration = (seconds?: number | null) => {
  if (!seconds && seconds !== 0) return "—"
  if (seconds === 0) return "0:00"
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.round(seconds % 60)
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`
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

const toNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

const pickFirst = (obj: Record<string, unknown> | null | undefined, keys: string[]) => {
  if (!obj) return null
  for (const key of keys) {
    const value = obj[key]
    if (value !== null && value !== undefined) {
      return value
    }
  }
  return null
}

const getDistanceMeters = (obj: Record<string, unknown> | null | undefined) =>
  toNumber(
    pickFirst(obj, [
      "distance",
      "distanceMeters",
      "distanceInMeters",
      "totalDistance",
      "distance_meters",
    ])
  )

const getDurationSeconds = (obj: Record<string, unknown> | null | undefined) =>
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

const getSpeedMps = (obj: Record<string, unknown> | null | undefined) => {
  const raw = toNumber(
    pickFirst(obj, ["averageSpeed", "avgSpeed", "averageMovingSpeed", "avgMovingSpeed"])
  )
  if (!raw) return null
  return raw > 15 ? raw / 3.6 : raw
}

const getPacePer100m = (obj: Record<string, unknown> | null | undefined) => {
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

	  const garminSummarySource =
	    garminDetails?.activity?.summaryDTO ??
	    garminDetails?.summaryDTO ??
	    garminDetails?.details ??
	    garminDetails?.activity ??
	    null
	  const normalizeStrokeDistanceCm = (value: unknown) => {
	    const num = toNumber(value)
	    if (!num) return null
	    return num < 10 ? num * 100 : num
	  }

  const techMetrics = {
    swolf:
      activity?.avgSwolf ??
      toNumber(pickFirst(garminSummarySource, ["averageSwolf", "avgSwolf", "averageSWOLF"])),
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
      toNumber(pickFirst(garminSummarySource, ["avgStrokeCadenceRpm", "avgStrokeCadence", "averageSwimCadence"])),
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
  const summaryOrbs = useMemo(() => {
    const paceValue = formatPace(activity?.avgPacePer100m, activity?.distanceMeters, activity?.durationSeconds)
    const paceSeconds =
      activity?.avgPacePer100m && activity.avgPacePer100m > 0
        ? activity.avgPacePer100m
        : activity?.distanceMeters && activity?.durationSeconds
          ? activity.durationSeconds / (activity.distanceMeters / 100)
          : 0

    return [
      {
        label: "Distanza",
        value: formatDistance(activity?.distanceMeters),
        progress: Math.min(100, Math.round(((activity?.distanceMeters ?? 0) / 10000) * 100)),
        helper: "Sessione",
        icon: <Droplets className="size-4" />,
        tone: "cyan" as const,
      },
      {
        label: "Durata",
        value: formatDuration(activity?.durationSeconds),
        progress: Math.min(100, Math.round(((activity?.durationSeconds ?? 0) / 7200) * 100)),
        helper: "Tempo in acqua",
        icon: <Timer className="size-4" />,
        tone: "sky" as const,
      },
      {
        label: "Pace medio",
        value: paceValue,
        progress: paceSeconds > 0 ? Math.min(100, Math.round((240 / paceSeconds) * 100)) : 0,
        helper: "Efficienza",
        icon: <Gauge className="size-4" />,
        tone: "lime" as const,
      },
      {
        label: "XP",
        value: `+${activity?.xpEarned ?? 0}`,
        progress: Math.min(100, Math.round(((activity?.xpEarned ?? 0) / 600) * 100)),
        helper: "Guadagnati",
        icon: <Trophy className="size-4" />,
        tone: "amber" as const,
      },
    ]
  }, [activity])

  const hrOrbs = useMemo(
    () => [
      {
        label: "FC media",
        value: formatNumber(displayAvgHr, " bpm"),
        progress: Math.min(100, Math.round(((displayAvgHr ?? 0) / 200) * 100)),
        helper: "Cardio",
      },
      {
        label: "FC massima",
        value: formatNumber(displayMaxHr, " bpm"),
        progress: Math.min(100, Math.round(((displayMaxHr ?? 0) / 205) * 100)),
        helper: "Picco",
      },
      {
        label: "FC riposo",
        value: formatNumber(displayRestingHr, " bpm"),
        progress:
          displayRestingHr && displayRestingHr > 0
            ? Math.min(100, Math.round((85 / displayRestingHr) * 100))
            : 0,
        helper: "Recupero",
      },
    ],
    [displayAvgHr, displayMaxHr, displayRestingHr]
  )

	  const normalizeZones = (zones: unknown) => {
	    if (!zones) return []
	    const map: Record<string, number> = {}
	    if (Array.isArray(zones)) {
	      zones.forEach((zone) => {
	        if (!zone || typeof zone !== "object") return
	        const zoneRec = zone as Record<string, unknown>
	        const zoneNum = toNumber(
	          zoneRec["zoneNumber"] ?? zoneRec["zone"] ?? zoneRec["zoneIndex"]
	        )
	        const seconds =
	          toNumber(
	            pickFirst(zoneRec, ["secsInZone", "seconds", "timeInSeconds", "value"])
	          ) ?? 0
	        if (zoneNum) {
	          map[`Z${zoneNum}`] = seconds
	        }
      })
	    } else if (typeof zones === "object") {
	      const zonesRec = zones as Record<string, unknown>
	      const zoneValues = [
	        zonesRec["zone1TimeInSeconds"] ?? zonesRec["zone1"] ?? zonesRec["zone1Seconds"],
	        zonesRec["zone2TimeInSeconds"] ?? zonesRec["zone2"] ?? zonesRec["zone2Seconds"],
	        zonesRec["zone3TimeInSeconds"] ?? zonesRec["zone3"] ?? zonesRec["zone3Seconds"],
	        zonesRec["zone4TimeInSeconds"] ?? zonesRec["zone4"] ?? zonesRec["zone4Seconds"],
	        zonesRec["zone5TimeInSeconds"] ?? zonesRec["zone5"] ?? zonesRec["zone5Seconds"],
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
  const garminSplits = Array.isArray(garminDetails?.splits?.lapDTOs)
    ? garminDetails.splits.lapDTOs
    : Array.isArray(garminDetails?.splits)
    ? garminDetails.splits
    : []
  const garminTypedSplits = Array.isArray(garminDetails?.typed_splits?.splits)
    ? garminDetails.typed_splits.splits
    : Array.isArray(garminDetails?.typed_splits)
    ? garminDetails.typed_splits
    : []
  const garminSplitSummaries = Array.isArray(garminDetails?.split_summaries?.splitSummaries)
    ? garminDetails.split_summaries.splitSummaries
    : Array.isArray(garminDetails?.split_summaries)
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

	  const normalizeStrokeKey = (value: unknown) => {
	    if (!value) return "mixed"
	    const raw = String(value).toLowerCase().replace(/\s+/g, "_")
	    if (raw.includes("free") || raw.includes("stile") || raw.includes("crawl")) return "freestyle"
    if (raw.includes("back") || raw.includes("dorso")) return "backstroke"
    if (raw.includes("breast") || raw.includes("rana")) return "breaststroke"
    if (raw.includes("butter") || raw.includes("farf")) return "butterfly"
    if (raw.includes("mix")) return "mixed"
    return raw
	  }

	  type TypedSplitStats = { distance: number; duration: number; laps: number; count: number }
    const typedSplitsSource: unknown[] = Array.isArray(garminTypedSplits)
      ? (garminTypedSplits as unknown[])
      : []

	  const typedSplitsSummary: Record<string, TypedSplitStats> = typedSplitsSource.reduce(
	    (acc: Record<string, TypedSplitStats>, split: unknown) => {
        const splitRec =
          split && typeof split === "object" ? (split as Record<string, unknown>) : {}
	      const strokeKey = normalizeStrokeKey(
	        pickFirst(splitRec, ["strokeType", "swimStrokeType", "avgStrokeType", "stroke", "type"])
	      )
	      const distance = getDistanceMeters(splitRec) ?? 0
	      const duration = getDurationSeconds(splitRec) ?? 0
	      const laps = toNumber(pickFirst(splitRec, ["lapCount", "totalLaps", "numLaps", "laps"])) ?? 0
	      if (!acc[strokeKey]) {
	        acc[strokeKey] = { distance: 0, duration: 0, laps: 0, count: 0 }
	      }
	      acc[strokeKey].distance += distance
	      acc[strokeKey].duration += duration
	      acc[strokeKey].laps += laps
	      acc[strokeKey].count += 1
	      return acc
	    },
	    {} as Record<string, TypedSplitStats>
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

	  const renderSplitCard = (split: Record<string, unknown>, index: number) => {
	    const distance = getDistanceMeters(split)
	    const duration = getDurationSeconds(split)
	    const pace = getPacePer100m(split)
	    const avgHr = toNumber(pickFirst(split, ["averageHR", "avgHeartRate", "avgHR"]))
	    const swolf = toNumber(pickFirst(split, ["averageSwolf", "avgSwolf", "averageSWOLF"]))
	    const stroke = pickFirst(split, ["strokeType", "swimStrokeType", "avgStrokeType", "stroke"])
	    const strokeText = stroke ? String(stroke) : null
	    const cadence = toNumber(pickFirst(split, ["avgStrokeCadence", "avgStrokeCadenceRpm", "avgCadence"]))
	    const strokes = toNumber(pickFirst(split, ["avgStrokes", "averageStrokes", "strokes"]))
	    return (
	      <div key={`split-${index}`} className="rounded-lg border border-border bg-background/60 p-3">
	        <div className="flex items-center justify-between text-xs text-muted-foreground">
	          <span>Lap {index + 1}</span>
	          {strokeText ? <span className="capitalize">{strokeText}</span> : null}
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

  type LapSplitItem = {
    index: number
    distance: number
    duration: number
    cumulativeSeconds: number
    avgSpeed: number | null
    maxSpeed: number | null
    avgHr: number | null
    maxHr: number | null
    swolf: number | null
    totalStrokes: number | null
    avgStrokes: number | null
    calories: number | null
    dominantStroke: string | null
    lengths: unknown[]
  }

	  const lapSplits: LapSplitItem[] = (() => {
	    let cumulativeSeconds = 0
	    return garminSplits.map((lap: Record<string, unknown>, index: number) => {
	      const distance = getDistanceMeters(lap) ?? 0
	      const duration = toNumber(pickFirst(lap, ["duration", "movingDuration", "elapsedDuration"])) ?? 0
	      cumulativeSeconds += duration
      const avgSpeed = getSpeedMps(lap)
      const maxSpeed = toNumber(pickFirst(lap, ["maxSpeed", "peakSpeed"]))
      const avgHr = toNumber(pickFirst(lap, ["averageHR", "avgHeartRate", "avgHR"]))
      const maxHr = toNumber(pickFirst(lap, ["maxHR", "maxHeartRate"]))
      const swolf = toNumber(pickFirst(lap, ["averageSWOLF", "averageSwolf", "avgSwolf"]))
      const totalStrokes = toNumber(pickFirst(lap, ["totalNumberOfStrokes", "totalStrokes"]))
      const avgStrokes = toNumber(pickFirst(lap, ["averageStrokes", "avgStrokes"]))
      const calories = toNumber(pickFirst(lap, ["calories", "caloriesBurned"]))
	      const lapRec = (lap && typeof lap === "object") ? (lap as Record<string, unknown>) : null
	      const lengthDTOs = Array.isArray(lapRec?.["lengthDTOs"]) ? (lapRec!["lengthDTOs"] as unknown[]) : []
	      const strokeCounts: Record<string, number> = {}
	      lengthDTOs.forEach((length) => {
	        const lengthRec = (length && typeof length === "object") ? (length as Record<string, unknown>) : null
	        const strokeRaw = lengthRec?.["swimStroke"] ?? lengthRec?.["strokeType"] ?? lengthRec?.["stroke"]
	        const strokeKey = normalizeStrokeKey(strokeRaw)
	        strokeCounts[strokeKey] = (strokeCounts[strokeKey] ?? 0) + 1
	      })
      const dominantStroke =
        Object.entries(strokeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

      return {
        index,
        distance,
        duration,
        cumulativeSeconds,
        avgSpeed,
        maxSpeed,
        avgHr,
        maxHr,
        swolf,
        totalStrokes,
        avgStrokes,
        calories,
        dominantStroke,
        lengths: lengthDTOs,
		  }
	    })
	  })()

	  const buildLapSummary = (laps: LapSplitItem[]) =>
	    laps.reduce(
	      (acc: { distance: number; duration: number; swolfSum: number; swolfCount: number; avgHrSum: number; avgHrCount: number }, lap: LapSplitItem) => {
	        if (lap.distance) acc.distance += lap.distance
	        if (lap.duration) acc.duration += lap.duration
	        if (lap.swolf !== null && lap.swolf !== undefined) {
	          acc.swolfSum += lap.swolf
	          acc.swolfCount += 1
        }
        if (lap.avgHr !== null && lap.avgHr !== undefined) {
          acc.avgHrSum += lap.avgHr
          acc.avgHrCount += 1
        }
        return acc
      },
      { distance: 0, duration: 0, swolfSum: 0, swolfCount: 0, avgHrSum: 0, avgHrCount: 0 }
    )

  const [lapStrokeFilter, setLapStrokeFilter] = useState<string>("all")
  const [lapTypeFilter, setLapTypeFilter] = useState<"all" | "work" | "recovery">("all")

  const lapStrokeOptions = useMemo(() => {
    const counts = new Map<string, number>()
    lapSplits.forEach((lap) => {
      const key = lap.dominantStroke ?? "mixed"
      counts.set(key, (counts.get(key) ?? 0) + 1)
    })
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({
        key,
        label: strokeLabels[key] ?? key,
        count,
      }))
  }, [lapSplits])

  const filteredLapSplits = lapSplits.filter((lap) => {
    const isRecovery = !lap.distance || lap.distance === 0
    if (lapTypeFilter === "work" && isRecovery) return false
    if (lapTypeFilter === "recovery" && !isRecovery) return false
    if (lapStrokeFilter !== "all") {
      const strokeKey = lap.dominantStroke ?? "mixed"
      if (strokeKey !== lapStrokeFilter) return false
    }
    return true
  })

  const lapSummary = buildLapSummary(filteredLapSplits)

  const lapSummaryStats = {
    distance: lapSummary.distance,
    duration: lapSummary.duration,
    pace:
      lapSummary.distance > 0 ? lapSummary.duration / (lapSummary.distance / 100) : null,
    avgSwolf:
      lapSummary.swolfCount > 0 ? Math.round(lapSummary.swolfSum / lapSummary.swolfCount) : null,
    avgHr:
      lapSummary.avgHrCount > 0 ? Math.round(lapSummary.avgHrSum / lapSummary.avgHrCount) : null,
  }

  const renderLapItem = (lap: typeof lapSplits[number]) => {
    const pace = lap.distance > 0 ? lap.duration / (lap.distance / 100) : null
    const bestPace = lap.maxSpeed && lap.maxSpeed > 0 ? 100 / lap.maxSpeed : null
    const label = lap.distance === 0 ? "Recupero" : `Lap ${lap.index + 1}`
    const strokeLabel = lap.dominantStroke ? strokeLabels[lap.dominantStroke] ?? lap.dominantStroke : null
    return (
      <AccordionItem
        key={`lap-${lap.index}`}
        value={`lap-${lap.index}`}
        className="rounded-lg border border-border bg-background/60 px-3"
      >
        <AccordionTrigger className="py-3 text-sm">
          <div className="flex w-full items-center justify-between gap-4">
            <div className="flex flex-col items-start">
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className="text-sm font-semibold text-foreground">
                {formatDistance(lap.distance)} · {formatSplitDuration(lap.duration)}
              </span>
            </div>
            <div className="text-xs text-muted-foreground text-right">
              {strokeLabel ? <span className="capitalize">{strokeLabel}</span> : "—"}
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-0 pb-3">
          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <span>Distanza: {formatDistance(lap.distance)}</span>
            <span>Tempo: {formatSplitDuration(lap.duration)}</span>
            <span>Tempo cumulato: {formatSplitDuration(lap.cumulativeSeconds)}</span>
            <span>Pace medio: {pace ? formatPace(pace, lap.distance, lap.duration) : "—"}</span>
            <span>Pace migliore: {bestPace ? formatPace(bestPace, lap.distance, lap.duration) : "—"}</span>
            <span>SWOLF medio: {formatNumber(lap.swolf)}</span>
            <span>FC media: {lap.avgHr ? `${lap.avgHr} bpm` : "—"}</span>
            <span>FC max: {lap.maxHr ? `${lap.maxHr} bpm` : "—"}</span>
            <span>Totale bracciate: {formatNumber(lap.totalStrokes)}</span>
            <span>Media bracciate/vasca: {formatNumber(lap.avgStrokes)}</span>
            <span>Calorie: {formatNumber(lap.calories)}</span>
          </div>
        </AccordionContent>
      </AccordionItem>
    )
  }

		  const renderExerciseSet = (set: Record<string, unknown>, index: number) => {
		    const name = pickFirst(set, ["exerciseName", "name", "exercise", "activity"])
        const nameText = name ? String(name) : null
		    const reps = toNumber(pickFirst(set, ["reps", "repetitions"]))
		    const weight = toNumber(pickFirst(set, ["weight", "weightKg", "weight_kg"]))
		    const duration = toNumber(pickFirst(set, ["duration", "durationSeconds"]))
	    return (
	      <div key={`exercise-${index}`} className="rounded-lg border border-border bg-background/60 p-3 text-xs">
	        <div className="flex items-center justify-between text-muted-foreground">
	          <span>Set {index + 1}</span>
	          {nameText ? <span className="font-medium text-foreground">{nameText}</span> : null}
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
      <div className="space-y-6 lg:space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost-neon" size="icon" asChild>
            <Link href="/activities">
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">Dettaglio attività</p>
            <h1 className="text-2xl font-display font-bold neon-gradient-text">
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
          <Surface className="bg-card border-border">
            <SurfaceContent className="p-6 space-y-4">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </SurfaceContent>
          </Surface>
        ) : !activity ? (
          <Surface className="bg-card border-border">
            <SurfaceContent className="p-6 text-sm text-muted-foreground">
              Attività non trovata.
            </SurfaceContent>
          </Surface>
        ) : (
          <>
            <Surface className="bg-card border-border">
              <SurfaceHeader>
                <SurfaceTitle className="font-display">Riepilogo</SurfaceTitle>
              </SurfaceHeader>
              <SurfaceContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {summaryOrbs.map((item) => (
                  <MetricOrb
                    key={item.label}
                    label={item.label}
                    value={item.value}
                    progress={item.progress}
                    helper={item.helper}
                    icon={item.icon}
                    tone={item.tone}
                    size="sm"
                  />
                ))}
              </SurfaceContent>
            </Surface>

            <div className="grid gap-6 xl:grid-cols-12">
              <Surface className="bg-card border-border xl:col-span-7">
                <SurfaceHeader>
                  <SurfaceTitle className="font-display">Dettagli sessione</SurfaceTitle>
                </SurfaceHeader>
                <SurfaceContent className="space-y-3 text-sm">
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
                </SurfaceContent>
              </Surface>

              <Surface className="bg-card border-border xl:col-span-5">
                <SurfaceHeader>
                  <SurfaceTitle className="font-display">Tecnica & Efficienza</SurfaceTitle>
                </SurfaceHeader>
                <SurfaceContent className="space-y-3 text-sm">
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
                </SurfaceContent>
              </Surface>
            </div>

            <div className="grid gap-6 xl:grid-cols-12">
              <Surface className="bg-card border-border xl:col-span-7">
                <SurfaceHeader>
                  <SurfaceTitle className="font-display">Frequenza cardiaca</SurfaceTitle>
                </SurfaceHeader>
                <SurfaceContent className="space-y-4 text-sm">
                  <div className="grid gap-3 sm:grid-cols-3">
                    {hrOrbs.map((item) => (
                      <MetricOrb
                        key={item.label}
                        label={item.label}
                        value={item.value}
                        progress={item.progress}
                        helper={item.helper}
                        icon={<HeartPulse className="size-4" />}
                        tone="coral"
                        size="sm"
                      />
                    ))}
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
                </SurfaceContent>
              </Surface>

              <Surface className="bg-card border-border xl:col-span-5">
                <SurfaceHeader>
                  <SurfaceTitle className="font-display">Lap & Splits</SurfaceTitle>
                </SurfaceHeader>
                <SurfaceContent className="space-y-4 text-sm">
                  {!garminDetails ? (
                    <p className="text-xs text-muted-foreground">
                      Dettagli Garmin non disponibili. Assicurati di essere connesso a Garmin e
                      ricarica la pagina.
                    </p>
                  ) : (
                    <Accordion type="multiple" className="space-y-3">
                      {lapSplits.length > 0 && (
                        <AccordionItem
                          value="garmin-laps"
                          className="rounded-lg border border-border bg-background/60 px-3"
                        >
                          <AccordionTrigger className="py-3">
                            <div className="flex w-full items-center justify-between gap-4">
                              <span>Lap Garmin</span>
                              <Badge variant="secondary" className="text-xs">
                                {filteredLapSplits.length}/{lapSplits.length} lap
                              </Badge>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="px-0 pb-3">
                            <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                              <span>Totale: {formatDistance(lapSummaryStats.distance)}</span>
                              <span>Tempo: {formatSplitDuration(lapSummaryStats.duration)}</span>
                              <span>
                                Pace medio:{" "}
                                {lapSummaryStats.pace
                                  ? formatPace(
                                      lapSummaryStats.pace,
                                      lapSummaryStats.distance,
                                      lapSummaryStats.duration
                                    )
                                  : "—"}
                              </span>
                              <span>SWOLF medio: {formatNumber(lapSummaryStats.avgSwolf)}</span>
                              <span>FC media: {lapSummaryStats.avgHr ? `${lapSummaryStats.avgHr} bpm` : "—"}</span>
                            </div>

                            <div className="mt-3 flex flex-col gap-2 text-xs text-muted-foreground">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-foreground">Tipo:</span>
                                <Button
                                  size="sm"
                                  variant={lapTypeFilter === "all" ? "neon" : "outline-neon"}
                                  onClick={() => setLapTypeFilter("all")}
                                >
                                  Tutti
                                </Button>
                                <Button
                                  size="sm"
                                  variant={lapTypeFilter === "work" ? "neon" : "outline-neon"}
                                  onClick={() => setLapTypeFilter("work")}
                                >
                                  Lavoro
                                </Button>
                                <Button
                                  size="sm"
                                  variant={lapTypeFilter === "recovery" ? "neon" : "outline-neon"}
                                  onClick={() => setLapTypeFilter("recovery")}
                                >
                                  Recupero
                                </Button>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-foreground">Stile:</span>
                                <Button
                                  size="sm"
                                  variant={lapStrokeFilter === "all" ? "neon" : "outline-neon"}
                                  onClick={() => setLapStrokeFilter("all")}
                                >
                                  Tutti
                                </Button>
                                {lapStrokeOptions.map((option) => (
                                  <Button
                                    key={option.key}
                                    size="sm"
                                    variant={lapStrokeFilter === option.key ? "neon" : "outline-neon"}
                                    onClick={() => setLapStrokeFilter(option.key)}
                                  >
                                    {option.label} ({option.count})
                                  </Button>
                                ))}
                              </div>
                            </div>

                            {filteredLapSplits.length === 0 ? (
                              <p className="mt-3 text-xs text-muted-foreground">
                                Nessun lap disponibile con i filtri selezionati.
                              </p>
                            ) : (
                              <Accordion type="multiple" className="mt-3 space-y-2">
                                {filteredLapSplits.map(renderLapItem)}
                              </Accordion>
                            )}
                          </AccordionContent>
                        </AccordionItem>
                      )}

                      {garminTypedSplits.length > 0 && (
                        <AccordionItem
                          value="garmin-typed-splits"
                          className="rounded-lg border border-border bg-background/60 px-3"
                        >
                          <AccordionTrigger className="py-3">Splits per stile</AccordionTrigger>
                          <AccordionContent className="px-0 pb-3">
                            {typedSplitsSummaryList.length > 0 && (
                              <div className="grid gap-3 sm:grid-cols-2">
                                {typedSplitsSummaryList.map((summary) => (
                                  <div
                                    key={summary.strokeKey}
                                    className="rounded-lg border border-border bg-background/80 p-3"
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
                                      <span>
                                        Pace:{" "}
                                        {summary.pace
                                          ? formatPace(summary.pace, summary.distance, summary.duration)
                                          : "—"}
                                      </span>
                                      <span>Lap: {summary.laps}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                            <details className="mt-3 rounded-lg border border-border bg-background/80 p-3">
                              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                                Dettaglio laps per stile
                              </summary>
                              <div className="mt-3 grid gap-3 md:grid-cols-2">
                                {garminTypedSplits.map(renderSplitCard)}
                              </div>
                            </details>
                          </AccordionContent>
                        </AccordionItem>
                      )}

                      {garminSplitSummaries.length > 0 && (
                        <AccordionItem
                          value="garmin-split-summaries"
                          className="rounded-lg border border-border bg-background/60 px-3"
                        >
                          <AccordionTrigger className="py-3">Riepilogo splits</AccordionTrigger>
                          <AccordionContent className="px-0 pb-3">
                            <div className="grid gap-3 md:grid-cols-2">
                              {garminSplitSummaries.map(renderSplitCard)}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      )}

                      {garminPowerZones.length > 0 && (
                        <AccordionItem
                          value="garmin-power-zones"
                          className="rounded-lg border border-border bg-background/60 px-3"
                        >
                          <AccordionTrigger className="py-3">Zone potenza</AccordionTrigger>
                          <AccordionContent className="px-0 pb-3">
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
                          </AccordionContent>
                        </AccordionItem>
                      )}

                      {garminExerciseSets.length > 0 && (
                        <AccordionItem
                          value="garmin-exercise-sets"
                          className="rounded-lg border border-border bg-background/60 px-3"
                        >
                          <AccordionTrigger className="py-3">Exercise sets</AccordionTrigger>
                          <AccordionContent className="px-0 pb-3">
                            <div className="grid gap-3 md:grid-cols-2">
                              {garminExerciseSets.map(renderExerciseSet)}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      )}

                    </Accordion>
                  )}
                </SurfaceContent>
              </Surface>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  )
}
