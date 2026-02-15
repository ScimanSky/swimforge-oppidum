"use client"

import { trpc } from "@/lib/trpc"
import { StoryAvatar } from "./StoryAvatar"

interface StoryBarProps {
  currentUserId?: number | null
  onViewStory?: (userId: number) => void
  onCreateStory?: () => void
}

export function StoryBar({ currentUserId, onViewStory, onCreateStory }: StoryBarProps) {
  const { data: storyGroups } = trpc.community.stories.active.useQuery(undefined, {
    staleTime: 30_000,
  })

  const groups = storyGroups ?? []

  const currentUserGroup = currentUserId
    ? groups.find((g) => g.userId === currentUserId)
    : undefined

  const otherGroups = groups.filter((g) => g.userId !== currentUserId)

  // Sort: unviewed first
  const sorted = [...otherGroups].sort((a, b) => {
    const aUnviewed = a.stories.some((s: any) => !s.hasViewed)
    const bUnviewed = b.stories.some((s: any) => !s.hasViewed)
    if (aUnviewed && !bUnviewed) return -1
    if (!aUnviewed && bUnviewed) return 1
    return 0
  })

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory">
      {/* Current user - always first */}
      {currentUserId && (
        <div className="snap-start shrink-0">
          <StoryAvatar
            userId={currentUserId}
            userName={currentUserGroup?.userName ?? "Tu"}
            avatarUrl={currentUserGroup?.userAvatar}
            hasUnviewed={false}
            isCurrentUser
            onClick={onCreateStory}
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
  )
}
