import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Metric } from "@/components/corsia/Metric";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { distanceParts, formatDayMonthYear, formatDurationParts, NO_VALUE } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CELEBRATION_LAYER, useCelebrationsAllowed } from "@/hooks/useCelebrationGate";

/**
 * «Analisi pronta» after a sync: the newest pending analyses, marked seen when the dialog closes
 * (Esc, a tap outside, «Chiudi» or «Apri l'analisi»). Queued while the cookie banner or the
 * onboarding is open (useCelebrationsAllowed).
 */
export default function ActivityInsightNotification() {
  const { isAuthenticated } = useAuth();
  const allowed = useCelebrationsAllowed();
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

  if (!newest || !allowed) return null;

  const distance = distanceParts(newest.activity_distance_meters);
  const duration = formatDurationParts(newest.activity_duration_seconds);
  const date = newest.activity_date ? formatDayMonthYear(newest.activity_date) : NO_VALUE;
  const metrics = [
    distance.unit ? { value: distance.value, unit: distance.unit, label: "Distanza" } : null,
    duration ? { ...duration, label: "Durata" } : null,
  ].filter((metric): metric is { value: string; unit: string; label: string } => metric !== null);

  return (
    <Dialog open={isVisible} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent
        showCloseButton={false}
        overlayClassName={CELEBRATION_LAYER}
        className={cn("max-h-[85dvh] overflow-y-auto rounded-2xl bg-card p-6 shadow-none sm:max-w-lg", CELEBRATION_LAYER)}
      >
        <div className="flex items-start gap-3">
          <span aria-hidden className="rounded-full bg-raised p-2 text-action-text">
            <Sparkles className="size-5" />
          </span>
          <div>
            <DialogTitle className="text-[17px] font-bold leading-snug">
              Analisi della tua ultima nuotata pronta
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm text-muted-foreground">
              Abbiamo generato una nuova analisi della sessione appena importata. Aprila nel Coach AI per leggerla e
              confrontarla con le altre.
            </DialogDescription>
          </div>
        </div>

        {metrics.length > 0 || date !== NO_VALUE ? (
          <div className="rounded-xl bg-raised p-4">
            {date !== NO_VALUE ? <p className="text-sm text-muted-foreground">Nuotata del {date}</p> : null}
            {metrics.length > 0 ? (
              <ul className="mt-3 grid grid-cols-2 gap-4">
                {metrics.map((metric) => (
                  <li key={metric.label}>
                    <Metric {...metric} size="sm" />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {pendingCount > 1 ? (
          <p className="text-sm text-muted-foreground">{pendingCount} nuove analisi disponibili</p>
        ) : null}

        <div className="space-y-2">
          <Button asChild className="w-full">
            <Link href="/coach?tab=session-iq" onClick={handleClose}>
              Apri l&apos;analisi
            </Link>
          </Button>
          <Button variant="outline" className="w-full" onClick={handleClose}>
            Chiudi
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
