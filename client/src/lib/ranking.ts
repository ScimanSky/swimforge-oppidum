/**
 * Standard competition ranking («1224») for values already sorted best first: equal values
 * share a position and the next one skips ahead (900, 900, 700 → 1, 1, 3).
 */
export function competitionRanks(values: readonly number[]): number[] {
  const ranks: number[] = [];
  values.forEach((value, index) => {
    ranks.push(index > 0 && Object.is(value, values[index - 1]) ? ranks[index - 1] : index + 1);
  });
  return ranks;
}
