import { useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export const GARMIN_CONNECT_PATH = "/settings?tab=connections";
/** One toast for the whole sync: the loading toast is replaced by the outcome. */
export const GARMIN_SYNC_TOAST_ID = "garmin-quick-sync";
const QUICK_SYNC_DAYS = 7;

type GarminSyncResult = {
  synced?: number;
  error?: string;
  detectedPbs?: unknown[];
};

/**
 * One-tap Garmin sync (last 7 days) shared by the «Crea» sheet and the Today screen.
 * Not connected → opens the connections tab of the settings instead of syncing.
 * `watchStatus` keeps the Garmin status query live (screens that show it); otherwise the
 * status is fetched on tap only.
 */
export function useGarminQuickSync({
  watchStatus = false,
}: { watchStatus?: boolean } = {}) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const inFlightRef = useRef(false);
  const statusQuery = trpc.garmin.status.useQuery(undefined, {
    staleTime: 300_000,
    enabled: watchStatus,
  });
  const syncMutation = trpc.garmin.sync.useMutation({
    onSuccess: (data: GarminSyncResult) => {
      if (data?.error) {
        toast.error(data.error, { id: GARMIN_SYNC_TOAST_ID });
        return;
      }
      toast.success(`${data?.synced ?? 0} attività sincronizzate!`, {
        id: GARMIN_SYNC_TOAST_ID,
      });
      if (Array.isArray(data?.detectedPbs) && data.detectedPbs.length > 0) {
        toast.success(`Nuovi PB rilevati: ${data.detectedPbs.length}`);
      }
      utils.activities.list.invalidate();
      utils.profile.get.invalidate();
    },
    onError: error => {
      toast.error("Errore nella sincronizzazione: " + error.message, {
        id: GARMIN_SYNC_TOAST_ID,
      });
    },
    onSettled: () => {
      inFlightRef.current = false;
    },
  });

  const connected: boolean | undefined = statusQuery.data?.connected;
  const mutate = syncMutation.mutate;

  const sync = useCallback(async () => {
    // Covers the status check and the mutation: a double tap starts one sync.
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    let isConnected = connected;
    if (isConnected === undefined) {
      try {
        isConnected = (await utils.garmin.status.fetch()).connected;
      } catch {
        inFlightRef.current = false;
        toast.error("Non riesco a verificare il collegamento Garmin");
        return;
      }
    }
    if (!isConnected) {
      inFlightRef.current = false;
      navigate(GARMIN_CONNECT_PATH);
      return;
    }
    toast.loading("Sincronizzazione Garmin…", { id: GARMIN_SYNC_TOAST_ID });
    mutate({ daysBack: QUICK_SYNC_DAYS });
  }, [connected, mutate, navigate, utils]);

  return { sync, isPending: syncMutation.isPending, connected };
}
