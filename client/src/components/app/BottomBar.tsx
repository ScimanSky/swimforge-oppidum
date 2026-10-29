import { Fragment } from "react"
import { Plus } from "lucide-react"

import { NAV_TABS, type TabId } from "@/lib/navigation"
import { CreateSheet, type CreateAction } from "./CreateMenu"
import { TabLink } from "./TabLink"

export type BottomBarProps = {
  activeTab: TabId | null
  createOpen: boolean
  onCreateOpenChange: (open: boolean) => void
  onCreateAction: (action: CreateAction) => void
  isGarminSyncing: boolean
}

/** Mobile (< lg): Oggi · Feed · + · Allena · Community. */
export function BottomBar({ activeTab, createOpen, onCreateOpenChange, onCreateAction, isGarminSyncing }: BottomBarProps) {
  return (
    <nav
      data-tour="main-navigation"
      aria-label="Navigazione principale"
      // Native app (edge-to-edge): also fills the area under the system navigation bar.
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] lg:hidden"
    >
      <div className="mx-auto grid h-16 max-w-3xl grid-cols-5 px-1">
        {NAV_TABS.map((tab, index) => (
          <Fragment key={tab.id}>
            {index === 2 ? (
              <div className="flex items-center justify-center">
                <CreateSheet
                  open={createOpen}
                  onOpenChange={onCreateOpenChange}
                  onAction={onCreateAction}
                  isGarminSyncing={isGarminSyncing}
                >
                  <button
                    type="button"
                    data-tour="create-post"
                    aria-label="Crea"
                    className="inline-flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/80"
                  >
                    <Plus className="size-6" aria-hidden />
                  </button>
                </CreateSheet>
              </div>
            ) : null}
            <TabLink tab={tab} active={activeTab === tab.id} layout="bar" />
          </Fragment>
        ))}
      </div>
    </nav>
  )
}
