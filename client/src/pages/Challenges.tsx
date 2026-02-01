"use client"

import AppLayout from "@/components/AppLayout"
import { useState } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Trophy,
  Users,
  Clock,
  Target,
  Flame,
  Medal,
  Crown,
  Plus,
  ChevronRight,
  Zap,
  Calendar,
  TrendingUp,
} from "lucide-react"

const activeChallenges = [
  {
    id: 1,
    title: "January Distance King",
    description: "Swim the most kilometers in January",
    type: "distance",
    target: 50,
    current: 32.5,
    unit: "km",
    participants: 234,
    daysLeft: 12,
    prize: "500 XP + Gold Badge",
    rank: 15,
    image: "/images/pool-lanes.jpg",
  },
  {
    id: 2,
    title: "Consistency Champion",
    description: "Complete 20 swims in 30 days",
    type: "frequency",
    target: 20,
    current: 14,
    unit: "sessions",
    participants: 512,
    daysLeft: 18,
    prize: "300 XP + Silver Badge",
    rank: 42,
    image: "/images/open-water.jpg",
  },
  {
    id: 3,
    title: "Speed Demon Sprint",
    description: "Best 100m freestyle time",
    type: "time",
    target: null,
    current: "1:02.4",
    unit: "best time",
    participants: 156,
    daysLeft: 5,
    prize: "400 XP + Speed Badge",
    rank: 8,
    image: "/images/hero-swimmer.jpg",
  },
]

const availableChallenges = [
  {
    id: 4,
    title: "February Marathon",
    description: "Swim 100km in February",
    type: "distance",
    target: 100,
    unit: "km",
    participants: 89,
    startsIn: "3 days",
    prize: "1000 XP + Platinum Badge",
    difficulty: "hard",
  },
  {
    id: 5,
    title: "Technique Master",
    description: "Improve stroke efficiency by 10%",
    type: "efficiency",
    target: 10,
    unit: "% improvement",
    participants: 145,
    startsIn: "Now",
    prize: "350 XP + Technique Badge",
    difficulty: "medium",
  },
  {
    id: 6,
    title: "Early Bird Challenge",
    description: "Complete 10 morning swims before 7 AM",
    type: "frequency",
    target: 10,
    unit: "morning sessions",
    participants: 67,
    startsIn: "Now",
    prize: "250 XP + Early Bird Badge",
    difficulty: "easy",
  },
]

const leaderboard = [
  { rank: 1, name: "Michael Phelps Jr.", avatar: "/images/athlete-1.jpg", distance: 48.2, xp: 12500 },
  { rank: 2, name: "Katie L.", avatar: "/images/athlete-2.jpg", distance: 45.8, xp: 11200 },
  { rank: 3, name: "Ryan S.", avatar: "/images/athlete-3.jpg", distance: 44.1, xp: 10800 },
  { rank: 4, name: "Emma W.", avatar: "/images/athlete-1.jpg", distance: 42.5, xp: 9500 },
  { rank: 5, name: "David T.", avatar: "/images/athlete-2.jpg", distance: 40.2, xp: 9100 },
]

const completedChallenges = [
  {
    id: 101,
    title: "December Distance",
    result: "3rd Place",
    prize: "300 XP + Bronze Badge",
    completedAt: "Dec 31, 2025",
  },
  {
    id: 102,
    title: "Holiday Sprint",
    result: "1st Place",
    prize: "500 XP + Gold Badge",
    completedAt: "Dec 25, 2025",
  },
  {
    id: 103,
    title: "Autumn Marathon",
    result: "Completed",
    prize: "200 XP",
    completedAt: "Nov 30, 2025",
  },
]

