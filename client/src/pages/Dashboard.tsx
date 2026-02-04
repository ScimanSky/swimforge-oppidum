"use client"

import AppLayout from "@/components/AppLayout"
import { trpc } from "@/lib/trpc"
import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Flame,
  Waves,
  Timer,
  Target,
  Trophy,
  Zap,
  ChevronRight,
} from "lucide-react"
import { Link } from "wouter"

const formatDuration = (seconds: number | null | undefined) => {
  if (seconds === null || seconds === undefined) return "—"
  if (seconds === 0) return "0 min"
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes} min`
}

const formatDistanceKm = (meters: number | null | undefined) => {
  if (meters === null || meters === undefined) return "—"
  if (meters === 0) return "0.0 km"
  return `${(meters / 1000).toFixed(1)} km`
}

const formatPace = (secondsPer100m: number | null | undefined) => {
  if (secondsPer100m === null || secondsPer100m === undefined) return "—"
  if (!Number.isFinite(secondsPer100m) || secondsPer100m <= 0) return "—"
  const minutes = Math.floor(secondsPer100m / 60)
  const seconds = Math.round(secondsPer100m % 60)
  return `${minutes}:${seconds.toString().padStart(2, "0")}/100m`
}

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

const getActivityAvgHeartRate = (activity: any) =>
  toNumber(activity?.avgHeartRate ?? activity?.avg_heart_rate ?? 0)

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

export default function Dashboard() {
  const meQuery = trpc.auth.me.useQuery()
  const profileQuery = trpc.profile.get.useQuery()
  const activitiesQuery = trpc.activities.list.useQuery(
    { limit: 100, offset: 0, source: "all" },
    { staleTime: 0, refetchOnWindowFocus: true, refetchOnMount: "always" }
  )
  const timelineQuery = trpc.statistics.getTimeline.useQuery({ days: 14 })
  const advancedQuery = trpc.statistics.getAdvanced.useQuery({ days: 30 })
  const leaderboardQuery = trpc.leaderboard.get.useQuery({
    orderBy: "totalXp",
    period: "week",
    limit: 5,
  })
  const leaderboardAllQuery = trpc.leaderboard.get.useQuery(
    {
      orderBy: "totalXp",
      period: "all",
      limit: 5,
    },
    { enabled: (leaderboardQuery.data?.length ?? 0) === 0 }
  )
  const challengesQuery = trpc.challenges.list.useQuery()

  const stats = useMemo(() => {
    const activities = activitiesQuery.data ?? []
    const timeline = timelineQuery.data ?? []
    const profileTotals = profileQuery.data
    const now = new Date()
    const startOfToday = new Date(now)
    startOfToday.setHours(0, 0, 0, 0)
    const startLast7 = new Date(startOfToday)
    startLast7.setDate(startLast7.getDate() - 6)
    const startPrev7 = new Date(startLast7)
    startPrev7.setDate(startPrev7.getDate() - 7)

    const toDateKey = (date: Date) => date.toISOString().split("T")[0]
    const timelineMap = new Map(timeline.map((point) => [point.date, point]))

    let currentDistance = 0
    let currentTime = 0
    let currentSessions = 0

    let prevDistance = 0
    let prevTime = 0
    let prevSessions = 0

    let validDates = 0

    activities.forEach((activity) => {
      const date = parseActivityDate(getActivityDateValue(activity))
      if (!date) return
      validDates += 1
      if (date >= startLast7) {
        currentDistance += getActivityDistance(activity)
        currentTime += getActivityDuration(activity)
        currentSessions += 1
      } else if (date >= startPrev7 && date < startLast7) {
        prevDistance += getActivityDistance(activity)
        prevTime += getActivityDuration(activity)
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
      const date = new Date(startLast7)
      date.setDate(startLast7.getDate() + i)
      const key = toDateKey(date)
      const entry = timelineMap.get(key)
      if (entry) {
        timelineCurrentDistanceKm += Number(entry.distance || 0)
        timelineCurrentSessions += Number(entry.sessions || 0)
        if (entry.pace) timelineCurrentPaceValues.push(entry.pace)
      }
    }

    for (let i = 0; i < 7; i += 1) {
      const date = new Date(startPrev7)
      date.setDate(startPrev7.getDate() + i)
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
      currentDistance = activities.reduce(
        (sum, activity) => sum + getActivityDistance(activity),
        0
      )
      currentTime = activities.reduce(
        (sum, activity) => sum + getActivityDuration(activity),
        0
      )
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
      const sorted = [...activities].sort(
        (a, b) =>
          (parseActivityDate(getActivityDateValue(b))?.getTime() ?? 0) -
          (parseActivityDate(getActivityDateValue(a))?.getTime() ?? 0)
      )
      const slice = sorted.slice(0, 7)
      currentDistance = slice.reduce((sum, activity) => sum + getActivityDistance(activity), 0)
      currentTime = slice.reduce((sum, activity) => sum + getActivityDuration(activity), 0)
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
  }, [activitiesQuery.data, timelineQuery.data, profileQuery.data])

  const weeklyData = useMemo(() => {
    const timeline = timelineQuery.data ?? []
    const map = new Map(timeline.map((point) => [point.date, point.distance]))
    const today = new Date()
    return Array.from({ length: 7 }).map((_, index) => {
      const date = new Date(today)
      date.setDate(today.getDate() - (6 - index))
      const key = date.toISOString().split("T")[0]
      const label = date.toLocaleDateString("it-IT", { weekday: "short" })
      return {
        day: label,
        distance: map.get(key) ?? 0,
      }
    })
  }, [timelineQuery.data])

  const recentActivities = useMemo(() => {
    const list = activitiesQuery.data ?? []
    return [...list]
      .sort(
        (a, b) =>
          (parseActivityDate(getActivityDateValue(b))?.getTime() ?? 0) -
          (parseActivityDate(getActivityDateValue(a))?.getTime() ?? 0)
      )
      .slice(0, 3)
  }, [activitiesQuery.data])

  const leaderboardEntries = useMemo(() => {
    const raw =
      leaderboardQuery.data && leaderboardQuery.data.length > 0
        ? leaderboardQuery.data
        : leaderboardAllQuery.data ?? []
    const normalizeEntry = (entry: any) => {
      const profile = entry.profile || entry
      const userName = entry.userName ?? entry.name ?? "Nuotatore"
      const initials = userName
        .split(" ")
        .map((part: string) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
      const xpValue = entry.periodXp ?? entry.totalXp ?? profile.totalXp ?? 0
      return {
        id: profile.id ?? entry.id ?? 0,
        userId: String(profile.userId ?? entry.userId ?? ""),
        userName,
        initials,
        xpValue,
      }
    }
    return raw.map(normalizeEntry).map((entry, index) => ({
      rank: index + 1,
      name: entry.userName,
      initials: entry.initials || "SW",
      value: `${Number(entry.xpValue).toLocaleString()} XP`,
      isCurrentUser: profileQuery.data?.userId
        ? String(profileQuery.data.userId) === entry.userId
        : false,
    }))
  }, [leaderboardQuery.data, leaderboardAllQuery.data, profileQuery.data?.userId])

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

  const profile = profileQuery.data
  const displayName =
    profile?.displayName ||
    profile?.display_name ||
    profile?.name ||
    [profile?.firstName || profile?.first_name, profile?.lastName || profile?.last_name]
      .filter(Boolean)
      .join(" ") ||
    profile?.username ||
    profile?.handle ||
    meQuery.data?.name ||
    meQuery.data?.email?.split("@")[0] ||
    "Nuotatore"
  const profileBadgeImage =
    profile?.profileBadge?.badge_image_url ||
    profile?.profileBadge?.badgeImageUrl ||
    profile?.profileBadge?.image_url ||
    profile?.profileBadge?.imageUrl ||
    null
  const profileCoverImage =
    profile?.coverUrl ||
    profile?.cover_url ||
    profile?.coverImageUrl ||
    profile?.cover_image_url ||
    null
  const xpProgress = profile?.nextLevelXp
    ? Math.min(100, (profile.totalXp / profile.nextLevelXp) * 100)
    : 0

  return (
    <AppLayout>
      <div className="space-y-6">
        <Card className="bg-card border-border relative overflow-hidden">
          {profileCoverImage && (
            <div className="absolute inset-0">
              <img
                src={profileCoverImage}
                alt="Cover profilo"
                className="h-full w-full object-cover opacity-25"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/70 to-background/40" />
            </div>
          )}
          <CardContent className="relative p-6 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="size-32 rounded-2xl bg-primary/10 flex items-center justify-center overflow-hidden">
                {profileBadgeImage ? (
                  <img
                    src={profileBadgeImage}
                    alt={profile?.profileBadge?.name || "Badge profilo"}
                    className="h-28 w-28 object-contain badge-hero-spin"
                    loading="lazy"
                  />
                ) : (
                  <Waves className="size-12 text-primary" />
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Bentornato,</p>
                <h1 className="text-2xl font-display font-bold text-foreground">
                  {displayName}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {profile?.profileBadge?.name || profile?.levelTitle || "Livello"} • {profile?.totalXp ?? 0} XP
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-3 min-w-[220px]">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Prossimo livello</span>
                <span>{profile?.xpToNextLevel ?? 0} XP</span>
              </div>
              <Progress value={xpProgress} className="h-2" />
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Flame className="size-4 text-primary" />
                Streak attuale: {advancedQuery.data?.streak?.current ?? 0} giorni
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="bg-card border-border">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className={`flex size-10 items-center justify-center rounded-lg ${stat.bgColor} ${stat.color}`}>
                    <stat.icon className="size-5" />
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {stat.progress}%
                  </Badge>
                </div>
                <div className="mt-4">
                  <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                </div>
                <Progress value={stat.progress} className="mt-3 h-1.5" />
                <p className="mt-3 text-xs text-muted-foreground">{stat.change}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="bg-card border-border lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="font-display">Attività recenti</CardTitle>
                <CardDescription>Le ultime sessioni sincronizzate</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/activities">
                  Vai a tutte
                  <ChevronRight className="ml-2 size-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {recentActivities.length ? (
                recentActivities.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex flex-col gap-3 rounded-xl border border-border bg-background/60 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {formatDistanceKm(getActivityDistance(activity))}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(() => {
                          const parsed = parseActivityDate(getActivityDateValue(activity))
                          return parsed
                            ? parsed.toLocaleDateString("it-IT", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })
                            : "—"
                        })()}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>⏱ {formatDuration(getActivityDuration(activity))}</span>
                      <span>⚡ {formatPace(getActivityPace(activity))}</span>
                      {getActivityAvgHeartRate(activity) > 0 ? (
                        <span>❤️ {Math.round(getActivityAvgHeartRate(activity))} bpm</span>
                      ) : null}
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      +{activity.xpEarned ?? activity.xp_earned ?? 0} XP
                    </Badge>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nessuna attività recente. Sincronizza Garmin o Strava.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="font-display">Progressi settimanali</CardTitle>
              <CardDescription>Distanza per giorno</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {weeklyData.map((day) => (
                <div key={day.day} className="flex items-center gap-3">
                  <span className="w-10 text-xs text-muted-foreground">{day.day}</span>
                  <Progress
                    value={Math.min(100, (day.distance / 2000) * 100)}
                    className="h-2 flex-1"
                  />
                  <span className="text-xs text-muted-foreground">
                    {(day.distance / 1000).toFixed(1)} km
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="font-display">Sfide attive</CardTitle>
              <CardDescription>Le tue sfide correnti</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeChallenges.length ? (
                activeChallenges.slice(0, 2).map((challenge) => {
                  const leaderboard = (challenge.leaderboard ?? challenge.leaderboardEntries ?? []) as Array<{ progress: number }>
                  const progressValue = Number(
                    challenge.current_progress ?? challenge.currentProgress ?? challenge.progress ?? 0
                  )
                  const maxProgress = Math.max(
                    progressValue,
                    ...leaderboard.map((item) => Number(item.progress || 0))
                  )
                  const progressPercent =
                    maxProgress > 0 ? Math.min(100, (progressValue / maxProgress) * 100) : 0
                  return (
                    <div key={challenge.id} className="rounded-xl border border-border bg-background/60 p-4">
                      <p className="text-sm font-semibold text-foreground">{challenge.name}</p>
                      <p className="text-xs text-muted-foreground">{challenge.objective}</p>
                      <Progress value={progressPercent} className="mt-3 h-1.5" />
                    </div>
                  )
                })
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nessuna sfida attiva. Partecipane una dalla sezione Sfide.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="font-display">Classifica</CardTitle>
              <CardDescription>Top nuotatori della settimana</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {leaderboardEntries.length ? (
                leaderboardEntries.slice(0, 3).map((entry) => (
                  <div key={entry.rank} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                        {entry.rank}
                      </div>
                      <div>
                        <p className={`text-sm ${entry.isCurrentUser ? "text-primary" : "text-foreground"}`}>
                          {entry.name}
                        </p>
                        <p className="text-xs text-muted-foreground">{entry.value}</p>
                      </div>
                    </div>
                    {entry.isCurrentUser && (
                      <Badge variant="secondary" className="text-xs">Tu</Badge>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Nessuna classifica disponibile.</p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="font-display">Insight AI</CardTitle>
              <CardDescription>Focus rapido della settimana</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {aiInsight ? (
                <>
                  <div className="flex items-center gap-2 text-primary">
                    <Trophy className="size-5" />
                    <span className="text-sm font-semibold">{aiInsight.title}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{aiInsight.message}</p>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/coach">Apri AI Coach</Link>
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nessun insight disponibile. Sincronizza nuove attività.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  )
}
