import { cn } from "@/lib/utils";

type MetricTone = "default" | "action" | "xp";
const TONE: Record<MetricTone, string> = {
  default: "text-foreground",
  action: "text-action-text",
  xp: "text-xp",
};
/** sm fits four metrics in a 360px-wide card; md is the default. */
const SIZE = {
  sm: "text-[24px]",
  md: "text-[28px]",
  lg: "text-[36px]",
  xl: "text-[56px]",
} as const;

export type MetricProps = {
  value: string;
  unit?: string;
  label: string;
  tone?: MetricTone;
  size?: keyof typeof SIZE;
  className?: string;
};

/**
 * Corsia metric: big Barlow number, small grey unit, 12px label.
 * Phrasing content only (block spans), so it can sit inside a button or link.
 */
export function Metric({
  value,
  unit,
  label,
  tone = "default",
  size = "md",
  className,
}: MetricProps) {
  return (
    <span className={cn("block min-w-0", className)}>
      <span
        className={cn(
          "block whitespace-nowrap font-display font-bold leading-none tabular-nums",
          SIZE[size],
          TONE[tone]
        )}
      >
        {value}
        {unit ? (
          <span className="ml-1 text-[0.5em] font-semibold text-muted-foreground">
            {unit}
          </span>
        ) : null}
      </span>
      <span className="mt-1.5 block truncate text-xs font-medium text-muted-foreground">
        {label}
      </span>
    </span>
  );
}
