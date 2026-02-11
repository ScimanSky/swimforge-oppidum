import { Surface, SurfaceContent, SurfaceHeader, SurfaceTitle } from "@/components/ui/surface"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Brain, ChevronRight, TrendingUp, AlertCircle } from "lucide-react"
import Link from "next/link"

type AIInsightsProps = {
  insights: string[]
  isLoading?: boolean
}

const pickInsightStyle = (text: string) => {
  const normalized = text.toLowerCase()
  if (normalized.includes("attenzione") || normalized.includes("riposo") || normalized.includes("warning")) {
    return { icon: AlertCircle, color: "text-chart-4", label: "Alert" }
  }
  return { icon: TrendingUp, color: "text-accent", label: "Tip" }
}

const makeTitle = (text: string) => {
  const cleaned = text.replace(/^[\d\.\-\s]+/, "").trim()
  const colonIndex = cleaned.indexOf(":")
  if (colonIndex > 0 && colonIndex < 48) {
    return cleaned.slice(0, colonIndex).trim()
  }
  const words = cleaned.split(/\s+/).slice(0, 4).join(" ")
  return words || "Insight"
}

export function AIInsights({ insights, isLoading }: AIInsightsProps) {
  const displayInsights = insights.slice(0, 2).map((message) => {
    const style = pickInsightStyle(message)
    return {
      ...style,
      title: makeTitle(message),
      message,
    }
  })

  return (
    <Surface className="bg-card border-border">
      <SurfaceHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            <SurfaceTitle className="text-lg font-display font-bold text-foreground">
              AI Coach
            </SurfaceTitle>
          </div>
          {isLoading ? (
            <Skeleton className="h-5 w-14" />
          ) : (
            <Badge variant="secondary" className="text-xs bg-primary/20 text-primary">
              {insights.length} new
            </Badge>
          )}
        </div>
      </SurfaceHeader>
      <SurfaceContent className="space-y-3">
        {isLoading ? (
          Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="p-3 rounded-lg bg-secondary/30 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          ))
        ) : displayInsights.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No insights yet. Sync new activities to generate AI feedback.
          </div>
        ) : (
          displayInsights.map((insight, index) => (
            <div
              key={index}
              className="p-3 rounded-lg bg-secondary/30 space-y-2"
            >
              <div className="flex items-center gap-2">
                <insight.icon className={`w-4 h-4 ${insight.color}`} />
                <span className="text-sm font-medium text-foreground">
                  {insight.title}
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {insight.message}
              </p>
            </div>
          ))
        )}

        <Button variant="ghost" size="sm" className="w-full mt-2" asChild>
          <Link href="/coach">
            View all insights
            <ChevronRight className="w-4 h-4 ml-1" />
          </Link>
        </Button>
      </SurfaceContent>
    </Surface>
  )
}
