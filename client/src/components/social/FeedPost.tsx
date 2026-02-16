import { useState } from "react"
import { motion } from "framer-motion"
import { Link } from "wouter"
import FeedPostHeader from "./FeedPostHeader"
import FeedPostMetrics from "./FeedPostMetrics"
import FeedPostActions from "./FeedPostActions"
import FeedPostComments from "./FeedPostComments"
import { isVideoUrl } from "@/lib/post-media"

interface FeedPostProps {
  post: any
  currentUserId?: number
  index?: number
}

function normalizeArrayField(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item)).filter((item) => item.trim().length > 0)
  }
  if (typeof raw === "string" && raw.startsWith("{") && raw.endsWith("}")) {
    return raw
      .slice(1, -1)
      .split(",")
      .map((item) => item.replace(/^"|"$/g, "").trim())
      .filter((item) => item.length > 0)
  }
  return []
}

function parseTaggedUsers(raw: unknown): Array<{ user_id: number; name?: string | null; username?: string | null }> {
  if (Array.isArray(raw)) return raw as Array<{ user_id: number; name?: string | null; username?: string | null }>
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed as Array<{ user_id: number; name?: string | null; username?: string | null }>
    } catch {
      return []
    }
  }
  return []
}

function renderPostContent(content: string) {
  const parts = content.split(/(#[A-Za-z0-9_]{2,40}|@[A-Za-z0-9_]{2,40})/g)
  return parts.map((part, idx) => {
    if (/^#[A-Za-z0-9_]{2,40}$/.test(part)) {
      return (
        <span key={`${part}-${idx}`} className="text-[var(--electric-cyan)] font-medium">
          {part}
        </span>
      )
    }
    if (/^@[A-Za-z0-9_]{2,40}$/.test(part)) {
      return (
        <span key={`${part}-${idx}`} className="text-[var(--electric-lime)] font-medium">
          {part}
        </span>
      )
    }
    return <span key={`${part}-${idx}`}>{part}</span>
  })
}

export default function FeedPost({ post, currentUserId, index = 0 }: FeedPostProps) {
  const [commentsOpen, setCommentsOpen] = useState(false)
  const isOwner = !!(currentUserId && post.user_id === currentUserId)
  const isActivityPost =
    Boolean(post.activity_id) ||
    Number(post.activity_distance_meters ?? 0) > 0 ||
    Number(post.activity_duration_seconds ?? 0) > 0
  const mediaUrls = normalizeArrayField(post.media_urls)
  const allMedia = mediaUrls.length > 0
    ? mediaUrls
    : (post.media_url ? [String(post.media_url)] : [])
  const taggedUsers = parseTaggedUsers(post.tagged_users)
  const hashtags = normalizeArrayField(post.hashtags)

  return (
    <motion.div
      className="stream-node"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.45,
        type: "spring",
        stiffness: 260,
        damping: 24,
        delay: Math.min(index * 0.04, 0.2),
      }}
    >
      <div className={`surface-panel overflow-hidden p-0 ${isActivityPost ? "relative isolate" : ""}`}>
        {isActivityPost && (
          <>
            <picture className="pointer-events-none !absolute inset-y-0 right-0 w-[68%] !z-0">
              <source media="(max-width: 767px)" srcSet="/images/activity-card-overlay-mobile.png" />
              <img
                src="/images/activity-card-overlay-desktop.png"
                alt=""
                aria-hidden="true"
                className="h-full w-full object-cover object-center opacity-[0.55] saturate-[1.1] contrast-[1.04]"
                loading="lazy"
              />
            </picture>
            <div className="pointer-events-none !absolute inset-0 !z-0 bg-[linear-gradient(102deg,color-mix(in_oklch,var(--background)_84%,transparent)_0%,color-mix(in_oklch,var(--background)_72%,transparent)_42%,color-mix(in_oklch,var(--background)_46%,transparent)_100%)]" />
            <div className="pointer-events-none !absolute inset-0 !z-0 bg-[radial-gradient(circle_at_16%_14%,color-mix(in_oklch,var(--electric-cyan)_22%,transparent),transparent_38%),radial-gradient(circle_at_84%_14%,color-mix(in_oklch,var(--electric-lime)_16%,transparent),transparent_42%)]" />
            <div className="pointer-events-none !absolute inset-[1px] rounded-[25px] !z-0 border border-white/10" />
          </>
        )}

        <div className={isActivityPost ? "relative !z-10" : undefined}>
          <FeedPostHeader post={post} isOwner={isOwner} isFollowing={post.is_following} />

          <FeedPostMetrics
            distanceMeters={post.activity_distance_meters}
            durationSeconds={post.activity_duration_seconds}
          />

          {post.content && (
            <p className="px-4 mt-3 text-sm text-foreground whitespace-pre-wrap">
              {renderPostContent(post.content)}
            </p>
          )}

          {taggedUsers.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2 px-4">
              {taggedUsers.map((user) => (
                <Link
                  key={user.user_id}
                  href={`/u/${user.user_id}`}
                  className="rounded-full border border-border/70 bg-card/40 px-2 py-1 text-xs text-[var(--electric-lime)] hover:bg-card/70"
                >
                  @{user.username || user.name || `u${user.user_id}`}
                </Link>
              ))}
            </div>
          )}

          {allMedia.length > 0 && (
            <div className={`mt-3 grid gap-1 overflow-hidden ${allMedia.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
              {allMedia.map((url, idx) => (
                <div key={`${url}-${idx}`} className="bg-black/30">
                  {isVideoUrl(url) ? (
                    <video
                      src={url}
                      className="max-h-[420px] w-full object-cover"
                      controls
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <img
                      src={url}
                      alt="Post media"
                      className="max-h-[420px] w-full object-cover"
                      loading="lazy"
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {!post.content && hashtags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5 px-4">
              {hashtags.map((tag) => (
                <span key={tag} className="rounded-full bg-card/40 px-2 py-1 text-[11px] text-[var(--electric-cyan)]">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          <FeedPostActions
            post={post}
            onToggleComments={() => setCommentsOpen(!commentsOpen)}
            commentsOpen={commentsOpen}
          />

          <FeedPostComments postId={post.id} isOpen={commentsOpen} />
        </div>
      </div>
    </motion.div>
  )
}
