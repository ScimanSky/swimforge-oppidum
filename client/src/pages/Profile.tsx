import AppLayout from "@/components/AppLayout"
import Image from "next/image"
import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Settings,
  Share2,
  Trophy,
  Flame,
  Target,
  Droplets,
  Clock,
  Calendar,
  Award,
  TrendingUp,
  Zap,
  Timer,
} from "lucide-react"
import { trpc } from "@/lib/trpc"
import { getBadgeImageUrl } from "@/lib/badgeImages"

const formatDistance = (meters?: number | null) => {
  if (!meters) return "—"
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`
}

const formatTime = (seconds?: number | null) => {
  if (!seconds) return "—"
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes} min`
}

const formatPace = (secondsPer100m?: number | null) => {
  if (!secondsPer100m || !Number.isFinite(secondsPer100m)) return "—"
  const minutes = Math.floor(secondsPer100m / 60)
  const seconds = Math.round(secondsPer100m % 60)
  return `${minutes}:${seconds.toString().padStart(2, "0")}/100m`
}

const formatDate = (date?: string | Date | null) => {
  if (!date) return "—"
  return new Date(date).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

const getInitials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "SF"

const getStreaks = (dates: string[]) => {
  if (dates.length === 0) return { current: 0, best: 0 }
  const uniqueDates = Array.from(new Set(dates)).sort()
  let best = 1
  let current = 1

  for (let i = 1; i < uniqueDates.length; i += 1) {
    const prev = new Date(uniqueDates[i - 1])
    const curr = new Date(uniqueDates[i])
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86400000)
    if (diffDays === 1) {
      current += 1
      best = Math.max(best, current)
    } else {
      current = 1
    }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dateSet = new Set(uniqueDates)
  let activeStreak = 0
  let cursor = new Date(today)
  while (dateSet.has(cursor.toISOString().split("T")[0])) {
    activeStreak += 1
    cursor.setDate(cursor.getDate() - 1)
  }

  return { current: activeStreak, best }
}

export default function Profile() {
  const authQuery = trpc.auth.me.useQuery()
  const profileQuery = trpc.profile.get.useQuery()
  const activitiesQuery = trpc.activities.list.useQuery({
    limit: 250,
    offset: 0,
    source: "all",
  })
  const badgesQuery = trpc.badges.progress.useQuery()
  const xpHistoryQuery = trpc.xp.history.useQuery({ limit: 25 })

  const profile = profileQuery.data
  const userName = authQuery.data?.name || authQuery.data?.email?.split("@")[0] || "SwimForge"
  const userEmail = authQuery.data?.email || ""

  const stats = useMemo(() => {
    const totalDistance = profile?.totalDistanceMeters ?? 0
    const totalTime = profile?.totalTimeSeconds ?? 0
    const totalSessions = profile?.totalSessions ?? 0
    const avgPace = totalDistance > 0 ? totalTime / (totalDistance / 100) : 0

    const activities = activitiesQuery.data ?? []
    const longestDistance = activities.reduce((max, a) => Math.max(max, a.distanceMeters || 0), 0)
    const bestPace = activities
      .map((a) => a.avgPacePer100m)
      .filter((value): value is number => typeof value === "number" && value > 0)
      .reduce((min, value) => Math.min(min, value), Number.POSITIVE_INFINITY)
    const dateList = activities
      .map((a) => new Date(a.activityDate).toISOString().split("T")[0])
      .filter(Boolean)
    const streaks = getStreaks(dateList)

    const xpHistory = xpHistoryQuery.data ?? []
    const xpByDay = xpHistory.reduce<Record<string, number>>((acc, row) => {
      const key = new Date(row.createdAt).toISOString().split("T")[0]
      acc[key] = (acc[key] ?? 0) + (row.amount ?? 0)
      return acc
    }, {})
    const bestXpDay = Object.values(xpByDay).reduce((max, value) => Math.max(max, value), 0)

    return {
      totalDistance,
      totalTime,
      totalSessions,
      avgPace,
      longestDistance,
      bestPace: Number.isFinite(bestPace) ? bestPace : null,
      streakCurrent: streaks.current,
      streakBest: streaks.best,
      bestXpDay,
    }
  }, [activitiesQuery.data, profile, xpHistoryQuery.data])

  const badgeProgress = useMemo(() => (badgesQuery.data ?? []) as any[], [badgesQuery.data])
  const earnedCount = badgeProgress.filter((badge) => badge.earned).length

  const achievements = useMemo(() => {
    const history = xpHistoryQuery.data ?? []
    return history.map((row) => ({
      id: row.id,
      title: row.description || row.reason,
      date: row.createdAt,
      xp: row.amount,
    }))
  }, [xpHistoryQuery.data])

  const strokeBreakdown = useMemo(() => {
    const activities = activitiesQuery.data ?? []
    if (!activities.length) return []
    const counts = activities.reduce<Record<string, number>>((acc, activity) => {
      const stroke = activity.strokeType || "mixed"
      acc[stroke] = (acc[stroke] ?? 0) + 1
      return acc
    }, {})
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0)
    const labels: Record<string, string> = {
      freestyle: "Freestyle",
      backstroke: "Backstroke",
      breaststroke: "Breaststroke",
      butterfly: "Butterfly",
      mixed: "Mixed",
    }
    const colors = ["bg-primary", "bg-accent", "bg-chart-4", "bg-chart-5", "bg-chart-3"]

    return Object.entries(counts).map(([stroke, value], index) => ({
      style: labels[stroke] ?? stroke,
      percentage: total ? Math.round((value / total) * 100) : 0,
      color: colors[index % colors.length],
    }))
  }, [activitiesQuery.data])

  const xpLevel = profile?.xpLevel ?? profile?.level ?? 1
  const nextLevelXp = profile?.nextLevelXp ?? 0
  const xpToNext = profile?.xpToNextLevel ?? 0
  const currentXpProgress = nextLevelXp ? Math.max(0, nextLevelXp - xpToNext) : profile?.totalXp ?? 0
  const xpProgressPercent = nextLevelXp ? Math.min(100, (currentXpProgress / nextLevelXp) * 100) : 0

  return (
    <AppLayout>
      <div className="p-4 lg:p-6 space-y-6">
        {/* Profile Header */}
        <Card className="bg-card border-border overflow-hidden">
          <div className="relative h-32 sm:h-48">
            <Image src="/images/pool-lanes.jpg" alt="Cover" fill className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />
          </div>
          <CardContent className="relative px-4 sm:px-6 pb-6">
            <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-12 sm:-mt-16">
              <Avatar className="w-24 h-24 sm:w-32 sm:h-32 border-4 border-card">
                <AvatarImage src={profile?.avatarUrl || ""} alt={userName} />
                <AvatarFallback className="text-2xl">{getInitials(userName)}</AvatarFallback>
              </Avatar>

              <div className="flex-1">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <h1 className="text-2xl font-display font-bold text-foreground">{userName}</h1>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className="bg-primary text-primary-foreground">
                      <Zap className="w-3 h-3 mr-1" />
                      Livello {xpLevel}
                    </Badge>
                    {profile?.profileBadge?.name && (
                      <Badge variant="outline" className="border-accent text-accent">
                        <Flame className="w-3 h-3 mr-1" />
                        {profile.profileBadge.name}
                      </Badge>
                    )}
                  </div>
                </div>
                <p className="text-muted-foreground mt-1">
                  {userEmail || "Nuotatore SwimForge"}
                </p>

                {/* XP Progress */}
                <div className="mt-4 max-w-md">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-muted-foreground">Progresso verso il prossimo livello</span>
                    <span className="text-foreground font-medium">
                      {currentXpProgress} / {nextLevelXp || "—"} XP
                    </span>
                  </div>
                  <Progress value={xpProgressPercent} className="h-2" />
                </div>
              </div>

              <div className="flex gap-2 sm:self-start">
                <Button variant="outline" size="icon">
                  <Share2 className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="icon">
                  <Settings className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <Droplets className="w-6 h-6 text-primary mx-auto mb-2" />
              <p className="text-2xl font-display font-bold text-foreground">
                {formatDistance(stats.totalDistance)}
              </p>
              <p className="text-xs text-muted-foreground">Distanza totale</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <Clock className="w-6 h-6 text-primary mx-auto mb-2" />
              <p className="text-2xl font-display font-bold text-foreground">
                {formatTime(stats.totalTime)}
              </p>
              <p className="text-xs text-muted-foreground">Tempo in acqua</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <Calendar className="w-6 h-6 text-primary mx-auto mb-2" />
              <p className="text-2xl font-display font-bold text-foreground">
                {stats.totalSessions}
              </p>
              <p className="text-xs text-muted-foreground">Sessioni totali</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <TrendingUp className="w-6 h-6 text-accent mx-auto mb-2" />
              <p className="text-2xl font-display font-bold text-foreground">
                {formatPace(stats.avgPace)}
              </p>
              <p className="text-xs text-muted-foreground">Pace medio</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="badges" className="space-y-6">
          <TabsList className="bg-secondary/50">
            <TabsTrigger value="badges">Badges</TabsTrigger>
            <TabsTrigger value="achievements">Achievements</TabsTrigger>
            <TabsTrigger value="stats">Detailed Stats</TabsTrigger>
          </TabsList>

          {/* Badges Tab */}
          <TabsContent value="badges">
            <Card className="bg-card border-border">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-display font-bold text-foreground">
                    Badges Collection
                  </CardTitle>
                  <span className="text-sm text-muted-foreground">
                    {earnedCount} / {badgeProgress.length} earned
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {badgeProgress.map((badge) => (
                    <div
                      key={badge.id}
                      className={`p-4 rounded-xl text-center transition-all ${
                        badge.earned ? "bg-secondary/50" : "bg-secondary/20 opacity-70"
                      }`}
                    >
                      <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center bg-background">
                        <Image
                          src={getBadgeImageUrl(badge.code)}
                          alt={badge.name}
                          width={40}
                          height={40}
                          className="w-8 h-8 object-contain"
                        />
                      </div>
                      <h4 className="font-medium text-foreground text-sm">{badge.name}</h4>
                      <p className="text-xs text-muted-foreground mt-1">{badge.description}</p>
                      {!badge.earned && (
                        <div className="mt-2">
                          <Progress value={badge.progress ?? 0} className="h-1" />
                          <span className="text-[11px] text-muted-foreground">
                            {badge.progress ?? 0}%
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Achievements Tab */}
          <TabsContent value="achievements">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-lg font-display font-bold text-foreground">
                  Recent Achievements
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {achievements.length === 0 && (
                  <div className="text-sm text-muted-foreground">Nessun traguardo registrato.</div>
                )}
                {achievements.map((achievement) => (
                  <div
                    key={achievement.id}
                    className="flex items-center gap-4 p-4 rounded-xl bg-secondary/30"
                  >
                    <div className="w-12 h-12 rounded-full bg-chart-4/10 flex items-center justify-center flex-shrink-0">
                      <Award className="w-6 h-6 text-chart-4" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-foreground">{achievement.title}</h4>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(achievement.date)}
                      </p>
                    </div>
                    <Badge className="bg-accent/20 text-accent">+{achievement.xp} XP</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Detailed Stats Tab */}
          <TabsContent value="stats">
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-lg font-display font-bold text-foreground">
                    Personal Records
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    {
                      label: "Longest Swim",
                      value: formatDistance(stats.longestDistance),
                      icon: Droplets,
                    },
                    {
                      label: "Best 100m Pace",
                      value: formatPace(stats.bestPace),
                      icon: Timer,
                    },
                    {
                      label: "Best Streak",
                      value: `${stats.streakBest} giorni`,
                      icon: Flame,
                    },
                    {
                      label: "Most XP in Day",
                      value: `${stats.bestXpDay} XP`,
                      icon: Zap,
                    },
                  ].map((record, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 rounded-lg bg-secondary/30"
                    >
                      <div className="flex items-center gap-3">
                        <record.icon className="w-5 h-5 text-primary" />
                        <span className="text-sm text-muted-foreground">{record.label}</span>
                      </div>
                      <span className="font-display font-bold text-foreground">{record.value}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-lg font-display font-bold text-foreground">
                    Swimming Style Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {strokeBreakdown.length === 0 && (
                    <div className="text-sm text-muted-foreground">Nessun dato disponibile.</div>
                  )}
                  {strokeBreakdown.map((style) => (
                    <div key={style.style}>
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-foreground">{style.style}</span>
                        <span className="text-muted-foreground">{style.percentage}%</span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div
                          className={`h-full ${style.color} rounded-full transition-all`}
                          style={{ width: `${style.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  )
}
