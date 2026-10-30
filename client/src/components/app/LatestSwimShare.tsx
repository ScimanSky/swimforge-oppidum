import { useCallback, useEffect } from "react"
import { toast } from "sonner"

import { EditPostSheet } from "@/components/social/EditPostSheet"
import { ShareActivityPicker } from "@/components/social/ShareActivityPicker"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { trpc } from "@/lib/trpc"

/**
 * The «Crea» that started the flow (bottom bar on phones, rail on desktop: both carry
 * `data-tour="create-post"`), when the focus was left nowhere: closing a sheet opened without a
 * trigger leaves it on the page body.
 */
function focusCreateTriggerIfLost() {
  const active = document.activeElement
  if (active && active !== document.body && active.isConnected) return
  const triggers = Array.from(document.querySelectorAll<HTMLElement>('[data-tour="create-post"]'))
  const visible = triggers.find((element) => element.getClientRects().length > 0) ?? triggers[0]
  visible?.focus()
}

/**
 * «Condividi l'ultima nuotata» from the «+» menu: the share sheet of the most recent swim, or
 * its post editor when its post is in the feed; without swims, a message says what to do. While
 * the swim is looked up a sheet says so (the «+» menu hands the focus to it). When the flow ends
 * the focus goes back to «Crea». Mounted only while in use.
 */
export function LatestSwimShare({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils()
  const latest = trpc.community.latestSwim.useQuery(undefined, { staleTime: 0, gcTime: 0, retry: false })

  const finish = useCallback(() => {
    onClose()
    window.setTimeout(focusCreateTriggerIfLost, 0)
  }, [onClose])

  useEffect(() => {
    if (latest.isError) {
      toast.error("Non riesco a trovare la tua ultima nuotata. Riprova.")
      finish()
    } else if (latest.isSuccess && !latest.data) {
      toast.info("Non hai ancora nuotate da condividere.", {
        description: "Sincronizza Garmin per importare le tue nuotate.",
      })
      finish()
    }
  }, [latest.isError, latest.isSuccess, latest.data, finish])

  const onOpenChange = (open: boolean) => {
    if (!open) finish()
  }

  const swim = latest.data
  if (!swim) {
    if (!latest.isPending) return null
    return (
      <Sheet open onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Condividi l'ultima nuotata</SheetTitle>
            <SheetDescription className="sr-only">Cerco la tua ultima nuotata.</SheetDescription>
          </SheetHeader>
          <div role="status" className="flex items-center gap-3 px-4 pb-6 text-sm text-muted-foreground">
            <Spinner className="size-5" aria-hidden />
            Cerco la tua ultima nuotata…
          </div>
        </SheetContent>
      </Sheet>
    )
  }
  if (swim.shared) {
    return <EditPostSheet open onOpenChange={onOpenChange} postRef={{ activityId: swim.id }} />
  }
  return (
    <ShareActivityPicker
      open
      onOpenChange={onOpenChange}
      initialActivityId={swim.id}
      onShared={async () => {
        await utils.activities.list.invalidate()
      }}
    />
  )
}
