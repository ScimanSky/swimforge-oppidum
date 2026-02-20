"use client"

import React, { useEffect, useMemo, useState } from "react"
import { Link, useLocation } from "wouter"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  BarChart3,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Plus,
  Search,
  Settings,
  Shield,
  Target,
  User,
  Users,
  Waves,
  Moon,
  Sun,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { trpc } from "@/lib/trpc"
import { supabase } from "@/lib/supabase"
import { useTheme } from "@/contexts/ThemeContext"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import NotificationBell from "@/components/NotificationBell"
import DirectMessages from "@/components/DirectMessages"
import { CreatePostSheet } from "@/components/social/CreatePostSheet"
import { SwimForgeMark, SwimForgeWordmark } from "@/components/brand/SwimForgeBrand"

type NavItem = {
  label: string
  path: string
  icon: React.ReactNode
  match: (path: string) => boolean
}

const normalizePath = (location: string) => location.split("?")[0].split("#")[0] || "/"

const isChallengesPath = (path: string) =>
  path.startsWith("/season/challenges") || path.startsWith("/challenges")

const isTrainingPath = (path: string) =>
  path.startsWith("/track") ||
  path.startsWith("/activities") ||
  path.startsWith("/coach") ||
  path.startsWith("/season/objectives") ||
  path.startsWith("/goals") ||
  path.startsWith("/session-iq")

const isCommunityPath = (path: string) =>
  path === "/home" ||
  path.startsWith("/post/") ||
  path.startsWith("/home/report/") ||
  path.startsWith("/report/post/") ||
  path.startsWith("/home/community") ||
  path.startsWith("/community") ||
  path.startsWith("/badges")

const isProfilePath = (path: string) =>
  path.startsWith("/profile") ||
  path.startsWith("/settings") ||
  path.startsWith("/statistics") ||
  path.startsWith("/u/")

const isDashboardPath = (path: string) =>
  path === "/dashboard" ||
  path.startsWith("/home/dashboard") ||
  path === "/season" ||
  path.startsWith("/season/leaderboard") ||
  path.startsWith("/leaderboard")

const athleteNav: NavItem[] = [
  {
    label: "Dashboard",
    path: "/home/dashboard",
    icon: <LayoutDashboard className="size-4" />,
    match: (path) => isDashboardPath(path) && !isChallengesPath(path) && !isTrainingPath(path),
  },
  {
    label: "Training",
    path: "/track",
    icon: <Waves className="size-4" />,
    match: (path) => isTrainingPath(path),
  },
  {
    label: "Challenges",
    path: "/season/challenges",
    icon: <Target className="size-4" />,
    match: (path) => isChallengesPath(path),
  },
  {
    label: "Community",
    path: "/home",
    icon: <Users className="size-4" />,
    match: (path) => isCommunityPath(path),
  },
  {
    label: "Profile",
    path: "/profile",
    icon: <User className="size-4" />,
    match: (path) => isProfilePath(path),
  },
]

const adminNav: NavItem[] = [
  {
    label: "Dashboard",
    path: "/home/dashboard",
    icon: <LayoutDashboard className="size-4" />,
    match: (path) => path.startsWith("/home/dashboard"),
  },
  {
    label: "Reports",
    path: "/admin/reports",
    icon: <Shield className="size-4" />,
    match: (path) => path.startsWith("/admin/reports"),
  },
  {
    label: "Users",
    path: "/home/community",
    icon: <Users className="size-4" />,
    match: (path) => path.startsWith("/home/community"),
  },
  {
    label: "Analytics",
    path: "/profile/performance",
    icon: <BarChart3 className="size-4" />,
    match: (path) => path.startsWith("/profile/performance") || path.startsWith("/statistics"),
  },
  {
    label: "Settings",
    path: "/settings",
    icon: <Settings className="size-4" />,
    match: (path) => path.startsWith("/settings"),
  },
]

function athleteTitleForPath(path: string) {
  if (path.startsWith("/community/club") && path.includes("/event/")) return "Club Event"
  if (path.startsWith("/community/club")) return "Club Details"
  if (path.startsWith("/home/community") || path === "/community") return "Club Directory"
  if (path.startsWith("/season/challenges/") || path.startsWith("/challenges/")) return "Challenge Details"
  if (path.startsWith("/season/challenges") || path.startsWith("/challenges")) return "Challenges"
  if (path === "/home") return "Social Home Feed"
  if (path.startsWith("/track/") || path.startsWith("/activities/")) return "Activity Detail"
  if (path.startsWith("/track") || path.startsWith("/activities")) return "Activity Tracker"
  if (path.startsWith("/season/objectives") || path.startsWith("/goals")) return "Training Objectives"
  if (path.startsWith("/coach")) return "AI Coach"
  if (path.startsWith("/badges")) return "Badges"
  if (path.startsWith("/home/dashboard") || path === "/season" || path === "/dashboard") return "Dashboard"
  if (path.startsWith("/season/leaderboard") || path.startsWith("/leaderboard")) return "Season Leaderboard"
  if (path.startsWith("/profile/performance") || path.startsWith("/statistics")) return "Performance Profile"
  if (path.startsWith("/settings")) return "Settings"
  if (path.startsWith("/profile")) return "Profile"
  if (path.startsWith("/post/")) return "Post"
  return "SwimForge"
}

