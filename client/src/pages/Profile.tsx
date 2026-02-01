import AppLayout from "@/components/AppLayout"
import Image from "next/image"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Settings,
  Share2,
  Trophy,
  Flame,
  Target,
  Droplets,
  Clock,
  Calendar,
  Award,
  TrendingUp,
  Star,
  Zap,
  Medal,
  Shield,
  Sunrise,
  Timer,
} from "lucide-react"

const stats = {
  totalDistance: "1,234 km",
  totalTime: "187 hours",
  totalSessions: 342,
  avgPace: "1:42/100m",
  longestSwim: "8.5 km",
  currentStreak: 12,
  bestStreak: 45,
}

const badges = [
  { icon: Flame, name: "Streak Master", description: "30 day streak", earned: true, color: "text-orange-500" },
  { icon: Trophy, name: "Champion", description: "Win 10 challenges", earned: true, color: "text-chart-4" },
  { icon: Sunrise, name: "Early Bird", description: "50 morning swims", earned: true, color: "text-yellow-500" },
  { icon: Shield, name: "Ironman", description: "Complete an Ironman", earned: true, color: "text-primary" },
  { icon: Star, name: "All-Star", description: "Top 10 leaderboard", earned: true, color: "text-purple-500" },
  { icon: Timer, name: "Speed Demon", description: "Sub 1:30 pace", earned: false, color: "text-muted-foreground" },
  { icon: Target, name: "Goal Crusher", description: "Hit 100 goals", earned: false, color: "text-muted-foreground" },
  { icon: Medal, name: "Veteran", description: "500 sessions", earned: false, color: "text-muted-foreground" },
]

const achievements = [
  { title: "First 100km", date: "Jan 15, 2025", xp: 500 },
  { title: "Level 40 Reached", date: "Jan 10, 2025", xp: 1000 },
  { title: "30 Day Streak", date: "Dec 28, 2024", xp: 300 },
  { title: "Open Water Pro", date: "Dec 15, 2024", xp: 250 },
]

