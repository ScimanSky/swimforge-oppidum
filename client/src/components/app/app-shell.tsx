"use client"

import React, { useState } from "react"
import { Link, useLocation } from "wouter"
import { cn } from "@/lib/utils"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  LayoutDashboard,
  Waves,
  Users,
  User,
  Trophy,
  Bot,
  Menu,
  X,
  BarChart3,
  LogOut,
  Sun,
  Moon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { trpc } from "@/lib/trpc"
import { supabase } from "@/lib/supabase"
import { Switch } from "@/components/ui/switch"
import { useTheme } from "@/contexts/ThemeContext"
import NotificationBell from "@/components/NotificationBell"
import DirectMessages from "@/components/DirectMessages"

interface NavItem {
  label: string
  path: string
  icon: React.ReactNode
}

const navItems: NavItem[] = [
  { label: "Dashboard", path: "/dashboard", icon: <LayoutDashboard className="size-5" /> },
  { label: "Attività", path: "/activities", icon: <Waves className="size-5" /> },
  { label: "Sfide", path: "/challenges", icon: <Trophy className="size-5" /> },
  { label: "Club", path: "/community", icon: <Users className="size-5" /> },
  { label: "Progressi", path: "/statistics", icon: <BarChart3 className="size-5" /> },
  { label: "Coach", path: "/coach", icon: <Bot className="size-5" /> },
  { label: "Profilo", path: "/profile", icon: <User className="size-5" /> },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const { theme, toggleTheme, switchable } = useTheme()
  const logoutMutation = trpc.auth.logout.useMutation()
  const reduceMotion = useReducedMotion()

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
    <div className="min-h-screen bg-transparent overflow-x-hidden">
      {/* Desktop Sidebar */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 border-r border-white/40 bg-white/55 backdrop-blur-xl shadow-[0_18px_55px_color-mix(in_oklch,var(--foreground)_14%,transparent)] lg:block">
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center gap-3 border-b border-white/40 px-6">
            <div className="flex size-9 items-center justify-center rounded-lg bg-[linear-gradient(135deg,var(--electric-cyan),var(--electric-lime),var(--electric-coral))] shadow-[0_0_26px_var(--neon-soft)]">
              <img
                src="/swimforge-logo.png"
                alt="SwimForge"
                className="h-7 w-7 object-contain"
              />
            </div>
            <span className="text-lg font-semibold text-foreground font-display tracking-wide">
              SwimForge
            </span>
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
                      ? "bg-[linear-gradient(135deg,var(--electric-cyan),var(--electric-lime),var(--electric-coral))] text-primary-foreground shadow-[0_0_0_1px_color-mix(in_oklch,white_50%,transparent),0_10px_28px_var(--neon-soft)]"
                      : "text-muted-foreground hover:bg-white/45 hover:text-foreground"
                  )}
                >
                  {item.icon}
                  {item.label}
                </Link>
              )
            })}
          </nav>

          {/* Bottom section */}
          <div className="border-t border-white/40 p-4 space-y-3">
            {/* Notifications and Messages */}
            <div className="flex items-center justify-center gap-2 pb-2">
              <NotificationBell />
              <DirectMessages />
            </div>
            {switchable && toggleTheme && (
              <div className="flex items-center justify-between rounded-lg bg-white/45 backdrop-blur-md border border-white/45 px-3 py-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  {theme === "dark" ? (
                    <Moon className="size-4" />
                  ) : (
                    <Sun className="size-4" />
                  )}
                  <span>{theme === "dark" ? "Scuro" : "Chiaro"}</span>
                </div>
                <Switch
                  checked={theme === "dark"}
                  onCheckedChange={() => toggleTheme()}
                />
              </div>
            )}
            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-white/45 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LogOut className="size-5" />
              {isLoggingOut ? "Logout..." : "Logout"}
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="fixed left-0 right-0 top-0 z-50 flex h-16 items-center justify-between border-b border-white/40 bg-white/60 backdrop-blur-xl px-4 lg:hidden">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-[linear-gradient(135deg,var(--electric-cyan),var(--electric-lime),var(--electric-coral))] shadow-[0_0_26px_var(--neon-soft)]">
            <img
              src="/swimforge-logo.png"
              alt="SwimForge"
              className="h-7 w-7 object-contain"
            />
          </div>
          <span className="text-lg font-semibold text-foreground font-display tracking-wide">
            SwimForge
          </span>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <DirectMessages />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="size-6" /> : <Menu className="size-6" />}
          </Button>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Menu */}
      <div
        className={cn(
          "fixed right-0 top-16 z-50 h-[calc(100vh-4rem)] w-64 transform border-l border-white/40 bg-white/60 backdrop-blur-xl transition-transform duration-200 ease-in-out lg:hidden shadow-[0_18px_55px_color-mix(in_oklch,var(--foreground)_14%,transparent)]",
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
                    ? "bg-[linear-gradient(135deg,var(--electric-cyan),var(--electric-lime),var(--electric-coral))] text-primary-foreground shadow-[0_0_0_1px_color-mix(in_oklch,white_50%,transparent),0_10px_28px_var(--neon-soft)]"
                    : "text-muted-foreground hover:bg-white/45 hover:text-foreground"
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            )
          })}
          {switchable && toggleTheme && (
            <div className="mt-3 flex items-center justify-between rounded-lg bg-white/45 backdrop-blur-md border border-white/45 px-3 py-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                {theme === "dark" ? (
                  <Moon className="size-4" />
                ) : (
                  <Sun className="size-4" />
                )}
                <span>{theme === "dark" ? "Scuro" : "Chiaro"}</span>
              </div>
              <Switch
                checked={theme === "dark"}
                onCheckedChange={() => toggleTheme()}
              />
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false)
              void handleLogout()
            }}
            disabled={isLoggingOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-white/45 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            <LogOut className="size-5" />
            {isLoggingOut ? "Logout..." : "Logout"}
          </button>
        </nav>
      </div>

      {/* Main Content */}
      <main className="min-h-screen min-w-0 pt-16 lg:pl-64 lg:pt-0">
        <div className="mx-auto max-w-7xl min-w-0 p-4 md:p-6 lg:p-8">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location}
              initial={
                reduceMotion
                  ? { opacity: 1 }
                  : { opacity: 0, y: 10, filter: "blur(4px)" }
              }
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8, filter: "blur(4px)" }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { duration: 0.28, ease: "easeOut" }
              }
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  )
}
