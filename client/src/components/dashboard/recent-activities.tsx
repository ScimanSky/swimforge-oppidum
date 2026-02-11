import { Surface, SurfaceContent, SurfaceHeader, SurfaceTitle } from "@/components/ui/surface"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Droplets, Timer, Zap, ChevronRight } from "lucide-react"
import Link from "next/link"

type ActivityItem = {
  id: number
  activityName: string | null
  activityDate: string | Date
  distanceMeters: number
  durationSeconds: number
  avgPacePer100m: number | null
  xpEarned: number
  isOpenWater?: boolean | null
}

type RecentActivitiesProps = {
  activities: ActivityItem[]
  isLoading?: boolean
}

function formatDistance(meters: number) {
  if (!meters) return "—"
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`
}

function formatDuration(seconds: number) {
  if (!seconds) return "—"
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  }
  return `${minutes} min`
}

function formatPace(secondsPer100m: number | null, distanceMeters: number, durationSeconds: number) {
  const pace = secondsPer100m && secondsPer100m > 0
    ? secondsPer100m
    : distanceMeters > 0
    ? (durationSeconds / (distanceMeters / 100))
    : null
  if (!pace || !Number.isFinite(pace)) return "—"
  const minutes = Math.floor(pace / 60)
  const seconds = Math.round(pace % 60)
  return `${minutes}:${seconds.toString().padStart(2, "0")}/100m`
}

function formatDate(date: string | Date) {
  const parsed = new Date(date)
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

export function RecentActivities({ activities, isLoading }: RecentActivitiesProps) {
  return (
    <Surface className="bg-card border-border">
      <SurfaceHeader className="pb-2">
        <div className="flex items-center justify-between">
          <SurfaceTitle className="text-lg font-display font-bold text-foreground">
            Recent Activities
          </SurfaceTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/activities" className="text-xs text-muted-foreground hover:text-foreground">
              View all
              <ChevronRight className="w-4 h-4 ml-1" />
            </Link>
          </Button>
        </div>
      </SurfaceHeader>
      <SurfaceContent className="space-y-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="p-4 rounded-xl bg-secondary/30 space-y-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
              <div className="flex items-center gap-4">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          ))
        ) : activities.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-8">
            No activities yet. Sync your devices to get started.
          </div>
        ) : (
          activities.map((activity) => {
            const isOpenWater = Boolean(activity.isOpenWater)
            return (
              <Link
                key={activity.id}
                href={`/activities/${activity.id}`}
                className="block p-4 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-foreground truncate">
                        {activity.activityName || "Swim Session"}
                      </h4>
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
                    <p className="text-xs text-muted-foreground">
                      {formatDate(activity.activityDate)}
                    </p>

                    <div className="flex items-center gap-4 mt-3">
                      <div className="flex items-center gap-1.5">
                        <Droplets className="w-3.5 h-3.5 text-primary" />
                        <span className="text-xs text-foreground">
                          {formatDistance(activity.distanceMeters)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Timer className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs text-foreground">
                          {formatDuration(activity.durationSeconds)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-accent" />
                        <span className="text-xs text-accent font-medium">
                          +{activity.xpEarned} XP
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-display font-bold text-foreground">
                      {formatPace(
                        activity.avgPacePer100m,
                        activity.distanceMeters,
                        activity.durationSeconds
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">pace</p>
                  </div>
                </div>
              </Link>
            )
          })
        )}
      </SurfaceContent>
    </Surface>
  )
}
