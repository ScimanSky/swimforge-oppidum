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
      {/* ── Desktop Sidebar ─────────────────────────────── */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[280px] lg:block">
        {/* Glass sidebar background with image */}
        <div className="absolute inset-0 bg-sidebar-image opacity-20 dark:opacity-10" />
        <div className="absolute inset-0 glass-sidebar" />

        {/* Animated neon edge line */}
        <div className="sidebar-glow-line absolute inset-0 pointer-events-none" />

        <div className="relative flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-20 items-center gap-3 px-6">
            <motion.div
              className="flex size-10 items-center justify-center rounded-xl neon-outline"
              style={{
                background: "linear-gradient(135deg, color-mix(in oklch, var(--primary) 20%, transparent), color-mix(in oklch, var(--primary) 8%, transparent))",
              }}
              whileHover={{ scale: 1.1, rotate: 5 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <img
                src="/swimforge-logo.png"
                alt="SwimForge"
                className="h-7 w-7 object-contain drop-shadow-[0_0_8px_var(--neon-glow)]"
              />
            </motion.div>
            <div className="flex flex-col">
              <span className="text-lg font-semibold tracking-tight text-foreground font-[var(--font-display)]">
                SwimForge
              </span>
              <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Swim Platform
              </span>
            </div>
          </div>

          {/* Divider with glow */}
          <div className="mx-4 h-px bg-gradient-to-r from-transparent via-neon-line to-transparent" />

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-3 py-4 neon-scrollbar overflow-y-auto">
            {navItems.map((item) => {
              const isActive = location === item.path
              return (
                <Link key={item.path} href={item.path}>
                  <motion.div
                    className={cn(
                      "relative flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors cursor-pointer",
                      isActive
                        ? "neon-active-link text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    whileHover={!isActive ? {
                      x: 4,
                      backgroundColor: "color-mix(in oklch, var(--primary) 8%, transparent)",
                    } : {}}
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  >
                    {/* Active indicator bar */}
                    {isActive && (
                      <motion.div
                        className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full"
                        style={{
                          background: "var(--primary)",
                          boxShadow: "0 0 12px var(--neon-glow), 0 0 24px var(--neon-soft)",
                        }}
                        layoutId="sidebar-active-indicator"
                        transition={{ type: "spring", stiffness: 350, damping: 30 }}
                      />
                    )}

                    <span className={cn(
                      "transition-all",
                      isActive && "drop-shadow-[0_0_8px_var(--neon-glow)]"
                    )}>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>

                    {/* Active glow radial */}
                    {isActive && (
                      <motion.div
                        className="absolute inset-0 rounded-xl pointer-events-none"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        style={{
                          background: "radial-gradient(ellipse at center, var(--neon-soft), transparent 70%)",
                        }}
                      />
                    )}
                  </motion.div>
                </Link>
              )
            })}
          </nav>

          {/* Divider with glow */}
          <div className="mx-4 h-px bg-gradient-to-r from-transparent via-neon-line to-transparent" />

          {/* Bottom section */}
          <div className="p-4 space-y-3">
            {/* Notifications and Messages */}
            <div className="flex items-center justify-center gap-3 pb-2">
              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
                <NotificationBell />
              </motion.div>
              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
                <DirectMessages />
              </motion.div>
            </div>

            {/* Theme toggle */}
            {switchable && toggleTheme && (
              <motion.div
                className="flex items-center justify-between rounded-xl px-4 py-2.5 text-sm"
                style={{
                  background: "color-mix(in oklch, var(--primary) 6%, transparent)",
                  border: "1px solid color-mix(in oklch, var(--border) 30%, transparent)",
                }}
                whileHover={{
                  boxShadow: "0 0 20px var(--neon-soft)",
                }}
              >
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
              </motion.div>
            )}

            {/* Logout */}
            <motion.button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
              whileHover={{
                x: 2,
                backgroundColor: "color-mix(in oklch, var(--destructive) 10%, transparent)",
              }}
              whileTap={{ scale: 0.98 }}
            >
              <LogOut className="size-5" />
              {isLoggingOut ? "Logout..." : "Logout"}
            </motion.button>
          </div>
        </div>
      </aside>

      {/* ── Mobile Header ─────────────────────────────── */}
      <header className="fixed left-0 right-0 top-0 z-50 lg:hidden">
        <div className="glass-header header-glow-line">
          <div className="flex h-16 items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <motion.div
                className="flex size-9 items-center justify-center rounded-lg neon-outline"
                style={{
                  background: "linear-gradient(135deg, color-mix(in oklch, var(--primary) 20%, transparent), color-mix(in oklch, var(--primary) 8%, transparent))",
                }}
                whileTap={{ scale: 0.95 }}
              >
                <img
                  src="/swimforge-logo.png"
                  alt="SwimForge"
                  className="h-6 w-6 object-contain drop-shadow-[0_0_6px_var(--neon-glow)]"
                />
              </motion.div>
              <span className="text-lg font-semibold text-foreground font-[var(--font-display)]">
                SwimForge
              </span>
            </div>
            <div className="flex items-center gap-1">
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <NotificationBell />
              </motion.div>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <DirectMessages />
              </motion.div>
              <motion.div whileTap={{ scale: 0.9, rotate: 90 }}>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  aria-label="Toggle menu"
                  className="relative"
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
              </motion.div>
            </div>
          </div>
        </div>
      </header>

      {/* ── Mobile Menu Overlay ─────────────────────────── */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            className="fixed inset-0 z-40 lg:hidden"
            style={{
              background: "color-mix(in oklch, var(--background) 70%, transparent)",
              backdropFilter: "blur(8px)",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setMobileMenuOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Mobile Menu ─────────────────────────────────── */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            className="fixed right-0 top-16 z-50 h-[calc(100vh-4rem)] w-72 glass-mobile-menu lg:hidden"
            style={{
              borderLeft: "1px solid color-mix(in oklch, var(--border) 30%, transparent)",
            }}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            {/* Glow line on left edge */}
            <div className="absolute left-0 top-0 bottom-0 w-px overflow-hidden pointer-events-none">
              <motion.div
                className="absolute left-0 w-full h-[30%]"
                style={{
                  background: "linear-gradient(180deg, transparent, var(--neon-line), transparent)",
                }}
                animate={{ top: ["-30%", "130%"] }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
            </div>

            <nav className="space-y-1 px-3 py-4 neon-scrollbar overflow-y-auto h-full">
              {navItems.map((item, index) => {
                const isActive = location === item.path
                return (
                  <motion.div
                    key={item.path}
                    initial={{ x: 40, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: index * 0.05, type: "spring", stiffness: 300 }}
                  >
                    <Link
                      href={item.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors",
                        isActive
                          ? "neon-active-link text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <span className={cn(
                        "transition-all",
                        isActive && "drop-shadow-[0_0_8px_var(--neon-glow)]"
                      )}>
                        {item.icon}
                      </span>
                      {item.label}
                    </Link>
                  </motion.div>
                )
              })}

              <motion.div
                initial={{ x: 40, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: navItems.length * 0.05 }}
              >
                <div className="my-3 mx-2 h-px bg-gradient-to-r from-transparent via-neon-line to-transparent" />
              </motion.div>

              {switchable && toggleTheme && (
                <motion.div
                  className="flex items-center justify-between rounded-xl px-4 py-2.5 text-sm"
                  style={{
                    background: "color-mix(in oklch, var(--primary) 6%, transparent)",
                    border: "1px solid color-mix(in oklch, var(--border) 30%, transparent)",
                  }}
                  initial={{ x: 40, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: (navItems.length + 1) * 0.05 }}
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

              <motion.button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false)
                  void handleLogout()
                }}
                disabled={isLoggingOut}
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                initial={{ x: 40, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: (navItems.length + 2) * 0.05 }}
                whileTap={{ scale: 0.98 }}
              >
                <LogOut className="size-5" />
                {isLoggingOut ? "Logout..." : "Logout"}
              </motion.button>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main Content ─────────────────────────────────── */}
      <main className="min-h-screen min-w-0 pt-16 pb-20 lg:pl-[280px] lg:pt-0 lg:pb-0">
        <motion.div
          className="mx-auto max-w-7xl min-w-0 p-4 md:p-6 lg:p-8"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          {children}
        </motion.div>
      </main>
    </div>
  )
}
