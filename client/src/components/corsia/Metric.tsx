import { cn } from "@/lib/utils";

type MetricTone = "default" | "action" | "xp";
const TONE: Record<MetricTone, string> = {
  default: "text-foreground",
  action: "text-action-text",
  xp: "text-xp",
};
const SIZE = {
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

/** Corsia metric: big Barlow number, small grey unit, 12px label. */
export function Metric({
  value,
  unit,
  label,
  tone = "default",
  size = "md",
  className,
}: MetricProps) {
  return (
    <div className={cn("min-w-0", className)}>
      <p
        className={cn(
          "font-display font-bold leading-none tabular-nums",
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
      </p>
      <p className="mt-1.5 truncate text-xs font-medium text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
