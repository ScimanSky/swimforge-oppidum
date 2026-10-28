"use client"

import AppLayout from "@/components/AppLayout"
import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { MetricOrb } from "@/components/metrics/MetricOrb"
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
import { toast } from "sonner"

const formatDate = (date?: string | Date | null) => {
  if (!date) return "—"
  return new Date(date).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
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

const categoryColors: Record<string, string> = {
  speed: "text-chart-5 bg-chart-5/10",
  distance: "text-action-text bg-primary/10",
  efficiency: "text-muted-foreground bg-raised",
  frequency: "text-chart-4 bg-chart-4/10",
  endurance: "text-chart-3 bg-chart-3/10",
  technique: "text-chart-2 bg-chart-2/10",
  milestone: "text-chart-1 bg-chart-1/10",
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
  const weeklyDistanceMeters = timeline.reduce((sum, day) => sum + (day.distance || 0), 0)
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
    const weeklyProgress = Math.min(100, (weeklyDistanceMeters / 1000 / weeklyTargetKm) * 100)
    goals.push({
      id: "weekly-distance",
      title: `Nuotare ${weeklyTargetKm} km a settimana`,
      category: "distance",
      currentValue: (weeklyDistanceMeters / 1000).toFixed(1),
      targetValue: weeklyTargetKm,
      unit: "km/settimana",
      progress: weeklyProgress,
      deadline: "In corso",
      status: weeklyProgress >= 60 ? "on-track" : "behind",
      milestones: [
        { title: "5 km/settimana", completed: weeklyDistanceMeters / 1000 >= 5 },
        { title: "8 km/settimana", completed: weeklyDistanceMeters / 1000 >= 8 },
        { title: `${weeklyTargetKm} km/settimana`, completed: weeklyDistanceMeters / 1000 >= weeklyTargetKm },
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
  }, [profile, weeklyDistanceMeters, swolfAvg, weeklySessions])

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
    if (weeklyDistanceMeters / 1000 < 8) {
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
        description: "Crea un obiettivo custom legato al tuo prossimo PR",
        category: "milestone",
      })
    }
    return suggestions.slice(0, 3)
  }, [weeklyDistanceMeters, swolfAvg, weeklySessions])

  const allActiveGoals = useMemo(() => {
    return [...customGoals]
  }, [customGoals])
  const goalsOrbs = useMemo(() => {
    const xpGoal = activeGoals.find((goal) => goal.id === "xp")
    const distanceGoal = activeGoals.find((goal) => goal.id === "weekly-distance")
    const frequencyGoal = activeGoals.find((goal) => goal.id === "weekly-sessions")

    return [
      {
        label: "XP livello",
        value: xpGoal ? `${Math.round(xpGoal.progress)}%` : "0%",
        progress: xpGoal?.progress ?? 0,
        helper: xpGoal ? `${xpGoal.currentValue}/${xpGoal.targetValue} XP` : "N/D",
        icon: <Zap className="size-4" />,
        tone: "cyan" as const,
      },
      {
        label: "Distanza settimana",
        value: distanceGoal ? `${distanceGoal.currentValue} km` : "0 km",
        progress: distanceGoal?.progress ?? 0,
        helper: distanceGoal ? `Target ${distanceGoal.targetValue} km` : "N/D",
        icon: <Waves className="size-4" />,
        tone: "lime" as const,
      },
      {
        label: "Frequenza",
        value: frequencyGoal ? `${frequencyGoal.currentValue} sedute` : "0 sedute",
        progress: frequencyGoal?.progress ?? 0,
        helper: frequencyGoal ? `Target ${frequencyGoal.targetValue}/sett` : "N/D",
        icon: <Calendar className="size-4" />,
        tone: "amber" as const,
      },
      {
        label: "Obiettivi custom",
        value: allActiveGoals.length,
        progress: Math.min(100, Math.round((allActiveGoals.length / 8) * 100)),
        helper: allActiveGoals.length ? "In lavorazione" : "Crea il primo",
        icon: <Target className="size-4" />,
        tone: "sky" as const,
      },
    ]
  }, [activeGoals, allActiveGoals.length])

  const addSuggestedGoal = (goal: any) => {
    const title = String(goal.title ?? "").trim()
    const exists = customGoals.some((item) => item.title.trim().toLowerCase() === title.toLowerCase())
    if (exists) {
      toast.info("Obiettivo gia aggiunto")
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

  return (
    <AppLayout>
      <div className="compact-shell space-y-4 lg:space-y-2">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Obiettivi</h1>
            <p className="text-muted-foreground">Definisci e traccia i tuoi obiettivi di nuoto</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button variant="neon" className="gap-2">
                <Plus className="w-4 h-4" />
                Crea obiettivo
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Crea obiettivo</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Titolo</label>
                  <Input
                    value={customDraft.title}
                    onChange={(event) =>
                      setCustomDraft((prev) => ({ ...prev, title: event.target.value }))
                    }
                    placeholder="Es. 12 km a settimana"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Categoria</label>
                    <Select
                      value={customDraft.category}
                      onValueChange={(value) =>
                        setCustomDraft((prev) => ({ ...prev, category: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="distance">Distanza</SelectItem>
                        <SelectItem value="frequency">Frequenza</SelectItem>
                        <SelectItem value="efficiency">Efficienza</SelectItem>
                        <SelectItem value="speed">Velocita</SelectItem>
                        <SelectItem value="technique">Tecnica</SelectItem>
                        <SelectItem value="milestone">Milestone</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Target</label>
                    <Input
                      value={customDraft.targetValue}
                      onChange={(event) =>
                        setCustomDraft((prev) => ({ ...prev, targetValue: event.target.value }))
                      }
                      placeholder="Valore obiettivo"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Unita</label>
                    <Input
                      value={customDraft.unit}
                      onChange={(event) =>
                        setCustomDraft((prev) => ({ ...prev, unit: event.target.value }))
                      }
                      placeholder="km, sessioni, sec..."
                    />
                  </div>
                </div>
                <Button onClick={addCustomGoal} disabled={createGoalMutation.isPending}>Aggiungi obiettivo</Button>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Suggeriti per te</p>
                  <div className="space-y-2">
                    {suggestedGoals.map((goal) => (
                      <div
                        key={goal.title}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-secondary/30 p-3"
                      >
                        <div>
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
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Modifica obiettivo</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Titolo</label>
                  <Input
                    value={editDraft.title}
                    onChange={(event) =>
                      setEditDraft((prev) => ({ ...prev, title: event.target.value }))
                    }
                    placeholder="Es. 12 km a settimana"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Categoria</label>
                    <Select
                      value={editDraft.category}
                      onValueChange={(value) =>
                        setEditDraft((prev) => ({ ...prev, category: value }))
                      }
                    >
                      <SelectTrigger className="bg-background/60">
                        <SelectValue placeholder="Seleziona categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="distance">Distanza</SelectItem>
                        <SelectItem value="speed">Velocita</SelectItem>
                        <SelectItem value="efficiency">Efficienza</SelectItem>
                        <SelectItem value="frequency">Frequenza</SelectItem>
                        <SelectItem value="endurance">Resistenza</SelectItem>
                        <SelectItem value="technique">Tecnica</SelectItem>
                        <SelectItem value="milestone">Traguardo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Valore target</label>
                    <Input
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
                  <label className="text-sm font-medium text-foreground">Unita</label>
                  <Input
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
                  <Button variant="neon" onClick={saveEditGoal} disabled={updateGoalMutation.isPending}>
                    Salva modifiche
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {goalsOrbs.map((item) => (
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

        {/* Active Goals */}
        <div className="grid gap-6">
          {allActiveGoals.length === 0 ? (
            <section className="surface-panel p-6">
              <div className="p-6 text-sm text-muted-foreground">
                Nessun obiettivo creato. Usa “Crea obiettivo” o aggiungi un suggerimento.
              </div>
            </section>
          ) : (
            allActiveGoals.map((goal) => {
              const Icon = categoryIcons[goal.category] || Target
              const colorClass = categoryColors[goal.category] || "text-action-text bg-primary/10"
              const isCustom = customGoals.some((item) => item.id === goal.id)
              return (
                <section key={goal.id} className="surface-panel p-6">
                  <div className="p-6">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-6">
                      <div className="flex-1">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${colorClass}`}>
                              <Icon className="w-5 h-5" />
                            </div>
                            <div>
                              <h3 className="text-lg font-display font-bold text-foreground">
                                {goal.title}
                              </h3>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="secondary" className="text-xs">
                                  {goal.category}
                                </Badge>
                                <span className="text-xs text-muted-foreground">{goal.deadline}</span>
                              </div>
                            </div>
                          </div>
                          <Badge
                            className={
                              goal.status === "on-track"
                                ? "bg-primary/20 text-action-text"
                                : "bg-chart-5/20 text-chart-5"
                            }
                          >
                            {goal.status === "on-track" ? "On Track" : "Behind"}
                          </Badge>
                        </div>

                        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between sm:justify-start sm:gap-3">
                              <span className="text-sm text-muted-foreground">Progress</span>
                              <span className="text-sm font-medium text-foreground">
                                {goal.currentValue} / {goal.targetValue} {goal.unit}
                              </span>
                            </div>
                            <Progress value={goal.progress} className="h-2 sm:w-56" />
                          </div>
                          <MetricOrb
                            label="Completamento"
                            value={`${Math.round(goal.progress)}%`}
                            progress={goal.progress}
                            helper={goal.deadline}
                            icon={<Icon className="size-4" />}
                            tone={goal.status === "on-track" ? "lime" : "amber"}
                            size="sm"
                          />
                        </div>

                        {goal.milestones.length > 0 && (
                          <div className="mt-4">
                            <h4 className="text-sm font-medium text-foreground mb-2">Milestones</h4>
                            <div className="grid sm:grid-cols-2 gap-2">
                              {goal.milestones.map((milestone: { completed: boolean; title: string }, index: number) => (
                                <div key={index} className="flex items-center gap-2">
                                  {milestone.completed ? (
                                    <CheckCircle2 className="w-4 h-4 text-action-text" />
                                  ) : (
                                    <Circle className="w-4 h-4 text-muted-foreground" />
                                  )}
                                  <span className="text-sm text-muted-foreground">
                                    {milestone.title}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2">
                      {isCustom ? (
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => openEditGoal(goal)}
                          aria-label="Modifica obiettivo"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      ) : (
                        <Button variant="outline" size="icon" disabled>
                          <Edit className="w-4 h-4" />
                        </Button>
                      )}
                        {isCustom ? (
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => removeCustomGoal(goal.id)}
                            disabled={removeGoalMutation.isPending}
                            aria-label="Elimina obiettivo"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        ) : (
                          <Button variant="outline" size="icon" disabled>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </section>
              )
            })
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Completed Goals */}
          <section className="surface-panel p-6">
            <div>
              <h3 className="text-lg font-display font-bold text-foreground">
                Obiettivi Completati
              </h3>
            </div>
            <div className="space-y-4">
              {completedGoals.length === 0 && (
                <p className="text-sm text-muted-foreground">Nessun obiettivo completato.</p>
              )}
              {completedGoals.map((goal) => (
                <div key={goal.id} className="flex items-start gap-3 p-4 rounded-lg bg-secondary/30">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Flag className="w-5 h-5 text-action-text" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-foreground">{goal.title}</h4>
                    <p className="text-xs text-muted-foreground">{formatDate(goal.completedAt)}</p>
                    <Badge className="mt-2 bg-xp/15 text-xp">{goal.reward}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Suggested Goals */}
          <section className="surface-panel p-6">
            <div>
              <h3 className="text-lg font-display font-bold text-foreground">
                Obiettivi Suggeriti
              </h3>
            </div>
            <div className="space-y-4">
              {suggestedGoals.map((goal, index) => {
                const Icon = categoryIcons[goal.category] || Target
                return (
                  <div key={index} className="flex items-start gap-3 p-4 rounded-lg bg-secondary/30">
                    <div className="p-2 rounded-lg bg-secondary">
                      <Icon className="w-5 h-5 text-foreground" />
                    </div>
                    <div>
                      <h4 className="font-medium text-foreground">{goal.title}</h4>
                      <p className="text-xs text-muted-foreground mt-1">{goal.description}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      </div>
    </AppLayout>
  )
}
