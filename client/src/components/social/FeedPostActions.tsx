import { motion } from "framer-motion"
import { Droplet, MessageCircle, Share2 } from "lucide-react"
import { toast } from "sonner"
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
  isOwner,
  onToggleSplash,
  onToggleComments,
  isSplashPending,
  commentsOpen,
}: FeedPostActionsProps) {
  const splashCount = Number(post.splash_count) || 0
  const commentCount = Number(post.comment_count) || 0

  return (
    <div className="px-4 py-2">
      {/* Splash counter line */}
      {splashCount > 0 && (
        <p className="text-xs text-muted-foreground mb-1.5">
          <span className="font-semibold text-foreground">{splashCount}</span> splash
        </p>
      )}

      {/* Action buttons row */}
      <div className="flex items-center border-t border-border/40 pt-2 -mx-1">
        <button
          type="button"
          onClick={onToggleSplash}
          disabled={isOwner || isSplashPending}
          className="flex-1 flex items-center justify-center gap-2 py-1.5 rounded-xl text-sm font-medium transition-colors hover:bg-muted/40 active:scale-[0.97] disabled:opacity-40"
        >
          <motion.span
            key={post.has_splashed ? "splashed" : "unsplashed"}
            initial={false}
            animate={post.has_splashed ? { scale: [1, 1.35, 1] } : { scale: 1 }}
            transition={{ duration: 0.35, type: "spring", stiffness: 400 }}
            className="inline-flex"
          >
            <Droplet
              className={
                post.has_splashed
                  ? "size-[18px] fill-[var(--electric-cyan)] text-[var(--electric-cyan)]"
                  : "size-[18px] text-muted-foreground"
              }
            />
          </motion.span>
          <span className={post.has_splashed ? "text-[var(--electric-cyan)]" : "text-muted-foreground"}>
            Splash
          </span>
        </button>

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
