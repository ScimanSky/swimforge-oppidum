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
    <div className="w-full border-b border-border/70">
      <div className="flex items-center gap-8">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={cn(
              "relative min-h-[44px] px-0 py-2 text-base font-display font-semibold tracking-[0.01em] transition-colors",
              tab === t.key
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab === t.key ? (
              <motion.span
                layoutId="feedSubTabUnderline"
                className="absolute bottom-[-1px] left-0 right-0 h-0.5 rounded-full bg-[linear-gradient(90deg,var(--electric-cyan),var(--electric-lime))]"
                transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
              />
            ) : null}
            <span>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
