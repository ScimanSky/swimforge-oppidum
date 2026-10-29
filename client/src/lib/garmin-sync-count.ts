import { useCallback, useState } from "react"
import {
  DEFAULT_GARMIN_SYNC_COUNT,
  GARMIN_SYNC_COUNTS,
  type GarminSyncCount,
} from "@shared/garmin-sync"

export const GARMIN_SYNC_COUNT_KEY = "swimforge:garminSyncCount"

export const GARMIN_SYNC_COUNT_OPTIONS: ReadonlyArray<{ value: GarminSyncCount; label: string }> = [
  { value: 1, label: "Ultima nuotata" },
  { value: 5, label: "Ultime 5" },
  { value: 10, label: "Ultime 10" },
]

function isGarminSyncCount(value: number): value is GarminSyncCount {
  return (GARMIN_SYNC_COUNTS as readonly number[]).includes(value)
}

export function readGarminSyncCount(): GarminSyncCount {
  try {
    const stored = Number(window.localStorage.getItem(GARMIN_SYNC_COUNT_KEY))
    return isGarminSyncCount(stored) ? stored : DEFAULT_GARMIN_SYNC_COUNT
  } catch {
    return DEFAULT_GARMIN_SYNC_COUNT
  }
}

export function writeGarminSyncCount(count: GarminSyncCount): void {
  try {
    window.localStorage.setItem(GARMIN_SYNC_COUNT_KEY, String(count))
  } catch {
    // Storage unavailable (private mode, blocked): the choice lasts for this view only.
  }
}

export function garminSyncButtonLabel(count: GarminSyncCount): string {
  return count === 1 ? "Sincronizza l'ultima nuotata" : `Sincronizza le ultime ${count}`
}

/** The chosen number of recent swims to sync, remembered across visits. */
export function useGarminSyncCount(): [GarminSyncCount, (count: GarminSyncCount) => void] {
  const [count, setCount] = useState<GarminSyncCount>(readGarminSyncCount)
  const choose = useCallback((next: GarminSyncCount) => {
    setCount(next)
    writeGarminSyncCount(next)
  }, [])
  return [count, choose]
}
