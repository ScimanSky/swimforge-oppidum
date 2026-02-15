"use client"

import { useState } from "react"
import { trpc } from "@/lib/trpc"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Activity, Camera, ChevronLeft, PenLine } from "lucide-react"
import { toast } from "sonner"
import { ShareActivityPicker } from "./ShareActivityPicker"
import { StoryCreator } from "./StoryCreator"

interface CreatePostSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Mode = "menu" | "text"

export function CreatePostSheet({ open, onOpenChange }: CreatePostSheetProps) {
  const [mode, setMode] = useState<Mode>("menu")
  const [content, setContent] = useState("")
  const [mediaUrl, setMediaUrl] = useState("")
  const [sharePickerOpen, setSharePickerOpen] = useState(false)
  const [storyCreatorOpen, setStoryCreatorOpen] = useState(false)

  const utils = trpc.useUtils()
  const createTextPost = trpc.community.createTextPost.useMutation({
    onSuccess: () => {
      utils.community.feed.invalidate()
      toast.success("Post pubblicato!")
      resetAndClose()
    },
    onError: () => {
      toast.error("Errore nella pubblicazione")
    },
  })

  const resetAndClose = () => {
    setMode("menu")
    setContent("")
    setMediaUrl("")
    onOpenChange(false)
  }

  const handleSubmitText = () => {
    if (!content.trim()) return
    createTextPost.mutate({
      content: content.trim(),
      mediaUrl: mediaUrl.trim() || undefined,
    })
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
        <SheetContent side="bottom" className="rounded-t-2xl">
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
                  <div className="text-sm text-muted-foreground">Scrivi un aggiornamento testuale</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  onOpenChange(false)
                  setTimeout(() => setStoryCreatorOpen(true), 200)
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
              <Textarea
                placeholder="Scrivi qualcosa..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                maxLength={2000}
                className="min-h-[120px] resize-none"
                rows={5}
                autoFocus
              />
              <Input
                placeholder="URL media (opzionale)"
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                type="url"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {content.length}/2000
                </span>
                <Button
                  variant="neon"
                  onClick={handleSubmitText}
                  disabled={!content.trim() || createTextPost.isPending}
                >
                  {createTextPost.isPending ? "Pubblicazione..." : "Pubblica"}
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
