import { useState } from "react";
import { PencilLine, Share2 } from "lucide-react";
import { toast } from "sonner";

import { EditPostSheet } from "@/components/social/EditPostSheet";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

/**
 * Sharing one swim: «Condividi» (the caller opens the share sheet with text and photos) or,
 * once shared, «Modifica post» and «Rimuovi dal feed». The same buttons on the swim detail
 * and in the Activities panel.
 */
export function ActivityShareActions({
  activityId,
  shared,
  onShare,
  buttonClassName,
  size,
}: {
  activityId: number;
  shared: boolean;
  onShare: () => void;
  buttonClassName?: string;
  size?: "default" | "sm" | "lg";
}) {
  const [editOpen, setEditOpen] = useState(false);
  const utils = trpc.useUtils();
  const removeFromFeed = trpc.community.toggleShare.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.activities.get.invalidate({ id: activityId }),
        utils.activities.list.invalidate(),
        utils.community.feed.invalidate(),
        utils.community.unsharedActivities.invalidate(),
      ]);
      toast.success("Nuotata rimossa dal feed.");
    },
    onError: error => {
      toast.error(error.message || "Non riesco a rimuovere la nuotata dal feed.");
    },
  });

  if (!shared) {
    return (
      <Button type="button" size={size} className={buttonClassName} onClick={onShare}>
        <Share2 aria-hidden />
        Condividi
      </Button>
    );
  }

  return (
    <>
      <Button
        type="button"
        size={size}
        variant="outline"
        className={buttonClassName}
        onClick={() => setEditOpen(true)}
      >
        <PencilLine aria-hidden />
        Modifica post
      </Button>
      <Button
        type="button"
        size={size}
        variant="ghost"
        className={buttonClassName}
        disabled={removeFromFeed.isPending}
        onClick={() => {
          if (!window.confirm("Rimuovere questa nuotata dal feed? Il post sparisce per tutti.")) return;
          removeFromFeed.mutate({ activityId, share: false });
        }}
      >
        {removeFromFeed.isPending ? "Rimozione…" : "Rimuovi dal feed"}
      </Button>
      {editOpen ? <EditPostSheet open onOpenChange={setEditOpen} postRef={{ activityId }} /> : null}
    </>
  );
}
