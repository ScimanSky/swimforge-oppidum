import { cn } from "@/lib/utils"

interface FeedSubTabsProps {
  tab: "perte" | "seguiti"
  onChange: (tab: "perte" | "seguiti") => void
}

export default function FeedSubTabs({ tab, onChange }: FeedSubTabsProps) {
  return (
    <div className="flex items-center gap-1 rounded-2xl border border-border/80 bg-card/50 p-1 w-fit">
      <button
        onClick={() => onChange("perte")}
        className={cn(
          "rounded-xl px-4 py-2 text-sm font-semibold transition-all",
          tab === "perte"
            ? "bg-[linear-gradient(135deg,color-mix(in_oklch,var(--electric-cyan)_22%,transparent),color-mix(in_oklch,var(--electric-lime)_18%,transparent))] text-foreground shadow-[0_0_0_1px_color-mix(in_oklch,var(--electric-cyan)_28%,transparent)]"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Per te
      </button>
      <button
        onClick={() => onChange("seguiti")}
        className={cn(
          "rounded-xl px-4 py-2 text-sm font-semibold transition-all",
          tab === "seguiti"
            ? "bg-[linear-gradient(135deg,color-mix(in_oklch,var(--electric-cyan)_22%,transparent),color-mix(in_oklch,var(--electric-lime)_18%,transparent))] text-foreground shadow-[0_0_0_1px_color-mix(in_oklch,var(--electric-cyan)_28%,transparent)]"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Seguiti
      </button>
    </div>
  )
}
