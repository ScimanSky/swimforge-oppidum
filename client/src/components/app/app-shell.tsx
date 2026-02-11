"use client"

import React, { useMemo, useState } from "react"
import { Link, useLocation } from "wouter"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  BarChart3,
  Bot,
  LayoutDashboard,
  LogOut,
  Moon,
  MoreHorizontal,
  Settings,
  Sun,
  Trophy,
  User,
  Users,
  Waves,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { trpc } from "@/lib/trpc"
import { supabase } from "@/lib/supabase"
import { useTheme } from "@/contexts/ThemeContext"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import NotificationBell from "@/components/NotificationBell"
import DirectMessages from "@/components/DirectMessages"

type NavItem = {
  label: string
  path: string
  icon: React.ReactNode
}

const navPrimary: NavItem[] = [
  { label: "Dashboard", path: "/dashboard", icon: <LayoutDashboard className="size-5" /> },
  { label: "Attività", path: "/activities", icon: <Waves className="size-5" /> },
  { label: "Sfide", path: "/challenges", icon: <Trophy className="size-5" /> },
  { label: "Club", path: "/community", icon: <Users className="size-5" /> },
  { label: "Progressi", path: "/statistics", icon: <BarChart3 className="size-5" /> },
]

const navSecondary: NavItem[] = [
  { label: "Coach", path: "/coach", icon: <Bot className="size-5" /> },
  { label: "Profilo", path: "/profile", icon: <User className="size-5" /> },
]

function titleForPath(path: string) {
  if (path === "/" || path.startsWith("/dashboard")) return "Dashboard"
  if (path.startsWith("/activities")) return "Attività"
  if (path.startsWith("/challenges")) return "Sfide"
  if (path.startsWith("/community/club") && path.includes("/event/")) return "Evento Club"
  if (path.startsWith("/community/club")) return "Club"
  if (path.startsWith("/community")) return "Community"
  if (path.startsWith("/statistics")) return "Progressi"
  if (path.startsWith("/coach")) return "Coach"
  if (path.startsWith("/profile")) return "Profilo"
  if (path.startsWith("/settings")) return "Impostazioni"
  return "SwimForge"
}

