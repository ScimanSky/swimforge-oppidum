import { useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { AnimatePresence, motion } from "framer-motion"
import { Send } from "lucide-react"
import { trpc } from "@/lib/trpc"
import { toast } from "sonner"
import { getInitials } from "@/lib/format"

interface FeedPostCommentsProps {
  postId: number
  isOpen: boolean
}

export default function FeedPostComments({ postId, isOpen }: FeedPostCommentsProps) {
  const [commentText, setCommentText] = useState("")

  const commentsQuery = trpc.community.comments.useQuery(
    { postId },
    { enabled: isOpen }
  )

  const addComment = trpc.community.addComment.useMutation({
    onSuccess: (data: any) => {
      if (Number(data?.actionXp?.awardedXp ?? 0) > 0) {
        toast.success(`+${data.actionXp.awardedXp} XP Action`)
      }
      setCommentText("")
      commentsQuery.refetch()
    },
    onError: (err) => toast.error(err.message || "Impossibile inviare il commento"),
  })

  const submitComment = () => {
    const content = commentText.trim()
    if (!content) return
    addComment.mutate({ postId, content })
  }

  const comments = commentsQuery.data ?? []

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="overflow-hidden"
        >
          <div className="px-4 pb-3 space-y-2.5">
            {/* Comment previews - inline, no border */}
            {commentsQuery.isLoading ? (
              <div className="text-xs text-muted-foreground py-1">Caricamento...</div>
            ) : comments.length > 0 ? (
              <>
                {comments.slice(0, 2).map((comment: any) => (
                  <div key={comment.id} className="flex items-start gap-2">
                    <Avatar className="size-6 border border-border/60 shrink-0 mt-0.5">
                      <AvatarImage src={comment.user_avatar || ""} />
                      <AvatarFallback className="text-[9px]">
                        {getInitials(comment.user_name || comment.user_email || "SW")}
                      </AvatarFallback>
                    </Avatar>
                    <p className="text-sm text-foreground min-w-0">
                      <span className="font-semibold mr-1.5">
                        {(comment.user_name || comment.user_email || "").split(" ")[0]}
                      </span>
                      {comment.content}
                    </p>
                  </div>
                ))}
                {comments.length > 2 && (
                  <p className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                    Vedi tutti i {comments.length} commenti
                  </p>
                )}
              </>
            ) : (
              <div className="text-xs text-muted-foreground">Nessun commento ancora.</div>
            )}

            {/* Comment input - always visible */}
            <div className="flex items-center gap-2 mt-1">
              <Avatar className="size-6 border border-border/60 shrink-0">
                <AvatarFallback className="text-[9px]">Tu</AvatarFallback>
              </Avatar>
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="Aggiungi un commento..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      submitComment()
                    }
                  }}
                  className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 border-b border-border/40 py-1.5 pr-8 outline-none focus:border-[var(--electric-cyan)]/50 transition-colors"
                />
                {commentText.trim() && (
                  <button
                    type="button"
                    onClick={submitComment}
                    disabled={addComment.isPending}
                    className="absolute right-0 top-1/2 -translate-y-1/2 text-[var(--electric-cyan)] hover:text-[var(--electric-lime)] transition-colors disabled:opacity-40"
                  >
                    <Send className="size-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
