export const SYNC_PROMPT_SEEN_KEY = "swimforge:lastPromptedSyncedActivityId"

export type SyncShareActivity = {
  id: number
  activitySource?: string | null
  shareToFeed?: boolean | null
}

export type SyncPromptDecision =
  | { action: "none" }
  | { action: "initialize"; seenId: number }
  | { action: "mark_seen"; seenId: number }
  | { action: "prompt"; activity: SyncShareActivity }

const SUPPORTED_SYNC_SOURCES = new Set(["garmin", "strava"])

export function getNewestSyncedActivity(activities: SyncShareActivity[]): SyncShareActivity | null {
  const synced = activities
    .filter(
      (activity) =>
        Number.isInteger(activity.id) &&
        SUPPORTED_SYNC_SOURCES.has(String(activity.activitySource ?? "").toLowerCase())
    )
    .sort((a, b) => Number(b.id) - Number(a.id))

  return synced[0] ?? null
}

export function getSyncPromptDecision(params: {
  activities: SyncShareActivity[]
  lastSeenRaw: string | null
}): SyncPromptDecision {
  const newest = getNewestSyncedActivity(params.activities)
  if (!newest) return { action: "none" }

  if (!params.lastSeenRaw) {
    return { action: "initialize", seenId: newest.id }
  }

  const lastSeenId = Number(params.lastSeenRaw ?? "0")
  if (newest.id <= lastSeenId) {
    return { action: "none" }
  }

  if (!newest.shareToFeed) {
    return { action: "prompt", activity: newest }
  }

  return { action: "mark_seen", seenId: newest.id }
}
