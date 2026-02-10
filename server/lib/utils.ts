/**
 * Calculates XP earned for a swimming activity.
 *
 * Formula:
 * - Base: 1 XP per 100 meters (floor)
 * - Session completion bonus: +50 XP
 * - Distance bonuses: +25 XP for >= 3km, +25 XP for >= 4km
 * - Open water bonus: +50 XP
 *
 * @param distanceMeters - Distance swum in meters.
 * @param isOpenWater - Whether the activity was in open water.
 * @returns XP points earned (base + bonuses).
 *
 * @example
 * calculateActivityXp(3500, false) // 110
 * @example
 * calculateActivityXp(2500, true) // 125
 */
export function calculateActivityXp(distanceMeters: number, isOpenWater: boolean): number {
  const distance = Number.isFinite(distanceMeters) ? distanceMeters : 0;
  const baseXp = Math.floor(Math.max(0, distance) / 100);
  let xp = baseXp + 50; // session completion

  if (distance >= 3000) xp += 25;
  if (distance >= 4000) xp += 25;
  if (isOpenWater) xp += 50;

  return xp;
}
