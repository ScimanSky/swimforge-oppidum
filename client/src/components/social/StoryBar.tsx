"use client"

import { useRef, useState, useEffect } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { trpc } from "@/lib/trpc"
import { StoryAvatar } from "./StoryAvatar"

interface StoryBarProps {
  currentUserId?: number | null
  onViewStory?: (userId: number) => void
  onCreateStory?: () => void
}

export function StoryBar({ currentUserId, onViewStory, onCreateStory }: StoryBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const { data: storyGroups } = trpc.community.stories.active.useQuery(undefined, {
    staleTime: 30_000,
  })

  const groups = storyGroups ?? []

  const currentUserGroup = currentUserId
    ? groups.find((g: any) => Number(g.userId) === Number(currentUserId))
    : undefined

  const hasOwnStories = (currentUserGroup?.stories?.length ?? 0) > 0

  const otherGroups = groups.filter((g: any) => Number(g.userId) !== Number(currentUserId))

  const sorted = [...otherGroups].sort((a, b) => {
    const aUnviewed = a.stories.some((s: any) => !s.hasViewed)
    const bUnviewed = b.stories.some((s: any) => !s.hasViewed)
    if (aUnviewed && !bUnviewed) return -1
    if (!aUnviewed && bUnviewed) return 1
    return 0
  })

  const updateScrollState = () => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }

  useEffect(() => {
    updateScrollState()
    const el = scrollRef.current
    if (!el) return
    el.addEventListener("scroll", updateScrollState, { passive: true })
    const ro = new ResizeObserver(updateScrollState)
    ro.observe(el)
    return () => {
      el.removeEventListener("scroll", updateScrollState)
      ro.disconnect()
    }
  }, [groups.length])

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: dir === "left" ? -200 : 200, behavior: "smooth" })
  }

  return (
    <div className="relative group/story-bar">
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-2 pt-1 px-1 scrollbar-hide snap-x snap-mandatory"
      >
        {/* Current user - always first */}
        {currentUserId && (
          <div className="snap-start shrink-0">
            <StoryAvatar
              userId={currentUserId}
              userName={currentUserGroup?.userName ?? "Tu"}
              avatarUrl={currentUserGroup?.userAvatar}
              hasUnviewed={hasOwnStories}
              isCurrentUser
              onClick={hasOwnStories ? () => onViewStory?.(currentUserId) : onCreateStory}
            />
          </div>
        )}

        {sorted.map((group) => {
          const hasUnviewed = group.stories.some((s: any) => !s.hasViewed)
          return (
            <div key={group.userId} className="snap-start shrink-0">
              <StoryAvatar
                userId={group.userId}
                userName={group.userName ?? "Utente"}
                avatarUrl={group.userAvatar}
                hasUnviewed={hasUnviewed}
                onClick={() => onViewStory?.(group.userId)}
              />
            </div>
          )
        })}
      </div>

      {/* Desktop scroll arrows */}
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scroll("left")}
          className="hidden lg:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 size-8 items-center justify-center rounded-full bg-background/80 border border-border/60 shadow-md backdrop-blur-sm opacity-0 group-hover/story-bar:opacity-100 transition-opacity hover:bg-background"
        >
          <ChevronLeft className="size-4" />
        </button>
      )}
      {canScrollRight && (
        <button
          type="button"
          onClick={() => scroll("right")}
          className="hidden lg:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 size-8 items-center justify-center rounded-full bg-background/80 border border-border/60 shadow-md backdrop-blur-sm opacity-0 group-hover/story-bar:opacity-100 transition-opacity hover:bg-background"
        >
          <ChevronRight className="size-4" />
        </button>
      )}
    </div>
  )
}
