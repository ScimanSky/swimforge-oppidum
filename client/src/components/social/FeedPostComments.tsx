import { useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AnimatePresence, motion } from "framer-motion"
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
          <div className="mt-4 rounded-2xl border border-border bg-background/60 p-4 space-y-3">
            <div className="space-y-3">
              {commentsQuery.isLoading ? (
                <div className="text-sm text-muted-foreground">Caricamento...</div>
              ) : (commentsQuery.data ?? []).length > 0 ? (
                (commentsQuery.data ?? []).slice(0, 3).map((comment: any) => (
                  <div key={comment.id} className="flex items-start gap-2">
                    <Avatar className="h-8 w-8 border border-border">
                      <AvatarImage src={comment.user_avatar || ""} />
                      <AvatarFallback>
                        {getInitials(comment.user_name || comment.user_email || "SW")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground truncate">
                        {comment.user_name || comment.user_email}
                      </p>
                      <p className="text-sm text-foreground">{comment.content}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">Nessun commento ancora.</div>
              )}
              {(commentsQuery.data ?? []).length > 3 && (
                <p className="text-xs text-primary cursor-pointer hover:underline">
                  Vedi tutti i {(commentsQuery.data ?? []).length} commenti
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="Scrivi un commento..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    submitComment()
                  }
                }}
                className="bg-background/70"
              />
              <Button
                variant="neon"
                onClick={submitComment}
                disabled={addComment.isPending || !commentText.trim()}
              >
                Invia
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
