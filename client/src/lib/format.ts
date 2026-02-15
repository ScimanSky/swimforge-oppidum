export const formatDistance = (meters?: number | null) => {
  if (!meters) return "—"
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`
}

export const formatDuration = (seconds?: number | null) => {
  if (!seconds) return "—"
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  return `${minutes} min`
}

export const formatPace = (meters?: number | null, seconds?: number | null) => {
  if (!meters || !seconds || meters <= 0) return "—"
  const pace = seconds / (meters / 100)
  if (!Number.isFinite(pace)) return "—"
  const minutes = Math.floor(pace / 60)
  const secs = Math.round(pace % 60)
  return `${minutes}:${secs.toString().padStart(2, "0")}/100m`
}

export const formatTimeAgo = (dateString: string) => {
  const date = new Date(dateString)
  const diffMs = Date.now() - date.getTime()
  const isFuture = diffMs < 0
  const diffMinutes = Math.floor(Math.abs(diffMs) / 60000)
  if (diffMinutes < 1) return isFuture ? "tra poco" : "adesso"
  if (diffMinutes < 60) return isFuture ? `tra ${diffMinutes} min` : `${diffMinutes} min fa`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return isFuture ? `tra ${diffHours}h` : `${diffHours}h fa`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return isFuture ? `tra ${diffDays}g` : `${diffDays}g fa`
  return date.toLocaleDateString("it-IT", { day: "numeric", month: "short" })
}

export const getInitials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "SW"
