import { describe, expect, it } from "vitest";
import { efficiencySummary, sessionEfficiency } from "./efficiency";
import { lapsFrom } from "./test-helpers";

describe("sessionEfficiency (Stroke Index)", () => {
  it("distance-weighted SI and DPS of the active freestyle laps with strokes", () => {
    const laps = lapsFrom([
      [100, 100, "freestyle", 50, 37], // DPS 2.0 m/cycle, v 1.0 m/s, SI 2.0
      [0, 30], // rest
      [200, 180, "freestyle", 100, 36], // DPS 2.0, v 1.111, SI 2.222
      [100, 110, "backstroke", 45, 40], // not freestyle
      [100, 95, "freestyle", null, 35], // no strokes
    ]);
    const result = sessionEfficiency(laps);
    expect(result.strokeIndex).toBeCloseTo((100 * 2 + 200 * (200 / 180) * 2) / 300, 9); // 2.148
    expect(result.dpsMeters).toBeCloseTo(2, 9);
    // 150 cycles in 280 s.
    expect(result.strokeRate).toBeCloseTo(150 / (280 / 60), 9); // 32.1 cycles/min
    expect(result.swolf).toBeCloseTo((100 * 37 + 200 * 36) / 300, 9); // 36.3
  });

  it("no usable laps: all null", () => {
    expect(sessionEfficiency(lapsFrom([[100, 100, "freestyle"], [100, 110, "backstroke", 45]]))).toEqual({
      strokeIndex: null,
      dpsMeters: null,
      strokeRate: null,
      swolf: null,
      speedMps: null,
    });
  });

  it("uses only laps with 0.9–3.2 m per cycle and at least 15 cycles a minute", () => {
    const laps = lapsFrom([
      [100, 100, "freestyle", 50, 37], // 2.0 m/cycle, 30/min: kept
      [100, 100, "freestyle", 125, 40], // 0.8 m/cycle: miscounted strokes
      [100, 100, "freestyle", 30, 30], // 3.33 m/cycle: missed strokes
      [100, 240, "freestyle", 40, 50], // 2.5 m/cycle but 10 cycles/min: a stop inside the lap
      [100, 100, "freestyle", 112, 40], // 0.89 m/cycle: just under
      [96, 90, "freestyle", 30, 30], // exactly 3.2 m/cycle, 20/min: kept
      [100, 400, "freestyle", 100, 40], // exactly 15 cycles/min, 1.0 m/cycle: kept
    ]);
    const result = sessionEfficiency(laps);
    const si = [
      [(100 / 100) * 2, 100],
      [(96 / 90) * 3.2, 96],
      [(100 / 400) * 1, 100],
    ];
    expect(result.strokeIndex).toBeCloseTo(si.reduce((s, [v, w]) => s + v * w, 0) / 296, 9);
    expect(result.strokeRate).toBeCloseTo((50 + 30 + 100) / ((100 + 90 + 400) / 60), 9);
    expect(result.speedMps).toBeCloseTo(296 / 590, 9);
    expect(sessionEfficiency(lapsFrom([[100, 100, "freestyle", 125, 40]])).strokeIndex).toBeNull();
  });
});

describe("efficiencySummary", () => {
  const now = new Date("2026-10-29T12:00:00Z");
  const session = (
    date: string,
    strokeIndex: number | null,
    poolLengthMeters: number | null = 25,
    isOpenWater = false,
    dpsMeters: number | null = strokeIndex === null ? null : 2,
    speedMps: number | null = strokeIndex === null ? null : strokeIndex / 2,
  ) => ({ date, strokeIndex, poolLengthMeters, isOpenWater, dpsMeters, speedMps });

  it("compares the median of the last 28 days with the median of the 90 days before, same pool length", () => {
    const sessions = [
      session("2026-07-10", 2.0),
      session("2026-08-01", 2.2),
      session("2026-08-20", 3.0, 50), // 50 m pool: not in the 25 m baseline
      session("2026-09-15", 2.1),
      session("2026-10-05", 2.2),
      session("2026-10-20", 2.4),
      session("2026-10-25", 2.9, 50), // the 50 m pool is less frequent in the last 28 days
      session("2026-10-26", 2.4),
    ];
    const result = efficiencySummary(sessions, now);
    expect(result.poolLengthMeters).toBe(25);
    expect(result.latest).toBe(2.4);
    expect(result.avg28).toBe(2.4); // median of 2.2, 2.4, 2.4
    expect(result.baseline).toBe(2.1); // median of 2.0, 2.2, 2.1
    expect(result.deltaPct).toBeCloseTo(((2.4 - 2.1) / 2.1) * 100, 9); // +14.3%
    expect(result.n28).toBe(3);
    expect(result.nBaseline).toBe(3);
    expect(result.missing).toBeNull();
  });

  it("gives the median distance per cycle and pace of both windows, to tell a longer stroke from a faster one", () => {
    const sessions = [
      session("2026-08-01", 2.0, 25, false, 2.0, 1.0), // 1:40/100 m
      session("2026-08-10", 2.0, 25, false, 2.0, 1.0),
      session("2026-09-01", 2.1, 25, false, 2.1, 1.0),
      // Last 28 days: same pace, longer stroke.
      session("2026-10-10", 2.2, 25, false, 2.2, 1.0),
      session("2026-10-20", 2.3, 25, false, 2.3, 1.0),
    ];
    const result = efficiencySummary(sessions, now);
    expect(result.dps28).toBeCloseTo(2.25, 9);
    expect(result.dpsBaseline).toBe(2.0);
    expect(result.pace28).toBeCloseTo(100, 9);
    expect(result.paceBaseline).toBeCloseTo(100, 9);
  });

  it("without at least 3 baseline swims there is no baseline", () => {
    const result = efficiencySummary(
      [session("2026-08-01", 2.0), session("2026-08-20", 2.2), session("2026-10-20", 2.4)],
      now,
    );
    expect(result.latest).toBe(2.4);
    expect(result.nBaseline).toBe(2);
    expect(result).toMatchObject({ baseline: null, deltaPct: null, dpsBaseline: null, paceBaseline: null });
    expect(result.missing).toBe(
      "Per la tua base servono almeno 3 nuotate in questa vasca nei 90 giorni prima delle ultime 4 settimane.",
    );
  });

  it("without recent data everything is null", () => {
    const result = efficiencySummary([session("2026-08-20", 2.4), session("2026-10-20", null)], now);
    expect(result).toMatchObject({ poolLengthMeters: null, latest: null, avg28: null, baseline: null, deltaPct: null, n28: 0 });
    expect(result.missing).toMatch(/stile libero/);
  });
});
