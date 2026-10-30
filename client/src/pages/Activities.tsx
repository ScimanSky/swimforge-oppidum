"use client"

import AppLayout from "@/components/AppLayout"
import { useEffect, useId, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import { ListFilter, Sparkles } from "lucide-react"
import { Link } from "wouter"
import { trpc } from "@/lib/trpc"
import { Skeleton } from "@/components/ui/skeleton"
import { getSyncPromptDecision, SYNC_PROMPT_SEEN_KEY } from "@/lib/sync-share-prompt"
import { ActivityCard } from "@/components/corsia/ActivityCard"
import { Chip } from "@/components/corsia/Chip"
import { Metric } from "@/components/corsia/Metric"
import { WeekCard } from "@/components/corsia/WeekCard"
import { ActivityShareActions } from "@/components/corsia/ActivityShareActions"
import { ZoneBar } from "@/components/corsia/ZoneBar"
import { useCurrentDay } from "@/hooks/useCurrentDay"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { summarizeWeek } from "@/lib/week-summary"
import { activityPlaceLabel, activitySourceLabel } from "@/lib/activity-labels"
import { activityMetrics, activityZoneSeconds } from "@/lib/activity-metrics"
import {
  NO_VALUE,
  formatDistance,
  formatDurationParts,
  formatInteger,
  formatSessionDate,
} from "@/lib/format"

/** From here the list keeps a selection and shows the detail panel beside it. */
const WIDE_QUERY = "(min-width: 1280px)"

export default function Activities() {
  const [filter, setFilter] = useState("all")
  const [sort, setSort] = useState("recent")
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null)
  const [sharePickerOpen, setSharePickerOpen] = useState(false)
  const [shareActivityId, setShareActivityId] = useState<number | null>(null)
  const [syncPromptOpen, setSyncPromptOpen] = useState(false)
  const [syncPromptActivity, setSyncPromptActivity] = useState<any | null>(null)
  // Without `matchMedia` (jsdom, very old WebViews) the layout is the desktop one.
  const isWide = useMediaQuery(WIDE_QUERY)
  const [page, setPage] = useState(1)
  const panelTitleId = useId()

  const activitiesQuery = trpc.activities.list.useQuery({ limit: 100, offset: 0, source: "all" })
  const utils = trpc.useContext()

  const activities = useMemo(() => activitiesQuery.data ?? [], [activitiesQuery.data])
  // Kept mounted across days (app resumed the next morning): `now` changes with the day.
  const { now } = useCurrentDay()
  const week = useMemo(() => summarizeWeek(activities, now), [activities, now])

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

  const pageSize = isWide ? 4 : 5
  const totalPages = Math.max(1, Math.ceil(filteredActivities.length / pageSize))
  const pagedActivities = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredActivities.slice(start, start + pageSize)
  }, [filteredActivities, page, pageSize])

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

  // Only the wide layout has the panel: below it a card opens `/track/:id`.
  const panelActivity = isWide ? selectedActivity : null
  const panelDate = panelActivity ? formatSessionDate(panelActivity.activityDate) : NO_VALUE
  const panelMetrics = panelActivity ? activityMetrics(panelActivity) : []
  const panelZones = panelActivity ? activityZoneSeconds(panelActivity) : null
  const syncPromptDistance = formatDistance(syncPromptActivity?.distanceMeters)
  const syncPromptDuration = formatDurationParts(syncPromptActivity?.durationSeconds)
  const syncPromptSource = activitySourceLabel(syncPromptActivity?.activitySource)

  let list
  if (activitiesQuery.isLoading) {
    list = (
      <div className="space-y-3" role="status">
        <span className="sr-only">Caricamento…</span>
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-[148px] rounded-2xl" />
        ))}
      </div>
    )
  } else if (filteredActivities.length === 0) {
    list = (
      <div className="surface-panel p-6 text-center text-sm text-muted-foreground">
        Nessuna attività trovata. Sincronizza i dispositivi per vedere le sessioni.
      </div>
    )
  } else {
    list = (
      <ul className="space-y-3">
        {pagedActivities.map((activity) => (
          <li key={activity.id}>
            {isWide ? (
              <ActivityCard
                activity={activity}
                onSelect={() => setSelectedActivityId(activity.id)}
                selected={selectedActivity?.id === activity.id}
              />
            ) : (
              <ActivityCard activity={activity} />
            )}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <AppLayout>
      <div className="space-y-4">
        {!activitiesQuery.isLoading ? <WeekCard summary={week} /> : null}

        <div className="flex items-center gap-2">
          <Tabs value={filter} onValueChange={setFilter} className="min-w-0 flex-1">
            <TabsList aria-label="Tipo di nuotata">
              <TabsTrigger value="all">Tutte</TabsTrigger>
              <TabsTrigger value="pool">Vasca</TabsTrigger>
              <TabsTrigger value="open-water">Acque libere</TabsTrigger>
            </TabsList>
          </Tabs>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger aria-label="Ordina" className="shrink-0">
              <ListFilter className="size-4" aria-hidden />
              <span className="sr-only sm:not-sr-only">
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Più recenti</SelectItem>
              <SelectItem value="distance">Distanza</SelectItem>
              <SelectItem value="duration">Durata</SelectItem>
              <SelectItem value="xp">XP</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid items-start gap-4 xl:grid-cols-2">
          <section aria-label="Nuotate" className="min-w-0">
            {list}

            {!activitiesQuery.isLoading && filteredActivities.length > pageSize && (
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground tabular-nums">
                  Pagina {page} di {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    disabled={page === 1}
                  >
                    Indietro
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={page === totalPages}
                  >
                    Avanti
                  </Button>
                </div>
              </div>
            )}
          </section>

          {panelActivity ? (
            <section aria-labelledby={panelTitleId} className="surface-panel min-w-0 space-y-5 p-5">
              <div>
                {panelDate !== NO_VALUE ? (
                  <p className="text-sm text-muted-foreground">{panelDate}</p>
                ) : null}
                <h2
                  id={panelTitleId}
                  className="mt-1 font-display text-3xl font-bold leading-tight text-foreground"
                >
                  {panelActivity.activityName || "Nuotata"}
                </h2>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Chip>{activityPlaceLabel(panelActivity)}</Chip>
                  {panelActivity.xpEarned ? (
                    <Chip tone="xp">+{formatInteger(panelActivity.xpEarned)} XP</Chip>
                  ) : null}
                </div>
              </div>

              {panelMetrics.length > 0 ? (
                <div className="grid grid-cols-3 gap-x-4 gap-y-5 border-t border-border pt-5">
                  {panelMetrics.map(({ id, ...metric }) => (
                    <Metric key={id} {...metric} />
                  ))}
                </div>
              ) : null}

              {panelZones ? (
                <div className="border-t border-border pt-5">
                  <h3 className="text-base font-bold">Zone cardio</h3>
                  <ZoneBar seconds={panelZones} className="mt-3" />
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2 border-t border-border pt-5">
                <ActivityShareActions
                  activityId={panelActivity.id}
                  shared={Boolean(panelActivity.shareToFeed)}
                  onShare={() => openShareForActivity(panelActivity.id)}
                />
                <Button variant="outline" asChild>
                  <Link href={`/track/${panelActivity.id}`}>Dettaglio vasche</Link>
                </Button>
              </div>
            </section>
          ) : null}
        </div>
      </div>

      <Dialog open={syncPromptOpen} onOpenChange={(open) => !open && handleCloseSyncPrompt()}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-action-text" aria-hidden />
              Nuova attività sincronizzata
            </DialogTitle>
            <DialogDescription>
              Vuoi condividerla subito nel feed? Puoi aggiungere commento, foto o video.
            </DialogDescription>
          </DialogHeader>
          {syncPromptActivity ? (
            <div className="rounded-2xl bg-raised p-4">
              <div className="text-sm font-semibold text-foreground">
                {syncPromptActivity.activityName || "Nuova sessione"}
              </div>
              <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground tabular-nums">
                {syncPromptDistance !== NO_VALUE ? <span>{syncPromptDistance}</span> : null}
                {syncPromptDuration ? (
                  <span>
                    {syncPromptDuration.value} {syncPromptDuration.unit}
                  </span>
                ) : null}
                {syncPromptSource ? <span>{syncPromptSource}</span> : null}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseSyncPrompt}>
              Più tardi
            </Button>
            <Button
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
