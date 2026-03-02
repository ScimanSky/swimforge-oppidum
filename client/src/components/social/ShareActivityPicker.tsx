"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { trpc } from "@/lib/trpc"
import { formatDistance, formatDuration, formatTimeAgo } from "@/lib/format"
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
import { Waves, ChevronLeft, ImagePlus, X, AtSign, Hash } from "lucide-react"
import { toast } from "sonner"
import {
  extractHashtags,
  isVideoUrl,
  MAX_POST_MEDIA_ITEMS,
  validatePostMediaFile,
  type PostMediaKind,
} from "@/lib/post-media"
import { extractFirstUrl, LinkPreviewCard, normalizeTagSearchQuery } from "@/lib/social-content"
import { uploadActivityShareMedia } from "@/lib/activity-share-media-upload"

interface ShareActivityPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialActivityId?: number | null
  onShared?: (activityId: number) => void
}

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

export function ShareActivityPicker({
  open,
  onOpenChange,
  initialActivityId = null,
  onShared,
}: ShareActivityPickerProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [caption, setCaption] = useState("")
  const [mediaItems, setMediaItems] = useState<SelectedMedia[]>([])
  const [tagQuery, setTagQuery] = useState("")
  const [taggedUsers, setTaggedUsers] = useState<TaggedUser[]>([])
  const mediaInputRef = useRef<HTMLInputElement>(null)

  const { data: activities, isLoading } = trpc.community.unsharedActivities.useQuery(undefined, {
    enabled: open,
  })

  const utils = trpc.useUtils()
  const imageKitAuth = trpc.community.postImageKitAuth.useMutation()
  const postImageUpload = trpc.community.postUploadImage.useMutation()
  const cloudinaryVideoAuth = trpc.community.cloudinaryVideoAuth.useMutation()
  const normalizedTagQuery = useMemo(() => normalizeTagSearchQuery(tagQuery), [tagQuery])
  const tagSearchEnabled = open && !!selectedId && normalizedTagQuery.length >= 2
  const tagSearchQuery = trpc.community.users.search.useQuery(
    { query: normalizedTagQuery, limit: 8 },
    { enabled: tagSearchEnabled }
  )

  const createPost = trpc.community.createPost.useMutation({
    onSuccess: () => {
      const sharedActivityId = selectedId
      utils.community.feed.invalidate()
      utils.community.unsharedActivities.invalidate()
      toast.success("Attivita condivisa!")
      if (sharedActivityId) {
        onShared?.(sharedActivityId)
      }
      resetComposer()
      setSelectedId(null)
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(error.message || "Errore nella condivisione")
    },
  })

  const selected = activities?.find((a: any) => a.id === selectedId)
  const hashtags = useMemo(() => extractHashtags(caption), [caption])
  const firstLinkInCaption = useMemo(() => extractFirstUrl(caption), [caption])

  useEffect(() => {
    if (!open || !initialActivityId || !activities?.length) return
    const exists = (activities as any[]).some((activity) => Number(activity.id) === Number(initialActivityId))
    if (exists) {
      setSelectedId(Number(initialActivityId))
    }
  }, [open, initialActivityId, activities])

  const clearMediaPreviews = () => {
    mediaItems.forEach((item) => {
      if (item.previewUrl.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl)
    })
  }

  const resetComposer = () => {
    clearMediaPreviews()
    setCaption("")
    setMediaItems([])
    setTagQuery("")
    setTaggedUsers([])
    if (mediaInputRef.current) mediaInputRef.current.value = ""
  }

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSelectedId(null)
      resetComposer()
    }
    onOpenChange(nextOpen)
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

    if (accepted.length) setMediaItems((prev) => [...prev, ...accepted])
  }

  const removeMedia = (id: string) => {
    setMediaItems((prev) => {
      const target = prev.find((item) => item.id === id)
      if (target?.previewUrl.startsWith("blob:")) URL.revokeObjectURL(target.previewUrl)
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
      if (prev.some((item) => item.userId === normalized.userId)) return prev
      return [...prev, normalized].slice(0, 10)
    })
    setTagQuery("")
  }

  const removeTaggedUser = (userId: number) => {
    setTaggedUsers((prev) => prev.filter((item) => item.userId !== userId))
  }

  const uploadMedia = async (file: File, kind: PostMediaKind) => {
    return uploadActivityShareMedia({
      file,
      kind,
      getImageKitAuth: () => imageKitAuth.mutateAsync(),
      uploadImageFallback: (payload) => postImageUpload.mutateAsync(payload),
      getCloudinaryAuth: () => cloudinaryVideoAuth.mutateAsync({ scope: "posts" }),
      notifyWarning: (message) => toast.warning(message),
    })
  }

  const handleShare = async () => {
    if (!selectedId) return
    try {
      const uploadedMediaUrls: string[] = []
      for (const media of mediaItems) {
        const url = await uploadMedia(media.file, media.kind)
        uploadedMediaUrls.push(url)
      }

      await createPost.mutateAsync({
        activityId: selectedId,
        content: caption.trim() || null,
        mediaUrls: uploadedMediaUrls,
        mediaUrl: uploadedMediaUrls[0] ?? null,
        taggedUserIds: taggedUsers.map((user) => user.userId),
        hashtags,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore nella condivisione"
      toast.error(message)
    }
  }

  const isPending =
    createPost.isPending || imageKitAuth.isPending || postImageUpload.isPending || cloudinaryVideoAuth.isPending

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="bottom" className="max-h-[88dvh] rounded-t-2xl overflow-y-auto">
        <SheetHeader>
          {selectedId ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedId(null)
                  resetComposer()
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="size-5" />
              </button>
              <SheetTitle>Condividi attivita</SheetTitle>
            </div>
          ) : (
            <>
              <SheetTitle>Scegli un'attivita</SheetTitle>
              <SheetDescription>Seleziona un'attivita da condividere nel feed</SheetDescription>
            </>
          )}
        </SheetHeader>

        {selectedId && selected ? (
          <div className="flex flex-col gap-4 px-4 pb-4">
            <div className="rounded-2xl border border-border/80 bg-background/60 p-4">
              <div className="text-sm font-medium">{(selected as any).activity_name ?? "Nuotata"}</div>
              <div className="mt-1 flex gap-3 text-sm text-muted-foreground">
                <span>{formatDistance((selected as any).distance_meters)}</span>
                <span>{formatDuration((selected as any).duration_seconds)}</span>
              </div>
            </div>

            <Textarea
              placeholder="Aggiungi un commento... (opzionale)"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={2000}
              className="resize-none"
              rows={3}
            />
            {firstLinkInCaption ? <LinkPreviewCard url={firstLinkInCaption} /> : null}

            <div className="flex items-center justify-between gap-2">
              <Button type="button" variant="outline-neon" size="sm" className="gap-2" onClick={() => mediaInputRef.current?.click()}>
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
              {tagSearchQuery.data && normalizedTagQuery.length >= 2 ? (
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

            <Button
              variant="neon"
              onClick={() => void handleShare()}
              disabled={isPending}
              className="w-full"
            >
              {isPending ? "Condivisione..." : "Condividi"}
            </Button>
          </div>
        ) : (
          <div className="overflow-y-auto px-4 pb-4">
            {isLoading ? (
              <div className="flex justify-center py-8 text-muted-foreground">Caricamento...</div>
            ) : !activities?.length ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
                <Waves className="size-8 opacity-50" />
                <p>Nessuna attivita recente da condividere</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {(activities as any[]).map((activity) => (
                  <button
                    key={activity.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(activity.id)
                      resetComposer()
                    }}
                    className="flex items-center gap-3 rounded-2xl border border-border/80 bg-background/60 p-4 text-left transition-colors hover:bg-card/60"
                  >
                    <div className="flex size-10 items-center justify-center rounded-xl bg-[color-mix(in_oklch,var(--electric-cyan)_15%,transparent)]">
                      <Waves className="size-5 text-[var(--electric-cyan)]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {activity.activity_name ?? "Nuotata"}
                      </div>
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        <span>{formatDistance(activity.distance_meters)}</span>
                        <span>{formatDuration(activity.duration_seconds)}</span>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {activity.activity_date ? formatTimeAgo(activity.activity_date) : ""}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
