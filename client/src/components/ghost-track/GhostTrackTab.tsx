"use client"

import { useMemo, useState } from "react"
import {
  BarChart,
  Bar,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  ChevronRight,
  Flame,
  Target,
  Trophy,
  TrendingUp,
  Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Surface, SurfaceContent, SurfaceDescription, SurfaceHeader, SurfaceTitle } from "@/components/ui/surface"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { trpc } from "@/lib/trpc"
import { toast } from "sonner"

type ViewMode = "friends" | "sessions" | "challenge" | "results" | "leaderboard"

const formatDistance = (meters?: number | null) => {
  if (!meters) return "—"
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`
}

const formatDuration = (seconds?: number | null) => {
  if (!seconds && seconds !== 0) return "—"
  const totalSeconds = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(totalSeconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  return `${minutes} min`
}

const formatShortDuration = (seconds?: number | null) => {
  if (!seconds && seconds !== 0) return "—"
  const totalSeconds = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  return `${minutes}:${secs.toString().padStart(2, "0")}`
}

const formatPaceValue = (pace?: number | null) => {
  if (!pace || pace <= 0) return "—"
  const minutes = Math.floor(pace / 60)
  const secs = Math.round(pace % 60)
  return `${minutes}:${secs.toString().padStart(2, "0")}/100m`
}

const formatDateLabel = (value?: string | null) => {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })
}

const getInitials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "SW"

export default function GhostTrackTab() {
  const [viewMode, setViewMode] = useState<ViewMode>("friends")
  const [selectedFriend, setSelectedFriend] = useState<any | null>(null)
  const [selectedSession, setSelectedSession] = useState<any | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [sessionSort, setSessionSort] = useState("recent")
  const [challengeContext, setChallengeContext] = useState<any | null>(null)

  const profileQuery = trpc.profile.get.useQuery()
  const currentUserId = profileQuery.data?.userId

  const friendsQuery = trpc.community.ghostTrack.friends.useQuery({
    search: searchTerm.trim() || undefined,
  })
  const sessionsQuery = trpc.community.ghostTrack.sessions.useQuery(
    { friendUserId: selectedFriend?.id ?? 0 },
    { enabled: !!selectedFriend }
  )
  const leaderboardQuery = trpc.community.ghostTrack.leaderboard.useQuery()
  const myChallengesQuery = trpc.community.ghostChallenges.list.useQuery()

  const previewMutation = trpc.community.ghostTrack.preview.useMutation({
    onSuccess: (data) => {
      setChallengeContext(data)
      setViewMode("challenge")
    },
    onError: (err) => toast.error(err.message || "Impossibile avviare la Ghost Track"),
  })

  const createChallengeMutation = trpc.community.ghostChallenges.createFromPost.useMutation({
    onError: (err) => toast.error(err.message || "Impossibile creare la Ghost Track"),
  })

  const lapsQuery = trpc.community.ghostTrack.laps.useQuery(
    {
      activityIds: challengeContext
        ? [challengeContext.challenger.id, challengeContext.opponent.id]
        : [],
    },
    { enabled: !!challengeContext }
  )

  const friends = useMemo(() => {
    const raw = (friendsQuery.data as any[]) || []
    return raw
      .map((friend) => {
        const totalChallenges = Number(friend.total_challenges || 0)
        const wins = Number(friend.wins || 0)
        const winRate = totalChallenges > 0 ? Math.round((wins / totalChallenges) * 100) : 0
        return {
          ...friend,
          wins,
          winRate,
          totalChallenges,
        }
      })
      .sort((a, b) => b.winRate - a.winRate)
  }, [friendsQuery.data])

  const sessions = useMemo(() => {
    const raw = (sessionsQuery.data as any[]) || []
    const sorted = [...raw]
    if (sessionSort === "distance") {
      sorted.sort((a, b) => (b.distance_meters || 0) - (a.distance_meters || 0))
    } else if (sessionSort === "pace") {
      sorted.sort((a, b) => (a.avg_pace_per_100m || 0) - (b.avg_pace_per_100m || 0))
    } else {
      sorted.sort(
        (a, b) =>
          new Date(b.activity_date).getTime() - new Date(a.activity_date).getTime()
      )
    }
    return sorted
  }, [sessionsQuery.data, sessionSort])

  const leaderboard = useMemo(() => {
    const raw = (leaderboardQuery.data as any[]) || []
    return raw.map((entry, index) => {
      const wins = Number(entry.wins || 0)
      const losses = Number(entry.losses || 0)
      const total = wins + losses
      const winRate = total > 0 ? Math.round((wins / total) * 100) : 0
      return {
        ...entry,
        rank: index + 1,
        wins,
        losses,
        winRate,
        points: wins * 100,
      }
    })
  }, [leaderboardQuery.data])

  const myChallengeStats = useMemo(() => {
    const challenges = (myChallengesQuery.data as any[]) || []
    const wins = challenges.filter((c) => c.winner_user_id === currentUserId).length
    const total = challenges.length
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0
    const sorted = [...challenges].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    let streak = 0
    for (const challenge of sorted) {
      if (challenge.winner_user_id === currentUserId) {
        streak += 1
      } else {
        break
      }
    }
    return { wins, total, winRate, streak }
  }, [myChallengesQuery.data, currentUserId])

  const lapsByActivity = (lapsQuery.data as Record<string, any[]>) || {}
  const challengerLaps = challengeContext
    ? lapsByActivity[challengeContext.challenger.id] || []
    : []
  const opponentLaps = challengeContext
    ? lapsByActivity[challengeContext.opponent.id] || []
    : []

  const performanceData = useMemo(() => {
    if (!challengeContext) return []
    const maxLaps = Math.max(challengerLaps.length, opponentLaps.length)
    return Array.from({ length: maxLaps }, (_, index) => {
      const you = challengerLaps[index]?.durationSeconds ?? null
      const friend = opponentLaps[index]?.durationSeconds ?? null
      const diff = you !== null && friend !== null ? Math.round(you - friend) : null
      return { lap: index + 1, you, friend, diff }
    })
  }, [challengeContext, challengerLaps, opponentLaps])

  const lapSummary = useMemo(() => {
    if (!performanceData.length) {
      return { lapsWon: 0, totalLaps: 0, bestLap: null, friendBestLap: null, consistency: null }
    }
    const valid = performanceData.filter((item) => item.you !== null && item.friend !== null)
    const lapsWon = valid.filter((item) => (item.you as number) < (item.friend as number)).length
    const yourLaps = valid.map((item) => item.you as number)
    const friendLaps = valid.map((item) => item.friend as number)
    const bestLap = yourLaps.length ? Math.min(...yourLaps) : null
    const friendBestLap = friendLaps.length ? Math.min(...friendLaps) : null
    const avg = yourLaps.length
      ? yourLaps.reduce((sum, v) => sum + v, 0) / yourLaps.length
      : null
    const consistency =
      avg && yourLaps.length
        ? Math.round(
            (yourLaps.filter((v) => Math.abs(v - avg) / avg <= 0.05).length / yourLaps.length) * 100
          )
        : null
    return {
      lapsWon,
      totalLaps: valid.length,
      bestLap,
      friendBestLap,
      consistency,
    }
  }, [performanceData])

  const handleSelectFriend = (friend: any) => {
    setSelectedFriend(friend)
    setSelectedSession(null)
    setChallengeContext(null)
    setViewMode("sessions")
  }

  const handleStartChallenge = (session: any) => {
    setSelectedSession(session)
    previewMutation.mutate({ postId: session.post_id })
  }

  const handleViewResults = async () => {
    if (!selectedSession) return
    try {
      await createChallengeMutation.mutateAsync({ postId: selectedSession.post_id })
      myChallengesQuery.refetch()
      setViewMode("results")
    } catch {
      // error handled via mutation onError
    }
  }

  const timeDiffSeconds =
    challengeContext?.challenger?.durationSeconds && challengeContext?.opponent?.durationSeconds
      ? Math.round(
          challengeContext.challenger.durationSeconds - challengeContext.opponent.durationSeconds
        )
      : null

  const winnerId = challengeContext?.outcome?.winnerUserId ?? null
  const isDraw = winnerId === null
  const didWin = winnerId === currentUserId

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Zap className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground">Ghost Track</h2>
            <p className="text-sm text-muted-foreground">
              Sfida le sessioni pubbliche dei tuoi amici e scala la classifica.
            </p>
          </div>
        </div>
        {viewMode !== "friends" && (
          <Button variant="outline" onClick={() => {
            setViewMode("friends")
            setSelectedFriend(null)
            setSelectedSession(null)
            setChallengeContext(null)
          }}>
            Torna agli amici
          </Button>
        )}
      </div>

      {viewMode === "friends" && (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Input
              placeholder="Cerca un amico..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="md:max-w-sm"
            />
            <Badge variant="secondary">Sfide 1v1 sulle sessioni reali</Badge>
          </div>

          {friendsQuery.isLoading ? (
            <Surface className="border-border">
              <SurfaceContent className="py-10 text-muted-foreground">Caricamento amici...</SurfaceContent>
            </Surface>
          ) : friends.length === 0 ? (
            <Surface className="border-border">
              <SurfaceContent className="py-10 text-muted-foreground">
                Nessun amico disponibile nel feed pubblico o nei club.
              </SurfaceContent>
            </Surface>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {friends.map((friend, index) => {
                const rankBadge =
                  index === 0
                    ? { label: "🥇", className: "bg-amber-500/15 text-amber-500 border-amber-500/30" }
                    : index === 1
                    ? { label: "🥈", className: "bg-slate-400/15 text-slate-300 border-slate-400/30" }
                    : index === 2
                    ? { label: "🥉", className: "bg-orange-500/15 text-orange-500 border-orange-500/30" }
                    : null

                return (
                  <Surface
                    key={friend.id}
                    className="border-border hover:border-primary/60 transition-colors cursor-pointer"
                    onClick={() => handleSelectFriend(friend)}
                  >
                    <SurfaceContent className="space-y-4">
                      <div className="flex items-start justify-between">
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={friend.avatar_url || ""} />
                          <AvatarFallback>
                            {getInitials(friend.name || friend.email || "SF")}
                          </AvatarFallback>
                        </Avatar>
                        {rankBadge && (
                          <Badge variant="outline" className={rankBadge.className}>
                            {rankBadge.label}
                          </Badge>
                        )}
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-foreground">
                          {friend.name || friend.email?.split("@")[0] || "Nuotatore"}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {friend.total_sessions} sessioni condivise
                        </p>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Win rate</span>
                          <span className="font-semibold text-foreground">{friend.winRate}%</span>
                        </div>
                        <Progress value={friend.winRate} />
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Vittorie</span>
                          <span className="font-semibold text-foreground">{friend.wins}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Pace medio</span>
                          <span className="font-semibold text-foreground">
                            {formatPaceValue(friend.avg_pace_per_100m)}
                          </span>
                        </div>
                      </div>
                      <Button className="w-full">
                        Sfida <ChevronRight className="ml-2 h-4 w-4" />
                      </Button>
                    </SurfaceContent>
                  </Surface>
                )
              })}
            </div>
          )}

          <Surface className="border-border">
            <SurfaceHeader>
              <SurfaceTitle className="flex items-center gap-2 text-base">
                <Trophy className="h-5 w-5 text-primary" />
                Classifica Ghost Track
              </SurfaceTitle>
              <SurfaceDescription>Top 5 sfidanti della community.</SurfaceDescription>
            </SurfaceHeader>
            <SurfaceContent className="space-y-3">
              {leaderboardQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Caricamento classifica...</p>
              ) : leaderboard.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nessuna sfida registrata.</p>
              ) : (
                leaderboard.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-6 text-lg font-semibold text-foreground">
                        {entry.rank === 1 && "🥇"}
                        {entry.rank === 2 && "🥈"}
                        {entry.rank === 3 && "🥉"}
                        {entry.rank > 3 && entry.rank}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {entry.name || entry.email?.split("@")[0] || "Nuotatore"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {entry.wins}W · {entry.losses}L · {entry.winRate}%
                        </p>
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-primary">{entry.points} pts</div>
                  </div>
                ))
              )}
              <div className="grid gap-3 pt-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-border bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground">Sfide totali</p>
                  <p className="text-xl font-semibold text-foreground">{myChallengeStats.total}</p>
                </div>
                <div className="rounded-lg border border-border bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground">Vittorie</p>
                  <p className="text-xl font-semibold text-foreground">{myChallengeStats.wins}</p>
                </div>
                <div className="rounded-lg border border-border bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground">Win rate</p>
                  <p className="text-xl font-semibold text-foreground">{myChallengeStats.winRate}%</p>
                </div>
                <div className="rounded-lg border border-border bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground">Streak attuale</p>
                  <p className="text-xl font-semibold text-foreground">{myChallengeStats.streak}</p>
                </div>
              </div>
            </SurfaceContent>
          </Surface>
        </div>
      )}

      {viewMode === "sessions" && selectedFriend && (
        <div className="space-y-6">
          <Surface className="border-border">
            <SurfaceContent className="space-y-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={selectedFriend.avatar_url || ""} />
                    <AvatarFallback>
                      {getInitials(selectedFriend.name || selectedFriend.email || "SF")}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">
                      {selectedFriend.name || selectedFriend.email?.split("@")[0] || "Nuotatore"}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {selectedFriend.total_sessions} sessioni condivise
                    </p>
                  </div>
                </div>
                <Select value={sessionSort} onValueChange={setSessionSort}>
                  <SelectTrigger className="w-full md:w-48">
                    <SelectValue placeholder="Ordina per" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recent">Più recenti</SelectItem>
                    <SelectItem value="distance">Distanza</SelectItem>
                    <SelectItem value="pace">Pace</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </SurfaceContent>
          </Surface>

          {sessionsQuery.isLoading ? (
            <Surface className="border-border">
              <SurfaceContent className="py-10 text-muted-foreground">Caricamento sessioni...</SurfaceContent>
            </Surface>
          ) : sessions.length === 0 ? (
            <Surface className="border-border">
              <SurfaceContent className="py-10 text-muted-foreground">
                Nessuna sessione condivisa disponibile.
              </SurfaceContent>
            </Surface>
          ) : (
            <div className="space-y-4">
              {sessions.map((session) => (
                <Surface key={session.post_id} className="border-border">
                  <SurfaceContent className="space-y-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-lg font-semibold text-foreground">
                          {formatDistance(session.distance_meters)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatDateLabel(session.activity_date)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold text-primary">
                          {formatDuration(session.duration_seconds)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatPaceValue(session.avg_pace_per_100m)}
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-lg border border-border bg-secondary/30 p-3">
                        <p className="text-xs text-muted-foreground">Laps</p>
                        <p className="text-sm font-semibold text-foreground">
                          {session.laps_count ?? "—"}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border bg-secondary/30 p-3">
                        <p className="text-xs text-muted-foreground">Stile</p>
                        <p className="text-sm font-semibold text-foreground">
                          {session.stroke_type || "—"}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border bg-secondary/30 p-3">
                        <p className="text-xs text-muted-foreground">Tipo</p>
                        <p className="text-sm font-semibold text-foreground">
                          {session.is_open_water ? "Open Water" : "Vasca"}
                        </p>
                      </div>
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => handleStartChallenge(session)}
                      disabled={previewMutation.isPending}
                    >
                      <Flame className="mr-2 h-4 w-4" />
                      Sfida questa sessione
                    </Button>
                  </SurfaceContent>
                </Surface>
              ))}
            </div>
          )}
        </div>
      )}

      {viewMode === "challenge" && challengeContext && (
        <div className="space-y-6">
          <Surface className="border-border">
            <SurfaceContent className="text-center">
              <h3 className="text-2xl font-bold text-foreground">Sfida in corso</h3>
              <p className="text-sm text-muted-foreground">
                Tu vs {selectedFriend?.name || selectedFriend?.email?.split("@")[0] || "Amico"}
              </p>
            </SurfaceContent>
          </Surface>

          <div className="grid gap-4 lg:grid-cols-2">
            <Surface className="border-border">
              <SurfaceHeader>
                <SurfaceTitle className="text-base">La tua sessione</SurfaceTitle>
              </SurfaceHeader>
              <SurfaceContent className="space-y-3">
                <div className="rounded-lg border border-border bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground">Distanza</p>
                  <p className="text-lg font-semibold text-foreground">
                    {formatDistance(challengeContext.challenger.distanceMeters)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground">Tempo</p>
                  <p className="text-lg font-semibold text-foreground">
                    {formatDuration(challengeContext.challenger.durationSeconds)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground">Pace medio</p>
                  <p className="text-lg font-semibold text-foreground">
                    {formatPaceValue(challengeContext.challenger.pacePer100m)}
                  </p>
                </div>
              </SurfaceContent>
            </Surface>

            <Surface className="border-border">
              <SurfaceHeader>
                <SurfaceTitle className="text-base">Sessione avversario</SurfaceTitle>
              </SurfaceHeader>
              <SurfaceContent className="space-y-3">
                <div className="rounded-lg border border-border bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground">Distanza</p>
                  <p className="text-lg font-semibold text-foreground">
                    {formatDistance(challengeContext.opponent.distanceMeters)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground">Tempo</p>
                  <p className="text-lg font-semibold text-foreground">
                    {formatDuration(challengeContext.opponent.durationSeconds)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground">Pace medio</p>
                  <p className="text-lg font-semibold text-foreground">
                    {formatPaceValue(challengeContext.opponent.pacePer100m)}
                  </p>
                </div>
              </SurfaceContent>
            </Surface>
          </div>

          <Surface className="border-border">
            <SurfaceHeader>
              <SurfaceTitle className="text-base">Confronto lap-by-lap</SurfaceTitle>
              <SurfaceDescription>Tempo per lap (tu vs avversario)</SurfaceDescription>
            </SurfaceHeader>
            <SurfaceContent>
              {lapsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Caricamento laps...</p>
              ) : performanceData.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nessun dato lap disponibile per questa sfida.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={performanceData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="lap" stroke="var(--muted-foreground)" />
                    <YAxis stroke="var(--muted-foreground)" />
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        color: "var(--foreground)",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="you"
                      stroke="var(--chart-1)"
                      strokeWidth={2}
                      dot={false}
                      name="Tu"
                    />
                    <Line
                      type="monotone"
                      dataKey="friend"
                      stroke="var(--chart-2)"
                      strokeWidth={2}
                      dot={false}
                      name="Amico"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </SurfaceContent>
          </Surface>

          <Surface className="border-border">
            <SurfaceHeader>
              <SurfaceTitle className="text-base">Differenza tempo per lap</SurfaceTitle>
              <SurfaceDescription>Valori negativi = sei più veloce</SurfaceDescription>
            </SurfaceHeader>
            <SurfaceContent>
              {performanceData.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nessun dato lap disponibile per questa sfida.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={performanceData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="lap" stroke="var(--muted-foreground)" />
                    <YAxis stroke="var(--muted-foreground)" />
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        color: "var(--foreground)",
                      }}
                    />
                    <Bar dataKey="diff" fill="var(--chart-3)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </SurfaceContent>
          </Surface>

          <div className="flex flex-col gap-3 md:flex-row">
            <Button className="flex-1" onClick={handleViewResults} disabled={createChallengeMutation.isPending}>
              <Target className="mr-2 h-4 w-4" />
              Vedi risultati
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setViewMode("sessions")
                setChallengeContext(null)
              }}
            >
              Annulla
            </Button>
          </div>
        </div>
      )}

      {viewMode === "results" && challengeContext && (
        <div className="space-y-6">
          <Surface className="border-border">
            <SurfaceContent className="text-center space-y-2">
              <p className="text-3xl">{isDraw ? "🤝" : didWin ? "🏆" : "⚡"}</p>
              <h3 className="text-2xl font-bold text-foreground">
                {isDraw ? "Pareggio" : didWin ? "Hai vinto!" : "Hai perso"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {timeDiffSeconds !== null
                  ? `Differenza finale: ${timeDiffSeconds > 0 ? "+" : ""}${timeDiffSeconds}s`
                  : "Differenza finale non disponibile"}
              </p>
            </SurfaceContent>
          </Surface>

          <div className="grid gap-4 lg:grid-cols-2">
            <Surface className="border-border">
              <SurfaceHeader>
                <SurfaceTitle className="text-base">La tua performance</SurfaceTitle>
              </SurfaceHeader>
              <SurfaceContent className="space-y-3">
                <div className="rounded-lg border border-border bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground">Tempo totale</p>
                  <p className="text-lg font-semibold text-foreground">
                    {formatDuration(challengeContext.challenger.durationSeconds)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground">Pace medio</p>
                  <p className="text-lg font-semibold text-foreground">
                    {formatPaceValue(challengeContext.challenger.pacePer100m)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground">Lap migliore</p>
                  <p className="text-lg font-semibold text-foreground">
                    {formatShortDuration(lapSummary.bestLap)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground">FC media</p>
                  <p className="text-lg font-semibold text-foreground">
                    {challengeContext.challenger.avgHeartRate ?? "—"}
                  </p>
                </div>
              </SurfaceContent>
            </Surface>

            <Surface className="border-border">
              <SurfaceHeader>
                <SurfaceTitle className="text-base">Avversario</SurfaceTitle>
              </SurfaceHeader>
              <SurfaceContent className="space-y-3">
                <div className="rounded-lg border border-border bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground">Tempo totale</p>
                  <p className="text-lg font-semibold text-foreground">
                    {formatDuration(challengeContext.opponent.durationSeconds)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground">Pace medio</p>
                  <p className="text-lg font-semibold text-foreground">
                    {formatPaceValue(challengeContext.opponent.pacePer100m)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground">Lap migliore</p>
                  <p className="text-lg font-semibold text-foreground">
                    {formatShortDuration(lapSummary.friendBestLap)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground">FC media</p>
                  <p className="text-lg font-semibold text-foreground">
                    {challengeContext.opponent.avgHeartRate ?? "—"}
                  </p>
                </div>
              </SurfaceContent>
            </Surface>
          </div>

          <Surface className="border-border">
            <SurfaceHeader>
              <SurfaceTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-primary" />
                Analisi performance
              </SurfaceTitle>
            </SurfaceHeader>
            <SurfaceContent className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                <p className="text-xs text-muted-foreground">Laps più veloci</p>
                <p className="text-lg font-semibold text-foreground">
                  {lapSummary.lapsWon}/{lapSummary.totalLaps}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                <p className="text-xs text-muted-foreground">Pace medio migliore</p>
                <p className="text-lg font-semibold text-foreground">
                  {timeDiffSeconds !== null ? `${timeDiffSeconds > 0 ? "+" : ""}${timeDiffSeconds}s` : "—"}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                <p className="text-xs text-muted-foreground">Consistenza</p>
                <p className="text-lg font-semibold text-foreground">
                  {lapSummary.consistency !== null ? `${lapSummary.consistency}%` : "—"}
                </p>
              </div>
            </SurfaceContent>
          </Surface>

          <div className="flex flex-col gap-3 md:flex-row">
            <Button className="flex-1" onClick={() => setViewMode("leaderboard")}>
              <Trophy className="mr-2 h-4 w-4" />
              Vedi classifica
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setViewMode("friends")
                setSelectedFriend(null)
                setSelectedSession(null)
                setChallengeContext(null)
              }}
            >
              Torna agli amici
            </Button>
          </div>
        </div>
      )}

      {viewMode === "leaderboard" && (
        <div className="space-y-6">
          <Surface className="border-border">
            <SurfaceHeader>
              <SurfaceTitle className="flex items-center gap-2 text-base">
                <Trophy className="h-5 w-5 text-primary" />
                Classifica Ghost Track
              </SurfaceTitle>
              <SurfaceDescription>Chi domina le sfide 1v1.</SurfaceDescription>
            </SurfaceHeader>
            <SurfaceContent className="space-y-3">
              {leaderboard.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-6 text-lg font-semibold text-foreground">
                      {entry.rank === 1 && "🥇"}
                      {entry.rank === 2 && "🥈"}
                      {entry.rank === 3 && "🥉"}
                      {entry.rank > 3 && entry.rank}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {entry.name || entry.email?.split("@")[0] || "Nuotatore"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {entry.wins}W · {entry.losses}L · {entry.winRate}%
                      </p>
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-primary">{entry.points} pts</div>
                </div>
              ))}
            </SurfaceContent>
          </Surface>
          <Button
            className="w-full"
            onClick={() => {
              setViewMode("friends")
              setSelectedFriend(null)
              setSelectedSession(null)
              setChallengeContext(null)
            }}
          >
            <Flame className="mr-2 h-4 w-4" />
            Sfida un altro amico
          </Button>
        </div>
      )}
    </div>
  )
}
