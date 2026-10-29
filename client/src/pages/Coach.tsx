"use client"

import AppLayout from "@/components/AppLayout"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Chip } from "@/components/corsia/Chip"
import { Metric, type MetricProps } from "@/components/corsia/Metric"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AIChatBox } from "@/components/AIChatBox"
import { CHAT_MAX_MESSAGE_CHARS, useCoachChat } from "@/hooks/useCoachChat"
import { useSessionArchive, type ArchiveRange, type ArchiveSort } from "@/hooks/useSessionArchive"
import { trpc } from "@/lib/trpc"
import {
  formatDayMonthYear,
  formatDistance as formatDistanceValue,
  formatDurationParts,
  formatInteger,
  NO_VALUE,
} from "@/lib/format"
import { metricHeaders } from "@/lib/swim-metrics-view"
import { STREAK_UNIT } from "@/lib/profile-stats"
import { TSB_READING_LABELS } from "@shared/swimMetrics"
import { toast } from "sonner"
import { Sparkles, AlertTriangle } from "lucide-react"
import { useSearch } from "wouter"

const sectionTitle = "text-[17px] font-bold"
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

/** «1,5 km» / «800 m», null without a distance. */
const formatDistance = (meters?: number | null) => {
  const value = formatDistanceValue(meters)
  return value === NO_VALUE ? null : value
}

/** «50 min» / «1:02 h», null without a duration. */
const formatTime = (seconds?: number | null) => {
  const parts = formatDurationParts(seconds)
  return parts ? `${parts.value} ${parts.unit}` : null
}

/** «12 mar 2025», null without a valid date. */
const formatDate = (date?: string | null) => {
  const value = formatDayMonthYear(date)
  return value === NO_VALUE ? null : value
}

/** «12 mar 2025 · 1,5 km · 50 min» from a session analysis row (missing parts skipped). */
const sessionMeta = (entry: any) =>
  [
    formatDate(entry.activity_date),
    formatDistance(entry.activity_distance_meters),
    formatTime(entry.activity_duration_seconds),
  ]
    .filter(Boolean)
    .join(" · ")

const SUGGESTED_CHAT_PROMPTS = [
  "Come imposto la prossima seduta in base al mio recupero?",
  "Guardando i miei dati, cosa devo migliorare prima?",
  "Mi prepari 2 obiettivi concreti per questa settimana?",
  "Come leggo il mio passo soglia e le zone di intensità?",
]

const insightNumberFmt = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 })
/** Number quoted in an insight, Italian style: 4.5% → «4,5 %», -3 → «−3». */
const formatInsightNumber = (value: number, percent: boolean) =>
  `${value < 0 ? "−" : ""}${insightNumberFmt.format(Math.abs(value))}${percent ? " %" : ""}`

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

