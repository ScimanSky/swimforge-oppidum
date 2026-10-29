import { describe, expect, it } from "vitest";
import { bestEfforts, cssFromTest, cssHistory, estimateCss } from "./css";
import { activity } from "./test-helpers";

const effort = (distanceMeters: number, seconds: number, date = "2026-10-10") => ({ distanceMeters, seconds, date });

describe("cssFromTest (Ginn 400/200)", () => {
  it("T200 180 s and T400 380 s give 1 m/s, 1:40/100 m", () => {
    expect(cssFromTest(180, 380)).toBe(1);
    expect(100 / cssFromTest(180, 380)).toBe(100);
  });
});

describe("estimateCss", () => {
  it("3 aligned points (200 in 160 s, 400 in 340 s, 800 in 700 s) give CS = 1/0.9 m/s, high confidence", () => {
    const result = estimateCss([effort(200, 160), effort(400, 340), effort(800, 700)]);
    expect(result).not.toBeNull();
    expect(result!.speedMps).toBeCloseTo(1 / 0.9, 9);
    expect(result!.paceSecondsPer100).toBeCloseTo(90, 9);
    expect(result!.confidence).toBe("alta");
    expect(result!.points.map((p) => p.distanceMeters)).toEqual([200, 400, 800]);
  });

  it("2 points give a medium confidence estimate", () => {
    const result = estimateCss([effort(200, 180), effort(400, 380)]);
    expect(result!.speedMps).toBeCloseTo(1, 9);
    expect(result!.confidence).toBe("media");
  });

  it("3 points spanning a ratio under 3 are medium", () => {
    // 200, 300, 400: ratio 2.
    const result = estimateCss([effort(200, 160), effort(300, 250), effort(400, 340)]);
    expect(result!.confidence).toBe("media");
  });

  it("a single point gives no estimate", () => {
    expect(estimateCss([effort(400, 340)])).toBeNull();
    expect(estimateCss([])).toBeNull();
  });

  it("needs one distance up to 400 m and one from 400 m up", () => {
    expect(estimateCss([effort(200, 160), effort(300, 250)])).toBeNull();
    expect(estimateCss([effort(500, 430), effort(800, 700)])).toBeNull();
    expect(estimateCss([effort(400, 340), effort(800, 700)])).not.toBeNull();
  });

  it("ignores efforts shorter than 2 or longer than 30 minutes", () => {
    // 200 in 110 s is out of the window: only 400 and 1500 (in 1900 s, also out) are left.
    expect(estimateCss([effort(200, 110), effort(400, 340), effort(1500, 1900)])).toBeNull();
  });

  it("a pace outside 1:00–3:30/100 m gives no estimate", () => {
    // CS = 200 / 600 = 0.33 m/s → 5:00/100 m.
    expect(estimateCss([effort(200, 500), effort(400, 1100)])).toBeNull();
  });

  it("a negative D′ falls back to Ginn on the best 200 and 400", () => {
    // The 800 is faster than the line through 200 and 400: regression D′ < 0.
    const result = estimateCss([effort(200, 160), effort(400, 340), effort(800, 600)]);
    expect(result).not.toBeNull();
    expect(result!.speedMps).toBeCloseTo(200 / 180, 9);
    expect(result!.confidence).toBe("media");
    expect(result!.points.map((p) => p.distanceMeters)).toEqual([200, 400]);
  });

  it("a negative D′ without a 200 and a 400 gives no estimate", () => {
    expect(estimateCss([effort(300, 250), effort(400, 340), effort(800, 600)])).toBeNull();
  });

  it("is never faster than the best 200", () => {
    // Ginn fallback with T400 < 2 × T200 would be faster than the 200 itself.
    expect(estimateCss([effort(200, 200), effort(400, 380), effort(800, 740)])).toBeNull();
  });
});

describe("bestEfforts", () => {
  const activities = [
    activity(1, "2026-10-01T08:00:00Z", [
      [200, 170, "FREESTYLE"],
      [0, 60],
      [400, 350, "Stile libero"],
      [250, 200, "freestyle"], // not a test distance
    ]),
    activity(2, "2026-10-08T08:00:00Z", [
      [200, 165, "freestyle"],
      [400, 300, "backstroke"], // not freestyle
      [800, 720, "freestyle"],
    ]),
    activity(3, "2026-10-09T08:00:00Z", [[400, 290, "freestyle"]], { isOpenWater: true, poolLengthMeters: null }),
    activity(4, "2026-06-01T08:00:00Z", [[200, 150, "freestyle"]]), // before the window
  ];

  it("keeps the best continuous freestyle pool lap per distance in the window", () => {
    expect(bestEfforts(activities, "2026-07-01", "2026-10-29")).toEqual([
      { distanceMeters: 200, seconds: 165, date: "2026-10-08" },
      { distanceMeters: 400, seconds: 350, date: "2026-10-01" },
      { distanceMeters: 800, seconds: 720, date: "2026-10-08" },
    ]);
  });
});

describe("cssHistory", () => {
  it("estimates each month end on the 90 days before it", () => {
    const activities = [activity(1, "2026-08-10T08:00:00Z", [[200, 180], [0, 120], [400, 380]])];
    const history = cssHistory(activities, new Date("2026-10-29T12:00:00Z"));
    expect(history.map((h) => h.month)).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(history.map((h) => (h.estimate ? Math.round(h.estimate.paceSecondsPer100) : null))).toEqual([
      null, null, null, 100, 100, 100,
    ]);
  });

  it("drops a month once the swims are older than 90 days", () => {
    const activities = [activity(1, "2026-06-10T08:00:00Z", [[200, 180], [400, 380]])];
    const history = cssHistory(activities, new Date("2026-10-29T12:00:00Z"));
    // 30/09 − 89 days = 3/07: the swims of 10/06 no longer count.
    expect(history.map((h) => h.estimate !== null)).toEqual([false, true, true, true, false, false]);
  });
});
