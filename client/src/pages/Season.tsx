"use client"

import AppLayout from "@/components/AppLayout"
import { trpc } from "@/lib/trpc"
import { Surface, SurfaceContent } from "@/components/ui/surface"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MetricOrb } from "@/components/metrics/MetricOrb"
import { CalendarDays, ChevronRight, Sparkles, Target, Trophy, Zap } from "lucide-react"
import { Link } from "wouter"

function formatRemaining(remainingMs: number) {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000))
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  return `${days}g ${hours}h`
}

export default function SeasonPage() {
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

  const seasonData = seasonQuery.data
  const leaderboard = leaderboardQuery.data ?? []

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

  return (
    <AppLayout>
      <div className="space-y-6">
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
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 md:gap-6">
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

        <div className="stream-shell">
          <section className="stream-main">
            <div className="stream-node">
              <section className="surface-panel p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="font-display text-lg font-semibold text-foreground">Missioni Daily</h2>
                    <p className="text-sm text-muted-foreground">Obiettivi rapidi giornalieri</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {dailyMissions.map((mission) => (
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
                      <Progress value={Number(mission.progress ?? 0)} className="mt-3 h-1.5" />
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <div className="stream-node">
              <section className="surface-panel p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="font-display text-lg font-semibold text-foreground">Missioni Weekly</h2>
                    <p className="text-sm text-muted-foreground">Obiettivi progressivi settimanali</p>
                  </div>
                </div>
                <div className="space-y-3">
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
                      <Progress value={Number(mission.progress ?? 0)} className="mt-3 h-1.5" />
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <div className="stream-node">
              <section className="surface-panel p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="font-display text-lg font-semibold text-foreground">Reward Track</h2>
                    <p className="text-sm text-muted-foreground">Sblocchi del battle pass</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {rewards.map((reward) => (
                    <div key={reward.rewardCode} className="stream-card">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">
                            Lv {reward.level} · {reward.rewardName}
                          </p>
                          <p className="text-xs text-muted-foreground capitalize">{reward.rewardType}</p>
                        </div>
                        <Badge variant={reward.unlocked ? "neon" : "outline"} className="text-xs capitalize">
                          {reward.unlocked ? "Sbloccata" : "Bloccata"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </section>

          <aside className="space-y-6 xl:sticky xl:top-24">
            <section className="surface-panel p-6">
              <div className="mb-4">
                <h2 className="font-display text-lg font-semibold text-foreground">Classifica Season</h2>
                <p className="text-sm text-muted-foreground">Top progressione attuale</p>
              </div>
              <div className="space-y-3">
                {leaderboard.length ? (
                  leaderboard.slice(0, 8).map((entry) => (
                    <div key={entry.userId} className="stream-card">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                            {entry.rank}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{entry.name}</p>
                            <p className="text-xs text-muted-foreground">{Number(entry.seasonXp ?? 0).toLocaleString()} XP season</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Classifica non disponibile.</p>
                )}
              </div>
            </section>

            <section className="surface-panel p-6">
              <div className="mb-4">
                <h2 className="font-display text-lg font-semibold text-foreground">Badge Assegnazioni S1</h2>
                <p className="text-sm text-muted-foreground">Obiettivi nuovi dedicati alla season</p>
              </div>
              <div className="space-y-3">
                {badgeAssignments.map((item) => (
                  <div key={item.code} className="stream-card">
                    <p className="text-sm font-semibold text-foreground">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.objective}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <Badge variant="outline" className="text-[10px]">{item.code}</Badge>
                      <Badge variant="outline" className="text-[10px] capitalize">{item.rarity}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <Button variant="outline-neon" className="w-full" asChild>
              <Link href="/badges">
                Vai ai badge globali
                <ChevronRight className="ml-2 size-4" />
              </Link>
            </Button>
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
