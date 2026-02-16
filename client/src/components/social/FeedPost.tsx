import { useState } from "react"
import { motion } from "framer-motion"
import FeedPostHeader from "./FeedPostHeader"
import FeedPostMetrics from "./FeedPostMetrics"
import FeedPostActions from "./FeedPostActions"
import FeedPostComments from "./FeedPostComments"

interface FeedPostProps {
  post: any
  currentUserId?: number
  index?: number
}

export default function FeedPost({ post, currentUserId, index = 0 }: FeedPostProps) {
  const [commentsOpen, setCommentsOpen] = useState(false)
  const isOwner = !!(currentUserId && post.user_id === currentUserId)
  const isActivityPost =
    Boolean(post.activity_id) ||
    Number(post.activity_distance_meters ?? 0) > 0 ||
    Number(post.activity_duration_seconds ?? 0) > 0

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
            <picture className="pointer-events-none !absolute inset-0 !z-0">
              <source media="(max-width: 767px)" srcSet="/images/activity-card-overlay-mobile.png" />
              <img
                src="/images/activity-card-overlay-desktop.png"
                alt=""
                aria-hidden="true"
                className="h-full w-full object-cover object-center opacity-[0.42] saturate-[1.08] contrast-[1.03]"
                loading="lazy"
              />
            </picture>
            <div className="pointer-events-none !absolute inset-0 !z-0 bg-gradient-to-b from-background/34 via-background/18 to-background/42" />
            <div className="pointer-events-none !absolute inset-0 !z-0 bg-[radial-gradient(circle_at_12%_22%,color-mix(in_oklch,var(--electric-cyan)_16%,transparent),transparent_42%),radial-gradient(circle_at_88%_16%,color-mix(in_oklch,var(--electric-lime)_14%,transparent),transparent_45%)]" />
          </>
        )}

        <div className={isActivityPost ? "relative !z-10" : undefined}>
          <FeedPostHeader post={post} isOwner={isOwner} isFollowing={post.is_following} />

          <FeedPostMetrics
            distanceMeters={post.activity_distance_meters}
            durationSeconds={post.activity_duration_seconds}
          />

          {post.content && (
            <p className="px-4 mt-3 text-sm text-foreground whitespace-pre-wrap">{post.content}</p>
          )}

          {post.media_url && (
            <div className="mt-3 overflow-hidden">
              <img
                src={post.media_url}
                alt="Post media"
                className="w-full object-cover max-h-[480px]"
                loading="lazy"
              />
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
