import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { LucideIcon } from "lucide-react"

export type DashboardStat = {
  icon: LucideIcon
  label: string
  value: string
  change?: string
  changeType?: "positive" | "negative" | "neutral"
}

type DashboardStatsProps = {
  stats: DashboardStat[]
  isLoading?: boolean
}

export function DashboardStats({ stats, isLoading }: DashboardStatsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-5 w-20" />
                </div>
              </div>
              <Skeleton className="h-3 w-24 mt-3" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const safeStats =
    stats.length > 0
      ? stats
      : [
          { icon: (null as unknown) as LucideIcon, label: "This Week", value: "—" },
          { icon: (null as unknown) as LucideIcon, label: "Total Time", value: "—" },
          { icon: (null as unknown) as LucideIcon, label: "Avg Pace", value: "—" },
          { icon: (null as unknown) as LucideIcon, label: "Sessions", value: "—" },
        ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {safeStats.map((stat, index) => (
        <Card key={index} className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              {stat.icon ? (
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <stat.icon className="w-5 h-5 text-primary" />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-lg bg-primary/10" />
              )}
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">{stat.label}</p>
                <p className="text-lg font-display font-bold text-foreground truncate">
                  {stat.value}
                </p>
              </div>
            </div>
            {stat.change ? (
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
            ) : (
              <p className="text-xs mt-2 text-muted-foreground">—</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
