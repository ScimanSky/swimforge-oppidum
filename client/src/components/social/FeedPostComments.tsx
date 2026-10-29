import { useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { AnimatePresence, motion } from "framer-motion"
import { Send } from "lucide-react"
import { trpc } from "@/lib/trpc"
import { toast } from "sonner"
import { getInitials } from "@/lib/format"
import type { FeedCommentRecord } from "./feed-types"

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
    onSuccess: (data) => {
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

  const comments: FeedCommentRecord[] = (commentsQuery.data as FeedCommentRecord[] | undefined) ?? []

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
          <div className="space-y-2.5 pb-3">
            {/* Comment previews - inline, no border */}
            {commentsQuery.isLoading ? (
              <div className="py-1 text-sm text-muted-foreground">Caricamento…</div>
            ) : comments.length > 0 ? (
              <>
                {comments.slice(0, 2).map((comment) => (
                  <div key={comment.id} className="flex items-start gap-2">
                    <Avatar className="mt-0.5 size-7 shrink-0">
                      <AvatarImage src={comment.user_avatar || ""} alt="" />
                      <AvatarFallback className="text-xs">
                        {getInitials(comment.user_name || comment.user_username || "SW")}
                      </AvatarFallback>
                    </Avatar>
                    <p className="text-sm text-foreground min-w-0">
                      <span className="font-semibold mr-1.5">
                        {(comment.user_name || comment.user_username || "").split(" ")[0]}
                      </span>
                      {comment.content}
                    </p>
                  </div>
                ))}
                {comments.length > 2 && (
                  <p className="text-sm text-muted-foreground">
                    Vedi tutti i {comments.length} commenti
                  </p>
                )}
              </>
            ) : (
              <div className="text-sm text-muted-foreground">Nessun commento ancora.</div>
            )}

            {/* Comment input - always visible */}
            <div className="flex items-center gap-2 mt-1">
              <Avatar className="size-7 shrink-0">
                <AvatarFallback className="text-xs">Tu</AvatarFallback>
              </Avatar>
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="Aggiungi un commento…"
                  aria-label="Aggiungi un commento"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      submitComment()
                    }
                  }}
                  className="w-full border-b border-border bg-transparent py-2 pr-9 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-action-text"
                />
                {commentText.trim() && (
                  <button
                    type="button"
                    onClick={submitComment}
                    disabled={addComment.isPending}
                    aria-label="Invia commento"
                    className="absolute right-0 top-1/2 -translate-y-1/2 p-1 text-action-text transition-opacity hover:opacity-80 disabled:opacity-40"
                  >
                    <Send className="size-4" aria-hidden />
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
