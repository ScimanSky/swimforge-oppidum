"use client"

import AppLayout from "@/components/AppLayout"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
import { Link } from "wouter"

const formatDate = (date?: string | Date | null) => {
  if (!date) return "—"
  return new Date(date).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
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
  distance: "text-primary bg-primary/10",
  efficiency: "text-accent bg-accent/10",
  frequency: "text-chart-4 bg-chart-4/10",
  endurance: "text-chart-3 bg-chart-3/10",
  technique: "text-chart-2 bg-chart-2/10",
  milestone: "text-chart-1 bg-chart-1/10",
}

export default function Goals() {
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [customGoals, setCustomGoals] = useState<any[]>([])
  const [customDraft, setCustomDraft] = useState({
    title: "",
    category: "distance",
    targetValue: "",
    unit: "",
  })
  const [editDraft, setEditDraft] = useState({
    id: "",
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

  const addSuggestedGoal = (goal: any) => {
    const id = `${goal.category}-${goal.title}`.toLowerCase().replace(/\s+/g, "-")
    const exists = customGoals.some((item) => item.id === id)
    if (exists) {
      toast.info("Obiettivo gia aggiunto")
      return
    }
    const newGoal = {
      id,
      title: goal.title,
      category: goal.category,
      currentValue: 0,
      targetValue: goal.category === "distance" ? 8 : 100,
      unit: goal.category === "distance" ? "km" : "punti",
      progress: 0,
      deadline: "Da iniziare",
      status: "behind",
      milestones: [],
    }
    setCustomGoals((prev) => [...prev, newGoal])
    toast.success("Obiettivo aggiunto")
  }

  const addCustomGoal = () => {
    if (!customDraft.title.trim()) {
      toast.error("Inserisci un titolo per l'obiettivo")
      return
    }
    const id = `custom-${Date.now()}`
    const targetValue = Number(customDraft.targetValue) || 0
    const newGoal = {
      id,
      title: customDraft.title.trim(),
      category: customDraft.category,
      currentValue: 0,
      targetValue: targetValue || "—",
      unit: customDraft.unit || "valore",
      progress: 0,
      deadline: "Da iniziare",
      status: "behind",
      milestones: [],
    }
    setCustomGoals((prev) => [...prev, newGoal])
    setCustomDraft({ title: "", category: customDraft.category, targetValue: "", unit: "" })
    toast.success("Obiettivo creato")
  }

  const removeCustomGoal = (id: string) => {
    setCustomGoals((prev) => prev.filter((goal) => goal.id !== id))
    toast.success("Obiettivo eliminato")
  }

  const openEditGoal = (goal: any) => {
    setEditDraft({
      id: goal.id,
      title: goal.title ?? "",
      category: goal.category ?? "distance",
      targetValue: goal.targetValue ? String(goal.targetValue) : "",
      unit: goal.unit ?? "",
    })
    setIsEditOpen(true)
  }

  const saveEditGoal = () => {
    if (!editDraft.id || !editDraft.title.trim()) {
      toast.error("Inserisci un titolo per l'obiettivo")
      return
    }
    const targetValueNumber = Number(editDraft.targetValue)
    setCustomGoals((prev) =>
      prev.map((goal) => {
        if (goal.id !== editDraft.id) return goal
        const numericTarget = Number.isFinite(targetValueNumber) && targetValueNumber > 0
        const nextTarget = numericTarget ? targetValueNumber : editDraft.targetValue || "—"
        const currentValue = Number(goal.currentValue) || 0
        const progress =
          numericTarget && currentValue > 0
            ? Math.min(100, (currentValue / targetValueNumber) * 100)
            : goal.progress ?? 0
        return {
          ...goal,
          title: editDraft.title.trim(),
          category: editDraft.category,
          targetValue: nextTarget,
          unit: editDraft.unit || goal.unit,
          progress,
        }
      })
    )
    setIsEditOpen(false)
    toast.success("Obiettivo aggiornato")
  }

  useEffect(() => {
    const stored = localStorage.getItem("swimforge:customGoals")
    if (!stored) return
    try {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) {
        setCustomGoals(parsed)
      }
    } catch {
      // ignore invalid storage
    }
  }, [])

  useEffect(() => {
    localStorage.setItem("swimforge:customGoals", JSON.stringify(customGoals))
  }, [customGoals])

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Obiettivi</h1>
            <p className="text-muted-foreground">Definisci e traccia i tuoi obiettivi di nuoto</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline-neon" asChild>
                <Link href="/statistics">Statistiche</Link>
              </Button>
              <Button size="sm" variant="neon" asChild>
                <Link href="/goals">Obiettivi</Link>
              </Button>
              <Button size="sm" variant="outline-neon" asChild>
                <Link href="/badges">Badge</Link>
              </Button>
            </div>
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
                <Button onClick={addCustomGoal}>Aggiungi obiettivo</Button>

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
                        <Button size="sm" variant="outline" onClick={() => addSuggestedGoal(goal)}>
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
                  <Button variant="neon" onClick={saveEditGoal}>
                    Salva modifiche
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Active Goals */}
        <div className="grid gap-6">
          {allActiveGoals.length === 0 ? (
            <Card className="bg-card border-border">
              <CardContent className="p-6 text-sm text-muted-foreground">
                Nessun obiettivo creato. Usa “Crea obiettivo” o aggiungi un suggerimento.
              </CardContent>
            </Card>
          ) : (
            allActiveGoals.map((goal) => {
              const Icon = categoryIcons[goal.category] || Target
              const colorClass = categoryColors[goal.category] || "text-primary bg-primary/10"
              const isCustom = customGoals.some((item) => item.id === goal.id)
              return (
                <Card key={goal.id} className="bg-card border-border">
                  <CardContent className="p-6">
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
                                ? "bg-primary/20 text-primary"
                                : "bg-chart-5/20 text-chart-5"
                            }
                          >
                            {goal.status === "on-track" ? "On Track" : "Behind"}
                          </Badge>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Progress</span>
                            <span className="text-sm font-medium text-foreground">
                              {goal.currentValue} / {goal.targetValue} {goal.unit}
                            </span>
                          </div>
                          <Progress value={goal.progress} className="h-2" />
                        </div>

                        {goal.milestones.length > 0 && (
                          <div className="mt-4">
                            <h4 className="text-sm font-medium text-foreground mb-2">Milestones</h4>
                            <div className="grid sm:grid-cols-2 gap-2">
                              {goal.milestones.map((milestone: { completed: boolean; title: string }, index: number) => (
                                <div key={index} className="flex items-center gap-2">
                                  {milestone.completed ? (
                                    <CheckCircle2 className="w-4 h-4 text-primary" />
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
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Completed Goals */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg font-display font-bold text-foreground">
                Obiettivi Completati
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {completedGoals.length === 0 && (
                <p className="text-sm text-muted-foreground">Nessun obiettivo completato.</p>
              )}
              {completedGoals.map((goal) => (
                <div key={goal.id} className="flex items-start gap-3 p-4 rounded-lg bg-secondary/30">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Flag className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-foreground">{goal.title}</h4>
                    <p className="text-xs text-muted-foreground">{formatDate(goal.completedAt)}</p>
                    <Badge className="mt-2 bg-accent/20 text-accent">{goal.reward}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Suggested Goals */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg font-display font-bold text-foreground">
                Obiettivi Suggeriti
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  )
}
