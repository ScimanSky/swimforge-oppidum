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
import { Camera, Type } from "lucide-react"
import { toast } from "sonner"

interface StoryCreatorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Mode = "pick" | "image" | "text"

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const
type AcceptedMime = (typeof ACCEPTED_TYPES)[number]

export function StoryCreator({ open, onOpenChange }: StoryCreatorProps) {
  const [mode, setMode] = useState<Mode>("pick")
  const [caption, setCaption] = useState("")
  const [preview, setPreview] = useState<string | null>(null)
  const fileRef = useRef<{ base64: string; mimeType: AcceptedMime } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const utils = trpc.useUtils()

  const uploadFile = trpc.community.stories.uploadFile.useMutation({
    onSuccess: () => {
      utils.community.stories.active.invalidate()
      toast.success("Storia pubblicata!")
      resetAndClose()
    },
    onError: (err) => {
      toast.error(err.message || "Errore nella pubblicazione")
    },
  })

  const createTextStory = trpc.community.stories.create.useMutation({
    onSuccess: () => {
      utils.community.stories.active.invalidate()
      toast.success("Storia pubblicata!")
      resetAndClose()
    },
    onError: (err) => {
      toast.error(err.message || "Errore nella pubblicazione")
    },
  })

  const resetAndClose = () => {
    setMode("pick")
    setCaption("")
    setPreview(null)
    fileRef.current = null
    onOpenChange(false)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!ACCEPTED_TYPES.includes(file.type as AcceptedMime)) {
      toast.error("Formato non supportato. Usa JPG, PNG o WEBP.")
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("File troppo grande (max 5MB)")
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      setPreview(result)
      // Extract base64 from data URL
      const base64 = result.split(",")[1]
      fileRef.current = { base64, mimeType: file.type as AcceptedMime }
      setMode("image")
    }
    reader.readAsDataURL(file)
  }

  const handleSubmitImage = () => {
    if (!fileRef.current) return
    uploadFile.mutate({
      fileBase64: fileRef.current.base64,
      mimeType: fileRef.current.mimeType,
      caption: caption.trim() || undefined,
      type: "image",
    })
  }

  const handleSubmitText = () => {
    if (!caption.trim()) return
    createTextStory.mutate({
      caption: caption.trim(),
      type: "text",
    })
  }

  const isPending = uploadFile.isPending || createTextStory.isPending

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
              onClick={() => inputRef.current?.click()}
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
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileChange}
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
              onClick={handleSubmitImage}
              disabled={isPending}
              className="w-full"
            >
              {isPending ? "Pubblicazione..." : "Pubblica storia"}
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
                onClick={handleSubmitText}
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
