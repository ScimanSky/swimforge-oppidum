"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { trpc } from "@/lib/trpc"
import { formatDistance, formatDuration, formatTimeAgo } from "@/lib/format"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Waves, ChevronLeft, ImagePlus, X } from "lucide-react"
import { toast } from "sonner"
import {
  isVideoUrl,
  MAX_POST_MEDIA_ITEMS,
  validatePostMediaFile,
  type PostMediaKind,
} from "@/lib/post-media"
import { extractFirstUrl, LinkPreviewCard } from "@/lib/social-content"
import { pickedMentionIds, type MentionUser } from "@/lib/mentions"
import { MentionTextarea } from "./MentionTextarea"
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

export function ShareActivityPicker({
  open,
  onOpenChange,
  initialActivityId = null,
  onShared,
}: ShareActivityPickerProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [caption, setCaption] = useState("")
  const [mediaItems, setMediaItems] = useState<SelectedMedia[]>([])
  const [mentions, setMentions] = useState<MentionUser[]>([])
  const mediaInputRef = useRef<HTMLInputElement>(null)
  const shareHistoryEntryActiveRef = useRef(false)
  const shareCloseFromPopStateRef = useRef(false)
  const shareHistoryPathRef = useRef<string | null>(null)

  // The swim opened from its page may be older than the 30 days of the list: ask for it too.
  const { data: activities, isLoading } = trpc.community.unsharedActivities.useQuery(
    initialActivityId ? { includeActivityId: initialActivityId } : undefined,
    { enabled: open }
  )

  const utils = trpc.useUtils()
  const imageKitAuth = trpc.community.postImageKitAuth.useMutation()
  const postImageUpload = trpc.community.postUploadImage.useMutation()
  const cloudinaryVideoAuth = trpc.community.cloudinaryVideoAuth.useMutation()

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
    setMentions([])
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
        taggedUserIds: pickedMentionIds(caption, mentions),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore nella condivisione"
      toast.error(message)
    }
  }

  const isPending =
    createPost.isPending || imageKitAuth.isPending || postImageUpload.isPending || cloudinaryVideoAuth.isPending

  useEffect(() => {
    if (!open || typeof window === "undefined") return

    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`
    shareHistoryPathRef.current = currentPath
    window.history.pushState({ ...(window.history.state ?? {}), swimforgeShareActivityOpen: true }, "", window.location.href)
    shareHistoryEntryActiveRef.current = true
    shareCloseFromPopStateRef.current = false

    const handlePopState = () => {
      if (!shareHistoryEntryActiveRef.current) return
      shareCloseFromPopStateRef.current = true
      shareHistoryEntryActiveRef.current = false
      setSelectedId(null)
      resetComposer()
      onOpenChange(false)
    }

    window.addEventListener("popstate", handlePopState)

    return () => {
      window.removeEventListener("popstate", handlePopState)
      if (!shareHistoryEntryActiveRef.current) return

      const pathNow = `${window.location.pathname}${window.location.search}${window.location.hash}`
      const shouldPopSyntheticEntry =
        !shareCloseFromPopStateRef.current && shareHistoryPathRef.current === pathNow

      shareHistoryEntryActiveRef.current = false
      shareCloseFromPopStateRef.current = false
      shareHistoryPathRef.current = null

      if (shouldPopSyntheticEntry) {
        window.history.back()
      }
    }
  }, [open, onOpenChange])

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
                aria-label="Torna alle attività"
              >
                <ChevronLeft className="size-5" aria-hidden />
              </button>
              <SheetTitle>Condividi attività</SheetTitle>
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

            <MentionTextarea
              aria-label="Testo del post"
              placeholder="Aggiungi un commento... (opzionale)"
              value={caption}
              onValueChange={setCaption}
              mentions={mentions}
              onMentionsChange={setMentions}
              maxLength={2000}
              className="resize-none"
              rows={3}
            />
            {firstLinkInCaption ? <LinkPreviewCard url={firstLinkInCaption} /> : null}

            <div className="flex items-center justify-between gap-2">
              <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => mediaInputRef.current?.click()}>
                <ImagePlus className="size-4" aria-hidden />
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
                      className="absolute right-1 top-1 rounded-full border border-border bg-background/90 p-1 text-foreground"
                      aria-label="Rimuovi media"
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <Button
              variant="default"
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
                <Waves className="size-8 opacity-50" aria-hidden />
                <p>Nessuna attività recente da condividere</p>
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
                    className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:bg-raised"
                  >
                    <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15">
                      <Waves className="size-5 text-action-text" aria-hidden />
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
