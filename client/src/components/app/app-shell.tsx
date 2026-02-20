"use client"

import React, { useEffect, useMemo, useState } from "react"
import { Link, useLocation } from "wouter"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  Activity,
  Award,
  BarChart3,
  BrainCircuit,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Orbit,
  Plus,
  Settings,
  Shield,
  Target,
  User,
  Users,
  Waves,
  Moon,
  Sun,
  Swords,
  UsersRound,
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import NotificationBell from "@/components/NotificationBell"
import DirectMessages from "@/components/DirectMessages"
import { CreatePostSheet } from "@/components/social/CreatePostSheet"

type NavItem = {
  label: string
  path: string
  icon: React.ReactNode
  match: (path: string) => boolean
}

type QuickAccessItem = {
  label: string
  path: string
  icon: React.ReactNode
  match?: (path: string) => boolean
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

const isHomePath = (path: string) =>
  path === "/home" ||
  path.startsWith("/post/") ||
  path.startsWith("/home/report/") ||
  path.startsWith("/report/post/")

const isClubPath = (path: string) =>
  path.startsWith("/home/community") ||
  path.startsWith("/community")

const isProfilePath = (path: string) =>
  path.startsWith("/profile") ||
  path.startsWith("/settings") ||
  path.startsWith("/statistics") ||
  path.startsWith("/u/") ||
  path.startsWith("/badges")

const isSeasonPath = (path: string) =>
  path === "/season" ||
  path.startsWith("/season/leaderboard") ||
  path.startsWith("/leaderboard")

const athleteNav: NavItem[] = [
  {
    label: "Home",
    path: "/home",
    icon: <LayoutDashboard className="size-4" />,
    match: (path) => isHomePath(path),
  },
  {
    label: "Training",
    path: "/track",
    icon: <Waves className="size-4" />,
    match: (path) => isTrainingPath(path) || isChallengesPath(path) || isSeasonPath(path),
  },
  {
    label: "Club",
    path: "/home/community",
    icon: <Users className="size-4" />,
    match: (path) => isClubPath(path),
  },
  {
    label: "Profile",
    path: "/profile",
    icon: <User className="size-4" />,
    match: (path) => isProfilePath(path),
  },
]

const athleteTopNav: NavItem[] = athleteNav.filter((item) =>
  item.label === "Training",
)

const quickAccessItems: QuickAccessItem[] = [
  { label: "Social Feed", path: "/home", icon: <Users className="size-4" />, match: isHomePath },
  { label: "Attività", path: "/track", icon: <Activity className="size-4" />, match: isTrainingPath },
  {
    label: "Season Hub",
    path: "/season",
    icon: <Orbit className="size-4" />,
    match: (path) => path === "/season" || path.startsWith("/season/leaderboard") || path.startsWith("/leaderboard"),
  },
  { label: "Challenges", path: "/season/challenges", icon: <Swords className="size-4" />, match: isChallengesPath },
  {
    label: "Statistics",
    path: "/profile/performance",
    icon: <BarChart3 className="size-4" />,
    match: (path) => path.startsWith("/profile/performance") || path.startsWith("/statistics"),
  },
  {
    label: "Obiettivi",
    path: "/season/objectives",
    icon: <Target className="size-4" />,
    match: (path) => path.startsWith("/season/objectives") || path.startsWith("/goals"),
  },
  { label: "Badges", path: "/badges", icon: <Award className="size-4" />, match: (path) => path.startsWith("/badges") },
  { label: "AI Coach", path: "/coach", icon: <BrainCircuit className="size-4" />, match: (path) => path.startsWith("/coach") },
  { label: "Club", path: "/home/community", icon: <UsersRound className="size-4" />, match: isClubPath },
]

function athleteTitleForPath(path: string) {
  if (path.startsWith("/community/club") && path.includes("/event/")) return "Club Event"
  if (path.startsWith("/community/club")) return "Club Details"
  if (path.startsWith("/home/community") || path === "/community") return "Club Directory"
  if (path.startsWith("/season/challenges/") || path.startsWith("/challenges/")) return "Challenge Details"
  if (path.startsWith("/season/challenges") || path.startsWith("/challenges")) return "Challenges"
  if (path === "/home") return "Social Home Feed"
  if (path.startsWith("/track/") || path.startsWith("/activities/")) return "Dettaglio Laps"
  if (path.startsWith("/track") || path.startsWith("/activities")) return "Activity Tracker"
  if (path.startsWith("/season/objectives") || path.startsWith("/goals")) return "Training Objectives"
  if (path.startsWith("/coach")) return "AI Coach"
  if (path.startsWith("/badges")) return "Badges"
  if (path === "/season") return "Season Dashboard"
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
      {athleteTopNav.map((item) => {
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

function AthleteSideRail({
  location,
  onCreatePost,
}: {
  location: string
  onCreatePost: () => void
}) {
  const path = normalizePath(location)
  const railRouteItems = quickAccessItems.filter((item) => item.label !== "Social Feed")
  const postInsertIndex = Math.floor(railRouteItems.length / 2)
  const topRouteItems = railRouteItems.slice(0, postInsertIndex)
  const bottomRouteItems = railRouteItems.slice(postInsertIndex)
  const railRowBase =
    "group/item flex h-11 w-full items-center justify-center rounded-xl text-muted-foreground transition-all duration-200 group-hover/rail:justify-start group-hover/rail:gap-3 group-hover/rail:px-3.5 hover:bg-card/45 hover:text-foreground"
  const railRowActive =
    "text-foreground bg-[linear-gradient(90deg,color-mix(in_oklch,var(--electric-cyan)_14%,transparent),color-mix(in_oklch,var(--electric-lime)_10%,transparent))]"

  return (
    <aside className="group/rail fixed inset-y-0 left-0 z-40 hidden w-[84px] bg-transparent px-2 pb-4 pt-[84px] transition-[width] duration-300 ease-out hover:w-[244px] lg:flex lg:flex-col">
      <nav className="flex flex-1 flex-col justify-center space-y-3">
        {topRouteItems.map((item) => {
          const active = item.match ? item.match(path) : path.startsWith(item.path)
          return (
            <Link
              key={item.path}
              href={item.path}
              className={cn(railRowBase, active && railRowActive)}
              aria-current={active ? "page" : undefined}
              title={item.label}
            >
              <span className="inline-flex transition-transform duration-300 ease-out group-hover/rail:translate-x-0.5 group-hover/item:scale-110">
                {item.icon}
              </span>
              <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-medium opacity-0 transition-all duration-200 group-hover/rail:max-w-[140px] group-hover/rail:opacity-100">
                {item.label}
              </span>
            </Link>
          )
        })}

        <button
          type="button"
          onClick={onCreatePost}
          className={cn(railRowBase, "text-[var(--electric-cyan)] hover:text-[var(--electric-cyan)]")}
          title="Post"
          aria-label="Post"
        >
          <span className="inline-flex transition-transform duration-300 ease-out group-hover/rail:translate-x-0.5 group-hover/item:scale-110">
            <Plus className="size-5" />
          </span>
          <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-medium opacity-0 transition-all duration-200 group-hover/rail:max-w-[140px] group-hover/rail:opacity-100">
            Post
          </span>
        </button>

        {bottomRouteItems.map((item) => {
          const active = item.match ? item.match(path) : path.startsWith(item.path)
          return (
            <Link
              key={item.path}
              href={item.path}
              className={cn(railRowBase, active && railRowActive)}
              aria-current={active ? "page" : undefined}
              title={item.label}
            >
              <span className="inline-flex transition-transform duration-300 ease-out group-hover/rail:translate-x-0.5 group-hover/item:scale-110">
                {item.icon}
              </span>
              <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-medium opacity-0 transition-all duration-200 group-hover/rail:max-w-[140px] group-hover/rail:opacity-100">
                {item.label}
              </span>
            </Link>
          )
        })}
      </nav>

    </aside>
  )
}

function AthleteCompactBrand() {
  return (
    <Link
      href="/home"
      className="inline-flex min-h-[44px] items-center rounded-xl border border-border/60 bg-card/35 px-2.5 py-1.5 transition-colors hover:border-[var(--electric-cyan)]/55 hover:bg-card/55"
      aria-label="Go to Home"
    >
      <img
        src="/brand/swimforge-navbar-logo.png"
        alt="SwimForge"
        className="h-7 w-auto object-contain"
        loading="lazy"
        decoding="async"
      />
    </Link>
  )
}

export function AppShell({ children, headerSlot }: { children: React.ReactNode; headerSlot?: React.ReactNode }) {
  const [location] = useLocation()
  const path = normalizePath(location)
  const isAdminRoute = path.startsWith("/admin")
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const { theme, toggleTheme, switchable } = useTheme()
  const logoutMutation = trpc.auth.logout.useMutation()
  const heartbeatMutation = trpc.auth.heartbeat.useMutation()
  const meQuery = trpc.auth.me.useQuery()
  const profileQuery = trpc.profile.get.useQuery(undefined, { staleTime: 120_000 })
  const reduceMotion = useReducedMotion()
  const isAdmin = meQuery.data?.role === "admin"

  const pageTitle = useMemo(() => (isAdminRoute ? adminTitleForPath(path) : athleteTitleForPath(path)), [isAdminRoute, path])
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

  useEffect(() => {
    if (typeof window === "undefined") return
    const closeCreatePost = () => setIsCreateOpen(false)
    window.addEventListener("swimforge:close-create-post", closeCreatePost)
    return () => window.removeEventListener("swimforge:close-create-post", closeCreatePost)
  }, [])

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

  const profileLabel = meQuery.data?.name || meQuery.data?.email || "Swimmer"
  const profileInitials = initialsFromName(profileLabel)
  const avatarUrl = profileQuery.data?.avatarUrl || undefined

  return (
    <div className="min-h-[100dvh] bg-transparent overflow-x-hidden">
      <AthleteSideRail location={location} onCreatePost={() => setIsCreateOpen(true)} />

      <header className="fixed left-0 right-0 top-0 z-50 h-[72px] border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="flex h-full w-full items-center gap-3 pl-0 pr-4 md:pr-6">
          <div className="flex min-w-0 items-center gap-3">
            <AthleteCompactBrand />
          </div>

          <AthleteDesktopNav location={location} />

          <div className="ml-auto flex items-center gap-2">
            <NotificationBell />
            <DirectMessages />

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
          <div className="mx-auto flex h-16 max-w-[1600px] items-center px-4 md:px-6 lg:pl-[102px]">
            <div className="w-full overflow-x-auto overflow-y-hidden scrollbar-hide">{headerSlot}</div>
          </div>
        </div>
      ) : null}

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-background/90 backdrop-blur-xl lg:hidden">
        <div className="mx-auto grid h-16 max-w-3xl grid-cols-4 gap-1 px-2">
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
          "min-h-[calc(100dvh-72px)] pb-20 lg:pb-0 lg:pl-[92px]",
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
