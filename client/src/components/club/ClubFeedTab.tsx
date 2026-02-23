/**
 * Club Feed Tab - Il feed dei post del club
 */

import { ReactNode, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Surface, SurfaceContent } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { MessageCircle, Plus, ImagePlus, X, AtSign, Hash, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { motion } from "framer-motion";
import PostReactions from "@/components/PostReactions";
import {
  extractHashtags,
  isVideoUrl,
  MAX_POST_MEDIA_ITEMS,
  validatePostMediaFile,
  type PostMediaKind,
} from "@/lib/post-media";
import { uploadVideoToCloudinary } from "@/lib/cloudinary-upload";

interface ClubFeedTabProps {
  clubId: number;
  isMember?: boolean;
  afterComposerSlot?: ReactNode;
}

type SelectedMedia = {
  id: string;
  file: File;
  previewUrl: string;
  kind: PostMediaKind;
};

type TaggedUser = {
  userId: number;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
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

function renderPostContent(content: string) {
  const parts = content.split(/(#[A-Za-z0-9_]{2,40}|@[A-Za-z0-9_]{2,40})/g);
  return parts.map((part, idx) => {
    if (/^#[A-Za-z0-9_]{2,40}$/.test(part)) {
      return (
        <span key={`${part}-${idx}`} className="font-medium text-[var(--electric-cyan)]">
          {part}
        </span>
      );
    }
    if (/^@[A-Za-z0-9_]{2,40}$/.test(part)) {
      return (
        <span key={`${part}-${idx}`} className="font-medium text-[var(--electric-lime)]">
          {part}
        </span>
      );
    }
    return <span key={`${part}-${idx}`}>{part}</span>;
  });
}

export default function ClubFeedTab({ clubId, isMember, afterComposerSlot }: ClubFeedTabProps) {
  const [postText, setPostText] = useState("");
  const [openCommentsId, setOpenCommentsId] = useState<number | null>(null);
  const [commentTextByPost, setCommentTextByPost] = useState<Record<number, string>>({});
  const [mediaItems, setMediaItems] = useState<SelectedMedia[]>([]);
  const [openMediaUrl, setOpenMediaUrl] = useState<string | null>(null);
  const [tagQuery, setTagQuery] = useState("");
  const [taggedUsers, setTaggedUsers] = useState<TaggedUser[]>([]);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);

  const hashtags = useMemo(() => extractHashtags(postText), [postText]);

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
  const tagSearchEnabled = isMember && tagQuery.trim().length >= 2;
  const tagSearchQuery = trpc.community.users.search.useQuery(
    { query: tagQuery.trim(), limit: 8 },
    { enabled: !!tagSearchEnabled }
  );

  const createPostMutation = trpc.community.clubs.createPost.useMutation({
    onSuccess: (data: any) => {
      toast.success("Post pubblicato!");
      resetComposer();
      utils.community.clubs.feed.invalidate({ clubId });
      if (Number(data?.actionXp?.awardedXp ?? 0) > 0) {
        toast.success(`+${data.actionXp.awardedXp} XP Action`);
      }
    },
    onError: (error) => {
      toast.error(error.message || "Errore nella pubblicazione");
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

  const [deletingPostId, setDeletingPostId] = useState<number | null>(null);
  const deletePostMutation = trpc.community.deletePost.useMutation({
    onSuccess: () => {
      toast.success("Post eliminato");
      setDeletingPostId(null);
      utils.community.clubs.feed.invalidate({ clubId });
      utils.community.feed.invalidate();
    },
    onError: (error) => {
      setDeletingPostId(null);
      toast.error(error.message || "Impossibile eliminare il post");
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
    setTagQuery("");
    setTaggedUsers([]);
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

  const addTaggedUser = (user: any) => {
    const normalized: TaggedUser = {
      userId: Number(user.userId),
      name: user.name ?? null,
      username: user.username ?? null,
      avatarUrl: user.avatarUrl ?? null,
    };
    if (!normalized.userId) return;
    setTaggedUsers((prev) => {
      if (prev.some((item) => item.userId === normalized.userId)) return prev;
      return [...prev, normalized].slice(0, 10);
    });
    setTagQuery("");
  };

  const removeTaggedUser = (userId: number) => {
    setTaggedUsers((prev) => prev.filter((item) => item.userId !== userId));
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
        taggedUserIds: taggedUsers.map((user) => user.userId),
        hashtags,
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
      <Surface>
        <SurfaceContent className="p-4 space-y-3">
          <Textarea
            placeholder="Condividi qualcosa con il club..."
            value={postText}
            onChange={(e) => setPostText(e.target.value)}
            className="min-h-[100px]"
          />

          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="outline-neon" size="sm" className="gap-2" onClick={() => mediaInputRef.current?.click()}>
              <ImagePlus className="size-4" />
              Aggiungi foto/video
            </Button>
            <span className="text-xs text-muted-foreground">{mediaItems.length}/{MAX_POST_MEDIA_ITEMS} media</span>
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
                <div key={item.id} className="relative overflow-hidden rounded-xl border border-border/70 bg-background/40">
                  {item.kind === "video" || isVideoUrl(item.previewUrl) ? (
                    <video src={item.previewUrl} className="h-28 w-full object-cover" muted controls playsInline />
                  ) : (
                    <img src={item.previewUrl} alt="Anteprima media" className="h-28 w-full object-cover" loading="lazy" />
                  )}
                  <button
                    type="button"
                    onClick={() => removeMedia(item.id)}
                    className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white"
                    aria-label="Rimuovi media"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <AtSign className="size-3.5" />
              Tagga amici
            </label>
            <Input
              placeholder="Cerca per nome o username"
              value={tagQuery}
              onChange={(e) => setTagQuery(e.target.value)}
            />
            {tagSearchQuery.data && tagQuery.trim().length >= 2 ? (
              <div className="max-h-36 overflow-y-auto rounded-xl border border-border/70 bg-background/60">
                {(tagSearchQuery.data as any[]).length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">Nessun utente trovato</p>
                ) : (
                  (tagSearchQuery.data as any[]).map((user) => (
                    <button
                      key={user.userId}
                      type="button"
                      onClick={() => addTaggedUser(user)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-card/70"
                    >
                      <Avatar className="size-7">
                        <AvatarImage src={user.avatarUrl || undefined} />
                        <AvatarFallback>{(user.name || user.username || "U").slice(0, 1).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">{user.name || "Utente"}</p>
                        <p className="truncate text-[11px] text-muted-foreground">@{user.username || `u${user.userId}`}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            ) : null}

            {taggedUsers.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {taggedUsers.map((user) => (
                  <span key={user.userId} className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-card/50 px-2 py-1 text-xs">
                    @{user.username || user.name || `u${user.userId}`}
                    <button type="button" onClick={() => removeTaggedUser(user.userId)} className="text-muted-foreground hover:text-foreground">
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {hashtags.length > 0 && (
            <div className="rounded-xl border border-border/70 bg-background/40 p-2">
              <p className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Hash className="size-3.5" />
                Hashtag rilevati
              </p>
              <div className="flex flex-wrap gap-1.5">
                {hashtags.map((tag) => (
                  <span key={tag} className="rounded-full bg-card/60 px-2 py-0.5 text-[11px] text-[var(--electric-cyan)]">
                    #{tag}
                  </span>
                ))}
              </div>
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
              <Plus className="mr-2 h-4 w-4" />
              {createPostMutation.isPending || imageKitAuth.isPending || cloudinaryVideoAuth.isPending
                ? "Pubblicazione..."
                : "Pubblica"}
            </Button>
          </div>
        </SurfaceContent>
      </Surface>

      {afterComposerSlot ? <div className="space-y-3">{afterComposerSlot}</div> : null}

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
          {feedQuery.data.map((post: any, index: number) => {
            const isOwnPost = Number(profileQuery.data?.userId ?? 0) === Number(post.user_id);
            const isActivityPost =
              Boolean(post.activity_id) ||
              Number(post.activity_distance_meters ?? 0) > 0 ||
              Number(post.activity_duration_seconds ?? 0) > 0;
            const mediaUrls = normalizeArrayField(post.media_urls);
            const allMedia = mediaUrls.length > 0
              ? mediaUrls
              : (post.media_url ? [String(post.media_url)] : []);
            const taggedUsersForPost = parseTaggedUsers(post.tagged_users);
            const hashtagsForPost = normalizeArrayField(post.hashtags);

            return (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Surface className={isActivityPost ? "overflow-hidden" : undefined}>
                  {isActivityPost && (
                    <>
                      <img
                        src="/images/theme-v3/landing-tour-poster.png"
                        alt=""
                        aria-hidden="true"
                        className="pointer-events-none !absolute inset-0 h-full w-full object-cover object-center !z-0 opacity-[0.32] saturate-[0.95] contrast-[1.04]"
                        loading="lazy"
                      />
                      <div className="pointer-events-none !absolute inset-0 !z-0 bg-[linear-gradient(104deg,color-mix(in_oklch,var(--background)_86%,transparent)_0%,color-mix(in_oklch,var(--background)_72%,transparent)_46%,color-mix(in_oklch,var(--background)_50%,transparent)_100%)]" />
                      <div className="pointer-events-none !absolute inset-0 !z-0 bg-[radial-gradient(circle_at_18%_14%,color-mix(in_oklch,var(--electric-cyan)_18%,transparent),transparent_40%),radial-gradient(circle_at_86%_12%,color-mix(in_oklch,var(--electric-lime)_14%,transparent),transparent_44%)]" />
                      <div className="pointer-events-none !absolute inset-[1px] rounded-[25px] !z-0 border border-white/10" />
                    </>
                  )}
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
                      {isOwnPost ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-destructive"
                          disabled={deletePostMutation.isPending && deletingPostId === post.id}
                          onClick={() => {
                            const confirmed = window.confirm("Eliminare questo post?");
                            if (!confirmed) return;
                            setDeletingPostId(post.id);
                            deletePostMutation.mutate({ postId: post.id });
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                    {post.content && (
                      <p className="text-sm mb-3 whitespace-pre-wrap">{renderPostContent(post.content)}</p>
                    )}

                    {taggedUsersForPost.length > 0 && (
                      <div className="mb-3 flex flex-wrap gap-2">
                        {taggedUsersForPost.map((user) => (
                          <Link
                            key={user.user_id}
                            href={`/u/${user.user_id}`}
                            className="rounded-full border border-border/70 bg-card/40 px-2 py-1 text-xs text-[var(--electric-lime)] hover:bg-card/70"
                          >
                            @{user.username || user.name || `u${user.user_id}`}
                          </Link>
                        ))}
                      </div>
                    )}

                    {allMedia.length > 0 && (
                      <div className={`mb-3 grid gap-1 overflow-hidden rounded-xl ${allMedia.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                        {allMedia.map((url, mediaIndex) => (
                          <div key={`${url}-${mediaIndex}`} className="bg-black/30">
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

                    {!post.content && hashtagsForPost.length > 0 && (
                      <div className="mb-3 flex flex-wrap gap-1.5">
                        {hashtagsForPost.map((tag) => (
                          <span key={tag} className="rounded-full bg-card/40 px-2 py-1 text-[11px] text-[var(--electric-cyan)]">
                            #{tag}
                          </span>
                        ))}
                      </div>
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
            );
          })}
        </div>
      )}

      <Dialog open={Boolean(openMediaUrl)} onOpenChange={(open) => !open && setOpenMediaUrl(null)}>
        <DialogContent className="max-w-5xl border-border/80 bg-background/95 p-2">
          <DialogTitle className="sr-only">Anteprima immagine</DialogTitle>
          <DialogDescription className="sr-only">Visualizzazione dell'immagine del post.</DialogDescription>
          {openMediaUrl ? (
            <img
              src={openMediaUrl}
              alt="Anteprima immagine del post club"
              className="max-h-[82vh] w-full rounded-lg object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
