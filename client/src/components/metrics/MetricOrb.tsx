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
  sm: "size-[148px]",
  md: "size-[168px]",
  lg: "size-[188px]",
};

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

  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - safeProgress / 100);

  return (
    <motion.div
      className={cn(
        "group/orb relative flex flex-col items-center gap-3 px-1 py-1",
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
            strokeWidth="10"
            fill="none"
          />
          <motion.circle
            cx="60"
            cy="60"
            r={radius}
            stroke={ringColor}
            strokeWidth="10"
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

        <div className="relative z-10 flex flex-col items-center justify-center gap-1 text-center">
          {icon ? (
            <div
              className="flex size-8 items-center justify-center rounded-full text-foreground/90"
              style={{ background: `color-mix(in oklch, ${ringColor} 24%, transparent)` }}
            >
              {icon}
            </div>
          ) : null}
          <div className="text-2xl font-display font-bold leading-none text-foreground">{value}</div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {Math.round(safeProgress)}%
          </div>
        </div>
      </div>

      <div className="w-full text-center">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </div>
        {helper ? <div className="mt-1 text-xs text-foreground/85">{helper}</div> : null}
      </div>
    </motion.div>
  );
}

export default MetricOrb;
