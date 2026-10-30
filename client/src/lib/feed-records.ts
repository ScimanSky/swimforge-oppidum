/** A training record set in a swim, as the feed query returns it (times in centiseconds). */
export type FeedSwimRecord = {
  record_type: string
  stroke_type: string | null
  value: number | string
  previous_value: number | string | null
}

const STROKE_SHORT: Record<string, string> = {
  freestyle: "SL",
  backstroke: "DO",
  breaststroke: "RA",
  butterfly: "FA",
  mixed: "MX",
}

/** 3:12 from a minute up, 32,45 below a minute. */
function formatRecordTime(cs: number) {
  if (cs >= 6000) {
    const totalSeconds = Math.floor(cs / 100)
    return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`
  }
  return (cs / 100).toFixed(2).replace(".", ",")
}

/** «−4 s», or «−0,6 s» under a second. */
function formatGain(cs: number) {
  const seconds = cs / 100
  const text = seconds >= 1 ? String(Math.round(seconds)) : seconds.toFixed(1).replace(".", ",")
  return `−${text} s`
}

/**
 * Chip labels of the records set in a swim: «Record 200 SL 3:12 (−4 s)»; a first time on that
 * distance has no gain. One chip per distance and stroke, the best time.
 */
export function recordChipLabels(raw: unknown): string[] {
  let records: FeedSwimRecord[] = []
  if (Array.isArray(raw)) records = raw as FeedSwimRecord[]
  else if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) records = parsed
    } catch {
      return []
    }
  }
  const best = new Map<string, { distance: number; stroke: string; value: number; previous: number | null }>()
  for (const record of records) {
    const match = /^pb_(\d+)_\d+_t$/.exec(String(record.record_type ?? ""))
    const value = Number(record.value)
    const stroke = STROKE_SHORT[String(record.stroke_type ?? "")]
    if (!match || !stroke || !Number.isFinite(value) || value <= 0) continue
    const distance = Number(match[1])
    const previous = Number(record.previous_value)
    const key = `${distance}-${stroke}`
    const current = best.get(key)
    if (current && current.value <= value) continue
    best.set(key, { distance, stroke, value, previous: Number.isFinite(previous) && previous > value ? previous : null })
  }
  return Array.from(best.values())
    .sort((a, b) => a.distance - b.distance || a.stroke.localeCompare(b.stroke))
    .map(({ distance, stroke, value, previous }) => {
      const base = `Record ${distance} ${stroke} ${formatRecordTime(value)}`
      return previous ? `${base} (${formatGain(previous - value)})` : base
    })
}
