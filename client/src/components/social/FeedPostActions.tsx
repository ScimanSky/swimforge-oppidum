import { useState } from "react"
import { MessageCircle, Send, Share2 } from "lucide-react"
import { toast } from "sonner"
import PostReactions from "@/components/PostReactions"
import { ForwardContentDialog } from "@/components/social/ForwardContentDialog"
import { publicSiteUrl } from "@/lib/public-url"
import { cn } from "@/lib/utils"

interface FeedPostActionsProps {
  post: {
    id: number
    comment_count?: number | string
  }
  onToggleComments: () => void
  commentsOpen?: boolean
}

async function handleShare(postId: number) {
  const url = publicSiteUrl(`/post/${postId}`)

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
  const [forwardOpen, setForwardOpen] = useState(false)

  const iconButton =
    "flex min-h-[44px] items-center gap-1.5 rounded-xl px-2 text-sm font-semibold transition-colors hover:bg-raised"

  return (
    <div className="-mx-2 pb-2 pt-1">
      <div className="flex items-center gap-2">
        <PostReactions postId={post.id} variant="heart" />

        <button
          type="button"
          onClick={onToggleComments}
          aria-expanded={Boolean(commentsOpen)}
          aria-label={commentCount > 0 ? `Commenti, ${commentCount}` : "Commenta"}
          className={cn(iconButton, commentsOpen ? "text-action-text" : "text-foreground")}
        >
          <MessageCircle
            aria-hidden
            className={cn("size-[22px]", commentsOpen ? "text-action-text" : "text-muted-foreground")}
          />
          {commentCount > 0 ? <span className="tabular-nums">{commentCount}</span> : null}
        </button>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setForwardOpen(true)}
            aria-label="Inoltra"
            className={cn(iconButton, "text-muted-foreground hover:text-foreground")}
          >
            <Send className="size-[22px]" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => handleShare(post.id)}
            aria-label="Condividi"
            className={cn(iconButton, "text-muted-foreground hover:text-foreground")}
          >
            <Share2 className="size-[22px]" aria-hidden />
          </button>
        </div>
      </div>
      {forwardOpen ? (
        <ForwardContentDialog
          open={forwardOpen}
          onOpenChange={setForwardOpen}
          targetId={post.id}
        />
      ) : null}
    </div>
  )
}
