"use client"

import { useMemo, useState } from "react"
import AppLayout from "@/components/AppLayout"
import { trpc } from "@/lib/trpc"
import { Surface, SurfaceContent } from "@/components/ui/surface"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MetricOrb } from "@/components/metrics/MetricOrb"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Sparkles,
  Target,
  Trophy,
  Users,
  Zap,
} from "lucide-react"
import { Link } from "wouter"
import { toast } from "sonner"
import { getSeasonAssignmentImageUrl, getSeasonRewardImageUrl } from "@/lib/seasonBadgeImages"
import { SeasonRecapDialog } from "@/components/video/SeasonRecapDialog"

function formatRemaining(remainingMs: number) {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000))
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
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
  const seasonQuery = trpc.season.getCurrent.useQuery(undefined, {
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  })
  const leaderboardQuery = trpc.season.getLeaderboard.useQuery(
    { limit: 12 },
    {
      staleTime: 15_000,
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
      refetchOnMount: "always",
    }
  )
  const engagementQuery = trpc.season.getEngagement.useQuery(undefined, {
    staleTime: 10_000,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  })
  const [predictionForm, setPredictionForm] = useState({
    targetDistanceMeters: "",
    targetPacePer100m: "",
    targetDurationMinutes: "",
    targetRpe: "",
    note: "",
  })
  const claimRewardMutation = trpc.season.claimReward.useMutation({
    onSuccess: async (result) => {
      if (result.alreadyClaimed) {
        toast.info("Ricompensa già riscattata")
      } else {
        toast.success(`Ricompensa riscattata: +${result.xpAwarded} XP`)
      }
      await Promise.all([
        utils.season.getCurrent.invalidate(),
        utils.season.getLeaderboard.invalidate(),
        utils.profile.get.invalidate(),
        utils.leaderboard.get.invalidate(),
      ])
    },
    onError: (error) => {
      toast.error(error.message || "Riscatto ricompensa non riuscito")
    },
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
  const engagement = engagementQuery.data
  const actionXp = engagement?.actionXp
  const predictions = engagement?.predictions ?? []
  const clubQuests = engagement?.clubQuests ?? []
  const pendingPredictions = useMemo(
    () => predictions.filter((prediction) => prediction.status === "pending"),
    [predictions],
  )

  const currentLevel = Number(seasonData?.progress?.currentLevel ?? 1)
  const seasonXp = Number(seasonData?.progress?.seasonXp ?? 0)
  const levelProgress = Number(seasonData?.progress?.levelProgressPercent ?? 0)
  const completionRate = Number(seasonData?.missions?.completionRate ?? 0)
  const completed = Number(seasonData?.missions?.completedMissions ?? 0)
  const totalMissions = Number(seasonData?.missions?.totalMissions ?? 0)

  const dailyMissions = seasonData?.missions?.daily ?? []
  const weeklyMissions = seasonData?.missions?.weekly ?? []
  const rewards = seasonData?.rewards ?? []
  const badgeAssignments = seasonData?.badgeAssignments ?? []
  const dailyPreview = dailyMissions.slice(0, 3)
  const weeklyPreview = weeklyMissions.slice(0, 3)
  const rewardsPreview = rewards.slice(0, 4)
  const questsPreview = clubQuests.slice(0, 2)
  const leaderboardPreview = leaderboard.slice(0, 5)
  const badgeAssignmentsPreview = badgeAssignments.slice(0, 6)

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

  return (
    <AppLayout>
      <div className="compact-shell space-y-4 lg:space-y-2">
        <Surface className="relative overflow-hidden">
          <SurfaceContent className="relative p-6 md:p-7">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/65 px-3 py-1 text-xs text-muted-foreground">
                  <Sparkles className="size-3.5 text-primary" />
                  Battle Pass Stagionale
                </div>
                <h1 className="font-display text-2xl md:text-3xl font-bold neon-gradient-text">
                  {seasonData?.season?.name ?? "Season Electric Ice"}
                </h1>
                <p className="text-sm text-muted-foreground">
                  Missioni dinamiche, reward esclusivi e classifica dedicata.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">Level {currentLevel}</Badge>
                  <Badge variant="outline">
                    <CalendarDays className="mr-1 size-3" />
                    {formatRemaining(Number(seasonData?.season?.remainingMs ?? 0))} rimanenti
                  </Badge>
                  <Badge variant="outline">{seasonData?.missionMode === "solo-fallback" ? "Modalità Solo" : "Modalità Club"}</Badge>
                  <SeasonRecapDialog triggerLabel="Recap video" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                <MetricOrb
                  label="Level Season"
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

            <div className="mt-5 space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Progressione livello corrente</span>
                <span>{seasonData?.progress?.xpToNextLevel ?? 0} XP al prossimo livello</span>
              </div>
              <Progress value={levelProgress} className="h-2" />
            </div>
          </SurfaceContent>
        </Surface>

        <div className="stream-shell lg:gap-2">
          <section className="stream-main lg:gap-2">
            <div className="stream-node">
              <section className="surface-panel p-4 lg:p-5">
                <Accordion type="single" collapsible defaultValue="daily" className="space-y-2">
                  <AccordionItem value="daily" className="rounded-xl border border-border/70 bg-background/50 px-3">
                    <AccordionTrigger className="py-3 text-left hover:no-underline">
                      <div>
                        <p className="font-display text-base font-semibold text-foreground">Missioni Daily</p>
                        <p className="text-xs text-muted-foreground">Obiettivi rapidi giornalieri</p>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-3">
                      <div className="space-y-2">
                        {dailyPreview.map((mission) => (
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
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="action" className="rounded-xl border border-border/70 bg-background/50 px-3">
                    <AccordionTrigger className="py-3 text-left hover:no-underline">
                      <div>
                        <p className="font-display text-base font-semibold text-foreground">Action XP Giornaliero</p>
                        <p className="text-xs text-muted-foreground">XP da community, RSVP e club</p>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-3">
                      <div className="grid grid-cols-3 gap-2">
                        <div className="stream-card text-center">
                          <p className="text-xs text-muted-foreground">Oggi</p>
                          <p className="text-lg font-display font-semibold text-foreground">{actionXp?.earnedToday ?? 0}</p>
                        </div>
                        <div className="stream-card text-center">
                          <p className="text-xs text-muted-foreground">Rimanenti</p>
                          <p className="text-lg font-display font-semibold text-foreground">{actionXp?.remaining ?? 90}</p>
                        </div>
                        <div className="stream-card text-center">
                          <p className="text-xs text-muted-foreground">In attesa</p>
                          <p className="text-lg font-display font-semibold text-foreground">{pendingPredictions.length}</p>
                        </div>
                      </div>
                      <div className="mt-2 space-y-1.5">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Progress cap</span>
                          <span>{actionXp?.earnedToday ?? 0}/{actionXp?.cap ?? 90}</span>
                        </div>
                        <Progress
                          value={Math.min(
                            100,
                            ((actionXp?.earnedToday ?? 0) / Math.max(actionXp?.cap ?? 90, 1)) * 100,
                          )}
                          className="h-1.5"
                        />
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="prediction" className="rounded-xl border border-border/70 bg-background/50 px-3">
                    <AccordionTrigger className="py-3 text-left hover:no-underline">
                      <div>
                        <p className="font-display text-base font-semibold text-foreground">Previsione Allenamento</p>
                        <p className="text-xs text-muted-foreground">Target pre-sessione e XP precisione</p>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-3">
                      <div className="mb-2 flex justify-end">
                        <Button
                          variant="outline-neon"
                          size="sm"
                          disabled={evaluatePredictionMutation.isPending}
                          onClick={() => evaluatePredictionMutation.mutate({})}
                        >
                          Valuta ultima
                        </Button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input
                          type="number"
                          min={100}
                          max={50000}
                          placeholder="Target distanza (m)"
                          value={predictionForm.targetDistanceMeters}
                          onChange={(e) =>
                            setPredictionForm((prev) => ({
                              ...prev,
                              targetDistanceMeters: e.target.value,
                            }))
                          }
                          className="bg-background/60"
                        />
                        <Input
                          type="number"
                          min={50}
                          max={600}
                          placeholder="Target pace (sec/100m)"
                          value={predictionForm.targetPacePer100m}
                          onChange={(e) =>
                            setPredictionForm((prev) => ({
                              ...prev,
                              targetPacePer100m: e.target.value,
                            }))
                          }
                          className="bg-background/60"
                        />
                        <Input
                          type="number"
                          min={5}
                          max={360}
                          placeholder="Target durata (min)"
                          value={predictionForm.targetDurationMinutes}
                          onChange={(e) =>
                            setPredictionForm((prev) => ({
                              ...prev,
                              targetDurationMinutes: e.target.value,
                            }))
                          }
                          className="bg-background/60"
                        />
                        <Input
                          type="number"
                          min={1}
                          max={10}
                          placeholder="Target RPE (1-10)"
                          value={predictionForm.targetRpe}
                          onChange={(e) =>
                            setPredictionForm((prev) => ({
                              ...prev,
                              targetRpe: e.target.value,
                            }))
                          }
                          className="bg-background/60"
                        />
                      </div>
                      <Input
                        className="mt-2 bg-background/60"
                        placeholder="Nota opzionale"
                        value={predictionForm.note}
                        onChange={(e) =>
                          setPredictionForm((prev) => ({
                            ...prev,
                            note: e.target.value,
                          }))
                        }
                      />
                      <div className="mt-2 flex justify-end">
                        <Button
                          variant="neon"
                          size="sm"
                          disabled={createPredictionMutation.isPending}
                          onClick={handleCreatePrediction}
                        >
                          Crea previsione
                        </Button>
                      </div>
                      <div className="mt-2 space-y-2">
                        {predictions.length ? (
                          predictions.slice(0, 2).map((prediction) => (
                            <div key={prediction.id} className="stream-card">
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-foreground">Previsione #{prediction.id}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {prediction.targetDistanceMeters ? `${prediction.targetDistanceMeters}m · ` : ""}
                                    {prediction.targetPacePer100m ? `${formatPaceSeconds(prediction.targetPacePer100m)} · ` : ""}
                                    {prediction.targetDurationSeconds ? `${Math.round(prediction.targetDurationSeconds / 60)} min · ` : ""}
                                    {prediction.targetRpe ? `RPE ${prediction.targetRpe}` : ""}
                                  </p>
                                </div>
                                <Badge
                                  variant={prediction.status === "evaluated" ? "neon" : "outline"}
                                  className="text-xs capitalize"
                                >
                                  {prediction.status === "evaluated" ? "Valutata" : "In attesa"}
                                </Badge>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground">Nessuna previsione registrata.</p>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="weekly" className="rounded-xl border border-border/70 bg-background/50 px-3">
                    <AccordionTrigger className="py-3 text-left hover:no-underline">
                      <div>
                        <p className="font-display text-base font-semibold text-foreground">Missioni Weekly</p>
                        <p className="text-xs text-muted-foreground">Obiettivi progressivi settimanali</p>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-3">
                      <div className="space-y-2">
                        {weeklyPreview.map((mission) => (
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
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="rewards" className="rounded-xl border border-border/70 bg-background/50 px-3">
                    <AccordionTrigger className="py-3 text-left hover:no-underline">
                      <div>
                        <p className="font-display text-base font-semibold text-foreground">Reward Track</p>
                        <p className="text-xs text-muted-foreground">Sblocchi del battle pass</p>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-3">
                      <div className="space-y-2">
                        {rewardsPreview.map((reward) => (
                          <div key={reward.rewardCode} className="stream-card">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0 flex items-center gap-3">
                                <div className="size-10 rounded-xl overflow-hidden border border-border/70 bg-background/65 shrink-0">
                                  <img
                                    src={getSeasonRewardImageUrl(String(reward.rewardCode))}
                                    alt={reward.rewardName}
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                  />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-foreground truncate">
                                    Lv {reward.level} · {reward.rewardName}
                                  </p>
                                  <p className="text-xs text-muted-foreground capitalize">{reward.rewardType}</p>
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-1.5">
                                <Badge variant={reward.unlocked ? "neon" : "outline"} className="text-xs capitalize">
                                  {reward.claimed ? "Riscattata" : reward.unlocked ? "Sbloccata" : "Bloccata"}
                                </Badge>
                                {reward.unlocked && !reward.claimed ? (
                                  <Button
                                    size="sm"
                                    variant="neon"
                                    className="h-7 px-3 text-[11px]"
                                    disabled={claimRewardMutation.isPending}
                                    onClick={() => claimRewardMutation.mutate({ rewardCode: reward.rewardCode })}
                                  >
                                    Riscatta
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </section>
            </div>
          </section>

          <aside className="xl:sticky xl:top-20">
            <section className="surface-panel p-4 lg:p-5">
              <Accordion type="single" collapsible defaultValue="club-quest" className="space-y-2">
                <AccordionItem value="club-quest" className="rounded-xl border border-border/70 bg-background/50 px-3">
                  <AccordionTrigger className="py-3 text-left hover:no-underline">
                    <div>
                      <p className="font-display text-base font-semibold text-foreground">Club Quest Settimanale</p>
                      <p className="text-xs text-muted-foreground">Obiettivo collaborativo con reward condivisa</p>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-3">
                    <div className="space-y-2">
                      {clubQuests.length ? (
                        questsPreview.map((quest) => (
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
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Nessun club attivo. Entra in un club per sbloccare la quest settimanale.
                        </p>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="leaderboard" className="rounded-xl border border-border/70 bg-background/50 px-3">
                  <AccordionTrigger className="py-3 text-left hover:no-underline">
                    <div>
                      <p className="font-display text-base font-semibold text-foreground">Classifica Season</p>
                      <p className="text-xs text-muted-foreground">Top progressione attuale</p>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-3">
                    <div className="space-y-2">
                      {leaderboard.length ? (
                        leaderboardPreview.map((entry) => (
                          <div key={entry.userId} className="stream-card">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                                {entry.rank}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-foreground truncate">{entry.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {Number(entry.seasonXp ?? 0).toLocaleString()} XP season
                                </p>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">Classifica non disponibile.</p>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="badges" className="rounded-xl border border-border/70 bg-background/50 px-3">
                  <AccordionTrigger className="py-3 text-left hover:no-underline">
                    <div>
                      <p className="font-display text-base font-semibold text-foreground">Badge Assegnazioni S1</p>
                      <p className="text-xs text-muted-foreground">Obiettivi dedicati alla season</p>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-3">
                    <div className="space-y-2">
                      {badgeAssignmentsPreview.map((item) => (
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
                              <p className="text-sm font-semibold text-foreground">{item.name}</p>
                              <p className="text-xs text-muted-foreground">{item.objective}</p>
                            </div>
                          </div>
                          <div className="mt-2 flex items-center justify-between">
                            <Badge variant="outline" className="text-[10px]">{item.code}</Badge>
                            <Badge variant="outline" className="text-[10px] capitalize">{item.rarity}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <Button variant="outline-neon" className="mt-3 w-full" asChild>
                <Link href="/badges">
                  Vai ai badge globali
                  <ChevronRight className="ml-2 size-4" />
                </Link>
              </Button>
            </section>
          </aside>
        </div>

        <section className="surface-panel p-5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Progressione live attiva</p>
            <p className="text-xs text-muted-foreground">
              I punti Season si aggiornano automaticamente con sync attività e azioni community.
            </p>
          </div>
          <Badge variant="neon" className="shrink-0">
            <Zap className="mr-1 size-3.5" />
            Live
          </Badge>
        </section>
      </div>
    </AppLayout>
  )
}
