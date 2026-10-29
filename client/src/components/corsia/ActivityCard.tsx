import { Fragment, useId } from "react";
import { Waves } from "lucide-react";
import { Link } from "wouter";
import { Chip } from "./Chip";
import { Metric, type MetricProps } from "./Metric";
import { cn } from "@/lib/utils";
import { activityPlaceLabel } from "@/lib/activity-labels";
import { activityMetrics, type ActivityMetricId } from "@/lib/activity-metrics";
import { NO_VALUE, formatSessionDate } from "@/lib/format";

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

/** The four metrics a card shows, with their compact label and unit overrides. */
const CARD_METRICS: Partial<Record<ActivityMetricId, Partial<MetricProps>>> = {
  distance: {},
  duration: {},
  pace: { label: "Passo /100", unit: undefined },
  avgHr: { unit: undefined },
};

/** Either a link (default `/track/:id`) or a selectable button, never both. */
export type ActivityCardProps = { activity: ActivityCardData } & (
  | { href?: string; onSelect?: never; selected?: never }
  | { onSelect: () => void; selected?: boolean; href?: never }
);

/**
 * Corsia activity card: icon tile, title, date, XP chip, up to four metrics.
 * Phrasing content only (block spans), valid inside both `<a>` and `<button>`.
 * Accessible name = title, description = date and place.
 */
export function ActivityCard(props: ActivityCardProps) {
  const { activity } = props;
  const titleId = useId();
  const metaId = useId();
  const xpId = useId();
  const metricsId = useId();
  const openWater = Boolean(activity.isOpenWater);
  const where = activityPlaceLabel(activity);
  const date = formatSessionDate(activity.activityDate);
  // Without a date the line is just the place, never «— · Vasca».
  const meta = date === NO_VALUE ? where : `${date} · ${where}`;
  // Values from the shared builder (a metric without data is not shown); the card keeps its
  // compact choice of four, with the pace unit in the label and heart rate without «bpm».
  const metrics: (MetricProps & { id: ActivityMetricId })[] = activityMetrics(activity)
    .filter(metric => metric.id in CARD_METRICS)
    .map(metric => ({ ...metric, ...CARD_METRICS[metric.id] }));
  const body = (
    <>
      <span className="flex items-start gap-3">
        <span
          className={cn(
            "inline-flex size-12 shrink-0 items-center justify-center rounded-xl",
            openWater
              ? "bg-success/15 text-success"
              : "bg-primary/15 text-action-text"
          )}
        >
          <Waves className="size-6" aria-hidden="true" />
        </span>
        <span className="block min-w-0 flex-1">
          <span id={titleId} className="block truncate text-[17px] font-bold">
            {activity.activityName || "Nuotata"}
          </span>
          <span
            id={metaId}
            className="block truncate text-sm text-muted-foreground"
          >
            {meta}
          </span>
        </span>
        {activity.xpEarned ? (
          <Chip tone="xp">
            <span id={xpId}>
              +{activity.xpEarned} <span className="sr-only">XP</span>
            </span>
          </Chip>
        ) : null}
      </span>
      <span
        id={metricsId}
        className="mt-4 grid grid-cols-4 gap-3 border-t border-border pt-4"
      >
        {metrics.map(({ id, ...metric }) => (
          // The space keeps the metrics apart when read as text (not rendered in a grid).
          <Fragment key={id}>
            <Metric {...metric} size="sm" />{" "}
          </Fragment>
        ))}
      </span>
    </>
  );
  const a11y = {
    "aria-labelledby": titleId,
    // Date and place, XP, then the metrics: the whole card content for screen readers.
    "aria-describedby": [metaId, activity.xpEarned ? xpId : null, metricsId]
      .filter(Boolean)
      .join(" "),
  };
  const selected = props.onSelect ? Boolean(props.selected) : false;
  const className = cn(
    "surface-panel block w-full p-4 text-left transition-colors hover:border-action-text/40",
    selected && "border-action-text"
  );
  if (props.onSelect)
    return (
      <button
        type="button"
        onClick={props.onSelect}
        className={className}
        aria-current={selected ? "true" : undefined}
        {...a11y}
      >
        {body}
      </button>
    );
  return (
    <Link
      href={props.href ?? `/track/${activity.id}`}
      className={className}
      {...a11y}
    >
      {body}
    </Link>
  );
}
