import { useId } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

/**
 * «Condividi nel feed» switch for one activity (shares or un-shares it), with the same
 * invalidations and toasts everywhere it appears: Activities panel and activity detail.
 */
export function ShareToggle({
  activityId,
  shared,
  className,
}: {
  activityId: number;
  shared: boolean;
  className?: string;
}) {
  const switchId = useId();
  const utils = trpc.useUtils();
  const toggleShare = trpc.community.toggleShare.useMutation({
    onSuccess: async (_, vars) => {
      await Promise.all([
        utils.activities.get.invalidate({ id: vars.activityId }),
        utils.activities.list.invalidate(),
        utils.community.feed.invalidate(),
        utils.community.unsharedActivities.invalidate(),
      ]);
      toast.success(
        vars.share ? "Attività condivisa nel feed." : "Condivisione attività disattivata."
      );
    },
    onError: error => {
      toast.error(error.message || "Impossibile aggiornare la condivisione.");
    },
  });

  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <label htmlFor={switchId} className="text-sm font-semibold">
        Condividi nel feed
      </label>
      <Switch
        id={switchId}
        checked={shared}
        disabled={toggleShare.isPending}
        onCheckedChange={checked => toggleShare.mutate({ activityId, share: checked })}
      />
    </div>
  );
}
