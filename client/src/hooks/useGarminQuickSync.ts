import { useCallback, useSyncExternalStore } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export const GARMIN_CONNECT_PATH = "/settings?tab=connections";
/** One toast for the whole sync: the loading toast is replaced by the outcome. */
export const GARMIN_SYNC_TOAST_ID = "garmin-quick-sync";
const QUICK_SYNC_DAYS = 7;

/**
 * Shared by every instance of the hook (the «Crea» sheet in the shell and the Today button
 * are mounted together): `inFlight` covers the status check and the mutation, so only one
 * sync can start; `syncing` is the mutation itself, shown as «Sincronizzazione…» everywhere.
 */
const syncState = { inFlight: false, syncing: false };
const listeners = new Set<() => void>();
const setSyncState = (next: Partial<typeof syncState>) => {
  Object.assign(syncState, next);
  listeners.forEach(listener => listener());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getSyncing = () => syncState.syncing;

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
  const sharedSyncing = useSyncExternalStore(subscribe, getSyncing, getSyncing);
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
      // The coach summary of the new swim (Today).
      utils.activityInsights.list.invalidate();
      // Swim metrics (Statistiche, Coach, the profile's streak) and personal records.
      void utils.statistics.invalidate();
      void utils.records.invalidate();
    },
    onError: error => {
      toast.error("Errore nella sincronizzazione: " + error.message, {
        id: GARMIN_SYNC_TOAST_ID,
      });
    },
    onSettled: () => {
      setSyncState({ inFlight: false, syncing: false });
    },
  });

  const connected: boolean | undefined = statusQuery.data?.connected;
  const mutate = syncMutation.mutate;

  const sync = useCallback(async () => {
    // Covers the status check and the mutation: a double tap starts one sync.
    if (syncState.inFlight) return;
    setSyncState({ inFlight: true });
    let isConnected = connected;
    if (isConnected === undefined) {
      try {
        isConnected = (await utils.garmin.status.fetch()).connected;
      } catch {
        setSyncState({ inFlight: false });
        toast.error("Non riesco a verificare il collegamento Garmin");
        return;
      }
    }
    if (!isConnected) {
      setSyncState({ inFlight: false });
      navigate(GARMIN_CONNECT_PATH);
      return;
    }
    toast.loading("Sincronizzazione Garmin…", { id: GARMIN_SYNC_TOAST_ID });
    setSyncState({ syncing: true });
    mutate({ daysBack: QUICK_SYNC_DAYS });
  }, [connected, mutate, navigate, utils]);

  // The shared flag is set before mutate and cleared on settle: it covers this instance's
  // mutation too.
  return { sync, isPending: sharedSyncing, connected };
}

/** Tests only: clears the module-level guard a test may leave set (a sync never settled). */
export function resetGarminQuickSyncForTests() {
  setSyncState({ inFlight: false, syncing: false });
}
