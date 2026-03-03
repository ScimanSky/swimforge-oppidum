"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import AppLayout from "@/components/AppLayout"
import { trpc } from "@/lib/trpc"
import { Surface, SurfaceContent } from "@/components/ui/surface"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { MetricOrb } from "@/components/metrics/MetricOrb"
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Flame,
  Sparkles,
  Target,
  Trophy,
  Users,
} from "lucide-react"
import { Link } from "wouter"
import { useLocation } from "wouter"
import { toast } from "sonner"
import { getSeasonAssignmentImageUrl } from "@/lib/seasonBadgeImages"
import { SeasonRecapDialog } from "@/components/video/SeasonRecapDialog"
import { UI_FEATURE_FLAGS } from "@/lib/feature-flags"

type PredictionPreset = {
  id: string
  label: string
  distance: number
  pace: number
  durationMin: number
  rpe: number
}

const PREDICTION_PRESETS: PredictionPreset[] = [
  { id: "light", label: "Leggero", distance: 1200, pace: 130, durationMin: 30, rpe: 4 },
  { id: "tempo", label: "Tempo", distance: 2000, pace: 112, durationMin: 42, rpe: 6 },
  { id: "intense", label: "Intenso", distance: 2800, pace: 98, durationMin: 55, rpe: 8 },
]

function formatRemaining(remainingMs: number) {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000))
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  return `${days}g ${hours}h`
}

function formatUtcCountdownToNextDay() {
  const now = new Date()
  const nextUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0)
  const remainingMs = Math.max(0, nextUtc - now.getTime())
  const hours = Math.floor(remainingMs / (1000 * 60 * 60))
  const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60))
  return `${hours}h ${minutes}m`
}

function formatUtcCountdownToNextWeek() {
  const now = new Date()
  const currentStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0))
  const utcWeekday = currentStart.getUTCDay() // 0 Sunday
  const diffFromMonday = (utcWeekday + 6) % 7
  currentStart.setUTCDate(currentStart.getUTCDate() - diffFromMonday)
  const nextWeekStart = new Date(currentStart.getTime() + 7 * 24 * 60 * 60 * 1000)
  const remainingMs = Math.max(0, nextWeekStart.getTime() - now.getTime())
  const days = Math.floor(remainingMs / (1000 * 60 * 60 * 24))
  const hours = Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  return `${days}g ${hours}h`
}

