"use client"

import AppLayout from "@/components/AppLayout"
import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Surface, SurfaceContent } from "@/components/ui/surface"
import { Badge } from "@/components/ui/badge"
import { MetricOrb } from "@/components/metrics/MetricOrb"
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
  Crown,
  Medal,
  Plus,
  ChevronRight,
  Zap,
  Sparkles,
} from "lucide-react"
import { Link } from "wouter"
import { trpc } from "@/lib/trpc"
import { toast } from "sonner"
import GhostTrackTab from "@/components/ghost-track/GhostTrackTab"

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

type ChallengeType = "open_water" | "pool" | "both"
type ChallengeObjective =
  | "total_sessions"
  | "consistency"
  | "total_distance"
  | "avg_pace"
  | "total_time"
  | "longest_session"
type ChallengeDuration = "3_days" | "1_week" | "2_weeks" | "1_month"

type ChallengeCreateDraft = {
  name: string
  description: string
  type: ChallengeType
  objective: ChallengeObjective
  duration: ChallengeDuration
  startDate: string
}

export default function Challenges() {
  const [sectionTab, setSectionTab] = useState("ghost")
  const [activeTab, setActiveTab] = useState("active")
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isDesktopWide, setIsDesktopWide] = useState(false)
  const [activePage, setActivePage] = useState(1)
  const [availablePage, setAvailablePage] = useState(1)
  const [leaderboardPage, setLeaderboardPage] = useState(1)
  const [createDraft, setCreateDraft] = useState<ChallengeCreateDraft>({
    name: "",
    description: "",
    type: "pool",
    objective: "total_distance",
    duration: "1_week",
    startDate: new Date().toISOString().split("T")[0],
  })

  const profileQuery = trpc.profile.get.useQuery()
  const seasonQuery = trpc.season.getCurrent.useQuery(undefined, {
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  })
  const activitiesQuery = trpc.activities.list.useQuery({ limit: 100, offset: 0, source: "all" })
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
  const leaderboardQuery = trpc.leaderboard.get.useQuery(
    {
      orderBy: "totalXp",
      period: "week",
      limit: 5,
    },
    {
      staleTime: 15_000,
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
      refetchOnMount: "always",
    }
  )

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
    // Allow joining both pending (not started) and active (already running) challenges.
    (challenge) =>
      (challenge.status === "pending" || challenge.status === "active") &&
      !challenge.isParticipant
  )
  const participatingChallenges = [...activeChallenges, ...pendingChallenges]
  useEffect(() => {
    if (typeof window === "undefined") return
    const media = window.matchMedia("(min-width: 1280px)")
    const sync = () => setIsDesktopWide(media.matches)
    sync()
    media.addEventListener("change", sync)
    return () => media.removeEventListener("change", sync)
  }, [])

  const activePageSize = isDesktopWide ? 1 : 2
  const availablePageSize = isDesktopWide ? 2 : 3
  const leaderboardPageSize = isDesktopWide ? 3 : 4
  const activeTotalPages = Math.max(1, Math.ceil(participatingChallenges.length / activePageSize))
  const availableTotalPages = Math.max(1, Math.ceil(availableChallenges.length / availablePageSize))
  const leaderboard = useMemo(() => (leaderboardQuery.data ?? []) as any[], [leaderboardQuery.data])
  const leaderboardTotalPages = Math.max(1, Math.ceil(leaderboard.length / leaderboardPageSize))
  const pagedParticipatingChallenges = useMemo(() => {
    const start = (activePage - 1) * activePageSize
    return participatingChallenges.slice(start, start + activePageSize)
  }, [participatingChallenges, activePage])
  const pagedAvailableChallenges = useMemo(() => {
    const start = (availablePage - 1) * availablePageSize
    return availableChallenges.slice(start, start + availablePageSize)
  }, [availableChallenges, availablePage])
  const pagedLeaderboard = useMemo(() => {
    const start = (leaderboardPage - 1) * leaderboardPageSize
    return leaderboard.slice(start, start + leaderboardPageSize)
  }, [leaderboard, leaderboardPage])

  const streak = useMemo(() => {
    const dates = (activitiesQuery.data ?? [])
      .map((activity) => new Date(activity.activityDate).toISOString().split("T")[0])
      .filter(Boolean)
    return getStreak(dates)
  }, [activitiesQuery.data])

  const badgeCount = badgesQuery.data?.length ?? 0
  const totalXp = profileQuery.data?.totalXp ?? 0
  const challengeOrbs = useMemo(
    () => [
      {
        label: "Le tue sfide",
        value: activeChallenges.length + pendingChallenges.length,
        progress: Math.min(100, Math.round(((activeChallenges.length + pendingChallenges.length) / 8) * 100)),
        helper: "Attive + pending",
        icon: <Trophy className="size-4" />,
        tone: "cyan" as const,
      },
      {
        label: "Badge sbloccati",
        value: badgeCount,
        progress: Math.min(100, Math.round((badgeCount / 40) * 100)),
        helper: "Progressione",
        icon: <Medal className="size-4" />,
        tone: "lime" as const,
      },
      {
        label: "Streak",
        value: `${streak}g`,
        progress: Math.min(100, Math.round((streak / 21) * 100)),
        helper: "Giorni consecutivi",
        icon: <Flame className="size-4" />,
        tone: "amber" as const,
      },
      {
        label: "XP totale",
        value: totalXp.toLocaleString(),
        progress:
          profileQuery.data?.nextLevelXp && profileQuery.data.nextLevelXp > 0
            ? Math.min(100, Math.round((totalXp / profileQuery.data.nextLevelXp) * 100))
            : Math.min(100, Math.round((totalXp / 6000) * 100)),
        helper: "Livello corrente",
        icon: <Zap className="size-4" />,
        tone: "sky" as const,
      },
    ],
    [activeChallenges.length, pendingChallenges.length, badgeCount, streak, totalXp, profileQuery.data?.nextLevelXp]
  )

  return (
    <AppLayout>
      <div className="compact-shell space-y-4 lg:space-y-2">
        {/* Hero */}
        <Surface className="relative overflow-hidden">
          <div className="absolute inset-0">
            <div className="absolute inset-0 bg-[radial-gradient(70%_80%_at_20%_0%,color-mix(in_oklch,var(--electric-cyan)_38%,transparent)_0%,transparent_70%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(60%_70%_at_85%_10%,color-mix(in_oklch,var(--electric-lime)_26%,transparent)_0%,transparent_66%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(60%_70%_at_60%_90%,color-mix(in_oklch,var(--electric-cyan)_16%,transparent)_0%,transparent_72%)]" />
          </div>
          <SurfaceContent className="relative p-4 lg:p-5">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-xl border border-border/80 bg-background/60 px-3 py-1 text-xs text-muted-foreground">
                  <Sparkles className="size-4 text-primary" />
                  Stagione in corso
                </div>
                <h1 className="mt-3 text-3xl font-display font-bold neon-gradient-text">Sfide</h1>
                <p className="mt-1 text-muted-foreground">
                  Ghost Track e sfide classiche nello stesso hub. Scegli il tuo campo gara.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    Season Lv {seasonQuery.data?.progress?.currentLevel ?? 1}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {Number(seasonQuery.data?.progress?.seasonXp ?? 0).toLocaleString()} XP
                  </Badge>
                </div>
              </div>
              <div className="grid w-full max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4">
                {challengeOrbs.map((item) => (
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
            </div>
          </SurfaceContent>
        </Surface>

        <Tabs value={sectionTab} onValueChange={setSectionTab} className="space-y-4 lg:space-y-2">
          <TabsList className="w-full sm:w-fit">
            <TabsTrigger value="ghost">Ghost Track</TabsTrigger>
            <TabsTrigger value="classic">Sfide classiche</TabsTrigger>
          </TabsList>

          <TabsContent value="ghost">
            <GhostTrackTab />
          </TabsContent>

          <TabsContent value="classic" className="space-y-4 lg:space-y-2">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-display font-bold text-foreground">Sfide classiche</h2>
                <p className="text-muted-foreground">Competi con obiettivi condivisi.</p>
              </div>
              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild>
                  <Button variant="neon" className="gap-2">
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
	                            setCreateDraft((prev) => ({ ...prev, type: value as ChallengeType }))
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
	                            setCreateDraft((prev) => ({ ...prev, objective: value as ChallengeObjective }))
	                          }
	                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Obiettivo" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="total_distance">Distanza totale</SelectItem>
                            <SelectItem value="total_sessions">Sessioni totali</SelectItem>
                            <SelectItem value="consistency">Costanza</SelectItem>
                            <SelectItem value="avg_pace">Pace medio</SelectItem>
                            <SelectItem value="total_time">Tempo totale</SelectItem>
                            <SelectItem value="longest_session">Sessione più lunga</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Durata</label>
	                        <Select
	                          value={createDraft.duration}
	                          onValueChange={(value) =>
	                            setCreateDraft((prev) => ({ ...prev, duration: value as ChallengeDuration }))
	                          }
	                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Durata" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1_week">1 settimana</SelectItem>
                            <SelectItem value="2_weeks">2 settimane</SelectItem>
                            <SelectItem value="1_month">1 mese</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Data inizio</label>
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
                      variant="neon"
                      className="w-full"
                      onClick={() => createChallenge.mutate(createDraft)}
                      disabled={!createDraft.name.trim()}
                    >
                      Crea sfida
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <Tabs
              value={activeTab}
              onValueChange={(value) => {
                setActiveTab(value)
                if (value === "active") setActivePage(1)
                if (value === "available") setAvailablePage(1)
                if (value === "leaderboard") setLeaderboardPage(1)
              }}
            >
              <TabsList className="w-full sm:w-fit">
                <TabsTrigger value="active">
                  Active ({activeChallenges.length + pendingChallenges.length})
                </TabsTrigger>
                <TabsTrigger value="available">Available</TabsTrigger>
                <TabsTrigger value="completed">Completed</TabsTrigger>
                <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
              </TabsList>

              <TabsContent value="active" className="mt-3 space-y-3">
                {participatingChallenges.length === 0 && (
                  <Surface className="bg-card border-border">
                    <SurfaceContent className="p-6 text-muted-foreground">
                      Nessuna sfida attiva. Esplora le nuove sfide disponibili!
                    </SurfaceContent>
                  </Surface>
                )}
                {pagedParticipatingChallenges.map((challenge) => {
                  const leaderboard = (challenge.leaderboard ?? []) as Array<{ progress: number }>
                  const maxProgress = leaderboard.reduce(
                    (max, item) => Math.max(max, item.progress || 0),
                    0
                  )
                  const progressValue = challenge.current_progress ?? 0
                  const progressPercent =
                    maxProgress > 0 ? Math.min(100, (progressValue / maxProgress) * 100) : 0

                  return (
                    <Surface key={challenge.id} className="bg-card border-border overflow-hidden">
                      <div className="flex flex-col md:flex-row">
                        <div className="relative h-32 w-full md:h-auto md:w-48">
                          {challenge.badge_image_url ? (
                            <Image
                              src={challenge.badge_image_url}
                              alt={challenge.name}
                              fill
                              className="object-cover"
                            />
                          ) : (
                            <div className="h-full w-full bg-[linear-gradient(135deg,#132230_0%,#1b2e3c_56%,#142432_100%)]" />
                          )}
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-card md:bg-gradient-to-t md:from-transparent md:to-card/50" />
                        </div>
                        <SurfaceContent className="flex-1 p-4">
                          <div className="mb-3 flex items-start justify-between">
                            <div>
                              <h3 className="text-lg font-display font-bold text-foreground">
                                {challenge.name}
                              </h3>
                              <p className="text-sm text-muted-foreground">
                                {challenge.description || ""}
                              </p>
                            </div>
                            <Badge variant="outline" className="border-primary/30 text-primary">
                              {challenge.status === "pending" ? "In arrivo" : "Attiva"}
                            </Badge>
                          </div>

                          <div className="mb-4 grid grid-cols-2 gap-4 text-sm">
                            <div className="flex items-center gap-2">
                              <Target className="h-4 w-4 text-primary" />
                              <span className="text-muted-foreground">
                                {objectiveLabel(challenge.objective)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-primary" />
                              <span className="text-muted-foreground">
                                {challenge.participantCount} partecipanti
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-primary" />
                              <span className="text-muted-foreground">
                                {formatDaysLeft(challenge.end_date)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Trophy className="h-4 w-4 text-primary" />
                              <span className="text-muted-foreground">
                                {challenge.prize_description || "Badge esclusivo"}
                              </span>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Your Progress</span>
                              <span className="font-medium text-foreground">
                                {formatObjective(challenge.objective, progressValue)}
                              </span>
                            </div>
                            <Progress value={progressPercent} className="h-2" />
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <Button variant="outline-neon" size="sm" className="gap-2" asChild>
                              <Link href={`/season/challenges/${challenge.id}`}>
                                Dettagli
                                <ChevronRight className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button
                              variant="ghost-neon"
                              size="sm"
                              onClick={() => leaveChallenge.mutate({ challengeId: challenge.id })}
                            >
                              Leave
                            </Button>
                          </div>
                        </SurfaceContent>
                      </div>
                    </Surface>
                  )
                })}
                {participatingChallenges.length > activePageSize && (
                  <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card/40 px-3 py-2">
                    <p className="text-xs text-muted-foreground">Pagina {activePage} di {activeTotalPages}</p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline-neon"
                        onClick={() => setActivePage((prev) => Math.max(1, prev - 1))}
                        disabled={activePage === 1}
                      >
                        Indietro
                      </Button>
                      <Button
                        size="sm"
                        variant="outline-neon"
                        onClick={() => setActivePage((prev) => Math.min(activeTotalPages, prev + 1))}
                        disabled={activePage === activeTotalPages}
                      >
                        Avanti
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="available" className="mt-3 space-y-3">
                {availableChallenges.length === 0 && (
                  <Surface className="bg-card border-border">
                    <SurfaceContent className="p-6 text-muted-foreground">
                      Nessuna sfida disponibile al momento.
                    </SurfaceContent>
                  </Surface>
                )}
                {pagedAvailableChallenges.map((challenge) => (
                  <Surface key={challenge.id} className="bg-card border-border">
                    <SurfaceContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-display font-bold text-foreground">
                            {challenge.name}
                          </h3>
                          <p className="text-sm text-muted-foreground">{challenge.description || ""}</p>
                          <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                            <Users className="h-4 w-4" />
                            {challenge.participantCount} partecipanti
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Badge variant="secondary">{objectiveLabel(challenge.objective)}</Badge>
                          <Button
                            variant="neon"
                            size="sm"
                            onClick={() => joinChallenge.mutate({ challengeId: challenge.id })}
                          >
                            Join
                          </Button>
                        </div>
                      </div>
                    </SurfaceContent>
                  </Surface>
                ))}
                {availableChallenges.length > availablePageSize && (
                  <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card/40 px-3 py-2">
                    <p className="text-xs text-muted-foreground">Pagina {availablePage} di {availableTotalPages}</p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline-neon"
                        onClick={() => setAvailablePage((prev) => Math.max(1, prev - 1))}
                        disabled={availablePage === 1}
                      >
                        Indietro
                      </Button>
                      <Button
                        size="sm"
                        variant="outline-neon"
                        onClick={() => setAvailablePage((prev) => Math.min(availableTotalPages, prev + 1))}
                        disabled={availablePage === availableTotalPages}
                      >
                        Avanti
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="completed" className="mt-3">
                <Surface className="bg-card border-border">
                  <SurfaceContent className="p-6 text-muted-foreground">
                    Nessuna sfida completata al momento.
                  </SurfaceContent>
                </Surface>
              </TabsContent>

              <TabsContent value="leaderboard" className="mt-3">
                <Surface className="bg-card border-border">
                  <SurfaceContent className="p-4">
                    <div className="space-y-4">
                      {leaderboard.length === 0 && (
                        <div className="text-muted-foreground">
                          Nessuna classifica disponibile.
                        </div>
                      )}
                      {pagedLeaderboard.map((entry, index) => {
                        const absoluteIndex = (leaderboardPage - 1) * leaderboardPageSize + index
                        const profile = entry.profile ?? entry
                        const name = entry.name ?? profile.name ?? "Nuotatore"
                        const rawUserId = profile.userId ?? entry.userId
                        const userId = Number(rawUserId)
                        const hasProfileLink = Number.isFinite(userId) && userId > 0

                        const rowContent = (
                          <>
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                              {absoluteIndex === 0 ? (
                                <Crown className="h-4 w-4 text-primary" />
                              ) : (
                                <span className="text-sm font-bold text-foreground">
                                  {absoluteIndex + 1}
                                </span>
                              )}
                            </div>
                            <Avatar className="h-10 w-10">
                              <AvatarImage
                                src={profile.profileImage || "/placeholder.svg"}
                                alt={name}
                              />
                              <AvatarFallback>{getInitials(name)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                              <h4 className="font-medium text-foreground">{name}</h4>
                              <p className="text-xs text-muted-foreground">
                                {formatDistance(profile.totalDistanceMeters || 0)}
                              </p>
                            </div>
                            <Badge className="bg-accent/20 text-accent">{profile.totalXp} XP</Badge>
                          </>
                        )

                        return hasProfileLink ? (
                          <Link
                            key={entry.userId ?? entry.id ?? index}
                            href={`/u/${userId}`}
                            className="flex items-center gap-4 rounded-lg bg-secondary/30 p-3 transition-colors hover:bg-secondary/45"
                          >
                            {rowContent}
                          </Link>
                        ) : (
                          <div
                            key={entry.userId ?? entry.id ?? index}
                            className="flex items-center gap-4 rounded-lg bg-secondary/30 p-3"
                          >
                            {rowContent}
                          </div>
                        )
                      })}
                      {leaderboard.length > leaderboardPageSize && (
                        <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card/40 px-3 py-2">
                          <p className="text-xs text-muted-foreground">
                            Pagina {leaderboardPage} di {leaderboardTotalPages}
                          </p>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline-neon"
                              onClick={() => setLeaderboardPage((prev) => Math.max(1, prev - 1))}
                              disabled={leaderboardPage === 1}
                            >
                              Indietro
                            </Button>
                            <Button
                              size="sm"
                              variant="outline-neon"
                              onClick={() => setLeaderboardPage((prev) => Math.min(leaderboardTotalPages, prev + 1))}
                              disabled={leaderboardPage === leaderboardTotalPages}
                            >
                              Avanti
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </SurfaceContent>
                </Surface>
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  )
}
