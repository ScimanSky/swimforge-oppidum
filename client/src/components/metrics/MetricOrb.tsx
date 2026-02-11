import { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

type MetricTone = "auto" | "cyan" | "lime" | "sky" | "amber" | "coral";
type OrbSize = "sm" | "md" | "lg";

const TONE_RING: Record<Exclude<MetricTone, "auto">, string> = {
  cyan: "var(--electric-cyan)",
  lime: "var(--electric-lime)",
  sky: "var(--chart-3)",
  amber: "var(--chart-4)",
  coral: "var(--electric-coral)",
};

const SIZE_CLASSES: Record<OrbSize, string> = {
  sm: "size-[110px] sm:size-[116px]",
  md: "size-[122px] sm:size-[130px]",
  lg: "size-[136px] sm:size-[146px]",
};

const ICON_WRAP_CLASSES: Record<OrbSize, string> = {
  sm: "size-6",
  md: "size-7",
  lg: "size-8",
};

const VALUE_CLASSES: Record<OrbSize, string> = {
  sm: "text-sm sm:text-base",
  md: "text-base sm:text-lg",
  lg: "text-lg sm:text-xl",
};

const PROGRESS_CLASSES: Record<OrbSize, string> = {
  sm: "text-[9px]",
  md: "text-[10px]",
  lg: "text-[11px]",
};

const LABEL_CLASSES: Record<OrbSize, string> = {
  sm: "text-[10px]",
  md: "text-[11px]",
  lg: "text-xs",
};

const HELPER_CLASSES: Record<OrbSize, string> = {
  sm: "text-[10px]",
  md: "text-[11px]",
  lg: "text-xs",
};

function getAdaptiveValueClass(value: ReactNode, size: OrbSize) {
  const base = VALUE_CLASSES[size];
  const textValue =
    typeof value === "string" || typeof value === "number" ? String(value) : "";
  const length = textValue.length;

  if (length < 7) return base;
  if (length < 9) {
    if (size === "sm") return "text-xs sm:text-sm";
    if (size === "md") return "text-sm sm:text-base";
    return "text-base sm:text-lg";
  }
  if (length < 12) {
    if (size === "sm") return "text-[11px] sm:text-xs";
    if (size === "md") return "text-xs sm:text-sm";
    return "text-sm sm:text-base";
  }
  if (size === "sm") return "text-[10px] sm:text-[11px]";
  if (size === "md") return "text-[11px] sm:text-xs";
  return "text-xs sm:text-sm";
}

const getAutoRing = (progress: number) => {
  if (progress >= 80) return TONE_RING.lime;
  if (progress >= 55) return TONE_RING.cyan;
  if (progress >= 35) return TONE_RING.sky;
  if (progress >= 20) return TONE_RING.amber;
  return TONE_RING.coral;
};

export interface MetricOrbProps {
  label: string;
  value: ReactNode;
  progress: number;
  helper?: ReactNode;
  icon?: ReactNode;
  tone?: MetricTone;
  size?: OrbSize;
  className?: string;
}

export function MetricOrb({
  label,
  value,
  progress,
  helper,
  icon,
  tone = "auto",
  size = "md",
  className,
}: MetricOrbProps) {
  const reduceMotion = useReducedMotion();
  const safeProgress = Math.max(0, Math.min(100, Number.isFinite(progress) ? progress : 0));
  const ringColor = tone === "auto" ? getAutoRing(safeProgress) : TONE_RING[tone];

  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - safeProgress / 100);

  return (
    <motion.div
      className={cn(
        "group/orb relative flex flex-col items-center gap-2 px-1 py-1",
        className,
      )}
      whileHover={reduceMotion ? undefined : { y: -2, scale: 1.01 }}
      transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 24 }}
    >
      <div
        className={cn(
          "relative isolate flex items-center justify-center rounded-full",
          "bg-[radial-gradient(circle_at_30%_25%,color-mix(in_oklch,var(--card)_85%,white_15%),color-mix(in_oklch,var(--card)_94%,transparent)_70%)]",
          "shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--border)_90%,transparent)]",
          SIZE_CLASSES[size],
        )}
        style={{
          boxShadow: `0 0 0 1px color-mix(in oklch, var(--border) 85%, transparent), 0 0 34px color-mix(in oklch, ${ringColor} 30%, transparent)`,
        }}
      >
        <svg
          viewBox="0 0 120 120"
          className="absolute inset-0 h-full w-full -rotate-90"
          aria-hidden="true"
        >
          <circle
            cx="60"
            cy="60"
            r={radius}
            stroke="color-mix(in oklch, var(--border) 86%, transparent)"
            strokeWidth="8"
            fill="none"
          />
          <motion.circle
            cx="60"
            cy="60"
            r={radius}
            stroke={ringColor}
            strokeWidth="8"
            fill="none"
            strokeDasharray={circumference}
            strokeLinecap="round"
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: dashOffset }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: 0.85, ease: [0.2, 0.9, 0.2, 1] }
            }
            style={{
              filter: `drop-shadow(0 0 12px color-mix(in oklch, ${ringColor} 60%, transparent))`,
            }}
          />
        </svg>

        <div className="relative z-10 flex flex-col items-center justify-center gap-0.5 px-2 text-center">
          {icon ? (
            <div
              className={cn("flex items-center justify-center rounded-full text-foreground/90", ICON_WRAP_CLASSES[size])}
              style={{ background: `color-mix(in oklch, ${ringColor} 24%, transparent)` }}
            >
              {icon}
            </div>
          ) : null}
          <div
            className={cn(
              "max-w-full whitespace-nowrap font-display font-bold leading-[1.05] tracking-tight text-foreground drop-shadow-[0_1px_6px_color-mix(in_oklch,var(--background)_75%,transparent)]",
              getAdaptiveValueClass(value, size)
            )}
          >
            {value}
          </div>
        </div>
        <div
          className={cn(
            "absolute bottom-1.5 left-1/2 z-20 min-w-[2.4rem] -translate-x-1/2 rounded-full border border-border/80 bg-background/92 px-1.5 py-0.5 text-center font-semibold uppercase leading-none tracking-[0.14em] text-foreground shadow-[0_6px_20px_color-mix(in_oklch,var(--foreground)_18%,transparent)] backdrop-blur-sm",
            PROGRESS_CLASSES[size]
          )}
        >
          {Math.round(safeProgress)}%
        </div>
      </div>

      <div className="w-full text-center">
        <div className={cn("font-semibold uppercase tracking-[0.14em] text-muted-foreground", LABEL_CLASSES[size])}>
          {label}
        </div>
        {helper ? <div className={cn("mt-1 text-foreground/85", HELPER_CLASSES[size])}>{helper}</div> : null}
      </div>
    </motion.div>
  );
}

export default MetricOrb;
