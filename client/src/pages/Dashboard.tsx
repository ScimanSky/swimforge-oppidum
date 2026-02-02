"use client"

import AppLayout from "@/components/AppLayout"
import { DashboardHeader } from "@/components/dashboard/header"
import { DashboardStats } from "@/components/dashboard/stats"
import { RecentActivities } from "@/components/dashboard/recent-activities"
import { WeeklyProgress } from "@/components/dashboard/weekly-progress"
import { AIInsights } from "@/components/dashboard/ai-insights"
import { QuickActions } from "@/components/dashboard/quick-actions"
import { Leaderboard } from "@/components/dashboard/leaderboard"
import { trpc } from "@/lib/trpc"
import { useMemo } from "react"
import { Waves, Timer, Gauge, ClipboardList } from "lucide-react"

const formatDuration = (seconds: number) => {
  if (!seconds) return "—"
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes} min`
}

const formatDistanceKm = (meters: number) => {
  if (!meters) return "—"
  return `${(meters / 1000).toFixed(1)} km`
}

const formatPace = (secondsPer100m: number) => {
  if (!secondsPer100m || !Number.isFinite(secondsPer100m)) return "—"
  const minutes = Math.floor(secondsPer100m / 60)
  const seconds = Math.round(secondsPer100m % 60)
  return `${minutes}:${seconds.toString().padStart(2, "0")}/100m`
}

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
  const profileQuery = trpc.profile.get.useQuery()
  const activitiesQuery = trpc.activities.list.useQuery({ limit: 100, offset: 0, source: "all" })
  const timelineQuery = trpc.statistics.getTimeline.useQuery({ days: 7 })
  const advancedQuery = trpc.statistics.getAdvanced.useQuery({ days: 30 })
  const leaderboardQuery = trpc.leaderboard.get.useQuery({
    orderBy: "totalXp",
    period: "week",
    limit: 5,
  })

  const isLoading = profileQuery.isLoading || activitiesQuery.isLoading

  const stats = useMemo(() => {
    const activities = activitiesQuery.data ?? []
    const now = new Date()
    const startOfToday = new Date(now)
    startOfToday.setHours(0, 0, 0, 0)
    const startLast7 = new Date(startOfToday)
    startLast7.setDate(startLast7.getDate() - 6)
    const startPrev7 = new Date(startLast7)
    startPrev7.setDate(startPrev7.getDate() - 7)

    let currentDistance = 0
    let currentTime = 0
    let currentSessions = 0

    let prevDistance = 0
    let prevTime = 0
    let prevSessions = 0

    activities.forEach((activity) => {
      const date = new Date(activity.activityDate)
      if (date >= startLast7) {
        currentDistance += activity.distanceMeters || 0
        currentTime += activity.durationSeconds || 0
        currentSessions += 1
      } else if (date >= startPrev7 && date < startLast7) {
        prevDistance += activity.distanceMeters || 0
        prevTime += activity.durationSeconds || 0
        prevSessions += 1
      }
    })

    const currentPace =
      currentDistance > 0 ? currentTime / (currentDistance / 100) : 0
    const prevPace = prevDistance > 0 ? prevTime / (prevDistance / 100) : 0

    const distanceChange = changeLabel(currentDistance, prevDistance)
    const timeChange = changeLabel(currentTime, prevTime)
    const paceChange = changeLabel(prevPace, currentPace, "pace change")
    const sessionsChange = changeLabel(currentSessions, prevSessions)

    return [
      {
        icon: Waves,
        label: "This Week",
        value: formatDistanceKm(currentDistance),
        change: distanceChange.label,
        changeType: distanceChange.type,
      },
      {
        icon: Timer,
        label: "Time This Week",
        value: formatDuration(currentTime),
        change: timeChange.label,
        changeType: timeChange.type,
      },
      {
        icon: Gauge,
        label: "Avg Pace",
        value: formatPace(currentPace),
        change: paceChange.label,
        changeType: paceChange.type,
      },
      {
        icon: ClipboardList,
        label: "Sessions",
        value: `${currentSessions}`,
        change: sessionsChange.label,
        changeType: sessionsChange.type,
      },
    ]
  }, [activitiesQuery.data])

  const weeklyData = useMemo(() => {
    const timeline = timelineQuery.data ?? []
    const map = new Map(timeline.map((point) => [point.date, point.distance]))
    const today = new Date()
    const days = Array.from({ length: 7 }).map((_, index) => {
      const date = new Date(today)
      date.setDate(today.getDate() - (6 - index))
      const key = date.toISOString().split("T")[0]
      const label = date.toLocaleDateString("en-US", { weekday: "short" })
      return {
        day: label,
        distance: map.get(key) ?? 0,
        goal: 2,
      }
    })
    return days
  }, [timelineQuery.data])

  const recentActivities = useMemo(() => {
    return (activitiesQuery.data ?? []).slice(0, 5)
  }, [activitiesQuery.data])

  const insights = advancedQuery.data?.insights ?? []

  const leaderboardEntries = useMemo(() => {
    const raw = leaderboardQuery.data ?? []
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
  }, [leaderboardQuery.data, profileQuery.data?.userId])

  return (
    <AppLayout>
      <div className="p-4 lg:p-6 space-y-6">
        <DashboardHeader
          name={profileQuery.data?.name}
          streak={advancedQuery.data?.streak?.current ?? null}
          xp={profileQuery.data?.totalXp ?? null}
          isLoading={profileQuery.isLoading}
        />
        <DashboardStats stats={stats} isLoading={isLoading} />

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <WeeklyProgress
              data={weeklyData}
              weeklyGoalKm={14}
              isLoading={timelineQuery.isLoading}
            />
            <RecentActivities activities={recentActivities} isLoading={activitiesQuery.isLoading} />
          </div>
          <div className="space-y-6">
            <QuickActions />
            <AIInsights insights={insights} isLoading={advancedQuery.isLoading} />
            <Leaderboard entries={leaderboardEntries} isLoading={leaderboardQuery.isLoading} />
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
