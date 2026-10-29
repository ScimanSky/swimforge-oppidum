/**
 * Pace zones relative to CSS (Swim Smooth, TrainingPeaks). The boundaries are a convention,
 * as a share of the threshold speed: Z1 < 85% ≤ Z2 < 92% ≤ Z3 < 97% ≤ Z4 < 103% ≤ Z5.
 */
import { ZONE_SPEED_BOUNDS, type Zones5 } from "@shared/swimMetrics";
import { activeLaps, type MetricLap } from "./laps";

const ZONE_UPPER_BOUNDS = ZONE_SPEED_BOUNDS;

/** 0-based zone of a speed ratio (lap speed / CSS speed); a boundary goes to the upper zone. */
export function zoneOf(speedRatio: number): 0 | 1 | 2 | 3 | 4 {
  // Rounding keeps a ratio like 0.8499999999 (floating point) from slipping under a boundary.
  const ratio = Math.round(speedRatio * 1e9) / 1e9;
  for (let zone = 0; zone < ZONE_UPPER_BOUNDS.length; zone += 1) {
    if (ratio < ZONE_UPPER_BOUNDS[zone]) return zone as 0 | 1 | 2 | 3;
  }
  return 4;
}

export const emptyZones = (): Zones5 => [0, 0, 0, 0, 0];

/**
 * Metres per zone of the active freestyle laps of a swim. The CSS is a freestyle pace: other
 * strokes, drill and kick (and laps without a stroke) are not zoned.
 */
export function sessionZones(laps: MetricLap[], cssSpeedMps: number): Zones5 {
  const zones = emptyZones();
  for (const lap of activeLaps(laps)) {
    if (lap.stroke !== "freestyle") continue;
    zones[zoneOf(lap.distanceMeters / lap.seconds / cssSpeedMps)] += lap.distanceMeters;
  }
  return zones;
}

/** Metres of active laps that are not freestyle («non classificati» in the zones). */
export function unclassifiedMeters(laps: MetricLap[]): number {
  return activeLaps(laps)
    .filter((lap) => lap.stroke !== "freestyle")
    .reduce((sum, lap) => sum + lap.distanceMeters, 0);
}

export function addZones(a: Zones5, b: Zones5): Zones5 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3], a[4] + b[4]];
}

/**
 * Easy (Z1+Z2), medium (Z3) and hard (Z4+Z5) shares in whole percent summing to 100 (largest
 * remainder); null without distance.
 */
export function intensitySplit(z: Zones5): { easyPct: number; mediumPct: number; hardPct: number } | null {
  const total = z.reduce((sum, metres) => sum + metres, 0);
  if (total <= 0) return null;
  const raw = [z[0] + z[1], z[2], z[3] + z[4]].map((metres) => (metres / total) * 100);
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
