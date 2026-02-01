"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts"

const weekData = [
  { day: "Mon", distance: 2.4, goal: 2 },
  { day: "Tue", distance: 0, goal: 2 },
  { day: "Wed", distance: 3.1, goal: 2 },
  { day: "Thu", distance: 1.8, goal: 2 },
  { day: "Fri", distance: 2.6, goal: 2 },
  { day: "Sat", distance: 2.5, goal: 2 },
  { day: "Sun", distance: 0, goal: 2 },
]

export function WeeklyProgress() {
  const totalDistance = weekData.reduce((acc, day) => acc + day.distance, 0)
  const weeklyGoal = 14

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-display font-bold text-foreground">
            Weekly Progress
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {totalDistance.toFixed(1)} / {weeklyGoal} km
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[200px] mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekData} barSize={24}>
              <XAxis
                dataKey="day"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                tickFormatter={(value) => `${value}km`}
              />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  color: "hsl(var(--foreground))",
                }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
                formatter={(value: number) => [`${value} km`, "Distance"]}
              />
              <Bar
                dataKey="distance"
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
          <div>
            <p className="text-sm text-muted-foreground">Goal completion</p>
            <p className="text-lg font-display font-bold text-foreground">
              {Math.round((totalDistance / weeklyGoal) * 100)}%
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Remaining</p>
            <p className="text-lg font-display font-bold text-accent">
              {(weeklyGoal - totalDistance).toFixed(1)} km
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
