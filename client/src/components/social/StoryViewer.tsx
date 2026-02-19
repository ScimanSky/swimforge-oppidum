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
  reactionCounts?: Record<string, number>
  userReaction?: string | null
  reactionsTotal?: number
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

const STORY_IMAGE_DURATION = 5000
const STORY_REACTION_CHOICES = [
  { type: "splash", emoji: "💧" },
  { type: "fire", emoji: "🔥" },
  { type: "strong", emoji: "💪" },
  { type: "clap", emoji: "👏" },
  { type: "wave", emoji: "🌊" },
  { type: "love", emoji: "❤️" },
  { type: "rocket", emoji: "🚀" },
  { type: "wow", emoji: "🤯" },
  { type: "laugh", emoji: "😂" },
  { type: "cry", emoji: "😢" },
] as const

export type VideoClipRange = {
  start: number
  end: number | null
}

type StoryFloatingReaction = {
  id: number
  emoji: string
  x: number
  drift: number
  rotate: number
  delay: number
}

export const DEFAULT_VIDEO_CLIP_RANGE: VideoClipRange = { start: 0, end: null }

export function parseVideoClipRange(mediaUrl: string | null): VideoClipRange {
  if (!mediaUrl) return DEFAULT_VIDEO_CLIP_RANGE
  const match = mediaUrl.match(/#t=(\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?))?$/)
  if (!match) return DEFAULT_VIDEO_CLIP_RANGE

  const start = Number(match[1])
  const parsedEnd = match[2] ? Number(match[2]) : null
  if (!Number.isFinite(start) || start < 0) return DEFAULT_VIDEO_CLIP_RANGE
  if (parsedEnd !== null && (!Number.isFinite(parsedEnd) || parsedEnd <= start)) {
    return { start, end: null }
  }
  return { start, end: parsedEnd }
}

export function StoryViewer({ groups, initialGroupIndex, onClose }: StoryViewerProps) {
  const [groupIdx, setGroupIdx] = useState(initialGroupIndex)
  const [storyIdx, setStoryIdx] = useState(0)
  const [progress, setProgress] = useState(0)
  const [reactionStateByStory, setReactionStateByStory] = useState<
    Record<number, { counts: Record<string, number>; userReaction: string | null; total: number }>
  >({})
  const [floatingReactions, setFloatingReactions] = useState<StoryFloatingReaction[]>([])
  const startRef = useRef(0)
  const rafRef = useRef(0)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const clipRangeRef = useRef<VideoClipRange>(DEFAULT_VIDEO_CLIP_RANGE)
  const advancedFromClipRef = useRef(false)

  const group = groups[groupIdx]
  const story = group?.stories[storyIdx]
  const utils = trpc.useUtils()
  const profileQuery = trpc.profile.get.useQuery(undefined, { staleTime: 5 * 60_000 })
  const currentUserId = profileQuery.data?.userId

  const markViewed = trpc.community.stories.markViewed.useMutation()
  const reactToStory = trpc.community.stories.react.useMutation({
    onSuccess: (data, variables) => {
      setReactionStateByStory((prev) => ({
        ...prev,
        [variables.storyId]: data.summary,
      }))
      void utils.community.stories.active.invalidate()
    },
  })

  const spawnFloatingReactions = useCallback((emoji: string) => {
    const now = Date.now()
    const particles: StoryFloatingReaction[] = Array.from({ length: 7 }, (_, idx) => ({
      id: now + idx,
      emoji,
      x: (Math.random() - 0.5) * 80,
      drift: (Math.random() - 0.5) * 28,
      rotate: (Math.random() - 0.5) * 42,
      delay: idx * 0.02,
    }))
    setFloatingReactions((prev) => [...prev, ...particles])
    window.setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((item) => !particles.some((particle) => particle.id === item.id)))
    }, 820)
  }, [])

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
    if (!story) return
    setProgress(0)
    cancelAnimationFrame(rafRef.current)

    if (story.type === "video") {
      return () => {
        cancelAnimationFrame(rafRef.current)
      }
    }

    startRef.current = Date.now()
    const tick = () => {
      const elapsed = Date.now() - startRef.current
      const pct = Math.min(elapsed / STORY_IMAGE_DURATION, 1)
      setProgress(pct)
      if (pct >= 1) {
        goNext()
      } else {
        rafRef.current = requestAnimationFrame(tick)
      }
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(rafRef.current)
  }, [groupIdx, storyIdx, goNext, story])

  // Mark viewed
  useEffect(() => {
    if (story && !story.hasViewed) {
      markViewed.mutate({ storyId: story.id })
    }
  }, [story?.id])

  useEffect(() => {
    clipRangeRef.current = parseVideoClipRange(story?.mediaUrl ?? null)
    advancedFromClipRef.current = false
  }, [story?.id, story?.mediaUrl])

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

  const reactionSummary = reactionStateByStory[story.id] ?? {
    counts: story.reactionCounts ?? {},
    userReaction: story.userReaction ?? null,
    total: story.reactionsTotal ?? 0,
  }
  const canReact = !!currentUserId && currentUserId !== group.userId
  const isOwnerStory = !!currentUserId && currentUserId === group.userId
  const showReactions = canReact || (isOwnerStory && reactionSummary.total > 0)
  const visibleReactionChoices = canReact
    ? STORY_REACTION_CHOICES
    : STORY_REACTION_CHOICES.filter((choice) => (reactionSummary.counts[choice.type] ?? 0) > 0)

  const handleVideoLoadedMetadata = () => {
    const video = videoRef.current
    if (!video) return
    const clipRange = clipRangeRef.current
    const duration = video.duration
    if (!Number.isFinite(duration) || duration <= 0) return
    if (clipRange.start > 0 && video.currentTime < clipRange.start) {
      video.currentTime = Math.min(clipRange.start, Math.max(0, duration - 0.05))
    }
    if (video.paused) {
      void video.play().catch(() => {
        // autoplay can fail on some browsers; user can tap to continue
      })
    }
  }

  const handleVideoTimeUpdate = () => {
    const video = videoRef.current
    if (!video) return
    if (!Number.isFinite(video.duration) || video.duration <= 0) return
    const clipRange = clipRangeRef.current
    const clipStart = Math.max(0, clipRange.start)
    const clipEnd = clipRange.end ? Math.min(clipRange.end, video.duration) : video.duration
    const clipDuration = Math.max(0.001, clipEnd - clipStart)
    const elapsed = Math.max(0, Math.min(video.currentTime - clipStart, clipDuration))
    setProgress(Math.min(elapsed / clipDuration, 1))

    if (clipRange.end !== null && video.currentTime >= clipEnd - 0.05) {
      if (!advancedFromClipRef.current) {
        advancedFromClipRef.current = true
        goNext()
      }
    }
  }

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
          ) : story.type === "video" ? (
            <video
              key={story.id}
              ref={videoRef}
              src={story.mediaUrl}
              className="max-h-full max-w-full object-contain"
              autoPlay
              playsInline
              preload="metadata"
              onLoadedMetadata={handleVideoLoadedMetadata}
              onTimeUpdate={handleVideoTimeUpdate}
              onEnded={() => {
                if (!advancedFromClipRef.current) {
                  advancedFromClipRef.current = true
                  goNext()
                }
              }}
              onClick={(e) => e.stopPropagation()}
              controls
            />
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

        {/* Reactions */}
        {showReactions && (
          <div
            className="absolute bottom-4 left-1/2 z-20 w-[calc(100vw-1rem)] max-w-[640px] -translate-x-1/2 px-1"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap rounded-full bg-black/55 px-2 py-1 backdrop-blur-sm scrollbar-hide touch-pan-x overscroll-x-contain">
              {visibleReactionChoices.map((choice) => {
                const isActive = reactionSummary.userReaction === choice.type
                return (
                  <motion.button
                    key={choice.type}
                    type="button"
                    className={`shrink-0 flex items-center gap-1 rounded-full px-2 py-1 text-sm transition ${
                      isActive ? "bg-white/25" : "hover:bg-white/15"
                    }`}
                    whileHover={{ scale: 1.08, y: -1 }}
                    whileTap={{ scale: 0.92 }}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (!canReact) return
                      if (reactToStory.isPending) return
                      spawnFloatingReactions(choice.emoji)
                      reactToStory.mutate({ storyId: story.id, reactionType: choice.type })
                    }}
                    disabled={!canReact}
                  >
                    <motion.span
                      animate={isActive ? { y: [0, -2, 0] } : { y: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      {choice.emoji}
                    </motion.span>
                  </motion.button>
                )
              })}
            </div>
          </div>
        )}

        <div className="pointer-events-none absolute bottom-14 left-1/2 z-30 -translate-x-1/2">
          <AnimatePresence>
            {floatingReactions.map((item) => (
              <motion.span
                key={item.id}
                className="absolute text-xl"
                style={{ left: item.x, bottom: 0 }}
                initial={{ opacity: 0, y: 0, x: 0, scale: 0.7, rotate: 0 }}
                animate={{
                  opacity: [0, 1, 1, 0],
                  y: [-2, -26, -56],
                  x: [0, item.drift],
                  scale: [0.7, 1.08, 0.92],
                  rotate: [0, item.rotate],
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.76, ease: "easeOut", delay: item.delay }}
              >
                {item.emoji}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}