function adminTitleForPath(path: string) {
  if (path.startsWith("/admin/reports")) return "Moderation Queue"
  return "Admin"
}

function initialsFromName(nameOrEmail: string | undefined) {
  if (!nameOrEmail) return "SF"
  const parts = nameOrEmail
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length === 0) return "SF"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase()
}

function AthleteDesktopNav({ location }: { location: string }) {
  const path = normalizePath(location)
  return (
    <nav className="hidden lg:flex items-center gap-1 rounded-xl border border-border/50 bg-card/30 px-2 py-1">
      {athleteNav.map((item) => {
        const active = item.match(path)
        return (
          <Link
            key={item.path}
            href={item.path}
            className={cn(
              "relative inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
              active
                ? "text-foreground bg-[linear-gradient(135deg,color-mix(in_oklch,var(--electric-cyan)_18%,transparent),color-mix(in_oklch,var(--electric-lime)_12%,transparent))]"
                : "text-muted-foreground hover:text-foreground hover:bg-card/50",
            )}
            aria-current={active ? "page" : undefined}
          >
            <span className="hidden xl:inline-flex">{item.icon}</span>
            <span>{item.label}</span>
            <span
              className={cn(
                "pointer-events-none absolute bottom-1 left-2 right-2 h-0.5 rounded-full bg-[linear-gradient(90deg,var(--electric-cyan),var(--electric-lime))] transition-opacity",
                active ? "opacity-100" : "opacity-0",
              )}
            />
          </Link>
        )
      })}
    </nav>
  )
}

