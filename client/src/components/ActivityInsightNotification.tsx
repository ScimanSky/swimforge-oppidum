import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { Link } from "wouter";

function formatDistance(meters?: number | null) {
  if (!meters) return null;
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${meters} m`;
}

function formatTime(seconds?: number | null) {
  if (!seconds) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function formatDate(date?: string | null) {
  if (!date) return null;
  return new Date(date).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ActivityInsightNotification() {
  const { isAuthenticated } = useAuth();
  const [queue, setQueue] = useState<any[]>([]);
  const [isVisible, setIsVisible] = useState(false);

  const pendingQuery = trpc.activityInsights.pending.useQuery(
    { limit: 3 },
    {
      enabled: isAuthenticated,
      refetchInterval: 120000,
      refetchOnWindowFocus: true,
    }
  );

  const markSeen = trpc.activityInsights.markSeen.useMutation();

  useEffect(() => {
    if (!pendingQuery.data || pendingQuery.data.length === 0) return;
    if (queue.length > 0) return;
    setQueue(pendingQuery.data as any[]);
    setIsVisible(true);
  }, [pendingQuery.data]);

  const newest = queue[0] as any;
  const pendingCount = queue.length;

  const handleClose = () => {
    if (!queue.length) return;
    queue.forEach((item) => {
      if (item?.activity_id) {
        markSeen.mutate({ activityId: item.activity_id });
      }
    });
    setIsVisible(false);
    setTimeout(() => {
      setQueue([]);
    }, 250);
  };

  if (!newest) return null;

  const distance = formatDistance(newest.activity_distance_meters);
  const duration = formatTime(newest.activity_duration_seconds);
  const date = formatDate(newest.activity_date);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.9, y: 30 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 30 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
            className="relative max-w-lg w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 via-blue-500/10 to-purple-500/20 rounded-3xl blur-2xl" />
            <div className="relative bg-gradient-to-br from-[oklch(0.23_0.07_220)] to-[oklch(0.12_0.05_220)] rounded-3xl border border-cyan-400/30 shadow-2xl max-h-[70vh] flex flex-col">
              <div className="p-6 pb-2">
                <div className="flex items-center gap-2 text-cyan-200 text-xs uppercase tracking-wider mb-4">
                  <Sparkles className="h-4 w-4" />
                  Analisi pronta
                </div>
                <h2 className="text-xl font-bold text-white mb-2">
                  Analisi della tua ultima nuotata pronta
                </h2>
                <p className="text-white/70 text-sm leading-relaxed mb-4">
                  Abbiamo generato una nuova analisi della sessione appena importata.
                  Apri Session IQ per leggerla e confrontarla con le altre.
                </p>

                {(distance || duration || date) && (
                  <div className="flex flex-wrap gap-3 text-xs text-white/60 mb-2">
                    {distance && <span>🏊 {distance}</span>}
                    {duration && <span>⏱ {duration}</span>}
                    {date && <span>📅 {date}</span>}
                  </div>
                )}

                {pendingCount > 1 && (
                  <div className="text-xs text-white/50">
                    {pendingCount} nuove analisi disponibili
                  </div>
                )}
              </div>
              <div className="p-6 pt-2">
                <Link href="/session-iq">
                  <Button
                    className="w-full bg-[var(--gold)] text-[var(--navy)] hover:bg-[var(--gold-light)]"
                    onClick={handleClose}
                  >
                    Apri Session IQ
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  className="w-full mt-2 text-white/70 hover:text-white hover:bg-white/10"
                  onClick={handleClose}
                >
                  Chiudi
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
