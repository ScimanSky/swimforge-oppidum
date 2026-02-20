"use client"

import { useMemo, useRef, useState } from "react"
import { trpc } from "@/lib/trpc"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Activity, Camera, ChevronLeft, Loader2, PenLine, X, Hash, AtSign, ImagePlus } from "lucide-react"
import { toast } from "sonner"
import { ShareActivityPicker } from "./ShareActivityPicker"
import { StoryCreator } from "./StoryCreator"
import { UploadStatusPill } from "./UploadStatusPill"
import {
  extractHashtags,
  isVideoUrl,
  MAX_POST_MEDIA_ITEMS,
  validatePostMediaFile,
  type PostMediaKind,
} from "@/lib/post-media"
import { uploadVideoToCloudinary } from "@/lib/cloudinary-upload"
import { uploadPostImageWithFallback } from "@/lib/post-image-upload"

interface CreatePostSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Mode = "menu" | "text"

type SelectedMedia = {
  id: string
  file: File
  previewUrl: string
  kind: PostMediaKind
}

type TaggedUser = {
  userId: number
  name: string | null
  username: string | null
  avatarUrl: string | null
}

export function CreatePostSheet({ open, onOpenChange }: CreatePostSheetProps) {
  const [mode, setMode] = useState<Mode>("menu")
  const [content, setContent] = useState("")
  const [mediaItems, setMediaItems] = useState<SelectedMedia[]>([])
  const [tagQuery, setTagQuery] = useState("")
  const [taggedUsers, setTaggedUsers] = useState<TaggedUser[]>([])
  const [sharePickerOpen, setSharePickerOpen] = useState(false)
  const [storyCreatorOpen, setStoryCreatorOpen] = useState(false)

  const mediaInputRef = useRef<HTMLInputElement>(null)

  const utils = trpc.useUtils()
  const imageKitAuth = trpc.community.postImageKitAuth.useMutation()
  const postImageUpload = trpc.community.postUploadImage.useMutation()
  const cloudinaryVideoAuth = trpc.community.cloudinaryVideoAuth.useMutation()

  const searchEnabled = mode === "text" && tagQuery.trim().length >= 2
  const tagSearchQuery = trpc.community.users.search.useQuery(
    { query: tagQuery.trim(), limit: 8 },
    { enabled: searchEnabled }
  )

  const createTextPost = trpc.community.createTextPost.useMutation({
    onSuccess: () => {
      utils.community.feed.invalidate()
      toast.success("Post pubblicato!")
      resetAndClose()
    },
    onError: (error) => {
      toast.error(error.message || "Errore nella pubblicazione")
    },
  })

  const hashtags = useMemo(() => extractHashtags(content), [content])
  const hasContent = content.trim().length > 0
  const hasMedia = mediaItems.length > 0

  const clearMediaPreviews = () => {
    mediaItems.forEach((item) => {
      if (item.previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(item.previewUrl)
      }
    })
  }

  const resetAndClose = () => {
    clearMediaPreviews()
    setMode("menu")
    setContent("")
    setMediaItems([])
    setTagQuery("")
    setTaggedUsers([])
    if (mediaInputRef.current) mediaInputRef.current.value = ""
    onOpenChange(false)
  }

  const handlePickMedia = (filesList: FileList | null) => {
    if (!filesList) return

    const incoming = Array.from(filesList)
    if (!incoming.length) return

    const availableSlots = MAX_POST_MEDIA_ITEMS - mediaItems.length
    if (availableSlots <= 0) {
      toast.error(`Puoi allegare al massimo ${MAX_POST_MEDIA_ITEMS} media.`)
      return
    }

    const accepted: SelectedMedia[] = []
    incoming.slice(0, availableSlots).forEach((file) => {
      const validation = validatePostMediaFile(file)
      if (!validation.ok) {
        toast.error(validation.message)
        return
      }
      accepted.push({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        kind: validation.kind,
      })
    })

    if (accepted.length) {
      setMediaItems((prev) => [...prev, ...accepted])
    }
  }

  const removeMedia = (id: string) => {
    setMediaItems((prev) => {
      const target = prev.find((item) => item.id === id)
      if (target?.previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(target.previewUrl)
      }
      return prev.filter((item) => item.id !== id)
    })
  }

  const addTaggedUser = (user: any) => {
    const normalized: TaggedUser = {
      userId: Number(user.userId),
      name: user.name ?? null,
      username: user.username ?? null,
      avatarUrl: user.avatarUrl ?? null,
    }
    if (!normalized.userId) return

    setTaggedUsers((prev) => {
      if (prev.some((item) => item.userId === normalized.userId)) {
        return prev
      }
      return [...prev, normalized].slice(0, 10)
    })
    setTagQuery("")
  }

  const removeTaggedUser = (userId: number) => {
    setTaggedUsers((prev) => prev.filter((item) => item.userId !== userId))
  }

  const uploadMediaToImageKit = async (file: File) => {
    const auth = await imageKitAuth.mutateAsync()
    return uploadPostImageWithFallback({
      file,
      auth,
      uploadFallback: (payload) => postImageUpload.mutateAsync(payload),
      onFallbackUsed: () => {
        toast.warning("Upload diretto non riuscito: usato fallback server.")
      },
    })
  }

  const uploadMedia = async (file: File, kind: PostMediaKind) => {
    if (kind === "video") {
      const auth = await cloudinaryVideoAuth.mutateAsync({ scope: "posts" })
      if (auth.warning) {
        toast.warning(auth.warning)
      }
      const uploaded = await uploadVideoToCloudinary(file, auth)
      return uploaded.url
    }
    return uploadMediaToImageKit(file)
  }

  const handleSubmitText = async () => {
    if (!hasContent && !hasMedia) return

    try {
      const uploadedMediaUrls: string[] = []
      for (const media of mediaItems) {
        const uploadedUrl = await uploadMedia(media.file, media.kind)
        uploadedMediaUrls.push(uploadedUrl)
      }

      await createTextPost.mutateAsync({
        content: hasContent ? content.trim() : null,
        mediaUrls: uploadedMediaUrls,
        mediaUrl: uploadedMediaUrls[0] ?? null,
        taggedUserIds: taggedUsers.map((user) => user.userId),
        hashtags,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore nella pubblicazione"
      toast.error(message)
    }
  }

  const isPostPending =
    createTextPost.isPending ||
    imageKitAuth.isPending ||
    postImageUpload.isPending ||
    cloudinaryVideoAuth.isPending

  const openStoryComposer = () => {
    resetAndClose()
    window.setTimeout(() => setStoryCreatorOpen(true), 180)
  }

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(o) => {
          if (!o) resetAndClose()
          else onOpenChange(o)
        }}
      >
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[88dvh] overflow-y-auto">
          <SheetHeader>
            {mode === "text" ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMode("menu")}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <SheetTitle>Nuovo Post</SheetTitle>
              </div>
            ) : (
              <>
                <SheetTitle>Crea</SheetTitle>
                <SheetDescription>Cosa vuoi condividere?</SheetDescription>
              </>
            )}
          </SheetHeader>

          {mode === "menu" ? (
            <div className="flex flex-col gap-3 px-4 pb-4">
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false)
                  setTimeout(() => setSharePickerOpen(true), 200)
                }}
                className="flex items-center gap-4 rounded-2xl border border-border/80 bg-background/60 p-4 text-left transition-colors hover:bg-card/60"
              >
                <div className="flex size-12 items-center justify-center rounded-xl bg-[color-mix(in_oklch,var(--electric-cyan)_15%,transparent)]">
                  <Activity className="size-6 text-[var(--electric-cyan)]" />
                </div>
                <div>
                  <div className="font-semibold">Condividi Attivita</div>
                  <div className="text-sm text-muted-foreground">Condividi un allenamento recente</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMode("text")}
                className="flex items-center gap-4 rounded-2xl border border-border/80 bg-background/60 p-4 text-left transition-colors hover:bg-card/60"
              >
                <div className="flex size-12 items-center justify-center rounded-xl bg-[color-mix(in_oklch,var(--electric-lime)_15%,transparent)]">
                  <PenLine className="size-6 text-[var(--electric-lime)]" />
                </div>
                <div>
                  <div className="font-semibold">Nuovo Post</div>
                  <div className="text-sm text-muted-foreground">Testo, foto, video, tag amici e hashtag</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  openStoryComposer()
                }}
                className="flex items-center gap-4 rounded-2xl border border-border/80 bg-background/60 p-4 text-left transition-colors hover:bg-card/60"
              >
                <div className="flex size-12 items-center justify-center rounded-xl bg-[color-mix(in_oklch,var(--electric-cyan)_15%,var(--electric-lime)_10%)]">
                  <Camera className="size-6 text-foreground/70" />
                </div>
                <div>
                  <div className="font-semibold">Nuova Storia</div>
                  <div className="text-sm text-muted-foreground">Condividi un momento (24h)</div>
                </div>
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4 px-4 pb-4">
              {isPostPending ? <UploadStatusPill label="Upload post in corso" className="w-fit" /> : null}
              <Textarea
                placeholder="Scrivi qualcosa..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                maxLength={2000}
                className="min-h-[120px] resize-none"
                rows={5}
                autoFocus
              />

              <div className="flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline-neon"
                  size="sm"
                  className="gap-2"
                  onClick={() => mediaInputRef.current?.click()}
                >
                  <ImagePlus className="size-4" />
                  Aggiungi foto/video
                </Button>
                <span className="text-xs text-muted-foreground">
                  {mediaItems.length}/{MAX_POST_MEDIA_ITEMS} media
                </span>
              </div>
              <input
                ref={mediaInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,video/x-m4v"
                className="hidden"
                onChange={(e) => {
                  handlePickMedia(e.target.files)
                  if (mediaInputRef.current) mediaInputRef.current.value = ""
                }}
              />

              {mediaItems.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {mediaItems.map((item) => (
                    <div key={item.id} className="relative overflow-hidden rounded-xl border border-border/70 bg-background/40">
                      {item.kind === "video" || isVideoUrl(item.previewUrl) ? (
                        <video src={item.previewUrl} className="h-36 w-full object-cover" muted controls playsInline />
                      ) : (
                        <img src={item.previewUrl} alt="Anteprima media" className="h-36 w-full object-cover" loading="lazy" />
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

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{content.length}/2000</span>
                <Button
                  variant="neon"
                  onClick={() => void handleSubmitText()}
                  disabled={(!hasContent && !hasMedia) || isPostPending}
                >
                  {isPostPending ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="size-4 animate-spin" />
                      Pubblico
                    </span>
                  ) : "Pubblica"}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <ShareActivityPicker open={sharePickerOpen} onOpenChange={setSharePickerOpen} />
      <StoryCreator open={storyCreatorOpen} onOpenChange={setStoryCreatorOpen} />
    </>
  )
}
