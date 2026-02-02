"use client"

import AppLayout from "@/components/AppLayout"
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { trpc } from "@/lib/trpc"
import {
  Brain,
  Send,
  Sparkles,
  Waves,
  RefreshCw,
} from "lucide-react"

type WorkoutSection = {
  title: string
  exercises: WorkoutExercise[]
  notes?: string
}

type WorkoutExercise = {
  name: string
  sets?: string
  reps?: string
  distance?: string
  duration?: string
  rest?: string
  intensity?: string
  equipment?: string
  notes?: string
}

type GeneratedWorkout = {
  type: "pool" | "dryland"
  title: string
  description: string
  duration: string
  difficulty: string
  sections: WorkoutSection[]
  coachNotes: string[]
}

const formatDistance = (meters?: number | null) => {
  if (!meters) return null
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`
  return `${meters} m`
}

const formatTime = (seconds?: number | null) => {
  if (!seconds) return null
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`
}

const formatDate = (date?: string | null) => {
  if (!date) return null
  return new Date(date).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

const getExerciseDetails = (exercise: WorkoutExercise) =>
  [
    exercise.sets && `Serie: ${exercise.sets}`,
    exercise.reps && `Rip: ${exercise.reps}`,
    exercise.distance && `Distanza: ${exercise.distance}`,
    exercise.duration && `Durata: ${exercise.duration}`,
    exercise.rest && `Ripartenza: ${exercise.rest}`,
    exercise.intensity && `Intensità: ${exercise.intensity}`,
    exercise.equipment && `Attrezzi: ${exercise.equipment}`,
  ].filter(Boolean) as string[]

export default function Coach() {
  const [message, setMessage] = useState("")
  const [poolRegenerate, setPoolRegenerate] = useState(false)
  const [dryRegenerate, setDryRegenerate] = useState(false)
  const { data: advanced } = trpc.statistics.getAdvanced.useQuery(
    { days: 30 },
    { staleTime: 24 * 60 * 60 * 1000 }
  )
  const poolWorkoutQuery = trpc.aiCoach.getPoolWorkout.useQuery(
    { forceRegenerate: poolRegenerate },
    { staleTime: poolRegenerate ? 0 : 24 * 60 * 60 * 1000 }
  )
  const drylandWorkoutQuery = trpc.aiCoach.getDrylandWorkout.useQuery(
    { forceRegenerate: dryRegenerate },
    { staleTime: dryRegenerate ? 0 : 24 * 60 * 60 * 1000 }
  )
  const sessionInsightsQuery = trpc.activityInsights.list.useQuery(
    { limit: 5, offset: 0 },
    { staleTime: 60 * 1000 }
  )

  const assistantMessages = useMemo(() => {
    if (advanced?.insights?.length) {
      return advanced.insights.map((content) => ({ role: "assistant", content }))
    }
    return [
      {
        role: "assistant",
        content:
          "Nessun insight disponibile. Sincronizza nuove attivita per avviare l'analisi AI.",
      },
    ]
  }, [advanced?.insights])

  const poolWorkout = poolWorkoutQuery.data as GeneratedWorkout | undefined
  const drylandWorkout = drylandWorkoutQuery.data as GeneratedWorkout | undefined

  const insightCards = useMemo(() => {
    const insights = advanced?.insights ?? []
    if (!insights.length) return []
    return insights.map((text, index) => {
      const metricMatch = text.match(/(-?\d+(?:\.\d+)?%?)/)
      return {
        title: `Insight ${index + 1}`,
        description: text.replace(/\*\*/g, ""),
        metric: metricMatch?.[1] ?? null,
      }
    })
  }, [advanced?.insights])

  const keyMetricCards = useMemo(() => {
    const performance = advanced?.performanceIndex ?? 0
    const consistency = advanced?.consistencyScore ?? 0
    const recovery = advanced?.recoveryReadinessScore ?? null
    const streakCurrent = advanced?.streak?.current ?? 0
    const streakRecord = advanced?.streak?.record ?? 0

    return [
      {
        title: "Performance",
        value: `${Math.round(performance)}`,
        helper: `${Math.round(performance)}%`,
      },
      {
        title: "Consistency",
        value: `${Math.round(consistency)}`,
        helper: `${Math.round(consistency)}%`,
      },
      {
        title: "Recovery",
        value: recovery === null || recovery === undefined ? "—" : `${Math.round(recovery)}`,
        helper: recovery === null || recovery === undefined ? "N/D" : `${Math.round(recovery)}%`,
      },
      {
        title: "Streak",
        value: `${streakCurrent}`,
        helper: `Record ${streakRecord}`,
      },
    ]
  }, [advanced])

  const advancedMetrics = useMemo(() => {
    const metrics = [
      { key: "SEI", value: advanced?.swimmingEfficiencyIndex },
      { key: "TCI", value: advanced?.technicalConsistencyIndex },
      { key: "SER", value: advanced?.strokeEfficiencyRating },
      { key: "ACS", value: advanced?.aerobicCapacityScore },
      { key: "RRS", value: advanced?.recoveryReadinessScore },
      { key: "POI", value: advanced?.progressiveOverloadIndex },
    ]
    return metrics.map((metric) => ({
      ...metric,
      display: metric.value === null || metric.value === undefined ? "—" : Math.round(metric.value),
    }))
  }, [advanced])

  const latestSessionInsight = useMemo(() => {
    const data = sessionInsightsQuery.data ?? []
    if (!data.length) return null
    const getKey = (item: any) =>
      item.activity_date ??
      item.activityDate ??
      item.generated_at ??
      item.generatedAt ??
      item.activity_id ??
      item.activityId ??
      item.id ??
      0
    const toEpoch = (value: any) => {
      if (typeof value === "number") return value
      if (value instanceof Date) return value.getTime()
      if (typeof value === "string") {
        const ts = Date.parse(value)
        if (Number.isFinite(ts)) return ts
      }
      return 0
    }
    const sorted = [...data].sort((a: any, b: any) => {
      const aKey = getKey(a)
      const bKey = getKey(b)
      const aTs = toEpoch(aKey)
      const bTs = toEpoch(bKey)
      if (aTs !== bTs) return bTs - aTs
      return String(bKey).localeCompare(String(aKey))
    })
    return sorted[0]
  }, [sessionInsightsQuery.data])

  const parsedSessionBullets = useMemo(() => {
    if (!latestSessionInsight) return []
    if (Array.isArray(latestSessionInsight.bullets)) return latestSessionInsight.bullets
    try {
      return JSON.parse(latestSessionInsight.bullets ?? "[]")
    } catch {
      return []
    }
  }, [latestSessionInsight])

  const handleRegeneratePool = async () => {
    setPoolRegenerate(true)
    try {
      await poolWorkoutQuery.refetch()
    } finally {
      setPoolRegenerate(false)
    }
  }

  const handleRegenerateDryland = async () => {
    setDryRegenerate(true)
    try {
      await drylandWorkoutQuery.refetch()
    } finally {
      setDryRegenerate(false)
    }
  }

  return (
    <AppLayout>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20">
          <Brain className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">AI Coach</h1>
          <p className="text-muted-foreground">Il tuo assistente personale per migliorare</p>
        </div>
      </div>

      <Tabs defaultValue="insights">
        <TabsList className="bg-secondary">
          <TabsTrigger value="insights">Insights</TabsTrigger>
          <TabsTrigger value="workouts">Allenamenti</TabsTrigger>
          <TabsTrigger value="session-iq">Session IQ</TabsTrigger>
          <TabsTrigger value="chat">Chat</TabsTrigger>
        </TabsList>

        <TabsContent value="insights" className="mt-6 space-y-4">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {keyMetricCards.map((metric) => (
              <Card key={metric.title} className="bg-card border-border">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{metric.title}</p>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-2xl font-display font-bold text-foreground">{metric.value}</span>
                    <span className="text-xs text-muted-foreground">{metric.helper}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {insightCards.length > 0 ? (
            insightCards.map((insight, index) => (
              <Card key={index} className="bg-card border-border">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Sparkles className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium text-foreground">{insight.title}</h3>
                        {insight.metric ? (
                          <Badge variant="secondary" className="bg-primary/10 text-primary">
                            {insight.metric}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{insight.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card className="bg-card border-border">
              <CardContent className="p-6 text-sm text-muted-foreground">
                Nessun insight disponibile. Sincronizza nuove attivita per ottenere suggerimenti AI.
              </CardContent>
            </Card>
          )}

          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                {advancedMetrics.map((metric) => (
                  <div key={metric.key} className="flex items-center gap-2 rounded-full bg-secondary/40 px-3 py-1 text-xs">
                    <span className="text-muted-foreground">{metric.key}</span>
                    <span className="text-foreground font-semibold">{metric.display}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workouts" className="mt-6 space-y-6">
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="font-display">Allenamento in Vasca</CardTitle>
                <p className="text-sm text-muted-foreground">Generato dall&apos;AI</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRegeneratePool}
                disabled={poolRegenerate || poolWorkoutQuery.isFetching}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${poolRegenerate ? "animate-spin" : ""}`} />
                Rigenera
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {poolWorkout ? (
                <>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">{poolWorkout.title}</span>
                    <span>• {poolWorkout.duration}</span>
                    <span>• {poolWorkout.difficulty}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{poolWorkout.description}</p>
                  <div className="space-y-3">
                    {poolWorkout.sections.map((section, idx) => (
                      <div key={idx} className="rounded-lg border border-border bg-secondary/20 p-4">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">{section.title}</Badge>
                          {section.notes && (
                            <span className="text-xs text-muted-foreground">{section.notes}</span>
                          )}
                        </div>
                        <div className="space-y-3">
                          {section.exercises.map((exercise, exIdx) => (
                            <div key={exIdx} className="rounded-md bg-background/60 p-3 text-sm">
                              <div className="font-medium text-foreground">{exercise.name}</div>
                              <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                {getExerciseDetails(exercise).map((detail, detailIdx) => (
                                  <span key={detailIdx}>{detail}</span>
                                ))}
                              </div>
                              {exercise.notes && (
                                <p className="mt-2 text-xs text-muted-foreground">{exercise.notes}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Allenamento in vasca non disponibile. Sincronizza nuove attività.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="font-display">Allenamento Dryland</CardTitle>
                <p className="text-sm text-muted-foreground">Forza, core e mobilità</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRegenerateDryland}
                disabled={dryRegenerate || drylandWorkoutQuery.isFetching}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${dryRegenerate ? "animate-spin" : ""}`} />
                Rigenera
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {drylandWorkout ? (
                <>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">{drylandWorkout.title}</span>
                    <span>• {drylandWorkout.duration}</span>
                    <span>• {drylandWorkout.difficulty}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{drylandWorkout.description}</p>
                  <div className="space-y-3">
                    {drylandWorkout.sections.map((section, idx) => (
                      <div key={idx} className="rounded-lg border border-border bg-secondary/20 p-4">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">{section.title}</Badge>
                          {section.notes && (
                            <span className="text-xs text-muted-foreground">{section.notes}</span>
                          )}
                        </div>
                        <div className="space-y-3">
                          {section.exercises.map((exercise, exIdx) => (
                            <div key={exIdx} className="rounded-md bg-background/60 p-3 text-sm">
                              <div className="font-medium text-foreground">{exercise.name}</div>
                              <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                {getExerciseDetails(exercise).map((detail, detailIdx) => (
                                  <span key={detailIdx}>{detail}</span>
                                ))}
                              </div>
                              {exercise.notes && (
                                <p className="mt-2 text-xs text-muted-foreground">{exercise.notes}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Allenamento dryland non disponibile. Sincronizza nuove attività.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="session-iq" className="mt-6 space-y-4">
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="font-display">Session IQ</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Analisi dell&apos;ultima sessione sincronizzata
                </p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <a href="/session-iq">Apri archivio</a>
              </Button>
            </CardHeader>
            <CardContent>
              {latestSessionInsight ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    {formatDate(latestSessionInsight.activity_date) && (
                      <span>📅 {formatDate(latestSessionInsight.activity_date)}</span>
                    )}
                    {formatDistance(latestSessionInsight.activity_distance_meters) && (
                      <span>🏊 {formatDistance(latestSessionInsight.activity_distance_meters)}</span>
                    )}
                    {formatTime(latestSessionInsight.activity_duration_seconds) && (
                      <span>⏱ {formatTime(latestSessionInsight.activity_duration_seconds)}</span>
                    )}
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">{latestSessionInsight.title}</h3>
                  <p className="text-sm text-muted-foreground">{latestSessionInsight.summary}</p>
                  {parsedSessionBullets.length > 0 && (
                    <ul className="space-y-2 text-sm text-foreground">
                      {parsedSessionBullets.map((bullet: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-primary">•</span>
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Nessuna analisi disponibile. Sincronizza una nuova attività per generare Session IQ.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="chat" className="mt-6">
          <Card className="bg-card border-border">
            <CardContent className="p-0">
              <div className="h-[320px] overflow-y-auto p-4 space-y-4">
                {assistantMessages.map((msg, index) => (
                  <div
                    key={index}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] p-3 rounded-2xl ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-secondary text-secondary-foreground rounded-bl-md"
                      }`}
                    >
                      {msg.role === "assistant" && (
                        <div className="flex items-center gap-2 mb-2">
                          <Sparkles className="w-4 h-4 text-primary" />
                          <span className="text-xs font-medium text-primary">SwimForge AI</span>
                        </div>
                      )}
                      <p className="text-sm whitespace-pre-line">{msg.content}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-border p-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Chat interattiva in arrivo"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="bg-secondary border-0"
                    disabled
                  />
                  <Button size="icon" disabled>
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
    </AppLayout>
  )
}
