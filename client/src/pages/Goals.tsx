"use client"

import AppLayout from "@/components/AppLayout"
import { useEffect, useId, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Chip } from "@/components/corsia/Chip"
import { Metric, type MetricProps } from "@/components/corsia/Metric"
import { Progress } from "@/components/ui/progress"
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
import { Input } from "@/components/ui/input"
import {
  Target,
  Plus,
  TrendingUp,
  Clock,
  Waves,
  Zap,
  CheckCircle2,
  Circle,
  Calendar,
  Trophy,
  Flag,
  Edit,
  Trash2,
} from "lucide-react"
import { trpc } from "@/lib/trpc"
import { formatDayMonthYear, formatInteger, formatKm, NO_VALUE } from "@/lib/format"
import { toast } from "sonner"

const sectionTitle = "text-[17px] font-bold"
const goalValueFmt = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 })
/** Goal values as Italian numbers («2,5»); non-numeric values unchanged. */
const formatGoalValue = (value: unknown) => {
  const number = typeof value === "number" ? value : Number(value)
  return Number.isFinite(number) ? goalValueFmt.format(number) : String(value)
}

const LEGACY_CUSTOM_GOALS_KEY = "swimforge:customGoals"

type GoalPayload = { title: string; category: string; targetValue: number | null; unit: string | null }

const toLegacyGoalPayload = (entry: any): GoalPayload | null => {
  const title = typeof entry?.title === "string" ? entry.title.trim().slice(0, 120) : ""
  if (!title) return null
  const target = Number(entry?.targetValue)
  const unit = typeof entry?.unit === "string" ? entry.unit.trim().slice(0, 24) : ""
  const category = typeof entry?.category === "string" ? entry.category.trim().slice(0, 32) : ""
  return {
    title,
    category: category || "distance",
    targetValue: Number.isFinite(target) && target > 0 ? target : null,
    unit: unit || null,
  }
}

const categoryIcons: Record<string, React.ElementType> = {
  speed: Zap,
  distance: Waves,
  efficiency: TrendingUp,
  frequency: Calendar,
  endurance: Clock,
  technique: Target,
  milestone: Trophy,
}

const categoryLabels: Record<string, string> = {
  speed: "Velocità",
  distance: "Distanza",
  efficiency: "Efficienza",
  frequency: "Frequenza",
  endurance: "Resistenza",
  technique: "Tecnica",
  milestone: "Traguardo",
}

