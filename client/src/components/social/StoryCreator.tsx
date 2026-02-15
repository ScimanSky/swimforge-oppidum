"use client"

import { useRef, useState } from "react"
import { trpc } from "@/lib/trpc"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Camera, Type, Video } from "lucide-react"
import { toast } from "sonner"

interface StoryCreatorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const
const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"] as const
const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_VIDEO_BYTES = 25 * 1024 * 1024
const MAX_VIDEO_DURATION_SECONDS = 60
const STORY_VIDEO_CLIP_SECONDS = 20
const MAX_VIDEO_SEGMENTS = 3

type ModeWithVideo = "pick" | "image" | "video" | "text"
type PreviewKind = "image" | "video" | null

export function StoryCreator({ open, onOpenChange }: StoryCreatorProps) {
  const [mode, setMode] = useState<ModeWithVideo>("pick")
  const [caption, setCaption] = useState("")
  const [preview, setPreview] = useState<string | null>(null)
  const [previewKind, setPreviewKind] = useState<PreviewKind>(null)
  const imageFileRef = useRef<File | null>(null)
  const videoFileRef = useRef<File | null>(null)
  const videoDurationRef = useRef<number>(0)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  const utils = trpc.useUtils()

  const imageKitAuth = trpc.community.stories.imageKitAuth.useMutation()

  const createStory = trpc.community.stories.create.useMutation()

  const clearPreviewUrl = () => {
    if (preview && preview.startsWith("blob:")) {
      URL.revokeObjectURL(preview)
    }
  }

  const resetAndClose = () => {
    clearPreviewUrl()
    setMode("pick")
    setCaption("")
    setPreview(null)
    setPreviewKind(null)
    imageFileRef.current = null
    videoFileRef.current = null
    videoDurationRef.current = 0
    if (imageInputRef.current) {
      imageInputRef.current.value = ""
    }
    if (videoInputRef.current) {
      videoInputRef.current.value = ""
    }
    onOpenChange(false)
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
      toast.error("Formato non supportato. Usa JPG, PNG o WEBP.")
      return
    }

    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("File troppo grande (max 20MB)")
      return
    }

    clearPreviewUrl()
    const objectUrl = URL.createObjectURL(file)
    setPreview(objectUrl)
    setPreviewKind("image")
    imageFileRef.current = file
    videoFileRef.current = null
    setMode("image")
  }

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!ACCEPTED_VIDEO_TYPES.includes(file.type as (typeof ACCEPTED_VIDEO_TYPES)[number])) {
      toast.error("Formato video non supportato. Usa MP4 o WEBM.")
      return
    }

    if (file.size > MAX_VIDEO_BYTES) {
      toast.error("Video troppo grande (max 25MB)")
      return
    }

    const objectUrl = URL.createObjectURL(file)
    const video = document.createElement("video")
    video.preload = "metadata"
    video.src = objectUrl
    video.onloadedmetadata = () => {
      const duration = Number(video.duration)
      if (!Number.isFinite(duration) || duration <= 0) {
        URL.revokeObjectURL(objectUrl)
        toast.error("Impossibile leggere la durata del video.")
        return
      }

      if (duration > MAX_VIDEO_DURATION_SECONDS) {
        URL.revokeObjectURL(objectUrl)
        toast.error(`Video troppo lungo (max ${MAX_VIDEO_DURATION_SECONDS} secondi)`)
        return
      }

      clearPreviewUrl()
      setPreview(objectUrl)
      setPreviewKind("video")
      videoFileRef.current = file
      videoDurationRef.current = duration
      imageFileRef.current = null
      setMode("video")
    }
    video.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      toast.error("Impossibile leggere il video selezionato.")
    }
  }

  const uploadMediaToImageKit = async (file: File) => {
    const auth = await imageKitAuth.mutateAsync()
    const fileNameSafe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
    const fileName = `story-${Date.now()}-${fileNameSafe}`

    const formData = new FormData()
    formData.append("file", file)
    formData.append("fileName", fileName)
    formData.append("publicKey", auth.publicKey)
    formData.append("token", auth.token)
    formData.append("signature", auth.signature)
    formData.append("expire", String(auth.expire))
    formData.append("folder", auth.folder)
    formData.append("useUniqueFileName", "true")
    formData.append("tags", "story,swimforge")

    const uploadResponse = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
      method: "POST",
      body: formData,
    })

    if (!uploadResponse.ok) {
      const detail = await uploadResponse.text().catch(() => "")
      throw new Error(detail || "Upload su ImageKit fallito")
    }

    const uploaded = (await uploadResponse.json()) as { url?: string }
    if (!uploaded.url) {
      throw new Error("ImageKit non ha restituito un URL valido")
    }
    return uploaded.url
  }

  const buildVideoStoryUrls = (mediaUrl: string, durationSeconds: number) => {
    const normalizedDuration = Math.min(durationSeconds, MAX_VIDEO_DURATION_SECONDS)
    const segments = Math.min(MAX_VIDEO_SEGMENTS, Math.max(1, Math.ceil(normalizedDuration / STORY_VIDEO_CLIP_SECONDS)))
    if (segments <= 1) {
      return [mediaUrl]
    }

    const baseUrl = mediaUrl.split("#")[0]
    const urls: string[] = []
    for (let i = 0; i < segments; i += 1) {
      const start = i * STORY_VIDEO_CLIP_SECONDS
      const end = Math.min(normalizedDuration, (i + 1) * STORY_VIDEO_CLIP_SECONDS)
      if (end - start < 0.25) continue
      urls.push(`${baseUrl}#t=${start},${end}`)
    }
    return urls.length > 0 ? urls : [mediaUrl]
  }

  const handleSubmitImage = async () => {
    const file = imageFileRef.current
    if (!file) return

    try {
      const mediaUrl = await uploadMediaToImageKit(file)
      await createStory.mutateAsync({
        mediaUrl,
        caption: caption.trim() || undefined,
        type: "image",
      })
      await utils.community.stories.active.invalidate()
      toast.success("Storia pubblicata!")
      resetAndClose()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore nella pubblicazione della foto"
      toast.error(message)
    }
  }

  const handleSubmitVideo = async () => {
    const file = videoFileRef.current
    if (!file) return

    try {
      const mediaUrl = await uploadMediaToImageKit(file)
      const duration = videoDurationRef.current || STORY_VIDEO_CLIP_SECONDS
      const clipUrls = buildVideoStoryUrls(mediaUrl, duration)
      const baseCaption = caption.trim()
      for (let i = 0; i < clipUrls.length; i += 1) {
        const clipCaption = i === 0 ? (baseCaption || undefined) : undefined

        await createStory.mutateAsync({
          mediaUrl: clipUrls[i],
          caption: clipCaption,
          type: "video",
        })
      }
      await utils.community.stories.active.invalidate()
      if (clipUrls.length > 1) {
        toast.success(`Video pubblicato in ${clipUrls.length} storie da ${STORY_VIDEO_CLIP_SECONDS}s`)
      } else {
        toast.success("Video pubblicato!")
      }
      resetAndClose()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore nella pubblicazione del video"
      toast.error(message)
    }
  }

  const handleSubmitText = async () => {
    if (!caption.trim()) return
    try {
      await createStory.mutateAsync({
        caption: caption.trim(),
        type: "text",
      })
      await utils.community.stories.active.invalidate()
      toast.success("Storia pubblicata!")
      resetAndClose()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore nella pubblicazione"
      toast.error(message)
    }
  }

  const isPending = createStory.isPending || imageKitAuth.isPending

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) resetAndClose(); else onOpenChange(o) }}>
      <SheetContent side="bottom" className="max-h-[85dvh] rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Nuova Storia</SheetTitle>
          <SheetDescription>Condividi un momento che dura 24 ore</SheetDescription>
        </SheetHeader>

        {mode === "pick" && (
          <div className="flex flex-col gap-3 px-4 pb-4">
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              className="flex items-center gap-4 rounded-2xl border border-border/80 bg-background/60 p-4 text-left transition-colors hover:bg-card/60"
            >
              <div className="flex size-12 items-center justify-center rounded-xl bg-[color-mix(in_oklch,var(--electric-cyan)_15%,transparent)]">
                <Camera className="size-6 text-[var(--electric-cyan)]" />
              </div>
              <div>
                <div className="font-semibold">Foto</div>
                <div className="text-sm text-muted-foreground">Carica un'immagine</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => videoInputRef.current?.click()}
              className="flex items-center gap-4 rounded-2xl border border-border/80 bg-background/60 p-4 text-left transition-colors hover:bg-card/60"
            >
              <div className="flex size-12 items-center justify-center rounded-xl bg-[color-mix(in_oklch,var(--electric-cyan)_15%,transparent)]">
                <Video className="size-6 text-[var(--electric-cyan)]" />
              </div>
              <div>
                <div className="font-semibold">Video</div>
                <div className="text-sm text-muted-foreground">Max 60s, split automatico in clip da 20s</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setMode("text")}
              className="flex items-center gap-4 rounded-2xl border border-border/80 bg-background/60 p-4 text-left transition-colors hover:bg-card/60"
            >
              <div className="flex size-12 items-center justify-center rounded-xl bg-[color-mix(in_oklch,var(--electric-lime)_15%,transparent)]">
                <Type className="size-6 text-[var(--electric-lime)]" />
              </div>
              <div>
                <div className="font-semibold">Testo</div>
                <div className="text-sm text-muted-foreground">Scrivi un pensiero</div>
              </div>
            </button>

            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleImageChange}
            />
            <input
              ref={videoInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime,video/x-m4v"
              className="hidden"
              onChange={handleVideoChange}
            />
          </div>
        )}

        {mode === "image" && (
          <div className="flex flex-col gap-4 px-4 pb-4">
            {preview && (
              <div className="overflow-hidden rounded-2xl">
                <img src={preview} alt="Preview" className="max-h-[40dvh] w-full object-contain" />
              </div>
            )}
            <Textarea
              placeholder="Aggiungi una didascalia... (opzionale)"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={500}
              className="resize-none"
              rows={2}
            />
            <Button
              variant="neon"
              onClick={() => void handleSubmitImage()}
              disabled={isPending}
              className="w-full"
            >
              {isPending ? "Pubblicazione..." : "Pubblica storia"}
            </Button>
          </div>
        )}

        {mode === "video" && (
          <div className="flex flex-col gap-4 px-4 pb-4">
            {preview && previewKind === "video" && (
              <div className="overflow-hidden rounded-2xl">
                <video
                  src={preview}
                  className="max-h-[40dvh] w-full object-contain"
                  controls
                  playsInline
                  preload="metadata"
                />
              </div>
            )}
            <Textarea
              placeholder="Aggiungi una didascalia... (opzionale)"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={500}
              className="resize-none"
              rows={2}
            />
            <Button
              variant="neon"
              onClick={() => void handleSubmitVideo()}
              disabled={isPending}
              className="w-full"
            >
              {isPending ? "Pubblicazione..." : "Pubblica video"}
            </Button>
          </div>
        )}

        {mode === "text" && (
          <div className="flex flex-col gap-4 px-4 pb-4">
            <Textarea
              placeholder="Scrivi qualcosa..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={500}
              className="min-h-[100px] resize-none"
              rows={4}
              autoFocus
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{caption.length}/500</span>
              <Button
                variant="neon"
                onClick={() => void handleSubmitText()}
                disabled={!caption.trim() || isPending}
              >
                {isPending ? "Pubblicazione..." : "Pubblica storia"}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
