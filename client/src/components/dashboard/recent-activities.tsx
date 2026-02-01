import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Droplets, Timer, Zap, ChevronRight } from "lucide-react"
import Link from "next/link"

const activities = [
  {
    id: 1,
    type: "Pool",
    title: "Morning Freestyle",
    date: "Today, 6:30 AM",
    distance: "2.5 km",
    duration: "42 min",
    xp: 85,
    pace: "1:40/100m",
  },
  {
    id: 2,
    type: "Pool",
    title: "Interval Training",
    date: "Yesterday, 7:00 AM",
    distance: "2.6 km",
    duration: "45 min",
    xp: 95,
    pace: "1:44/100m",
  },
  {
    id: 3,
    type: "Open Water",
    title: "Lake Swim",
    date: "Jan 29, 8:00 AM",
    distance: "1.8 km",
    duration: "35 min",
    xp: 75,
    pace: "1:56/100m",
  },
]

export function RecentActivities() {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-display font-bold text-foreground">
            Recent Activities
          </CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/activities" className="text-xs text-muted-foreground hover:text-foreground">
              View all
              <ChevronRight className="w-4 h-4 ml-1" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {activities.map((activity) => (
          <Link
            key={activity.id}
            href={`/activities/${activity.id}`}
            className="block p-4 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium text-foreground truncate">
                    {activity.title}
                  </h4>
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
                <p className="text-xs text-muted-foreground">{activity.date}</p>

                <div className="flex items-center gap-4 mt-3">
                  <div className="flex items-center gap-1.5">
                    <Droplets className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs text-foreground">{activity.distance}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Timer className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs text-foreground">{activity.duration}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-accent" />
                    <span className="text-xs text-accent font-medium">+{activity.xp} XP</span>
                  </div>
                </div>
              </div>

              <div className="text-right flex-shrink-0">
                <p className="text-lg font-display font-bold text-foreground">
                  {activity.pace}
                </p>
                <p className="text-xs text-muted-foreground">pace</p>
              </div>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}
