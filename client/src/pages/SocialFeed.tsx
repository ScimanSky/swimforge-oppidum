"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import AppLayout from "@/components/AppLayout"
import { StoryBar } from "@/components/social/StoryBar"
import { StoryViewer } from "@/components/social/StoryViewer"
import { StoryCreator } from "@/components/social/StoryCreator"
import FeedSubTabs from "@/components/social/FeedSubTabs"
import FeedPost from "@/components/social/FeedPost"
import FeedSkeleton from "@/components/social/FeedSkeleton"
import InfiniteScrollSentinel from "@/components/social/InfiniteScrollSentinel"
import { trpc } from "@/lib/trpc"

export default function SocialFeed() {
  const [tab, setTab] = useState<"perte" | "seguiti">("perte")
  const [cursor, setCursor] = useState<string | undefined>(undefined)
  const [extraPosts, setExtraPosts] = useState<any[]>([])
  const [hasMore, setHasMore] = useState(true)
  const [storyViewerOpen, setStoryViewerOpen] = useState(false)
  const [storyViewerGroupIdx, setStoryViewerGroupIdx] = useState(0)
  const [storyCreatorOpen, setStoryCreatorOpen] = useState(false)

  const profileQuery = trpc.profile.get.useQuery()
  const currentUserId = profileQuery.data?.userId

  const { data: storyGroups } = trpc.community.stories.active.useQuery(undefined, {
    staleTime: 30_000,
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

  // First page query (no cursor)
  const firstPageQuery = trpc.community.feed.useQuery(
    { limit: 20, scope },
    { staleTime: 30_000 }
  )

  // Pagination query (only when cursor is set)
  const nextPageQuery = trpc.community.feed.useQuery(
    { limit: 20, scope, before: cursor },
    { enabled: !!cursor, staleTime: 30_000 }
  )

  // Accumulate extra pages
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

  // Reset on tab change
  useEffect(() => {
    setCursor(undefined)
    setExtraPosts([])
    setHasMore(true)
    lastCursorRef.current = undefined
  }, [tab])

  // Combine first page + extra pages
  const firstPagePosts = (firstPageQuery.data as any[]) ?? []
  const allPosts = cursor ? [...firstPagePosts, ...extraPosts] : firstPagePosts

  // Deduplicate (safety)
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

  return (
    <AppLayout>
      <div className="compact-shell space-y-4">
        {/* Story Bar */}
        <div className="surface-panel p-3">
          <StoryBar
            currentUserId={currentUserId}
            onViewStory={handleViewStory}
            onCreateStory={handleCreateStory}
          />
        </div>

        {/* Feed Sub-Tabs */}
        <FeedSubTabs tab={tab} onChange={setTab} />

        {/* Feed List */}
        {isInitialLoading ? (
          <FeedSkeleton />
        ) : posts.length === 0 ? (
          <div className="surface-panel p-8 text-center text-muted-foreground">
            {tab === "seguiti"
              ? "Nessun post dai tuoi seguiti. Inizia a seguire altri nuotatori!"
              : "Nessun contenuto nel feed. Condividi la tua prossima sessione!"}
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post: any, index: number) => (
              <FeedPost
                key={post.id}
                post={post}
                currentUserId={currentUserId}
                index={index}
              />
            ))}
            <InfiniteScrollSentinel
              onIntersect={loadMore}
              hasMore={hasMore}
              isLoading={nextPageQuery.isFetching}
            />
          </div>
        )}
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
    </AppLayout>
  )
}
