"use client"

import AppLayout from "@/components/AppLayout"
import { trpc } from "@/lib/trpc"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Surface, SurfaceContent } from "@/components/ui/surface"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { MetricOrb } from "@/components/metrics/MetricOrb"
import { useFormatters } from "@/_core/hooks/useFormatters"
import {
  Flame,
  Orbit,
  Waves,
  Timer,
  Target,
  Trophy,
  Zap,
  ChevronRight,
} from "lucide-react"
import { Link } from "wouter"
import { SeasonRecapDialog } from "@/components/video/SeasonRecapDialog"

const parseActivityDate = (value: string | Date | null | undefined) => {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === "string") {
    const normalized = value.includes("T") ? value : value.replace(" ", "T")
    const date = new Date(normalized)
    return Number.isNaN(date.getTime()) ? null : date
  }
  return null
}

const toNumber = (value: unknown) => {
  if (value === null || value === undefined) return 0
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

const getActivityDistance = (activity: any) =>
  toNumber(
    activity?.distanceMeters ??
      activity?.distance_meters ??
      activity?.distance ??
      activity?.distanceMeters ??
      0
  )

const getActivityDuration = (activity: any) =>
  toNumber(
    activity?.durationSeconds ??
      activity?.duration_seconds ??
      activity?.movingDuration ??
      activity?.moving_duration ??
      activity?.elapsedDuration ??
      activity?.elapsed_duration ??
      activity?.duration ??
      0
  )

const getActivityPace = (activity: any) =>
  toNumber(
    activity?.avgPacePer100m ??
      activity?.avg_pace_per_100m ??
      activity?.pacePer100m ??
      activity?.pace_per_100m ??
      0
  )

const getActivityDateValue = (activity: any) =>
  activity?.activityDate ??
  activity?.activity_date ??
  activity?.createdAt ??
  activity?.created_at ??
  null

const changeLabel = (current: number, previous: number, suffix = "vs last week") => {
  if (!previous && !current) return { label: "—", type: "neutral" as const }
  if (!previous && current > 0) return { label: "New", type: "positive" as const }
  if (previous === 0) return { label: "—", type: "neutral" as const }
  const diff = ((current - previous) / previous) * 100
  const sign = diff > 0 ? "+" : ""
  const type = diff > 0 ? "positive" : diff < 0 ? "negative" : "neutral"
  return { label: `${sign}${diff.toFixed(0)}% ${suffix}`, type }
}

const formatShortDate = (value: string | Date | null | undefined) => {
  const parsed = parseActivityDate(value)
  if (!parsed) return "—"
  return parsed.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function DashboardDetailDialog({
  title,
  description,
  triggerLabel = "Dettagli",
  children,
}: {
  title: string
  description?: string
  triggerLabel?: string
  children: ReactNode
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline-neon" size="sm" className="h-8 px-3 text-xs">
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl border-border/80 bg-background/95 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-lg text-foreground">{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <ScrollArea className="max-h-[62dvh] pr-4">
          <div className="space-y-2">{children}</div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

export default function Dashboard() {
  const { formatDuration, formatDistanceKm, formatPace } = useFormatters()
  const meQuery = trpc.auth.me.useQuery()
  const profileQuery = trpc.profile.get.useQuery()
  const activitiesQuery = trpc.activities.list.useQuery(
    { limit: 100, offset: 0, source: "all" },
    { staleTime: 0, refetchOnWindowFocus: true, refetchOnMount: "always" }
  )
  const timelineQuery = trpc.statistics.getTimeline.useQuery({ days: 14 })
  const advancedQuery = trpc.statistics.getAdvanced.useQuery({ days: 30 })
  const challengesQuery = trpc.challenges.list.useQuery()
  const seasonQuery = trpc.season.getCurrent.useQuery(undefined, {
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  })
  const seasonLeaderboardQuery = trpc.season.getLeaderboard.useQuery(
    { limit: 5 },
    {
      staleTime: 15_000,
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
      refetchOnMount: "always",
    }
  )

  const normalizedActivities = useMemo(() => {
    const list = activitiesQuery.data ?? []
    return list.map((activity) => {
      const date = parseActivityDate(getActivityDateValue(activity))
      const dateMs = date?.getTime() ?? 0
      return {
        activity,
        date,
        dateMs,
        distance: getActivityDistance(activity),
        duration: getActivityDuration(activity),
        pace: getActivityPace(activity),
      }
    })
  }, [activitiesQuery.data])

  const activitiesSortedByDate = useMemo(() => {
    return [...normalizedActivities].sort((a, b) => b.dateMs - a.dateMs)
  }, [normalizedActivities])

  const stats = useMemo(() => {
    const activities = normalizedActivities
    const timeline = timelineQuery.data ?? []
    const profileTotals = profileQuery.data
    const now = new Date()
    const startOfToday = new Date(now)
    startOfToday.setHours(0, 0, 0, 0)
    const startOfWeek = new Date(startOfToday)
    const dayOfWeek = startOfWeek.getDay()
    const diffFromMonday = (dayOfWeek + 6) % 7
    startOfWeek.setDate(startOfWeek.getDate() - diffFromMonday)
    const startPrevWeek = new Date(startOfWeek)
    startPrevWeek.setDate(startPrevWeek.getDate() - 7)

    const toDateKey = (date: Date) => {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, "0")
      const day = String(date.getDate()).padStart(2, "0")
      return `${year}-${month}-${day}`
    }
    const timelineMap = new Map(timeline.map((point) => [point.date, point]))

    let currentDistance = 0
    let currentTime = 0
    let currentSessions = 0

    let prevDistance = 0
    let prevTime = 0
    let prevSessions = 0

    let validDates = 0

    activities.forEach(({ date, distance, duration }) => {
      if (!date) return
      validDates += 1
      if (date >= startOfWeek && date <= now) {
        currentDistance += distance
        currentTime += duration
        currentSessions += 1
      } else if (date >= startPrevWeek && date < startOfWeek) {
        prevDistance += distance
        prevTime += duration
        prevSessions += 1
      }
    })

    let timelineCurrentDistanceKm = 0
    let timelineCurrentSessions = 0
    let timelineCurrentPaceValues: number[] = []
    let timelinePrevDistanceKm = 0
    let timelinePrevSessions = 0
    let timelinePrevPaceValues: number[] = []

    for (let i = 0; i < 7; i += 1) {
      const date = new Date(startOfWeek)
      date.setDate(startOfWeek.getDate() + i)
      const key = toDateKey(date)
      const entry = timelineMap.get(key)
      if (entry) {
        timelineCurrentDistanceKm += Number(entry.distance || 0)
        timelineCurrentSessions += Number(entry.sessions || 0)
        if (entry.pace) timelineCurrentPaceValues.push(entry.pace)
      }
    }

    for (let i = 0; i < 7; i += 1) {
      const date = new Date(startPrevWeek)
      date.setDate(startPrevWeek.getDate() + i)
      const key = toDateKey(date)
      const entry = timelineMap.get(key)
      if (entry) {
        timelinePrevDistanceKm += Number(entry.distance || 0)
        timelinePrevSessions += Number(entry.sessions || 0)
        if (entry.pace) timelinePrevPaceValues.push(entry.pace)
      }
    }

    const fallbackCurrentPace =
      timelineCurrentPaceValues.length > 0
        ? timelineCurrentPaceValues.reduce((sum, value) => sum + value, 0) /
          timelineCurrentPaceValues.length
        : 0
    const fallbackPrevPace =
      timelinePrevPaceValues.length > 0
        ? timelinePrevPaceValues.reduce((sum, value) => sum + value, 0) / timelinePrevPaceValues.length
        : 0

    if (currentDistance === 0 && timelineCurrentDistanceKm > 0) {
      currentDistance = timelineCurrentDistanceKm * 1000
      currentSessions = timelineCurrentSessions
    }
    if (prevDistance === 0 && timelinePrevDistanceKm > 0) {
      prevDistance = timelinePrevDistanceKm * 1000
      prevSessions = timelinePrevSessions
    }

    const currentPace =
      currentDistance > 0 && currentTime > 0
        ? currentTime / (currentDistance / 100)
        : fallbackCurrentPace
    const prevPace =
      prevDistance > 0 && prevTime > 0
        ? prevTime / (prevDistance / 100)
        : fallbackPrevPace

    if (currentTime === 0 && currentDistance > 0 && currentPace > 0) {
      currentTime = Math.round((currentDistance / 100) * currentPace)
    }
    if (prevTime === 0 && prevDistance > 0 && prevPace > 0) {
      prevTime = Math.round((prevDistance / 100) * prevPace)
    }
    if (validDates === 0 && activities.length > 0) {
      currentDistance = activities.reduce((sum, entry) => sum + entry.distance, 0)
      currentTime = activities.reduce((sum, entry) => sum + entry.duration, 0)
      currentSessions = activities.length
    }

    if (
      currentDistance === 0 &&
      currentTime === 0 &&
      currentSessions === 0 &&
      profileTotals
    ) {
      currentDistance = Number(profileTotals.totalDistanceMeters ?? 0)
      currentTime = Number(profileTotals.totalTimeSeconds ?? 0)
      currentSessions = Number(profileTotals.totalSessions ?? 0)
    }

    if (currentDistance === 0 && activities.length > 0) {
      const slice = activitiesSortedByDate.slice(0, 7)
      currentDistance = slice.reduce((sum, entry) => sum + entry.distance, 0)
      currentTime = slice.reduce((sum, entry) => sum + entry.duration, 0)
      currentSessions = slice.length
    }

    const distanceChange = changeLabel(currentDistance, prevDistance)
    const timeChange = changeLabel(currentTime, prevTime)
    const paceChange = changeLabel(prevPace, currentPace, "pace change")
    const sessionsChange = changeLabel(currentSessions, prevSessions)

    const buildProgress = (current: number, previous: number) => {
      const target = Math.max(current, previous, 1)
      return Math.min(100, Math.round((current / target) * 100))
    }

    const paceProgress = prevPace > 0 ? Math.min(100, Math.round((prevPace / Math.max(currentPace, 1)) * 100)) : 100

    return [
      {
        icon: Waves,
        label: "Distanza settimanale",
        value: formatDistanceKm(currentDistance),
        change: distanceChange.label,
        changeType: distanceChange.type,
        progress: buildProgress(currentDistance, prevDistance),
        color: "text-primary",
        bgColor: "bg-primary/10",
      },
      {
        icon: Timer,
        label: "Tempo in acqua",
        value: formatDuration(currentTime),
        change: timeChange.label,
        changeType: timeChange.type,
        progress: buildProgress(currentTime, prevTime),
        color: "text-chart-2",
        bgColor: "bg-chart-2/10",
      },
      {
        icon: Target,
        label: "Pace medio",
        value: formatPace(currentPace),
        change: paceChange.label,
        changeType: paceChange.type,
        progress: paceProgress,
        color: "text-chart-3",
        bgColor: "bg-chart-3/10",
      },
      {
        icon: Zap,
        label: "Sessioni",
        value: `${currentSessions}`,
        change: sessionsChange.label,
        changeType: sessionsChange.type,
        progress: buildProgress(currentSessions, prevSessions),
        color: "text-chart-5",
        bgColor: "bg-chart-5/10",
      },
    ]
  }, [normalizedActivities, activitiesSortedByDate, timelineQuery.data, profileQuery.data])

  const weeklyData = useMemo(() => {
    const timeline = timelineQuery.data ?? []
    const map = new Map(timeline.map((point) => [point.date, point.distance]))
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const startOfWeek = new Date(today)
    const dayOfWeek = startOfWeek.getDay()
    const diffFromMonday = (dayOfWeek + 6) % 7
    startOfWeek.setDate(startOfWeek.getDate() - diffFromMonday)

    return Array.from({ length: 7 }).map((_, index) => {
      const date = new Date(startOfWeek)
      date.setDate(startOfWeek.getDate() + index)
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
        date.getDate()
      ).padStart(2, "0")}`
      const label = date.toLocaleDateString("it-IT", { weekday: "short" })
      const distanceKm = Number(map.get(key) ?? 0)
      return {
        day: label,
        distance: distanceKm * 1000,
      }
    })
  }, [timelineQuery.data])

  const seasonLeaderboardEntries = useMemo(() => {
    const raw = seasonLeaderboardQuery.data ?? []
    return raw.map((entry: any, index: number) => ({
      rank: index + 1,
      name: entry.name ?? `Nuotatore ${entry.userId ?? ""}`,
      value: `${Number(entry.seasonXp ?? 0).toLocaleString()} XP`,
      isCurrentUser: profileQuery.data?.userId
        ? String(profileQuery.data.userId) === String(entry.userId)
        : false,
    }))
  }, [seasonLeaderboardQuery.data, profileQuery.data?.userId])

  const challenges = useMemo(() => (challengesQuery.data ?? []) as any[], [challengesQuery.data])
  const activeChallenges = useMemo(() => {
    return challenges.filter((challenge) => {
      const status = String(challenge.status ?? "").toLowerCase()
      if (status && status !== "active") return false
      const raw =
        challenge.isParticipant ??
        challenge.is_participant ??
        challenge.is_participating ??
        null
      if (raw === null || raw === undefined) return true
      return raw === true || raw === "t" || raw === 1 || raw === "true"
    })
  }, [challenges])

  const aiInsight = useMemo(() => {
    const insights = advancedQuery.data?.insights ?? []
    if (!insights.length) return null
    return {
      title: "Insight principale",
      message: insights[0].replace(/\*\*/g, ""),
    }
  }, [advancedQuery.data?.insights])

  const seasonSummary = useMemo(() => {
    const season = seasonQuery.data
    if (!season) {
      return {
        name: "Season Electric Ice",
        level: 1,
        seasonXp: 0,
        levelProgress: 0,
        completionRate: 0,
        completedMissions: 0,
        totalMissions: 0,
        remainingDays: 0,
      }
    }
    return {
      name: season.season?.name ?? "Season Electric Ice",
      level: Number(season.progress?.currentLevel ?? 1),
      seasonXp: Number(season.progress?.seasonXp ?? 0),
      levelProgress: Number(season.progress?.levelProgressPercent ?? 0),
      completionRate: Number(season.missions?.completionRate ?? 0),
      completedMissions: Number(season.missions?.completedMissions ?? 0),
      totalMissions: Number(season.missions?.totalMissions ?? 0),
      remainingDays: Number(season.season?.remainingDays ?? 0),
    }
  }, [seasonQuery.data])
  type ProfileLike = {
    firstName?: string | null
    first_name?: string | null
    lastName?: string | null
    last_name?: string | null
    name?: string | null
    username?: string | null
    handle?: string | null
    displayName?: string | null
    display_name?: string | null
    avatarUrl?: string | null
    avatar_url?: string | null
    avatar?: string | null
    coverUrl?: string | null
    cover_url?: string | null
    coverImageUrl?: string | null
    cover_image_url?: string | null
    totalXp?: number
    nextLevelXp?: number | null
    xpToNextLevel?: number
    levelTitle?: string | null
    profileBadge?: { name?: string | null } | null
    xpEarned?: number
    xp_earned?: number
  } & Record<string, unknown>

  const profile = profileQuery.data as unknown as ProfileLike | undefined
  const [displayPreference, setDisplayPreference] = useState<"full" | "nickname">("full")

  useEffect(() => {
    const stored = localStorage.getItem("swimforge:dashboardDisplayName")
    if (stored === "nickname") setDisplayPreference("nickname")
  }, [])

  const firstName =
    profile?.firstName ||
    profile?.first_name ||
    profile?.name ||
    meQuery.data?.name ||
    ""
  const lastName =
    profile?.lastName ||
    profile?.last_name ||
    ""
  const fullName = [firstName, lastName].filter(Boolean).join(" ")
  const nickname =
    profile?.username ||
    profile?.handle ||
    profile?.displayName ||
    profile?.display_name ||
    ""

  const displayName =
    (displayPreference === "nickname" && nickname) ||
    fullName ||
    nickname ||
    meQuery.data?.email?.split("@")[0] ||
    "Nuotatore"
  const profileAvatarUrl =
    profile?.avatarUrl ||
    profile?.avatar_url ||
    profile?.avatar ||
    null
  const profileCoverImage =
    profile?.coverUrl ||
    profile?.cover_url ||
    profile?.coverImageUrl ||
    profile?.cover_image_url ||
    null
  const coverImage = profileCoverImage || "/images/pool-lanes.jpg"
  const totalXp = profile?.totalXp ?? 0
  const xpProgress = profile?.nextLevelXp
    ? Math.min(100, (totalXp / profile.nextLevelXp) * 100)
    : 0
  const compactLeaderboard = seasonLeaderboardEntries.slice(0, 3)
  const activityDialogRows = useMemo(() => activitiesSortedByDate.slice(0, 12), [activitiesSortedByDate])
  const challengeDialogRows = useMemo(() => activeChallenges.slice(0, 8), [activeChallenges])
  const currentUserRank = useMemo(() => {
    const found = seasonLeaderboardEntries.find((entry) => entry.isCurrentUser)
    return found?.rank ?? null
  }, [seasonLeaderboardEntries])
  const seasonHeroOrbs = useMemo(() => {
    const totalMissions = Math.max(seasonSummary.totalMissions || 0, 1)
    return [
      {
        label: "Season XP",
        value: seasonSummary.seasonXp.toLocaleString(),
        progress: seasonSummary.levelProgress,
        helper: `Livello ${seasonSummary.level}`,
        icon: <Zap className="size-4" />,
        tone: "cyan" as const,
      },
      {
        label: "Giorni",
        value: `${seasonSummary.remainingDays}`,
        progress: Math.min(100, Math.round((seasonSummary.remainingDays / 30) * 100)),
        helper: "Rimanenti",
        icon: <Timer className="size-4" />,
        tone: "sky" as const,
      },
      {
        label: "Rank",
        value: currentUserRank ? `#${currentUserRank}` : "—",
        progress: currentUserRank ? Math.max(6, 100 - (currentUserRank - 1) * 12) : 0,
        helper: "Stagione",
        icon: <Trophy className="size-4" />,
        tone: "amber" as const,
      },
      {
        label: "Missioni",
        value: `${seasonSummary.completedMissions}/${totalMissions}`,
        progress: seasonSummary.completionRate,
        helper: "Weekly+Daily",
        icon: <Target className="size-4" />,
        tone: "lime" as const,
      },
    ]
  }, [seasonSummary, currentUserRank])

  return (
    <AppLayout>
      <div className="dashboard-shell space-y-6 lg:space-y-3 lg:h-full lg:flex lg:flex-col lg:overflow-hidden">
        <div className="grid gap-3 lg:grid-cols-12">
          <Surface className="relative overflow-hidden lg:col-span-8">
            {coverImage ? (
              <div className="absolute inset-0">
                <img
                  src={coverImage}
                  alt="Cover profilo"
                  className="h-full w-full object-cover opacity-34"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-background/88 via-background/72 to-background/55" />
              </div>
            ) : null}
            <SurfaceContent className="relative z-10 flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  <Orbit className="size-3.5 text-primary" />
                  Dashboard live
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className="stream-card px-2.5 py-1.5 text-[11px]">
                    Lv {seasonSummary.level}
                  </div>
                  <div className="stream-card px-2.5 py-1.5 text-[11px]">
                    Rank {currentUserRank ? `#${currentUserRank}` : "—"}
                  </div>
                  <div className="stream-card px-2.5 py-1.5 text-[11px]">
                    Missioni {seasonSummary.completedMissions}/{seasonSummary.totalMissions || 0}
                  </div>
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
                {stats.map((stat) => (
                  <MetricOrb
                    key={`top-${stat.label}`}
                    label={stat.label}
                    value={stat.value}
                    progress={stat.progress}
                    helper={stat.change}
                    icon={<stat.icon className="size-4" />}
                    tone="auto"
                    size="sm"
                  />
                ))}
              </div>

              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
                {seasonHeroOrbs.map((metric) => (
                  <MetricOrb
                    key={`season-${metric.label}`}
                    label={metric.label}
                    value={metric.value}
                    progress={metric.progress}
                    helper={metric.helper}
                    icon={metric.icon}
                    tone={metric.tone}
                    size="sm"
                  />
                ))}
              </div>

              <div className="flex items-start gap-4">
                <div className="size-16 rounded-2xl overflow-hidden ei-border-gradient shadow-[0_0_28px_var(--neon-soft)] shrink-0">
                  {profileAvatarUrl ? (
                    <img
                      src={profileAvatarUrl}
                      alt={displayName}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-primary/10 text-primary text-xl font-semibold">
                      {displayName
                        .split(" ")
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((part: string) => part[0])
                        .join("")
                        .toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">Bentornato,</p>
                  <h1 className="truncate text-xl font-display font-bold neon-gradient-text">{displayName}</h1>
                  <p className="mt-1 text-sm text-foreground/85">
                    {profile?.profileBadge?.name || profile?.levelTitle || "Livello"} · {profile?.totalXp ?? 0} XP totali
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="neon" size="sm" asChild>
                  <Link href="/activities">
                    <Waves className="size-4" />
                    Attività
                  </Link>
                </Button>
                <Button variant="outline-neon" size="sm" asChild>
                  <Link href="/season">
                    <Orbit className="size-4" />
                    Season
                  </Link>
                </Button>
                <Button variant="outline-neon" size="sm" asChild>
                  <Link href="/challenges">
                    <Trophy className="size-4" />
                    Sfide
                  </Link>
                </Button>
                <Button variant="outline-neon" size="sm" asChild>
                  <Link href="/community">
                    <ChevronRight className="size-4" />
                    Club
                  </Link>
                </Button>
                <DashboardDetailDialog
                  title="Feed attività"
                  description="Lista completa delle attività recenti."
                  triggerLabel="Feed"
                >
                  {activityDialogRows.length ? (
                    activityDialogRows.map(({ activity }) => (
                      <Link
                        key={activity.id}
                        href={`/activities/${activity.id}`}
                        className="stream-card block px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              {formatDistanceKm(getActivityDistance(activity))}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatShortDate(getActivityDateValue(activity))}
                            </p>
                          </div>
                          <Badge variant="neon" className="text-[11px]">
                            +{activity.xpEarned ?? 0} XP
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDuration(getActivityDuration(activity))} · {formatPace(getActivityPace(activity))}
                        </p>
                      </Link>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">Nessuna attività recente.</p>
                  )}
                </DashboardDetailDialog>
                <DashboardDetailDialog
                  title="Trend e sfide"
                  description="Andamento settimana e progressi sfide."
                  triggerLabel="Trend"
                >
                  <div className="stream-card px-3 py-2">
                    <p className="text-xs font-semibold text-foreground">Progressi settimanali</p>
                    <div className="mt-2 space-y-1.5">
                      {weeklyData.map((day) => (
                        <div key={`top-weekly-${day.day}`} className="flex items-center gap-2">
                          <span className="w-8 text-[11px] text-muted-foreground">{day.day}</span>
                          <Progress value={Math.min(100, (day.distance / 2000) * 100)} className="h-1.5 flex-1" />
                          <span className="text-[11px] text-muted-foreground">{(day.distance / 1000).toFixed(1)} km</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {challengeDialogRows.length ? (
                    challengeDialogRows.map((challenge) => {
                      const leaderboard = (challenge.leaderboard ?? challenge.leaderboardEntries ?? []) as Array<{
                        progress: number
                      }>
                      const progressValue = Number(
                        challenge.current_progress ?? challenge.currentProgress ?? challenge.progress ?? 0
                      )
                      const maxProgress = Math.max(progressValue, ...leaderboard.map((item) => Number(item.progress || 0)))
                      const progressPercent = maxProgress > 0 ? Math.min(100, (progressValue / maxProgress) * 100) : 0
                      return (
                        <div key={`top-challenge-${challenge.id}`} className="stream-card px-3 py-2">
                          <p className="text-sm font-semibold text-foreground">{challenge.name}</p>
                          <p className="text-xs text-muted-foreground">{challenge.objective}</p>
                          <Progress value={progressPercent} className="mt-2 h-1.5" />
                        </div>
                      )
                    })
                  ) : (
                    <p className="text-sm text-muted-foreground">Nessuna sfida attiva.</p>
                  )}
                </DashboardDetailDialog>
                <DashboardDetailDialog title="Insight AI" description="Analisi completa della settimana." triggerLabel="Insight">
                  {aiInsight ? (
                    <div className="stream-card px-3 py-2">
                      <p className="text-sm font-semibold text-primary">{aiInsight.title}</p>
                      <p className="mt-2 text-sm text-muted-foreground">{aiInsight.message}</p>
                      <Button variant="outline-neon" size="sm" className="mt-3" asChild>
                        <Link href="/coach">Apri AI Coach</Link>
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nessun insight disponibile.</p>
                  )}
                </DashboardDetailDialog>
              </div>
            </SurfaceContent>
          </Surface>

          <Surface className="lg:col-span-4">
            <SurfaceContent className="space-y-4 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Status atleta</p>
                  <p className="mt-1 text-base font-semibold text-foreground">Prossimo livello</p>
                </div>
                <SeasonRecapDialog triggerLabel="Video recap" buttonVariant="neon" />
              </div>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>XP mancanti</span>
                <span className="font-semibold text-foreground">{profile?.xpToNextLevel ?? 0}</span>
              </div>
              <Progress value={xpProgress} className="h-2" />
              <div className="rounded-xl border border-border/80 bg-background/70 px-3 py-2 text-xs text-muted-foreground flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Flame className="size-4 text-primary" />
                  Streak attuale
                </span>
                <span className="font-semibold text-foreground">{advancedQuery.data?.streak?.current ?? 0}g</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline-neon" size="sm" asChild>
                  <Link href="/statistics">Progressi</Link>
                </Button>
                <Button variant="outline-neon" size="sm" asChild>
                  <Link href="/season">Season Hub</Link>
                </Button>
              </div>
              <div className="rounded-xl border border-border/80 bg-background/65 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-foreground">Classifica Season</p>
                    <p className="text-[11px] text-muted-foreground">Top nuotatori della stagione</p>
                  </div>
                  <DashboardDetailDialog
                    title="Classifica completa"
                    description="Posizionamento attuale dei nuotatori della season."
                    triggerLabel="Dettagli"
                  >
                    {seasonLeaderboardEntries.length ? (
                      seasonLeaderboardEntries.map((entry) => (
                        <div key={`status-${entry.rank}-${entry.name}`} className="stream-card px-3 py-2">
                          <div className="flex items-center justify-between">
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                                {entry.rank}
                              </div>
                              <div className="min-w-0">
                                <p className={`truncate text-sm ${entry.isCurrentUser ? "text-primary" : "text-foreground"}`}>
                                  {entry.name}
                                </p>
                                <p className="text-xs text-muted-foreground">{entry.value}</p>
                              </div>
                            </div>
                            {entry.isCurrentUser ? <Badge variant="neon">Tu</Badge> : null}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">Nessuna classifica disponibile.</p>
                    )}
                  </DashboardDetailDialog>
                </div>
                <div className="space-y-1.5">
                  {compactLeaderboard.length ? (
                    compactLeaderboard.map((entry) => (
                      <div key={`status-preview-${entry.rank}-${entry.name}`} className="stream-card px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                              {entry.rank}
                            </div>
                            <div className="min-w-0">
                              <p className={`truncate text-xs ${entry.isCurrentUser ? "text-primary" : "text-foreground"}`}>
                                {entry.name}
                              </p>
                              <p className="text-[11px] text-muted-foreground">{entry.value}</p>
                            </div>
                          </div>
                          {entry.isCurrentUser ? (
                            <Badge variant="neon" className="text-[10px]">
                              Tu
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">Nessuna classifica disponibile.</p>
                  )}
                </div>
              </div>
            </SurfaceContent>
          </Surface>
        </div>

      </div>
    </AppLayout>
  )
}
