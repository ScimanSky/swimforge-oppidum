"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import { X } from "lucide-react"
import { trpc } from "@/lib/trpc"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getInitials, formatTimeAgo } from "@/lib/format"

interface Story {
  id: number
  mediaUrl: string | null
  caption: string | null
  type: string
  expiresAt: string
  createdAt: string
  hasViewed: boolean
}

interface StoryGroup {
  userId: number
  userName: string | null
  userAvatar: string | null
  stories: Story[]
}

interface StoryViewerProps {
  groups: StoryGroup[]
  initialGroupIndex: number
  onClose: () => void
}

const STORY_DURATION = 5000

export function StoryViewer({ groups, initialGroupIndex, onClose }: StoryViewerProps) {
  const [groupIdx, setGroupIdx] = useState(initialGroupIndex)
  const [storyIdx, setStoryIdx] = useState(0)
  const [progress, setProgress] = useState(0)
  const timerRef = useRef<number>(0)
  const startRef = useRef(0)
  const rafRef = useRef(0)

  const group = groups[groupIdx]
  const story = group?.stories[storyIdx]

  const markViewed = trpc.community.stories.markViewed.useMutation()

  const goNext = useCallback(() => {
    if (!group) return
    if (storyIdx < group.stories.length - 1) {
      setStoryIdx((i) => i + 1)
    } else if (groupIdx < groups.length - 1) {
      setGroupIdx((i) => i + 1)
      setStoryIdx(0)
    } else {
      onClose()
    }
  }, [group, storyIdx, groupIdx, groups.length, onClose])

  const goPrev = useCallback(() => {
    if (storyIdx > 0) {
      setStoryIdx((i) => i - 1)
    } else if (groupIdx > 0) {
      setGroupIdx((i) => i - 1)
      setStoryIdx((groups[groupIdx - 1]?.stories.length ?? 1) - 1)
    }
  }, [storyIdx, groupIdx, groups])

  // Auto-advance timer
  useEffect(() => {
    setProgress(0)
    startRef.current = Date.now()

    const tick = () => {
      const elapsed = Date.now() - startRef.current
      const pct = Math.min(elapsed / STORY_DURATION, 1)
      setProgress(pct)
      if (pct >= 1) {
        goNext()
      } else {
        rafRef.current = requestAnimationFrame(tick)
      }
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(rafRef.current)
  }, [groupIdx, storyIdx, goNext])

  // Mark viewed
  useEffect(() => {
    if (story && !story.hasViewed) {
      markViewed.mutate({ storyId: story.id })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id])

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      if (e.key === "ArrowRight") goNext()
      if (e.key === "ArrowLeft") goPrev()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose, goNext, goPrev])

  // Touch
  const touchStartX = useRef(0)
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 50) {
      dx > 0 ? goPrev() : goNext()
    }
  }

  const handleTap = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = e.clientX - rect.left
    if (x < rect.width / 2) {
      goPrev()
    } else {
      goNext()
    }
  }

  if (!group || !story) return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="story-viewer"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={handleTap}
      >
        {/* Progress bars */}
        <div className="absolute left-0 right-0 top-0 z-10 flex gap-1 px-3 pt-3">
          {group.stories.map((_, i) => (
            <div key={i} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30">
              <div
                className="h-full bg-white transition-none"
                style={{
                  width:
                    i < storyIdx
                      ? "100%"
                      : i === storyIdx
                        ? `${progress * 100}%`
                        : "0%",
                }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="absolute left-0 right-0 top-0 z-10 flex items-center gap-3 px-4 pt-6">
          <Avatar className="size-9 border border-white/30">
            {group.userAvatar && <AvatarImage src={group.userAvatar} alt={group.userName ?? ""} />}
            <AvatarFallback className="text-xs">
              {getInitials(group.userName ?? "U")}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">
              {group.userName ?? "Utente"}
            </div>
            <div className="text-xs text-white/60">
              {formatTimeAgo(story.createdAt)}
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            className="flex size-9 items-center justify-center rounded-full text-white/80 hover:text-white"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex size-full items-center justify-center">
          {story.type === "text" || !story.mediaUrl ? (
            <div className="flex items-center justify-center px-8">
              <p className="text-center text-2xl font-display font-semibold text-white">
                {story.caption}
              </p>
            </div>
          ) : (
            <img
              src={story.mediaUrl}
              alt={story.caption ?? ""}
              className="max-h-full max-w-full object-contain"
            />
          )}
        </div>

        {/* Caption overlay (for media stories with caption) */}
        {story.type !== "text" && story.caption && (
          <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/70 to-transparent px-4 pb-6 pt-12">
            <p className="text-sm text-white">{story.caption}</p>
          </div>
        )}
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}