export default function Profile() {
  return (
    <AppLayout>
    <div className="p-4 lg:p-6 space-y-6">
      {/* Profile Header */}
      <Card className="bg-card border-border overflow-hidden">
        <div className="relative h-32 sm:h-48">
          <Image
            src="/images/pool-lanes.jpg"
            alt="Cover"
            fill
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />
        </div>
        <CardContent className="relative px-4 sm:px-6 pb-6">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-12 sm:-mt-16">
            <Avatar className="w-24 h-24 sm:w-32 sm:h-32 border-4 border-card">
              <AvatarImage src="/images/athlete-1.jpg" alt="Sarah Chen" />
              <AvatarFallback className="text-2xl">SC</AvatarFallback>
            </Avatar>
            
            <div className="flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <h1 className="text-2xl font-display font-bold text-foreground">
                  Sarah Chen
                </h1>
                <div className="flex items-center gap-2">
                  <Badge className="bg-primary text-primary-foreground">
                    <Zap className="w-3 h-3 mr-1" />
                    Level 42
                  </Badge>
                  <Badge variant="outline" className="border-accent text-accent">
                    <Flame className="w-3 h-3 mr-1" />
                    12 day streak
                  </Badge>
                </div>
              </div>
              <p className="text-muted-foreground mt-1">Olympic Trialist | Bay Area Masters</p>
              
              {/* XP Progress */}
              <div className="mt-4 max-w-md">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Progress to Level 43</span>
                  <span className="text-foreground font-medium">2,450 / 3,000 XP</span>
                </div>
                <Progress value={82} className="h-2" />
              </div>
            </div>

            <div className="flex gap-2 sm:self-start">
              <Button variant="outline" size="icon">
                <Share2 className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon">
                <Settings className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4 text-center">
            <Droplets className="w-6 h-6 text-primary mx-auto mb-2" />
            <p className="text-2xl font-display font-bold text-foreground">
              {stats.totalDistance}
            </p>
            <p className="text-xs text-muted-foreground">Total Distance</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 text-center">
            <Clock className="w-6 h-6 text-primary mx-auto mb-2" />
            <p className="text-2xl font-display font-bold text-foreground">
              {stats.totalTime}
            </p>
            <p className="text-xs text-muted-foreground">Time in Water</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 text-center">
            <Calendar className="w-6 h-6 text-primary mx-auto mb-2" />
            <p className="text-2xl font-display font-bold text-foreground">
              {stats.totalSessions}
            </p>
            <p className="text-xs text-muted-foreground">Total Sessions</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 text-center">
            <TrendingUp className="w-6 h-6 text-accent mx-auto mb-2" />
            <p className="text-2xl font-display font-bold text-foreground">
              {stats.avgPace}
            </p>
            <p className="text-xs text-muted-foreground">Average Pace</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="badges" className="space-y-6">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="badges">Badges</TabsTrigger>
          <TabsTrigger value="achievements">Achievements</TabsTrigger>
          <TabsTrigger value="stats">Detailed Stats</TabsTrigger>
        </TabsList>

        {/* Badges Tab */}
        <TabsContent value="badges">
          <Card className="bg-card border-border">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-display font-bold text-foreground">
                  Badges Collection
                </CardTitle>
                <span className="text-sm text-muted-foreground">
                  5 / 8 earned
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {badges.map((badge, index) => (
                  <div
                    key={index}
                    className={`p-4 rounded-xl text-center transition-all ${
                      badge.earned
                        ? "bg-secondary/50"
                        : "bg-secondary/20 opacity-50"
                    }`}
                  >
                    <div
                      className={`w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center ${
                        badge.earned ? "bg-background" : "bg-muted"
                      }`}
                    >
                      <badge.icon className={`w-6 h-6 ${badge.color}`} />
                    </div>
                    <h4 className="font-medium text-foreground text-sm">
                      {badge.name}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      {badge.description}
                    </p>
                    {!badge.earned && (
                      <Badge variant="outline" className="mt-2 text-xs">
                        Locked
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Achievements Tab */}
        <TabsContent value="achievements">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg font-display font-bold text-foreground">
                Recent Achievements
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {achievements.map((achievement, index) => (
                <div
                  key={index}
                  className="flex items-center gap-4 p-4 rounded-xl bg-secondary/30"
                >
                  <div className="w-12 h-12 rounded-full bg-chart-4/10 flex items-center justify-center flex-shrink-0">
                    <Award className="w-6 h-6 text-chart-4" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-foreground">
                      {achievement.title}
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      {achievement.date}
                    </p>
                  </div>
                  <Badge className="bg-accent/20 text-accent">
                    +{achievement.xp} XP
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Detailed Stats Tab */}
        <TabsContent value="stats">
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-lg font-display font-bold text-foreground">
                  Personal Records
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { label: "Longest Swim", value: stats.longestSwim, icon: Droplets },
                  { label: "Best 100m Pace", value: "1:28/100m", icon: Timer },
                  { label: "Best Streak", value: `${stats.bestStreak} days`, icon: Flame },
                  { label: "Most XP in Day", value: "450 XP", icon: Zap },
                ].map((record, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 rounded-lg bg-secondary/30"
                  >
                    <div className="flex items-center gap-3">
                      <record.icon className="w-5 h-5 text-primary" />
                      <span className="text-sm text-muted-foreground">
                        {record.label}
                      </span>
                    </div>
                    <span className="font-display font-bold text-foreground">
                      {record.value}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-lg font-display font-bold text-foreground">
                  Swimming Style Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { style: "Freestyle", percentage: 65, color: "bg-primary" },
                  { style: "Backstroke", percentage: 15, color: "bg-accent" },
                  { style: "Breaststroke", percentage: 12, color: "bg-chart-4" },
                  { style: "Butterfly", percentage: 8, color: "bg-chart-5" },
                ].map((style, index) => (
                  <div key={index}>
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-foreground">{style.style}</span>
                      <span className="text-muted-foreground">
                        {style.percentage}%
                      </span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div
                        className={`h-full ${style.color} rounded-full transition-all`}
                        style={{ width: `${style.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
    </AppLayout>
  )
}