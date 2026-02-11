"use client"

import AppLayout from "@/components/AppLayout"
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { MetricOrb } from "@/components/metrics/MetricOrb"
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
  Droplets,
  Timer,
  Zap,
  TrendingUp,
  ChevronRight,
  Waves,
  MapPin,
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

  const activitiesQuery = trpc.activities.list.useQuery({ limit: 100, offset: 0, source: "all" })
  const advancedQuery = trpc.statistics.getAdvanced.useQuery({ days: 30 })
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

  const monthStart = new Date()
  monthStart.setDate(monthStart.getDate() - 30)
  monthStart.setHours(0, 0, 0, 0)
  const monthActivities = activities.filter((activity) => new Date(activity.activityDate) >= monthStart)
  const totalDistance = monthActivities.reduce((sum, a) => sum + (a.distanceMeters || 0), 0)
  const totalTime = monthActivities.reduce((sum, a) => sum + (a.durationSeconds || 0), 0)
  const totalXp = monthActivities.reduce((sum, a) => sum + (a.xpEarned || 0), 0)
  const avgEfficiency = advancedQuery.data?.swimmingEfficiencyIndex
  const summaryOrbs = useMemo(
    () => [
      {
        label: "Distanza totale",
        value: activitiesQuery.isLoading ? "..." : formatDistance(totalDistance),
        progress: Math.min(100, Math.round((totalDistance / 20000) * 100)),
        helper: "Ultimi 30 giorni",
        icon: <Droplets className="h-4 w-4" />,
        tone: "cyan" as const,
      },
      {
        label: "Tempo totale",
        value: activitiesQuery.isLoading ? "..." : formatDuration(totalTime),
        progress: Math.min(100, Math.round((totalTime / 28800) * 100)),
        helper: "Ultimi 30 giorni",
        icon: <Timer className="h-4 w-4" />,
        tone: "sky" as const,
      },
      {
        label: "XP guadagnati",
        value: activitiesQuery.isLoading ? "..." : `${totalXp} XP`,
        progress: Math.min(100, Math.round((totalXp / 1800) * 100)),
        helper: "Ultimi 30 giorni",
        icon: <Zap className="h-4 w-4" />,
        tone: "lime" as const,
      },
      {
        label: "Efficienza media",
        value:
          advancedQuery.isLoading || avgEfficiency === null || avgEfficiency === undefined
            ? "—"
            : `${Math.round(avgEfficiency)}%`,
        progress:
          avgEfficiency !== null && avgEfficiency !== undefined ? Math.round(avgEfficiency) : 0,
        helper: "SEI Index",
        icon: <TrendingUp className="h-4 w-4" />,
        tone: "amber" as const,
      },
    ],
    [activitiesQuery.isLoading, advancedQuery.isLoading, totalDistance, totalTime, totalXp, avgEfficiency]
  )

  const getShareState = (activity: any) =>
    shareOverrides[activity.id] ?? activity.shareToFeed ?? false

  const handleShareToggle = (activityId: number, share: boolean) => {
    toggleShareMutation.mutate({ activityId, share })
  }

  return (
    <AppLayout>
    <div className="space-y-8 p-4 lg:p-6">
      <div className="grid gap-6 xl:grid-cols-12">
        <section className="surface-panel xl:col-span-8 p-6 space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-3xl font-display font-bold neon-gradient-text">
                  Attività
                </h1>
                <p className="text-muted-foreground">
                  Tutte le sessioni di nuoto, in un unico posto.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
            </div>
        </section>

        <aside className="surface-panel xl:col-span-4 p-6 space-y-4">
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

      {/* Activities List */}
      <div className="space-y-3">
        {activitiesQuery.isLoading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="surface-panel p-4">
                <Skeleton className="h-4 w-40 mb-3" />
                <Skeleton className="h-3 w-28 mb-4" />
                <div className="grid grid-cols-4 gap-4">
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-6 w-16" />
                </div>
            </div>
          ))
        ) : filteredActivities.length === 0 ? (
          <div className="surface-panel p-8 text-center text-muted-foreground">
              Nessuna attività trovata. Sincronizza i dispositivi per vedere le sessioni.
          </div>
        ) : (
          filteredActivities.map((activity) => {
            const isOpenWater = Boolean(activity.isOpenWater)
            const shareChecked = getShareState(activity)
            const shareDisabled = pendingShareId === activity.id
            return (
              <div
                key={activity.id}
                className="surface-panel transition-all hover:border-primary/40"
              >
                <div className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Activity Icon */}
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

                    {/* Activity Details */}
                    <div className="flex-1 min-w-0">
                      <div className="mb-1 flex items-center gap-2">
                        <h3 className="font-semibold text-foreground truncate">
                          {activity.activityName || "Swim Session"}
                        </h3>
                        <Badge
                          variant="neon"
                          className={`flex-shrink-0 text-xs ${
                            isOpenWater ? "text-accent" : "text-primary"
                          }`}
                        >
                          {isOpenWater ? "Open Water" : "Vasca"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(activity.activityDate)} · {formatTime(activity.activityDate)}
                      </p>

                      {/* Stats Grid */}
                      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
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
                          <p className="text-lg font-display font-bold text-accent">
                            +{activity.xpEarned}
                          </p>
                          <p className="text-xs text-muted-foreground">XP</p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
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

                    {/* Arrow */}
                    <Button variant="ghost-neon" size="icon" asChild>
                      <Link href={`/activities/${activity.id}`}>
                        <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
    </AppLayout>
  )
}
