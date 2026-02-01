"use client"

import AppLayout from "@/components/AppLayout"
import { DashboardHeader } from "@/components/dashboard/header"
import { DashboardStats } from "@/components/dashboard/stats"
import { RecentActivities } from "@/components/dashboard/recent-activities"
import { WeeklyProgress } from "@/components/dashboard/weekly-progress"
import { AIInsights } from "@/components/dashboard/ai-insights"
import { QuickActions } from "@/components/dashboard/quick-actions"
import { Leaderboard } from "@/components/dashboard/leaderboard"

export default function Dashboard() {
  return (
    <AppLayout>
      <div className="p-4 lg:p-6 space-y-6">
        <DashboardHeader />
        <DashboardStats />

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <WeeklyProgress />
            <RecentActivities />
          </div>
          <div className="space-y-6">
            <QuickActions />
            <AIInsights />
            <Leaderboard />
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
