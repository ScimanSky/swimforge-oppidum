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
    <div className="flex w-fit items-center gap-1 rounded-2xl border border-border/40 bg-secondary/60 p-1 backdrop-blur-sm">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={cn(
            "relative min-h-[44px] rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors",
            tab === t.key
              ? "text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab === t.key && (
            <motion.span
              layoutId="feedSubTab"
              className="absolute inset-0 rounded-xl bg-gradient-to-r from-[var(--electric-cyan)] to-[var(--electric-lime)]"
              transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
            />
          )}
          <span className="relative z-10">{t.label}</span>
        </button>
      ))}
    </div>
  )
}
