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
  Zap,
  Activity as ActivityIcon,
  HeartPulse,
  Waves,
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

  const renderGarminSection = (title: string, payload: any) => {
    if (!payload) return null
    return (
      <details className="rounded-lg border border-border bg-background/60 p-3">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
          {title}
        </summary>
        <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs text-foreground">
          {JSON.stringify(payload, null, 2)}
        </pre>
      </details>
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
                    <span className="font-medium text-foreground">{formatNumber(activity.avgSwolf)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Distanza media bracciata</span>
                    <span className="font-medium text-foreground">{formatNumber(activity.avgStrokeDistance, " cm")}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Bracciate per vasca</span>
                    <span className="font-medium text-foreground">{formatNumber(activity.avgStrokes)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Cadenza bracciata</span>
                    <span className="font-medium text-foreground">{formatNumber(activity.avgStrokeCadence, " spm")}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Training effect</span>
                    <span className="font-medium text-foreground">{formatNumber(activity.trainingEffect)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Anaerobic TE</span>
                    <span className="font-medium text-foreground">{formatNumber(activity.anaerobicTrainingEffect)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">VO2 max</span>
                    <span className="font-medium text-foreground">{formatNumber(activity.vo2MaxValue)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Recupero</span>
                    <span className="font-medium text-foreground">{formatNumber(activity.recoveryTimeHours, " h")}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Stress medio</span>
                    <span className="font-medium text-foreground">{formatNumber(activity.avgStress)}</span>
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
                        {formatNumber(activity.avgHeartRate, " bpm")}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-background/60 p-3">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <HeartPulse className="size-4 text-primary" />
                        Massima
                      </div>
                      <p className="mt-2 text-lg font-semibold text-foreground">
                        {formatNumber(activity.maxHeartRate, " bpm")}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-background/60 p-3">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <HeartPulse className="size-4 text-primary" />
                        Riposo
                      </div>
                      <p className="mt-2 text-lg font-semibold text-foreground">
                        {formatNumber(activity.restingHeartRate, " bpm")}
                      </p>
                    </div>
                  </div>

                  {totalHrSeconds > 0 ? (
                    <div className="space-y-2">
                      {hrZones.map((zone) => {
                        const percent = totalHrSeconds
                          ? Math.round((zone.seconds / totalHrSeconds) * 100)
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

              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="font-display">Dati attività</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">ID Garmin</span>
                    <span className="font-medium text-foreground">{activity.garminActivityId ?? "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">ID Strava</span>
                    <span className="font-medium text-foreground">{activity.stravaActivityId ?? "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Condivisa nel feed</span>
                    <span className="font-medium text-foreground">{activity.shareToFeed ? "Sì" : "No"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Note</span>
                    <span className="font-medium text-foreground">{activity.notes ?? "—"}</span>
                  </div>
                  {activity.rawData ? (
                    <details className="rounded-lg border border-border bg-background/60 p-3">
                      <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                        Dati grezzi Garmin (raw)
                      </summary>
                      <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-foreground">
                        {JSON.stringify(activity.rawData, null, 2)}
                      </pre>
                    </details>
                  ) : (
                    <p className="text-xs text-muted-foreground">Nessun dato grezzo disponibile.</p>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="font-display">Dettagli Garmin avanzati</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {garminDetails ? (
                  <>
                    {renderGarminSection("Dettagli attività", garminDetails.details)}
                    {renderGarminSection("Attività singola", garminDetails.activity)}
                    {renderGarminSection("Splits (laps)", garminDetails.splits)}
                    {renderGarminSection("Splits per tipo", garminDetails.typed_splits)}
                    {renderGarminSection("Riepilogo splits", garminDetails.split_summaries)}
                    {renderGarminSection("Meteo", garminDetails.weather)}
                    {renderGarminSection("Zone HR", garminDetails.hr_zones)}
                    {renderGarminSection("Zone potenza", garminDetails.power_zones)}
                    {renderGarminSection("Gear", garminDetails.gear)}
                    {renderGarminSection("Exercise sets", garminDetails.exercise_sets)}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Dettagli Garmin non disponibili. Assicurati di essere connesso a Garmin e
                    ricarica la pagina.
                  </p>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  )
}