/** One generated workout (pool or dry-land): meta, section picker, first three exercises. */
function WorkoutDetail({
  workout,
  kicker,
  activeIndex,
  onSelect,
  activeSection,
  moreLabel,
}: {
  workout: GeneratedWorkout
  kicker: string
  activeIndex: number
  onSelect: (index: number) => void
  activeSection: WorkoutSection | null
  moreLabel: string
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-muted-foreground">{kicker}</p>
        <h3 className="mt-1 text-base font-bold text-foreground">{workout.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {[workout.duration, workout.difficulty].filter(Boolean).join(" · ")}
        </p>
      </div>
      <p className="text-sm text-muted-foreground">{workout.description}</p>
      <div role="group" aria-label="Parti dell'allenamento" className="flex flex-wrap gap-2">
        {workout.sections.map((section, idx) => (
          <Button
            key={idx}
            type="button"
            size="sm"
            variant={idx === activeIndex ? "default" : "outline"}
            aria-pressed={idx === activeIndex}
            onClick={() => onSelect(idx)}
          >
            {section.title}
          </Button>
        ))}
      </div>
      {activeSection ? (
        <div className="rounded-xl bg-raised p-4">
          <h4 className="text-sm font-semibold text-foreground">{activeSection.title}</h4>
          {activeSection.notes && (
            <p className="mt-1 text-xs text-muted-foreground">{activeSection.notes}</p>
          )}
          <ul className="mt-3 divide-y divide-border">
            {activeSection.exercises.slice(0, 3).map((exercise, exIdx) => (
              <li key={exIdx} className="py-3 text-sm first:pt-0 last:pb-0">
                <p className="font-medium text-foreground">{exercise.name}</p>
                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {getExerciseDetails(exercise).map((detail, detailIdx) => (
                    <span key={detailIdx}>{detail}</span>
                  ))}
                </p>
                {exercise.notes && (
                  <p className="mt-2 text-xs text-muted-foreground">{exercise.notes}</p>
                )}
              </li>
            ))}
          </ul>
          {activeSection.exercises.length > 3 && (
            <p className="mt-3 text-xs text-muted-foreground">
              +{activeSection.exercises.length - 3} esercizi aggiuntivi. {moreLabel}
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}

export default function Coach() {
  const search = useSearch()
  const [activeTab, setActiveTab] = useState<"insights" | "workouts" | "session-iq" | "chat">("insights")
  const [activeInsightIndex, setActiveInsightIndex] = useState(0)
  const [activePoolSectionIndex, setActivePoolSectionIndex] = useState(0)
  const [activeDrySectionIndex, setActiveDrySectionIndex] = useState(0)
  const [showSessionArchive, setShowSessionArchive] = useState(false)
  const [activeWorkout, setActiveWorkout] = useState<"pool" | "dryland">("pool")
  const [isGenerating, setIsGenerating] = useState(false)
  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  })
  const chat = useCoachChat(Number((meQuery.data as any)?.id) || null)
  // The swim metrics (the same as Statistiche) and the AI advice built on them.
  const { data: metrics } = trpc.statistics.getMetrics.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
  const { data: insights } = trpc.statistics.getInsights.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

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
      const message = error instanceof Error ? error.message : "Generazione allenamenti non riuscita."
      toast.error(message)
      console.error("Generation failed:", error)
    } finally {
      setIsGenerating(false)
    }
  }

  const workoutsData = workoutsQuery.data
  const poolWorkout = workoutsData?.pool as GeneratedWorkout | undefined
  const drylandWorkout = workoutsData?.dryland as GeneratedWorkout | undefined
  const canGenerate = workoutsData?.canGenerate ?? true
  const generationBlockedReason = workoutsData?.generationBlockedReason ?? null

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
    if (!insights?.length) return []
    return insights.map((text, index) => {
      const metricMatch = text.match(/(-?\d+(?:\.\d+)?)(%?)/)
      return {
        title: `Consiglio ${index + 1}`,
        description: text.replace(/\*\*/g, ""),
        metric: metricMatch ? formatInsightNumber(Number(metricMatch[1]), metricMatch[2] === "%") : null,
      }
    })
  }, [insights])

  const safeInsightIndex = insightCards.length
    ? Math.min(activeInsightIndex, insightCards.length - 1)
    : 0
  const activeInsight = insightCards[safeInsightIndex]

  // Key swim metrics with a value (a metric without data is not shown); the rest is in Statistiche.
  const keyMetrics = useMemo((): Array<MetricProps & { id: string }> => {
    if (!metrics) return []
    const headers = metricHeaders(metrics)
    const tiles: Array<(MetricProps & { id: string }) | null> = [
      headers.css.value ? { id: "css", value: headers.css.value, unit: headers.css.unit, label: "Passo soglia" } : null,
      headers.intensity.value
        ? { id: "intensity", value: headers.intensity.value, unit: headers.intensity.unit, label: "Intensità" }
        : null,
      headers.volume.value
        ? { id: "volume", value: headers.volume.value, unit: headers.volume.unit, label: "Volume" }
        : null,
      headers.volume.value
        ? { id: "streak", value: formatInteger(metrics.volume.streakWeeks), unit: STREAK_UNIT, label: "Serie" }
        : null,
    ]
    return tiles.filter((tile) => tile !== null)
  }, [metrics])

  const archive = useSessionArchive(sessionInsightsQuery.data)
  const sessionEntries = archive.entries
  const latestSessionInsight = archive.latest
  const filteredArchiveEntries = archive.filtered
  const parsedSessionBullets = latestSessionInsight?._bullets ?? []
  const latestSessionMeta = latestSessionInsight ? sessionMeta(latestSessionInsight) : ""

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

  // Form − fatigue reading (TrainingPeaks conventions), «In costruzione».
  const balanceReading = metrics?.load.today ? TSB_READING_LABELS[metrics.load.today.reading] : null

  const lastSyncLabel = useMemo(
    () => formatDate(latestSessionInsight?.activity_date),
    [latestSessionInsight]
  )

  useEffect(() => {
    const params = new URLSearchParams(search)
    const tab = params.get("tab")
    const workout = params.get("workout")
    if (tab === "insights" || tab === "workouts" || tab === "session-iq" || tab === "chat") {
      setActiveTab(tab)
    } else {
      setActiveTab("insights")
    }

    if (workout === "pool" || workout === "dryland") {
      setActiveWorkout(workout)
    }
  }, [search])

  const summaryItems = [
    ...(balanceReading
      ? [{ label: "Equilibrio", value: balanceReading.charAt(0).toUpperCase() + balanceReading.slice(1) }]
      : []),
    { label: "Nuotate analizzate", value: formatInteger(sessionInsightsQuery.data?.length ?? 0) },
  ]

  return (
    <AppLayout>
      <div className="space-y-4">
        <section aria-label="Riepilogo del coach" className="surface-panel p-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            {summaryItems.map((item) => (
              <div key={item.label} className="min-w-0">
                <dt className="text-xs font-medium text-muted-foreground">{item.label}</dt>
                <dd className="mt-1 truncate text-[15px] font-semibold text-foreground">{item.value}</dd>
              </div>
            ))}
            {lastSyncLabel ? (
              <div className="min-w-0">
                <dt className="text-xs font-medium text-muted-foreground">Ultima analisi</dt>
                <dd className="mt-1 truncate text-[15px] font-semibold text-foreground">{lastSyncLabel}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "insights" | "workouts" | "session-iq" | "chat")} className="space-y-3">
          <TabsList aria-label="Sezioni del coach">
            <TabsTrigger value="insights">Consigli</TabsTrigger>
            <TabsTrigger value="workouts">Piano</TabsTrigger>
            <TabsTrigger value="session-iq">Analisi</TabsTrigger>
            <TabsTrigger value="chat">Chat</TabsTrigger>
          </TabsList>

          <TabsContent value="insights" className="mt-3">
            <div className="flex flex-col gap-4">
              {keyMetrics.length > 0 ? (
                <section aria-label="Metriche" className="surface-panel order-2 p-4 lg:order-1">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
                    {keyMetrics.map(({ id, ...metric }) => (
                      <Metric key={id} size="responsive" {...metric} />
                    ))}
                  </div>
                </section>
              ) : null}

              <div className="order-1 lg:order-2">
                {insightCards.length > 0 ? (
                  <section aria-label="Consigli" className="surface-panel space-y-4 p-4">
                    <div role="group" aria-label="Scegli il consiglio" className="flex flex-wrap items-center gap-2">
                      {insightCards.map((_, index) => (
                        <Button
                          key={index}
                          type="button"
                          size="icon-sm"
                          variant={index === safeInsightIndex ? "default" : "outline"}
                          className="rounded-full tabular-nums"
                          aria-label={`Consiglio ${index + 1}`}
                          aria-pressed={index === safeInsightIndex}
                          onClick={() => setActiveInsightIndex(index)}
                        >
                          {index + 1}
                        </Button>
                      ))}
                    </div>
                    <div className="flex items-start gap-3 border-t border-border pt-4">
                      <Sparkles className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <h2 className="text-base font-bold text-foreground">
                            {activeInsight?.title ?? "Consiglio"}
                          </h2>
                          {activeInsight?.metric ? <Chip>{activeInsight.metric}</Chip> : null}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {activeInsight?.description ?? "Scegli un consiglio da leggere."}
                        </p>
                      </div>
                    </div>
                  </section>
                ) : (
                  <section className="surface-panel p-4 text-sm text-muted-foreground">
                    Nessun consiglio disponibile. Sincronizza nuove attività per ricevere i consigli del coach.
                  </section>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="workouts" className="mt-3 space-y-3">
            <section aria-labelledby="coach-workouts-title" className="surface-panel space-y-4 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 id="coach-workouts-title" className={sectionTitle}>Allenamenti AI</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Allenamenti personalizzati in base alle tue statistiche.
                    {generatedAtLabel && (
                      <span className="ml-1">Generati il {generatedAtLabel}.</span>
                    )}
                  </p>
                </div>
                <div className="flex flex-col items-start gap-1 sm:items-end">
                  <Button
                    size="sm"
                    onClick={handleGenerate}
                    disabled={!canGenerate || isGenerating}
                  >
                    <Sparkles
                      className={`size-4 ${isGenerating ? "animate-spin" : ""}`}
                      aria-hidden
                    />
                    {isGenerating ? "Generazione in corso…" : "Genera allenamenti"}
                  </Button>
                  {cooldownLabel && (
                    <span className="text-xs text-muted-foreground">{cooldownLabel}</span>
                  )}
                  {!canGenerate && !cooldownLabel && generationBlockedReason && (
                    <span className="text-xs text-muted-foreground">{generationBlockedReason}</span>
                  )}
                </div>
              </div>

              {(poolWorkout || drylandWorkout) ? (
                <div className="space-y-4 border-t border-border pt-4">
                  <div role="group" aria-label="Tipo di allenamento" className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={activeWorkout === "pool" ? "default" : "outline"}
                      aria-pressed={activeWorkout === "pool"}
                      onClick={() => setActiveWorkout("pool")}
                    >
                      In vasca
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={activeWorkout === "dryland" ? "default" : "outline"}
                      aria-pressed={activeWorkout === "dryland"}
                      onClick={() => setActiveWorkout("dryland")}
                    >
                      A secco
                    </Button>
                  </div>

                  {activeWorkout === "pool" ? (
                    poolWorkout ? (
                      <WorkoutDetail
                        workout={poolWorkout}
                        kicker="Generato dall'AI"
                        activeIndex={activePoolSectionIndex}
                        onSelect={setActivePoolSectionIndex}
                        activeSection={activePoolSection}
                        moreLabel="Apri l'allenamento completo nel dettaglio sessione."
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Allenamento in vasca non disponibile. Sincronizza nuove attività.
                      </p>
                    )
                  ) : drylandWorkout ? (
                    <WorkoutDetail
                      workout={drylandWorkout}
                      kicker="Forza, core e mobilità"
                      activeIndex={activeDrySectionIndex}
                      onSelect={setActiveDrySectionIndex}
                      activeSection={activeDrySection}
                      moreLabel="Apri la scheda completa dal coach."
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Allenamento a secco non disponibile. Sincronizza nuove attività.
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 border-t border-border py-8 text-center">
                  <Sparkles className="size-8 text-muted-foreground" aria-hidden />
                  <p className="text-sm text-muted-foreground">
                    Nessun allenamento generato. Tocca «Genera allenamenti» per creare i tuoi allenamenti personalizzati.
                  </p>
                </div>
              )}
            </section>
          </TabsContent>

          <TabsContent value="session-iq" className="mt-3 space-y-3">
            <section aria-labelledby="coach-sessions-title" className="surface-panel space-y-4 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 id="coach-sessions-title" className={sectionTitle}>Analisi delle nuotate</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    L&apos;analisi dell&apos;ultima nuotata sincronizzata.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  aria-expanded={showSessionArchive}
                  onClick={() => setShowSessionArchive((prev) => !prev)}
                >
                  {showSessionArchive ? "Chiudi archivio" : "Apri archivio"}
                </Button>
              </div>

              {latestSessionInsight ? (
                <div className="space-y-3 border-t border-border pt-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Chip>Ultima nuotata</Chip>
                    {latestSessionMeta ? (
                      <span className="tabular-nums">{latestSessionMeta}</span>
                    ) : null}
                  </div>
                  <h3 className="text-base font-bold text-foreground">
                    {latestSessionInsight.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {latestSessionInsight.summary}
                  </p>
                  {parsedSessionBullets.length > 0 && (
                    <ul className="list-disc space-y-2 pl-5 text-sm text-foreground marker:text-muted-foreground">
                      {parsedSessionBullets.map((bullet: string, idx: number) => (
                        <li key={idx}>{bullet}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <p className="border-t border-border pt-4 text-sm text-muted-foreground">
                  Nessuna analisi disponibile. Sincronizza una nuova nuotata per ricevere l&apos;analisi.
                </p>
              )}

              {showSessionArchive ? (
                <div className="space-y-3 border-t border-border pt-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-foreground">Archivio analisi</h3>
                    <Chip className="tabular-nums">
                      {filteredArchiveEntries.length} di {sessionEntries.length} analisi
                    </Chip>
                  </div>

                  {sessionEntries.length > 0 ? (
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_170px_170px]">
                      <Input
                        value={archive.search}
                        onChange={(event) => archive.setSearch(event.target.value)}
                        placeholder="Cerca nelle analisi…"
                        aria-label="Cerca nelle analisi"
                      />
                      <Select value={archive.range} onValueChange={(value) => archive.setRange(value as ArchiveRange)}>
                        <SelectTrigger aria-label="Periodo">
                          <SelectValue placeholder="Periodo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tutto</SelectItem>
                          <SelectItem value="7d">Ultimi 7 giorni</SelectItem>
                          <SelectItem value="30d">Ultimi 30 giorni</SelectItem>
                          <SelectItem value="90d">Ultimi 90 giorni</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select
                        value={archive.sort}
                        onValueChange={(value) => archive.setSort(value as ArchiveSort)}
                      >
                        <SelectTrigger aria-label="Ordina">
                          <SelectValue placeholder="Ordina" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="recent">Più recenti</SelectItem>
                          <SelectItem value="oldest">Meno recenti</SelectItem>
                          <SelectItem value="distance">Distanza</SelectItem>
                          <SelectItem value="duration">Durata</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}

                  {filteredArchiveEntries.length > 0 ? (
                    <ul className="max-h-[42dvh] space-y-2 overflow-y-auto pr-1">
                      {filteredArchiveEntries.map((entry) => {
                        const bullets = entry._bullets.slice(0, 2)
                        const meta = sessionMeta(entry)
                        return (
                          <li key={entry.id} className="rounded-xl bg-raised p-3">
                            {meta ? (
                              <p className="text-xs text-muted-foreground tabular-nums">{meta}</p>
                            ) : null}
                            <p className="mt-1 text-sm font-semibold text-foreground">{entry.title}</p>
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{entry.summary}</p>
                            {bullets.length > 0 ? (
                              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-foreground marker:text-muted-foreground">
                                {bullets.map((bullet: string, idx: number) => (
                                  <li key={idx} className="line-clamp-1">{bullet}</li>
                                ))}
                              </ul>
                            ) : null}
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {sessionEntries.length === 0
                        ? "Archivio vuoto. Si riempie dopo la prima analisi."
                        : "Nessun risultato con questi filtri."}
                    </p>
                  )}
                </div>
              ) : null}
            </section>
          </TabsContent>

          <TabsContent value="chat" className="mt-3 space-y-3">
            <section aria-labelledby="coach-chat-title" className="surface-panel space-y-3 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 id="coach-chat-title" className={sectionTitle}>Chat con il coach</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Risposte basate sui tuoi dati reali (nuotate, metriche e analisi).
                  </p>
                  {chat.provider === "gemini" && (
                    <Chip className="mt-2">Fornitore attivo: Gemini</Chip>
                  )}
                  {chat.provider === "rule_based" && (
                    <Chip className="mt-2">
                      <AlertTriangle className="size-3.5 text-warning" aria-hidden />
                      Modalità base (AI cloud non raggiungibile)
                    </Chip>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={chat.messages.length === 0 || chat.isPending}
                  onClick={chat.clear}
                >
                  Svuota chat
                </Button>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <Input
                  value={chat.goal}
                  onChange={(e) => chat.setGoal(e.target.value)}
                  placeholder="Obiettivo attuale (es. migliorare il passo sui 100 m)"
                  aria-label="Obiettivo attuale"
                  maxLength={120}
                />
                <Input
                  value={chat.constraints}
                  onChange={(e) => chat.setConstraints(e.target.value)}
                  placeholder="Vincoli (es. 2 nuotate, spalla delicata)"
                  aria-label="Vincoli"
                  maxLength={240}
                />
              </div>
            </section>
            <AIChatBox
              messages={chat.messages}
              onSendMessage={chat.send}
              isLoading={chat.isPending}
              placeholder="Scrivi al coach (es. «Come imposto la nuotata di domani?»)"
              emptyStateMessage="Parti da una domanda concreta sul tuo allenamento."
              suggestedPrompts={SUGGESTED_CHAT_PROMPTS}
              maxInputLength={CHAT_MAX_MESSAGE_CHARS}
              height={520}
            />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  )
}
