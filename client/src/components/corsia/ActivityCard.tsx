import { Waves } from "lucide-react";
import { Link } from "wouter";
import { Chip } from "./Chip";
import { Metric } from "./Metric";
import { cn } from "@/lib/utils";
import {
  formatDurationParts,
  formatKm,
  formatPaceValue,
  formatSessionDate,
  paceSecondsPer100m,
} from "@/lib/format";

export type ActivityCardData = {
  id: number;
  activityName?: string | null;
  activityDate: string | Date;
  distanceMeters: number;
  durationSeconds: number;
  avgPacePer100m?: number | null;
  avgHeartRate?: number | null;
  xpEarned?: number | null;
  isOpenWater?: boolean | null;
  poolLengthMeters?: number | null;
};

/** Corsia activity card: icon tile, title, date, XP chip, up to four metrics. */
export function ActivityCard({
  activity,
  href,
  onSelect,
  selected = false,
}: {
  activity: ActivityCardData;
  href?: string;
  onSelect?: () => void;
  selected?: boolean;
}) {
  const openWater = Boolean(activity.isOpenWater);
  const where = openWater
    ? "Acque libere"
    : `Vasca ${activity.poolLengthMeters ?? 25}m`;
  const duration = formatDurationParts(activity.durationSeconds);
  const pace = paceSecondsPer100m(activity);
  const body = (
    <>
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "inline-flex size-12 shrink-0 items-center justify-center rounded-xl",
            openWater
              ? "bg-success/15 text-success"
              : "bg-primary/15 text-action-text"
          )}
        >
          <Waves className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-bold">
            {activity.activityName || "Nuotata"}
          </p>
          <p className="truncate text-sm text-muted-foreground">
            {formatSessionDate(activity.activityDate)} · {where}
          </p>
        </div>
        {activity.xpEarned ? (
          <Chip tone="xp">+{activity.xpEarned}</Chip>
        ) : null}
      </div>
      <div className="mt-4 grid grid-cols-4 gap-3 border-t border-border pt-4">
        <Metric
          value={formatKm(activity.distanceMeters)}
          unit="km"
          label="Distanza"
        />
        {duration ? (
          <Metric value={duration.value} unit={duration.unit} label="Durata" />
        ) : null}
        {pace ? (
          <Metric
            value={formatPaceValue(pace)}
            label="Passo /100"
            tone="action"
          />
        ) : null}
        {activity.avgHeartRate ? (
          <Metric
            value={String(Math.round(activity.avgHeartRate))}
            label="FC media"
          />
        ) : null}
      </div>
    </>
  );
  const className = cn(
    "surface-panel block w-full p-4 text-left transition-colors hover:border-action-text/40",
    selected && "border-action-text"
  );
  if (onSelect)
    return (
      <button
        type="button"
        onClick={onSelect}
        className={className}
        aria-pressed={selected}
      >
        {body}
      </button>
    );
  return (
    <Link href={href ?? `/track/${activity.id}`} className={className}>
      {body}
    </Link>
  );
}
