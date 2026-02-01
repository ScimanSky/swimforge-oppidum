"use client"

import AppLayout from "@/components/AppLayout"
import React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Target,
  Plus,
  TrendingUp,
  Clock,
  Waves,
  Zap,
  CheckCircle2,
  Circle,
  Edit,
  Trash2,
  Calendar,
  Trophy,
  Flag,
} from "lucide-react"

const activeGoals = [
  {
    id: 1,
    title: "Nuotare 100m in meno di 1 minuto",
    category: "speed",
    currentValue: "1:02.4",
    targetValue: "0:58.0",
    unit: "min:sec",
    progress: 72,
    deadline: "31 Mar 2026",
    status: "on-track",
    milestones: [
      { title: "Scendere sotto 1:05", completed: true },
      { title: "Scendere sotto 1:02", completed: true },
      { title: "Scendere sotto 1:00", completed: false },
      { title: "Raggiungere 0:58", completed: false },
    ],
  },
  {
    id: 2,
    title: "Nuotare 15km a settimana",
    category: "distance",
    currentValue: "12.5",
    targetValue: "15",
    unit: "km/settimana",
    progress: 83,
    deadline: "In corso",
    status: "on-track",
    milestones: [
      { title: "10km/settimana", completed: true },
      { title: "12km/settimana", completed: true },
      { title: "15km/settimana", completed: false },
    ],
  },
  {
    id: 3,
    title: "Migliorare SWOLF a 38",
    category: "efficiency",
    currentValue: "42",
    targetValue: "38",
    unit: "SWOLF",
    progress: 50,
    deadline: "30 Apr 2026",
    status: "behind",
    milestones: [
      { title: "SWOLF 44", completed: true },
      { title: "SWOLF 42", completed: true },
      { title: "SWOLF 40", completed: false },
      { title: "SWOLF 38", completed: false },
    ],
  },
  {
    id: 4,
    title: "Completare 200 sessioni nel 2026",
    category: "frequency",
    currentValue: "23",
    targetValue: "200",
    unit: "sessioni",
    progress: 11,
    deadline: "31 Dic 2026",
    status: "on-track",
    milestones: [
      { title: "50 sessioni", completed: false },
      { title: "100 sessioni", completed: false },
      { title: "150 sessioni", completed: false },
      { title: "200 sessioni", completed: false },
    ],
  },
]

const completedGoals = [
  {
    id: 101,
    title: "Nuotare 1000km totali",
    completedAt: "15 Gen 2026",
    reward: "500 XP + Badge Maratoneta",
  },
  {
    id: 102,
    title: "Partecipare a 10 sfide",
    completedAt: "28 Dic 2025",
    reward: "300 XP + Badge Competitivo",
  },
  {
    id: 103,
    title: "Streak di 30 giorni",
    completedAt: "20 Nov 2025",
    reward: "400 XP + Badge Costante",
  },
]

