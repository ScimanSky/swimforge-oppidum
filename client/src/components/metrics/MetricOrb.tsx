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
  sm: "size-[88px] sm:size-[96px]",
  md: "size-[98px] sm:size-[106px]",
  lg: "size-[110px] sm:size-[120px]",
};

const ICON_WRAP_CLASSES: Record<OrbSize, string> = {
  sm: "size-5",
  md: "size-6",
  lg: "size-7",
};

const VALUE_CLASSES: Record<OrbSize, string> = {
  sm: "text-xs sm:text-sm",
  md: "text-sm sm:text-base",
  lg: "text-base sm:text-lg",
};

const PROGRESS_CLASSES: Record<OrbSize, string> = {
  sm: "text-[10px] sm:text-[11px]",
  md: "text-[10px] sm:text-xs",
  lg: "text-[10px] sm:text-xs",
};

const LABEL_CLASSES: Record<OrbSize, string> = {
  sm: "text-xs",
  md: "text-xs sm:text-sm",
  lg: "text-xs",
};

const HELPER_CLASSES: Record<OrbSize, string> = {
  sm: "text-xs",
  md: "text-xs sm:text-sm",
  lg: "text-xs",
};

function getAdaptiveValueClass(value: ReactNode, size: OrbSize) {
  const base = VALUE_CLASSES[size];
  const textValue =
    typeof value === "string" || typeof value === "number" ? String(value) : "";
  const length = textValue.length;

  if (length < 6) return base;
  if (length < 8) {
    if (size === "sm") return "text-[11px] sm:text-xs";
    if (size === "md") return "text-xs sm:text-sm";
    return "text-sm sm:text-base";
  }
  if (length < 10) {
    if (size === "sm") return "text-[10px] sm:text-[11px]";
    if (size === "md") return "text-[11px] sm:text-xs";
    return "text-xs sm:text-sm";
  }
  if (size === "sm") return "text-[9px] sm:text-[10px]";
  if (size === "md") return "text-[10px] sm:text-[11px]";
  return "text-[11px] sm:text-xs";
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
  const canHover =
    !reduceMotion &&
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const safeProgress = Math.max(0, Math.min(100, Number.isFinite(progress) ? progress : 0));
  const ringColor = tone === "auto" ? getAutoRing(safeProgress) : TONE_RING[tone];

  const radius = 34;
  const strokeWidth = 6;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - safeProgress / 100);

  return (
    <motion.div
      className={cn(
        "group/orb relative flex flex-col items-center gap-2 px-1 py-1",
        className,
      )}
      whileHover={canHover ? { y: -2, scale: 1.01 } : undefined}
      transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 24 }}
    >
      <div
        className={cn(
          "relative isolate flex items-center justify-center rounded-full",
          "bg-[radial-gradient(circle_at_30%_25%,color-mix(in_oklch,var(--card)_100%,white_12%),color-mix(in_oklch,var(--card)_100%,transparent)_75%)]",
          "shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--border)_100%,transparent)]",
          SIZE_CLASSES[size],
        )}
        style={{
          boxShadow: `0 0 0 1px color-mix(in oklch, var(--border) 100%, transparent), 0 0 24px color-mix(in oklch, ${ringColor} 15%, transparent)`,
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
            stroke="color-mix(in oklch, var(--border) 100%, transparent)"
            strokeWidth={strokeWidth}
            fill="none"
          />
          <motion.circle
            cx="60"
            cy="60"
            r={radius}
            stroke={ringColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeLinecap="round"
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: dashOffset }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: 0.65, ease: [0.2, 0.9, 0.2, 1] }
            }
            style={{
              filter: `drop-shadow(0 0 6px color-mix(in oklch, ${ringColor} 70%, transparent))`,
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
              "max-w-full whitespace-nowrap font-display font-bold leading-[1.05] tracking-tight neon-gradient-text drop-shadow-[0_2px_4px_black]",
              getAdaptiveValueClass(value, size)
            )}
          >
            {value}
          </div>
        </div>
        <div
          className={cn(
            "absolute bottom-0 left-1/2 z-20 min-w-[2.1rem] -translate-x-1/2 translate-y-1/2 rounded-full border border-border bg-background px-1.5 py-[2px] text-center font-semibold uppercase leading-none tracking-[0.12em] text-foreground shadow-[0_4px_12px_black] backdrop-blur-sm",
            PROGRESS_CLASSES[size]
          )}
        >
          {Math.round(safeProgress)}%
        </div>
      </div>

      <div className="w-full text-center">
        <div className={cn("max-w-full mt-3 truncate font-semibold uppercase tracking-[0.14em] text-muted-foreground", LABEL_CLASSES[size])}>
          {label}
        </div>
        {helper ? <div className={cn("mt-1 max-w-full truncate text-foreground/85", HELPER_CLASSES[size])}>{helper}</div> : null}
      </div>
    </motion.div>
  );
}

export default MetricOrb;
