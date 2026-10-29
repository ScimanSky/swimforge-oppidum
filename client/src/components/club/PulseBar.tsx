import { useId } from "react";
import { Calendar } from "lucide-react";
import { Metric } from "@/components/corsia/Metric";
import { formatInteger } from "@/lib/format";

/** `weeklyStats` of a club; counts may arrive as numbers or as Postgres bigint strings. */
export type ClubWeeklyStats = {
  posts_this_week: number | string;
  active_members: number | string;
  total_members: number | string;
  next_event: { id: number; title: string; startTime: string; eventType: string } | null;
};

interface PulseBarProps {
  stats: ClubWeeklyStats | null | undefined;
  /** The next event is for members only (non-members do not see the agenda either). */
  showNextEvent: boolean;
  className?: string;
}

function formatCountdown(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff < 0) return "In corso";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  if (days > 0) return `tra ${days}g ${hours}h`;
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  return `tra ${hours}h ${minutes}m`;
}

/** Weekly club numbers as Corsia metrics, plus the next event for members when there is one. */
export default function PulseBar({ stats, showNextEvent, className }: PulseBarProps) {
  const titleId = useId();
  if (!stats) return null;

  return (
    <section aria-labelledby={titleId} className={`surface-panel p-4 ${className ?? ""}`.trim()}>
      <h3 id={titleId} className="text-[17px] font-bold">
        Il club questa settimana
      </h3>
      {/* Short labels: three columns fit a 360px phone; the heading says «this week». */}
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Metric size="sm" value={formatInteger(stats.posts_this_week)} label="post" />
        <Metric size="sm" value={formatInteger(stats.active_members)} label="attivi" />
        <Metric size="sm" value={formatInteger(stats.total_members)} label="membri" />
      </div>
      {showNextEvent && stats.next_event ? (
        <div className="mt-4 flex items-center gap-2 border-t border-border pt-3 text-sm">
          <Calendar className="size-4 shrink-0 text-action-text" aria-hidden />
          <span className="min-w-0 flex-1 truncate font-semibold">{stats.next_event.title}</span>
          <span className="shrink-0 text-muted-foreground tabular-nums">
            {formatCountdown(stats.next_event.startTime)}
          </span>
        </div>
      ) : null}
    </section>
  );
}