const suggestedGoals = [
  {
    title: "Migliorare la resistenza aerobica",
    description: "Nuota 2000m senza pause",
    category: "endurance",
  },
  {
    title: "Padroneggiare il dorso",
    description: "Completa 50km di dorso",
    category: "technique",
  },
  {
    title: "Partecipare a una gara",
    description: "Iscriviti alla tua prima competizione",
    category: "milestone",
  },
]

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
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  return (
    <AppLayout>
      <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Obiettivi</h1>
          <p className="text-muted-foreground">Definisci e traccia i tuoi obiettivi di nuoto</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Nuovo Obiettivo
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="font-display">Crea Nuovo Obiettivo</DialogTitle>
              <DialogDescription>
                Definisci un obiettivo SMART per migliorare le tue performance
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Nome Obiettivo</Label>
                <Input placeholder="Es: Nuotare 100m in meno di 1 minuto" className="bg-secondary border-0" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select>
                    <SelectTrigger className="bg-secondary border-0">
                      <SelectValue placeholder="Seleziona" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="speed">Velocita</SelectItem>
                      <SelectItem value="distance">Distanza</SelectItem>
                      <SelectItem value="efficiency">Efficienza</SelectItem>
                      <SelectItem value="frequency">Frequenza</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Scadenza</Label>
                  <Input type="date" className="bg-secondary border-0" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Valore Attuale</Label>
                  <Input placeholder="Es: 1:02" className="bg-secondary border-0" />
                </div>
                <div className="space-y-2">
                  <Label>Valore Target</Label>
                  <Input placeholder="Es: 0:58" className="bg-secondary border-0" />
                </div>
              </div>
              <Button className="w-full" onClick={() => setIsDialogOpen(false)}>
                Crea Obiettivo
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Target className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-display font-bold text-foreground">{activeGoals.length}</p>
                <p className="text-xs text-muted-foreground">Obiettivi Attivi</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-accent/10">
                <CheckCircle2 className="w-5 h-5 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-display font-bold text-foreground">{completedGoals.length}</p>
                <p className="text-xs text-muted-foreground">Completati</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-chart-4/10">
                <TrendingUp className="w-5 h-5 text-chart-4" />
              </div>
              <div>
                <p className="text-2xl font-display font-bold text-foreground">75%</p>
                <p className="text-xs text-muted-foreground">Media Progresso</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-chart-5/10">
                <Trophy className="w-5 h-5 text-chart-5" />
              </div>
              <div>
                <p className="text-2xl font-display font-bold text-foreground">1,200</p>
                <p className="text-xs text-muted-foreground">XP da Obiettivi</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Goals */}
      <div>
        <h2 className="text-lg font-display font-semibold text-foreground mb-4">Obiettivi Attivi</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {activeGoals.map((goal) => {
            const Icon = categoryIcons[goal.category] || Target
            const colorClass = categoryColors[goal.category] || "text-primary bg-primary/10"

            return (
              <Card key={goal.id} className="bg-card border-border">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${colorClass.split(" ")[1]}`}>
                        <Icon className={`w-5 h-5 ${colorClass.split(" ")[0]}`} />
                      </div>
                      <div>
                        <h3 className="font-medium text-foreground">{goal.title}</h3>
                        <p className="text-sm text-muted-foreground">Scadenza: {goal.deadline}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        Attuale: <span className="text-foreground font-medium">{goal.currentValue} {goal.unit}</span>
                      </span>
                      <span className="text-muted-foreground">
                        Target: <span className="text-primary font-medium">{goal.targetValue} {goal.unit}</span>
                      </span>
                    </div>
                    <Progress value={goal.progress} className="h-2" />
                    <div className="flex items-center justify-between">
                      <Badge
                        variant="secondary"
                        className={
                          goal.status === "on-track"
                            ? "bg-accent/10 text-accent"
                            : "bg-chart-5/10 text-chart-5"
                        }
                      >
                        {goal.status === "on-track" ? "In linea" : "In ritardo"}
                      </Badge>
                      <span className="text-sm text-muted-foreground">{goal.progress}%</span>
                    </div>
                  </div>

                  {/* Milestones */}
                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-xs text-muted-foreground mb-2">Tappe intermedie</p>
                    <div className="space-y-2">
                      {goal.milestones.map((milestone, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm">
                          {milestone.completed ? (
                            <CheckCircle2 className="w-4 h-4 text-accent" />
                          ) : (
                            <Circle className="w-4 h-4 text-muted-foreground" />
                          )}
                          <span className={milestone.completed ? "text-muted-foreground line-through" : "text-foreground"}>
                            {milestone.title}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Suggested Goals */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="font-display text-lg">Obiettivi Suggeriti</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {suggestedGoals.map((goal, index) => {
            const Icon = categoryIcons[goal.category] || Target
            const colorClass = categoryColors[goal.category] || "text-primary bg-primary/10"

            return (
              <div
                key={index}
                className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${colorClass.split(" ")[1]}`}>
                    <Icon className={`w-4 h-4 ${colorClass.split(" ")[0]}`} />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{goal.title}</p>
                    <p className="text-sm text-muted-foreground">{goal.description}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm">
                  Aggiungi
                </Button>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Completed Goals */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-accent" />
            Obiettivi Completati
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {completedGoals.map((goal) => (
            <div
              key={goal.id}
              className="flex items-center justify-between p-3 rounded-lg bg-accent/5"
            >
              <div className="flex items-center gap-3">
                <Trophy className="w-5 h-5 text-chart-4" />
                <div>
                  <p className="font-medium text-foreground">{goal.title}</p>
                  <p className="text-sm text-muted-foreground">Completato il {goal.completedAt}</p>
                </div>
              </div>
              <Badge className="bg-chart-4/10 text-chart-4 border-0">{goal.reward}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
      </div>
    </AppLayout>
  )
}
