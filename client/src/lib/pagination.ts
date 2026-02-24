export function clampLimit(value: number, min = 1, max = 100): number {
  if (!Number.isFinite(value)) return min;
  const normalized = Math.trunc(value);
  return Math.max(min, Math.min(max, normalized));
}
