/**
 * Club feed: composer and the club's posts (Corsia cards).
 */

import { useId, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { MessageCircle, Plus, ImagePlus, X, PencilLine, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { errorToastMessage } from "@/lib/trpc-errors";
import { toast } from "sonner";
import { motion } from "framer-motion";
import PostReactions from "@/components/PostReactions";
import { EditPostSheet } from "@/components/social/EditPostSheet";
import { MentionTextarea } from "@/components/social/MentionTextarea";
import { LoadError, LoadingSkeleton } from "@/components/corsia/LoadState";
import {
  isVideoUrl,
  MAX_POST_MEDIA_ITEMS,
  validatePostMediaFile,
  type PostMediaKind,
} from "@/lib/post-media";
import { uploadVideoToCloudinary } from "@/lib/cloudinary-upload";
import { extractFirstUrl, LinkPreviewCard, renderSocialText } from "@/lib/social-content";
import { pickedMentionIds, taggedUsersNotInText, type MentionUser } from "@/lib/mentions";
import { formatTimeAgo } from "@/lib/format";

interface ClubFeedTabProps {
  clubId: number;
  isMember?: boolean;
}

type SelectedMedia = {
  id: string;
  file: File;
  previewUrl: string;
  kind: PostMediaKind;
};

function normalizeArrayField(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item)).filter((item) => item.trim().length > 0);
  }
  if (typeof raw === "string" && raw.startsWith("{") && raw.endsWith("}")) {
    return raw
      .slice(1, -1)
      .split(",")
      .map((item) => item.replace(/^"|"$/g, "").trim())
      .filter((item) => item.length > 0);
  }
  return [];
}

function parseTaggedUsers(raw: unknown): Array<{ user_id: number; name?: string | null; username?: string | null }> {
  if (Array.isArray(raw)) return raw as Array<{ user_id: number; name?: string | null; username?: string | null }>;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as Array<{ user_id: number; name?: string | null; username?: string | null }>;
    } catch {
      return [];
    }
  }
  return [];
}

