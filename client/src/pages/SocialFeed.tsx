"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
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
  const [posts, setPosts] = useState<any[]>([])
  const [cursor, setCursor] = useState<string | undefined>(undefined)
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
    const idx = groups.findIndex((g: any) => g.userId === userId)
    if (idx >= 0) {
      setStoryViewerGroupIdx(idx)
      setStoryViewerOpen(true)
    }
  }, [storyGroups])

  const handleCreateStory = useCallback(() => {
    setStoryCreatorOpen(true)
  }, [])

  const scope = tab === "seguiti" ? "following" : "global"

  const feedQuery = trpc.community.feed.useQuery(
    { limit: 20, scope, before: cursor },
    { enabled: true }
  )

  // Accumulate posts when new data arrives
  useEffect(() => {
    if (!feedQuery.data) return
    const newPosts = feedQuery.data as any[]

    if (!cursor) {
      // First load or tab change — replace all posts
      setPosts(newPosts)
    } else {
      // Infinite scroll — append only new posts
      setPosts((prev) => {
        const existingIds = new Set(prev.map((p: any) => p.id))
        const fresh = newPosts.filter((p: any) => !existingIds.has(p.id))
        return [...prev, ...fresh]
      })
    }

    if (newPosts.length < 20) {
      setHasMore(false)
    }
  }, [feedQuery.data, cursor])

  // Reset when tab changes
  useEffect(() => {
    setPosts([])
    setCursor(undefined)
    setHasMore(true)
  }, [tab])

  const loadMore = useCallback(() => {
    if (posts.length === 0 || feedQuery.isFetching) return
    const oldest = posts[posts.length - 1]
    if (oldest?.created_at) {
      setCursor(new Date(oldest.created_at).toISOString())
    }
  }, [posts, feedQuery.isFetching])

  const isInitialLoading = feedQuery.isLoading && posts.length === 0

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
              isLoading={feedQuery.isFetching}
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
