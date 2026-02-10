export function calculateActivityXp(distanceMeters: number, isOpenWater: boolean): number {
  const distance = Number.isFinite(distanceMeters) ? distanceMeters : 0;
  const baseXp = Math.floor(Math.max(0, distance) / 100);
  let xp = baseXp + 50; // session completion

  if (distance >= 3000) xp += 25;
  if (distance >= 4000) xp += 25;
  if (isOpenWater) xp += 50;

  return xp;
}