export default function ClubFeedTab({ clubId, isMember }: ClubFeedTabProps) {
  const composerTitleId = useId();
  const [postText, setPostText] = useState("");
  const [openCommentsId, setOpenCommentsId] = useState<number | null>(null);
  const [commentTextByPost, setCommentTextByPost] = useState<Record<number, string>>({});
  const [mediaItems, setMediaItems] = useState<SelectedMedia[]>([]);
  const [openMediaUrl, setOpenMediaUrl] = useState<string | null>(null);
  const [mentions, setMentions] = useState<MentionUser[]>([]);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);

  const postFirstLink = useMemo(() => extractFirstUrl(postText), [postText]);

  const utils = trpc.useUtils();

  const feedQuery = trpc.community.clubs.feed.useQuery(
    { clubId, limit: 20 },
    { enabled: !!clubId && isMember }
  );
  const profileQuery = trpc.profile.get.useQuery(undefined, { staleTime: 5 * 60_000 });
  const autoplayVideos = (() => {
    const value = (profileQuery.data?.preferences as Record<string, unknown> | null | undefined)?.autoplayVideos;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return value.toLowerCase() !== "false";
    if (typeof value === "number") return value !== 0;
    return true;
  })();

  const imageKitAuth = trpc.community.postImageKitAuth.useMutation();
  const cloudinaryVideoAuth = trpc.community.cloudinaryVideoAuth.useMutation();

  const createPostMutation = trpc.community.clubs.createPost.useMutation({
    onSuccess: (data: any) => {
      toast.success("Post pubblicato!");
      resetComposer();
      utils.community.clubs.feed.invalidate({ clubId });
      if (Number(data?.actionXp?.awardedXp ?? 0) > 0) {
        toast.success(`+${data.actionXp.awardedXp} XP`);
      }
    },
    onError: (error) => {
      toast.error(errorToastMessage(error, "Errore nella pubblicazione"));
    },
  });

  const addCommentMutation = trpc.community.addComment.useMutation({
    onSuccess: (data: any) => {
      toast.success("Commento aggiunto!");
      setCommentTextByPost({});
      utils.community.comments.invalidate();
      utils.community.clubs.feed.invalidate({ clubId });
      if (Number(data?.actionXp?.awardedXp ?? 0) > 0) {
        toast.success(`+${data.actionXp.awardedXp} XP`);
      }
    },
  });

  const [deletingPostId, setDeletingPostId] = useState<number | null>(null);
  const [editingPostId, setEditingPostId] = useState<number | null>(null);
  const deletePostMutation = trpc.community.deletePost.useMutation({
    onSuccess: () => {
      toast.success("Post eliminato");
      setDeletingPostId(null);
      utils.community.clubs.feed.invalidate({ clubId });
      utils.community.feed.invalidate();
    },
    onError: (error) => {
      setDeletingPostId(null);
      toast.error(errorToastMessage(error, "Impossibile eliminare il post"));
    },
  });

  const commentsQuery = trpc.community.comments.useQuery(
    { postId: openCommentsId || 0 },
    { enabled: !!openCommentsId }
  );

  const clearMediaPreviews = () => {
    mediaItems.forEach((item) => {
      if (item.previewUrl.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl);
    });
  };

  const resetComposer = () => {
    clearMediaPreviews();
    setPostText("");
    setMediaItems([]);
    setMentions([]);
    if (mediaInputRef.current) mediaInputRef.current.value = "";
  };

  const handlePickMedia = (filesList: FileList | null) => {
    if (!filesList) return;
    const incoming = Array.from(filesList);
    if (!incoming.length) return;

    const availableSlots = MAX_POST_MEDIA_ITEMS - mediaItems.length;
    if (availableSlots <= 0) {
      toast.error(`Puoi allegare al massimo ${MAX_POST_MEDIA_ITEMS} media.`);
      return;
    }

    const accepted: SelectedMedia[] = [];
    incoming.slice(0, availableSlots).forEach((file) => {
      const validation = validatePostMediaFile(file);
      if (!validation.ok) {
        toast.error(validation.message);
        return;
      }
      accepted.push({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        kind: validation.kind,
      });
    });

    if (accepted.length) {
      setMediaItems((prev) => [...prev, ...accepted]);
    }
  };

  const removeMedia = (id: string) => {
    setMediaItems((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl.startsWith("blob:")) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  };

  const uploadMediaToImageKit = async (file: File) => {
    const auth = await imageKitAuth.mutateAsync();
    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileName = `club-post-${Date.now()}-${safeFileName}`;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("fileName", fileName);
    formData.append("publicKey", auth.publicKey);
    formData.append("token", auth.token);
    formData.append("signature", auth.signature);
    formData.append("expire", String(auth.expire));
    formData.append("folder", auth.folder);
    formData.append("useUniqueFileName", "true");
    formData.append("tags", `club-post,club-${clubId},swimforge`);

    const response = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      let detail = "";
      try {
        const payload = (await response.json()) as { message?: string; help?: string };
        detail = payload.message || payload.help || "";
      } catch {
        detail = await response.text().catch(() => "");
      }
      throw new Error(detail || "Upload media fallito");
    }

    const uploaded = (await response.json()) as { url?: string };
    if (!uploaded.url) throw new Error("ImageKit non ha restituito un URL valido");
    return uploaded.url;
  };

  const uploadMedia = async (file: File, kind: PostMediaKind) => {
    if (kind === "video") {
      const auth = await cloudinaryVideoAuth.mutateAsync({ scope: "posts" });
      if (auth.warning) {
        toast.warning(auth.warning);
      }
      const uploaded = await uploadVideoToCloudinary(file, auth);
      return uploaded.url;
    }
    return uploadMediaToImageKit(file);
  };

  const handlePostSubmit = async () => {
    const hasText = postText.trim().length > 0;
    const hasMedia = mediaItems.length > 0;
    if (!hasText && !hasMedia) return;
    try {
      const uploadedMediaUrls: string[] = [];
      for (const media of mediaItems) {
        const url = await uploadMedia(media.file, media.kind);
        uploadedMediaUrls.push(url);
      }

      await createPostMutation.mutateAsync({
        clubId,
        content: hasText ? postText.trim() : null,
        mediaUrls: uploadedMediaUrls,
        mediaUrl: uploadedMediaUrls[0] ?? null,
        taggedUserIds: pickedMentionIds(postText, mentions),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore nella pubblicazione";
      toast.error(message);
    }
  };

  const handleAddComment = (postId: number) => {
    const content = commentTextByPost[postId];
    if (!content?.trim()) return;
    addCommentMutation.mutate({ postId, content });
  };

  if (!isMember) {
    return (
      <p className="surface-panel p-4 text-center text-sm text-muted-foreground">
        Unisciti al club per vedere il feed.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <section aria-labelledby={composerTitleId} className="surface-panel space-y-3 p-4">
        <h3 id={composerTitleId} className="sr-only">
          Nuovo post nel club
        </h3>
        <MentionTextarea
          aria-label="Testo del post"
          placeholder="Condividi qualcosa con il club…"
          value={postText}
          onValueChange={setPostText}
          mentions={mentions}
          onMentionsChange={setMentions}
          className="min-h-[100px]"
        />

        {postFirstLink ? <LinkPreviewCard url={postFirstLink} className="mb-1" /> : null}

        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => mediaInputRef.current?.click()}>
            <ImagePlus className="size-4" />
            Aggiungi foto/video
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">{mediaItems.length}/{MAX_POST_MEDIA_ITEMS} media</span>
        </div>
        <input
          ref={mediaInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,video/x-m4v"
          className="hidden"
          onChange={(e) => {
            handlePickMedia(e.target.files);
            if (mediaInputRef.current) mediaInputRef.current.value = "";
          }}
        />

        {mediaItems.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {mediaItems.map((item) => (
              <div key={item.id} className="relative overflow-hidden rounded-xl bg-raised">
                {item.kind === "video" || isVideoUrl(item.previewUrl) ? (
                  <video src={item.previewUrl} className="h-28 w-full object-cover" muted controls playsInline />
                ) : (
                  <img src={item.previewUrl} alt="Anteprima media" className="h-28 w-full object-cover" loading="lazy" />
                )}
                <button
                  type="button"
                  onClick={() => removeMedia(item.id)}
                  className="absolute right-2 top-2 rounded-full bg-background/80 p-1.5 text-foreground"
                  aria-label="Rimuovi media"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end">
          <Button
            onClick={() => void handlePostSubmit()}
            disabled={
              (!postText.trim() && mediaItems.length === 0) ||
              createPostMutation.isPending ||
              imageKitAuth.isPending ||
              cloudinaryVideoAuth.isPending
            }
          >
            <Plus aria-hidden />
            {createPostMutation.isPending || imageKitAuth.isPending || cloudinaryVideoAuth.isPending
              ? "Pubblicazione…"
              : "Pubblica"}
          </Button>
        </div>
      </section>

      {feedQuery.isLoading ? (
        <LoadingSkeleton label="Caricamento dei post…" count={2} itemClassName="h-40 w-full rounded-2xl" />
      ) : !feedQuery.data && feedQuery.isError ? (
        <LoadError onRetry={() => void feedQuery.refetch()} />
      ) : !feedQuery.data || feedQuery.data.length === 0 ? (
        <div className="surface-panel p-4 text-center">
          <p className="text-sm font-semibold">Nessun post ancora.</p>
          <p className="mt-1 text-sm text-muted-foreground">Scrivi il primo post del club.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {feedQuery.data.map((post: any, index: number) => {
            const isOwnPost = Number(profileQuery.data?.userId ?? 0) === Number(post.user_id);
            const mediaUrls = normalizeArrayField(post.media_urls);
            const allMedia = mediaUrls.length > 0
              ? mediaUrls
              : (post.media_url ? [String(post.media_url)] : []);
            const taggedUsersForPost = parseTaggedUsers(post.tagged_users);
            // Mentions are links in the text; people tagged apart (older posts) stay as chips.
            const taggedApartForPost = taggedUsersNotInText(post.content, taggedUsersForPost);
            const firstLinkForPost = post.content ? extractFirstUrl(post.content) : null;

            return (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <article className="surface-panel p-4">
                  <div className="mb-3 flex items-center gap-3">
                    <Avatar className="size-11">
                      <AvatarImage src={post.user_avatar || undefined} alt="" />
                      <AvatarFallback className="text-sm font-semibold">
                        {post.user_name?.[0]?.toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold">{post.user_name || "Utente"}</p>
                      <p className="text-sm text-muted-foreground">{formatTimeAgo(post.created_at)}</p>
                    </div>
                    {isOwnPost ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Modifica post"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => setEditingPostId(post.id)}
                      >
                        <PencilLine aria-hidden />
                      </Button>
                    ) : null}
                    {isOwnPost ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Elimina post"
                        className="text-muted-foreground hover:text-danger"
                        disabled={deletePostMutation.isPending && deletingPostId === post.id}
                        onClick={() => {
                          const confirmed = window.confirm("Eliminare questo post? Sparisce per tutti.");
                          if (!confirmed) return;
                          setDeletingPostId(post.id);
                          deletePostMutation.mutate({ postId: post.id });
                        }}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                  {post.content && (
                    <p className="mb-3 whitespace-pre-wrap text-[15px]">{renderSocialText(post.content, { mentions: taggedUsersForPost })}</p>
                  )}
                  {firstLinkForPost ? (
                    <LinkPreviewCard url={firstLinkForPost} className="mb-3" />
                  ) : null}

                  {taggedApartForPost.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {taggedApartForPost.map((user) => (
                        <Link
                          key={user.user_id}
                          href={`/u/${user.user_id}`}
                          className="inline-flex h-7 items-center rounded-full bg-raised px-3 text-xs font-semibold text-action-text hover:bg-raised/70"
                        >
                          @{user.username || user.name || `u${user.user_id}`}
                        </Link>
                      ))}
                    </div>
                  )}

                  {allMedia.length > 0 && (
                    <div className={`mb-3 grid gap-1 overflow-hidden rounded-xl ${allMedia.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                      {allMedia.map((url, mediaIndex) => (
                        <div key={`${url}-${mediaIndex}`} className="bg-raised">
                          {isVideoUrl(url) ? (
                            <video
                              src={url}
                              className="max-h-[360px] w-full object-cover"
                              controls
                              playsInline
                              preload="metadata"
                              autoPlay={autoplayVideos}
                              muted={autoplayVideos}
                              loop={autoplayVideos}
                            />
                          ) : (
                            <button
                              type="button"
                              className="block w-full cursor-zoom-in"
                              onClick={() => setOpenMediaUrl(url)}
                            >
                              <img
                                src={url}
                                alt="Media del post"
                                className="max-h-[360px] w-full object-cover"
                                loading="lazy"
                              />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Commenti: ${post.comment_count || 0}`}
                      aria-expanded={openCommentsId === post.id}
                      onClick={() => setOpenCommentsId(openCommentsId === post.id ? null : post.id)}
                    >
                      <MessageCircle aria-hidden />
                      <span className="tabular-nums">{post.comment_count || 0}</span>
                    </Button>
                    <PostReactions
                      postId={post.id}
                      onReactionChange={() => {
                        utils.community.clubs.feed.invalidate({ clubId });
                      }}
                    />
                  </div>

                  {openCommentsId === post.id && (
                    <div className="mt-3 space-y-3 border-t border-border pt-3">
                      {commentsQuery.data?.map((comment: any) => (
                        <div key={comment.id} className="flex gap-2">
                          <Avatar className="size-8">
                            <AvatarImage src={comment.user_avatar || undefined} alt="" />
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
                          aria-label="Commento"
                          placeholder="Aggiungi un commento…"
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
                </article>
              </motion.div>
            );
          })}
        </div>
      )}

      <Dialog open={Boolean(openMediaUrl)} onOpenChange={(open) => !open && setOpenMediaUrl(null)}>
        <DialogContent className="max-w-5xl border-border bg-background p-2">
          <DialogTitle className="sr-only">Anteprima immagine</DialogTitle>
          <DialogDescription className="sr-only">Visualizzazione dell'immagine del post.</DialogDescription>
          {openMediaUrl ? (
            <img
              src={openMediaUrl}
              alt="Anteprima immagine del post club"
              className="max-h-[82vh] w-full rounded-xl object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
      {editingPostId ? (
        <EditPostSheet
          open
          onOpenChange={(open) => !open && setEditingPostId(null)}
          postRef={{ postId: editingPostId }}
        />
      ) : null}
    </div>
  );
}