function toOptionalNumber(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

function formatPaceSeconds(pacePer100m: number | null | undefined) {
  if (!pacePer100m || pacePer100m <= 0) return "—"
  const minutes = Math.floor(pacePer100m / 60)
  const seconds = Math.round(pacePer100m % 60)
  return `${minutes}:${String(seconds).padStart(2, "0")}/100m`
}

export default function SeasonPage() {
  const utils = trpc.useUtils()
  const [, setLocation] = useLocation()
  const seasonViewTrackedRef = useRef(false)
  const seasonStepViewTrackedRef = useRef<Set<string>>(new Set())
  const trackEventMutation = trpc.community.analytics.track.useMutation()
  const seasonQuery = trpc.season.getCurrent.useQuery(undefined, {
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })
  const leaderboardQuery = trpc.season.getLeaderboard.useQuery(
    { limit: 20 },
    {
      staleTime: 30_000,
      refetchInterval: 60_000,
      refetchOnWindowFocus: true,
    }
  )
  const myRankQuery = trpc.season.getMyRank.useQuery(undefined, {
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })
  const engagementQuery = trpc.season.getEngagement.useQuery(undefined, {
    staleTime: 20_000,
    refetchInterval: 45_000,
    refetchOnWindowFocus: true,
  })

  const [predictionForm, setPredictionForm] = useState({
    targetDistanceMeters: "",
    targetPacePer100m: "",
    targetDurationMinutes: "",
    targetRpe: "",
    note: "",
  })

  const createPredictionMutation = trpc.season.predictions.create.useMutation({
    onSuccess: async () => {
      toast.success("Previsione registrata. Dopo la prossima attività puoi valutarla.")
      setPredictionForm({
        targetDistanceMeters: "",
        targetPacePer100m: "",
        targetDurationMinutes: "",
        targetRpe: "",
        note: "",
      })
      await Promise.all([
        utils.season.getEngagement.invalidate(),
        utils.season.predictions.list.invalidate(),
      ])
    },
    onError: (error) => {
      toast.error(error.message || "Impossibile creare la previsione")
    },
  })

  const evaluatePredictionMutation = trpc.season.predictions.evaluateLatest.useMutation({
    onSuccess: async (result) => {
      if (result.status === "no_pending") {
        toast.info("Nessuna previsione in attesa da valutare.")
        return
      }
      if (result.status === "no_matching_activity") {
        toast.info("Nessuna attività disponibile dopo la previsione.")
        return
      }
      toast.success(`Previsione valutata: ${result.score}/100 · +${result.xpAwarded} XP`)
      await Promise.all([
        utils.season.getEngagement.invalidate(),
        utils.season.getCurrent.invalidate(),
        utils.season.getLeaderboard.invalidate(),
        utils.season.getMyRank.invalidate(),
        utils.profile.get.invalidate(),
      ])
    },
    onError: (error) => {
      toast.error(error.message || "Valutazione previsione non riuscita")
    },
  })

  const claimClubQuestMutation = trpc.season.clubQuest.claim.useMutation({
    onSuccess: async (result) => {
      if (!result.success) {
        if (result.reason === "already_claimed") {
          toast.info("Ricompensa Club Quest già riscattata.")
          return
        }
        if (result.reason === "no_contribution") {
          toast.info("Per riscattare devi contribuire con almeno un'azione nel club.")
          return
        }
        if (result.reason === "not_completed") {
          toast.info("Quest non ancora completata dal club.")
          return
        }
        toast.error("Riscatto Club Quest non riuscito.")
        return
      }
      toast.success(`Club Quest riscattata: +${result.xpAwarded} XP`)
      await Promise.all([
        utils.season.getEngagement.invalidate(),
        utils.season.getCurrent.invalidate(),
        utils.season.getMyRank.invalidate(),
        utils.profile.get.invalidate(),
        utils.leaderboard.get.invalidate(),
      ])
    },
    onError: (error) => {
      toast.error(error.message || "Errore nel riscatto Club Quest")
    },
  })

  const seasonData = seasonQuery.data
  const leaderboard = leaderboardQuery.data ?? []
  const myRank = myRankQuery.data
  const engagement = engagementQuery.data
  const actionXp = engagement?.actionXp
  const predictions = engagement?.predictions ?? []
  const clubQuests = engagement?.clubQuests ?? []
  const seasonPredictionsEnabled = UI_FEATURE_FLAGS.seasonPredictionsV1
  const seasonRecapEnabled = UI_FEATURE_FLAGS.seasonRecapV1
  const seasonCoreLoopV2Enabled = UI_FEATURE_FLAGS.seasonCoreLoopV2
  const pendingPredictions = useMemo(
    () => (seasonPredictionsEnabled ? predictions.filter((prediction) => prediction.status === "pending") : []),
    [predictions, seasonPredictionsEnabled],
  )

  const currentLevel = Number(seasonData?.progress?.currentLevel ?? 1)
  const seasonXp = Number(seasonData?.progress?.seasonXp ?? 0)
  const levelProgress = Number(seasonData?.progress?.levelProgressPercent ?? 0)
  const completionRate = Number(seasonData?.missions?.completionRate ?? 0)
  const completed = Number(seasonData?.missions?.completedMissions ?? 0)
  const totalMissions = Number(seasonData?.missions?.totalMissions ?? 0)

  const dailyMissions = seasonData?.missions?.daily ?? []
  const weeklyMissions = seasonData?.missions?.weekly ?? []
  const badgeAssignments = seasonData?.badgeAssignments ?? []
  const primaryClubQuest = clubQuests[0] ?? null
  const benchmarkRival = myRank?.around?.find((entry) => !entry.isMe) ?? null
  const benchmarkGapXp =
    benchmarkRival && myRank?.me
      ? Math.abs(Number(benchmarkRival.seasonXp ?? 0) - Number(myRank.me.seasonXp ?? 0))
      : null

  const firstIncompleteDaily = dailyMissions.find((mission) => !mission.completed)
  const firstIncompleteWeekly = weeklyMissions.find((mission) => !mission.completed)

  const nextAction = useMemo(() => {
    if (firstIncompleteDaily) {
      return {
        title: "Priorità oggi",
        body: `${firstIncompleteDaily.title} · +${firstIncompleteDaily.xpReward} XP`,
        helper: "Completa una missione daily prima del reset.",
        actionType: "daily" as const,
      }
    }

    if ((actionXp?.remaining ?? 0) > 0) {
      return {
        title: "Spingi Action XP",
        body: `Hai ancora ${actionXp?.remaining ?? 0} XP disponibili oggi`,
        helper: "Commento, reaction, RSVP e club post aumentano il cap giornaliero.",
        actionType: "action_xp" as const,
      }
    }

    if (seasonPredictionsEnabled && pendingPredictions.length > 0) {
      return {
        title: "Valuta la previsione",
        body: `${pendingPredictions.length} previsione in attesa`,
        helper: "Chiudi il loop pre-sessione e sblocca XP precisione.",
        actionType: "prediction" as const,
      }
    }

    if (firstIncompleteWeekly) {
      return {
        title: "Focus settimanale",
        body: `${firstIncompleteWeekly.title} · +${firstIncompleteWeekly.xpReward} XP`,
        helper: "Consolida i progressi weekly per aumentare il completamento globale.",
        actionType: "weekly" as const,
      }
    }

    return {
      title: "Ottimo ritmo",
      body: "Tutte le priorità completate",
      helper: "Mantieni continuità con attività, community e club quest.",
      actionType: "explore" as const,
    }
  }, [
    actionXp?.remaining,
    firstIncompleteDaily,
    firstIncompleteWeekly,
    pendingPredictions.length,
    seasonPredictionsEnabled,
  ])

  useEffect(() => {
    if (seasonViewTrackedRef.current) return
    seasonViewTrackedRef.current = true
    trackEventMutation.mutate({
      eventName: "season_view",
      source: "season_page",
    })
  }, [trackEventMutation])

  useEffect(() => {
    if (!seasonCoreLoopV2Enabled) return
    const steps = [
      { stepId: "focus_weekly", stepType: String(nextAction.actionType) },
      { stepId: "club_contribution", stepType: primaryClubQuest ? "club_quest" : "no_club" },
      { stepId: "soft_comparison", stepType: benchmarkRival ? "benchmark" : "leaderboard" },
    ]
    for (const step of steps) {
      if (seasonStepViewTrackedRef.current.has(step.stepId)) continue
      seasonStepViewTrackedRef.current.add(step.stepId)
      trackEventMutation.mutate({
        eventName: "season_step_view",
        source: "season_v2",
        metadata: {
          stepId: step.stepId,
          stepType: step.stepType,
        },
      })
    }
  }, [benchmarkRival, nextAction.actionType, primaryClubQuest, seasonCoreLoopV2Enabled, trackEventMutation])

  const trackSeasonStepActionClick = (params: { stepId: string; stepType: string; action: string }) => {
    trackEventMutation.mutate({
      eventName: "season_step_action_click",
      source: "season_v2",
      metadata: {
        stepId: params.stepId,
        stepType: params.stepType,
        action: params.action,
      },
    })
  }

  const handleNextActionClick = (sourceCard: "legacy_today" | "season_v2_focus" = "legacy_today") => {
    trackEventMutation.mutate({
      eventName: "season_next_action_click",
      source: "season_page",
      metadata: {
        actionType: nextAction.actionType,
        sourceCard,
      },
    })

    if (nextAction.actionType === "prediction") {
      evaluatePredictionMutation.mutate({})
      return
    }
    if (nextAction.actionType === "action_xp") {
      setLocation("/home")
      return
    }
    if (nextAction.actionType === "daily" || nextAction.actionType === "weekly") {
      setLocation("/track")
      return
    }
    setLocation("/season/challenges")
  }

  const handleClubContributionAction = () => {
    const stepType = primaryClubQuest ? "club_quest" : "no_club"
    if (primaryClubQuest && primaryClubQuest.eligibleToClaim && !primaryClubQuest.claimed) {
      trackSeasonStepActionClick({
        stepId: "club_contribution",
        stepType,
        action: "claim_reward",
      })
      claimClubQuestMutation.mutate({ clubId: primaryClubQuest.clubId })
      return
    }
    trackSeasonStepActionClick({
      stepId: "club_contribution",
      stepType,
      action: "open_club",
    })
    setLocation("/home/community")
  }

  const handleSoftComparisonAction = () => {
    const stepType = benchmarkRival ? "benchmark" : "leaderboard"
    if (benchmarkRival) {
      trackSeasonStepActionClick({
        stepId: "soft_comparison",
        stepType,
        action: "open_rival_profile",
      })
      setLocation(`/u/${benchmarkRival.userId}?from=${encodeURIComponent("/season")}`)
      return
    }
    trackSeasonStepActionClick({
      stepId: "soft_comparison",
      stepType,
      action: "open_leaderboard",
    })
    setLocation("/season/leaderboard")
  }

  const handleCreatePrediction = () => {
    const targetDistanceMeters = toOptionalNumber(predictionForm.targetDistanceMeters)
    const targetPacePer100m = toOptionalNumber(predictionForm.targetPacePer100m)
    const targetDurationMinutes = toOptionalNumber(predictionForm.targetDurationMinutes)
    const targetRpe = toOptionalNumber(predictionForm.targetRpe)
    const targetDurationSeconds =
      targetDurationMinutes && targetDurationMinutes > 0
        ? Math.round(targetDurationMinutes * 60)
        : null

    if (!targetDistanceMeters && !targetPacePer100m && !targetDurationSeconds && !targetRpe) {
      toast.info("Inserisci almeno un target per creare la previsione.")
      return
    }

    createPredictionMutation.mutate({
      targetDistanceMeters,
      targetPacePer100m,
      targetDurationSeconds,
      targetRpe: targetRpe ? Math.round(targetRpe) : null,
      note: predictionForm.note.trim() || null,
    })
  }

  const applyPredictionPreset = (preset: PredictionPreset) => {
    setPredictionForm((prev) => ({
      ...prev,
      targetDistanceMeters: String(preset.distance),
      targetPacePer100m: String(preset.pace),
      targetDurationMinutes: String(preset.durationMin),
      targetRpe: String(preset.rpe),
    }))
  }

  return (
    <AppLayout>
      <div className="compact-shell space-y-4 lg:space-y-2">
        <Surface className="relative overflow-hidden">
          <SurfaceContent className="relative p-4 md:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/65 px-2.5 py-0.5 text-[10px] text-muted-foreground">
                    <Sparkles className="size-3 text-primary" />
                    Season Hub
                  </div>
                  {seasonRecapEnabled ? <SeasonRecapDialog triggerLabel="Recap video" /> : null}
                </div>
                <h1 className="font-display text-xl md:text-2xl font-bold neon-gradient-text">
                  {seasonData?.season?.name ?? "Season Electric Ice"}
                </h1>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="text-[10px]">Level {currentLevel}</Badge>
                  <Badge variant="outline" className="text-[10px]">
                    <CalendarDays className="mr-1 size-3" />
                    {formatRemaining(Number(seasonData?.season?.remainingMs ?? 0))}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">{seasonData?.missionMode === "solo-fallback" ? "Solo" : "Club"}</Badge>
                  {myRank?.me?.rank ? (
                    <Badge variant="outline" className="text-[10px]">
                      <Trophy className="mr-1 size-3" />
                      Rank #{myRank.me.rank}
                    </Badge>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <MetricOrb
                  label="Level"
                  value={String(currentLevel)}
                  progress={levelProgress}
                  helper={`${seasonXp.toLocaleString()} XP`}
                  icon={<Trophy className="size-4" />}
                  tone="cyan"
                  size="sm"
                />
                <MetricOrb
                  label="Missioni"
                  value={`${completed}/${totalMissions}`}
                  progress={completionRate}
                  helper={`${completionRate}% complete`}
                  icon={<Target className="size-4" />}
                  tone="lime"
                  size="sm"
                />
              </div>
            </div>

            <div className="mt-3 space-y-1">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Progressione livello</span>
                <span>{seasonData?.progress?.xpToNextLevel ?? 0} XP al prossimo</span>
              </div>
              <Progress value={levelProgress} className="h-1.5" />
            </div>
          </SurfaceContent>
        </Surface>

        {seasonCoreLoopV2Enabled ? (
          <section className="surface-panel p-4 lg:p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-display text-base font-semibold text-foreground">Guida settimanale (v2)</p>
              <Badge variant="outline" className="text-xs">
                Reset weekly tra {formatUtcCountdownToNextWeek()}
              </Badge>
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              <div className="stream-card border-primary/35 bg-primary/8">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">1 · Focus personale</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{nextAction.title}</p>
                    <p className="text-sm text-foreground/90">{nextAction.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{nextAction.helper}</p>
                    <Button
                      variant="outline-neon"
                      size="sm"
                      className="mt-2 h-7 px-2.5 text-[11px]"
                      onClick={() => {
                        trackSeasonStepActionClick({
                          stepId: "focus_weekly",
                          stepType: String(nextAction.actionType),
                          action: "next_action",
                        })
                        handleNextActionClick("season_v2_focus")
                      }}
                      disabled={trackEventMutation.isPending}
                    >
                      Prossima azione
                    </Button>
                  </div>
                  <Flame className="size-4 text-primary shrink-0" />
                </div>
              </div>

              <div className="stream-card">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">2 · Contributo club</p>
                {primaryClubQuest ? (
                  <>
                    <p className="mt-1 text-sm font-semibold text-foreground truncate">{primaryClubQuest.clubName}</p>
                    <p className="text-sm text-foreground/90">
                      Progresso squadra: {primaryClubQuest.completion.progressPercent}%
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Membri attivi {primaryClubQuest.progress.engagedMembers}/{primaryClubQuest.targets.engagedMembers} · RSVP {primaryClubQuest.progress.teamRsvps}/{primaryClubQuest.targets.rsvps}
                    </p>
                    <Progress value={primaryClubQuest.completion.progressPercent} className="mt-2 h-1.5" />
                    <Button
                      variant="outline-neon"
                      size="sm"
                      className="mt-2 h-7 px-2.5 text-[11px]"
                      onClick={handleClubContributionAction}
                      disabled={claimClubQuestMutation.isPending}
                    >
                      {primaryClubQuest.eligibleToClaim && !primaryClubQuest.claimed ? "Riscatta reward" : "Apri club"}
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-sm font-semibold text-foreground">Nessun club attivo</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Entra in un club per avere obiettivi cooperativi settimanali e reward condivise.
                    </p>
                    <Button
                      variant="outline-neon"
                      size="sm"
                      className="mt-2 h-7 px-2.5 text-[11px]"
                      onClick={handleClubContributionAction}
                    >
                      Esplora club
                    </Button>
                  </>
                )}
              </div>

              <div className="stream-card">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">3 · Confronto soft</p>
                {benchmarkRival && myRank?.me ? (
                  <>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      Sei #{myRank.me.rank}, vicino a #{benchmarkRival.rank}
                    </p>
                    <p className="text-sm text-foreground/90 truncate">{benchmarkRival.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Gap: {benchmarkGapXp?.toLocaleString() ?? 0} XP · confronto amichevole
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-sm font-semibold text-foreground">Classifica Season</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Apri la classifica per identificare un benchmark e tenere alta la continuità.
                    </p>
                  </>
                )}
                <Button
                  variant="outline-neon"
                  size="sm"
                  className="mt-2 h-7 px-2.5 text-[11px]"
                  onClick={handleSoftComparisonAction}
                >
                  {benchmarkRival ? "Apri benchmark" : "Apri classifica"}
                </Button>
              </div>
            </div>
          </section>
        ) : (
          <section className="surface-panel p-4 lg:p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-display text-base font-semibold text-foreground">Oggi</p>
              <Badge variant="outline" className="text-xs">
                Reset daily tra {formatUtcCountdownToNextDay()}
              </Badge>
            </div>

            <div className="stream-card border-primary/35 bg-primary/8">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{nextAction.title}</p>
                  <p className="text-sm text-foreground/90">{nextAction.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{nextAction.helper}</p>
                  <Button
                    variant="outline-neon"
                    size="sm"
                    className="mt-2 h-7 px-2.5 text-[11px]"
                    onClick={() => handleNextActionClick("legacy_today")}
                    disabled={trackEventMutation.isPending}
                  >
                    Vai all'azione
                  </Button>
                </div>
                <Flame className="size-4 text-primary shrink-0" />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="stream-card md:col-span-2">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">Missioni daily</p>
                  <Badge variant="outline" className="text-[10px]">Scadenza {formatUtcCountdownToNextDay()}</Badge>
                </div>
                <div className="space-y-2">
                  {dailyMissions.map((mission) => (
                    <div key={mission.id} className="rounded-xl border border-border/60 bg-background/40 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{mission.title}</p>
                          <p className="text-xs text-muted-foreground">{mission.description}</p>
                        </div>
                        <Badge variant={mission.completed ? "neon" : "outline"} className="text-xs shrink-0">
                          +{mission.xpReward} XP
                        </Badge>
                      </div>
                      <Progress value={Number(mission.progress ?? 0)} className="mt-2 h-1.5" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="stream-card">
                  <p className="text-xs text-muted-foreground">Action XP</p>
                  <p className="text-lg font-display font-semibold text-foreground">
                    {actionXp?.earnedToday ?? 0}/{actionXp?.cap ?? 90}
                  </p>
                  <Progress
                    value={Math.min(100, ((actionXp?.earnedToday ?? 0) / Math.max(actionXp?.cap ?? 90, 1)) * 100)}
                    className="mt-2 h-1.5"
                  />
                  <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-muted-foreground">
                    <span>Commenti: {actionXp?.byType?.comment ?? 0}</span>
                    <span>Reaction: {actionXp?.byType?.reaction ?? 0}</span>
                    <span>Splash: {actionXp?.byType?.splash ?? 0}</span>
                    <span>RSVP: {actionXp?.byType?.rsvp ?? 0}</span>
                  </div>
                </div>

                {seasonPredictionsEnabled ? (
                  <div className="stream-card">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">Previsioni</p>
                      <Button
                        variant="outline-neon"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        disabled={evaluatePredictionMutation.isPending}
                        onClick={() => evaluatePredictionMutation.mutate({})}
                      >
                        Valuta ultima
                      </Button>
                    </div>

                    <div className="mb-2 flex flex-wrap gap-1">
                      {PREDICTION_PRESETS.map((preset) => (
                        <Button
                          key={preset.id}
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => applyPredictionPreset(preset)}
                        >
                          {preset.label}
                        </Button>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-1">
                      <Input
                        type="number"
                        min={100}
                        max={50000}
                        placeholder="Distanza (m)"
                        value={predictionForm.targetDistanceMeters}
                        onChange={(e) =>
                          setPredictionForm((prev) => ({ ...prev, targetDistanceMeters: e.target.value }))
                        }
                        className="h-8 bg-background/60 text-xs"
                      />
                      <Input
                        type="number"
                        min={5}
                        max={360}
                        placeholder="Durata (min)"
                        value={predictionForm.targetDurationMinutes}
                        onChange={(e) =>
                          setPredictionForm((prev) => ({ ...prev, targetDurationMinutes: e.target.value }))
                        }
                        className="h-8 bg-background/60 text-xs"
                      />
                    </div>

                    <Input
                      className="mt-1 h-8 bg-background/60 text-xs"
                      placeholder="Nota opzionale"
                      value={predictionForm.note}
                      onChange={(e) =>
                        setPredictionForm((prev) => ({ ...prev, note: e.target.value }))
                      }
                    />

                    <Button
                      variant="neon"
                      size="sm"
                      className="mt-2 h-8 w-full text-xs"
                      disabled={createPredictionMutation.isPending}
                      onClick={handleCreatePrediction}
                    >
                      Crea previsione
                    </Button>

                    <p className="mt-2 text-[11px] text-muted-foreground">
                      In attesa: {pendingPredictions.length}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        )}

        <section className="surface-panel p-4 lg:p-5">
          <Tabs defaultValue="week" className="space-y-3">
            <TabsList className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3">
              <TabsTrigger value="week">Settimana</TabsTrigger>
              <TabsTrigger value="leaderboard">Classifica</TabsTrigger>
              <TabsTrigger value="badges">Badge</TabsTrigger>
            </TabsList>

            <TabsContent value="week" className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">Missioni weekly</p>
                <Badge variant="outline" className="text-xs">Reset weekly tra {formatUtcCountdownToNextWeek()}</Badge>
              </div>
              <div className="grid gap-2">
                {weeklyMissions.map((mission) => (
                  <div key={mission.id} className="stream-card">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{mission.title}</p>
                        <p className="text-xs text-muted-foreground">{mission.description}</p>
                      </div>
                      <Badge variant={mission.completed ? "neon" : "outline"} className="text-xs">
                        +{mission.xpReward} XP
                      </Badge>
                    </div>
                    <Progress value={Number(mission.progress ?? 0)} className="mt-2 h-1.5" />
                  </div>
                ))}
              </div>

              <div className="pt-1">
                <p className="mb-2 text-sm font-semibold text-foreground">Club quest</p>
                {clubQuests.length ? (
                  <div className="grid gap-2">
                    {clubQuests.map((quest) => (
                      <div key={quest.clubId} className="stream-card">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-foreground truncate">{quest.clubName}</p>
                          <Badge variant={quest.completion.completed ? "neon" : "outline"} className="text-[10px]">
                            {quest.completion.progressPercent}%
                          </Badge>
                        </div>
                        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                          <div className="flex items-center justify-between">
                            <span className="inline-flex items-center gap-1">
                              <Users className="size-3.5" />
                              Membri attivi
                            </span>
                            <span>{quest.progress.engagedMembers}/{quest.targets.engagedMembers}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="inline-flex items-center gap-1">
                              <CalendarDays className="size-3.5" />
                              RSVP team
                            </span>
                            <span>{quest.progress.teamRsvps}/{quest.targets.rsvps}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="inline-flex items-center gap-1">
                              <Activity className="size-3.5" />
                              Interazioni
                            </span>
                            <span>{quest.progress.teamInteractions}/{quest.targets.interactions}</span>
                          </div>
                        </div>
                        <Progress value={quest.completion.progressPercent} className="mt-2 h-1.5" />
                        <div className="mt-2 flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">Reward: +{quest.xpReward} XP</p>
                          {quest.claimed ? (
                            <Badge variant="neon" className="text-[10px]">
                              <CheckCircle2 className="mr-1 size-3" />
                              Riscattata
                            </Badge>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline-neon"
                              className="h-7 px-3 text-[11px]"
                              disabled={!quest.eligibleToClaim || claimClubQuestMutation.isPending}
                              onClick={() => claimClubQuestMutation.mutate({ clubId: quest.clubId })}
                            >
                              Riscatta
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nessun club attivo. Entra in un club per sbloccare la quest settimanale.
                  </p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="leaderboard" className="space-y-3">
              <div className="stream-card border-primary/35 bg-primary/8">
                <p className="text-xs text-muted-foreground">La tua posizione</p>
                <p className="text-lg font-display font-semibold text-foreground">
                  {myRank?.me ? `#${myRank.me.rank} · ${myRank.me.seasonXp.toLocaleString()} XP` : "n/d"}
                </p>
                {myRank?.around?.length ? (
                  <div className="mt-2 grid gap-1">
                    {myRank.around.map((entry) => (
                      <Link
                        key={`me-around-${entry.userId}`}
                        href={`/u/${entry.userId}`}
                        className={`flex items-center gap-2 rounded-md border px-2 py-1 text-xs transition-colors hover:bg-background/60 ${entry.isMe ? "border-primary/50 bg-primary/15" : "border-border/60 bg-background/40"}`}
                      >
                        <Avatar className="size-6 border border-border/60">
                          <AvatarImage src={entry.avatarUrl ?? undefined} alt={entry.name} />
                          <AvatarFallback>{String(entry.name ?? "U").slice(0, 1).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <span className="font-semibold">#{entry.rank}</span> {entry.name} · {entry.seasonXp.toLocaleString()} XP
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="grid gap-2">
                {leaderboard.map((entry) => (
                  <Link key={entry.userId} href={`/u/${entry.userId}`} className="stream-card block transition-colors hover:bg-background/55">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                        {entry.rank}
                      </div>
                      <Avatar className="size-9 border border-border/70 shrink-0">
                        <AvatarImage src={entry.avatarUrl ?? undefined} alt={entry.name} />
                        <AvatarFallback>{String(entry.name ?? "U").slice(0, 1).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground truncate">{entry.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {Number(entry.seasonXp ?? 0).toLocaleString()} XP season
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="badges" className="space-y-2">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {badgeAssignments.map((item) => {
                  const progress = Number(item.progress ?? 0)
                  const current = Number(item.current ?? 0)
                  const target = Math.max(1, Number(item.target ?? 1))
                  const earned = Boolean(item.earned)
                  return (
                    <div key={item.code} className="stream-card">
                      <div className="flex items-center gap-3">
                        <div className="size-10 rounded-xl overflow-hidden border border-border/70 bg-background/65 shrink-0">
                          <img
                            src={getSeasonAssignmentImageUrl(String(item.code))}
                            alt={item.name}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground">{item.objective}</p>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{current}/{target}</span>
                        <Badge variant={earned ? "neon" : "outline"} className="text-[10px] capitalize">{item.rarity}</Badge>
                      </div>
                      <Progress value={progress} className="mt-1.5 h-1.5" />
                    </div>
                  )
                })}
              </div>

              <Button variant="outline-neon" className="mt-3 w-full" asChild>
                <Link href="/badges">
                  Vai ai badge globali
                  <ChevronRight className="ml-2 size-4" />
                </Link>
              </Button>
            </TabsContent>
          </Tabs>
        </section>
      </div>
    </AppLayout>
  )
}
