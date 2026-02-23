interface HistoryMetricCircleProps {
  label: string;
  value: string;
  highlight?: boolean;
}

export default function HistoryMetricCircle({
  label,
  value,
  highlight = false,
}: HistoryMetricCircleProps) {
  return (
    <div
      className={[
        "flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-full border text-center",
        "bg-background/45 backdrop-blur-sm",
        highlight
          ? "border-amber-300/80 text-amber-200 shadow-[0_0_16px_rgba(251,191,36,0.28)] animate-pulse"
          : "border-border/70 text-[var(--electric-cyan)]",
      ].join(" ")}
      title={`${label}: ${value}`}
    >
      <span className="max-w-[64px] truncate text-[9px] font-semibold uppercase tracking-wide opacity-80">
        {label}
      </span>
      <span className="mt-0.5 max-w-[64px] truncate text-xs font-bold leading-tight">
        {value}
      </span>
    </div>
  );
}
