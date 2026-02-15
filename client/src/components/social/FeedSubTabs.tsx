import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface FeedSubTabsProps {
  tab: "perte" | "seguiti"
  onChange: (tab: "perte" | "seguiti") => void
}

const tabs = [
  { key: "perte" as const, label: "Per te" },
  { key: "seguiti" as const, label: "Seguiti" },
]

export default function FeedSubTabs({ tab, onChange }: FeedSubTabsProps) {
  return (
    <div className="flex items-center gap-1 rounded-2xl border border-border/80 bg-card/50 p-1 w-fit">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            "relative rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
            tab === t.key ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab === t.key && (
            <motion.div
              layoutId="feed-tab-indicator"
              className="absolute inset-0 rounded-xl bg-[linear-gradient(135deg,color-mix(in_oklch,var(--electric-cyan)_22%,transparent),color-mix(in_oklch,var(--electric-lime)_18%,transparent))] shadow-[0_0_0_1px_color-mix(in_oklch,var(--electric-cyan)_28%,transparent)]"
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            />
          )}
          <span className="relative z-10">{t.label}</span>
        </button>
      ))}
    </div>
  )
}
