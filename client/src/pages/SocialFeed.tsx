"use client"

import { useCallback, useEffect, useRef, useState } from "react"
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
import { Button } from "@/components/ui/button"
import { Waves, Users, RefreshCw, Loader2 } from "lucide-react"
import { trpc } from "@/lib/trpc"

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
          Condividi la tua prima sessione e inizia a nuotare insieme alla community!
        </p>
      </div>
      <Button variant="neon" size="lg" className="gap-2 mt-2" onClick={onCreatePost}>
        Condividi la tua prima sessione
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
          Inizia a seguire altri nuotatori per vedere i loro allenamenti qui.
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
  const [extraPosts, setExtraPosts] = useState<any[]>([])
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

  const allGroups = storyGroups ?? []
  const currentUserGroup = currentUserId
    ? allGroups.find((g: any) => Number(g.userId) === Number(currentUserId))
    : undefined
  const hasOwnStories = (currentUserGroup?.stories?.length ?? 0) > 0
  const displayName = profile?.username || profile?.userId?.toString() || "Nuotatore"
  const otherStoryGroups = allGroups
    .filter((g: any) => Number(g.userId) !== Number(currentUserId))
    .sort((a, b) => {
      const aU = a.stories.some((s: any) => !s.hasViewed)
      const bU = b.stories.some((s: any) => !s.hasViewed)
      return aU === bU ? 0 : aU ? -1 : 1
    })

  const handleViewStory = useCallback((userId: number) => {
    const groups = storyGroups ?? []
    const idx = groups.findIndex((g: any) => Number(g.userId) === Number(userId))
    if (idx >= 0) {
      setStoryViewerGroupIdx(idx)
      setStoryViewerOpen(true)
    }
  }, [storyGroups])

  const handleCreateStory = useCallback(() => {
    setStoryCreatorOpen(true)
  }, [])

  const scope = tab === "seguiti" ? "following" : "global"

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

    const newPosts = nextPageQuery.data as any[]
    if (newPosts.length < 20) setHasMore(false)

    setExtraPosts((prev) => {
      const existingIds = new Set(prev.map((p: any) => p.id))
      const fresh = newPosts.filter((p: any) => !existingIds.has(p.id))
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

  const firstPagePosts = (firstPageQuery.data as any[]) ?? []
  const allPosts = cursor ? [...firstPagePosts, ...extraPosts] : firstPagePosts

  const seen = new Set<number>()
  const posts = allPosts.filter((p: any) => {
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

  // Header slot: current user's story avatar
  const headerStoryAvatar = currentUserId ? (
    <StoryAvatar
      userId={currentUserId}
      userName={currentUserGroup?.userName ?? displayName}
      avatarUrl={currentUserGroup?.userAvatar ?? profile?.avatarUrl}
      hasUnviewed={hasOwnStories}
      isCurrentUser
      size="sm"
      onClick={hasOwnStories ? () => handleViewStory(currentUserId) : handleCreateStory}
    />
  ) : undefined

  return (
    <AppLayout headerSlot={headerStoryAvatar}>
      <div className="compact-shell">
        {/* Two-column layout: feed + sidebar on xl+ */}
        <div className="flex gap-6 justify-center">
          {/* Feed column */}
          <div className="w-full max-w-2xl min-w-0">
            {/* Stories strip — visible below xl where sidebar is hidden */}
            {otherStoryGroups.length > 0 && (
              <div className="xl:hidden mb-3 flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
                {otherStoryGroups.map((group) => {
                  const hasUnviewed = group.stories.some((s: any) => !s.hasViewed)
                  return (
                    <StoryAvatar
                      key={group.userId}
                      userId={group.userId}
                      userName={group.userName ?? "Utente"}
                      avatarUrl={group.userAvatar}
                      hasUnviewed={hasUnviewed}
                      size="sm"
                      onClick={() => handleViewStory(group.userId)}
                    />
                  )
                })}
              </div>
            )}

            {/* Feed scope tabs: static on all breakpoints (never overlays feed) */}
            <div className="mb-3">
              {/* Pull-to-refresh indicator */}
              {firstPageQuery.isFetching && !isInitialLoading && (
                <div className="flex justify-center py-1">
                  <RefreshCw className="size-4 text-muted-foreground animate-spin" />
                </div>
              )}
              <FeedSubTabs tab={tab} onChange={setTab} />
            </div>

            <div className="space-y-3 lg:space-y-4">
              {/* Feed List */}
              {isInitialLoading ? (
                <FeedSkeleton />
              ) : posts.length === 0 ? (
                tab === "seguiti" ? (
                  <EmptyFeedSeguiti />
                ) : (
                  <EmptyFeedPerTe onCreatePost={() => setCreatePostOpen(true)} />
                )
              ) : (
                <div className="space-y-3 lg:space-y-4">
                  {posts.slice(0, visibleCount).map((post: any, index: number) => (
                    <FeedPost
                      key={post.id}
                      post={post}
                      currentUserId={currentUserId}
                      index={index}
                      autoplayVideos={autoplayVideos}
                    />
                  ))}
                  {/* Load more button */}
                  {(visibleCount < posts.length || hasMore) && (
                    <div className="flex justify-center py-4">
                      <Button
                        variant="outline-neon"
                        size="lg"
                        className="gap-2"
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
                          <>
                            <Loader2 className="size-4 animate-spin" />
                            Caricamento…
                          </>
                        ) : (
                          "Carica altri"
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right sidebar — xl+ only */}
          <aside className="hidden xl:block w-64 shrink-0 sticky top-20 self-start">
            <FeedSidebar
              currentUserId={currentUserId}
              onViewStory={handleViewStory}
              onCreateStory={handleCreateStory}
            />
          </aside>
        </div>
      </div>

      {/* Story Viewer */}
      {storyViewerOpen && storyGroups && storyGroups.length > 0 && (
        <StoryViewer
          groups={storyGroups as any}
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
