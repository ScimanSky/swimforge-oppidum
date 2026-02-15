"use client"

import AppLayout from "@/components/AppLayout"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
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
} from "lucide-react"
import { Link } from "wouter"
import { trpc } from "@/lib/trpc"
import { Skeleton } from "@/components/ui/skeleton"

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
  const [shareOverrides, setShareOverrides] = useState<Record<number, boolean>>({})
  const [pendingShareId, setPendingShareId] = useState<number | null>(null)
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
    onMutate: ({ activityId, share }) => {
      setPendingShareId(activityId)
      setShareOverrides((prev) => ({ ...prev, [activityId]: share }))
    },
    onError: (_error, variables) => {
      setShareOverrides((prev) => ({
        ...prev,
        [variables.activityId]: !variables.share,
      }))
    },
    onSettled: async () => {
      setPendingShareId(null)
      await utils.activities.list.invalidate()
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


  const getShareState = (activity: any) =>
    shareOverrides[activity.id] ?? activity.shareToFeed ?? false

  const handleShareToggle = (activityId: number, share: boolean) => {
    toggleShareMutation.mutate({ activityId, share })
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
                      const shareChecked = getShareState(activity)
                      const shareDisabled = pendingShareId === activity.id
                      return (
                        <div
                          key={activity.id}
                          className="stream-card border-l-2 border-l-primary/45 hover:border-l-primary"
                        >
                          <div className="flex items-start gap-4">
                            <div
                              className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${
                                isOpenWater ? "bg-accent/10" : "bg-primary/10"
                              }`}
                            >
                              {isOpenWater ? (
                                <MapPin className="h-6 w-6 text-accent" />
                              ) : (
                                <Waves className="h-6 w-6 text-primary" />
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
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
                                <div className="flex items-center gap-2">
                                  <Switch
                                    checked={shareChecked}
                                    disabled={shareDisabled}
                                    onCheckedChange={(checked) => handleShareToggle(activity.id, checked)}
                                  />
                                  <span>Condividi nel feed</span>
                                </div>
                                {shareDisabled && <span>Salvataggio...</span>}
                              </div>
                            </div>

                            <Button variant="ghost-neon" size="icon" asChild>
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
    </AppLayout>
  )
}
