import { MessageCircle, Share2 } from "lucide-react"
import { toast } from "sonner"
import PostReactions from "@/components/PostReactions"

interface FeedPostActionsProps {
  post: {
    id: number
    comment_count?: number | string
  }
  onToggleComments: () => void
  commentsOpen?: boolean
}

async function handleShare(postId: number) {
  const url = `${window.location.origin}/post/${postId}`

  if (navigator.share) {
    try {
      await navigator.share({
        title: "SwimForge",
        text: "Guarda questo allenamento su SwimForge!",
        url,
      })
      return
    } catch {
      // User cancelled or share failed, fall through to clipboard
    }
  }

  try {
    await navigator.clipboard.writeText(url)
    toast.success("Link copiato negli appunti")
  } catch {
    toast.error("Impossibile copiare il link")
  }
}

export default function FeedPostActions({
  post,
  onToggleComments,
  commentsOpen,
}: FeedPostActionsProps) {
  const commentCount = Number(post.comment_count) || 0

  return (
    <div className="px-4 py-2">
      {/* Action buttons row */}
      <div className="flex items-center border-t border-border/40 pt-2 -mx-1">
        <button
          type="button"
          onClick={onToggleComments}
          className="flex-1 flex items-center justify-center gap-2 py-1.5 rounded-xl text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/40 active:scale-[0.97]"
        >
          <MessageCircle className={commentsOpen ? "size-[18px] fill-foreground/20 text-foreground" : "size-[18px]"} />
          <span className={commentsOpen ? "text-foreground" : ""}>
            {commentCount > 0 ? `${commentCount}` : "Commenta"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleShare(post.id)}
          className="flex-1 flex items-center justify-center gap-2 py-1.5 rounded-xl text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/40 active:scale-[0.97]"
        >
          <Share2 className="size-[18px]" />
          <span>Condividi</span>
        </button>

        <div className="shrink-0 ml-auto">
          <PostReactions postId={post.id} />
        </div>
      </div>
    </div>
  )
}
