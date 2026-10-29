import { describe, expect, it } from "vitest";
import { activityPlaceLabel, activitySourceLabel } from "./activity-labels";

describe("etichette attività", () => {
  it("luogo: acque libere, vasca con lunghezza, vasca senza", () => {
    expect(activityPlaceLabel({ isOpenWater: true, poolLengthMeters: 25 })).toBe("Acque libere");
    expect(activityPlaceLabel({ isOpenWater: false, poolLengthMeters: 25 })).toBe("Vasca 25m");
    expect(activityPlaceLabel({ isOpenWater: null, poolLengthMeters: null })).toBe("Vasca");
  });

  it("fonte: Garmin, Strava, Manuale; null se mancante o sconosciuta", () => {
    expect(activitySourceLabel("garmin")).toBe("Garmin");
    expect(activitySourceLabel("Strava")).toBe("Strava");
    expect(activitySourceLabel("manual")).toBe("Manuale");
    expect(activitySourceLabel("polar")).toBeNull();
    expect(activitySourceLabel(null)).toBeNull();
    expect(activitySourceLabel("")).toBeNull();
  });
});
