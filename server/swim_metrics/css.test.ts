import { describe, expect, it } from "vitest";
import { bestEfforts, cssConfidence, cssFromTest, cssHistory, cssLapsOf, estimateCss, fitCriticalSpeed } from "./css";
import { activity } from "./test-helpers";

const effort = (distanceMeters: number, seconds: number, date = "2026-10-10") => ({ distanceMeters, seconds, date });

describe("cssFromTest (Ginn 400/200)", () => {
  it("T200 180 s and T400 380 s give 1 m/s, 1:40/100 m", () => {
    expect(cssFromTest(180, 380)).toBe(1);
    expect(100 / cssFromTest(180, 380)).toBe(100);
  });
});

describe("fitCriticalSpeed (distance = CS × time + D′)", () => {
  it("least squares with a free D′", () => {
    const fit = fitCriticalSpeed([effort(200, 160), effort(400, 340), effort(800, 700)]);
    expect(fit!.cs).toBeCloseTo(1 / 0.9, 9);
    expect(fit!.dPrime).toBeCloseTo(200 - 160 / 0.9, 9); // 22.2 m
    expect(fit!.r2).toBeCloseTo(1, 9);
  });

  it("a negative D′ is refitted through the origin: CS = Σd·t / Σt²", () => {
    // 200 in 200 s and 450 m in 400 s: the free line has D′ = −50 m.
    const fit = fitCriticalSpeed([effort(200, 200), effort(450, 400)]);
    expect(fit!.cs).toBeCloseTo((200 * 200 + 450 * 400) / (200 ** 2 + 400 ** 2), 9); // 1.1
    expect(fit!.dPrime).toBe(0);
    // Predictions 220 and 440: residuals −20 and +10 against a spread of 2 × 125².
    expect(fit!.r2).toBeCloseTo(1 - 500 / 31250, 9);
  });
});

describe("estimateCss", () => {
  it("3 aligned points (200 in 160 s, 400 in 340 s, 800 in 700 s) give CS = 1/0.9 m/s, high confidence", () => {
    const result = estimateCss([effort(200, 160), effort(400, 340), effort(800, 700)]);
    expect(result).not.toBeNull();
    expect(result!.speedMps).toBeCloseTo(1 / 0.9, 9);
    expect(result!.paceSecondsPer100).toBeCloseTo(90, 9);
    expect(result!.confidence).toBe("alta");
    expect(result!.dPrimeMeters).toBeCloseTo(22.22, 2);
    expect(result!.r2).toBeCloseTo(1, 9);
    expect(result!.points.map((p) => p.distanceMeters)).toEqual([200, 400, 800]);
    expect(result!.dropped).toEqual([]);
  });

  it("2 points give a medium confidence estimate", () => {
    const result = estimateCss([effort(200, 180), effort(400, 380)]);
    expect(result!.speedMps).toBeCloseTo(1, 9);
    expect(result!.dPrimeMeters).toBeCloseTo(20, 9);
    expect(result!.confidence).toBe("media");
  });

  it("3 points spanning a ratio under 3 are medium", () => {
    // 200, 300, 400: ratio 2.
    const result = estimateCss([effort(200, 160), effort(300, 250), effort(400, 340)]);
    expect(result!.confidence).toBe("media");
  });

  it("high confidence also needs D′ within 0–50 m", () => {
    // Aligned, span 4, CS 1 m/s, but D′ = 70 m: 200 in 130 s, 400 in 330 s, 800 in 730 s.
    const bigReserve = estimateCss([effort(200, 130), effort(400, 330), effort(800, 730)]);
    expect(bigReserve!.dPrimeMeters).toBeCloseTo(70, 9);
    expect(bigReserve!.confidence).toBe("media");
  });

  it("cssConfidence: alta needs ≥ 3 points, a span ≥ 3, D′ 0–50 m and R² ≥ 0.98", () => {
    const three = [effort(200, 160), effort(400, 340), effort(800, 700)];
    expect(cssConfidence(three, { dPrime: 20, r2: 0.99 })).toBe("alta");
    expect(cssConfidence(three, { dPrime: 0, r2: 0.98 })).toBe("alta");
    expect(cssConfidence(three, { dPrime: 50, r2: 0.98 })).toBe("alta");
    expect(cssConfidence(three, { dPrime: 50.1, r2: 0.99 })).toBe("media");
    expect(cssConfidence(three, { dPrime: 20, r2: 0.979 })).toBe("media");
    expect(cssConfidence(three.slice(0, 2), { dPrime: 20, r2: 1 })).toBe("media");
    expect(cssConfidence([effort(200, 160), effort(400, 340), effort(500, 430)], { dPrime: 20, r2: 1 })).toBe("media");
  });

  it("drops a best effort slower than a longer one: it was submaximal (the owner's 300)", () => {
    // 200 in 3:20, 300 in 5:56 (slower than the 400), 400 in 6:57.
    const result = estimateCss([effort(200, 200), effort(300, 356), effort(400, 417)]);
    expect(result!.points.map((p) => p.distanceMeters)).toEqual([200, 400]);
    expect(result!.dropped).toEqual([
      { distanceMeters: 300, seconds: 356, date: "2026-10-10", slowerThan: { distanceMeters: 400, seconds: 417, date: "2026-10-10" } },
    ]);
    expect(result!.speedMps).toBeCloseTo(200 / 217, 9);
    expect(result!.paceSecondsPer100).toBeCloseTo(108.5, 1);
    expect(result!.confidence).toBe("media");
  });

  it("a single point gives no estimate", () => {
    expect(estimateCss([effort(400, 340)])).toBeNull();
    expect(estimateCss([])).toBeNull();
  });

  it("needs the longest distance at least twice the shortest", () => {
    expect(estimateCss([effort(200, 160), effort(300, 250)])).toBeNull();
    expect(estimateCss([effort(500, 430), effort(800, 700)])).toBeNull();
    expect(estimateCss([effort(400, 340), effort(800, 700)])).not.toBeNull();
    expect(estimateCss([effort(500, 430), effort(1000, 880)])).not.toBeNull();
  });

  it("ignores efforts shorter than 2 or longer than 30 minutes", () => {
    // 200 in 110 s is out of the window: only 400 and 1500 (in 1900 s, also out) are left.
    expect(estimateCss([effort(200, 110), effort(400, 340), effort(1500, 1900)])).toBeNull();
  });

  it("a pace outside 1:00–3:30/100 m gives no estimate", () => {
    // CS = 200 / 600 = 0.33 m/s → 5:00/100 m.
    expect(estimateCss([effort(200, 500), effort(400, 1100)])).toBeNull();
  });

  it("when the longer efforts are faster, the shorter ones are dropped and too little is left", () => {
    // The 800 at 1:15/100 m beats the 200 and the 400: both were submaximal.
    expect(estimateCss([effort(200, 160), effort(400, 340), effort(800, 600)])).toBeNull();
  });
});

