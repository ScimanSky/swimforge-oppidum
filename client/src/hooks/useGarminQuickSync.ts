import { useCallback } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export const GARMIN_CONNECT_PATH = "/settings?tab=connections";
const QUICK_SYNC_DAYS = 7;

type GarminSyncResult = {
  synced?: number;
  error?: string;
  detectedPbs?: unknown[];
};

/**
 * One-tap Garmin sync (last 7 days) shared by the «Crea» sheet and the Today screen.
 * Not connected → opens the connections tab of the settings instead of syncing.
 */
export function useGarminQuickSync() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const statusQuery = trpc.garmin.status.useQuery(undefined, {
    staleTime: 300_000,
  });
  const syncMutation = trpc.garmin.sync.useMutation({
    onSuccess: (data: GarminSyncResult) => {
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      toast.success(`${data?.synced ?? 0} attività sincronizzate!`);
      if (Array.isArray(data?.detectedPbs) && data.detectedPbs.length > 0) {
        toast.success(`Nuovi PB rilevati: ${data.detectedPbs.length}`);
      }
      utils.activities.list.invalidate();
      utils.profile.get.invalidate();
    },
    onError: error => {
      toast.error("Errore nella sincronizzazione: " + error.message);
    },
  });

  const connected: boolean | undefined = statusQuery.data?.connected;
  const isPending = syncMutation.isPending;
  const mutate = syncMutation.mutate;

  const sync = useCallback(async () => {
    if (isPending) return;
    let isConnected = connected;
    if (isConnected === undefined) {
      try {
        isConnected = (await utils.garmin.status.fetch()).connected;
      } catch {
        toast.error("Non riesco a verificare il collegamento Garmin");
        return;
      }
    }
    if (!isConnected) {
      navigate(GARMIN_CONNECT_PATH);
      return;
    }
    mutate({ daysBack: QUICK_SYNC_DAYS });
  }, [connected, isPending, mutate, navigate, utils]);

  return { sync, isPending, connected };
}
