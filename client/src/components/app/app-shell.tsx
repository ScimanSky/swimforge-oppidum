"use client"

import React, { useState } from "react"
import { Link, useLocation } from "wouter"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"
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
  { label: "Attivita", path: "/activities", icon: <Waves className="size-5" /> },
  { label: "Sfide", path: "/challenges", icon: <Trophy className="size-5" /> },
  { label: "Club", path: "/community", icon: <Users className="size-5" /> },
  { label: "Progressi", path: "/statistics", icon: <BarChart3 className="size-5" /> },
  { label: "Coach", path: "/coach", icon: <Bot className="size-5" /> },
  { label: "Profilo", path: "/profile", icon: <User className="size-5" /> },
]

function NavLink({ item, isActive, onClick }: { item: NavItem; isActive: boolean; onClick?: () => void }) {
  return (
    <Link
      href={item.path}
      onClick={onClick}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-300",
        isActive
          ? "text-primary-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {/* Active neon background */}
      {isActive && (
        <motion.div
          layoutId="active-nav"
          className="absolute inset-0 rounded-xl bg-primary/90"
          style={{
            boxShadow: "0 0 20px var(--neon-glow), 0 0 40px color-mix(in oklch, var(--primary) 15%, transparent)",
          }}
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
        />
      )}

      {/* Hover background */}
      {!isActive && (
        <div className="absolute inset-0 rounded-xl bg-secondary/0 transition-all duration-300 group-hover:bg-secondary/50" />
      )}

      <span className="relative z-10 flex items-center gap-3">
        <span className={cn(
          "transition-all duration-300",
          isActive && "drop-shadow-[0_0_8px_var(--neon-glow)]"
        )}>
          {item.icon}
        </span>
        {item.label}
      </span>

      {/* Neon edge indicator for active item */}
      {isActive && (
        <motion.div
          className="absolute -right-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary lg:block hidden"
          style={{
            boxShadow: "0 0 8px var(--neon-glow), 0 0 16px var(--neon-glow)",
          }}
          layoutId="active-indicator"
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
        />
      )}
    </Link>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const { theme, toggleTheme, switchable } = useTheme()
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
    <div className="min-h-screen overflow-x-hidden">
      {/* ── Desktop Sidebar ───────────────────────────────────── */}
      <aside className="glass-sidebar fixed left-0 top-0 z-40 hidden h-screen w-64 lg:block">
        {/* Animated neon sweep line */}
        <div className="pointer-events-none absolute left-0 w-full overflow-hidden h-full">
          <motion.div
            className="absolute left-0 h-[2px] w-full"
            style={{
              background: "linear-gradient(90deg, transparent, var(--neon-line), transparent)",
            }}
            animate={{ top: ["-5%", "105%"] }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear", repeatDelay: 4 }}
          />
        </div>

        <div className="relative flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center gap-3 border-b border-border/30 px-6">
            <motion.div
              className="flex size-9 items-center justify-center rounded-lg"
              style={{
                background: "color-mix(in oklch, var(--primary) 15%, transparent)",
                boxShadow: "0 0 16px var(--neon-soft)",
              }}
              whileHover={{ scale: 1.05 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
            >
              <img
                src="/swimforge-logo.png"
                alt="SwimForge"
                className="h-7 w-7 object-contain"
              />
            </motion.div>
            <span className="font-display text-lg font-bold tracking-wide text-foreground">
              SwimForge
            </span>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-3 py-5">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                item={item}
                isActive={location === item.path}
              />
            ))}
          </nav>

          {/* Bottom section */}
          <div className="border-t border-border/30 p-4 space-y-3">
            {/* Notifications and Messages */}
            <div className="flex items-center justify-center gap-2 pb-2">
              <NotificationBell />
              <DirectMessages />
            </div>

            {/* Theme toggle */}
            {switchable && toggleTheme && (
              <div className="flex items-center justify-between rounded-xl bg-secondary/50 px-3 py-2 text-sm backdrop-blur-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <motion.div
                    key={theme}
                    initial={{ rotate: -30, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    transition={{ duration: 0.3 }}
                  >
                    {theme === "dark" ? (
                      <Moon className="size-4" />
                    ) : (
                      <Sun className="size-4" />
                    )}
                  </motion.div>
                  <span>{theme === "dark" ? "Scuro" : "Chiaro"}</span>
                </div>
                <Switch
                  checked={theme === "dark"}
                  onCheckedChange={() => toggleTheme()}
                />
              </div>
            )}

            {/* Logout */}
            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all duration-300 hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LogOut className="size-5 transition-transform duration-300 group-hover:-translate-x-0.5" />
              {isLoggingOut ? "Logout..." : "Logout"}
            </button>
          </div>
        </div>
      </aside>

      {/* ── Mobile Header ─────────────────────────────────────── */}
      <header className="glass-header fixed left-0 right-0 top-0 z-50 flex h-16 items-center justify-between px-4 lg:hidden">
        <div className="flex items-center gap-3">
          <motion.div
            className="flex size-9 items-center justify-center rounded-lg"
            style={{
              background: "color-mix(in oklch, var(--primary) 15%, transparent)",
              boxShadow: "0 0 12px var(--neon-soft)",
            }}
            whileTap={{ scale: 0.95 }}
          >
            <img
              src="/swimforge-logo.png"
              alt="SwimForge"
              className="h-7 w-7 object-contain"
            />
          </motion.div>
          <span className="font-display text-lg font-bold tracking-wide text-foreground">
            SwimForge
          </span>
        </div>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <DirectMessages />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
            className="relative ml-1"
          >
            <AnimatePresence mode="wait">
              {mobileMenuOpen ? (
                <motion.div
                  key="close"
                  initial={{ rotate: -90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: 90, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <X className="size-6" />
                </motion.div>
              ) : (
                <motion.div
                  key="menu"
                  initial={{ rotate: 90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: -90, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Menu className="size-6" />
                </motion.div>
              )}
            </AnimatePresence>
          </Button>
        </div>
      </header>

      {/* ── Mobile Menu Overlay ───────────────────────────────── */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            className="fixed inset-0 z-40 lg:hidden"
            style={{ backgroundColor: "color-mix(in oklch, var(--background) 80%, transparent)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => setMobileMenuOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Mobile Menu Slide ─────────────────────────────────── */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            className="glass-sidebar fixed right-0 top-16 z-50 h-[calc(100vh-4rem)] w-72 lg:hidden"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            <nav className="space-y-1 px-3 py-4">
              {navItems.map((item, i) => (
                <motion.div
                  key={item.path}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.25 }}
                >
                  <NavLink
                    item={item}
                    isActive={location === item.path}
                    onClick={() => setMobileMenuOpen(false)}
                  />
                </motion.div>
              ))}

              {/* Theme toggle */}
              {switchable && toggleTheme && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: navItems.length * 0.04, duration: 0.25 }}
                  className="mt-3 flex items-center justify-between rounded-xl bg-secondary/50 px-3 py-2 text-sm backdrop-blur-sm"
                >
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
                </motion.div>
              )}

              {/* Logout */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: (navItems.length + 1) * 0.04, duration: 0.25 }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false)
                    void handleLogout()
                  }}
                  disabled={isLoggingOut}
                  className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all duration-300 hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <LogOut className="size-5 transition-transform duration-300 group-hover:-translate-x-0.5" />
                  {isLoggingOut ? "Logout..." : "Logout"}
                </button>
              </motion.div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main Content ──────────────────────────────────────── */}
      <main className="min-h-screen min-w-0 pt-16 lg:pl-64 lg:pt-0">
        <div className="mx-auto max-w-7xl min-w-0 p-4 md:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
