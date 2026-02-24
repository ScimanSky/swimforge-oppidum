"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link } from "wouter"
import AppLayout from "@/components/AppLayout"
import { StoryAvatar } from "@/components/social/StoryAvatar"
import { StoryViewer } from "@/components/social/StoryViewer"
import { StoryCreator } from "@/components/social/StoryCreator"
import { CreatePostSheet } from "@/components/social/CreatePostSheet"
import FeedSubTabs from "@/components/social/FeedSubTabs"
import FeedPost from "@/components/social/FeedPost"
import FeedSkeleton from "@/components/social/FeedSkeleton"
import FeedSidebar from "@/components/social/FeedSidebar"
import FollowStarterCard from "@/components/social/FollowStarterCard"
import type { FeedPostRecord } from "@/components/social/feed-types"
import { Button } from "@/components/ui/button"
import { Waves, Users, RefreshCw, Loader2 } from "lucide-react"
import { trpc } from "@/lib/trpc"
import {
  buildDisplayStoryGroups,
  findStoryGroupIndex,
  type SocialStoryGroup,
} from "@/lib/social-feed-stories"

function EmptyFeedPerTe({ onCreatePost }: { onCreatePost: () => void }) {
  return (
    <div className="surface-panel p-8 flex flex-col items-center text-center gap-4">
      {/* Inline swimmer SVG illustration */}
      <div className="relative w-32 h-32 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-[linear-gradient(135deg,color-mix(in_oklch,var(--electric-cyan)_12%,transparent),color-mix(in_oklch,var(--electric-lime)_8%,transparent))]" />
        <Waves className="size-14 text-[var(--electric-cyan)] relative z-10" />
      </div>
      <div>
        <h3 className="text-lg font-display font-bold text-foreground">Il feed è vuoto</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Forgia la prima sessione della settimana e accendi il tuo feed.
        </p>
      </div>
      <Button variant="neon" size="lg" className="gap-2 mt-2" onClick={onCreatePost}>
        Condividi la prima sessione
      </Button>
    </div>
  )
}

function EmptyFeedSeguiti() {
  return (
    <div className="surface-panel p-8 flex flex-col items-center text-center gap-4">
      <div className="relative w-32 h-32 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-[linear-gradient(135deg,color-mix(in_oklch,var(--electric-lime)_12%,transparent),color-mix(in_oklch,var(--electric-violet)_8%,transparent))]" />
        <Users className="size-14 text-[var(--electric-lime)] relative z-10" />
      </div>
      <div>
        <h3 className="text-lg font-display font-bold text-foreground">Segui altri nuotatori</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Costruisci la tua crew e porta nel feed allenamenti, stories e sfide reali.
        </p>
      </div>
      <Button variant="neon" size="lg" className="gap-2 mt-2" asChild>
        <Link href="/home/community">Esplora la community</Link>
      </Button>
    </div>
  )
}

