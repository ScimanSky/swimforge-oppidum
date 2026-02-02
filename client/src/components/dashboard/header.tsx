import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Flame, Zap } from "lucide-react"

type DashboardHeaderProps = {
  name?: string | null
  streak?: number | null
  xp?: number | null
  isLoading?: boolean
}

export function DashboardHeader({ name, streak, xp, isLoading }: DashboardHeaderProps) {
  const currentDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
  const displayName = name?.split(" ")[0] || "Swimmer"
  const streakLabel =
    streak !== null && streak !== undefined
      ? `${streak} day${streak === 1 ? "" : "s"} streak`
      : "—"
  const xpLabel = xp !== null && xp !== undefined ? `${xp.toLocaleString()} XP` : "—"

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        ) : (
          <>
            <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">
              Welcome back, {displayName}!
            </h1>
            <p className="text-muted-foreground mt-1">{currentDate}</p>
          </>
        )}
      </div>
      
      <div className="flex items-center gap-3">
        {isLoading ? (
          <>
            <Skeleton className="h-8 w-32 rounded-full" />
            <Skeleton className="h-8 w-28 rounded-full" />
          </>
        ) : (
          <>
            <Badge variant="outline" className="h-8 px-3 gap-1.5 border-accent text-accent">
              <Flame className="w-4 h-4" />
              <span className="font-medium">{streakLabel}</span>
            </Badge>
            <Badge className="h-8 px-3 gap-1.5 bg-primary text-primary-foreground">
              <Zap className="w-4 h-4" />
              <span className="font-medium">{xpLabel}</span>
            </Badge>
          </>
        )}
      </div>
    </div>
  )
}
