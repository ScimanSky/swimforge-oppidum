import { describe, expect, it } from "vitest";
import { computeSwimMetrics } from "./compute";
import { activity } from "./test-helpers";

const NOW = new Date("2026-10-29T18:00:00Z"); // Thursday
// A test with T200 3:00 and T400 6:20 gives CSS 1 m/s (1:40/100 m), valid from 01/10.
const TEST_1MPS = { t200Seconds: 180, t400Seconds: 380, date: "2026-10-01" };

const rest = (seconds: number) => [0, seconds] as [number, number];

describe("computeSwimMetrics: load on laps or on the whole swim", () => {
  // 20/10, 25 m: 400 free at CSS, 4×100 free at 0.909 CSS, 200 back, 100 drill.
  const withLaps = activity(1, "2026-10-20T17:00:00Z", [
    [400, 400], rest(60),
    [100, 110], rest(20), [100, 110], rest(20), [100, 110], rest(20), [100, 110], rest(60),
    [200, 220, "backstroke"], rest(30),
    [100, 150, "drill"],
  ]);
  // 22/10: a Strava swim without laps, 2000 m in 40 minutes in total.
  const lapLess = activity(2, "2026-10-22T17:00:00Z", [], { distanceMeters: 2000, durationSeconds: 2400 });

  const metrics = computeSwimMetrics({ activities: [withLaps, lapLess], cssTest: TEST_1MPS, streakDates: [] }, NOW);
  const [a, b] = metrics.sessions;

  it("a swim with laps: sTSS on each active lap (moving time), non-freestyle at IF 0.80", () => {
    const cubes = 1 * 400 + 4 * (100 / 110) ** 3 * 110 + 0.512 * 220 + 0.512 * 150;
    expect(a.hasLaps).toBe(true);
    expect(a.loadEstimated).toBe(false);
    expect(a.stss).toBe(Math.round((cubes / 3600) * 1000) / 10); // 25.6
    expect(a.intensityFactor).toBe(Math.round(Math.cbrt(cubes / 1210) * 100) / 100); // 0.91
    expect(a.movingSeconds).toBe(1210);
    expect(a.swimDistanceMeters).toBe(1100);
  });

  it("a swim without laps: TrainingPeaks definition (distance / total time), marked as estimated", () => {
    expect(b.hasLaps).toBe(false);
    expect(b.loadEstimated).toBe(true);
    expect(b.intensityFactor).toBe(0.83);
    expect(b.stss).toBe(Math.round((2000 / 2400) ** 3 * (2400 / 3600) * 1000) / 10); // 38.6
    expect(b.swimDistanceMeters).toBeNull();
    expect(b.distanceMeters).toBe(2000);
  });

  it("zones take only freestyle laps; the rest is unclassified, with the coverage of the volume", () => {
    expect(a.zoneMeters).toEqual([0, 400, 0, 400, 0]);
    expect(a.unclassifiedMeters).toBe(300);
    expect(b.zoneMeters).toBeNull();
    expect(metrics.intensity.last28).toMatchObject({
      zoneMeters: [0, 400, 0, 400, 0],
      unclassifiedMeters: 300,
      coveragePct: 26, // 800 m zoned of 3100 m swum in 28 days
      easyPct: 50,
      hardPct: 50,
    });
    const week = metrics.intensity.weeks.find((w) => w.weekStart === "2026-10-19")!;
    expect(week).toEqual({ weekStart: "2026-10-19", zoneMeters: [0, 400, 0, 400, 0], unclassifiedMeters: 300 });
  });

  it("without freestyle laps in 28 days the zones say why", () => {
    const back = activity(3, "2026-10-20T17:00:00Z", [[200, 220, "backstroke"], rest(30), [200, 215, "backstroke"]]);
    const m = computeSwimMetrics({ activities: [back], cssTest: TEST_1MPS, streakDates: [] }, NOW);
    expect(m.intensity.last28).toBeNull();
    expect(m.intensity.missing).toBe(
      "Nelle ultime 4 settimane non ci sono giri a stile libero da classificare: le zone si calcolano solo sullo stile libero.",
    );
  });
});
