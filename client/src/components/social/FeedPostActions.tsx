import { Button } from "@/components/ui/button"
import { Droplet, MessageCircle } from "lucide-react"
import PostReactions from "@/components/PostReactions"

interface FeedPostActionsProps {
  post: {
    id: number
    splash_count?: number | string
    comment_count?: number | string
    has_splashed?: boolean
  }
  isOwner: boolean
  onToggleSplash: () => void
  onToggleComments: () => void
  isSplashPending?: boolean
  commentsOpen?: boolean
}

export default function FeedPostActions({
  post,
  isOwner,
  onToggleSplash,
  onToggleComments,
  isSplashPending,
  commentsOpen,
}: FeedPostActionsProps) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Button
        variant={post.has_splashed ? "neon" : "outline-neon"}
        size="sm"
        className="gap-2"
        onClick={onToggleSplash}
        disabled={isOwner || isSplashPending}
      >
        <Droplet className={post.has_splashed ? "h-4 w-4 fill-primary-foreground" : "h-4 w-4"} />
        Splash
        <span className="tabular-nums opacity-90">({Number(post.splash_count) || 0})</span>
      </Button>

      <Button
        variant={commentsOpen ? "neon" : "ghost-neon"}
        size="sm"
        className="gap-2"
        onClick={onToggleComments}
      >
        <MessageCircle className="h-4 w-4" />
        Commenti
        <span className="tabular-nums opacity-75">({Number(post.comment_count) || 0})</span>
      </Button>

      <div className="ml-auto">
        <PostReactions postId={post.id} />
      </div>
    </div>
  )
}
