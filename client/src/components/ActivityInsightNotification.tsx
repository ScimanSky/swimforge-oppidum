import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

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
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  const pendingQuery = trpc.activityInsights.pending.useQuery(
    { limit: 3 },
    {
      enabled: isAuthenticated,
      refetchInterval: 120000,
      refetchOnWindowFocus: true,
    }
  );

  const markSeen = trpc.activityInsights.markSeen.useMutation({
    onSuccess: () => pendingQuery.refetch(),
  });

  useEffect(() => {
    if (!pendingQuery.data || pendingQuery.data.length === 0) return;
    if (queue.length > 0) return;
    setQueue(pendingQuery.data as any[]);
    setCurrentIndex(0);
    setIsVisible(true);
  }, [pendingQuery.data]);

  const current = queue[currentIndex] as any;
  const bullets = useMemo(() => {
    if (!current?.bullets) return [];
    if (Array.isArray(current.bullets)) return current.bullets;
    try {
      return JSON.parse(current.bullets);
    } catch {
      return [];
    }
  }, [current]);

  const tags = useMemo(() => {
    if (!current?.tags) return [];
    if (Array.isArray(current.tags)) return current.tags;
    try {
      return JSON.parse(current.tags);
    } catch {
      return [];
    }
  }, [current]);

  const handleNext = () => {
    if (!current) return;
    markSeen.mutate({ activityId: current.activity_id });

    if (currentIndex < queue.length - 1) {
      setIsVisible(false);
      setTimeout(() => {
        setCurrentIndex((idx) => idx + 1);
        setIsVisible(true);
      }, 250);
    } else {
      setIsVisible(false);
      setTimeout(() => {
        setQueue([]);
        setCurrentIndex(0);
      }, 250);
    }
  };

  if (!current) return null;

  const distance = formatDistance(current.activity_distance_meters);
  const duration = formatTime(current.activity_duration_seconds);
  const date = formatDate(current.activity_date);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={handleNext}
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
            <div className="relative bg-gradient-to-br from-[oklch(0.23_0.07_220)] to-[oklch(0.12_0.05_220)] rounded-3xl p-6 border border-cyan-400/30 shadow-2xl">
              <div className="flex items-center gap-2 text-cyan-200 text-xs uppercase tracking-wider mb-4">
                <Sparkles className="h-4 w-4" />
                Analisi sessione
              </div>
              <h2 className="text-xl font-bold text-white mb-2">{current.title}</h2>
              <p className="text-white/70 text-sm leading-relaxed mb-4">{current.summary}</p>

              {(distance || duration || date) && (
                <div className="flex flex-wrap gap-3 text-xs text-white/60 mb-4">
                  {distance && <span>🏊 {distance}</span>}
                  {duration && <span>⏱ {duration}</span>}
                  {date && <span>📅 {date}</span>}
                </div>
              )}

              {bullets.length > 0 && (
                <ul className="space-y-2 text-sm text-white/80 mb-4">
                  {bullets.map((item: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-cyan-300">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}

              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {tags.map((tag: string, idx: number) => (
                    <span
                      key={idx}
                      className="text-xs px-2 py-1 rounded-full bg-white/10 text-white/70"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <Button className="w-full bg-[var(--gold)] text-[var(--navy)] hover:bg-[var(--gold-light)]" onClick={handleNext}>
                Continua
              </Button>
              {queue.length > 1 && (
                <div className="mt-2 text-center text-xs text-white/50">
                  {currentIndex + 1} / {queue.length}
                </div>
              )}
              <div className="mt-2 text-center text-xs text-white/40">Tocca per continuare</div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
