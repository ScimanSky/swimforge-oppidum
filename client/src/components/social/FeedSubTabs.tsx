import { cn } from "@/lib/utils"

interface FeedSubTabsProps {
  tab: "perte" | "seguiti"
  onChange: (tab: "perte" | "seguiti") => void
}

const tabs = [
  { key: "perte" as const, label: "Per te" },
  { key: "seguiti" as const, label: "Seguiti" },
]

/** Feed sub-sections, styled like the hub SectionTabs (action-colour underline). */
export default function FeedSubTabs({ tab, onChange }: FeedSubTabsProps) {
  return (
    <div
      role="group"
      aria-label="Sezioni del feed"
      className="-mx-4 overflow-x-auto border-b border-border px-4 md:mx-0 md:px-0"
    >
      <div className="flex min-w-max gap-6">
        {tabs.map((t) => {
          const active = tab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onChange(t.key)}
              aria-pressed={active}
              className={cn(
                "relative inline-flex h-12 items-center text-[15px] font-semibold transition-colors",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {active ? (
                <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] rounded-full bg-primary" />
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
