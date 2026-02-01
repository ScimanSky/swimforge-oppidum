"use client"

import React from "react"

import { useState } from "react"
import { AppHeader } from "./app-header"
import { AppBottomNav } from "./app-bottom-nav"
import { AppSidebar } from "./app-sidebar"

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <AppSidebar open={sidebarOpen} onOpenChange={setSidebarOpen} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen lg:ml-64">
        <AppHeader onMenuClick={() => setSidebarOpen(true)} />

        <main className="flex-1 pb-20 lg:pb-0">
          {children}
        </main>

        {/* Mobile Bottom Navigation */}
        <AppBottomNav />
      </div>
    </div>
  )
}
