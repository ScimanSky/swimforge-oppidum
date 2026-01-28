import { useEffect } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

const AUTO_SYNC_DEBOUNCE_MS = 2 * 60 * 1000;
const LAST_AUTO_SYNC_KEY = "swimforge:autoSync:last";

export function AutoSync() {
  const { isAuthenticated } = useAuth();
  const autoSyncMutation = trpc.sync.auto.useMutation();
  const utils = trpc.useUtils();
  const syncIntervalHours = Number(
    import.meta.env.VITE_AUTO_SYNC_INTERVAL_HOURS || "6"
  );

  useEffect(() => {
    if (!isAuthenticated) return;

    const triggerAutoSync = (force: boolean) => {
      if (autoSyncMutation.isPending) return;
      const lastSync = Number(localStorage.getItem(LAST_AUTO_SYNC_KEY) || 0);
      const now = Date.now();
      if (now - lastSync < AUTO_SYNC_DEBOUNCE_MS) {
        return;
      }
      localStorage.setItem(LAST_AUTO_SYNC_KEY, String(now));
      const toastId = toast.loading("Sincronizzazione in corso...");
      autoSyncMutation.mutate(
        { force },
        {
          onSuccess: () => {
            toast.success("Sincronizzazione completata", { id: toastId });
            void utils.activities.list.invalidate();
            void utils.challenges.list.invalidate();
            void utils.profile.get.invalidate();
            void utils.badges.userBadges.invalidate();
            void utils.badges.progress.invalidate();
            void utils.badges.checkNewBadges.invalidate();
          },
          onError: () => {
            toast.error("Errore nella sincronizzazione", { id: toastId });
          },
        }
      );
    };

    // On app open
    triggerAutoSync(true);

    if (!Number.isFinite(syncIntervalHours) || syncIntervalHours <= 0) {
      return;
    }

    const intervalMs = syncIntervalHours * 60 * 60 * 1000;
    const id = window.setInterval(() => {
      triggerAutoSync(false);
    }, intervalMs);

    return () => window.clearInterval(id);
  }, [isAuthenticated, syncIntervalHours]);

  return null;
}

export default AutoSync;
