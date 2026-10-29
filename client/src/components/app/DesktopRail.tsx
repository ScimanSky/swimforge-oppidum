import { NAV_TABS, type TabId } from "@/lib/navigation"
import { RailCreateMenu, type CreateAction } from "./CreateMenu"
import { TabLink } from "./TabLink"

export type DesktopRailProps = {
  activeTab: TabId | null
  createOpen: boolean
  onCreateOpenChange: (open: boolean) => void
  onCreateAction: (action: CreateAction) => void
  isGarminSyncing: boolean
}

/** Desktop (≥ lg): the four tabs and the «Crea» button, below the header. */
export function DesktopRail({ activeTab, createOpen, onCreateOpenChange, onCreateAction, isGarminSyncing }: DesktopRailProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[232px] flex-col border-r border-border bg-background px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(5rem+env(safe-area-inset-top))] lg:flex">
      <nav data-tour="main-navigation" aria-label="Navigazione" className="space-y-1">
        {NAV_TABS.map((tab) => (
          <TabLink key={tab.id} tab={tab} active={activeTab === tab.id} layout="rail" />
        ))}
      </nav>
      <RailCreateMenu
        open={createOpen}
        onOpenChange={onCreateOpenChange}
        onAction={onCreateAction}
        isGarminSyncing={isGarminSyncing}
      />
    </aside>
  )
}
