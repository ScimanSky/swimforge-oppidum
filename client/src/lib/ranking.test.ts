import { describe, expect, it } from "vitest";
import { rankEntries } from "./ranking";

const ranks = (values: number[]) => rankEntries(values, (value) => value).map(({ rank }) => rank);

describe("rankEntries", () => {
  it("pari merito: stessa posizione, la successiva salta (1, 1, 3)", () => {
    expect(ranks([900, 900, 700, 700, 700, 100])).toEqual([1, 1, 3, 3, 3, 6]);
  });
  it("senza pari merito: 1, 2, 3", () => {
    expect(ranks([3, 2, 1])).toEqual([1, 2, 3]);
  });
  it("lista vuota", () => {
    expect(ranks([])).toEqual([]);
  });
  it("chi è a zero non ha posizione, nemmeno a pari merito", () => {
    expect(ranks([0, 0, 0])).toEqual([null, null, null]);
    expect(ranks([500, 300, 0, 0])).toEqual([1, 2, null, null]);
  });
  it("chi non ha un risultato va dopo i classificati, nel suo ordine", () => {
    const entries = [
      { name: "a", value: 0 },
      { name: "b", value: 120 },
      { name: "c", value: Number.NaN },
      { name: "d", value: 98 },
    ];
    expect(rankEntries(entries, (entry) => entry.value).map(({ entry, rank }) => [entry.name, rank])).toEqual([
      ["b", 1],
      ["d", 2],
      ["a", null],
      ["c", null],
    ]);
  });
});
