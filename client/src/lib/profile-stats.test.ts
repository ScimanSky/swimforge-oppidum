// Swims are grouped by Rome calendar weeks: pin a timezone east of UTC, where local midnight is
// the previous day in UTC. Node applies TZ at runtime.
process.env.TZ = "Europe/Rome";

import { describe, expect, it } from "vitest";
import { getActivityAvgSwolf, primaryStrokeLabel } from "./profile-stats";

/** Local date in October 2026 (26 = Monday). */
const oct = (day: number, hour = 10, minute = 0) => new Date(2026, 9, day, hour, minute);

describe("profile stats (Europe/Rome)", () => {
  it("the timezone is applied", () => {
    expect(oct(26, 0, 30).getTimezoneOffset()).toBe(-60);
  });

  it("SWOLF from a number or a numeric string, camelCase or snake_case; 0 otherwise", () => {
    expect(getActivityAvgSwolf({ avgSwolf: 38 })).toBe(38);
    expect(getActivityAvgSwolf({ avg_swolf: "41" })).toBe(41);
    expect(getActivityAvgSwolf({ avgSwolf: "" })).toBe(0);
    expect(getActivityAvgSwolf({ avgSwolf: null })).toBe(0);
    expect(getActivityAvgSwolf({})).toBe(0);
  });

  it("primary stroke: the most frequent known one, null when unknown", () => {
    expect(
      primaryStrokeLabel([{ strokeType: "backstroke" }, { stroke_type: "backstroke" }, { strokeType: "freestyle" }])
    ).toBe("Dorso");
    expect(primaryStrokeLabel([{}])).toBe("Misti");
    expect(primaryStrokeLabel([{ strokeType: "doggy" }])).toBeNull();
    expect(primaryStrokeLabel([])).toBeNull();
  });
});
