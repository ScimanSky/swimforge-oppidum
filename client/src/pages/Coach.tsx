"use client"

import AppLayout from "@/components/AppLayout"
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { trpc } from "@/lib/trpc"
import { format, endOfDay, startOfDay, subDays } from "date-fns"
import { it } from "date-fns/locale"
import {
  Brain,
  Send,
  Sparkles,
  Target,
  CheckCircle2,
  Calendar,
  Clock,
  ChevronRight,
  Waves,
} from "lucide-react"

const formatSeconds = (seconds: number) => {
  if (!seconds || seconds <= 0) return "-"
  const totalMinutes = Math.round(seconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes} min`
}

const formatPace = (pace?: number | null) => {
  if (!pace || pace <= 0) return "-"
  const minutes = Math.floor(pace / 60)
  const seconds = Math.round(pace % 60)
  return `${minutes}:${seconds.toString().padStart(2, "0")}/100m`
}

export default function Coach() {
  const [message, setMessage] = useState("")
  const { data: advanced } = trpc.statistics.getAdvanced.useQuery(
    { days: 30 },
    { staleTime: 24 * 60 * 60 * 1000 }
  )
  const { data: timeline } = trpc.statistics.getTimeline.useQuery(
    { days: 7 },
    { staleTime: 5 * 60 * 1000 }
  )
  const { data: profile } = trpc.profile.get.useQuery()
  const { data: activities } = trpc.activities.list.useQuery({
    limit: 200,
    offset: 0,
    source: "all",
  })

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

  const weeklyStats = useMemo(() => {
    const start = startOfDay(subDays(new Date(), 6))
    const end = endOfDay(new Date())
    const map = new Map<string, { distance: number; duration: number; sessions: number }>()

    activities?.forEach((activity) => {
      const date = new Date(activity.activityDate)
      if (date < start || date > end) return
      const key = format(date, "yyyy-MM-dd")
      const current = map.get(key) || { distance: 0, duration: 0, sessions: 0 }
      map.set(key, {
        distance: current.distance + activity.distanceMeters / 1000,
        duration: current.duration + activity.durationSeconds,
        sessions: current.sessions + 1,
      })
    })

    return map
  }, [activities])

  const weeklyPlan = useMemo(() => {
    const today = startOfDay(new Date())
    return Array.from({ length: 7 }, (_, index) => {
      const date = subDays(today, 6 - index)
      const key = format(date, "yyyy-MM-dd")
      const stats = weeklyStats.get(key)
      const sessions = stats?.sessions ?? 0
      return {
        day: format(date, "EEEE", { locale: it }),
        dateLabel: format(date, "d MMM", { locale: it }),
        type: sessions > 0 ? "Allenamento" : "Riposo",
        duration: sessions > 0 ? formatSeconds(stats?.duration ?? 0) : "-",
        distance: sessions > 0 ? `${(stats?.distance ?? 0).toFixed(1)} km` : "-",
        focus: sessions > 0 ? `Sessioni: ${sessions}` : "Recupero",
        completed: sessions > 0,
      }
    })
  }, [weeklyStats])

  const weeklyDistance = useMemo(() => {
    return Array.from(weeklyStats.values()).reduce((sum, item) => sum + item.distance, 0)
  }, [weeklyStats])

  const weeklySessions = useMemo(() => {
    return Array.from(weeklyStats.values()).reduce((sum, item) => sum + item.sessions, 0)
  }, [weeklyStats])

  const targetDistance = useMemo(() => Math.max(10, Math.ceil(weeklyDistance)), [weeklyDistance])
  const distanceProgress = Math.min(100, (weeklyDistance / targetDistance) * 100)

  const avgSwolf = useMemo(() => {
    if (!activities?.length) return null
    const values = activities
      .map((activity) => activity.avgSwolf)
      .filter((value): value is number => value !== null && value !== undefined && value > 0)
    if (!values.length) return null
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
  }, [activities])

  const goals = useMemo(() => {
    const nextLevelXp = profile?.nextLevelXp || 0
    const totalXp = profile?.totalXp || 0
    const xpProgress = nextLevelXp > 0 ? Math.min(100, (totalXp / nextLevelXp) * 100) : 0
    const sessionsTarget = 4
    const sessionsProgress = Math.min(100, (weeklySessions / sessionsTarget) * 100)

    return [
      {
        title: "Prossimo Livello XP",
        current: `${totalXp} XP`,
        target: nextLevelXp ? `${nextLevelXp} XP` : "—",
        progress: xpProgress,
        deadline: "In corso",
      },
      {
        title: "Distanza Settimanale",
        current: `${weeklyDistance.toFixed(1)} km`,
        target: `${targetDistance} km`,
        progress: distanceProgress,
        deadline: "Questa settimana",
      },
      {
        title: "Sessioni Settimanali",
        current: `${weeklySessions} sessioni`,
        target: `${sessionsTarget} sessioni`,
        progress: sessionsProgress,
        deadline: "Questa settimana",
      },
      {
        title: "SWOLF Medio",
        current: avgSwolf ? `${avgSwolf}` : "—",
        target: "< 40",
        progress: avgSwolf ? Math.min(100, (40 / avgSwolf) * 100) : 0,
        deadline: "In corso",
      },
    ]
  }, [profile?.nextLevelXp, profile?.totalXp, weeklyDistance, weeklySessions, targetDistance, avgSwolf, distanceProgress])

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

      <Tabs defaultValue="chat">
        <TabsList className="bg-secondary">
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="plan">Piano Settimanale</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
          <TabsTrigger value="goals">Obiettivi</TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="mt-6">
          <Card className="bg-card border-border">
            <CardContent className="p-0">
              {/* Chat Messages */}
              <div className="h-[400px] overflow-y-auto p-4 space-y-4">
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

              {/* Quick Prompts */}
              <div className="border-t border-border p-3">
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                  <Badge
                    variant="outline"
                    className="cursor-pointer hover:bg-secondary whitespace-nowrap"
                  >
                    Analizza la mia ultima sessione
                  </Badge>
                  <Badge
                    variant="outline"
                    className="cursor-pointer hover:bg-secondary whitespace-nowrap"
                  >
                    Suggerimenti per migliorare
                  </Badge>
                  <Badge
                    variant="outline"
                    className="cursor-pointer hover:bg-secondary whitespace-nowrap"
                  >
                    Crea piano settimanale
                  </Badge>
                </div>
              </div>

              {/* Input */}
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

        <TabsContent value="plan" className="mt-6">
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="font-display">Piano Settimanale</CardTitle>
                <p className="text-sm text-muted-foreground">Ultimi 7 giorni</p>
              </div>
              <Button variant="outline" size="sm" disabled>
                Modifica Piano
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {weeklyPlan.map((day, index) => (
                  <div
                    key={index}
                    className={`flex items-center gap-4 p-3 rounded-lg ${
                      day.completed ? "bg-primary/5" : "bg-secondary/30"
                    }`}
                  >
                    <div className="w-20">
                      <p className="font-medium text-foreground">{day.day}</p>
                      <p className="text-xs text-muted-foreground">{day.type}</p>
                      <p className="text-xs text-muted-foreground">{day.dateLabel}</p>
                    </div>
                    <div className="flex-1 grid grid-cols-3 gap-2 text-sm">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {day.duration}
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Waves className="w-3 h-3" />
                        {day.distance}
                      </div>
                      <div className="text-foreground">{day.focus}</div>
                    </div>
                    <div>
                      {day.completed ? (
                        <CheckCircle2 className="w-5 h-5 text-accent" />
                      ) : day.type === "Riposo" ? (
                        <div className="w-5 h-5" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 p-4 rounded-lg bg-secondary/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-foreground">Target consigliato</span>
                  <span className="text-sm text-muted-foreground">
                    {weeklyDistance.toFixed(1)} / {targetDistance} km
                  </span>
                </div>
                <Progress value={distanceProgress} className="h-2" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insights" className="mt-6 space-y-4">
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

          <Card className="bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Sparkles className="w-6 h-6 text-primary" />
                <div className="flex-1">
                  <h3 className="font-medium text-foreground">Analisi Completa Disponibile</h3>
                  <p className="text-sm text-muted-foreground">
                    Vedi le analisi dettagliate delle singole sessioni
                  </p>
                </div>
                <Button size="sm" asChild>
                  <a href="/session-iq">Visualizza</a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="goals" className="mt-6 space-y-4">
          {goals.map((goal, index) => (
            <Card key={index} className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-medium text-foreground">{goal.title}</h3>
                    <p className="text-sm text-muted-foreground">Scadenza: {goal.deadline}</p>
                  </div>
                  <Button variant="ghost" size="icon">
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Attuale: <span className="text-foreground font-medium">{goal.current}</span>
                    </span>
                    <span className="text-muted-foreground">
                      Obiettivo: <span className="text-primary font-medium">{goal.target}</span>
                    </span>
                  </div>
                  <Progress value={goal.progress} className="h-2" />
                  <p className="text-xs text-muted-foreground text-right">{goal.progress}% completato</p>
                </div>
              </CardContent>
            </Card>
          ))}

          <Button className="w-full gap-2" disabled>
            <Target className="w-4 h-4" />
            Aggiungi Nuovo Obiettivo
          </Button>
        </TabsContent>
      </Tabs>
    </div>
    </AppLayout>
  )
}
