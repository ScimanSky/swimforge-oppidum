"use client"

import AppLayout from "@/components/AppLayout"
import { useState } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import {
  Brain,
  Send,
  Sparkles,
  Target,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Dumbbell,
  Calendar,
  Clock,
  ChevronRight,
  Zap,
  Activity,
  Waves,
} from "lucide-react"

const chatMessages = [
  {
    role: "assistant",
    content:
      "Ciao! Ho analizzato le tue ultime 10 sessioni. Il tuo passo medio sui 100m freestyle e migliorato del 3.2%! Pero ho notato che la tua efficienza di bracciata diminuisce dopo i 1500m. Vuoi che ti crei un piano per migliorare la resistenza?",
  },
  {
    role: "user",
    content: "Si, sarebbe perfetto. Quali esercizi mi consigli?",
  },
  {
    role: "assistant",
    content:
      "Ottimo! Ti consiglio di integrare queste 3 tipologie di allenamento:\n\n1. **Serie Piramidali**: 50-100-150-200-150-100-50m con recuperi decrescenti\n2. **Drill di Catch-up**: 4x100m focalizzandoti sulla presa dell'acqua\n3. **Negative Split**: 800m dove la seconda meta deve essere piu veloce della prima\n\nVuoi che aggiunga questi al tuo piano settimanale?",
  },
]

const weeklyPlan = [
  {
    day: "Lunedi",
    type: "Tecnica",
    duration: "45 min",
    distance: "2.0 km",
    focus: "Catch & Pull",
    completed: true,
  },
  {
    day: "Martedi",
    type: "Riposo",
    duration: "-",
    distance: "-",
    focus: "Recupero attivo",
    completed: true,
  },
  {
    day: "Mercoledi",
    type: "Endurance",
    duration: "60 min",
    distance: "3.0 km",
    focus: "Ritmo costante",
    completed: true,
  },
  {
    day: "Giovedi",
    type: "Intervalli",
    duration: "50 min",
    distance: "2.5 km",
    focus: "10x100m @1:30",
    completed: false,
  },
  {
    day: "Venerdi",
    type: "Tecnica",
    duration: "45 min",
    distance: "2.0 km",
    focus: "Virate e partenze",
    completed: false,
  },
  {
    day: "Sabato",
    type: "Long Swim",
    duration: "75 min",
    distance: "4.0 km",
    focus: "Simulazione gara",
    completed: false,
  },
  {
    day: "Domenica",
    type: "Riposo",
    duration: "-",
    distance: "-",
    focus: "Recupero",
    completed: false,
  },
]

const insights = [
  {
    type: "success",
    icon: TrendingUp,
    title: "Pace Migliorato",
    description: "Il tuo passo sui 100m e migliorato del 3.2% nelle ultime 2 settimane",
    metric: "+3.2%",
  },
  {
    type: "warning",
    icon: AlertCircle,
    title: "Efficienza in Calo",
    description: "SWOLF aumentato dopo i 1500m - considera piu lavoro sulla resistenza",
    metric: "+2 SWOLF",
  },
  {
    type: "info",
    icon: Activity,
    title: "Frequenza Ottimale",
    description: "Stai mantenendo 4-5 sessioni/settimana - perfetto per i tuoi obiettivi",
    metric: "4.5/sett",
  },
  {
    type: "success",
    icon: Zap,
    title: "Personal Best",
    description: "Nuovo record sui 400m stile libero - 4:52.3!",
    metric: "4:52.3",
  },
]

const goals = [
  {
    title: "100m Freestyle",
    current: "1:02.4",
    target: "0:58.0",
    progress: 75,
    deadline: "Mar 2026",
  },
  {
    title: "Distanza Settimanale",
    current: "12.5 km",
    target: "15 km",
    progress: 83,
    deadline: "Ongoing",
  },
  {
    title: "SWOLF Score",
    current: "42",
    target: "38",
    progress: 60,
    deadline: "Apr 2026",
  },
]

export default function Coach() {
  const [message, setMessage] = useState("")
  const [messages, setMessages] = useState(chatMessages)

  const handleSend = () => {
    if (!message.trim()) return
    setMessages([...messages, { role: "user", content: message }])
    setMessage("")
    // Simulate AI response
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Ho registrato la tua richiesta. Sto analizzando i tuoi dati per darti una risposta personalizzata...",
        },
      ])
    }, 1000)
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
                {messages.map((msg, index) => (
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
                    placeholder="Chiedi al tuo AI Coach..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    className="bg-secondary border-0"
                  />
                  <Button size="icon" onClick={handleSend}>
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
                <p className="text-sm text-muted-foreground">20 - 26 Gennaio 2026</p>
              </div>
              <Button variant="outline" size="sm">
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
                  <span className="text-sm font-medium text-foreground">Progresso Settimanale</span>
                  <span className="text-sm text-muted-foreground">7.0 / 13.5 km</span>
                </div>
                <Progress value={52} className="h-2" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insights" className="mt-6 space-y-4">
          {insights.map((insight, index) => (
            <Card key={index} className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div
                    className={`p-2 rounded-lg ${
                      insight.type === "success"
                        ? "bg-accent/10"
                        : insight.type === "warning"
                          ? "bg-chart-4/10"
                          : "bg-primary/10"
                    }`}
                  >
                    <insight.icon
                      className={`w-5 h-5 ${
                        insight.type === "success"
                          ? "text-accent"
                          : insight.type === "warning"
                            ? "text-chart-4"
                            : "text-primary"
                      }`}
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-foreground">{insight.title}</h3>
                      <Badge
                        variant="secondary"
                        className={
                          insight.type === "success"
                            ? "bg-accent/10 text-accent"
                            : insight.type === "warning"
                              ? "bg-chart-4/10 text-chart-4"
                              : "bg-primary/10 text-primary"
                        }
                      >
                        {insight.metric}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{insight.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          <Card className="bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Sparkles className="w-6 h-6 text-primary" />
                <div className="flex-1">
                  <h3 className="font-medium text-foreground">Analisi Completa Disponibile</h3>
                  <p className="text-sm text-muted-foreground">
                    Scopri insights dettagliati basati sulle tue ultime 30 sessioni
                  </p>
                </div>
                <Button size="sm">Visualizza</Button>
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

          <Button className="w-full gap-2">
            <Target className="w-4 h-4" />
            Aggiungi Nuovo Obiettivo
          </Button>
        </TabsContent>
      </Tabs>
    </div>
    </AppLayout>
  )
}