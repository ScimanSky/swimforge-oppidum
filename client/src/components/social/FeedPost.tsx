import { useState } from "react"
import { motion } from "framer-motion"
import { trpc } from "@/lib/trpc"
import { toast } from "sonner"
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

  const utils = trpc.useUtils()
  const toggleSplash = trpc.community.toggleSplash.useMutation({
    onSuccess: (data: any) => {
      if (Number(data?.actionXp?.awardedXp ?? 0) > 0) {
        toast.success(`+${data.actionXp.awardedXp} XP Action`)
      }
      utils.community.feed.invalidate()
    },
    onError: (err) => {
      toast.error(err.message || "Impossibile inviare uno Splash")
    },
  })

  const handleSplash = () => {
    if (isOwner) {
      toast.info("Non puoi mettere Splash al tuo allenamento.")
      return
    }
    toggleSplash.mutate({ postId: post.id })
  }

  return (
    <motion.div
      className="stream-node"
      initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.35, ease: "easeOut", delay: Math.min(index * 0.035, 0.25) }}
    >
      <div className="surface-panel p-3.5">
        <FeedPostHeader post={post} isOwner={isOwner} />

        <FeedPostMetrics
          distanceMeters={post.activity_distance_meters}
          durationSeconds={post.activity_duration_seconds}
        />

        {post.content && (
          <p className="mt-4 text-sm text-foreground whitespace-pre-wrap">{post.content}</p>
        )}

        {post.media_url && (
          <div className="mt-3 rounded-2xl overflow-hidden">
            <img
              src={post.media_url}
              alt="Post media"
              className="w-full object-cover max-h-96"
              loading="lazy"
            />
          </div>
        )}

        <FeedPostActions
          post={post}
          isOwner={isOwner}
          onToggleSplash={handleSplash}
          onToggleComments={() => setCommentsOpen(!commentsOpen)}
          isSplashPending={toggleSplash.isPending}
          commentsOpen={commentsOpen}
        />

        <FeedPostComments postId={post.id} isOpen={commentsOpen} />
      </div>
    </motion.div>
  )
}
