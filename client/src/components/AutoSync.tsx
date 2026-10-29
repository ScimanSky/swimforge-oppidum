import { useEffect, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { normalizePath, TODAY_PATH } from "@/lib/navigation";

const AUTO_SYNC_DEBOUNCE_MS = 2 * 60 * 1000;
const LAST_AUTO_SYNC_KEY = "swimforge:autoSync:last";
const DASHBOARD_READY_KEY = "swimforge:autoSync:dashboardReady";
/** Landing pages after sign-in: visiting one arms the automatic sync. */
const SYNC_READY_PATHS = new Set([TODAY_PATH, "/home", "/track", "/dashboard"]);

export function AutoSync() {
  const { isAuthenticated } = useAuth();
  const [location] = useLocation();
  const autoSyncMutation = trpc.sync.auto.useMutation();
  const utils = trpc.useUtils();
  const syncIntervalHours = Number(
    import.meta.env.VITE_AUTO_SYNC_INTERVAL_HOURS || "6"
  );
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (SYNC_READY_PATHS.has(normalizePath(location))) {
      localStorage.setItem(DASHBOARD_READY_KEY, "1");
      setIsReady(true);
      return;
    }

    if (localStorage.getItem(DASHBOARD_READY_KEY) === "1") {
      setIsReady(true);
    }
  }, [location]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!isReady) return;

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
            void utils.badges.getUserAchievementBadges.invalidate();
            void utils.badges.checkNewBadges.invalidate();
            // Swim metrics (Statistiche, Coach, the profile's streak) and personal records.
            void utils.statistics.invalidate();
            void utils.records.invalidate();
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
  }, [isAuthenticated, isReady, syncIntervalHours]);

  return null;
}

export default AutoSync;
