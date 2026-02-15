"use client"

import { useState } from "react"
import { trpc } from "@/lib/trpc"
import { formatDistance, formatDuration, formatTimeAgo } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Waves, ChevronLeft } from "lucide-react"
import { toast } from "sonner"

interface ShareActivityPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ShareActivityPicker({ open, onOpenChange }: ShareActivityPickerProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [caption, setCaption] = useState("")

  const { data: activities, isLoading } = trpc.community.unsharedActivities.useQuery(undefined, {
    enabled: open,
  })

  const utils = trpc.useUtils()
  const toggleShare = trpc.community.toggleShare.useMutation()
  const createPost = trpc.community.createPost.useMutation({
    onSuccess: () => {
      utils.community.feed.invalidate()
      utils.community.unsharedActivities.invalidate()
      toast.success("Attivita condivisa!")
      setSelectedId(null)
      setCaption("")
      onOpenChange(false)
    },
    onError: () => {
      toast.error("Errore nella condivisione")
    },
  })

  const selected = activities?.find((a: any) => a.id === selectedId)

  const handleShare = async () => {
    if (!selectedId) return
    await toggleShare.mutateAsync({ activityId: selectedId, share: true })
    await createPost.mutateAsync({
      activityId: selectedId,
      content: caption || null,
    })
  }

  const isPending = toggleShare.isPending || createPost.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh] rounded-t-2xl">
        <SheetHeader>
          {selectedId ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
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
                    onClick={() => setSelectedId(activity.id)}
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
                      {activity.activity_date
                        ? formatTimeAgo(activity.activity_date)
                        : ""}
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
