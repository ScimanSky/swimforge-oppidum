import React, { Suspense, useCallback, useEffect, useState } from "react"
import { useLocation } from "wouter"
import { motion, useReducedMotion } from "framer-motion"

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
import type { CreateAction } from "./CreateMenu"
import { DesktopRail } from "./DesktopRail"
import { LatestSwimShare } from "./LatestSwimShare"
import { ShellHeader } from "./ShellHeader"
import { ShellContext } from "./shell-context"
import { Spinner } from "@/components/ui/spinner"

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
  const [latestSwimOpen, setLatestSwimOpen] = useState(false)
  const logoutMutation = trpc.auth.logout.useMutation()
  const meQuery = trpc.auth.me.useQuery()
  const profileQuery = trpc.profile.get.useQuery(undefined, { staleTime: 120_000 })
  const garminSync = useGarminQuickSync()
  const reduceMotion = useReducedMotion()
  const isAdmin = meQuery.data?.role === "admin"
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
    if (action === "share-latest") {
      setLatestSwimOpen(true)
      return
    }
    setCreatePostInitialContent(undefined)
    setCreatePostPbShareTracking(undefined)
    setIsCreatePostOpen(true)
  }
  const closeLatestSwim = useCallback(() => setLatestSwimOpen(false), [])

  const profileLabel = meQuery.data?.name || meQuery.data?.email || "Nuotatore"

  return (
    <ShellContext.Provider value={true}>
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

      {/* Clear of the fixed header and bottom bar, which grow by the system bar insets in the app. */}
      <main className="min-h-[100dvh] pb-[calc(6rem+env(safe-area-inset-bottom))] pt-[calc(5rem+env(safe-area-inset-top))] lg:pb-[calc(2rem+env(safe-area-inset-bottom))] lg:pl-[232px]">
        <div className="mx-auto max-w-[1100px] px-4 md:px-6">
          {hub ? (
            <SectionTabs
              tabs={HUB_TABS[hub]}
              ariaLabel={hub === "train" ? "Sezioni di Allena" : "Sezioni di Community"}
            />
          ) : null}
          {/* Pages load inside main: header and navigation stay mounted across routes. */}
          <Suspense
            fallback={
              <div className="flex justify-center py-16">
                <Spinner aria-label="Caricamento" className="size-6 text-muted-foreground" />
              </div>
            }
          >
            {/* Enter-only fade: no waiting for the old page to leave. */}
            <motion.div
              key={path}
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: reduceMotion ? 0 : 0.15, ease: "easeOut" }}
            >
              {children}
            </motion.div>
          </Suspense>
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
      {latestSwimOpen ? <LatestSwimShare onClose={closeLatestSwim} /> : null}
      {meQuery.data?.id && (
        <OnboardingNudgeManager userId={meQuery.data.id} />
      )}
    </div>
    </ShellContext.Provider>
  )
}
