import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Brain, ChevronRight, TrendingUp, AlertCircle } from "lucide-react"
import Link from "next/link"

const insights = [
  {
    type: "tip",
    icon: TrendingUp,
    title: "Pace Improvement",
    message: "Your 100m pace improved 5% this week. Keep up the consistency!",
    color: "text-accent",
  },
  {
    type: "alert",
    icon: AlertCircle,
    title: "Recovery Needed",
    message: "Consider a rest day. Your training load is 15% above optimal.",
    color: "text-chart-4",
  },
]

export function AIInsights() {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg font-display font-bold text-foreground">
              AI Coach
            </CardTitle>
          </div>
          <Badge variant="secondary" className="text-xs bg-primary/20 text-primary">
            2 new
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {insights.map((insight, index) => (
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
        ))}

        <Button variant="ghost" size="sm" className="w-full mt-2" asChild>
          <Link href="/coach">
            View all insights
            <ChevronRight className="w-4 h-4 ml-1" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
