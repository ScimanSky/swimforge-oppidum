"use client"

import AppLayout from "@/components/AppLayout"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
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
  Search,
  Filter,
  ChevronRight,
  Waves,
  MapPin,
  Orbit,
  BarChart3,
  Sparkles,
} from "lucide-react"
import { Link } from "wouter"
import { trpc } from "@/lib/trpc"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { getSyncPromptDecision, SYNC_PROMPT_SEEN_KEY } from "@/lib/sync-share-prompt"

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

export default function Activities() {
  const [filter, setFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState("recent")
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
      if (search && !(activity.activityName || "").toLowerCase().includes(search.toLowerCase()))
        return false
      return true
      })
      .sort((a, b) => {
      if (sort === "distance") return (b.distanceMeters || 0) - (a.distanceMeters || 0)
      if (sort === "duration") return (b.durationSeconds || 0) - (a.durationSeconds || 0)
      if (sort === "xp") return (b.xpEarned || 0) - (a.xpEarned || 0)
      return new Date(b.activityDate).getTime() - new Date(a.activityDate).getTime()
      })
  }, [activities, filter, search, sort])
  useEffect(() => {
    if (typeof window === "undefined") return
    const media = window.matchMedia("(min-width: 1280px)")
    const sync = () => setIsDesktopWide(media.matches)
    sync()
    media.addEventListener("change", sync)
    return () => media.removeEventListener("change", sync)
  }, [])

  const pageSize = isDesktopWide ? 3 : 4
  const totalPages = Math.max(1, Math.ceil(filteredActivities.length / pageSize))
  const pagedActivities = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredActivities.slice(start, start + pageSize)
  }, [filteredActivities, page])

  useEffect(() => {
    setPage(1)
  }, [filter, search, sort])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])


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

  return (
    <AppLayout>
      <div className="compact-shell space-y-4 lg:space-y-2 p-3 lg:p-0">
        <div className="stream-shell lg:gap-2">
          <section className="stream-main lg:gap-2">
            <div className="stream-node">
              <section className="surface-panel p-4 lg:p-4 space-y-4 lg:space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-display font-bold neon-gradient-text">Attività</h1>
                    <p className="text-sm text-muted-foreground">
                      Timeline completa delle sessioni con metriche in tempo reale.
                    </p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        <Orbit className="mr-1 size-3.5 text-primary" />
                        Season Lv {seasonQuery.data?.progress?.currentLevel ?? 1}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {Number(seasonQuery.data?.progress?.seasonXp ?? 0).toLocaleString()} XP
                      </Badge>
                      <Button variant="outline-neon" size="sm" asChild>
                        <Link href="/season">
                          Season Hub
                          <ChevronRight className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                      <Button variant="outline-neon" size="sm" asChild>
                        <Link href="/profile/performance">
                          <BarChart3 className="mr-1 h-3.5 w-3.5" />
                          Statistiche
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <div className="stream-node">
              <section className="surface-panel p-4 sm:p-5 lg:p-4">
                <div className="space-y-2.5">
                  {activitiesQuery.isLoading ? (
                    Array.from({ length: 3 }).map((_, index) => (
                      <div key={index} className="stream-card">
                        <Skeleton className="mb-3 h-4 w-40" />
                        <Skeleton className="mb-4 h-3 w-28" />
                        <div className="grid grid-cols-4 gap-4">
                          <Skeleton className="h-6 w-16" />
                          <Skeleton className="h-6 w-16" />
                          <Skeleton className="h-6 w-16" />
                          <Skeleton className="h-6 w-16" />
                        </div>
                      </div>
                    ))
                  ) : filteredActivities.length === 0 ? (
                    <div className="stream-card p-8 text-center text-muted-foreground">
                      Nessuna attività trovata. Sincronizza i dispositivi per vedere le sessioni.
                    </div>
                  ) : (
                    pagedActivities.map((activity) => {
                      const isOpenWater = Boolean(activity.isOpenWater)
                      return (
                        <div
                          key={activity.id}
                          className="stream-card relative isolate overflow-hidden border-l-2 border-l-primary/45 hover:border-l-primary"
                        >
                          <img
                            src={isOpenWater ? "/images/open-water.jpg" : "/images/pool-lanes.jpg"}
                            alt=""
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center opacity-[0.36] saturate-[1.15]"
                            loading="lazy"
                          />
                          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(112deg,color-mix(in_oklch,var(--background)_80%,transparent)_0%,color-mix(in_oklch,var(--background)_60%,transparent)_42%,color-mix(in_oklch,var(--background)_34%,transparent)_100%)]" />
                          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,color-mix(in_oklch,var(--electric-cyan)_26%,transparent),transparent_36%),radial-gradient(circle_at_92%_12%,color-mix(in_oklch,var(--electric-lime)_18%,transparent),transparent_44%)]" />
                          <div className="flex items-start gap-4">
                            <div
                              className={`relative z-10 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${
                                isOpenWater ? "bg-accent/10" : "bg-primary/10"
                              }`}
                            >
                              {isOpenWater ? (
                                <MapPin className="h-6 w-6 text-accent" />
                              ) : (
                                <Waves className="h-6 w-6 text-primary" />
                              )}
                            </div>

                            <div className="relative z-10 flex-1 min-w-0">
                              <div className="mb-1 flex items-center gap-2">
                                <h3 className="font-semibold text-foreground truncate">
                                  {activity.activityName || "Swim Session"}
                                </h3>
                                <Badge
                                  variant="neon"
                                  className={`flex-shrink-0 text-xs ${isOpenWater ? "text-accent" : "text-primary"}`}
                                >
                                  {isOpenWater ? "Open Water" : "Vasca"}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {formatDate(activity.activityDate)} · {formatTime(activity.activityDate)}
                              </p>

                              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                                <div>
                                  <p className="text-lg font-display font-bold text-foreground">
                                    {formatDistance(activity.distanceMeters)}
                                  </p>
                                  <p className="text-xs text-muted-foreground">Distanza</p>
                                </div>
                                <div>
                                  <p className="text-lg font-display font-bold text-foreground">
                                    {formatDuration(activity.durationSeconds)}
                                  </p>
                                  <p className="text-xs text-muted-foreground">Durata</p>
                                </div>
                                <div>
                                  <p className="text-lg font-display font-bold text-foreground">
                                    {formatPace(
                                      activity.avgPacePer100m,
                                      activity.distanceMeters,
                                      activity.durationSeconds
                                    )}
                                  </p>
                                  <p className="text-xs text-muted-foreground">Pace</p>
                                </div>
                                <div>
                                  <p className="text-lg font-display font-bold text-accent">+{activity.xpEarned}</p>
                                  <p className="text-xs text-muted-foreground">XP</p>
                                </div>
                              </div>

                              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                                <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/60 px-3 py-1.5">
                                  <Switch
                                    checked={Boolean(activity.shareToFeed)}
                                    disabled={toggleShareMutation.isPending}
                                    onCheckedChange={(checked) => {
                                      toggleShareMutation.mutate({
                                        activityId: activity.id,
                                        share: checked,
                                      })
                                    }}
                                  />
                                  <span className="text-xs text-foreground">Condividi nel feed</span>
                                </div>
                                {!activity.shareToFeed && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="neon"
                                    onClick={() => openShareForActivity(activity.id)}
                                  >
                                    Condividi con commento/media
                                  </Button>
                                )}
                                {activity.shareToFeed && (
                                  <Badge variant="outline" className="bg-background/60">
                                    Condivisa nel feed
                                  </Badge>
                                )}
                              </div>
                            </div>

                            <Button variant="ghost-neon" size="icon" asChild className="relative z-10">
                              <Link href={`/track/${activity.id}`}>
                                <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                              </Link>
                            </Button>
                          </div>
                        </div>
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
            </div>
          </section>

          <aside className="surface-panel p-5 space-y-3 xl:sticky xl:top-20">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-primary">
              <Filter className="h-4 w-4" />
              Filtri
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Cerca attività..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-background/60 pl-9"
              />
            </div>
            <Tabs value={filter} onValueChange={setFilter}>
              <TabsList>
                <TabsTrigger value="all">Tutte</TabsTrigger>
                <TabsTrigger value="pool">Vasca</TabsTrigger>
                <TabsTrigger value="open-water">Open Water</TabsTrigger>
              </TabsList>
            </Tabs>
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="w-full bg-background/60">
                <SelectValue placeholder="Ordina" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Più recenti</SelectItem>
                <SelectItem value="distance">Distanza</SelectItem>
                <SelectItem value="duration">Durata</SelectItem>
                <SelectItem value="xp">XP</SelectItem>
              </SelectContent>
            </Select>
          </aside>
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
