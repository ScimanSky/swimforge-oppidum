import { useState } from "react"
import { motion } from "framer-motion"
import { Link } from "wouter"
import { ShieldCheck } from "lucide-react"
import FeedPostHeader from "./FeedPostHeader"
import FeedPostMetrics from "./FeedPostMetrics"
import FeedPostActions from "./FeedPostActions"
import FeedPostComments from "./FeedPostComments"
import { isVideoUrl } from "@/lib/post-media"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import type { FeedPostRecord } from "./feed-types"

interface FeedPostProps {
  post: FeedPostRecord
  currentUserId?: number
  index?: number
  autoplayVideos?: boolean
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

export default function FeedPost({ post, currentUserId, index = 0, autoplayVideos = true }: FeedPostProps) {
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [openMediaUrl, setOpenMediaUrl] = useState<string | null>(null)
  const isOwner = !!(currentUserId && post.user_id === currentUserId)
  const isActivityPost =
    Boolean(post.activity_id) ||
    Boolean(post.activity_source) ||
    post.activity_is_open_water != null ||
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
      className="stream-node mb-4"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        type: "spring",
        stiffness: 260,
        damping: 24,
        delay: Math.min(index * 0.05, 0.25),
      }}
    >
      <div
        className={`surface-panel overflow-hidden p-0 transition-all duration-300 ${
          isActivityPost
            ? "sf-activity-card relative isolate hover:shadow-[0_18px_44px_rgba(2,6,23,0.6)]"
            : "sf-social-card"
        }`}
      >
        {isActivityPost && (
          <>
            <div
              aria-hidden="true"
              className="pointer-events-none !absolute inset-0 !z-0 bg-[linear-gradient(135deg,#132230_0%,#1b2e3c_54%,#122130_100%)]"
            />
            <div className="pointer-events-none !absolute inset-0 !z-0 bg-[linear-gradient(106deg,rgba(2,6,23,0.72)_0%,rgba(3,24,45,0.5)_45%,rgba(2,6,23,0.26)_100%)]" />
            <div className="pointer-events-none !absolute inset-0 !z-0 bg-[radial-gradient(circle_at_14%_14%,color-mix(in_oklch,var(--electric-cyan)_24%,transparent),transparent_40%),radial-gradient(circle_at_88%_10%,color-mix(in_oklch,var(--electric-lime)_19%,transparent),transparent_45%)]" />
            <div className="pointer-events-none !absolute inset-[1px] rounded-[25px] !z-0 border border-white/12" />
          </>
        )}
        {!isActivityPost && (
          <>
            <div
              aria-hidden="true"
              className="pointer-events-none !absolute inset-0 !z-0 bg-[linear-gradient(132deg,#101820_0%,#182733_52%,#101920_100%)]"
            />
            <div className="pointer-events-none !absolute inset-0 !z-0 bg-[linear-gradient(124deg,color-mix(in_oklch,var(--background)_74%,transparent)_0%,color-mix(in_oklch,var(--background)_52%,transparent)_44%,color-mix(in_oklch,var(--background)_66%,transparent)_100%)]" />
            <div className="pointer-events-none !absolute inset-0 !z-0 bg-[radial-gradient(circle_at_92%_8%,color-mix(in_oklch,var(--electric-cyan)_14%,transparent),transparent_40%),radial-gradient(circle_at_14%_84%,color-mix(in_oklch,var(--forge-orange)_10%,transparent),transparent_38%)]" />
          </>
        )}

        <div className={isActivityPost ? "relative !z-10" : undefined}>
          <FeedPostHeader post={post} isOwner={isOwner} isFollowing={post.is_following} />

          {isActivityPost ? (
            <div className="px-4">
              <span className="sf-activity-badge">
                <ShieldCheck className="size-3" />
                Allenamento certificato
              </span>
            </div>
          ) : null}

          {isActivityPost ? (
            <FeedPostMetrics
              distanceMeters={post.activity_distance_meters}
              durationSeconds={post.activity_duration_seconds}
              calories={post.activity_calories}
              heartRate={post.activity_heart_rate}
              swolf={post.activity_swolf}
            />
          ) : null}

          {post.content && (
            <p
              className={`px-4 mt-3 text-sm whitespace-pre-wrap ${
                isActivityPost ? "text-white/90" : "text-foreground"
              }`}
            >
              {renderPostContent(post.content)}
            </p>
          )}

          {taggedUsers.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2 px-4">
              {taggedUsers.map((user) => (
                <Link
                  key={user.user_id}
                  href={`/u/${user.user_id}`}
                  className={`rounded-full px-2 py-1 text-xs text-[var(--electric-lime)] ${
                    isActivityPost
                      ? "border border-white/15 bg-white/5 backdrop-blur-sm hover:bg-white/10"
                      : "border border-border/70 bg-card/40 hover:bg-card/70"
                  }`}
                >
                  @{user.username || user.name || `u${user.user_id}`}
                </Link>
              ))}
            </div>
          )}

          {allMedia.length > 0 && (
            <div
              className={`mt-3 grid gap-1.5 overflow-hidden ${
                isActivityPost ? "px-2 pb-2" : ""
              } ${allMedia.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}
            >
              {allMedia.map((url, idx) => (
                <div
                  key={`${url}-${idx}`}
                  className={`${isActivityPost ? "overflow-hidden rounded-2xl border border-white/8 bg-black/35" : "bg-black/30"}`}
                >
                  {isVideoUrl(url) ? (
                    <video
                      src={url}
                      className="max-h-[420px] w-full object-cover"
                      controls
                      playsInline
                      preload="metadata"
                      autoPlay={autoplayVideos}
                      muted={autoplayVideos}
                      loop={autoplayVideos}
                    />
                  ) : (
                    <button
                      type="button"
                      className="block w-full cursor-zoom-in"
                      onClick={() => setOpenMediaUrl(url)}
                    >
                      <img
                        src={url}
                        alt="Post media"
                        className="max-h-[420px] w-full object-cover"
                        loading="lazy"
                      />
                    </button>
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

      <Dialog open={Boolean(openMediaUrl)} onOpenChange={(open) => !open && setOpenMediaUrl(null)}>
        <DialogContent className="max-w-5xl border-border/80 bg-background/95 p-2">
          <DialogTitle className="sr-only">Anteprima immagine</DialogTitle>
          <DialogDescription className="sr-only">Visualizzazione dell'immagine del post.</DialogDescription>
          {openMediaUrl ? (
            <img
              src={openMediaUrl}
              alt="Anteprima immagine del post"
              className="max-h-[82vh] w-full rounded-lg object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
