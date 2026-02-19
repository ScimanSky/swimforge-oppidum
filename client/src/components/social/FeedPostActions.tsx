import { useState } from "react"
import { MessageCircle, Send, Share2 } from "lucide-react"
import { toast } from "sonner"
import PostReactions from "@/components/PostReactions"
import { ForwardContentDialog } from "@/components/social/ForwardContentDialog"

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
  const [forwardOpen, setForwardOpen] = useState(false)

  return (
    <div className="px-4 pb-3 pt-1">
      <div className="flex items-center gap-1 border-t border-border/50 pt-2">
        <button
          type="button"
          onClick={onToggleComments}
          className={[
            "flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200",
            "active:scale-95",
            commentsOpen
              ? "bg-[var(--electric-cyan)]/10 text-[var(--electric-cyan)]"
              : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
          ].join(" ")}
        >
          <MessageCircle
            className={`size-[18px] ${commentsOpen ? "fill-[var(--electric-cyan)]/20" : ""}`}
          />
          <span>{commentCount > 0 ? commentCount : "Commenta"}</span>
        </button>

        <button
          type="button"
          onClick={() => setForwardOpen(true)}
          className="flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-muted/40 hover:text-foreground active:scale-95"
        >
          <Send className="size-[18px]" />
          <span className="hidden sm:inline">Inoltra</span>
        </button>

        <button
          type="button"
          onClick={() => handleShare(post.id)}
          className="flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-muted/40 hover:text-foreground active:scale-95"
        >
          <Share2 className="size-[18px]" />
          <span className="hidden sm:inline">Condividi</span>
        </button>

        <div className="ml-auto shrink-0">
          <PostReactions postId={post.id} />
        </div>
      </div>
      {forwardOpen ? (
        <ForwardContentDialog
          open={forwardOpen}
          onOpenChange={setForwardOpen}
          targetType="post"
          targetId={post.id}
        />
      ) : null}
    </div>
  )
}
