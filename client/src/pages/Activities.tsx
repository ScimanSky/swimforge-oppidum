"use client"

import AppLayout from "@/components/AppLayout"
import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Search,
  Plus,
  Filter,
  Droplets,
  Timer,
  Zap,
  TrendingUp,
  ChevronRight,
  Waves,
  MapPin,
} from "lucide-react"
import Link from "next/link"

const activities = [
  {
    id: 1,
    type: "Pool",
    title: "Morning Freestyle",
    date: "Today",
    time: "6:30 AM",
    distance: "2.5 km",
    duration: "42 min",
    xp: 85,
    pace: "1:40/100m",
    strokes: 1240,
    efficiency: 92,
  },
  {
    id: 2,
    type: "Pool",
    title: "Interval Training",
    date: "Yesterday",
    time: "7:00 AM",
    distance: "2.6 km",
    duration: "45 min",
    xp: 95,
    pace: "1:44/100m",
    strokes: 1380,
    efficiency: 88,
  },
  {
    id: 3,
    type: "Open Water",
    title: "Lake Swim",
    date: "Jan 29",
    time: "8:00 AM",
    distance: "1.8 km",
    duration: "35 min",
    xp: 75,
    pace: "1:56/100m",
    strokes: 920,
    efficiency: 85,
  },
  {
    id: 4,
    type: "Pool",
    title: "Technique Drills",
    date: "Jan 28",
    time: "6:00 AM",
    distance: "1.5 km",
    duration: "30 min",
    xp: 65,
    pace: "2:00/100m",
    strokes: 780,
    efficiency: 94,
  },
  {
    id: 5,
    type: "Pool",
    title: "Endurance Swim",
    date: "Jan 27",
    time: "7:30 AM",
    distance: "3.0 km",
    duration: "52 min",
    xp: 110,
    pace: "1:44/100m",
    strokes: 1560,
    efficiency: 89,
  },
  {
    id: 6,
    type: "Open Water",
    title: "Coastal Training",
    date: "Jan 25",
    time: "9:00 AM",
    distance: "2.2 km",
    duration: "48 min",
    xp: 100,
    pace: "2:11/100m",
    strokes: 1100,
    efficiency: 82,
  },
]

export default function Activities() {
  const [filter, setFilter] = useState("all")
  const [search, setSearch] = useState("")

  const filteredActivities = activities.filter((activity) => {
    if (filter !== "all" && activity.type.toLowerCase().replace(" ", "-") !== filter)
      return false
    if (search && !activity.title.toLowerCase().includes(search.toLowerCase()))
      return false
    return true
  })

  return (
    <AppLayout>
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">
            Activities
          </h1>
          <p className="text-muted-foreground mt-1">
            Track and manage all your swim sessions
          </p>
        </div>
        <Button asChild>
          <Link href="/activities/new">
            <Plus className="w-4 h-4 mr-2" />
            Log Activity
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search activities..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-secondary/50 border-transparent focus:border-primary"
          />
        </div>
        <div className="flex gap-2">
          <Tabs value={filter} onValueChange={setFilter}>
            <TabsList className="bg-secondary/50">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="pool">Pool</TabsTrigger>
              <TabsTrigger value="open-water">Open Water</TabsTrigger>
            </TabsList>
          </Tabs>
          <Select defaultValue="recent">
            <SelectTrigger className="w-[130px] bg-secondary/50 border-transparent">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Most Recent</SelectItem>
              <SelectItem value="distance">Distance</SelectItem>
              <SelectItem value="duration">Duration</SelectItem>
              <SelectItem value="xp">XP Earned</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Activity Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Droplets className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">Total Distance</span>
            </div>
            <p className="text-xl font-display font-bold text-foreground">13.6 km</p>
            <p className="text-xs text-accent mt-1">This month</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Timer className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">Total Time</span>
            </div>
            <p className="text-xl font-display font-bold text-foreground">4h 12m</p>
            <p className="text-xs text-accent mt-1">This month</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-accent" />
              <span className="text-xs text-muted-foreground">XP Earned</span>
            </div>
            <p className="text-xl font-display font-bold text-foreground">530 XP</p>
            <p className="text-xs text-accent mt-1">This month</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">Avg Efficiency</span>
            </div>
            <p className="text-xl font-display font-bold text-foreground">88%</p>
            <p className="text-xs text-accent mt-1">+3% vs last month</p>
          </CardContent>
        </Card>
      </div>

      {/* Activities List */}
      <div className="space-y-3">
        {filteredActivities.map((activity) => (
          <Link key={activity.id} href={`/activities/${activity.id}`}>
            <Card className="bg-card border-border hover:border-primary/50 transition-all">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  {/* Activity Icon */}
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      activity.type === "Pool"
                        ? "bg-primary/10"
                        : "bg-accent/10"
                    }`}
                  >
                    {activity.type === "Pool" ? (
                      <Waves className="w-6 h-6 text-primary" />
                    ) : (
                      <MapPin className="w-6 h-6 text-accent" />
                    )}
                  </div>

                  {/* Activity Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-foreground truncate">
                        {activity.title}
                      </h3>
                      <Badge
                        variant="secondary"
                        className={`text-xs flex-shrink-0 ${
                          activity.type === "Pool"
                            ? "bg-primary/20 text-primary"
                            : "bg-accent/20 text-accent"
                        }`}
                      >
                        {activity.type}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {activity.date} at {activity.time}
                    </p>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-4 gap-4 mt-4">
                      <div>
                        <p className="text-lg font-display font-bold text-foreground">
                          {activity.distance}
                        </p>
                        <p className="text-xs text-muted-foreground">Distance</p>
                      </div>
                      <div>
                        <p className="text-lg font-display font-bold text-foreground">
                          {activity.duration}
                        </p>
                        <p className="text-xs text-muted-foreground">Duration</p>
                      </div>
                      <div>
                        <p className="text-lg font-display font-bold text-foreground">
                          {activity.pace}
                        </p>
                        <p className="text-xs text-muted-foreground">Pace</p>
                      </div>
                      <div>
                        <p className="text-lg font-display font-bold text-accent">
                          +{activity.xp}
                        </p>
                        <p className="text-xs text-muted-foreground">XP</p>
                      </div>
                    </div>
                  </div>

                  {/* Arrow */}
                  <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
    </AppLayout>
  )
}