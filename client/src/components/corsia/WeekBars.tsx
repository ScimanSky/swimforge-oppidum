import { cn } from "@/lib/utils";
import type { WeekDay } from "@/lib/week-summary";

/**
 * Seven bars Mon-Sun; today in the action colour.
 * Decorative (`aria-hidden`): the caller must also render the week totals as text
 * (metres, sessions), otherwise screen readers get nothing.
 */
export function WeekBars({ days }: { days: readonly WeekDay[] }) {
  const max = Math.max(1, ...days.map(day => day.meters));
  return (
    <div className="flex shrink-0 items-end gap-1.5" aria-hidden>
      {days.map((day, index) => (
        <div key={index} className="flex w-4 flex-col items-center gap-1.5">
          <div className="flex h-16 w-full items-end">
            <div
              className={cn(
                "w-full rounded-md",
                day.isToday ? "bg-primary" : "bg-muted-foreground/30"
              )}
              style={{
                height:
                  day.meters > 0
                    ? `${Math.max(12, (day.meters / max) * 100)}%`
                    : "4px",
              }}
            />
          </div>
          <span
            className={cn(
              "text-xs",
              day.isToday ? "font-semibold text-foreground" : "text-muted-foreground"
            )}
          >
            {day.label}
          </span>
        </div>
      ))}
    </div>
  );
}
