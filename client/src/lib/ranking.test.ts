import { describe, expect, it } from "vitest";
import { competitionRanks } from "./ranking";

describe("competitionRanks", () => {
  it("pari merito: stessa posizione, la successiva salta (1, 1, 3)", () => {
    expect(competitionRanks([900, 900, 700, 700, 700, 100])).toEqual([1, 1, 3, 3, 3, 6]);
  });
  it("senza pari merito: 1, 2, 3", () => {
    expect(competitionRanks([3, 2, 1])).toEqual([1, 2, 3]);
  });
  it("lista vuota", () => {
    expect(competitionRanks([])).toEqual([]);
  });
});
