import { describe, expect, it } from "vitest";
import { buildPbSharePrefill } from "./pb-share";

describe("buildPbSharePrefill", () => {
  it("says the record, the pool and where it was set; no hashtags", () => {
    const text = buildPbSharePrefill({
      strokeType: "freestyle",
      distanceMeters: 200,
      poolLengthMeters: 25,
      source: "training",
      newTimeCs: 19_250,
      improvementCs: 400,
    });
    expect(text).toBe("Nuovo PB nei Stile libero 200m: 3:12.50 (migliorato di 4.00)\nVasca 25m · Allenamento");
    expect(text).not.toMatch(/#/);
  });

  it("without an improvement: just the time; an official race says so", () => {
    expect(
      buildPbSharePrefill({
        strokeType: "butterfly",
        distanceMeters: 50,
        poolLengthMeters: 50,
        source: "official",
        newTimeCs: 3_100,
        improvementCs: null,
      }),
    ).toBe("Nuovo PB nei Farfalla 50m: 31.00\nVasca 50m · Gara ufficiale");
  });
});
