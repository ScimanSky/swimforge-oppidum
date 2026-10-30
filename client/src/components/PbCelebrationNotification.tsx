import { useEffect, useMemo, useRef, useState } from "react";
import { Trophy } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Chip } from "@/components/corsia/Chip";
import { Metric } from "@/components/corsia/Metric";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatSwimCentiseconds } from "@/lib/swimTime";
import { buildPbSharePrefill } from "@/lib/pb-share";
import { cn } from "@/lib/utils";
import { CELEBRATION_LAYER, useCelebrationsAllowed } from "@/hooks/useCelebrationGate";

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

/**
 * «Nuovo record personale» after a sync, one dialog per PB. Only its buttons and Esc (as
 * «Chiudi») close it: a stray tap outside does not mark the record seen. Queued while the
 * cookie banner or the onboarding is open (useCelebrationsAllowed).
 */
export default function PbCelebrationNotification() {
  const { isAuthenticated } = useAuth();
  const allowed = useCelebrationsAllowed();
  const [queue, setQueue] = useState<PbCelebrationEvent[]>([]);
  const openedEventIdsRef = useRef<Set<number>>(new Set());
  const trackCelebrationAction = trpc.records.trackCelebrationAction.useMutation();

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

  // Only a record on screen counts: none while it waits behind the banner or the tour.
  const current = allowed ? queue[0] : undefined;

  useEffect(() => {
    if (!current) return;
    const currentId = Number(current.id);
    if (openedEventIdsRef.current.has(currentId)) return;
    openedEventIdsRef.current.add(currentId);
    trackCelebrationAction.mutate({
      action: "open",
      celebrationEventId: currentId,
      strokeType: current.strokeType,
      distanceMeters: current.distanceMeters,
      poolLengthMeters: current.poolLengthMeters,
      source: current.source,
      newTimeCs: current.newTimeCs,
      previousTimeCs: current.previousTimeCs,
      improvementCs: current.improvementCs,
    });
  }, [current, trackCelebrationAction]);

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

  const handleShareToFeed = () => {
    if (!current || typeof window === "undefined") return;
    trackCelebrationAction.mutate({
      action: "share_click",
      celebrationEventId: Number(current.id),
      strokeType: current.strokeType,
      distanceMeters: current.distanceMeters,
      poolLengthMeters: current.poolLengthMeters,
      source: current.source,
      newTimeCs: current.newTimeCs,
      previousTimeCs: current.previousTimeCs,
      improvementCs: current.improvementCs,
    });
    window.dispatchEvent(
      new CustomEvent("swimforge:open-create-post", {
        detail: {
          initialContent: buildPbSharePrefill(current),
          pbShareTracking: {
            celebrationEventId: Number(current.id),
            strokeType: current.strokeType,
            distanceMeters: current.distanceMeters,
            poolLengthMeters: current.poolLengthMeters,
            source: current.source,
            newTimeCs: current.newTimeCs,
            previousTimeCs: current.previousTimeCs,
            improvementCs: current.improvementCs,
          },
        },
      })
    );
    dismissAll();
  };

  if (!current) return null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) markCurrentAsSeenAndAdvance(); }}>
      <DialogContent
        showCloseButton={false}
        overlayClassName={CELEBRATION_LAYER}
        className={cn("rounded-2xl bg-card p-6 shadow-none sm:max-w-md", CELEBRATION_LAYER)}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <Chip tone="xp" className="justify-self-start">
          <Trophy className="size-4" aria-hidden />
          Nuovo record personale
        </Chip>

        <div>
          <DialogTitle className="font-display text-[30px] font-bold leading-tight">{title}</DialogTitle>
          <DialogDescription className="mt-1 text-sm text-muted-foreground">
            Vasca {current.poolLengthMeters}m · dalla sincronizzazione Garmin
          </DialogDescription>
        </div>

        <div className="rounded-xl bg-raised p-4">
          <Metric
            value={formatSwimCentiseconds(current.newTimeCs)}
            label="Nuovo tempo"
            tone="xp"
            size="lg"
          />
          {current.previousTimeCs ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Da {formatSwimCentiseconds(current.previousTimeCs)} a {formatSwimCentiseconds(current.newTimeCs)}
              {current.improvementCs && current.improvementCs > 0
                ? ` (−${formatSwimCentiseconds(current.improvementCs)})`
                : ""}
            </p>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Primo record registrato per questa distanza.</p>
          )}
        </div>

        <div className="space-y-2">
          <Button className="w-full" onClick={handleShareToFeed}>
            Condividi nel feed
          </Button>
          <Button className="w-full" variant="outline" onClick={markCurrentAsSeenAndAdvance}>
            {queue.length > 1 ? "Prossimo record" : "Chiudi"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
