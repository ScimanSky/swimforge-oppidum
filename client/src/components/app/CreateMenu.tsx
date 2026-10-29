import { useEffect, useId, useRef, type ReactNode } from "react"
import { Link } from "wouter"
import { MessageSquare, Plus, RefreshCw, Sparkles, SquarePen, type LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

export const AI_POST_DRAFT =
  "Bozza IA:\n\nAllenamento completato oggi. Ecco i punti chiave:\n- Sensazioni in acqua:\n- Metrica migliore:\n- Cosa migliorare nella prossima sessione:\n\n#swimforge #training"

export type CreateAction = "post" | "ai-post" | "garmin"
/** Actions that open another dialog: focus must not go back to «+» when the sheet closes. */
const OPENS_DIALOG: ReadonlySet<CreateAction> = new Set<CreateAction>(["post", "ai-post"])
type CreateItem = { label: string; icon: LucideIcon } & ({ href: string } | { action: CreateAction })

const CREATE_ITEMS: CreateItem[] = [
  { label: "Nuovo post", icon: SquarePen, action: "post" },
  { label: "Messaggio", icon: MessageSquare, href: "/messages?new=1" },
  { label: "Bozza IA del post", icon: Sparkles, action: "ai-post" },
  { label: "Sincronizza Garmin", icon: RefreshCw, action: "garmin" },
]

type CreateMenuProps = {
  /** An action was chosen (the caller closes the menu). */
  onAction: (action: CreateAction) => void
  isGarminSyncing: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** The four «Crea» actions: bottom sheet on mobile, inline menu in the desktop rail. */
function CreateMenuList({
  onAction,
  onNavigate,
  isGarminSyncing,
}: {
  onAction: (action: CreateAction) => void
  onNavigate: () => void
  isGarminSyncing: boolean
}) {
  const rowClass =
    "flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] font-semibold text-foreground transition-colors hover:bg-raised aria-disabled:opacity-60"
  return (
    <ul className="space-y-1">
      {CREATE_ITEMS.map((item) => {
        const Icon = item.icon
        const icon = <Icon className="size-5 shrink-0 text-action-text" aria-hidden />
        if ("href" in item) {
          return (
            <li key={item.label}>
              <Link href={item.href} onClick={onNavigate} className={rowClass}>
                {icon}
                {item.label}
              </Link>
            </li>
          )
        }
        const syncing = item.action === "garmin" && isGarminSyncing
        return (
          <li key={item.label}>
            {/* aria-disabled, not disabled: the row keeps the keyboard focus while syncing. */}
            <button
              type="button"
              onClick={() => {
                if (!syncing) onAction(item.action)
              }}
              aria-disabled={syncing || undefined}
              className={rowClass}
            >
              {icon}
              {syncing ? "Sincronizzazione…" : item.label}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Mobile: modal bottom sheet (Radix Dialog: focus trap, Escape, scroll lock, inert background,
 * focus back to the trigger). `children` is the trigger, the «+» of the bottom bar.
 */
export function CreateSheet({ children, onAction, isGarminSyncing, open, onOpenChange }: CreateMenuProps & { children: ReactNode }) {
  // Set when the chosen action opens another dialog: that dialog takes the focus, not «+».
  const keepFocusAwayRef = useRef(false)
  const runAction = (action: CreateAction) => {
    keepFocusAwayRef.current = OPENS_DIALOG.has(action)
    onAction(action)
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent
        side="bottom"
        aria-describedby={undefined}
        onOpenAutoFocus={() => {
          keepFocusAwayRef.current = false
        }}
        onCloseAutoFocus={(event) => {
          if (!keepFocusAwayRef.current) return
          keepFocusAwayRef.current = false
          event.preventDefault()
        }}
        className="gap-0 rounded-t-2xl border-border bg-card p-2 pb-4 shadow-none"
      >
        <SheetTitle className="px-3 py-2 text-sm font-semibold text-muted-foreground">Crea</SheetTitle>
        <CreateMenuList onAction={runAction} onNavigate={() => onOpenChange(false)} isGarminSyncing={isGarminSyncing} />
      </SheetContent>
    </Sheet>
  )
}

/** Desktop rail: «Crea» button with an inline menu; closes on outside click and Escape. */
export function RailCreateMenu({ onAction, isGarminSyncing, open, onOpenChange }: CreateMenuProps) {
  const menuId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) onOpenChange(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      onOpenChange(false)
      buttonRef.current?.focus()
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open, onOpenChange])

  return (
    <div ref={containerRef} className="mt-4">
      <Button
        ref={buttonRef}
        type="button"
        data-tour="create-post"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-controls={menuId}
        className="w-full justify-start"
      >
        <Plus className="size-5" aria-hidden />
        Crea
      </Button>
      {open ? (
        <div id={menuId} className="mt-2 rounded-2xl border border-border bg-card p-1">
          <CreateMenuList onAction={onAction} onNavigate={() => onOpenChange(false)} isGarminSyncing={isGarminSyncing} />
        </div>
      ) : null}
    </div>
  )
}
