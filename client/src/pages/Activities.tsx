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
import { trpc } from "@/lib/trpc"
import { Skeleton } from "@/components/ui/skeleton"

const formatDistance = (meters: number) => {
  if (!meters) return "—"
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`
}

const formatDuration = (seconds: number) => {
  if (!seconds) return "—"
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  return `${minutes} min`
}

const formatPace = (secondsPer100m: number | null, distanceMeters: number, durationSeconds: number) => {
  const pace = secondsPer100m && secondsPer100m > 0
    ? secondsPer100m
    : distanceMeters > 0
    ? durationSeconds / (distanceMeters / 100)
    : null
  if (!pace || !Number.isFinite(pace)) return "—"
  const minutes = Math.floor(pace / 60)
  const seconds = Math.round(pace % 60)
  return `${minutes}:${seconds.toString().padStart(2, "0")}/100m`
}

const formatDate = (date: string | Date) => {
  const parsed = new Date(date)
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

const formatTime = (date: string | Date) => {
  const parsed = new Date(date)
  return parsed.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
}

export default function Activities() {
  const [filter, setFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState("recent")

  const activitiesQuery = trpc.activities.list.useQuery({ limit: 100, offset: 0, source: "all" })
  const advancedQuery = trpc.statistics.getAdvanced.useQuery({ days: 30 })

  const activities = activitiesQuery.data ?? []

  const filteredActivities = activities
    .filter((activity) => {
      const activityType = activity.isOpenWater ? "open-water" : "pool"
      if (filter !== "all" && activityType !== filter) return false
      if (search && !(activity.activityName || "").toLowerCase().includes(search.toLowerCase()))
        return false
      return true
    })
    .sort((a, b) => {
      if (sort === "distance") return (b.distanceMeters || 0) - (a.distanceMeters || 0)
      if (sort === "duration") return (b.durationSeconds || 0) - (a.durationSeconds || 0)
      if (sort === "xp") return (b.xpEarned || 0) - (a.xpEarned || 0)
      return new Date(b.activityDate).getTime() - new Date(a.activityDate).getTime()
    })

  const monthStart = new Date()
  monthStart.setDate(monthStart.getDate() - 30)
  monthStart.setHours(0, 0, 0, 0)
  const monthActivities = activities.filter((activity) => new Date(activity.activityDate) >= monthStart)
  const totalDistance = monthActivities.reduce((sum, a) => sum + (a.distanceMeters || 0), 0)
  const totalTime = monthActivities.reduce((sum, a) => sum + (a.durationSeconds || 0), 0)
  const totalXp = monthActivities.reduce((sum, a) => sum + (a.xpEarned || 0), 0)
  const avgEfficiency = advancedQuery.data?.swimmingEfficiencyIndex

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
          <Select value={sort} onValueChange={setSort}>
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
            {activitiesQuery.isLoading ? (
              <Skeleton className="h-6 w-20" />
            ) : (
              <p className="text-xl font-display font-bold text-foreground">{formatDistance(totalDistance)}</p>
            )}
            <p className="text-xs text-accent mt-1">Last 30 days</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Timer className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">Total Time</span>
            </div>
            {activitiesQuery.isLoading ? (
              <Skeleton className="h-6 w-20" />
            ) : (
              <p className="text-xl font-display font-bold text-foreground">{formatDuration(totalTime)}</p>
            )}
            <p className="text-xs text-accent mt-1">Last 30 days</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-accent" />
              <span className="text-xs text-muted-foreground">XP Earned</span>
            </div>
            {activitiesQuery.isLoading ? (
              <Skeleton className="h-6 w-20" />
            ) : (
              <p className="text-xl font-display font-bold text-foreground">{totalXp} XP</p>
            )}
            <p className="text-xs text-accent mt-1">Last 30 days</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">Avg Efficiency</span>
            </div>
            {advancedQuery.isLoading ? (
              <Skeleton className="h-6 w-20" />
            ) : (
              <p className="text-xl font-display font-bold text-foreground">
                {avgEfficiency !== null && avgEfficiency !== undefined
                  ? `${Math.round(avgEfficiency)}%`
                  : "—"}
              </p>
            )}
            <p className="text-xs text-accent mt-1">SEI Index</p>
          </CardContent>
        </Card>
      </div>

      {/* Activities List */}
      <div className="space-y-3">
        {activitiesQuery.isLoading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <Card key={index} className="bg-card border-border">
              <CardContent className="p-4">
                <Skeleton className="h-4 w-40 mb-3" />
                <Skeleton className="h-3 w-28 mb-4" />
                <div className="grid grid-cols-4 gap-4">
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-6 w-16" />
                </div>
              </CardContent>
            </Card>
          ))
        ) : filteredActivities.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="p-8 text-center text-muted-foreground">
              No activities found. Sync your devices to see your sessions here.
            </CardContent>
          </Card>
        ) : (
          filteredActivities.map((activity) => {
            const isOpenWater = Boolean(activity.isOpenWater)
            return (
              <Link key={activity.id} href={`/activities/${activity.id}`}>
                <Card className="bg-card border-border hover:border-primary/50 transition-all">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      {/* Activity Icon */}
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          isOpenWater ? "bg-accent/10" : "bg-primary/10"
                        }`}
                      >
                        {isOpenWater ? (
                          <MapPin className="w-6 h-6 text-accent" />
                        ) : (
                          <Waves className="w-6 h-6 text-primary" />
                        )}
                      </div>

                      {/* Activity Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-foreground truncate">
                            {activity.activityName || "Swim Session"}
                          </h3>
                          <Badge
                            variant="secondary"
                            className={`text-xs flex-shrink-0 ${
                              isOpenWater
                                ? "bg-accent/20 text-accent"
                                : "bg-primary/20 text-primary"
                            }`}
                          >
                            {isOpenWater ? "Open Water" : "Pool"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(activity.activityDate)} at {formatTime(activity.activityDate)}
                        </p>

                        {/* Stats Grid */}
                        <div className="grid grid-cols-4 gap-4 mt-4">
                          <div>
                            <p className="text-lg font-display font-bold text-foreground">
                              {formatDistance(activity.distanceMeters)}
                            </p>
                            <p className="text-xs text-muted-foreground">Distance</p>
                          </div>
                          <div>
                            <p className="text-lg font-display font-bold text-foreground">
                              {formatDuration(activity.durationSeconds)}
                            </p>
                            <p className="text-xs text-muted-foreground">Duration</p>
                          </div>
                          <div>
                            <p className="text-lg font-display font-bold text-foreground">
                              {formatPace(
                                activity.avgPacePer100m,
                                activity.distanceMeters,
                                activity.durationSeconds
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">Pace</p>
                          </div>
                          <div>
                            <p className="text-lg font-display font-bold text-accent">
                              +{activity.xpEarned}
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
            )
          })
        )}
      </div>
    </div>
    </AppLayout>
  )
}
