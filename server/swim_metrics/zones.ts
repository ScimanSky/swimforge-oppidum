/**
 * Pace zones A1–C3 (shared/paceZones.ts): every active freestyle lap goes in the zone of its
 * pace against the bounds in effect (the manual ones, or those from the swim's CSS), C3 for a
 * sprint of at most 25 m or one length. Distances are summed per zone.
 */
import { emptyZones7, PACE_ZONE_CODES, paceZoneOf, type PaceZoneBounds, type Zones7 } from "@shared/swimMetrics";
import { activeLaps, type MetricLap } from "./laps";

export const emptyZones = emptyZones7;

/**
 * Metres per zone of the active freestyle laps of a swim. The CSS is a freestyle pace: other
 * strokes, drill and kick (and laps without a stroke) are not zoned.
 */
export function sessionZones(laps: MetricLap[], bounds: PaceZoneBounds, poolLengthMeters: number | null): Zones7 {
  const zones = emptyZones();
  for (const lap of activeLaps(laps)) {
    if (lap.stroke !== "freestyle") continue;
    const code = paceZoneOf((lap.seconds / lap.distanceMeters) * 100, lap.distanceMeters, bounds, poolLengthMeters);
    zones[PACE_ZONE_CODES.indexOf(code)] += lap.distanceMeters;
  }
  return zones;
}

/** Metres of active laps that are not freestyle («non classificati» in the zones). */
export function unclassifiedMeters(laps: MetricLap[]): number {
  return activeLaps(laps)
    .filter((lap) => lap.stroke !== "freestyle")
    .reduce((sum, lap) => sum + lap.distanceMeters, 0);
}

export function addZones(a: Zones7, b: Zones7): Zones7 {
  return a.map((metres, index) => metres + b[index]) as Zones7;
}

/**
 * Facile (A1+A2), medio (B1+B2) and intenso (C1+C2+C3) shares in whole percent summing to 100
 * (largest remainder); null without distance.
 */
export function intensitySplit(z: Zones7): { easyPct: number; mediumPct: number; hardPct: number } | null {
  const total = z.reduce((sum, metres) => sum + metres, 0);
  if (total <= 0) return null;
  const raw = [z[0] + z[1], z[2] + z[3], z[4] + z[5] + z[6]].map((metres) => (metres / total) * 100);
  const floors = raw.map(Math.floor);
  let left = 100 - floors.reduce((sum, value) => sum + value, 0);
  const byRemainder = raw
    .map((value, index) => ({ index, remainder: value - floors[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of byRemainder) {
    if (left <= 0) break;
    floors[index] += 1;
    left -= 1;
  }
  return { easyPct: floors[0], mediumPct: floors[1], hardPct: floors[2] };
}
