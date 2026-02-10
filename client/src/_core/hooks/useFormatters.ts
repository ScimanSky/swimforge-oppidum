import { useMemo } from "react"

export const formatDuration = (seconds: number | null | undefined) => {
  if (seconds === null || seconds === undefined) return "—"
  if (seconds === 0) return "0 min"
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes} min`
}

export const formatDistanceKm = (meters: number | null | undefined) => {
  if (meters === null || meters === undefined) return "—"
  if (meters === 0) return "0.0 km"
  return `${(meters / 1000).toFixed(1)} km`
}

export const formatDistance = (meters: number | null | undefined) => {
  if (meters === null || meters === undefined) return "—"
  if (meters === 0) return "0 m"
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`
}

export const formatPace = (secondsPer100m: number | null | undefined) => {
  if (secondsPer100m === null || secondsPer100m === undefined) return "—"
  if (!Number.isFinite(secondsPer100m) || secondsPer100m <= 0) return "—"
  const minutes = Math.floor(secondsPer100m / 60)
  const seconds = Math.round(secondsPer100m % 60)
  return `${minutes}:${seconds.toString().padStart(2, "0")}/100m`
}

export const formatDate = (date: string | Date | null | undefined) => {
  if (!date) return "—"
  const parsed = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(parsed.getTime())) return "—"
  return parsed.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export function useFormatters() {
  return useMemo(
    () => ({
      formatDuration,
      formatDistanceKm,
      formatDistance,
      formatPace,
      formatDate,
    }),
    [],
  )
}

