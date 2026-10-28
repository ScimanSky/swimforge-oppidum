"use client"

import React, { useEffect, useRef, useState } from "react"
import { Link, useLocation } from "wouter"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  ChevronDown,
  ChevronLeft,
  Droplet,
  LogOut,
  MessageSquare,
  Newspaper,
  Plus,
  RefreshCw,
  Settings,
  Shield,
  Sparkles,
  SquarePen,
  Sun,
  User,
  Users,
  Waves,
  X,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { trpc } from "@/lib/trpc"
import { supabase } from "@/lib/supabase"
import { unregisterPushToken } from "@/lib/push"
import { clearNativeSessionToken } from "@/lib/session-token"
import { isNativePlatform } from "@/lib/platform"
import {
  FEED_PATH,
  HUB_TABS,
  NAV_TABS,
  activeTabForPath,
  homePathForPlatform,
  hubForPath,
  normalizePath,
  pageTitleForPath,
  parentPathForPath,
  type TabId,
} from "@/lib/navigation"
import { useGarminQuickSync } from "@/hooks/useGarminQuickSync"

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
import { SectionTabs } from "@/components/corsia/SectionTabs"
import { CreatePostSheet, type PbShareTrackingContext } from "@/components/social/CreatePostSheet"
import { OnboardingNudgeManager } from "@/components/onboarding/OnboardingNudgeManager"

type OpenCreatePostEventDetail = {
  initialContent?: string
  pbShareTracking?: PbShareTrackingContext
}

const TAB_ICONS: Record<TabId, LucideIcon> = {
  today: Sun,
  feed: Newspaper,
  train: Waves,
  community: Users,
}

const AI_POST_DRAFT =
  "Bozza IA:\n\nAllenamento completato oggi. Ecco i punti chiave:\n- Sensazioni in acqua:\n- Metrica migliore:\n- Cosa migliorare nella prossima sessione:\n\n#swimforge #training"

type CreateAction = "post" | "ai-post" | "garmin"
type CreateItem = { label: string; icon: LucideIcon } & ({ href: string } | { action: CreateAction })

const CREATE_ITEMS: CreateItem[] = [
  { label: "Nuovo post", icon: SquarePen, action: "post" },
  { label: "Messaggio", icon: MessageSquare, href: "/messages?new=1" },
  { label: "Bozza IA del post", icon: Sparkles, action: "ai-post" },
  { label: "Sincronizza Garmin", icon: RefreshCw, action: "garmin" },
]

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

function Brand() {
  return (
    <span className="inline-flex items-center gap-2">
      <Droplet className="size-6 fill-current text-action-text" aria-hidden />
      <span className="font-display text-[26px] font-bold leading-none text-foreground">SwimForge</span>
    </span>
  )
}

