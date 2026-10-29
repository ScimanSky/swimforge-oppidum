import { cn } from "@/lib/utils";

interface HistoryMetricCircleProps {
  label: string;
  value: string;
  /** A new personal record: the value takes the record colour. */
  highlight?: boolean;
  size?: "sm" | "md";
}

/**
 * A number of the club history (time, points, results) as a small Corsia metric on a raised
 * tile: Barlow value, 12px label, no ring, glow or pulse. The name is historical.
 */
export default function HistoryMetricCircle({
  label,
  value,
  highlight = false,
  size = "md",
}: HistoryMetricCircleProps) {
  return (
    <span className={cn("block shrink-0 rounded-xl bg-raised px-3 py-2", size === "sm" ? "min-w-14" : "min-w-20")}>
      <span
        className={cn(
          "block whitespace-nowrap font-display font-bold leading-none tabular-nums",
          size === "sm" ? "text-lg" : "text-[22px]",
          highlight ? "text-xp" : "text-foreground"
        )}
      >
        {value}
      </span>{" "}
      <span className="mt-1 block text-xs font-medium text-muted-foreground">{label}</span>
    </span>
  );
}
