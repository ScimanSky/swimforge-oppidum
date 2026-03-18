"use client"

import { useEffect, useRef, useState } from "react"
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
import { Camera, Loader2, Type, Video } from "lucide-react"
import { toast } from "sonner"
import { uploadVideoToCloudinary } from "@/lib/cloudinary-upload"
import { fileToBase64 } from "@/lib/file-base64"
import { UploadStatusPill } from "./UploadStatusPill"
import { extractFirstUrl, LinkPreviewCard } from "@/lib/social-content"

interface StoryCreatorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const
const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"] as const
const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_VIDEO_BYTES = 100 * 1024 * 1024
const MAX_VIDEO_DURATION_SECONDS = 60
const STORY_VIDEO_CLIP_SECONDS = 20
const MAX_VIDEO_SEGMENTS = 3
const ACCEPTED_VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".m4v"] as const

type ModeWithVideo = "pick" | "image" | "video" | "text"
type PreviewKind = "image" | "video" | null
type StoryImageMimeType = "image/jpeg" | "image/png" | "image/webp"

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
  const storyHistoryEntryActiveRef = useRef(false)
  const storyCloseFromPopStateRef = useRef(false)
  const storyHistoryPathRef = useRef<string | null>(null)

  const utils = trpc.useUtils()

  const imageKitAuth = trpc.community.stories.imageKitAuth.useMutation()
  const postImageUpload = trpc.community.postUploadImage.useMutation()
  const cloudinaryVideoAuth = trpc.community.cloudinaryVideoAuth.useMutation()

  const createStory = trpc.community.stories.create.useMutation()
  const firstLinkInCaption = extractFirstUrl(caption)

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

  useEffect(() => {
    if (!open || typeof window === "undefined") return

    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`
    storyHistoryPathRef.current = currentPath
    window.history.pushState({ ...(window.history.state ?? {}), swimforgeStoryCreatorOpen: true }, "", window.location.href)
    storyHistoryEntryActiveRef.current = true
    storyCloseFromPopStateRef.current = false

    const handlePopState = () => {
      if (!storyHistoryEntryActiveRef.current) return
      storyCloseFromPopStateRef.current = true
      storyHistoryEntryActiveRef.current = false
      onOpenChange(false)
    }

    window.addEventListener("popstate", handlePopState)

    return () => {
      window.removeEventListener("popstate", handlePopState)
      if (!storyHistoryEntryActiveRef.current) return

      const pathNow = `${window.location.pathname}${window.location.search}${window.location.hash}`
      const shouldPopSyntheticEntry =
        !storyCloseFromPopStateRef.current && storyHistoryPathRef.current === pathNow

      storyHistoryEntryActiveRef.current = false
      storyCloseFromPopStateRef.current = false
      storyHistoryPathRef.current = null

      if (shouldPopSyntheticEntry) {
        window.history.back()
      }
    }
  }, [open, onOpenChange])

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

    const fileNameLower = file.name.toLowerCase()
    const hasSupportedMime = ACCEPTED_VIDEO_TYPES.includes(file.type as (typeof ACCEPTED_VIDEO_TYPES)[number])
    const hasSupportedExtension = ACCEPTED_VIDEO_EXTENSIONS.some((ext) => fileNameLower.endsWith(ext))
    if (!hasSupportedMime && !hasSupportedExtension) {
      toast.error("Formato video non supportato. Usa MP4, WEBM o MOV.")
      return
    }

    if (file.size > MAX_VIDEO_BYTES) {
      toast.error("Video troppo grande (max 100MB)")
      return
    }

    const objectUrl = URL.createObjectURL(file)
    const video = document.createElement("video")
    video.preload = "metadata"
    video.muted = true
    video.playsInline = true
    video.src = objectUrl
    video.onloadedmetadata = () => {
      const duration = Number(video.duration)
      if (!Number.isFinite(duration) || duration <= 0) {
        clearPreviewUrl()
        setPreview(null)
        setPreviewKind("video")
        videoFileRef.current = file
        videoDurationRef.current = STORY_VIDEO_CLIP_SECONDS
        imageFileRef.current = null
        setMode("video")
        URL.revokeObjectURL(objectUrl)
        toast.warning("Durata non leggibile: verrà caricato come clip singola.")
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
      clearPreviewUrl()
      setPreview(null)
      setPreviewKind("video")
      videoFileRef.current = file
      videoDurationRef.current = STORY_VIDEO_CLIP_SECONDS
      imageFileRef.current = null
      setMode("video")
      URL.revokeObjectURL(objectUrl)
      toast.warning("Codec non supportato dal browser: caricamento consentito senza anteprima locale.")
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

    const uploaded = (await uploadResponse.json()) as { url?: string; fileId?: string }
    if (!uploaded.url) {
      throw new Error("ImageKit non ha restituito un URL valido")
    }
    return {
      url: uploaded.url,
      fileId: uploaded.fileId ?? null,
    }
  }

  const uploadStoryVideoToCloudinary = async (file: File) => {
    const auth = await cloudinaryVideoAuth.mutateAsync({ scope: "stories" })
    if (auth.warning) {
      toast.warning(auth.warning)
    }
    return uploadVideoToCloudinary(file, auth)
  }

  const uploadStoryImageWithFallback = async (file: File) => {
    try {
      return await uploadMediaToImageKit(file)
    } catch (imageKitError) {
      try {
        const fallbackPayload = await fileToBase64(file)
        const uploaded = await postImageUpload.mutateAsync({
          fileBase64: fallbackPayload,
          mimeType: file.type as StoryImageMimeType,
        })
        toast.warning("Upload diretto non riuscito: usato fallback server.")
        return { url: uploaded.url, fileId: null }
      } catch (fallbackError) {
        const primaryMessage = imageKitError instanceof Error ? imageKitError.message : "Upload immagine fallito"
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : "Upload immagine fallito"
        throw new Error(fallbackMessage || primaryMessage)
      }
    }
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
      const uploaded = await uploadStoryImageWithFallback(file)
      await createStory.mutateAsync({
        mediaUrl: uploaded.url,
        imageKitFileId: uploaded.fileId ?? undefined,
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
      const uploaded = await uploadStoryVideoToCloudinary(file)
      const baseCaption = caption.trim()
      await createStory.mutateAsync({
        mediaUrl: uploaded.url,
        caption: baseCaption || undefined,
        type: "video",
      })
      await utils.community.stories.active.invalidate()
      toast.success("Video pubblicato!")
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

  const isStoryPending =
    createStory.isPending || imageKitAuth.isPending || postImageUpload.isPending || cloudinaryVideoAuth.isPending

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) resetAndClose(); else onOpenChange(o) }}>
      <SheetContent side="bottom" className="max-h-[85dvh] rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Nuova Storia</SheetTitle>
          <SheetDescription>Condividi un momento che dura 24 ore</SheetDescription>
          {isStoryPending ? <UploadStatusPill label="Upload story in corso" className="mt-1 w-fit" /> : null}
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
            {firstLinkInCaption ? <LinkPreviewCard url={firstLinkInCaption} /> : null}
            <Button
              variant="neon"
              onClick={() => void handleSubmitImage()}
              disabled={isStoryPending}
              className="w-full"
            >
              {isStoryPending ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  Pubblico
                </span>
              ) : "Pubblica storia"}
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
            {firstLinkInCaption ? <LinkPreviewCard url={firstLinkInCaption} /> : null}
            <Button
              variant="neon"
              onClick={() => void handleSubmitVideo()}
              disabled={isStoryPending}
              className="w-full"
            >
              {isStoryPending ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  Pubblico
                </span>
              ) : "Pubblica video"}
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
            {firstLinkInCaption ? <LinkPreviewCard url={firstLinkInCaption} /> : null}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{caption.length}/500</span>
              <Button
                variant="neon"
                onClick={() => void handleSubmitText()}
                disabled={!caption.trim() || isStoryPending}
              >
                {isStoryPending ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    Pubblico
                  </span>
                ) : "Pubblica storia"}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
