import { useEffect } from "react"
import { toast } from "sonner"

import { EditPostSheet } from "@/components/social/EditPostSheet"
import { ShareActivityPicker } from "@/components/social/ShareActivityPicker"
import { trpc } from "@/lib/trpc"

/**
 * «Condividi l'ultima nuotata» from the «+» menu: the share sheet of the most recent swim, or
 * its post editor when it is already in the feed; without swims, a message says what to do.
 * Mounted only while in use.
 */
export function LatestSwimShare({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils()
  const latest = trpc.community.latestSwim.useQuery(undefined, { staleTime: 0, gcTime: 0, retry: false })

  useEffect(() => {
    if (latest.isError) {
      toast.error("Non riesco a trovare la tua ultima nuotata. Riprova.")
      onClose()
    } else if (latest.isSuccess && !latest.data) {
      toast.info("Non hai ancora nuotate da condividere.", {
        description: "Sincronizza Garmin per importare le tue nuotate.",
      })
      onClose()
    }
  }, [latest.isError, latest.isSuccess, latest.data, onClose])

  const swim = latest.data
  if (!swim) return null
  const onOpenChange = (open: boolean) => {
    if (!open) onClose()
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