describe("bestEfforts", () => {
  const activities = [
    activity(1, "2026-10-01T08:00:00Z", [
      [200, 170, "FREESTYLE"],
      [0, 60],
      [400, 350, "Stile libero"],
      [250, 200, "freestyle"], // not a CSS distance
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
    expect(bestEfforts(cssLapsOf(activities), "2026-07-01", "2026-10-29")).toEqual([
      { distanceMeters: 200, seconds: 165, date: "2026-10-08", nominalDistance: 200, distanceUnit: "m" },
      { distanceMeters: 400, seconds: 350, date: "2026-10-01", nominalDistance: 400, distanceUnit: "m" },
      { distanceMeters: 800, seconds: 720, date: "2026-10-08", nominalDistance: 800, distanceUnit: "m" },
    ]);
  });

  it("matches a CSS distance within 3% and keeps the real distance (33 m pool: 198 m for 200)", () => {
    const pool33 = [activity(5, "2026-10-02T08:00:00Z", [[198, 168], [0, 60], [396, 345], [0, 60], [190, 150]], { poolLengthMeters: 33 })];
    expect(bestEfforts(cssLapsOf(pool33), "2026-07-01", "2026-10-29")).toEqual([
      { distanceMeters: 198, seconds: 168, date: "2026-10-02", nominalDistance: 200, distanceUnit: "m" },
      { distanceMeters: 396, seconds: 345, date: "2026-10-02", nominalDistance: 400, distanceUnit: "m" },
    ]);
  });

  it("in a 25-yard pool (22.86 m) matches yards and computes with the metres", () => {
    // 200 yd = 182.88 m (stored 183), 500 yd = 457.2 m (stored 457).
    const yards = [activity(6, "2026-10-03T08:00:00Z", [[183, 160], [0, 60], [457, 420]], { poolLengthMeters: 23 })];
    expect(bestEfforts(cssLapsOf(yards), "2026-07-01", "2026-10-29")).toEqual([
      { distanceMeters: 183, seconds: 160, date: "2026-10-03", nominalDistance: 200, distanceUnit: "yd" },
      { distanceMeters: 457, seconds: 420, date: "2026-10-03", nominalDistance: 500, distanceUnit: "yd" },
    ]);
    const estimate = estimateCss(bestEfforts(cssLapsOf(yards), "2026-07-01", "2026-10-29"));
    expect(estimate!.speedMps).toBeCloseTo((457 - 183) / (420 - 160), 9);
  });

  it("keeps the best pace when matched distances differ slightly", () => {
    const mixed = [
      activity(7, "2026-10-04T08:00:00Z", [[200, 172]]),
      activity(8, "2026-10-05T08:00:00Z", [[198, 171]], { poolLengthMeters: 33 }), // 0.8636 s/m, slower than 0.86
    ];
    expect(bestEfforts(cssLapsOf(mixed), "2026-07-01", "2026-10-29")).toEqual([
      { distanceMeters: 200, seconds: 172, date: "2026-10-04", nominalDistance: 200, distanceUnit: "m" },
    ]);
  });
});

describe("cssHistory", () => {
  it("estimates each month end on the 90 days before it", () => {
    const activities = [activity(1, "2026-08-10T08:00:00Z", [[200, 180], [0, 120], [400, 380]])];
    const history = cssHistory(cssLapsOf(activities), new Date("2026-10-29T12:00:00Z"));
    expect(history.map((h) => h.month)).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(history.map((h) => (h.estimate ? Math.round(h.estimate.paceSecondsPer100) : null))).toEqual([
      null, null, null, 100, 100, 100,
    ]);
  });

  it("drops a month once the swims are older than 90 days", () => {
    const activities = [activity(1, "2026-06-10T08:00:00Z", [[200, 180], [400, 380]])];
    const history = cssHistory(cssLapsOf(activities), new Date("2026-10-29T12:00:00Z"));
    // 30/09 − 89 days = 3/07: the swims of 10/06 no longer count.
    expect(history.map((h) => h.estimate !== null)).toEqual([false, true, true, true, false, false]);
  });
});
