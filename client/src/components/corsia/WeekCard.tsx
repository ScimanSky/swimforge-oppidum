import { useId } from "react";
import { formatInteger, formatKm } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WeekSummary } from "@/lib/week-summary";
import { Metric } from "./Metric";
import { WeekBars } from "./WeekBars";

/**
 * «Questa settimana» (Corsia, top of `renders/Attivita.png`): kilometres, sessions and XP of
 * the week as text, bars Mon-Sun on the right (decorative). Used by Oggi and the Activities list.
 */
export function WeekCard({
  summary,
  className,
}: {
  summary: WeekSummary;
  className?: string;
}) {
  const titleId = useId();
  const { totalMeters, sessions, xp, days } = summary;
  return (
    <section
      aria-labelledby={titleId}
      className={cn("surface-panel p-5", className)}
    >
      <h2 id={titleId} className="text-sm font-medium text-muted-foreground">
        Questa settimana
      </h2>
      <div className="mt-2 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <Metric
            value={formatKm(totalMeters)}
            unit="km"
            label="Distanza"
            size="xl"
          />
          <p className="mt-2 flex flex-wrap gap-x-3 text-[15px] text-muted-foreground">
            <span>{sessions === 1 ? "1 nuotata" : `${sessions} nuotate`}</span>
            {xp > 0 ? (
              <span className="font-semibold text-xp tabular-nums">
                +{formatInteger(xp)} XP
              </span>
            ) : null}
          </p>
        </div>
        <WeekBars days={days} />
      </div>
    </section>
  );
}
