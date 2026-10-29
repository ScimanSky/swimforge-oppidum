import { describe, expect, it } from "vitest";
import { activityPlaceLabel, activitySourceLabel } from "./activity-labels";

describe("etichette attività", () => {
  it("luogo: acque libere, vasca con lunghezza, vasca senza", () => {
    expect(activityPlaceLabel({ isOpenWater: true, poolLengthMeters: 25 })).toBe("Acque libere");
    expect(activityPlaceLabel({ isOpenWater: false, poolLengthMeters: 25 })).toBe("Vasca 25 m");
    expect(activityPlaceLabel({ isOpenWater: false, poolLengthMeters: 50 })).toBe("Vasca 50 m");
    expect(activityPlaceLabel({ isOpenWater: null, poolLengthMeters: null })).toBe("Vasca");
  });

  it("luogo: una vasca da 25 yarde (22,86 m, salvata come 23) è «25 yd»", () => {
    expect(activityPlaceLabel({ isOpenWater: false, poolLengthMeters: 23 })).toBe("Vasca 25 yd");
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
