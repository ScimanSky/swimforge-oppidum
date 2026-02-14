"use client"

import AppLayout from "@/components/AppLayout"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { MetricOrb } from "@/components/metrics/MetricOrb"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { trpc } from "@/lib/trpc"
import {
  Brain,
  Sparkles,
  RefreshCw,
  Target,
  HeartPulse,
  Activity,
  MessageSquare,
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

const getConditionLabel = (value?: number | null) => {
  if (value === null || value === undefined) return "N/D"
  if (value >= 75) return "Ottima"
  if (value >= 55) return "Buona"
  if (value >= 35) return "Da gestire"
  return "Critica"
}

const getFocusLabel = (
  performance?: number,
  consistency?: number,
  recovery?: number | null,
  efficiency?: number | null
) => {
  const candidates = [
    { label: "Performance", value: performance },
    { label: "Costanza", value: consistency },
    { label: "Recupero", value: recovery },
    { label: "Efficienza", value: efficiency },
  ].filter((item) => item.value !== null && item.value !== undefined)

  if (!candidates.length) return "Analisi in corso"
  candidates.sort((a, b) => (a.value ?? 0) - (b.value ?? 0))
  return candidates[0].label
}

export default function Coach() {
  const [message, setMessage] = useState("")
  const [activeInsightIndex, setActiveInsightIndex] = useState(0)
  const [activePoolSectionIndex, setActivePoolSectionIndex] = useState(0)
  const [activeDrySectionIndex, setActiveDrySectionIndex] = useState(0)
  const [activeWorkout, setActiveWorkout] = useState<"pool" | "dryland">("pool")
  const [isGenerating, setIsGenerating] = useState(false)

  const { data: advanced } = trpc.statistics.getAdvanced.useQuery(
    { days: 30 },
    { staleTime: 24 * 60 * 60 * 1000, refetchOnWindowFocus: false }
  )

  // Read-only: fetch existing workouts (no generation)
  const workoutsQuery = trpc.aiCoach.getWorkouts.useQuery(undefined, {
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  })

  const utils = trpc.useUtils()

  const generateMutation = trpc.aiCoach.generateWorkouts.useMutation()

  const handleGenerate = async () => {
    setIsGenerating(true)
    try {
      const result = await generateMutation.mutateAsync()
      // Immediately update the query cache with the mutation result
      utils.aiCoach.getWorkouts.setData(undefined, result)
      // Also refetch to ensure consistency
      await utils.aiCoach.getWorkouts.refetch()
    } catch (error) {
      console.error("Generation failed:", error)
    } finally {
      setIsGenerating(false)
    }
  }

  const workoutsData = workoutsQuery.data
  const poolWorkout = workoutsData?.pool as GeneratedWorkout | undefined
  const drylandWorkout = workoutsData?.dryland as GeneratedWorkout | undefined
  const canGenerate = workoutsData?.canGenerate ?? true

  const cooldownLabel = useMemo(() => {
    if (canGenerate) return null
    if (!workoutsData?.nextAvailableAt) return null
    const next = new Date(workoutsData.nextAvailableAt)
    const now = new Date()
    const diffMs = next.getTime() - now.getTime()
    if (diffMs <= 0) return null
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    if (days === 1) return "Disponibile domani"
    return `Disponibile tra ${days} giorni`
  }, [canGenerate, workoutsData?.nextAvailableAt])

  const generatedAtLabel = useMemo(() => {
    if (!workoutsData?.generatedAt) return null
    return formatDate(workoutsData.generatedAt)
  }, [workoutsData?.generatedAt])
  const sessionInsightsQuery = trpc.activityInsights.list.useQuery(
    { limit: 50, offset: 0 },
    { staleTime: 60 * 1000 }
  )

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

  const safeInsightIndex = insightCards.length
    ? Math.min(activeInsightIndex, insightCards.length - 1)
    : 0
  const activeInsight = insightCards[safeInsightIndex]

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
        value:
          recovery === null || recovery === undefined
            ? "—"
            : `${Math.round(recovery)}`,
        helper:
          recovery === null || recovery === undefined
            ? "N/D"
            : `${Math.round(recovery)}%`,
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
      display:
        metric.value === null || metric.value === undefined
          ? "—"
          : Math.round(metric.value),
    }))
  }, [advanced])

  const sessionEntries = useMemo(() => {
    const data = sessionInsightsQuery.data ?? []
    const normalizeDate = (value: any) => {
      if (!value) return null
      if (value instanceof Date) return value
      if (typeof value === "string") {
        const normalized = value.includes("T") ? value : value.replace(" ", "T")
        const date = new Date(normalized)
        return Number.isNaN(date.getTime()) ? null : date
      }
      return null
    }
    return [...data]
      .map((item: any) => {
        const date =
          normalizeDate(item.activity_date) ||
          normalizeDate(item.activityDate) ||
          normalizeDate(item.generated_at) ||
          normalizeDate(item.generatedAt)
        return {
          ...item,
          _date: date,
          _sort: date ? date.getTime() : 0,
        }
      })
      .sort((a, b) => b._sort - a._sort)
  }, [sessionInsightsQuery.data])

  const latestSessionInsight = sessionEntries[0] ?? null

  const parseBullets = (value: any) => {
    if (!value) return []
    if (Array.isArray(value)) return value
    try {
      return JSON.parse(value ?? "[]")
    } catch {
      return []
    }
  }

  const parsedSessionBullets = useMemo(() => {
    if (!latestSessionInsight) return []
    return parseBullets(latestSessionInsight.bullets)
  }, [latestSessionInsight])

  const activePoolSection = useMemo(() => {
    const sections = poolWorkout?.sections ?? []
    if (!sections.length) return null
    const idx = Math.min(activePoolSectionIndex, sections.length - 1)
    return sections[idx]
  }, [poolWorkout?.sections, activePoolSectionIndex])

  const activeDrySection = useMemo(() => {
    const sections = drylandWorkout?.sections ?? []
    if (!sections.length) return null
    const idx = Math.min(activeDrySectionIndex, sections.length - 1)
    return sections[idx]
  }, [drylandWorkout?.sections, activeDrySectionIndex])

  useEffect(() => {
    setActivePoolSectionIndex(0)
  }, [poolWorkout?.sections?.length])

  useEffect(() => {
    setActiveDrySectionIndex(0)
  }, [drylandWorkout?.sections?.length])

  const focusLabel = useMemo(
    () =>
      getFocusLabel(
        advanced?.performanceIndex,
        advanced?.consistencyScore,
        advanced?.recoveryReadinessScore,
        advanced?.swimmingEfficiencyIndex
      ),
    [advanced]
  )

  const conditionLabel = useMemo(
    () => getConditionLabel(advanced?.recoveryReadinessScore),
    [advanced?.recoveryReadinessScore]
  )

  const lastSyncLabel = useMemo(() => {
    if (!latestSessionInsight?.activity_date) return "—"
    return formatDate(latestSessionInsight.activity_date) ?? "—"
  }, [latestSessionInsight])

  return (
    <AppLayout>
      <div className="compact-shell space-y-4 lg:space-y-2">
        <section className="surface-panel p-6 glass-panel">
          <div className="p-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 p-3">
                <Brain className="h-8 w-8 text-primary" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-3xl font-display font-bold neon-gradient-text">
                    AI Coach
                  </h1>
                  <Badge variant="neon">Premium</Badge>
                </div>
                <p className="text-muted-foreground">
                  Analisi e allenamenti personalizzati basati sui tuoi dati reali.
                </p>
              </div>
            </div>
            <Badge variant="outline" className="text-xs border-primary/40 text-primary">
              Ultimo sync: {lastSyncLabel}
            </Badge>
          </div>
        </section>

        <section className="surface-panel p-6">
          <div className="p-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10">
                <Sparkles className="size-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Analisi</p>
                <p className="text-lg font-semibold text-foreground">
                  {advanced?.insights?.length ? "Analisi completata" : "Analisi in corso"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="rounded-lg border border-border bg-background/60 px-4 py-3">
                <p className="text-xs text-muted-foreground">Focus oggi</p>
                <div className="mt-1 flex items-center gap-2 text-sm font-medium text-foreground">
                  <Target className="size-4 text-primary" />
                  {focusLabel}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-background/60 px-4 py-3">
                <p className="text-xs text-muted-foreground">Condition</p>
                <div className="mt-1 flex items-center gap-2 text-sm font-medium text-foreground">
                  <HeartPulse className="size-4 text-primary" />
                  {conditionLabel}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-background/60 px-4 py-3">
                <p className="text-xs text-muted-foreground">Attività analizzate</p>
                <div className="mt-1 flex items-center gap-2 text-sm font-medium text-foreground">
                  <Activity className="size-4 text-primary" />
                  {sessionInsightsQuery.data?.length ?? 0}
                </div>
              </div>
            </div>
          </div>
        </section>

        <Tabs defaultValue="insights" className="space-y-3">
          <TabsList>
            <TabsTrigger value="insights">Insights</TabsTrigger>
            <TabsTrigger value="workouts">Piano</TabsTrigger>
            <TabsTrigger value="session-iq">Session IQ</TabsTrigger>
            <TabsTrigger value="chat">Chat</TabsTrigger>
          </TabsList>

          <TabsContent value="insights" className="mt-3">
            <div className="flex flex-col gap-4">
              <div className="order-2 lg:order-1">
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                  {keyMetricCards.map((metric, index) => {
                    const helperProgress = Number(String(metric.helper).replace(/[^\d.-]/g, ""))
                    const valueProgress = Number(String(metric.value).replace(/[^\d.-]/g, ""))
                    const progress = Number.isFinite(helperProgress)
                      ? Math.max(0, Math.min(100, helperProgress))
                      : Number.isFinite(valueProgress)
                        ? Math.max(0, Math.min(100, valueProgress))
                        : 0
                    const tones = ["cyan", "lime", "amber", "sky"] as const

                    return (
                      <MetricOrb
                        key={metric.title}
                        label={metric.title}
                        value={metric.value}
                        progress={progress}
                        helper={metric.helper}
                        tone={tones[index % tones.length]}
                        size="sm"
                      />
                    )
                  })}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {advancedMetrics.map((metric, index) => {
                    const numeric = typeof metric.display === "number" ? metric.display : Number(metric.display)
                    const safe = Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : 0
                    const color = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--primary)"][index % 6]
                    const radius = 19
                    const circumference = 2 * Math.PI * radius
                    const offset = circumference * (1 - safe / 100)
                    return (
                      <div key={metric.key} className="stream-card px-2 py-2 text-center">
                        <div className="mx-auto relative h-14 w-14">
                          <svg viewBox="0 0 60 60" className="h-full w-full -rotate-90">
                            <circle cx="30" cy="30" r={radius} stroke="var(--border)" strokeWidth="5" fill="none" />
                            <circle
                              cx="30"
                              cy="30"
                              r={radius}
                              stroke={color}
                              strokeWidth="5"
                              fill="none"
                              strokeLinecap="round"
                              strokeDasharray={circumference}
                              strokeDashoffset={offset}
                              style={{ filter: `drop-shadow(0 0 8px ${color})` }}
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-foreground">
                            {metric.display}
                          </div>
                        </div>
                        <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          {metric.key}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="order-1 lg:order-2">
                {insightCards.length > 0 ? (
                  <section className="surface-panel p-6">
                    <div className="p-4 space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        {insightCards.map((_, index) => (
                          <Button
                            key={index}
                            type="button"
                            size="sm"
                            variant={index === safeInsightIndex ? "neon" : "outline-neon"}
                            className="h-8 w-8 rounded-full p-0"
                            onClick={() => setActiveInsightIndex(index)}
                          >
                            {index + 1}
                          </Button>
                        ))}
                      </div>
                      <div className="flex items-start gap-4">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Sparkles className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <h3 className="font-medium text-foreground">
                              {activeInsight?.title ?? "Insight"}
                            </h3>
                            {activeInsight?.metric ? (
                              <Badge variant="neon">{activeInsight.metric}</Badge>
                            ) : null}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {activeInsight?.description ?? "Seleziona un insight per leggerlo."}
                          </p>
                        </div>
                      </div>
                    </div>
                  </section>
                ) : (
                  <section className="surface-panel p-6">
                    <div className="p-6 text-sm text-muted-foreground">
                      Nessun insight disponibile. Sincronizza nuove attivita per ottenere suggerimenti AI.
                    </div>
                  </section>
                )}
              </div>

            </div>
          </TabsContent>

          <TabsContent value="workouts" className="mt-3 space-y-3">
            <section className="surface-panel p-4 lg:p-5">
              <div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-display">Allenamenti AI</h3>
                    <p className="text-sm text-muted-foreground">
                      Allenamenti personalizzati in base alle tue statistiche.
                      {generatedAtLabel && (
                        <span className="ml-1">Generati il {generatedAtLabel}.</span>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Button
                      variant="neon"
                      size="sm"
                      onClick={handleGenerate}
                      disabled={!canGenerate || isGenerating}
                    >
                      <Sparkles
                        className={`mr-2 h-4 w-4 ${isGenerating ? "animate-spin" : ""}`}
                      />
                      {isGenerating ? "Generazione in corso..." : "Genera workouts"}
                    </Button>
                    {cooldownLabel && (
                      <span className="text-xs text-muted-foreground">{cooldownLabel}</span>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <div className="space-y-4 mt-4">
                  {(poolWorkout || drylandWorkout) ? (
                    <>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={activeWorkout === "pool" ? "neon" : "outline-neon"}
                          onClick={() => setActiveWorkout("pool")}
                        >
                          Allenamento in Vasca
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={activeWorkout === "dryland" ? "neon" : "outline-neon"}
                          onClick={() => setActiveWorkout("dryland")}
                        >
                          Allenamento Dryland
                        </Button>
                      </div>

                      {activeWorkout === "pool" ? (
                        poolWorkout ? (
                          <>
                            <div className="text-sm text-muted-foreground">
                              Generato dall&apos;AI
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                              <span className="font-semibold text-foreground">
                                {poolWorkout.title}
                              </span>
                              <span>• {poolWorkout.duration}</span>
                              <span>• {poolWorkout.difficulty}</span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {poolWorkout.description}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {poolWorkout.sections.map((section, idx) => (
                                <Button
                                  key={idx}
                                  type="button"
                                  size="sm"
                                  variant={idx === activePoolSectionIndex ? "default" : "outline"}
                                  onClick={() => setActivePoolSectionIndex(idx)}
                                >
                                  {section.title}
                                </Button>
                              ))}
                            </div>
                            {activePoolSection ? (
                              <div className="rounded-lg border border-border bg-background/60 p-4">
                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                  <Badge variant="neon">{activePoolSection.title}</Badge>
                                  {activePoolSection.notes && (
                                    <span className="text-xs text-muted-foreground">
                                      {activePoolSection.notes}
                                    </span>
                                  )}
                                </div>
                                <div className="space-y-3">
                                  {activePoolSection.exercises.slice(0, 3).map((exercise, exIdx) => (
                                    <div
                                      key={exIdx}
                                      className="rounded-md bg-background/80 p-3 text-sm"
                                    >
                                      <div className="font-medium text-foreground">
                                        {exercise.name}
                                      </div>
                                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                        {getExerciseDetails(exercise).map(
                                          (detail, detailIdx) => (
                                            <span key={detailIdx}>{detail}</span>
                                          )
                                        )}
                                      </div>
                                      {exercise.notes && (
                                        <p className="mt-2 text-xs text-muted-foreground">
                                          {exercise.notes}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                                {activePoolSection.exercises.length > 3 && (
                                  <p className="mt-3 text-xs text-muted-foreground">
                                    +{activePoolSection.exercises.length - 3} esercizi aggiuntivi. Apri l&apos;allenamento completo nel dettaglio sessione.
                                  </p>
                                )}
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <div className="text-sm text-muted-foreground">
                            Allenamento in vasca non disponibile. Sincronizza nuove attività.
                          </div>
                        )
                      ) : drylandWorkout ? (
                        <>
                          <div className="text-sm text-muted-foreground">
                            Forza, core e mobilità
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                            <span className="font-semibold text-foreground">
                              {drylandWorkout.title}
                            </span>
                            <span>• {drylandWorkout.duration}</span>
                            <span>• {drylandWorkout.difficulty}</span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {drylandWorkout.description}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {drylandWorkout.sections.map((section, idx) => (
                              <Button
                                key={idx}
                                type="button"
                                size="sm"
                                variant={idx === activeDrySectionIndex ? "default" : "outline"}
                                onClick={() => setActiveDrySectionIndex(idx)}
                              >
                                {section.title}
                              </Button>
                            ))}
                          </div>
                          {activeDrySection ? (
                            <div className="rounded-lg border border-border bg-background/60 p-4">
                              <div className="mb-2 flex flex-wrap items-center gap-2">
                                <Badge variant="neon">{activeDrySection.title}</Badge>
                                {activeDrySection.notes && (
                                  <span className="text-xs text-muted-foreground">
                                    {activeDrySection.notes}
                                  </span>
                                )}
                              </div>
                              <div className="space-y-3">
                                {activeDrySection.exercises.slice(0, 3).map((exercise, exIdx) => (
                                  <div
                                    key={exIdx}
                                    className="rounded-md bg-background/80 p-3 text-sm"
                                  >
                                    <div className="font-medium text-foreground">
                                      {exercise.name}
                                    </div>
                                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                      {getExerciseDetails(exercise).map(
                                        (detail, detailIdx) => (
                                          <span key={detailIdx}>{detail}</span>
                                        )
                                      )}
                                    </div>
                                    {exercise.notes && (
                                      <p className="mt-2 text-xs text-muted-foreground">
                                        {exercise.notes}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                              {activeDrySection.exercises.length > 3 && (
                                <p className="mt-3 text-xs text-muted-foreground">
                                  +{activeDrySection.exercises.length - 3} esercizi aggiuntivi. Apri la scheda completa dal coach.
                                </p>
                              )}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          Allenamento dryland non disponibile. Sincronizza nuove attività.
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-3 py-8 text-center">
                      <Sparkles className="h-10 w-10 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">
                        Nessun allenamento generato. Premi il pulsante per creare i tuoi allenamenti personalizzati.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="session-iq" className="mt-3 space-y-3">
            <section className="surface-panel p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-display">Session IQ</h3>
                  <p>
                    Analisi dell&apos;ultima sessione sincronizzata
                  </p>
                </div>
                <Button variant="outline-neon" size="sm" asChild>
                  <a href="/session-iq">Apri archivio</a>
                </Button>
              </div>
              <div>
                {latestSessionInsight ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="rounded-full bg-primary/10 px-2 py-1 text-primary">
                        Ultima sessione
                      </span>
                      {formatDate(latestSessionInsight.activity_date) && (
                        <span>📅 {formatDate(latestSessionInsight.activity_date)}</span>
                      )}
                      {formatDistance(latestSessionInsight.activity_distance_meters) && (
                        <span>
                          🏊 {formatDistance(latestSessionInsight.activity_distance_meters)}
                        </span>
                      )}
                      {formatTime(latestSessionInsight.activity_duration_seconds) && (
                        <span>
                          ⏱ {formatTime(latestSessionInsight.activity_duration_seconds)}
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">
                      {latestSessionInsight.title}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {latestSessionInsight.summary}
                    </p>
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
              </div>
            </section>
          </TabsContent>

          <TabsContent value="chat" className="mt-3">
            <section className="surface-panel p-6">
              <div className="p-6 space-y-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <MessageSquare className="size-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Chat AI</p>
                    <p className="text-xs text-muted-foreground">
                      Funzione in arrivo. Per ora usa gli insights e i piani generati.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Chat AI in arrivo"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="bg-background/60"
                    disabled
                  />
                  <Button size="icon" variant="ghost-neon" disabled>
                    <MessageSquare className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </section>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  )
}
