"use client"

import AppLayout from "@/components/AppLayout"
import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Chip } from "@/components/corsia/Chip"
import { Metric, type MetricProps } from "@/components/corsia/Metric"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AIChatBox, type Message as ChatMessage } from "@/components/AIChatBox"
import { trpc } from "@/lib/trpc"
import {
  formatDayMonthYear,
  formatDistance as formatDistanceValue,
  formatDurationParts,
  formatInteger,
  NO_VALUE,
} from "@/lib/format"
import { toast } from "sonner"
import { Sparkles, AlertTriangle } from "lucide-react"
import { useLocation } from "wouter"

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

const parseBulletsSafe = (value: any): string[] => {
  if (!value) return []
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean)
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item)).filter(Boolean)
      }
    } catch {
      // ignore parse errors and fallback to plain string
    }
    return value.trim().length > 0 ? [value] : []
  }
  return []
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
    { label: "Prestazione", value: performance },
    { label: "Costanza", value: consistency },
    { label: "Recupero", value: recovery },
    { label: "Efficienza", value: efficiency },
  ].filter((item) => item.value !== null && item.value !== undefined)

  if (!candidates.length) return "Analisi in corso"
  candidates.sort((a, b) => (a.value ?? 0) - (b.value ?? 0))
  return candidates[0].label
}

const CHAT_STORAGE_KEY_BASE = "coach_chat_history_v1"
const CHAT_GOAL_STORAGE_KEY_BASE = "coach_chat_goal_v1"
const CHAT_CONSTRAINTS_STORAGE_KEY_BASE = "coach_chat_constraints_v1"
const CHAT_MAX_MESSAGE_CHARS = 2000
const CHAT_MAX_HISTORY = 20

const clampChatContent = (value: string) => {
  const normalized = value.trim()
  if (normalized.length <= CHAT_MAX_MESSAGE_CHARS) return normalized
  return `${normalized.slice(0, CHAT_MAX_MESSAGE_CHARS - 1).trimEnd()}…`
}

const sanitizeChatMessages = (messages: ChatMessage[]): ChatMessage[] =>
  messages
    .map((item): ChatMessage => ({
      role: item.role === "assistant" ? "assistant" : "user",
      content: clampChatContent(String(item.content ?? "")),
    }))
    .filter((item) => item.content.length > 0)
    .slice(-CHAT_MAX_HISTORY)

