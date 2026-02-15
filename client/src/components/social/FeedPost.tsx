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
      <div className="surface-panel overflow-hidden p-0">
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
    </motion.div>
  )
}
