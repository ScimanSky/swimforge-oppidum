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
    <fieldset
      disabled={disabled}
      className={cn(
        "m-0 inline-flex min-w-0 rounded-xl border border-border bg-raised p-0.5",
        disabled && "opacity-50",
        className,
      )}
    >
      <legend className="sr-only">Quante nuotate sincronizzare</legend>
      {GARMIN_SYNC_COUNT_OPTIONS.map((option) => (
        <label key={option.value} className="relative flex">
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="peer sr-only"
          />
          <span
            className={cn(
              // min-h-11: 44px touch target; the text stays compact.
              "flex min-h-11 cursor-pointer select-none items-center whitespace-nowrap rounded-lg px-3 text-sm font-semibold",
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
    </fieldset>
  )
}