export default function Challenges() {
  const [activeTab, setActiveTab] = useState("active")

  return (
    <AppLayout>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Challenges</h1>
          <p className="text-muted-foreground">Compete, earn badges, and climb the leaderboard</p>
        </div>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          Create Challenge
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Trophy className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-display font-bold text-foreground">12</p>
                <p className="text-xs text-muted-foreground">Challenges Won</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-accent/10">
                <Medal className="w-5 h-5 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-display font-bold text-foreground">28</p>
                <p className="text-xs text-muted-foreground">Badges Earned</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-chart-4/10">
                <Flame className="w-5 h-5 text-chart-4" />
              </div>
              <div>
                <p className="text-2xl font-display font-bold text-foreground">7</p>
                <p className="text-xs text-muted-foreground">Day Streak</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-chart-5/10">
                <Zap className="w-5 h-5 text-chart-5" />
              </div>
              <div>
                <p className="text-2xl font-display font-bold text-foreground">8,450</p>
                <p className="text-xs text-muted-foreground">Total XP</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-secondary">
          <TabsTrigger value="active">Active (3)</TabsTrigger>
          <TabsTrigger value="available">Available</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-6 space-y-4">
          {activeChallenges.map((challenge) => (
            <Card key={challenge.id} className="bg-card border-border overflow-hidden">
              <div className="flex flex-col md:flex-row">
                <div className="relative w-full md:w-48 h-32 md:h-auto">
                  <Image
                    src={challenge.image || "/placeholder.svg"}
                    alt={challenge.title}
                    fill
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent to-card md:bg-gradient-to-t md:from-transparent md:to-card/50" />
                </div>
                <CardContent className="flex-1 p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-display font-semibold text-foreground">{challenge.title}</h3>
                      <p className="text-sm text-muted-foreground">{challenge.description}</p>
                    </div>
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {challenge.daysLeft}d left
                    </Badge>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-medium text-foreground">
                          {challenge.current} / {challenge.target || "-"} {challenge.unit}
                        </span>
                      </div>
                      {challenge.target && (
                        <Progress
                          value={(Number(challenge.current) / challenge.target) * 100}
                          className="h-2"
                        />
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          {challenge.participants}
                        </span>
                        <span className="flex items-center gap-1">
                          <TrendingUp className="w-4 h-4" />
                          Rank #{challenge.rank}
                        </span>
                      </div>
                      <Badge className="bg-primary/10 text-primary border-0">
                        {challenge.prize}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </div>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="available" className="mt-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {availableChallenges.map((challenge) => (
              <Card key={challenge.id} className="bg-card border-border">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <Badge
                      variant="outline"
                      className={
                        challenge.difficulty === "hard"
                          ? "border-chart-5 text-chart-5"
                          : challenge.difficulty === "medium"
                            ? "border-chart-4 text-chart-4"
                            : "border-accent text-accent"
                      }
                    >
                      {challenge.difficulty}
                    </Badge>
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {challenge.startsIn}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg font-display">{challenge.title}</CardTitle>
                  <p className="text-sm text-muted-foreground">{challenge.description}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Target className="w-4 h-4" />
                      Target: {challenge.target} {challenge.unit}
                    </span>
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Users className="w-4 h-4" />
                      {challenge.participants}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <Badge className="bg-primary/10 text-primary border-0 text-xs">
                      {challenge.prize}
                    </Badge>
                    <Button size="sm">
                      Join Challenge
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="completed" className="mt-6 space-y-3">
          {completedChallenges.map((challenge) => (
            <Card key={challenge.id} className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-primary/10">
                      <Trophy className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium text-foreground">{challenge.title}</h3>
                      <p className="text-sm text-muted-foreground">{challenge.completedAt}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge
                      className={
                        challenge.result === "1st Place"
                          ? "bg-chart-4/10 text-chart-4 border-0"
                          : challenge.result === "3rd Place"
                            ? "bg-chart-5/10 text-chart-5 border-0"
                            : "bg-secondary text-secondary-foreground border-0"
                      }
                    >
                      {challenge.result}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">{challenge.prize}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="leaderboard" className="mt-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-display">
                <Crown className="w-5 h-5 text-chart-4" />
                January Distance King - Top 10
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {leaderboard.map((user, index) => (
                <div
                  key={user.rank}
                  className={`flex items-center gap-4 p-3 rounded-lg ${
                    index === 0
                      ? "bg-chart-4/10"
                      : index === 1
                        ? "bg-muted/50"
                        : index === 2
                          ? "bg-chart-5/10"
                          : "bg-secondary/30"
                  }`}
                >
                  <span
                    className={`w-8 text-center font-display font-bold ${
                      index === 0
                        ? "text-chart-4"
                        : index === 1
                          ? "text-muted-foreground"
                          : index === 2
                            ? "text-chart-5"
                            : "text-muted-foreground"
                    }`}
                  >
                    #{user.rank}
                  </span>
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={user.avatar || "/placeholder.svg"} alt={user.name} />
                    <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-medium text-foreground">{user.name}</p>
                    <p className="text-sm text-muted-foreground">{user.xp.toLocaleString()} XP</p>
                  </div>
                  <div className="text-right">
                    <p className="font-display font-bold text-primary">{user.distance} km</p>
                  </div>
                </div>
              ))}

              <div className="pt-4 border-t border-border mt-4">
                <div className="flex items-center gap-4 p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <span className="w-8 text-center font-display font-bold text-primary">#15</span>
                  <Avatar className="h-10 w-10 ring-2 ring-primary">
                    <AvatarImage src="/images/athlete-1.jpg" alt="You" />
                    <AvatarFallback>You</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-medium text-foreground">You</p>
                    <p className="text-sm text-muted-foreground">8,450 XP</p>
                  </div>
                  <div className="text-right">
                    <p className="font-display font-bold text-primary">32.5 km</p>
                  </div>
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