export default function Goals() {
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [customDraft, setCustomDraft] = useState({
    title: "",
    category: "distance",
    targetValue: "",
    unit: "",
  })
  const [editDraft, setEditDraft] = useState<{
    id: number | null
    title: string
    category: string
    targetValue: string
    unit: string
  }>({
    id: null,
    title: "",
    category: "distance",
    targetValue: "",
    unit: "",
  })

  const profileQuery = trpc.profile.get.useQuery()
  const timelineQuery = trpc.statistics.getTimeline.useQuery({ days: 7 })
  const performanceQuery = trpc.statistics.getPerformance.useQuery({ days: 30 })
  const activitiesQuery = trpc.activities.list.useQuery({ limit: 100, offset: 0, source: "all" })
  const userBadgesQuery = trpc.badges.userBadges.useQuery()
  const utils = trpc.useUtils()
  const goalsQuery = trpc.goals.list.useQuery()
  const invalidateGoals = () => utils.goals.list.invalidate()
  const createGoalMutation = trpc.goals.create.useMutation({ onSuccess: invalidateGoals })
  const updateGoalMutation = trpc.goals.update.useMutation({ onSuccess: invalidateGoals })
  const removeGoalMutation = trpc.goals.remove.useMutation({ onSuccess: invalidateGoals })

  const customGoals = useMemo(() => {
    return (goalsQuery.data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      category: row.category,
      currentValue: row.currentValue,
      targetValue: row.targetValue ?? "—",
      unit: row.unit ?? "valore",
      progress: row.targetValue ? Math.min(100, Math.round((row.currentValue / row.targetValue) * 100)) : 0,
      deadline: "Da iniziare",
      status: "behind",
      milestones: [] as { title: string; completed: boolean }[],
    }))
  }, [goalsQuery.data])

  const profile = profileQuery.data
  const timeline = timelineQuery.data ?? []
  // `statistics.getTimeline` already returns each day's distance in km.
  const weeklyDistanceKm = timeline.reduce((sum, day) => sum + (day.distance || 0), 0)
  const weeklySessions = (activitiesQuery.data ?? []).filter((activity) => {
    const date = new Date(activity.activityDate)
    const lastWeek = new Date()
    lastWeek.setDate(lastWeek.getDate() - 7)
    return date >= lastWeek
  }).length

  const swolfAvg = performanceQuery.data?.swolfAvg ?? null

  const activeGoals = useMemo(() => {
    const goals = [] as any[]
    const nextLevelXp = profile?.nextLevelXp ?? 0
    const currentXp = profile?.totalXp ?? 0
    const xpProgress = nextLevelXp ? Math.min(100, (currentXp / nextLevelXp) * 100) : 0

    goals.push({
      id: "xp",
      title: `Raggiungere il livello ${profile?.xpLevel ? profile.xpLevel + 1 : 2}`,
      category: "milestone",
      currentValue: currentXp,
      targetValue: nextLevelXp || "—",
      unit: "XP",
      progress: xpProgress,
      deadline: "In corso",
      status: xpProgress >= 60 ? "on-track" : "behind",
      milestones: [
        { title: "50% del prossimo livello", completed: xpProgress >= 50 },
        { title: "75% del prossimo livello", completed: xpProgress >= 75 },
        { title: "Livello raggiunto", completed: xpProgress >= 100 },
      ],
    })

    const weeklyTargetKm = 10
    const weeklyProgress = Math.min(100, (weeklyDistanceKm / weeklyTargetKm) * 100)
    goals.push({
      id: "weekly-distance",
      title: `Nuotare ${weeklyTargetKm} km a settimana`,
      category: "distance",
      currentValue: weeklyDistanceKm.toFixed(1),
      targetValue: weeklyTargetKm,
      unit: "km/settimana",
      progress: weeklyProgress,
      deadline: "In corso",
      status: weeklyProgress >= 60 ? "on-track" : "behind",
      milestones: [
        { title: "5 km/settimana", completed: weeklyDistanceKm >= 5 },
        { title: "8 km/settimana", completed: weeklyDistanceKm >= 8 },
        { title: `${weeklyTargetKm} km/settimana`, completed: weeklyDistanceKm >= weeklyTargetKm },
      ],
    })

    const swolfTarget = 40
    if (swolfAvg) {
      const swolfProgress = Math.min(100, (swolfTarget / swolfAvg) * 100)
      goals.push({
        id: "swolf",
        title: `Migliorare lo SWOLF a ${swolfTarget}`,
        category: "efficiency",
        currentValue: swolfAvg,
        targetValue: swolfTarget,
        unit: "SWOLF",
        progress: swolfProgress,
        deadline: "In corso",
        status: swolfProgress >= 60 ? "on-track" : "behind",
        milestones: [
          { title: `SWOLF ≤ ${swolfTarget + 4}`, completed: swolfAvg <= swolfTarget + 4 },
          { title: `SWOLF ≤ ${swolfTarget + 2}`, completed: swolfAvg <= swolfTarget + 2 },
          { title: `SWOLF ≤ ${swolfTarget}`, completed: swolfAvg <= swolfTarget },
        ],
      })
    }

    goals.push({
      id: "weekly-sessions",
      title: "Allenarsi 3 volte a settimana",
      category: "frequency",
      currentValue: weeklySessions,
      targetValue: 3,
      unit: "sessioni/sett",
      progress: Math.min(100, (weeklySessions / 3) * 100),
      deadline: "In corso",
      status: weeklySessions >= 3 ? "on-track" : "behind",
      milestones: [
        { title: "2 sessioni", completed: weeklySessions >= 2 },
        { title: "3 sessioni", completed: weeklySessions >= 3 },
      ],
    })

    return goals
  }, [profile, weeklyDistanceKm, swolfAvg, weeklySessions])

  const completedGoals = useMemo(() => {
    const badges = userBadgesQuery.data ?? []
    return badges.slice(0, 3).map((entry) => ({
      id: entry.userBadge.id,
      title: entry.badge.name,
      completedAt: entry.userBadge.earnedAt,
      reward: `${entry.badge.xpReward} XP`,
    }))
  }, [userBadgesQuery.data])

  const suggestedGoals = useMemo(() => {
    const suggestions = [] as any[]
    if (weeklyDistanceKm < 8) {
      suggestions.push({
        title: "Aumenta il volume settimanale",
        description: "Punta ad almeno 8 km in 7 giorni",
        category: "distance",
      })
    }
    if (swolfAvg && swolfAvg > 45) {
      suggestions.push({
        title: "Focus sulla tecnica",
        description: "Inserisci 2 sessioni di drill a settimana",
        category: "technique",
      })
    }
    if (weeklySessions < 3) {
      suggestions.push({
        title: "Più costanza",
        description: "Aggiungi una sessione extra nel weekend",
        category: "frequency",
      })
    }
    if (suggestions.length === 0) {
      suggestions.push({
        title: "Sfida personale",
        description: "Crea un obiettivo personalizzato legato al tuo prossimo record",
        category: "milestone",
      })
    }
    return suggestions.slice(0, 3)
  }, [weeklyDistanceKm, swolfAvg, weeklySessions])

  const allActiveGoals = useMemo(() => {
    return [...customGoals]
  }, [customGoals])
  const summaryMetrics = useMemo((): Array<MetricProps & { id: string }> => {
    const xpGoal = activeGoals.find((goal) => goal.id === "xp")
    const distanceGoal = activeGoals.find((goal) => goal.id === "weekly-distance")
    const frequencyGoal = activeGoals.find((goal) => goal.id === "weekly-sessions")
    const nextLevel = profile?.xpLevel ? profile.xpLevel + 1 : 2

    return [
      {
        id: "xp",
        value: formatInteger(xpGoal?.progress ?? 0),
        unit: "%",
        label: `Verso il livello ${nextLevel}`,
        tone: "xp",
      },
      {
        id: "distance",
        value: formatKm(weeklyDistanceKm * 1000),
        unit: "km",
        label: `Settimana, obiettivo ${distanceGoal?.targetValue ?? 10} km`,
      },
      {
        id: "sessions",
        value: formatInteger(weeklySessions),
        unit: weeklySessions === 1 ? "nuotata" : "nuotate",
        label: `Settimana, obiettivo ${frequencyGoal?.targetValue ?? 3}`,
      },
      {
        id: "custom",
        value: formatInteger(allActiveGoals.length),
        label: "Obiettivi attivi",
      },
    ]
  }, [activeGoals, allActiveGoals.length, profile?.xpLevel, weeklyDistanceKm, weeklySessions])

  const addSuggestedGoal = (goal: any) => {
    const title = String(goal.title ?? "").trim()
    const exists = customGoals.some((item) => item.title.trim().toLowerCase() === title.toLowerCase())
    if (exists) {
      toast.info("Obiettivo già aggiunto")
      return
    }
    createGoalMutation.mutate(
      {
        title,
        category: goal.category,
        targetValue: goal.category === "distance" ? 8 : 100,
        unit: goal.category === "distance" ? "km" : "punti",
      },
      {
        onSuccess: () => toast.success("Obiettivo aggiunto"),
        onError: () => toast.error("Impossibile salvare l'obiettivo"),
      }
    )
  }

  const addCustomGoal = () => {
    if (!customDraft.title.trim()) {
      toast.error("Inserisci un titolo per l'obiettivo")
      return
    }
    const targetValue = Number(customDraft.targetValue)
    createGoalMutation.mutate(
      {
        title: customDraft.title.trim(),
        category: customDraft.category,
        targetValue: Number.isFinite(targetValue) && targetValue > 0 ? targetValue : null,
        unit: customDraft.unit.trim() || null,
      },
      {
        onSuccess: () => {
          setCustomDraft({ title: "", category: customDraft.category, targetValue: "", unit: "" })
          toast.success("Obiettivo creato")
        },
        onError: () => toast.error("Impossibile salvare l'obiettivo"),
      }
    )
  }

  const removeCustomGoal = (id: number) => {
    removeGoalMutation.mutate(
      { id },
      {
        onSuccess: () => toast.success("Obiettivo eliminato"),
        onError: () => toast.error("Impossibile eliminare l'obiettivo"),
      }
    )
  }

  const openEditGoal = (goal: any) => {
    const row = goalsQuery.data?.find((item) => item.id === goal.id)
    setEditDraft({
      id: goal.id,
      title: row?.title ?? goal.title ?? "",
      category: row?.category ?? goal.category ?? "distance",
      targetValue: row?.targetValue != null ? String(row.targetValue) : "",
      unit: row?.unit ?? "",
    })
    setIsEditOpen(true)
  }

  const saveEditGoal = () => {
    if (editDraft.id == null || !editDraft.title.trim()) {
      toast.error("Inserisci un titolo per l'obiettivo")
      return
    }
    const targetValueNumber = Number(editDraft.targetValue)
    const unit = editDraft.unit.trim()
    updateGoalMutation.mutate(
      {
        id: editDraft.id,
        title: editDraft.title.trim(),
        category: editDraft.category,
        targetValue: Number.isFinite(targetValueNumber) && targetValueNumber > 0 ? targetValueNumber : null,
        // A blank unit keeps the current one, as before.
        ...(unit ? { unit } : {}),
      },
      {
        onSuccess: () => {
          setIsEditOpen(false)
          toast.success("Obiettivo aggiornato")
        },
        onError: () => toast.error("Impossibile aggiornare l'obiettivo"),
      }
    )
  }

  // One-time migration of goals previously kept only in localStorage.
  const legacyMigrationStarted = useRef(false)
  useEffect(() => {
    if (!goalsQuery.isSuccess || legacyMigrationStarted.current) return
    legacyMigrationStarted.current = true

    let stored: string | null = null
    try {
      stored = localStorage.getItem(LEGACY_CUSTOM_GOALS_KEY)
    } catch {
      return
    }
    if (stored == null) return

    let parsed: unknown = null
    try {
      parsed = JSON.parse(stored)
    } catch {
      // invalid storage: dropped below
    }
    // Skip titles already on the server and duplicates within the legacy list itself.
    const seenTitles = new Set((goalsQuery.data ?? []).map((row) => row.title.trim().toLowerCase()))
    const payloads = (Array.isArray(parsed) ? parsed : [])
      .map(toLegacyGoalPayload)
      .filter((payload): payload is GoalPayload => payload !== null)
      .filter((payload) => {
        const key = payload.title.toLowerCase()
        if (seenTitles.has(key)) return false
        seenTitles.add(key)
        return true
      })

    // Drop the key before posting anything, so a remount while the batch is in flight
    // (navigate away and back) cannot read it again and post the same goals twice.
    try {
      localStorage.removeItem(LEGACY_CUSTOM_GOALS_KEY)
    } catch {
      // ignore storage errors
    }
    if (payloads.length === 0) return

    void Promise.allSettled(payloads.map((payload) => createGoalMutation.mutateAsync(payload))).then(
      (results) => {
        const failed = payloads.filter((_, index) => results[index].status === "rejected")
        if (failed.length === 0) return
        // Write back only the goals that could not be saved so the next visit retries them.
        try {
          localStorage.setItem(LEGACY_CUSTOM_GOALS_KEY, JSON.stringify(failed))
        } catch {
          // ignore storage errors
        }
      }
    )
  }, [goalsQuery.isSuccess])

  const summaryTitleId = useId()
  const goalsTitleId = useId()
  const completedTitleId = useId()
  const suggestedTitleId = useId()
  const formId = useId()

  return (
    <AppLayout>
      <div className="space-y-4">
        <section aria-labelledby={summaryTitleId} className="surface-panel p-4">
          <h2 id={summaryTitleId} className={sectionTitle}>
            Riepilogo
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
            {summaryMetrics.map(({ id, ...metric }) => (
              <Metric key={id} size="responsive" {...metric} />
            ))}
          </div>
        </section>

        <section aria-labelledby={goalsTitleId} className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 id={goalsTitleId} className={sectionTitle}>
              I tuoi obiettivi
            </h2>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="size-4" aria-hidden />
                  Crea obiettivo
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Crea obiettivo</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor={`${formId}-create-title`} className="text-sm font-medium text-foreground">
                      Titolo
                    </label>
                    <Input
                      id={`${formId}-create-title`}
                      value={customDraft.title}
                      onChange={(event) =>
                        setCustomDraft((prev) => ({ ...prev, title: event.target.value }))
                      }
                      placeholder="Es. 12 km a settimana"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label id={`${formId}-create-category`} className="text-sm font-medium text-foreground">
                        Categoria
                      </label>
                      <Select
                        value={customDraft.category}
                        onValueChange={(value) =>
                          setCustomDraft((prev) => ({ ...prev, category: value }))
                        }
                      >
                        <SelectTrigger aria-labelledby={`${formId}-create-category`}>
                          <SelectValue placeholder="Categoria" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="distance">Distanza</SelectItem>
                          <SelectItem value="frequency">Frequenza</SelectItem>
                          <SelectItem value="efficiency">Efficienza</SelectItem>
                          <SelectItem value="speed">Velocità</SelectItem>
                          <SelectItem value="technique">Tecnica</SelectItem>
                          <SelectItem value="milestone">Traguardo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label htmlFor={`${formId}-create-target`} className="text-sm font-medium text-foreground">
                        Valore obiettivo
                      </label>
                      <Input
                        id={`${formId}-create-target`}
                        value={customDraft.targetValue}
                        onChange={(event) =>
                          setCustomDraft((prev) => ({ ...prev, targetValue: event.target.value }))
                        }
                        placeholder="Es. 10"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor={`${formId}-create-unit`} className="text-sm font-medium text-foreground">
                        Unità
                      </label>
                      <Input
                        id={`${formId}-create-unit`}
                        value={customDraft.unit}
                        onChange={(event) =>
                          setCustomDraft((prev) => ({ ...prev, unit: event.target.value }))
                        }
                        placeholder="km, nuotate, secondi…"
                      />
                    </div>
                  </div>
                  <Button onClick={addCustomGoal} disabled={createGoalMutation.isPending}>
                    Aggiungi obiettivo
                  </Button>

                  <div className="space-y-2 border-t border-border pt-4">
                    <p className="text-sm font-semibold text-foreground">Suggeriti per te</p>
                    <ul className="space-y-2">
                      {suggestedGoals.map((goal) => (
                        <li
                          key={goal.title}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-raised p-3"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground">{goal.title}</p>
                            <p className="text-xs text-muted-foreground">{goal.description}</p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => addSuggestedGoal(goal)}
                            disabled={createGoalMutation.isPending}
                          >
                            Aggiungi
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {allActiveGoals.length === 0 ? (
            <div className="surface-panel p-4 text-sm text-muted-foreground">
              Nessun obiettivo creato. Tocca «Crea obiettivo» o aggiungi un suggerimento.
            </div>
          ) : (
            <ul className="space-y-3">
              {allActiveGoals.map((goal) => {
                const Icon = categoryIcons[goal.category] || Target
                const isCustom = customGoals.some((item) => item.id === goal.id)
                const hasTarget = typeof goal.targetValue === "number"
                const onTrack = goal.status === "on-track"
                return (
                  <li key={goal.id} className="surface-panel p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-raised text-muted-foreground">
                        <Icon className="size-5" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="break-words text-base font-bold text-foreground">{goal.title}</h3>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <Chip>{categoryLabels[goal.category] ?? goal.category}</Chip>
                          <Chip tone={onTrack ? "success" : "neutral"}>
                            {onTrack ? "In linea" : "Indietro"}
                          </Chip>
                          <span className="text-xs text-muted-foreground">{goal.deadline}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        {isCustom ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditGoal(goal)}
                            aria-label="Modifica obiettivo"
                          >
                            <Edit className="size-4" />
                          </Button>
                        ) : (
                          <Button variant="ghost" size="icon" disabled aria-label="Modifica obiettivo">
                            <Edit className="size-4" />
                          </Button>
                        )}
                        {isCustom ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeCustomGoal(goal.id)}
                            disabled={removeGoalMutation.isPending}
                            aria-label="Elimina obiettivo"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        ) : (
                          <Button variant="ghost" size="icon" disabled aria-label="Elimina obiettivo">
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 flex items-end justify-between gap-4 border-t border-border pt-4">
                      <div className="min-w-0 flex-1 space-y-2">
                        <p className="text-sm text-muted-foreground">
                          Progresso{" "}
                          <span className="font-semibold text-foreground tabular-nums">
                            {formatGoalValue(goal.currentValue)}
                            {hasTarget ? ` / ${formatGoalValue(goal.targetValue)}` : ""} {goal.unit}
                          </span>
                        </p>
                        {hasTarget ? (
                          <Progress
                            value={goal.progress}
                            aria-label={`Progresso: ${goal.title}`}
                            className="h-2"
                          />
                        ) : null}
                      </div>
                      {hasTarget ? (
                        <Metric
                          value={formatInteger(goal.progress)}
                          unit="%"
                          label="Completamento"
                          size="sm"
                          className="shrink-0 text-right"
                        />
                      ) : null}
                    </div>

                    {goal.milestones.length > 0 && (
                      <div className="mt-4 border-t border-border pt-4">
                        <h4 className="mb-2 text-sm font-semibold text-foreground">Tappe</h4>
                        <ul className="grid gap-2 sm:grid-cols-2">
                          {goal.milestones.map((milestone: { completed: boolean; title: string }, index: number) => (
                            <li key={index} className="flex items-center gap-2">
                              {milestone.completed ? (
                                <CheckCircle2 className="size-4 text-success" aria-label="Raggiunta" />
                              ) : (
                                <Circle className="size-4 text-muted-foreground" aria-label="Da raggiungere" />
                              )}
                              <span className="text-sm text-muted-foreground">{milestone.title}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Modifica obiettivo</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor={`${formId}-edit-title`} className="text-sm font-medium text-foreground">
                  Titolo
                </label>
                <Input
                  id={`${formId}-edit-title`}
                  value={editDraft.title}
                  onChange={(event) =>
                    setEditDraft((prev) => ({ ...prev, title: event.target.value }))
                  }
                  placeholder="Es. 12 km a settimana"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <label id={`${formId}-edit-category`} className="text-sm font-medium text-foreground">
                    Categoria
                  </label>
                  <Select
                    value={editDraft.category}
                    onValueChange={(value) =>
                      setEditDraft((prev) => ({ ...prev, category: value }))
                    }
                  >
                    <SelectTrigger aria-labelledby={`${formId}-edit-category`}>
                      <SelectValue placeholder="Scegli la categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="distance">Distanza</SelectItem>
                      <SelectItem value="speed">Velocità</SelectItem>
                      <SelectItem value="efficiency">Efficienza</SelectItem>
                      <SelectItem value="frequency">Frequenza</SelectItem>
                      <SelectItem value="endurance">Resistenza</SelectItem>
                      <SelectItem value="technique">Tecnica</SelectItem>
                      <SelectItem value="milestone">Traguardo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label htmlFor={`${formId}-edit-target`} className="text-sm font-medium text-foreground">
                    Valore obiettivo
                  </label>
                  <Input
                    id={`${formId}-edit-target`}
                    type="number"
                    value={editDraft.targetValue}
                    onChange={(event) =>
                      setEditDraft((prev) => ({ ...prev, targetValue: event.target.value }))
                    }
                    placeholder="Es. 10"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor={`${formId}-edit-unit`} className="text-sm font-medium text-foreground">
                  Unità
                </label>
                <Input
                  id={`${formId}-edit-unit`}
                  value={editDraft.unit}
                  onChange={(event) =>
                    setEditDraft((prev) => ({ ...prev, unit: event.target.value }))
                  }
                  placeholder="Es. km/settimana"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setIsEditOpen(false)}>
                  Annulla
                </Button>
                <Button onClick={saveEditGoal} disabled={updateGoalMutation.isPending}>
                  Salva modifiche
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <div className="grid gap-4 md:grid-cols-2">
          <section aria-labelledby={completedTitleId} className="surface-panel p-4">
            <h2 id={completedTitleId} className={sectionTitle}>
              Obiettivi completati
            </h2>
            {completedGoals.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Nessun obiettivo completato.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {completedGoals.map((goal) => {
                  const completedAt = formatDayMonthYear(goal.completedAt)
                  return (
                    <li key={goal.id} className="flex items-start gap-3 rounded-xl bg-raised p-3">
                      <Flag className="mt-0.5 size-5 shrink-0 text-xp" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-foreground">{goal.title}</h3>
                        {completedAt !== NO_VALUE ? (
                          <p className="text-xs text-muted-foreground">{completedAt}</p>
                        ) : null}
                        <Chip tone="xp" className="mt-2">
                          {goal.reward}
                        </Chip>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby={suggestedTitleId} className="surface-panel p-4">
            <h2 id={suggestedTitleId} className={sectionTitle}>
              Obiettivi suggeriti
            </h2>
            <ul className="mt-3 space-y-2">
              {suggestedGoals.map((goal, index) => {
                const Icon = categoryIcons[goal.category] || Target
                return (
                  <li key={index} className="flex items-start gap-3 rounded-xl bg-raised p-3">
                    <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0">
                      <h3 className="font-semibold text-foreground">{goal.title}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">{goal.description}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        </div>
      </div>
    </AppLayout>
  )
}
