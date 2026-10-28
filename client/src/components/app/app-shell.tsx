import React, { useEffect, useRef, useState } from "react"
import { useLocation } from "wouter"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"

import { trpc } from "@/lib/trpc"
import { supabase } from "@/lib/supabase"
import { unregisterPushToken } from "@/lib/push"
import { clearNativeSessionToken } from "@/lib/session-token"
import { isNativePlatform } from "@/lib/platform"
import { HUB_TABS, activeTabForPath, homePathForPlatform, hubForPath, normalizePath } from "@/lib/navigation"
import { useGarminQuickSync } from "@/hooks/useGarminQuickSync"

import { SectionTabs } from "@/components/corsia/SectionTabs"
import { CreatePostSheet, type PbShareTrackingContext } from "@/components/social/CreatePostSheet"
import { OnboardingNudgeManager } from "@/components/onboarding/OnboardingNudgeManager"
import { BottomBar } from "./BottomBar"
import { AI_POST_DRAFT, type CreateAction } from "./CreateMenu"
import { DesktopRail } from "./DesktopRail"
import { ShellHeader } from "./ShellHeader"

type OpenCreatePostEventDetail = {
  initialContent?: string
  pbShareTracking?: PbShareTrackingContext
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation()
  const path = normalizePath(location)
  const activeTab = activeTabForPath(path)
  const hub = hubForPath(path)
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
    // Native has no public landing: straight to the login, no reload through "/".
    window.location.href = isNativePlatform() ? "/login" : "/"
  }

  const runCreateAction = (action: CreateAction) => {
    setMobileCreateMenuOpen(false)
    setRailCreateMenuOpen(false)
    if (action === "garmin") {
      void garminSync.sync()
      return
    }
    setCreatePostInitialContent(action === "ai-post" ? AI_POST_DRAFT : undefined)
    setCreatePostPbShareTracking(undefined)
    setIsCreatePostOpen(true)
  }

  const profileLabel = meQuery.data?.name || meQuery.data?.email || "Nuotatore"

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-background">
      <ShellHeader
        homePath={homePathForPlatform(isNativePlatform())}
        profileLabel={profileLabel}
        avatarUrl={profileQuery.data?.avatarUrl || undefined}
        isAdmin={isAdmin}
        isLoggingOut={isLoggingOut}
        onLogout={() => void handleLogout()}
      />

      <BottomBar
        activeTab={activeTab}
        createOpen={mobileCreateMenuOpen}
        onCreateOpenChange={setMobileCreateMenuOpen}
        onCreateAction={runCreateAction}
        isGarminSyncing={garminSync.isPending}
      />

      <DesktopRail
        activeTab={activeTab}
        createOpen={railCreateMenuOpen}
        onCreateOpenChange={setRailCreateMenuOpen}
        onCreateAction={runCreateAction}
        isGarminSyncing={garminSync.isPending}
      />

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
