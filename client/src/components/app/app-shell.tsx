"use client"

import React, { useState } from "react"
import { Link, useLocation } from "wouter"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Waves,
  Users,
  User,
  Trophy,
  Target,
  Bot,
  Settings,
  Menu,
  X,
  Medal,
  BarChart3,
  LogOut,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { trpc } from "@/lib/trpc"
import { supabase } from "@/lib/supabase"

interface NavItem {
  label: string
  path: string
  icon: React.ReactNode
}

const navItems: NavItem[] = [
  { label: "Dashboard", path: "/dashboard", icon: <LayoutDashboard className="size-5" /> },
  { label: "Attività", path: "/activities", icon: <Waves className="size-5" /> },
  { label: "Club", path: "/community", icon: <Users className="size-5" /> },
  { label: "Badge", path: "/badges", icon: <Medal className="size-5" /> },
  { label: "Sfide", path: "/challenges", icon: <Trophy className="size-5" /> },
  { label: "Goals", path: "/goals", icon: <Target className="size-5" /> },
  { label: "Stats", path: "/statistics", icon: <BarChart3 className="size-5" /> },
  { label: "Coach", path: "/coach", icon: <Bot className="size-5" /> },
  { label: "Profilo", path: "/profile", icon: <User className="size-5" /> },
  { label: "Impostazioni", path: "/settings", icon: <Settings className="size-5" /> },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const logoutMutation = trpc.auth.logout.useMutation()

  const handleLogout = async () => {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    try {
      await logoutMutation.mutateAsync()
    } catch {
      // ignore logout errors, still clear client session
    }
    try {
      await supabase.auth.signOut()
    } catch {
      // ignore
    }
    localStorage.removeItem("swimforge:autoSync:dashboardReady")
    localStorage.removeItem("swimforge:autoSync:last")
    window.location.href = "/"
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 border-r border-border bg-card lg:block">
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center gap-2 border-b border-border px-6">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
              <Waves className="size-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold text-foreground">SwimForge</span>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-3 py-4">
            {navItems.map((item) => {
              const isActive = location === item.path
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  {item.icon}
                  {item.label}
                </Link>
              )
            })}
          </nav>

          {/* Bottom section */}
          <div className="border-t border-border p-4">
            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LogOut className="size-5" />
              {isLoggingOut ? "Logout..." : "Logout"}
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="fixed left-0 right-0 top-0 z-50 flex h-16 items-center justify-between border-b border-border bg-card px-4 lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
            <Waves className="size-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-semibold text-foreground">SwimForge</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X className="size-6" /> : <Menu className="size-6" />}
        </Button>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Menu */}
      <div
        className={cn(
          "fixed right-0 top-16 z-50 h-[calc(100vh-4rem)] w-64 transform border-l border-border bg-card transition-transform duration-200 ease-in-out lg:hidden",
          mobileMenuOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <nav className="space-y-1 px-3 py-4">
          {navItems.map((item) => {
            const isActive = location === item.path
            return (
              <Link
                key={item.path}
                href={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            )
          })}
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false)
              void handleLogout()
            }}
            disabled={isLoggingOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            <LogOut className="size-5" />
            {isLoggingOut ? "Logout..." : "Logout"}
          </button>
        </nav>
      </div>

      {/* Main Content */}
      <main className="min-h-screen pt-16 lg:pl-64 lg:pt-0">
        <div className="mx-auto max-w-7xl p-4 md:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