const scopedStorageKey = (baseKey: string, userId: number) => `${baseKey}:u:${userId}`

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
  const [location] = useLocation()
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatGoal, setChatGoal] = useState("")
  const [chatConstraints, setChatConstraints] = useState("")
  const [chatProvider, setChatProvider] = useState<"forge" | "gemini" | "rule_based" | null>(null)
  const fallbackToastShownRef = useRef(false)
  const [activeTab, setActiveTab] = useState<"insights" | "workouts" | "session-iq" | "chat">("insights")
  const [activeInsightIndex, setActiveInsightIndex] = useState(0)
  const [activePoolSectionIndex, setActivePoolSectionIndex] = useState(0)
  const [activeDrySectionIndex, setActiveDrySectionIndex] = useState(0)
  const [showSessionArchive, setShowSessionArchive] = useState(false)
  const [archiveSearchTerm, setArchiveSearchTerm] = useState("")
  const [archiveRange, setArchiveRange] = useState<"all" | "7d" | "30d" | "90d">("all")
  const [archiveSort, setArchiveSort] = useState<"recent" | "oldest" | "distance" | "duration">("recent")
  const [activeWorkout, setActiveWorkout] = useState<"pool" | "dryland">("pool")
  const [isGenerating, setIsGenerating] = useState(false)
  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  })
  const authUserId = Number((meQuery.data as any)?.id)
  const isScopedStorageReady = Number.isFinite(authUserId) && authUserId > 0

  const chatStorageKeys = useMemo(() => {
    if (!isScopedStorageReady) return null
    return {
      history: scopedStorageKey(CHAT_STORAGE_KEY_BASE, authUserId),
      goal: scopedStorageKey(CHAT_GOAL_STORAGE_KEY_BASE, authUserId),
      constraints: scopedStorageKey(CHAT_CONSTRAINTS_STORAGE_KEY_BASE, authUserId),
    }
  }, [authUserId, isScopedStorageReady])

  const { data: advanced } = trpc.statistics.getAdvanced.useQuery(
    { days: 30 },
    { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false }
  )

  // Read-only: fetch existing workouts (no generation)
  const workoutsQuery = trpc.aiCoach.getWorkouts.useQuery(undefined, {
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  })

  const utils = trpc.useUtils()

  const generateMutation = trpc.aiCoach.generateWorkouts.useMutation()
  const chatMutation = trpc.aiCoach.chat.useMutation()

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

  const suggestedChatPrompts = useMemo(
    () => [
      "Come imposto la prossima seduta in base al mio recupero?",
      "Guardando i miei dati, cosa devo migliorare prima?",
      "Mi prepari 2 obiettivi concreti per questa settimana?",
      `Che lavoro faccio per migliorare in ${getFocusLabel(
        advanced?.performanceIndex,
        advanced?.consistencyScore,
        advanced?.recoveryReadinessScore,
        advanced?.swimmingEfficiencyIndex
      ).toLowerCase()}?`,
    ],
    [advanced]
  )

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
        title: `Consiglio ${index + 1}`,
        description: text.replace(/\*\*/g, ""),
        metric: metricMatch?.[1] ?? null,
      }
    })
  }, [advanced?.insights])

  const safeInsightIndex = insightCards.length
    ? Math.min(activeInsightIndex, insightCards.length - 1)
    : 0
  const activeInsight = insightCards[safeInsightIndex]

  const keyMetrics = useMemo((): Array<MetricProps & { id: string }> => {
    if (!advanced) return []
    const recovery = advanced.recoveryReadinessScore ?? null
    const streakCurrent = advanced.streak?.current ?? 0
    const metrics: Array<MetricProps & { id: string }> = [
      { id: "performance", value: formatInteger(advanced.performanceIndex ?? 0), unit: "/100", label: "Prestazione" },
      { id: "consistency", value: formatInteger(advanced.consistencyScore ?? 0), unit: "/100", label: "Costanza" },
    ]
    if (recovery !== null) {
      metrics.push({ id: "recovery", value: formatInteger(recovery), unit: "/100", label: "Recupero" })
    }
    metrics.push({
      id: "streak",
      value: formatInteger(streakCurrent),
      unit: streakCurrent === 1 ? "giorno" : "giorni",
      label: `Serie, record ${formatInteger(advanced.streak?.record ?? 0)}`,
    })
    return metrics
  }, [advanced])

  // Advanced scores with a value only: a metric without data is not shown.
  const advancedMetrics = useMemo(
    () =>
      [
        { key: "SEI", value: advanced?.swimmingEfficiencyIndex },
        { key: "TCI", value: advanced?.technicalConsistencyIndex },
        { key: "SER", value: advanced?.strokeEfficiencyRating },
        { key: "ACS", value: advanced?.aerobicCapacityScore },
        { key: "RRS", value: advanced?.recoveryReadinessScore },
        { key: "POI", value: advanced?.progressiveOverloadIndex },
      ].filter(
        (metric): metric is { key: string; value: number } =>
          metric.value !== null && metric.value !== undefined && Number.isFinite(metric.value)
      ),
    [advanced]
  )

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

  const filteredArchiveEntries = useMemo(() => {
    const term = archiveSearchTerm.trim().toLowerCase()
    const now = Date.now()
    const rangeMs =
      archiveRange === "7d"
        ? 7 * 24 * 60 * 60 * 1000
        : archiveRange === "30d"
          ? 30 * 24 * 60 * 60 * 1000
          : archiveRange === "90d"
            ? 90 * 24 * 60 * 60 * 1000
            : null

    const list = sessionEntries.filter((entry: any) => {
      if (rangeMs !== null) {
        if (!entry._date) return false
        if (now - entry._date.getTime() > rangeMs) return false
      }

      if (!term) return true

      const bulletText = parseBulletsSafe(entry.bullets).join(" ").toLowerCase()
      const content = `${String(entry.title ?? "")} ${String(entry.summary ?? "")} ${bulletText}`.toLowerCase()
      return content.includes(term)
    })

    list.sort((a: any, b: any) => {
      if (archiveSort === "oldest") return (a._sort ?? 0) - (b._sort ?? 0)
      if (archiveSort === "distance") {
        return Number(b.activity_distance_meters ?? 0) - Number(a.activity_distance_meters ?? 0)
      }
      if (archiveSort === "duration") {
        return Number(b.activity_duration_seconds ?? 0) - Number(a.activity_duration_seconds ?? 0)
      }
      return (b._sort ?? 0) - (a._sort ?? 0)
    })

    return list
  }, [archiveRange, archiveSearchTerm, archiveSort, sessionEntries])

  const parsedSessionBullets = useMemo(() => {
    if (!latestSessionInsight) return []
    return parseBulletsSafe(latestSessionInsight.bullets)
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

  const lastSyncLabel = useMemo(
    () => formatDate(latestSessionInsight?.activity_date),
    [latestSessionInsight]
  )

  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
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
  }, [location])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!chatStorageKeys) return

    // Reset in-memory state whenever account scope changes, then load scoped data.
    setChatMessages([])
    setChatGoal("")
    setChatConstraints("")
    setChatProvider(null)

    try {
      const raw = window.localStorage.getItem(chatStorageKeys.history)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          const safeMessages: ChatMessage[] = parsed
            .filter((item) =>
              item &&
              typeof item === "object" &&
              (item.role === "user" || item.role === "assistant") &&
              typeof item.content === "string"
            )
            .map((item): ChatMessage => ({
              role: item.role === "assistant" ? "assistant" : "user",
              content: clampChatContent(item.content as string),
            }))
            .filter((item) => item.content.length > 0)
            .slice(-CHAT_MAX_HISTORY)
          if (safeMessages.length > 0) {
            setChatMessages(safeMessages)
          }
        }
      }
    } catch {
      // Ignore corrupted local chat storage
    }

    const storedGoal = window.localStorage.getItem(chatStorageKeys.goal)
    const storedConstraints = window.localStorage.getItem(chatStorageKeys.constraints)
    if (storedGoal) setChatGoal(storedGoal)
    if (storedConstraints) setChatConstraints(storedConstraints)

    // Cleanup legacy non-scoped keys to prevent accidental cross-account reuse.
    window.localStorage.removeItem(CHAT_STORAGE_KEY_BASE)
    window.localStorage.removeItem(CHAT_GOAL_STORAGE_KEY_BASE)
    window.localStorage.removeItem(CHAT_CONSTRAINTS_STORAGE_KEY_BASE)
  }, [chatStorageKeys])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!chatStorageKeys) return
    try {
      window.localStorage.setItem(chatStorageKeys.history, JSON.stringify(sanitizeChatMessages(chatMessages)))
    } catch {
      // Best-effort persistence
    }
  }, [chatMessages, chatStorageKeys])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!chatStorageKeys) return
    window.localStorage.setItem(chatStorageKeys.goal, chatGoal)
  }, [chatGoal, chatStorageKeys])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!chatStorageKeys) return
    window.localStorage.setItem(chatStorageKeys.constraints, chatConstraints)
  }, [chatConstraints, chatStorageKeys])

  const handleSendChatMessage = async (content: string) => {
    if (chatMutation.isPending) return

    const originalTrimmed = content.trim()
    const normalizedUserContent = clampChatContent(originalTrimmed)
    if (!normalizedUserContent) return
    if (originalTrimmed.length > CHAT_MAX_MESSAGE_CHARS) {
      toast.info("Messaggio troppo lungo: inviati i primi 2000 caratteri.")
    }

    const userMessage: ChatMessage = { role: "user", content: normalizedUserContent }
    const nextMessages = sanitizeChatMessages([...chatMessages, userMessage])
    setChatMessages(nextMessages)

    try {
      const response = await chatMutation.mutateAsync({
        messages: nextMessages.map((msg) => ({
          role: msg.role === "assistant" ? "assistant" : "user",
          content: clampChatContent(msg.content),
        })),
        goal: chatGoal.trim() || null,
        constraints: chatConstraints.trim() || null,
      })

      const assistantContent = clampChatContent(String(response.message ?? ""))
      if (!assistantContent) {
        throw new Error("Risposta vuota dal Coach AI.")
      }
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: assistantContent,
      }
      setChatProvider((response.provider as "forge" | "gemini" | "rule_based" | undefined) ?? null)
      if (response.fallback && !fallbackToastShownRef.current) {
        toast.warning("Coach in modalità base: risposte semplificate (controlla la configurazione AI server).")
        fallbackToastShownRef.current = true
      }
      if (!response.fallback) {
        fallbackToastShownRef.current = false
      }
      setChatMessages((prev) => sanitizeChatMessages([...prev, assistantMessage]))
    } catch (error) {
      const message = error instanceof Error ? error.message : "Impossibile contattare il Coach AI."
      toast.error(message)
    }
  }

  const clearChat = () => {
    setChatMessages([])
    setChatProvider(null)
    if (typeof window !== "undefined" && chatStorageKeys) {
      window.localStorage.removeItem(chatStorageKeys.history)
    }
  }

  const summaryItems = [
    { label: "Focus di oggi", value: focusLabel },
    ...(advanced?.recoveryReadinessScore !== null && advanced?.recoveryReadinessScore !== undefined
      ? [{ label: "Condizione", value: conditionLabel }]
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
              {keyMetrics.length > 0 || advancedMetrics.length > 0 ? (
                <section aria-label="Punteggi" className="surface-panel order-2 p-4 lg:order-1">
                  {keyMetrics.length > 0 ? (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
                      {keyMetrics.map(({ id, ...metric }) => (
                        <Metric key={id} size="responsive" {...metric} />
                      ))}
                    </div>
                  ) : null}
                  {advancedMetrics.length > 0 ? (
                    <div className="mt-4 grid grid-cols-3 gap-x-4 gap-y-4 border-t border-border pt-4 sm:grid-cols-6">
                      {advancedMetrics.map((metric) => (
                        <Metric key={metric.key} value={formatInteger(metric.value)} label={metric.key} size="sm" />
                      ))}
                    </div>
                  ) : null}
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
                    {sessionMeta(latestSessionInsight) ? (
                      <span className="tabular-nums">{sessionMeta(latestSessionInsight)}</span>
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
                      {filteredArchiveEntries.length}/{sessionEntries.length}
                    </Chip>
                  </div>

                  {sessionEntries.length > 0 ? (
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_170px_170px]">
                      <Input
                        value={archiveSearchTerm}
                        onChange={(event) => setArchiveSearchTerm(event.target.value)}
                        placeholder="Cerca nelle analisi…"
                        aria-label="Cerca nelle analisi"
                      />
                      <Select value={archiveRange} onValueChange={(value) => setArchiveRange(value as "all" | "7d" | "30d" | "90d")}>
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
                        value={archiveSort}
                        onValueChange={(value) =>
                          setArchiveSort(value as "recent" | "oldest" | "distance" | "duration")
                        }
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
                      {filteredArchiveEntries.map((entry: any) => {
                        const bullets = parseBulletsSafe(entry.bullets).slice(0, 2)
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
                  {chatProvider === "gemini" && (
                    <Chip className="mt-2">Provider attivo: Gemini</Chip>
                  )}
                  {chatProvider === "rule_based" && (
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
                  disabled={chatMessages.length === 0 || chatMutation.isPending}
                  onClick={clearChat}
                >
                  Svuota chat
                </Button>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <Input
                  value={chatGoal}
                  onChange={(e) => setChatGoal(e.target.value)}
                  placeholder="Obiettivo attuale (es. migliorare il passo sui 100 m)"
                  aria-label="Obiettivo attuale"
                  maxLength={120}
                />
                <Input
                  value={chatConstraints}
                  onChange={(e) => setChatConstraints(e.target.value)}
                  placeholder="Vincoli (es. 2 nuotate, spalla delicata)"
                  aria-label="Vincoli"
                  maxLength={240}
                />
              </div>
            </section>
            <AIChatBox
              messages={chatMessages}
              onSendMessage={handleSendChatMessage}
              isLoading={chatMutation.isPending}
              placeholder="Scrivi al coach (es. «Come imposto la nuotata di domani?»)"
              emptyStateMessage="Parti da una domanda concreta sul tuo allenamento."
              suggestedPrompts={suggestedChatPrompts}
              maxInputLength={CHAT_MAX_MESSAGE_CHARS}
              height={520}
            />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  )
}
