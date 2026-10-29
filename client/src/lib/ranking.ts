export type RankedEntry<T> = { entry: T; rank: number | null };

/**
 * Positions of a ranking already sorted best first. Only entries with a result (value > 0: XP or
 * badges earned, metres swum, a pace with data) are ranked, by standard competition ranking
 * («1224»): equal values share a position and the next one skips ahead (900, 900, 700 → 1, 1, 3).
 * The others get no position (null: «—», no medal) and follow the ranked ones in their order, so
 * a week nobody has swum in yet has no winner.
 */
export function rankEntries<T>(
  entries: readonly T[],
  valueOf: (entry: T) => number
): RankedEntry<T>[] {
  const ranked: RankedEntry<T>[] = [];
  const unranked: RankedEntry<T>[] = [];
  let previous: number | null = null;
  for (const entry of entries) {
    const value = valueOf(entry);
    if (!(value > 0)) {
      unranked.push({ entry, rank: null });
      continue;
    }
    const tied = previous !== null && Object.is(value, previous);
    ranked.push({ entry, rank: tied ? ranked[ranked.length - 1].rank : ranked.length + 1 });
    previous = value;
  }
  return [...ranked, ...unranked];
}
