"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { trpc } from "@/lib/trpc"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Activity, ChevronLeft, Loader2, PenLine, X, ImagePlus } from "lucide-react"
import { toast } from "sonner"
import { MentionTextarea } from "./MentionTextarea"
import { ShareActivityPicker } from "./ShareActivityPicker"
import { UploadStatusPill } from "./UploadStatusPill"
import {
  isVideoUrl,
  MAX_POST_MEDIA_ITEMS,
  validatePostMediaFile,
  type PostMediaKind,
} from "@/lib/post-media"
import { extractFirstUrl, LinkPreviewCard } from "@/lib/social-content"
import { pickedMentionIds, type MentionUser } from "@/lib/mentions"
import { uploadVideoToCloudinary } from "@/lib/cloudinary-upload"
import { uploadPostImageWithFallback } from "@/lib/post-image-upload"

interface CreatePostSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialContent?: string
  initialPbShareContext?: PbShareTrackingContext
}

export type PbShareTrackingContext = {
  celebrationEventId?: number
  strokeType?: "freestyle" | "backstroke" | "breaststroke" | "butterfly" | "mixed"
  distanceMeters?: number
  poolLengthMeters?: 25 | 50
  source?: "official" | "training"
  newTimeCs?: number
  previousTimeCs?: number | null
  improvementCs?: number | null
}

type Mode = "menu" | "text"

type SelectedMedia = {
  id: string
  file: File
  previewUrl: string
  kind: PostMediaKind
}

export function CreatePostSheet({ open, onOpenChange, initialContent, initialPbShareContext }: CreatePostSheetProps) {
  const [mode, setMode] = useState<Mode>("menu")
  const [content, setContent] = useState("")
  const [mediaItems, setMediaItems] = useState<SelectedMedia[]>([])
  const [mentions, setMentions] = useState<MentionUser[]>([])
  const [sharePickerOpen, setSharePickerOpen] = useState(false)

  const mediaInputRef = useRef<HTMLInputElement>(null)
  const postHistoryEntryActiveRef = useRef(false)
  const postCloseFromPopStateRef = useRef(false)
  const postHistoryPathRef = useRef<string | null>(null)

  const utils = trpc.useUtils()
  const imageKitAuth = trpc.community.postImageKitAuth.useMutation()
  const postImageUpload = trpc.community.postUploadImage.useMutation()
  const cloudinaryVideoAuth = trpc.community.cloudinaryVideoAuth.useMutation()
  const trackPbCelebrationAction = trpc.records.trackCelebrationAction.useMutation()

  const createTextPost = trpc.community.createTextPost.useMutation({
    onSuccess: () => {
      if (initialPbShareContext) {
        trackPbCelebrationAction.mutate({
          action: "share_success",
          celebrationEventId: initialPbShareContext.celebrationEventId,
          strokeType: initialPbShareContext.strokeType,
          distanceMeters: initialPbShareContext.distanceMeters,
          poolLengthMeters: initialPbShareContext.poolLengthMeters,
          source: initialPbShareContext.source,
          newTimeCs: initialPbShareContext.newTimeCs,
          previousTimeCs: initialPbShareContext.previousTimeCs,
          improvementCs: initialPbShareContext.improvementCs,
        })
      }
      utils.community.feed.invalidate()
      toast.success("Post pubblicato!")
      resetAndClose()
    },
    onError: (error) => {
      toast.error(error.message || "Errore nella pubblicazione")
    },
  })

  const firstLinkInContent = useMemo(() => extractFirstUrl(content), [content])
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
    setMentions([])
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
        taggedUserIds: pickedMentionIds(content, mentions),
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

  useEffect(() => {
    if (!open || typeof window === "undefined") return

    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`
    postHistoryPathRef.current = currentPath
    window.history.pushState({ ...(window.history.state ?? {}), swimforgeCreatePostOpen: true }, "", window.location.href)
    postHistoryEntryActiveRef.current = true
    postCloseFromPopStateRef.current = false

    const handlePopState = () => {
      if (!postHistoryEntryActiveRef.current) return
      postCloseFromPopStateRef.current = true
      postHistoryEntryActiveRef.current = false
      onOpenChange(false)
    }

    window.addEventListener("popstate", handlePopState)

    return () => {
      window.removeEventListener("popstate", handlePopState)
      if (!postHistoryEntryActiveRef.current) return

      const pathNow = `${window.location.pathname}${window.location.search}${window.location.hash}`
      const shouldPopSyntheticEntry =
        !postCloseFromPopStateRef.current && postHistoryPathRef.current === pathNow

      postHistoryEntryActiveRef.current = false
      postCloseFromPopStateRef.current = false
      postHistoryPathRef.current = null

      if (shouldPopSyntheticEntry) {
        window.history.back()
      }
    }
  }, [open, onOpenChange])

  useEffect(() => {
    if (!open) return
    if (!initialContent?.trim()) return
    setMode("text")
    setContent(initialContent.trim())
  }, [initialContent, open])

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
                  aria-label="Indietro"
                >
                  <ChevronLeft className="size-5" aria-hidden />
                </button>
                <SheetTitle>Nuovo post</SheetTitle>
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
                className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:bg-raised"
              >
                <div className="flex size-12 items-center justify-center rounded-xl bg-primary/15">
                  <Activity className="size-6 text-action-text" aria-hidden />
                </div>
                <div>
                  <div className="font-semibold">Condividi attività</div>
                  <div className="text-sm text-muted-foreground">Condividi un allenamento recente</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMode("text")}
                className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:bg-raised"
              >
                <div className="flex size-12 items-center justify-center rounded-xl bg-raised">
                  <PenLine className="size-6 text-action-text" aria-hidden />
                </div>
                <div>
                  <div className="font-semibold">Nuovo post</div>
                  <div className="text-sm text-muted-foreground">Testo, foto, video e menzioni con @</div>
                </div>
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4 px-4 pb-4">
              {isPostPending ? <UploadStatusPill label="Upload post in corso" className="w-fit" /> : null}
              <MentionTextarea
                aria-label="Testo del post"
                placeholder="Scrivi qualcosa..."
                value={content}
                onValueChange={setContent}
                mentions={mentions}
                onMentionsChange={setMentions}
                maxLength={2000}
                className="min-h-[120px] resize-none"
                rows={5}
                autoFocus
              />
              {firstLinkInContent ? <LinkPreviewCard url={firstLinkInContent} /> : null}

              <div className="flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => mediaInputRef.current?.click()}
                >
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

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{content.length}/2000</span>
                <Button
                  variant="default"
                  onClick={() => void handleSubmitText()}
                  disabled={(!hasContent && !hasMedia) || isPostPending}
                >
                  {isPostPending ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="size-4 animate-spin" aria-hidden />
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
    </>
  )
}