function RailLink({ item, location }: { item: NavItem; location: string }) {
  const isActive = location === item.path || location.startsWith(item.path + "/")

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={item.path}
          className={cn(
            [
              "group relative flex size-11 items-center justify-center rounded-2xl",
              "transition-[transform,box-shadow,background-color,color] duration-200 will-change-transform",
              "hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]",
            ].join(" "),
            isActive
              ? "bg-[linear-gradient(135deg,color-mix(in_oklch,var(--electric-cyan)_22%,transparent),color-mix(in_oklch,var(--electric-lime)_18%,transparent))] text-foreground shadow-[0_0_0_1px_color-mix(in_oklch,var(--electric-cyan)_28%,transparent),0_18px_55px_color-mix(in_oklch,var(--foreground)_14%,transparent),0_0_34px_var(--neon-soft)]"
              : "text-muted-foreground hover:text-foreground hover:bg-card/45 hover:shadow-[0_16px_44px_color-mix(in_oklch,var(--foreground)_12%,transparent)]",
          )}
          aria-current={isActive ? "page" : undefined}
        >
          {item.icon}
          <span
            className={cn(
              "pointer-events-none absolute -right-2 top-1/2 hidden h-6 w-1 -translate-y-1/2 rounded-full bg-[linear-gradient(to_bottom,var(--electric-cyan),var(--electric-lime))] opacity-0 transition-opacity lg:block",
              isActive && "opacity-100",
            )}
          />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>
        {item.label}
      </TooltipContent>
    </Tooltip>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const { theme, toggleTheme, switchable } = useTheme()
  const logoutMutation = trpc.auth.logout.useMutation()
  const reduceMotion = useReducedMotion()

  const pageTitle = useMemo(() => titleForPath(location), [location])

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
      {/* Desktop Rail */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[88px] border-r border-border/70 bg-[linear-gradient(180deg,color-mix(in_oklch,var(--card)_50%,transparent),color-mix(in_oklch,var(--background)_65%,transparent))] backdrop-blur-xl shadow-[0_18px_55px_color-mix(in_oklch,var(--foreground)_14%,transparent)] lg:flex">
        <div className="flex h-full w-full flex-col items-center">
          <div className="flex h-16 items-center justify-center">
            <Link
              href="/dashboard"
              className="group relative flex size-11 items-center justify-center rounded-2xl ei-border-gradient shadow-[0_0_32px_var(--neon-soft)] transition-transform hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]"
              aria-label="Vai al Dashboard"
            >
              <img
                src="/swimforge-logo.png"
                alt="SwimForge"
                className="h-8 w-8 object-contain"
              />
            </Link>
          </div>

          <nav className="flex w-full flex-col items-center gap-2 px-3 py-4">
            {navPrimary.map((item) => (
              <RailLink key={item.path} item={item} location={location} />
            ))}
            <div className="my-2 h-px w-full bg-border/70" />
            {navSecondary.map((item) => (
              <RailLink key={item.path} item={item} location={location} />
            ))}
          </nav>

          <div className="mt-auto w-full border-t border-border/70 px-3 py-3">
            <div className="flex items-center justify-center gap-2">
              <NotificationBell />
              <DirectMessages />
            </div>
            <div className="mt-3 flex items-center justify-center gap-2">
              {switchable && toggleTheme && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => toggleTheme()}
                  aria-label={theme === "dark" ? "Passa al tema chiaro" : "Passa al tema scuro"}
                  className="rounded-2xl hover:shadow-[0_0_22px_var(--neon-soft)]"
                >
                  {theme === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => void handleLogout()}
                disabled={isLoggingOut}
                aria-label="Logout"
                className="rounded-2xl hover:shadow-[0_0_22px_var(--neon-soft)]"
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* Top Bar */}
      <header className="fixed left-0 right-0 top-0 z-50 h-16 border-b border-border/70 bg-[linear-gradient(180deg,color-mix(in_oklch,var(--card)_54%,transparent),color-mix(in_oklch,var(--background)_62%,transparent))] backdrop-blur-xl shadow-[0_18px_55px_color-mix(in_oklch,var(--foreground)_12%,transparent)] lg:pl-[88px]">
        <div className="flex h-full items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">Neon Soft Dark</div>
              <div className="truncate text-lg font-display font-semibold tracking-wide">
                {pageTitle}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <NotificationBell />
            <DirectMessages />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline-neon" size="icon" aria-label="Menu">
                  <MoreHorizontal className="size-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Menu</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/statistics" className="flex items-center gap-2">
                    <BarChart3 className="size-4" />
                    Progressi
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/coach" className="flex items-center gap-2">
                    <Bot className="size-4" />
                    Coach
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/profile" className="flex items-center gap-2">
                    <User className="size-4" />
                    Profilo
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings" className="flex items-center gap-2">
                    <Settings className="size-4" />
                    Impostazioni
                  </Link>
                </DropdownMenuItem>
                {switchable && toggleTheme && (
                  <DropdownMenuItem onClick={() => toggleTheme()}>
                    {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
                    Tema: {theme === "dark" ? "Scuro" : "Chiaro"}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => void handleLogout()}>
                  <LogOut className="size-4" />
                  {isLoggingOut ? "Logout..." : "Logout"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Nav (new skeleton) */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/70 bg-[linear-gradient(180deg,color-mix(in_oklch,var(--card)_58%,transparent),color-mix(in_oklch,var(--background)_70%,transparent))] backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-2">
          {[navPrimary[0], navPrimary[1], navPrimary[2], navPrimary[3], navSecondary[1]].map((item) => {
            const isActive = location === item.path || location.startsWith(item.path + "/")
            return (
              <Link
                key={item.path}
                href={item.path}
                className={cn(
                  "flex h-14 w-full flex-col items-center justify-center gap-1 rounded-2xl text-xs font-semibold transition-[transform,box-shadow,background-color,color] active:scale-[0.98]",
                  isActive
                    ? "text-foreground bg-[linear-gradient(135deg,color-mix(in_oklch,var(--electric-cyan)_18%,transparent),color-mix(in_oklch,var(--electric-lime)_14%,transparent))] shadow-[0_0_0_1px_color-mix(in_oklch,var(--electric-cyan)_22%,transparent),0_10px_26px_var(--neon-soft)]"
                    : "text-muted-foreground hover:bg-card/45 hover:text-foreground",
                )}
              >
                <span className={cn("transition-colors", isActive && "text-foreground")}>
                  {item.icon}
                </span>
                <span className="leading-none">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Main Content */}
      <main className="min-h-screen min-w-0 pt-16 pb-[5.5rem] lg:pb-0 lg:pl-[88px]">
        <div className="mx-auto max-w-[1520px] min-w-0 p-4 md:p-5 lg:p-7">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location}
              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 10, filter: "blur(4px)" }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8, filter: "blur(4px)" }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.28, ease: "easeOut" }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  )
}
