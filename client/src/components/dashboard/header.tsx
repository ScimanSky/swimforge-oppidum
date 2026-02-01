import { Badge } from "@/components/ui/badge"
import { Flame, Zap } from "lucide-react"

export function DashboardHeader() {
  const currentDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">
          Welcome back, Sarah!
        </h1>
        <p className="text-muted-foreground mt-1">{currentDate}</p>
      </div>
      
      <div className="flex items-center gap-3">
        <Badge variant="outline" className="h-8 px-3 gap-1.5 border-accent text-accent">
          <Flame className="w-4 h-4" />
          <span className="font-medium">12 day streak</span>
        </Badge>
        <Badge className="h-8 px-3 gap-1.5 bg-primary text-primary-foreground">
          <Zap className="w-4 h-4" />
          <span className="font-medium">2,450 XP</span>
        </Badge>
      </div>
    </div>
  )
}
