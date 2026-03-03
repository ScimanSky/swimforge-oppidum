import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Trophy } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { formatSwimCentiseconds } from "@/lib/swimTime";

type PbCelebrationEvent = {
  id: number;
  createdAt: string | Date;
  strokeType: "freestyle" | "backstroke" | "breaststroke" | "butterfly" | "mixed";
  distanceMeters: number;
  poolLengthMeters: 25 | 50;
  source: "official" | "training";
  newTimeCs: number;
  previousTimeCs: number | null;
  improvementCs: number | null;
};

const LAST_SEEN_KEY = "swimforge:pbCelebration:lastSeenEventId";

const strokeLabels: Record<PbCelebrationEvent["strokeType"], string> = {
  freestyle: "Stile libero",
  backstroke: "Dorso",
  breaststroke: "Rana",
  butterfly: "Farfalla",
  mixed: "Misti",
};

function getLastSeenId() {
  if (typeof window === "undefined") return 0;
  const parsed = Number(window.localStorage.getItem(LAST_SEEN_KEY) ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function setLastSeenId(nextId: number) {
  if (typeof window === "undefined") return;
  const previous = getLastSeenId();
  const value = Math.max(previous, nextId);
  window.localStorage.setItem(LAST_SEEN_KEY, String(value));
}

export default function PbCelebrationNotification() {
  const { isAuthenticated } = useAuth();
  const [queue, setQueue] = useState<PbCelebrationEvent[]>([]);

  const pendingQuery = trpc.records.pendingCelebrations.useQuery(
    { limit: 8 },
    {
      enabled: isAuthenticated,
      refetchInterval: 60_000,
      refetchOnWindowFocus: true,
    }
  );

  useEffect(() => {
    const events = (pendingQuery.data?.events ?? []) as PbCelebrationEvent[];
    if (!events.length || queue.length > 0) return;
    const lastSeenId = getLastSeenId();
    const unseen = events
      .filter((event) => Number(event.id) > lastSeenId)
      .sort((a, b) => Number(a.id) - Number(b.id));
    if (unseen.length > 0) {
      setQueue(unseen);
    }
  }, [pendingQuery.data, queue.length]);

  const current = queue[0];

  const markCurrentAsSeenAndAdvance = () => {
    if (!current) return;
    setLastSeenId(Number(current.id));
    setQueue((prev) => prev.slice(1));
  };

  const dismissAll = () => {
    if (!queue.length) return;
    const maxId = Math.max(...queue.map((event) => Number(event.id)));
    setLastSeenId(maxId);
    setQueue([]);
  };

  const title = useMemo(() => {
    if (!current) return "";
    return `${strokeLabels[current.strokeType]} ${current.distanceMeters}m`;
  }, [current]);

  if (!current) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm px-4"
      >
        <motion.div
          initial={{ scale: 0.92, y: 24 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 24 }}
          transition={{ type: "spring", stiffness: 220, damping: 24 }}
          className="w-full max-w-md rounded-3xl border border-amber-400/40 bg-gradient-to-br from-[oklch(0.20_0.05_220)] to-[oklch(0.11_0.03_220)] p-6 shadow-2xl"
        >
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-amber-500/10 px-3 py-1 text-xs uppercase tracking-wide text-amber-200">
            <Trophy className="h-3.5 w-3.5" />
            Nuovo personal best
          </div>

          <h2 className="text-2xl font-display font-bold text-white">{title}</h2>
          <p className="mt-1 text-sm text-white/70">
            Vasca {current.poolLengthMeters}m · import da sync Garmin
          </p>

          <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-wide text-white/60">Nuovo tempo</p>
            <p className="mt-1 text-3xl font-display font-bold text-amber-300">
              {formatSwimCentiseconds(current.newTimeCs)}
            </p>
            {current.previousTimeCs ? (
              <p className="mt-2 text-sm text-white/75">
                Da {formatSwimCentiseconds(current.previousTimeCs)} a {formatSwimCentiseconds(current.newTimeCs)}
                {current.improvementCs && current.improvementCs > 0
                  ? ` (-${formatSwimCentiseconds(current.improvementCs)})`
                  : ""}
              </p>
            ) : (
              <p className="mt-2 text-sm text-white/75">Primo PB registrato per questa distanza.</p>
            )}
          </div>

          <div className="mt-5 space-y-2">
            <Link href="/home">
              <Button className="w-full" variant="neon" onClick={dismissAll}>
                Condividi nel feed
              </Button>
            </Link>
            <Button className="w-full" variant="outline-neon" onClick={markCurrentAsSeenAndAdvance}>
              {queue.length > 1 ? "Prossimo PB" : "Chiudi"}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
