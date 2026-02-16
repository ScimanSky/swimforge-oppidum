/**
 * Club Feed Tab - Il feed dei post del club (riutilizza logica esistente)
 */

import { useState } from "react";
import { Surface, SurfaceContent } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { MessageCircle, Plus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { motion } from "framer-motion";
import PostReactions from "@/components/PostReactions";

interface ClubFeedTabProps {
  clubId: number;
  isMember?: boolean;
}

export default function ClubFeedTab({ clubId, isMember }: ClubFeedTabProps) {
  const [postText, setPostText] = useState("");
  const [openCommentsId, setOpenCommentsId] = useState<number | null>(null);
  const [commentTextByPost, setCommentTextByPost] = useState<Record<number, string>>({});
  
  const utils = trpc.useUtils();
  
  const feedQuery = trpc.community.clubs.feed.useQuery(
    { clubId, limit: 20 },
    { enabled: !!clubId }
  );

  const createPostMutation = trpc.community.clubs.createPost.useMutation({
    onSuccess: (data: any) => {
      toast.success("Post pubblicato!");
      setPostText("");
      utils.community.clubs.feed.invalidate({ clubId });
      if (Number(data?.actionXp?.awardedXp ?? 0) > 0) {
        toast.success(`+${data.actionXp.awardedXp} XP Action`);
      }
    },
  });

  const addCommentMutation = trpc.community.addComment.useMutation({
    onSuccess: (data: any) => {
      toast.success("Commento aggiunto!");
      setCommentTextByPost({});
      utils.community.comments.invalidate();
      utils.community.clubs.feed.invalidate({ clubId });
      if (Number(data?.actionXp?.awardedXp ?? 0) > 0) {
        toast.success(`+${data.actionXp.awardedXp} XP Action`);
      }
    },
  });

  const commentsQuery = trpc.community.comments.useQuery(
    { postId: openCommentsId || 0 },
    { enabled: !!openCommentsId }
  );

  const handlePostSubmit = () => {
    if (!postText.trim()) return;
    createPostMutation.mutate({
      clubId,
      content: postText,
    });
  };

  const handleAddComment = (postId: number) => {
    const content = commentTextByPost[postId];
    if (!content?.trim()) return;
    addCommentMutation.mutate({ postId, content });
  };

  if (!isMember) {
    return (
      <Surface>
        <SurfaceContent className="p-8 text-center">
          <MessageCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">
            Unisciti al club per vedere il feed
          </p>
        </SurfaceContent>
      </Surface>
    );
  }

  return (
    <div className="space-y-4">
      {/* Create Post */}
      <Surface>
        <SurfaceContent className="p-4">
          <Textarea
            placeholder="Condividi qualcosa con il club..."
            value={postText}
            onChange={(e) => setPostText(e.target.value)}
            className="min-h-[100px] mb-3"
          />
          <div className="flex justify-end">
            <Button
              onClick={handlePostSubmit}
              disabled={!postText.trim() || createPostMutation.isPending}
            >
              <Plus className="mr-2 h-4 w-4" />
              Pubblica
            </Button>
          </div>
        </SurfaceContent>
      </Surface>

      {/* Feed */}
      {feedQuery.isLoading ? (
        <Surface>
          <SurfaceContent className="p-8 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </SurfaceContent>
        </Surface>
      ) : !feedQuery.data || feedQuery.data.length === 0 ? (
        <Surface>
          <SurfaceContent className="p-8 text-center">
            <MessageCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Nessun post ancora</p>
            <p className="text-sm text-muted-foreground mt-2">
              Sii il primo a condividere qualcosa!
            </p>
          </SurfaceContent>
        </Surface>
      ) : (
        <div className="space-y-4">
          {feedQuery.data.map((post: any, index: number) => (
            <motion.div
              key={post.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Surface>
                <SurfaceContent className="p-6">
                  <div className="flex items-start gap-3 mb-4">
                    <Avatar>
                      <AvatarImage src={post.user_avatar || undefined} />
                      <AvatarFallback>
                        {post.user_name?.[0]?.toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-semibold">{post.user_name || "Utente"}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(post.created_at).toLocaleDateString("it-IT")}
                      </p>
                    </div>
                  </div>
                  {post.content && (
                    <p className="text-sm mb-4 whitespace-pre-wrap">{post.content}</p>
                  )}
                  <div className="flex items-center gap-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setOpenCommentsId(openCommentsId === post.id ? null : post.id)}
                    >
                      <MessageCircle className="mr-1 h-4 w-4" />
                      {post.comment_count || 0}
                    </Button>
                    <PostReactions
                      postId={post.id}
                      onReactionChange={() => {
                        utils.community.clubs.feed.invalidate({ clubId });
                      }}
                    />
                  </div>
                  
                  {/* Comments Section */}
                  {openCommentsId === post.id && (
                    <div className="mt-4 pt-4 border-t space-y-3">
                      {commentsQuery.data?.map((comment: any) => (
                        <div key={comment.id} className="flex gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={comment.user_avatar || undefined} />
                            <AvatarFallback>
                              {comment.user_name?.[0]?.toUpperCase() || "U"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <p className="text-sm font-semibold">{comment.user_name}</p>
                            <p className="text-sm">{comment.content}</p>
                          </div>
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <Textarea
                          placeholder="Aggiungi un commento..."
                          value={commentTextByPost[post.id] || ""}
                          onChange={(e) =>
                            setCommentTextByPost({ ...commentTextByPost, [post.id]: e.target.value })
                          }
                          className="min-h-[60px]"
                        />
                        <Button
                          onClick={() => handleAddComment(post.id)}
                          disabled={!commentTextByPost[post.id]?.trim()}
                        >
                          Invia
                        </Button>
                      </div>
                    </div>
                  )}
                </SurfaceContent>
              </Surface>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