function AdminSidebar({ location }: { location: string }) {
  const path = normalizePath(location)
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-border/50 bg-sidebar/95 backdrop-blur-xl lg:flex lg:flex-col">
      <div className="flex h-[72px] items-center gap-3 border-b border-border/50 px-5">
        <SwimForgeMark className="h-8 w-8" />
        <SwimForgeWordmark compact className="text-base" />
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {adminNav.map((item) => {
          const active = item.match(path)
          return (
            <Link
              key={item.path}
              href={item.path}
              className={cn(
                "flex min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors",
                active
                  ? "bg-[linear-gradient(135deg,color-mix(in_oklch,var(--electric-cyan)_18%,transparent),color-mix(in_oklch,var(--electric-lime)_8%,transparent))] text-foreground"
                  : "text-muted-foreground hover:bg-card/45 hover:text-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>
      <div className="border-t border-border/50 p-4">
        <p className="text-xs text-muted-foreground">Admin Workspace</p>
      </div>
    </aside>
  )
}

export function AppShell({ children, headerSlot }: { children: React.ReactNode; headerSlot?: React.ReactNode }) {
  const [location, navigate] = useLocation()
  const path = normalizePath(location)
  const isAdminRoute = path.startsWith("/admin")
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [searchText, setSearchText] = useState("")
  const { theme, toggleTheme, switchable } = useTheme()
  const logoutMutation = trpc.auth.logout.useMutation()
  const heartbeatMutation = trpc.auth.heartbeat.useMutation()
  const meQuery = trpc.auth.me.useQuery()
  const profileQuery = trpc.profile.get.useQuery(undefined, { staleTime: 120_000 })
  const reduceMotion = useReducedMotion()
  const isAdmin = meQuery.data?.role === "admin"

  const pageTitle = useMemo(
    () => (isAdminRoute ? adminTitleForPath(path) : athleteTitleForPath(path)),
    [isAdminRoute, path],
  )
  const showHeaderStories = Boolean(headerSlot) && !isAdminRoute

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return

    const sendHeartbeat = () => {
      if (document.visibilityState !== "visible") return
      heartbeatMutation.mutate(undefined, {
        onError: () => {
          // Presence updates are best-effort.
        },
      })
    }

    sendHeartbeat()
    const intervalId = window.setInterval(sendHeartbeat, 60_000)
    const onVisibilityOrFocus = () => sendHeartbeat()
    document.addEventListener("visibilitychange", onVisibilityOrFocus)
    window.addEventListener("focus", onVisibilityOrFocus)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener("visibilitychange", onVisibilityOrFocus)
      window.removeEventListener("focus", onVisibilityOrFocus)
    }
  }, [heartbeatMutation.mutate])

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

  const handleGlobalSearch = () => {
    const trimmed = searchText.trim()
    if (!trimmed) return
    navigate(`/home/community?q=${encodeURIComponent(trimmed)}`)
  }

  const profileLabel = meQuery.data?.name || meQuery.data?.email || "Swimmer"
  const profileInitials = initialsFromName(profileLabel)
  const avatarUrl = profileQuery.data?.avatarUrl || undefined

  if (isAdminRoute) {
    return (
      <div className="min-h-[100dvh] bg-transparent overflow-x-hidden">
        <AdminSidebar location={location} />

        <header className="fixed left-0 right-0 top-0 z-50 h-[72px] border-b border-border/50 bg-background/80 backdrop-blur-xl lg:pl-64">
          <div className="flex h-full items-center justify-between gap-4 px-4 lg:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/admin/reports" className="inline-flex items-center gap-2 lg:hidden">
                <SwimForgeMark className="h-7 w-7" />
                <SwimForgeWordmark compact className="text-sm" />
              </Link>
              <h1 className="truncate text-lg font-display font-semibold">{pageTitle}</h1>
            </div>

            <div className="flex items-center gap-2">
              <label className="relative hidden md:block">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleGlobalSearch()
                  }}
                  placeholder="Search reports, users..."
                  className="h-10 w-[280px] rounded-xl border-border/60 bg-card/50 pl-10"
                />
              </label>
              <NotificationBell />
              <Button variant="ghost" size="icon" onClick={() => void handleLogout()} aria-label="Sign out">
                <LogOut className="size-5" />
              </Button>
            </div>
          </div>
        </header>

        <main className="min-h-[calc(100dvh-72px)] pt-[72px] lg:pl-64">
          <div className="mx-auto max-w-[1600px] p-4 md:p-6">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={location}
                initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
                animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -6 }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.24, ease: "easeOut" }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] bg-transparent overflow-x-hidden">
      <header className="fixed left-0 right-0 top-0 z-50 h-[72px] border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-full max-w-[1600px] items-center justify-between gap-3 px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/home" className="sf-brand-anchor inline-flex min-h-[44px] items-center gap-2 rounded-xl px-2 py-1.5">
              <SwimForgeMark className="h-8 w-8" />
              <SwimForgeWordmark compact className="hidden text-base md:inline" />
            </Link>
            <AthleteDesktopNav location={location} />
          </div>

          <div className="flex items-center gap-2">
            <label className="relative hidden xl:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleGlobalSearch()
                }}
                placeholder="Search swimmers, clubs, events..."
                className="h-10 w-[320px] rounded-xl border-border/60 bg-card/50 pl-10"
              />
            </label>

            <NotificationBell />
            <DirectMessages />

            <Button
              type="button"
              variant="neon"
              size="sm"
              className="hidden md:inline-flex"
              onClick={() => setIsCreateOpen(true)}
            >
              <Plus className="size-4" />
              Post
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="min-h-[44px] gap-2 rounded-xl px-2">
                  <Avatar className="h-8 w-8 border border-border/50">
                    <AvatarImage src={avatarUrl} alt={profileLabel} />
                    <AvatarFallback>{profileInitials}</AvatarFallback>
                  </Avatar>
                  <span className="hidden max-w-[140px] truncate text-sm md:inline">{profileLabel}</span>
                  <ChevronDown className="hidden size-4 text-muted-foreground md:inline" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>{profileLabel}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile" className="flex items-center gap-2">
                    <User className="size-4" />
                    Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings" className="flex items-center gap-2">
                    <Settings className="size-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem asChild>
                    <Link href="/admin/reports" className="flex items-center gap-2">
                      <Shield className="size-4" />
                      Moderation
                    </Link>
                  </DropdownMenuItem>
                )}
                {switchable && toggleTheme && (
                  <DropdownMenuItem onClick={() => toggleTheme()}>
                    {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
                    Theme: {theme === "dark" ? "Dark" : "Light"}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => void handleLogout()}>
                  <LogOut className="size-4" />
                  {isLoggingOut ? "Signing out..." : "Sign out"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {showHeaderStories ? (
        <div className="fixed left-0 right-0 top-[72px] z-40 border-b border-border/40 bg-background/75 backdrop-blur-lg">
          <div className="mx-auto flex h-16 max-w-[1600px] items-center px-4 md:px-6">
            <div className="w-full overflow-x-auto overflow-y-hidden scrollbar-hide">{headerSlot}</div>
          </div>
        </div>
      ) : null}

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-background/90 backdrop-blur-xl lg:hidden">
        <div className="mx-auto grid h-16 max-w-3xl grid-cols-5 gap-1 px-2">
          {athleteNav.map((item) => {
            const active = item.match(path)
            return (
              <Link
                key={item.path}
                href={item.path}
                className={cn(
                  "flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold transition-colors",
                  active
                    ? "bg-[linear-gradient(135deg,color-mix(in_oklch,var(--electric-cyan)_18%,transparent),color-mix(in_oklch,var(--electric-lime)_12%,transparent))] text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/45",
                )}
                aria-current={active ? "page" : undefined}
              >
                <span>{item.icon}</span>
                <span className="leading-none">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      <main
        className={cn(
          "min-h-[calc(100dvh-72px)] pb-20 lg:pb-0",
          showHeaderStories ? "pt-[136px]" : "pt-[84px]",
        )}
      >
        <div className="mx-auto max-w-[1600px] p-4 md:p-6">
          <div className="mb-2 text-xs uppercase tracking-[0.14em] text-muted-foreground/80 lg:hidden">{pageTitle}</div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location}
              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8, filter: "blur(2px)" }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -6, filter: "blur(2px)" }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.24, ease: "easeOut" }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <CreatePostSheet open={isCreateOpen} onOpenChange={setIsCreateOpen} />
    </div>
  )
}