/** The four actions of the «Crea» menu (bottom sheet on mobile, inline in the desktop rail). */
function CreateMenuList({
  onAction,
  onNavigate,
  isGarminSyncing,
}: {
  onAction: (action: CreateAction) => void
  onNavigate: () => void
  isGarminSyncing: boolean
}) {
  const rowClass =
    "flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] font-semibold text-foreground transition-colors hover:bg-raised disabled:opacity-60"
  return (
    <ul className="space-y-1">
      {CREATE_ITEMS.map((item) => {
        const Icon = item.icon
        const icon = <Icon className="size-5 shrink-0 text-action-text" aria-hidden />
        if ("href" in item) {
          return (
            <li key={item.label}>
              <Link href={item.href} onClick={onNavigate} className={rowClass}>
                {icon}
                {item.label}
              </Link>
            </li>
          )
        }
        const syncing = item.action === "garmin" && isGarminSyncing
        return (
          <li key={item.label}>
            <button type="button" onClick={() => onAction(item.action)} disabled={syncing} className={rowClass}>
              {icon}
              {syncing ? "Sincronizzazione…" : item.label}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation()
  const path = normalizePath(location)
  const activeTab = activeTabForPath(path)
  const hub = hubForPath(path)
  const parentPath = parentPathForPath(path)
  const isFeedRoot = path === FEED_PATH
  const pageTitle = pageTitleForPath(path)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isCreatePostOpen, setIsCreatePostOpen] = useState(false)
  const [createPostInitialContent, setCreatePostInitialContent] = useState<string | undefined>(undefined)
  const [createPostPbShareTracking, setCreatePostPbShareTracking] = useState<PbShareTrackingContext | undefined>(undefined)
  const [mobileCreateMenuOpen, setMobileCreateMenuOpen] = useState(false)
  const [railCreateMenuOpen, setRailCreateMenuOpen] = useState(false)
  const logoutMutation = trpc.auth.logout.useMutation()
  const heartbeatMutation = trpc.auth.heartbeat.useMutation()
  const meQuery = trpc.auth.me.useQuery()
  const profileQuery = trpc.profile.get.useQuery(undefined, { staleTime: 120_000 })
  const garminSync = useGarminQuickSync()
  const reduceMotion = useReducedMotion()
  const isAdmin = meQuery.data?.role === "admin"
  const heartbeatPendingRef = useRef(false)
  const heartbeatLastSentAtRef = useRef(0)

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return

    const sendHeartbeat = () => {
      if (document.visibilityState !== "visible") return
      if (!meQuery.data?.id) return
      if (heartbeatPendingRef.current) return
      const now = Date.now()
      if (now - heartbeatLastSentAtRef.current < 10_000) return
      heartbeatPendingRef.current = true
      heartbeatLastSentAtRef.current = now
      heartbeatMutation.mutate(undefined, {
        onSettled: () => {
          heartbeatPendingRef.current = false
        },
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
  }, [heartbeatMutation.mutate, meQuery.data?.id])

  useEffect(() => {
    setMobileCreateMenuOpen(false)
    setRailCreateMenuOpen(false)
  }, [path])

  useEffect(() => {
    if (typeof document === "undefined" || !mobileCreateMenuOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileCreateMenuOpen(false)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [mobileCreateMenuOpen])

  useEffect(() => {
    if (typeof window === "undefined") return

    const handleOpenCreatePost = (event: Event) => {
      const customEvent = event as CustomEvent<OpenCreatePostEventDetail>
      const prefill = customEvent.detail?.initialContent?.trim()
      setCreatePostInitialContent(prefill ? prefill : undefined)
      setCreatePostPbShareTracking(customEvent.detail?.pbShareTracking)
      setIsCreatePostOpen(true)
      setMobileCreateMenuOpen(false)
      setRailCreateMenuOpen(false)
    }

    window.addEventListener("swimforge:open-create-post", handleOpenCreatePost)

    return () => {
      window.removeEventListener("swimforge:open-create-post", handleOpenCreatePost)
    }
  }, [])

  const handleLogout = async () => {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    // Before the server logout: push.unregister needs the session.
    await unregisterPushToken()
    try {
      await logoutMutation.mutateAsync()
    } catch {
      // ignore logout errors, still clear client session
    }
    clearNativeSessionToken()
    try {
      await supabase.auth.signOut()
    } catch {
      // ignore
    }
    localStorage.removeItem("swimforge:autoSync:dashboardReady")
    localStorage.removeItem("swimforge:autoSync:last")
    window.location.href = "/"
  }

  const closeCreateMenus = () => {
    setMobileCreateMenuOpen(false)
    setRailCreateMenuOpen(false)
  }

  const runCreateAction = (action: CreateAction) => {
    closeCreateMenus()
    if (action === "garmin") {
      void garminSync.sync()
      return
    }
    setCreatePostInitialContent(action === "ai-post" ? AI_POST_DRAFT : undefined)
    setCreatePostPbShareTracking(undefined)
    setIsCreatePostOpen(true)
  }

  const goBack = () => {
    if (window.history.length > 1) window.history.back()
    else if (parentPath) navigate(parentPath)
  }

  const profileLabel = meQuery.data?.name || meQuery.data?.email || "Nuotatore"
  const profileInitials = initialsFromName(profileLabel)
  const avatarUrl = profileQuery.data?.avatarUrl || undefined
  const homePath = homePathForPlatform(isNativePlatform())

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-background">
      <header className="fixed inset-x-0 top-0 z-50 h-16 border-b border-border bg-background">
        <div className="flex h-full items-center gap-2 px-4 md:px-6">
          <Link
            href={homePath}
            aria-label="SwimForge, home"
            className="hidden w-[224px] shrink-0 lg:inline-flex"
          >
            <Brand />
          </Link>

          <div className="flex min-w-0 flex-1 items-center gap-1">
            {parentPath ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={goBack}
                aria-label="Indietro"
                className="-ml-2 shrink-0"
              >
                <ChevronLeft className="size-6" />
              </Button>
            ) : null}
            {isFeedRoot ? (
              <h1 className="min-w-0">
                <span className="lg:hidden">
                  <Brand />
                </span>
                <span className="hidden font-display text-[26px] font-bold leading-none lg:inline">{pageTitle}</span>
              </h1>
            ) : (
              <h1 className="min-w-0 truncate font-display text-[26px] font-bold leading-none">{pageTitle}</h1>
            )}
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <NotificationBell />
            <DirectMessages mode="link" />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-1.5" aria-label="Menu del profilo">
                  <Avatar className="size-8 border border-border">
                    <AvatarImage src={avatarUrl} alt={profileLabel} />
                    <AvatarFallback>{profileInitials}</AvatarFallback>
                  </Avatar>
                  <span className="hidden max-w-[140px] truncate text-sm md:inline">{profileLabel}</span>
                  <ChevronDown className="hidden size-4 text-muted-foreground md:inline" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="truncate">{profileLabel}</DropdownMenuLabel>
                <DropdownMenuSeparator />
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
                {isAdmin && (
                  <DropdownMenuItem asChild>
                    <Link href="/admin/reports" className="flex items-center gap-2">
                      <Shield className="size-4" />
                      Moderazione
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => void handleLogout()}>
                  <LogOut className="size-4" />
                  {isLoggingOut ? "Uscita…" : "Esci"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <nav
        data-tour="main-navigation"
        aria-label="Navigazione principale"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background lg:hidden"
      >
        <div className="mx-auto grid h-16 max-w-3xl grid-cols-5 px-1">
          {NAV_TABS.map((tab, index) => {
            const Icon = TAB_ICONS[tab.id]
            const active = activeTab === tab.id
            const link = (
              <Link
                key={tab.id}
                href={tab.path}
                data-tour={tab.dataTour}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[44px] flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors",
                  active ? "text-action-text" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-6" aria-hidden />
                <span className="leading-none">{tab.label}</span>
              </Link>
            )
            if (index !== 2) return link
            return (
              <React.Fragment key={tab.id}>
                <div className="flex items-center justify-center">
                  <button
                    type="button"
                    data-tour="create-post"
                    onClick={() => setMobileCreateMenuOpen((open) => !open)}
                    aria-expanded={mobileCreateMenuOpen}
                    aria-haspopup="dialog"
                    aria-label="Crea"
                    className="inline-flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/80"
                  >
                    <Plus className="size-6" aria-hidden />
                  </button>
                </div>
                {link}
              </React.Fragment>
            )
          })}
        </div>
      </nav>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[232px] flex-col border-r border-border bg-background px-3 pb-4 pt-20 lg:flex">
        <nav data-tour="main-navigation" aria-label="Navigazione" className="space-y-1">
          {NAV_TABS.map((tab) => {
            const Icon = TAB_ICONS[tab.id]
            const active = activeTab === tab.id
            return (
              <Link
                key={tab.id}
                href={tab.path}
                data-tour={tab.dataTour}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold transition-colors",
                  active ? "bg-raised text-foreground" : "text-muted-foreground hover:bg-raised hover:text-foreground",
                )}
              >
                <Icon className={cn("size-5", active && "text-action-text")} aria-hidden />
                {tab.label}
              </Link>
            )
          })}
        </nav>

        <Button
          type="button"
          data-tour="create-post"
          onClick={() => setRailCreateMenuOpen((open) => !open)}
          aria-expanded={railCreateMenuOpen}
          className="mt-4 w-full justify-start"
        >
          <Plus className="size-5" aria-hidden />
          Crea
        </Button>

        <AnimatePresence initial={false}>
          {railCreateMenuOpen ? (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="mt-2 rounded-2xl border border-border bg-card p-1"
            >
              <CreateMenuList
                onAction={runCreateAction}
                onNavigate={closeCreateMenus}
                isGarminSyncing={garminSync.isPending}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </aside>

      <AnimatePresence>
        {mobileCreateMenuOpen ? (
          <motion.div
            className="fixed inset-0 z-[60] bg-black/50 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileCreateMenuOpen(false)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Crea"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="absolute inset-x-2 bottom-[76px] rounded-2xl border border-border bg-card p-2"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between px-3 py-1">
                <span className="text-sm font-semibold text-muted-foreground">Crea</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setMobileCreateMenuOpen(false)}
                  aria-label="Chiudi"
                  className="-mr-2 text-muted-foreground"
                >
                  <X className="size-5" />
                </Button>
              </div>
              <CreateMenuList
                onAction={runCreateAction}
                onNavigate={closeCreateMenus}
                isGarminSyncing={garminSync.isPending}
              />
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <main className="min-h-[100dvh] pb-24 pt-20 lg:pb-8 lg:pl-[232px]">
        <div className="mx-auto max-w-[1100px] px-4 md:px-6">
          {hub ? (
            <SectionTabs
              tabs={HUB_TABS[hub]}
              ariaLabel={hub === "train" ? "Sezioni di Allena" : "Sezioni di Community"}
            />
          ) : null}
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

      <CreatePostSheet
        open={isCreatePostOpen}
        initialContent={createPostInitialContent}
        initialPbShareContext={createPostPbShareTracking}
        onOpenChange={(open) => {
          setIsCreatePostOpen(open)
          if (!open) {
            setCreatePostInitialContent(undefined)
            setCreatePostPbShareTracking(undefined)
          }
        }}
      />
      {meQuery.data?.id && (
        <OnboardingNudgeManager userId={meQuery.data.id} />
      )}
    </div>
  )
}
