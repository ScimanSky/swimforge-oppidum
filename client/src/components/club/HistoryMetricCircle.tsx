interface HistoryMetricCircleProps {
  label: string;
  value: string;
  highlight?: boolean;
  tone?: "cyan" | "lime" | "amber" | "violet";
  size?: "sm" | "md";
}

export default function HistoryMetricCircle({
  label,
  value,
  highlight = false,
  tone = "cyan",
  size = "md",
}: HistoryMetricCircleProps) {
  const toneMap = {
    cyan: {
      ring: "bg-[conic-gradient(from_210deg,rgba(34,211,238,0.12),rgba(34,211,238,0.95),rgba(34,211,238,0.12))]",
      value: "text-cyan-200",
      label: "text-cyan-300/75",
      glow: "shadow-[0_0_14px_rgba(34,211,238,0.24)]",
    },
    lime: {
      ring: "bg-[conic-gradient(from_210deg,rgba(74,222,128,0.14),rgba(74,222,128,0.94),rgba(74,222,128,0.14))]",
      value: "text-lime-200",
      label: "text-lime-300/75",
      glow: "shadow-[0_0_14px_rgba(74,222,128,0.24)]",
    },
    amber: {
      ring: "bg-[conic-gradient(from_210deg,rgba(251,191,36,0.14),rgba(251,191,36,0.96),rgba(251,191,36,0.14))]",
      value: "text-amber-200",
      label: "text-amber-300/75",
      glow: "shadow-[0_0_14px_rgba(251,191,36,0.24)]",
    },
    violet: {
      ring: "bg-[conic-gradient(from_210deg,rgba(167,139,250,0.14),rgba(167,139,250,0.96),rgba(167,139,250,0.14))]",
      value: "text-violet-200",
      label: "text-violet-300/75",
      glow: "shadow-[0_0_14px_rgba(167,139,250,0.24)]",
    },
  } as const;

  const highlightMap = {
    cyan: {
      ring: "bg-[conic-gradient(from_210deg,rgba(34,211,238,0.22),rgba(34,211,238,1),rgba(34,211,238,0.22))]",
      shadow: "shadow-[0_0_18px_rgba(34,211,238,0.34)]",
      label: "text-cyan-300/85",
      value: "text-cyan-200",
    },
    lime: {
      ring: "bg-[conic-gradient(from_210deg,rgba(74,222,128,0.22),rgba(74,222,128,1),rgba(74,222,128,0.22))]",
      shadow: "shadow-[0_0_18px_rgba(74,222,128,0.34)]",
      label: "text-lime-300/85",
      value: "text-lime-200",
    },
    amber: {
      ring: "bg-[conic-gradient(from_210deg,rgba(251,191,36,0.22),rgba(251,191,36,1),rgba(251,191,36,0.22))]",
      shadow: "shadow-[0_0_18px_rgba(251,191,36,0.32)]",
      label: "text-amber-300/85",
      value: "text-amber-200",
    },
    violet: {
      ring: "bg-[conic-gradient(from_210deg,rgba(217,70,239,0.22),rgba(217,70,239,1),rgba(167,139,250,0.22))]",
      shadow: "shadow-[0_0_18px_rgba(217,70,239,0.34)]",
      label: "text-fuchsia-300/85",
      value: "text-fuchsia-200",
    },
  } as const;

  const sizeClass = size === "sm" ? "h-16 w-16" : "h-20 w-20";
  const labelClass = size === "sm" ? "text-[8px]" : "text-[9px]";
  const valueClass = size === "sm" ? "text-[11px]" : "text-xs";
  const toneStyle = toneMap[tone];
  const highlightStyle = highlightMap[tone];

  return (
    <div
      className={`relative ${sizeClass} shrink-0`}
      title={`${label}: ${value}`}
    >
      <div
        className={[
          "absolute inset-0 rounded-full p-[2px]",
          highlight ? `animate-pulse ${highlightStyle.ring}` : toneStyle.ring,
          highlight ? highlightStyle.shadow : toneStyle.glow,
        ].join(" ")}
      />
      <div className="absolute inset-[2px] rounded-full border border-white/10 bg-[rgba(2,10,23,0.82)] backdrop-blur-sm" />
      <div className="relative z-10 flex h-full flex-col items-center justify-center text-center">
        <span className={`max-w-[78%] truncate font-semibold uppercase tracking-wide ${labelClass} ${highlight ? highlightStyle.label : toneStyle.label}`}>
          {label}
        </span>
        <span className={`mt-0.5 max-w-[78%] truncate font-bold leading-tight ${valueClass} ${highlight ? highlightStyle.value : toneStyle.value}`}>
          {value}
        </span>
      </div>
    </div>
  );
}
