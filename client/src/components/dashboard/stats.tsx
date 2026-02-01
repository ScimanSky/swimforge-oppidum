import { Card, CardContent } from "@/components/ui/card"
import { Activity, Clock, TrendingUp, Droplets } from "lucide-react"

const stats = [
  {
    icon: Activity,
    label: "This Week",
    value: "12.4 km",
    change: "+2.3 km",
    changeType: "positive",
  },
  {
    icon: Clock,
    label: "Total Time",
    value: "4h 32m",
    change: "+45 min",
    changeType: "positive",
  },
  {
    icon: TrendingUp,
    label: "Avg Pace",
    value: "1:42/100m",
    change: "-3 sec",
    changeType: "positive",
  },
  {
    icon: Droplets,
    label: "Sessions",
    value: "5",
    change: "Same as last week",
    changeType: "neutral",
  },
]

export function DashboardStats() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, index) => (
        <Card key={index} className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <stat.icon className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">{stat.label}</p>
                <p className="text-lg font-display font-bold text-foreground truncate">
                  {stat.value}
                </p>
              </div>
            </div>
            <p
              className={`text-xs mt-2 ${
                stat.changeType === "positive"
                  ? "text-accent"
                  : stat.changeType === "negative"
                  ? "text-destructive"
                  : "text-muted-foreground"
              }`}
            >
              {stat.change}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
