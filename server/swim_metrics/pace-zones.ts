/**
 * The user's own zone bounds («Le tue zone»), kept in swimmer_profiles.preferences.paceZones =
 * { bounds: { a1a2, a2b1, b1b2, b2c1, c1c2 } (s/100 m), updatedAt } (no migration). When set they
 * win over the bounds computed from the CSS everywhere: zones, intensity, coach and workouts.
 */
import { z } from "zod";
import {
  PACE_ZONE_BOUNDARIES,
  PACE_ZONE_PACE_LIMITS,
  type PaceZoneBoundaryKey,
  type PaceZoneBounds,
} from "@shared/swimMetrics";
import { mergeSwimmerPreferences } from "../lib/preferences";
import { dropCachedSwimMetrics } from "./index";

export const PACE_ZONES_RANGE_MESSAGE = "Scrivi un passo tra 1:00 e 4:00 per 100 m.";

/** m:ss with the tenths as the editor writes them («1:48,5»; «1:50» without tenths). */
function clock(seconds: number): string {
  const tenths = Math.round(seconds * 10);
  const whole = Math.floor(tenths / 10);
  const tenth = tenths % 10;
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}${tenth ? `,${tenth}` : ""}`;
}

const inRange = (value: number) =>
  Number.isFinite(value) && value >= PACE_ZONE_PACE_LIMITS.min && value <= PACE_ZONE_PACE_LIMITS.max;

const pace = z
  .number({ error: PACE_ZONES_RANGE_MESSAGE })
  .min(PACE_ZONE_PACE_LIMITS.min, PACE_ZONES_RANGE_MESSAGE)
  .max(PACE_ZONE_PACE_LIMITS.max, PACE_ZONES_RANGE_MESSAGE);

/**
 * Input of statistics.setPaceZones: the five boundaries, each faster than the previous one. Every
 * Italian message sits on its field, so the client reads `error.data.zodError.fieldErrors[key]`.
 */
export const paceZonesSchema = z
  .object({ a1a2: pace, a2b1: pace, b1b2: pace, b2c1: pace, c1c2: pace })
  .superRefine((bounds, ctx) => {
    // Each boundary against the last valid one before it: a pace out of range has its own message.
    let previous: (typeof PACE_ZONE_BOUNDARIES)[number] | null = null;
    for (const boundary of PACE_ZONE_BOUNDARIES) {
      const value = bounds[boundary.key];
      if (!inRange(value)) continue;
      if (previous && !(value < bounds[previous.key])) {
        ctx.addIssue({
          code: "custom",
          path: [boundary.key],
          message: `Il confine tra ${boundary.slower} e ${boundary.faster} deve essere più veloce di quello tra ${previous.slower} e ${previous.faster} (${clock(bounds[previous.key])}).`,
        });
        continue;
      }
      previous = boundary;
    }
  });

export type PaceZonesInput = Record<PaceZoneBoundaryKey, number>;

/**
 * Saves (or with null removes) the manual bounds with one SQL merge of preferences.paceZones,
 * keeping every other preference key, and drops the cached metrics (not the Coach insights). False
 * when the user has no profile.
 */
export async function updatePaceZones(
  userId: number,
  bounds: PaceZoneBounds | null,
  now: Date = new Date(),
): Promise<boolean> {
  const saved = bounds
    ? await mergeSwimmerPreferences(userId, { paceZones: { bounds, updatedAt: now.toISOString() } })
    : await mergeSwimmerPreferences(userId, {}, ["paceZones"]);
  if (!saved) return false;
  await dropCachedSwimMetrics(userId, now);
  return true;
}
