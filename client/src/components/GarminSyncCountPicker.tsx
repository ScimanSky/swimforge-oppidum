import { useId } from "react"
import type { GarminSyncCount } from "@shared/garmin-sync"
import { GARMIN_SYNC_COUNT_OPTIONS } from "@/lib/garmin-sync-count"
import { cn } from "@/lib/utils"

interface GarminSyncCountPickerProps {
  value: GarminSyncCount
  onChange: (count: GarminSyncCount) => void
  disabled?: boolean
  className?: string
}

/** Segmented choice of how many recent Garmin swims to sync (native radios: arrow keys work). */
export default function GarminSyncCountPicker({ value, onChange, disabled, className }: GarminSyncCountPickerProps) {
  const name = useId()
  return (
    <div
      role="radiogroup"
      aria-label="Nuotate da sincronizzare"
      className={cn(
        "inline-flex rounded-lg border border-border/60 bg-background/40 p-0.5",
        disabled && "opacity-50",
        className,
      )}
    >
      {GARMIN_SYNC_COUNT_OPTIONS.map((option) => (
        <label key={option.value} className="relative">
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            disabled={disabled}
            className="peer sr-only"
          />
          <span
            className={cn(
              "block cursor-pointer select-none whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium",
              "text-muted-foreground transition-colors hover:text-foreground",
              "peer-checked:bg-primary peer-checked:text-primary-foreground",
              "peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50",
              "peer-disabled:cursor-not-allowed",
            )}
          >
            {option.label}
          </span>
        </label>
      ))}
    </div>
  )
}
