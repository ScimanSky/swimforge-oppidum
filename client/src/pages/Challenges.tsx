"use client"

import AppLayout from "@/components/AppLayout"
import { useMemo, useState } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Trophy,
  Users,
  Clock,
  Target,
  Flame,
  Medal,
  Crown,
  Plus,
  ChevronRight,
  Zap,
} from "lucide-react"
import { trpc } from "@/lib/trpc"
import { toast } from "sonner"

const formatDistance = (meters?: number | null) => {
  if (!meters) return "—"
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`
}

const formatDuration = (seconds?: number | null) => {
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

const formatDaysLeft = (endDate: string | Date) => {
  const end = new Date(endDate)
  const now = new Date()
  const diff = Math.ceil((end.getTime() - now.getTime()) / 86400000)
  if (diff <= 0) return "Scaduta"
  return `${diff}g rimanenti`
}

const getInitials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "SF"

const formatObjective = (objective: string, progressValue?: number | null) => {
  switch (objective) {
    case "total_distance":
      return formatDistance(progressValue ?? 0)
    case "total_sessions":
      return `${progressValue ?? 0} sessioni`
    case "consistency":
      return `${progressValue ?? 0} giorni`
    case "avg_pace":
      return formatPace(progressValue ?? 0)
    case "total_time":
      return formatDuration(progressValue ?? 0)
    case "longest_session":
      return formatDistance(progressValue ?? 0)
    default:
      return `${progressValue ?? 0}`
  }
}

const objectiveLabel = (objective: string) => {
  switch (objective) {
    case "total_distance":
      return "Distanza totale"
    case "total_sessions":
      return "Sessioni totali"
    case "consistency":
      return "Costanza"
    case "avg_pace":
      return "Pace medio"
    case "total_time":
      return "Tempo totale"
    case "longest_session":
      return "Sessione più lunga"
    default:
      return objective
  }
}

const getStreak = (dates: string[]) => {
  const uniqueDates = Array.from(new Set(dates)).sort()
  if (!uniqueDates.length) return 0
  const dateSet = new Set(uniqueDates)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let streak = 0
  let cursor = new Date(today)
  while (dateSet.has(cursor.toISOString().split("T")[0])) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export default function Challenges() {
  const [activeTab, setActiveTab] = useState("active")
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createDraft, setCreateDraft] = useState({
    name: "",
    description: "",
    type: "pool",
    objective: "total_distance",
    duration: "1_week",
    startDate: new Date().toISOString().split("T")[0],
  })

  const profileQuery = trpc.profile.get.useQuery()
  const activitiesQuery = trpc.activities.list.useQuery({ limit: 200, offset: 0, source: "all" })
  const badgesQuery = trpc.badges.userBadges.useQuery()
  const challengesQuery = trpc.challenges.list.useQuery()
  const createChallenge = trpc.challenges.create.useMutation({
    onSuccess: () => {
      toast.success("Sfida creata!")
      setIsCreateOpen(false)
      setCreateDraft((prev) => ({ ...prev, name: "", description: "" }))
      challengesQuery.refetch()
    },
    onError: (err) => toast.error(err.message || "Impossibile creare la sfida"),
  })
  const leaderboardQuery = trpc.leaderboard.get.useQuery({
    orderBy: "totalXp",
    period: "week",
    limit: 5,
  })

  const joinChallenge = trpc.challenges.join.useMutation({
    onSuccess: () => challengesQuery.refetch(),
  })
  const leaveChallenge = trpc.challenges.leave.useMutation({
    onSuccess: () => challengesQuery.refetch(),
  })

  const challenges = useMemo(() => (challengesQuery.data ?? []) as any[], [challengesQuery.data])
  const activeChallenges = challenges.filter(
    (challenge) => challenge.status === "active" && challenge.isParticipant
  )
  const pendingChallenges = challenges.filter(
    (challenge) => challenge.status === "pending" && challenge.isParticipant
  )
  const availableChallenges = challenges.filter(
    (challenge) => challenge.status === "pending" && !challenge.isParticipant
  )

  const streak = useMemo(() => {
    const dates = (activitiesQuery.data ?? [])
      .map((activity) => new Date(activity.activityDate).toISOString().split("T")[0])
      .filter(Boolean)
    return getStreak(dates)
  }, [activitiesQuery.data])

  const badgeCount = badgesQuery.data?.length ?? 0
  const totalXp = profileQuery.data?.totalXp ?? 0

  const leaderboard = useMemo(() => (leaderboardQuery.data ?? []) as any[], [leaderboardQuery.data])

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Challenges</h1>
            <p className="text-muted-foreground">Compete, earn badges, and climb the leaderboard</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Crea sfida
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Crea sfida</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Nome sfida</label>
                  <input
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    value={createDraft.name}
                    onChange={(event) =>
                      setCreateDraft((prev) => ({ ...prev, name: event.target.value }))
                    }
                    placeholder="Es. Settimana sprint"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Descrizione</label>
                  <textarea
                    className="w-full min-h-[90px] rounded-md border border-border bg-background px-3 py-2 text-sm"
                    value={createDraft.description}
                    onChange={(event) =>
                      setCreateDraft((prev) => ({ ...prev, description: event.target.value }))
                    }
                    placeholder="Descrivi l'obiettivo della sfida"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Tipo</label>
                    <Select
                      value={createDraft.type}
                      onValueChange={(value) =>
                        setCreateDraft((prev) => ({ ...prev, type: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pool">Piscina</SelectItem>
                        <SelectItem value="open_water">Open water</SelectItem>
                        <SelectItem value="both">Entrambi</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Obiettivo</label>
                    <Select
                      value={createDraft.objective}
                      onValueChange={(value) =>
                        setCreateDraft((prev) => ({ ...prev, objective: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Obiettivo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="total_distance">Distanza totale</SelectItem>
                        <SelectItem value="total_sessions">Numero sessioni</SelectItem>
                        <SelectItem value="consistency">Costanza</SelectItem>
                        <SelectItem value="avg_pace">Pace medio</SelectItem>
                        <SelectItem value="total_time">Tempo totale</SelectItem>
                        <SelectItem value="longest_session">Sessione piu lunga</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Durata</label>
                    <Select
                      value={createDraft.duration}
                      onValueChange={(value) =>
                        setCreateDraft((prev) => ({ ...prev, duration: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Durata" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3_days">3 giorni</SelectItem>
                        <SelectItem value="1_week">1 settimana</SelectItem>
                        <SelectItem value="2_weeks">2 settimane</SelectItem>
                        <SelectItem value="1_month">1 mese</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Inizio</label>
                    <input
                      type="date"
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      value={createDraft.startDate}
                      onChange={(event) =>
                        setCreateDraft((prev) => ({ ...prev, startDate: event.target.value }))
                      }
                    />
                  </div>
                </div>
                <Button
                  onClick={() =>
                    createChallenge.mutate({
                      name: createDraft.name.trim() || "Nuova sfida",
                      description: createDraft.description.trim() || undefined,
                      type: createDraft.type as "pool" | "open_water" | "both",
                      objective: createDraft.objective as
                        | "total_distance"
                        | "total_sessions"
                        | "consistency"
                        | "avg_pace"
                        | "total_time"
                        | "longest_session",
                      duration: createDraft.duration as
                        | "3_days"
                        | "1_week"
                        | "2_weeks"
                        | "1_month",
                      startDate: createDraft.startDate || new Date().toISOString(),
                    })
                  }
                  disabled={createChallenge.isPending}
                >
                  {createChallenge.isPending ? "Creazione..." : "Crea sfida"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Trophy className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-display font-bold text-foreground">
                    {activeChallenges.length + pendingChallenges.length}
                  </p>
                  <p className="text-xs text-muted-foreground">Active Challenges</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-accent/10">
                  <Medal className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="text-2xl font-display font-bold text-foreground">{badgeCount}</p>
                  <p className="text-xs text-muted-foreground">Badges Earned</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-chart-4/10">
                  <Flame className="w-5 h-5 text-chart-4" />
                </div>
                <div>
                  <p className="text-2xl font-display font-bold text-foreground">{streak}</p>
                  <p className="text-xs text-muted-foreground">Day Streak</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-chart-5/10">
                  <Zap className="w-5 h-5 text-chart-5" />
                </div>
                <div>
                  <p className="text-2xl font-display font-bold text-foreground">{totalXp}</p>
                  <p className="text-xs text-muted-foreground">Total XP</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-secondary">
            <TabsTrigger value="active">Active ({activeChallenges.length + pendingChallenges.length})</TabsTrigger>
            <TabsTrigger value="available">Available</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
            <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-6 space-y-4">
            {[...activeChallenges, ...pendingChallenges].length === 0 && (
              <Card className="bg-card border-border">
                <CardContent className="p-6 text-muted-foreground">
                  Nessuna sfida attiva. Esplora le nuove sfide disponibili!
                </CardContent>
              </Card>
            )}
            {[...activeChallenges, ...pendingChallenges].map((challenge) => {
              const leaderboard = (challenge.leaderboard ?? []) as Array<{ progress: number }>
              const maxProgress = leaderboard.reduce((max, item) => Math.max(max, item.progress || 0), 0)
              const progressValue = challenge.current_progress ?? 0
              const progressPercent = maxProgress > 0 ? Math.min(100, (progressValue / maxProgress) * 100) : 0

              return (
                <Card key={challenge.id} className="bg-card border-border overflow-hidden">
                  <div className="flex flex-col md:flex-row">
                    <div className="relative w-full md:w-48 h-32 md:h-auto">
                      <Image
                        src={challenge.badge_image_url || "/images/pool-lanes.jpg"}
                        alt={challenge.name}
                        fill
                        className="object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent to-card md:bg-gradient-to-t md:from-transparent md:to-card/50" />
                    </div>
                    <CardContent className="flex-1 p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="text-lg font-display font-bold text-foreground">
                            {challenge.name}
                          </h3>
                          <p className="text-sm text-muted-foreground">{challenge.description || ""}</p>
                        </div>
                        <Badge
                          variant="outline"
                          className="border-primary/30 text-primary"
                        >
                          {challenge.status === "pending" ? "In arrivo" : "Attiva"}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                        <div className="flex items-center gap-2">
                          <Target className="w-4 h-4 text-primary" />
                          <span className="text-muted-foreground">{objectiveLabel(challenge.objective)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-primary" />
                          <span className="text-muted-foreground">
                            {challenge.participantCount} partecipanti
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-primary" />
                          <span className="text-muted-foreground">
                            {formatDaysLeft(challenge.end_date)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Trophy className="w-4 h-4 text-primary" />
                          <span className="text-muted-foreground">
                            {challenge.prize_description || "Badge esclusivo"}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Your Progress</span>
                          <span className="text-foreground font-medium">
                            {formatObjective(challenge.objective, progressValue)}
                          </span>
                        </div>
                        <Progress value={progressPercent} className="h-2" />
                      </div>

                      <div className="flex flex-wrap gap-2 mt-4">
                        <Button variant="outline" size="sm" className="gap-2">
                          View Details
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground"
                          onClick={() => leaveChallenge.mutate({ challengeId: challenge.id })}
                        >
                          Leave
                        </Button>
                      </div>
                    </CardContent>
                  </div>
                </Card>
              )
            })}
          </TabsContent>

          <TabsContent value="available" className="mt-6 space-y-4">
            {availableChallenges.length === 0 && (
              <Card className="bg-card border-border">
                <CardContent className="p-6 text-muted-foreground">
                  Nessuna sfida disponibile al momento.
                </CardContent>
              </Card>
            )}
            {availableChallenges.map((challenge) => (
              <Card key={challenge.id} className="bg-card border-border">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-display font-bold text-foreground">
                        {challenge.name}
                      </h3>
                      <p className="text-sm text-muted-foreground">{challenge.description || ""}</p>
                      <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                        <Users className="w-4 h-4" />
                        {challenge.participantCount} partecipanti
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant="secondary">{objectiveLabel(challenge.objective)}</Badge>
                      <Button
                        size="sm"
                        onClick={() => joinChallenge.mutate({ challengeId: challenge.id })}
                      >
                        Join
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="completed" className="mt-6">
            <Card className="bg-card border-border">
              <CardContent className="p-6 text-muted-foreground">
                Nessuna sfida completata al momento.
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="leaderboard" className="mt-6">
            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="space-y-4">
                  {leaderboard.length === 0 && (
                    <div className="text-muted-foreground">Nessuna classifica disponibile.</div>
                  )}
                  {leaderboard.map((entry, index) => {
                    const profile = entry.profile ?? entry
                    const name = entry.name ?? profile.name ?? "Nuotatore"
                    return (
                      <div
                        key={entry.userId ?? entry.id ?? index}
                        className="flex items-center gap-4 p-3 rounded-lg bg-secondary/30"
                      >
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          {index === 0 ? (
                            <Crown className="w-4 h-4 text-primary" />
                          ) : (
                            <span className="text-sm font-bold text-foreground">{index + 1}</span>
                          )}
                        </div>
                        <Avatar className="w-10 h-10">
                          <AvatarImage src={profile.profileImage || "/placeholder.svg"} alt={name} />
                          <AvatarFallback>{getInitials(name)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <h4 className="font-medium text-foreground">{name}</h4>
                          <p className="text-xs text-muted-foreground">
                            {formatDistance(profile.totalDistanceMeters || 0)}
                          </p>
                        </div>
                        <Badge className="bg-accent/20 text-accent">{profile.totalXp} XP</Badge>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  )
}
