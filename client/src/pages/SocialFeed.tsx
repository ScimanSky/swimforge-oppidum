"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { Link } from "wouter"
import AppLayout from "@/components/AppLayout"
import { CreatePostSheet } from "@/components/social/CreatePostSheet"
import FeedSubTabs from "@/components/social/FeedSubTabs"
import FeedPost from "@/components/social/FeedPost"
import FeedSkeleton from "@/components/social/FeedSkeleton"
import FeedSidebar from "@/components/social/FeedSidebar"
import FollowStarterCard from "@/components/social/FollowStarterCard"
import type { FeedPostRecord } from "@/components/social/feed-types"
import { Button } from "@/components/ui/button"
import { Waves, Users, RefreshCw, Loader2, type LucideIcon } from "lucide-react"
import { trpc } from "@/lib/trpc"

function EmptyState({
  icon,
  title,
  text,
  children,
}: {
  icon: LucideIcon
  title: string
  text: string
  children: ReactNode
}) {
  const Icon = icon
  return (
    <div className="surface-panel flex flex-col items-center gap-3 p-6 text-center">
      <span className="inline-flex size-12 items-center justify-center rounded-xl bg-raised">
        <Icon className="size-6 text-action-text" aria-hidden />
      </span>
      <div>
        <h2 className="text-[17px] font-bold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{text}</p>
      </div>
      <div className="mt-1">{children}</div>
    </div>
  )
}

function EmptyFeedPerTe({ onCreatePost }: { onCreatePost: () => void }) {
  return (
    <EmptyState
      icon={Waves}
      title="Il feed è vuoto"
      text="Forgia la prima sessione della settimana e accendi il tuo feed."
    >
      <Button onClick={onCreatePost}>Condividi la prima sessione</Button>
    </EmptyState>
  )
}

function EmptyFeedSeguiti() {
  return (
    <EmptyState
      icon={Users}
      title="Segui altri nuotatori"
      text="Costruisci la tua crew e porta nel feed allenamenti e sfide reali."
    >
      <Button asChild>
        <Link href="/home/community">Esplora la community</Link>
      </Button>
    </EmptyState>
  )
}

export default function SocialFeed() {
  const [tab, setTab] = useState<"perte" | "seguiti">("perte")
  const [cursor, setCursor] = useState<string | undefined>(undefined)
  const [extraPosts, setExtraPosts] = useState<FeedPostRecord[]>([])
  const [hasMore, setHasMore] = useState(true)
  const [visibleCount, setVisibleCount] = useState(5)
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

  return (
    <AppLayout>
      <div className="w-full">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="w-full min-w-0">
            <div className="mb-2 w-full">
              {firstPageQuery.isFetching && !isInitialLoading && (
                <div className="mb-1.5 flex justify-center py-1">
                  <RefreshCw className="size-4 animate-spin text-muted-foreground" aria-label="Aggiornamento" />
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
                <div className="surface-panel p-6 text-center" role="alert">
                  <p className="text-sm text-foreground">Impossibile caricare il feed al momento.</p>
                  <Button
                    type="button"
                    variant="outline"
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
                <div className="flex flex-col">
                  {posts.slice(0, visibleCount).map((post, index) => (
                    <FeedPost
                      key={post.id}
                      post={post}
                      currentUserId={currentUserId}
                      index={index}
                      autoplayVideos={autoplayVideos}
                    />
                  ))}
                  {(visibleCount < posts.length || hasMore) && (
                    <div className="py-2">
                      <button
                        type="button"
                        className="h-11 w-full rounded-xl text-sm font-semibold text-action-text transition-colors hover:bg-raised disabled:opacity-60"
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
                            <Loader2 className="size-4 animate-spin" aria-hidden />
                            Caricamento…
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

      {/* Create Post Sheet (from empty state CTA) */}
      <CreatePostSheet open={createPostOpen} onOpenChange={setCreatePostOpen} />
    </AppLayout>
  )
}
