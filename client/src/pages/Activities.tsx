"use client"

import AppLayout from "@/components/AppLayout"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { ShareActivityPicker } from "@/components/social/ShareActivityPicker"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Waves,
  MapPin,
  Orbit,
  Sparkles,
  Clock3,
  Gauge,
  Heart,
  Flame,
  Droplets,
} from "lucide-react"
import { Link } from "wouter"
import { trpc } from "@/lib/trpc"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { getSyncPromptDecision, SYNC_PROMPT_SEEN_KEY } from "@/lib/sync-share-prompt"
import { MetricOrb } from "@/components/metrics/MetricOrb"
import { cn } from "@/lib/utils"

const formatDistance = (meters: number) => {
  if (!meters) return "—"
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`
}

const formatDuration = (seconds: number) => {
  if (!seconds) return "—"
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  return `${minutes} min`
}

const formatPace = (secondsPer100m: number | null, distanceMeters: number, durationSeconds: number) => {
  const pace = secondsPer100m && secondsPer100m > 0
    ? secondsPer100m
    : distanceMeters > 0
    ? durationSeconds / (distanceMeters / 100)
    : null
  if (!pace || !Number.isFinite(pace)) return "—"
  const minutes = Math.floor(pace / 60)
  const seconds = Math.round(pace % 60)
  return `${minutes}:${seconds.toString().padStart(2, "0")}/100m`
}

const formatDate = (date: string | Date) => {
  const parsed = new Date(date)
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

const formatTime = (date: string | Date) => {
  const parsed = new Date(date)
  return parsed.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
}

const RING_COLORS = {
  cyan: "var(--electric-cyan)",
  lime: "var(--electric-lime)",
  amber: "var(--chart-4)",
  coral: "var(--electric-coral)",
  violet: "var(--chart-5)",
}

const toPercent = (value: number | null | undefined, max: number, invert = false) => {
  if (!value || !Number.isFinite(value) || max <= 0) return 0
  const ratio = Math.max(0, Math.min(1, value / max))
  return Math.round((invert ? 1 - ratio : ratio) * 100)
}

const getSwolfValue = (activity: any) => {
  const value = Number(activity?.avgSwolf ?? activity?.avg_swolf ?? 0)
  return Number.isFinite(value) && value > 0 ? value : null
}

const getAvgHeartRate = (activity: any) => {
  const value = Number(activity?.avgHeartRate ?? activity?.avg_heart_rate ?? 0)
  return Number.isFinite(value) && value > 0 ? value : null
}

const getMaxHeartRate = (activity: any) => {
  const value = Number(activity?.maxHeartRate ?? activity?.max_heart_rate ?? 0)
  return Number.isFinite(value) && value > 0 ? value : null
}

const getCalories = (activity: any) => {
  const value = Number(activity?.calories ?? activity?.caloriesBurned ?? activity?.calories_burned ?? 0)
  return Number.isFinite(value) && value > 0 ? value : null
}

function MiniMetricRing({
  label,
  value,
  progress,
  tone,
}: {
  label: string
  value: string
  progress: number
  tone: keyof typeof RING_COLORS
}) {
  const safeProgress = Math.max(0, Math.min(100, progress))
  const color = RING_COLORS[tone]
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="relative size-12 rounded-full p-[3px]"
        style={{
          background: `conic-gradient(${color} ${safeProgress * 3.6}deg, color-mix(in oklch, var(--border) 100%, transparent) 0deg)`,
          boxShadow: `0 0 14px color-mix(in oklch, ${color} 24%, transparent)`,
        }}
      >
        <div className="flex h-full w-full items-center justify-center rounded-full bg-background/95 text-[11px] font-semibold text-foreground">
          {value}
        </div>
      </div>
      <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
    </div>
  )
}

export default function Activities() {
  const [filter, setFilter] = useState("all")
  const [sort, setSort] = useState("recent")
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null)
  const [sharePickerOpen, setSharePickerOpen] = useState(false)
  const [shareActivityId, setShareActivityId] = useState<number | null>(null)
  const [syncPromptOpen, setSyncPromptOpen] = useState(false)
  const [syncPromptActivity, setSyncPromptActivity] = useState<any | null>(null)
  const [isDesktopWide, setIsDesktopWide] = useState(false)
  const [page, setPage] = useState(1)

  const activitiesQuery = trpc.activities.list.useQuery({ limit: 100, offset: 0, source: "all" })
  const seasonQuery = trpc.season.getCurrent.useQuery(undefined, {
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  })
  const utils = trpc.useContext()
  const toggleShareMutation = trpc.community.toggleShare.useMutation({
    onSuccess: async (_, vars) => {
      await Promise.all([
        utils.activities.list.invalidate(),
        utils.community.feed.invalidate(),
        utils.community.unsharedActivities.invalidate(),
      ])
      toast.success(
        vars.share ? "Attività condivisa nel feed." : "Condivisione attività disattivata."
      )
    },
    onError: (error) => {
      toast.error(error.message || "Impossibile aggiornare la condivisione.")
    },
  })

  const activities = activitiesQuery.data ?? []

  const filteredActivities = useMemo(() => {
    return activities
      .filter((activity) => {
      const activityType = activity.isOpenWater ? "open-water" : "pool"
      if (filter !== "all" && activityType !== filter) return false
      return true
      })
      .sort((a, b) => {
      if (sort === "distance") return (b.distanceMeters || 0) - (a.distanceMeters || 0)
      if (sort === "duration") return (b.durationSeconds || 0) - (a.durationSeconds || 0)
      if (sort === "xp") return (b.xpEarned || 0) - (a.xpEarned || 0)
      return new Date(b.activityDate).getTime() - new Date(a.activityDate).getTime()
      })
  }, [activities, filter, sort])
  useEffect(() => {
    if (typeof window === "undefined") return
    const media = window.matchMedia("(min-width: 1280px)")
    const sync = () => setIsDesktopWide(media.matches)
    sync()
    media.addEventListener("change", sync)
    return () => media.removeEventListener("change", sync)
  }, [])

  const pageSize = isDesktopWide ? 4 : 5
  const totalPages = Math.max(1, Math.ceil(filteredActivities.length / pageSize))
  const pagedActivities = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredActivities.slice(start, start + pageSize)
  }, [filteredActivities, page])

  useEffect(() => {
    setPage(1)
  }, [filter, sort])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  useEffect(() => {
    if (pagedActivities.length === 0) {
      setSelectedActivityId(null)
      return
    }
    const stillVisible = pagedActivities.some((activity) => activity.id === selectedActivityId)
    if (!stillVisible) {
      setSelectedActivityId(pagedActivities[0].id)
    }
  }, [pagedActivities, selectedActivityId])

  const selectedActivity = useMemo(
    () => pagedActivities.find((activity) => activity.id === selectedActivityId) ?? pagedActivities[0] ?? null,
    [pagedActivities, selectedActivityId],
  )


  const openShareForActivity = (activityId: number) => {
    setShareActivityId(activityId)
    setSharePickerOpen(true)
  }

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!activities.length) return

    const lastSeenRaw = window.localStorage.getItem(SYNC_PROMPT_SEEN_KEY)
    const decision = getSyncPromptDecision({
      activities: activities as any,
      lastSeenRaw,
    })

    if (decision.action === "initialize" || decision.action === "mark_seen") {
      window.localStorage.setItem(SYNC_PROMPT_SEEN_KEY, String(decision.seenId))
      return
    }

    if (decision.action === "prompt") {
      setSyncPromptActivity(decision.activity)
      setSyncPromptOpen(true)
    }
  }, [activities])

  const markSyncPromptSeen = (activityId: number | null | undefined) => {
    if (typeof window === "undefined" || !activityId) return
    window.localStorage.setItem(SYNC_PROMPT_SEEN_KEY, String(activityId))
  }

  const handleCloseSyncPrompt = () => {
    markSyncPromptSeen(syncPromptActivity?.id)
    setSyncPromptOpen(false)
    setSyncPromptActivity(null)
  }

  const selectedPace = selectedActivity
    ? formatPace(
        selectedActivity.avgPacePer100m,
        selectedActivity.distanceMeters,
        selectedActivity.durationSeconds,
      )
    : "—"
  const selectedSwolf = selectedActivity ? getSwolfValue(selectedActivity) : null
  const selectedAvgHr = selectedActivity ? getAvgHeartRate(selectedActivity) : null
  const selectedMaxHr = selectedActivity ? getMaxHeartRate(selectedActivity) : null
  const selectedCalories = selectedActivity ? getCalories(selectedActivity) : null
  const selectedZones = selectedActivity
    ? [
        { label: "Zone 1", value: Number(selectedActivity.hrZone1Seconds ?? 0), tone: "cyan" as const },
        { label: "Zone 2", value: Number(selectedActivity.hrZone2Seconds ?? 0), tone: "lime" as const },
        { label: "Zone 3", value: Number(selectedActivity.hrZone3Seconds ?? 0), tone: "amber" as const },
        { label: "Zone 4", value: Number(selectedActivity.hrZone4Seconds ?? 0), tone: "coral" as const },
        { label: "Zone 5", value: Number(selectedActivity.hrZone5Seconds ?? 0), tone: "violet" as const },
      ]
    : []
  const selectedZonesTotal = selectedZones.reduce((sum, zone) => sum + zone.value, 0)

  return (
    <AppLayout>
      <div className="compact-shell space-y-3 p-3 lg:p-0">
        <section className="surface-panel p-4 lg:p-4 space-y-4 lg:space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-display font-bold neon-gradient-text">Attività</h1>
              <p className="text-sm text-muted-foreground">
                Sessioni in ordine cronologico: seleziona a sinistra e analizza i dettagli a destra.
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  <Orbit className="mr-1 size-3.5 text-primary" />
                  Season Lv {seasonQuery.data?.progress?.currentLevel ?? 1}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {Number(seasonQuery.data?.progress?.seasonXp ?? 0).toLocaleString()} XP
                </Badge>
              </div>
            </div>
          </div>
        </section>

        <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,0.44fr)_minmax(0,0.56fr)]">
          <section className="surface-panel p-4 sm:p-5 lg:p-4">
            <div className="mb-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Tabs value={filter} onValueChange={setFilter}>
                  <TabsList>
                    <TabsTrigger value="all">Tutte</TabsTrigger>
                    <TabsTrigger value="pool">Vasca</TabsTrigger>
                    <TabsTrigger value="open-water">Open Water</TabsTrigger>
                  </TabsList>
                </Tabs>
                <Select value={sort} onValueChange={setSort}>
                  <SelectTrigger className="w-full bg-background/60 sm:w-[160px]">
                    <SelectValue placeholder="Ordina" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recent">Più recenti</SelectItem>
                    <SelectItem value="distance">Distanza</SelectItem>
                    <SelectItem value="duration">Durata</SelectItem>
                    <SelectItem value="xp">XP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2.5">
              {activitiesQuery.isLoading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="rounded-2xl border border-border/70 bg-card/45 p-3">
                    <Skeleton className="mb-3 h-4 w-40" />
                    <div className="grid grid-cols-3 gap-3">
                      <Skeleton className="h-12 w-12 rounded-full" />
                      <Skeleton className="h-12 w-12 rounded-full" />
                      <Skeleton className="h-12 w-12 rounded-full" />
                    </div>
                  </div>
                ))
              ) : filteredActivities.length === 0 ? (
                <div className="rounded-2xl border border-border/70 bg-card/35 p-8 text-center text-muted-foreground">
                  Nessuna attività trovata. Sincronizza i dispositivi per vedere le sessioni.
                </div>
              ) : (
                pagedActivities.map((activity) => {
                  const isOpenWater = Boolean(activity.isOpenWater)
                  const isSelected = selectedActivity?.id === activity.id
                  const swolf = getSwolfValue(activity)
                  const avgHr = getAvgHeartRate(activity)
                  const paceLabel = formatPace(
                    activity.avgPacePer100m,
                    activity.distanceMeters,
                    activity.durationSeconds,
                  )

                  return (
                    <button
                      key={activity.id}
                      type="button"
                      onClick={() => setSelectedActivityId(activity.id)}
                      className={cn(
                        "group/activity w-full rounded-2xl border bg-[linear-gradient(132deg,#14212b_0%,#152833_56%,#122230_100%)] p-3 text-left transition-all",
                        isSelected
                          ? "border-[var(--electric-cyan)]/70 shadow-[0_0_0_1px_color-mix(in_oklch,var(--electric-cyan)_55%,transparent),0_0_30px_color-mix(in_oklch,var(--electric-cyan)_20%,transparent)]"
                          : "border-border/70 hover:border-[var(--electric-cyan)]/45",
                      )}
                    >
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "inline-flex size-8 items-center justify-center rounded-lg",
                                isOpenWater ? "bg-accent/15 text-accent" : "bg-primary/15 text-primary",
                              )}
                            >
                              {isOpenWater ? <MapPin className="size-4" /> : <Waves className="size-4" />}
                            </span>
                            <p className="truncate text-sm font-semibold text-foreground">
                              {activity.activityName || "Swim Session"}
                            </p>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatDate(activity.activityDate)} · {formatTime(activity.activityDate)}
                          </p>
                        </div>
                        <Badge variant="neon" className={cn("text-[10px]", isOpenWater ? "text-accent" : "text-primary")}>
                          {isOpenWater ? "Open Water" : "Vasca"}
                        </Badge>
                      </div>

                      <div className="flex items-start justify-between gap-2">
                        <MiniMetricRing
                          label="Pace"
                          value={paceLabel === "—" ? "—" : paceLabel.replace("/100m", "")}
                          progress={toPercent(
                            activity.avgPacePer100m && activity.avgPacePer100m > 0
                              ? activity.avgPacePer100m
                              : activity.distanceMeters > 0
                                ? activity.durationSeconds / (activity.distanceMeters / 100)
                                : 0,
                            180,
                            true,
                          )}
                          tone="cyan"
                        />
                        <MiniMetricRing
                          label="SWOLF"
                          value={swolf ? `${Math.round(swolf)}` : "—"}
                          progress={toPercent(swolf, 55, true)}
                          tone="lime"
                        />
                        <MiniMetricRing
                          label="HR"
                          value={avgHr ? `${Math.round(avgHr)}` : "—"}
                          progress={toPercent(avgHr, 180)}
                          tone="amber"
                        />
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {formatDistance(activity.distanceMeters)} · {formatDuration(activity.durationSeconds)}
                        </span>
                        <span className="text-sm font-semibold text-accent">+{activity.xpEarned ?? 0} XP</span>
                      </div>
                    </button>
                  )
                })
              )}
            </div>

            {!activitiesQuery.isLoading && filteredActivities.length > pageSize && (
              <div className="mt-3 flex items-center justify-between rounded-xl border border-border/70 bg-background/50 px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  Pagina {page} di {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline-neon"
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    disabled={page === 1}
                  >
                    Indietro
                  </Button>
                  <Button
                    size="sm"
                    variant="outline-neon"
                    onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={page === totalPages}
                  >
                    Avanti
                  </Button>
                </div>
              </div>
            )}
          </section>

          <section className="surface-panel space-y-4 p-4 sm:p-5 xl:sticky xl:top-20 xl:h-fit">
            {selectedActivity ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-3xl font-display font-bold leading-tight text-foreground">
                      {selectedActivity.activityName || "Swim Session"}
                    </h2>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <span>{formatDate(selectedActivity.activityDate)} · {formatTime(selectedActivity.activityDate)}</span>
                      <span>•</span>
                      <span className="inline-flex items-center gap-1">
                        {selectedActivity.isOpenWater ? <MapPin className="size-4" /> : <Waves className="size-4" />}
                        {selectedActivity.isOpenWater ? "Open Water" : "Pool Swim"}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/50 px-3 py-1.5">
                      <Switch
                        checked={Boolean(selectedActivity.shareToFeed)}
                        disabled={toggleShareMutation.isPending}
                        onCheckedChange={(checked) =>
                          toggleShareMutation.mutate({
                            activityId: selectedActivity.id,
                            share: checked,
                          })
                        }
                      />
                      <span className="text-xs text-foreground">Condividi nel feed</span>
                    </div>
                    <Button variant="outline-neon" size="sm" asChild>
                      <Link href={`/track/${selectedActivity.id}`}>Dettaglio laps</Link>
                    </Button>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <MetricOrb
                    label="Distanza"
                    value={formatDistance(selectedActivity.distanceMeters)}
                    progress={toPercent(selectedActivity.distanceMeters, 5000)}
                    helper="Sessione"
                    icon={<Droplets className="size-3.5" />}
                    tone="cyan"
                    size="sm"
                  />
                  <MetricOrb
                    label="Durata"
                    value={formatDuration(selectedActivity.durationSeconds)}
                    progress={toPercent(selectedActivity.durationSeconds, 3600)}
                    helper="Tempo"
                    icon={<Clock3 className="size-3.5" />}
                    tone="sky"
                    size="sm"
                  />
                  <MetricOrb
                    label="Pace"
                    value={selectedPace}
                    progress={toPercent(
                      selectedActivity.avgPacePer100m && selectedActivity.avgPacePer100m > 0
                        ? selectedActivity.avgPacePer100m
                        : selectedActivity.distanceMeters > 0
                          ? selectedActivity.durationSeconds / (selectedActivity.distanceMeters / 100)
                          : 0,
                      180,
                      true,
                    )}
                    helper="min/100m"
                    icon={<Gauge className="size-3.5" />}
                    tone="lime"
                    size="sm"
                  />
                  <MetricOrb
                    label="SWOLF"
                    value={selectedSwolf ? `${Math.round(selectedSwolf)}` : "—"}
                    progress={toPercent(selectedSwolf, 55, true)}
                    helper="efficienza"
                    icon={<Waves className="size-3.5" />}
                    tone="amber"
                    size="sm"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border/70 bg-card/35 p-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Cardio Medio</p>
                    <p className="mt-1 text-3xl font-display font-bold text-foreground">{selectedAvgHr ? `${Math.round(selectedAvgHr)} bpm` : "—"}</p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-card/35 p-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Cardio Massimo</p>
                    <p className="mt-1 text-3xl font-display font-bold text-foreground">{selectedMaxHr ? `${Math.round(selectedMaxHr)} bpm` : "—"}</p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-card/35 p-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Calorie</p>
                    <p className="mt-1 inline-flex items-center gap-2 text-3xl font-display font-bold text-foreground">
                      <Flame className="size-5 text-[var(--chart-4)]" />
                      {selectedCalories ? `${Math.round(selectedCalories)} kcal` : "—"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-card/35 p-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">XP Guadagnati</p>
                    <p className="mt-1 text-3xl font-display font-bold text-accent">+{selectedActivity.xpEarned ?? 0}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-border/70 bg-card/35 p-3">
                  <div className="mb-3 flex items-center gap-2">
                    <Heart className="size-4 text-[var(--electric-coral)]" />
                    <p className="text-sm font-semibold text-foreground">Heart Rate Zones</p>
                  </div>
                  {selectedZonesTotal > 0 ? (
                    <div className="space-y-2">
                      {selectedZones.map((zone) => {
                        const zonePercent = Math.round((zone.value / selectedZonesTotal) * 100)
                        const color = RING_COLORS[zone.tone]
                        return (
                          <div key={zone.label} className="grid grid-cols-[72px_minmax(0,1fr)_52px] items-center gap-2 text-xs">
                            <span className="text-muted-foreground">{zone.label}</span>
                            <div className="h-2 overflow-hidden rounded-full bg-background/80">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${zonePercent}%`,
                                  background: `linear-gradient(90deg, ${color}, color-mix(in oklch, ${color} 70%, white 10%))`,
                                }}
                              />
                            </div>
                            <span className="text-right text-foreground">{zonePercent}%</span>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Nessuna zona cardio disponibile per questa sessione.</p>
                  )}
                </div>

                {!selectedActivity.shareToFeed ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="neon"
                    className="w-full sm:w-auto"
                    onClick={() => openShareForActivity(selectedActivity.id)}
                  >
                    Condividi con commento/media
                  </Button>
                ) : (
                  <Badge variant="outline" className="bg-background/60">
                    Condivisa nel feed
                  </Badge>
                )}
              </>
            ) : (
              <div className="rounded-2xl border border-border/70 bg-card/35 p-8 text-center text-muted-foreground">
                Seleziona una sessione dalla lista per vedere i dettagli completi.
              </div>
            )}
          </section>
        </div>
      </div>

      <Dialog open={syncPromptOpen} onOpenChange={(open) => !open && handleCloseSyncPrompt()}>
        <DialogContent className="border-border/70 bg-background/95 sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              Nuova attività sincronizzata
            </DialogTitle>
            <DialogDescription>
              Vuoi condividerla subito nel feed? Puoi aggiungere commento, foto o video.
            </DialogDescription>
          </DialogHeader>
          {syncPromptActivity ? (
            <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
              <div className="text-sm font-semibold text-foreground">
                {syncPromptActivity.activityName || "Nuova sessione"}
              </div>
              <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>{formatDistance(syncPromptActivity.distanceMeters || 0)}</span>
                <span>{formatDuration(syncPromptActivity.durationSeconds || 0)}</span>
                <span className="capitalize">{syncPromptActivity.activitySource || "sync"}</span>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline-neon" onClick={handleCloseSyncPrompt}>
              Più tardi
            </Button>
            <Button
              variant="neon"
              onClick={() => {
                if (syncPromptActivity?.id) {
                  openShareForActivity(syncPromptActivity.id)
                }
                setSyncPromptOpen(false)
              }}
            >
              Condividi ora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ShareActivityPicker
        open={sharePickerOpen}
        onOpenChange={(open) => {
          setSharePickerOpen(open)
          if (!open && shareActivityId) {
            markSyncPromptSeen(shareActivityId)
            setShareActivityId(null)
          }
        }}
        initialActivityId={shareActivityId}
        onShared={async (activityId) => {
          markSyncPromptSeen(activityId)
          await utils.activities.list.invalidate()
        }}
      />
    </AppLayout>
  )
}