export default function SocialFeed() {
  const [tab, setTab] = useState<"perte" | "seguiti">("perte")
  const [cursor, setCursor] = useState<string | undefined>(undefined)
  const [extraPosts, setExtraPosts] = useState<FeedPostRecord[]>([])
  const [hasMore, setHasMore] = useState(true)
  const [visibleCount, setVisibleCount] = useState(5)
  const [storyViewerOpen, setStoryViewerOpen] = useState(false)
  const [storyViewerGroupIdx, setStoryViewerGroupIdx] = useState(0)
  const [storyCreatorOpen, setStoryCreatorOpen] = useState(false)
  const [createPostOpen, setCreatePostOpen] = useState(false)

  const profileQuery = trpc.profile.get.useQuery()
  const currentUserId = profileQuery.data?.userId
  const profile = profileQuery.data
  const autoplayVideos = (() => {
    const value = (profile?.preferences as Record<string, unknown> | null | undefined)?.autoplayVideos
    if (typeof value === "boolean") return value
    if (typeof value === "string") return value.toLowerCase() !== "false"
    if (typeof value === "number") return value !== 0
    return true
  })()

  const { data: storyGroups } = trpc.community.stories.active.useQuery(undefined, {
    staleTime: 30_000,
  })

  const allGroups: SocialStoryGroup[] = (storyGroups as SocialStoryGroup[] | undefined) ?? []
  const displayName = profile?.username || profile?.userId?.toString() || "Nuotatore"
  const displayStoryGroups = useMemo(() => {
    return buildDisplayStoryGroups({
      allGroups,
      currentUserId: currentUserId ?? null,
      displayName,
      avatarUrl: profile?.avatarUrl ?? null,
    })
  }, [allGroups, currentUserId, displayName, profile?.avatarUrl])

  const handleViewStory = useCallback((userId: number) => {
    const idx = findStoryGroupIndex(displayStoryGroups, userId)
    if (idx >= 0) {
      setStoryViewerGroupIdx(idx)
      setStoryViewerOpen(true)
    }
  }, [displayStoryGroups])

  const handleCreateStory = useCallback(() => {
    setCreatePostOpen(false)
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("swimforge:close-create-post"))
    }
    setStoryCreatorOpen(true)
  }, [])

  const scope = tab === "seguiti" ? "following" : "global"
  const followStarterQuery = trpc.community.users.followStarter.useQuery(
    { limit: 5, target: 3 },
    { staleTime: 60_000 }
  )

  const firstPageQuery = trpc.community.feed.useQuery(
    { limit: 20, scope },
    { staleTime: 30_000 }
  )

  const nextPageQuery = trpc.community.feed.useQuery(
    { limit: 20, scope, before: cursor },
    { enabled: !!cursor, staleTime: 30_000 }
  )

  const lastCursorRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!cursor || cursor === lastCursorRef.current) return
    if (!nextPageQuery.data) return
    lastCursorRef.current = cursor

    const newPosts = nextPageQuery.data as unknown as FeedPostRecord[]
    if (newPosts.length < 20) setHasMore(false)

    setExtraPosts((prev) => {
      const existingIds = new Set(prev.map((p) => p.id))
      const fresh = newPosts.filter((p) => !existingIds.has(p.id))
      return [...prev, ...fresh]
    })
  }, [cursor, nextPageQuery.data])

  useEffect(() => {
    setCursor(undefined)
    setExtraPosts([])
    setHasMore(true)
    setVisibleCount(5)
    lastCursorRef.current = undefined
  }, [tab])

  const firstPagePosts = (firstPageQuery.data as unknown as FeedPostRecord[] | undefined) ?? []
  const allPosts = cursor ? [...firstPagePosts, ...extraPosts] : firstPagePosts

  const seen = new Set<number>()
  const posts = allPosts.filter((p) => {
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })

  const loadMore = useCallback(() => {
    if (posts.length === 0 || nextPageQuery.isFetching) return
    const oldest = posts[posts.length - 1]
    if (oldest?.created_at) {
      setCursor(new Date(oldest.created_at).toISOString())
    }
  }, [posts, nextPageQuery.isFetching])

  const isInitialLoading = firstPageQuery.isLoading && posts.length === 0
  const hasFeedError = Boolean(firstPageQuery.error) && posts.length === 0 && !isInitialLoading

  const headerStoriesSlot = (
    <div data-tour="feed-stories" className="flex h-14 w-full min-w-0 items-center gap-2 overflow-x-auto overflow-y-hidden scrollbar-hide">
      {displayStoryGroups.length > 0 ? (
        displayStoryGroups.map((group) => {
          const isCurrent = Number(group.userId) === Number(currentUserId)
          const hasStories = (group.stories?.length ?? 0) > 0
          const hasUnviewed = group.stories.some((story) => !story.hasViewed)
          return (
            <StoryAvatar
              key={group.userId}
              userId={group.userId}
              userName={group.userName ?? "Utente"}
              avatarUrl={group.userAvatar}
              hasUnviewed={hasUnviewed}
              hasStories={hasStories}
              isCurrentUser={isCurrent}
              size="sm"
              showLabel
              onClick={() =>
                isCurrent && !hasStories ? handleCreateStory() : handleViewStory(group.userId)
              }
            />
          )
        })
      ) : null}
    </div>
  )

  return (
    <AppLayout headerSlot={headerStoriesSlot}>
      <div className="social-feed-shell compact-shell mx-auto w-full max-w-[1240px] space-y-3 lg:space-y-2">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="w-full min-w-0">
            <div
              data-tour="feed-tabs"
              className="relative z-10 mb-3 w-full"
            >
              {firstPageQuery.isFetching && !isInitialLoading && (
                <div className="mb-1.5 flex justify-center py-1">
                  <RefreshCw className="size-4 animate-spin text-muted-foreground" />
                </div>
              )}
              <FeedSubTabs tab={tab} onChange={setTab} />
            </div>

            <div className="flex flex-col gap-4">
              <FollowStarterCard
                state={followStarterQuery.data}
                isLoading={followStarterQuery.isLoading}
              />
              {isInitialLoading ? (
                <FeedSkeleton />
              ) : hasFeedError ? (
                <div className="surface-panel p-6 text-center">
                  <p className="text-sm text-foreground">Impossibile caricare il feed al momento.</p>
                  <Button
                    type="button"
                    variant="outline-neon"
                    className="mt-3"
                    onClick={() => {
                      void firstPageQuery.refetch()
                    }}
                  >
                    Riprova
                  </Button>
                </div>
              ) : posts.length === 0 ? (
                tab === "seguiti" ? (
                  <EmptyFeedSeguiti />
                ) : (
                  <EmptyFeedPerTe onCreatePost={() => setCreatePostOpen(true)} />
                )
              ) : (
                <div className="flex flex-col gap-4">
                  {posts.slice(0, visibleCount).map((post, index) => (
                    <div key={post.id} data-tour={index === 0 ? "feed-first-post" : undefined}>
                      <FeedPost
                        post={post}
                        currentUserId={currentUserId}
                        index={index}
                        autoplayVideos={autoplayVideos}
                      />
                    </div>
                  ))}
                  {(visibleCount < posts.length || hasMore) && (
                    <div className="py-2">
                      <button
                        type="button"
                        className="w-full rounded-xl py-3 text-sm font-medium text-[var(--electric-cyan)] transition-colors hover:bg-[var(--electric-cyan)]/5"
                        disabled={nextPageQuery.isFetching}
                        onClick={() => {
                          if (visibleCount < posts.length) {
                            setVisibleCount((c) => c + 5)
                          } else if (hasMore) {
                            loadMore()
                            setVisibleCount((c) => c + 5)
                          }
                        }}
                      >
                        {nextPageQuery.isFetching ? (
                          <span className="inline-flex items-center gap-2">
                            <Loader2 className="size-4 animate-spin" />
                            Caricamento...
                          </span>
                        ) : (
                          "Carica altri"
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="hidden xl:block">
            <div className="sticky top-24 flex flex-col gap-3">
              <FeedSidebar />
            </div>
          </div>
        </div>
      </div>

      {/* Story Viewer */}
      {storyViewerOpen && displayStoryGroups.length > 0 && (
        <StoryViewer
          groups={displayStoryGroups as unknown as Parameters<typeof StoryViewer>[0]["groups"]}
          initialGroupIndex={storyViewerGroupIdx}
          onClose={() => setStoryViewerOpen(false)}
        />
      )}

      {/* Story Creator */}
      <StoryCreator open={storyCreatorOpen} onOpenChange={setStoryCreatorOpen} />

      {/* Create Post Sheet (from empty state CTA) */}
      <CreatePostSheet open={createPostOpen} onOpenChange={setCreatePostOpen} />
    </AppLayout>
  )
}
