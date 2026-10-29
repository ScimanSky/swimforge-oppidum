import { Link } from "wouter"
import { Newspaper, Sun, Users, Waves, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { NAV_TABS, type TabId } from "@/lib/navigation"

export type NavTab = (typeof NAV_TABS)[number]

const TAB_ICONS: Record<TabId, LucideIcon> = {
  today: Sun,
  feed: Newspaper,
  train: Waves,
  community: Users,
}

/** One main-navigation entry: stacked in the bottom bar, a row in the desktop rail. */
export function TabLink({ tab, active, layout }: { tab: NavTab; active: boolean; layout: "bar" | "rail" }) {
  const Icon = TAB_ICONS[tab.id]
  return (
    <Link
      href={tab.path}
      data-tour={tab.dataTour}
      aria-current={active ? "page" : undefined}
      className={cn(
        "font-semibold transition-colors",
        layout === "bar"
          ? cn(
              "flex min-h-[44px] flex-col items-center justify-center gap-1 text-xs",
              active ? "text-action-text" : "text-muted-foreground hover:text-foreground",
            )
          : cn(
              "flex h-11 items-center gap-3 rounded-xl px-3 text-[15px]",
              active ? "bg-raised text-foreground" : "text-muted-foreground hover:bg-raised hover:text-foreground",
            ),
      )}
    >
      <Icon
        className={cn(layout === "bar" ? "size-6" : "size-5", layout === "rail" && active && "text-action-text")}
        aria-hidden
      />
      <span className={layout === "bar" ? "leading-none" : undefined}>{tab.label}</span>
    </Link>
  )
}
