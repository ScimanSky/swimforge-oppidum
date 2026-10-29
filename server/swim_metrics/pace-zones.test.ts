import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { aiInsightsCache, swimmerProfiles } from "../../drizzle/schema";

const m = vi.hoisted(() => {
  const state = { profileExists: true, updates: [] as Array<{ table: unknown; values: any }> };
  const db = {
    select: vi.fn(),
    update: vi.fn((table: unknown) => ({
      set: (values: unknown) => {
        state.updates.push({ table, values });
        return { where: () => ({ returning: async () => (state.profileExists ? [{ id: 1 }] : []) }) };
      },
    })),
    delete: vi.fn(() => ({ where: async () => undefined })),
  };
  return { state, db, deleteCached: vi.fn(async () => {}) };
});

vi.mock("../db", () => ({ getDb: async () => m.db }));
vi.mock("../lib/cache", async () => {
  const actual = await vi.importActual<typeof import("../lib/cache")>("../lib/cache");
  return { ...actual, deleteCached: m.deleteCached };
});

import { z } from "zod";
import { paceZonesSchema, updatePaceZones } from "./pace-zones";

const OWNER = { a1a2: 128, a2b1: 121, b1b2: 114, b2c1: 109, c1c2: 104 };
const RANGE = "Scrivi un passo tra 1:00 e 4:00 per 100 m.";

const fieldErrors = (input: unknown) => {
  const result = paceZonesSchema.safeParse(input);
  return result.success ? null : (z.flattenError(result.error).fieldErrors as Record<string, string[]>);
};

describe("paceZonesSchema", () => {
  it("accepts five paces from the slowest to the fastest", () => {
    expect(paceZonesSchema.parse(OWNER)).toEqual(OWNER);
    expect(fieldErrors({ ...OWNER, a1a2: 240, c1c2: 60 })).toBeNull();
  });

  it("each pace between 1:00 and 4:00 per 100 m, the message on its field", () => {
    expect(fieldErrors({ ...OWNER, a1a2: 241 })).toEqual({ a1a2: [RANGE] });
    expect(fieldErrors({ ...OWNER, c1c2: 59 })).toEqual({ c1c2: [RANGE] });
    expect(fieldErrors({ ...OWNER, b1b2: "1:54" })).toEqual({ b1b2: [RANGE] });
    expect(fieldErrors({ ...OWNER, b2c1: Number.NaN })).toEqual({ b2c1: [RANGE] });
  });

  it("strictly decreasing: each boundary faster than the previous, the message on the faster one", () => {
    expect(fieldErrors({ ...OWNER, a2b1: 128 })).toEqual({
      a2b1: ["Il confine tra A2 e B1 deve essere più veloce di quello tra A1 e A2 (2:08)."],
    });
    expect(fieldErrors({ ...OWNER, c1c2: 110 })).toEqual({
      c1c2: ["Il confine tra C1 e C2 deve essere più veloce di quello tra B2 e C1 (1:49)."],
    });
  });

  it("a pace out of range is not also reported as out of order", () => {
    expect(fieldErrors({ ...OWNER, a1a2: 300, a2b1: 50 })).toEqual({ a1a2: [RANGE], a2b1: [RANGE] });
    // b1b2 out of range: b2c1 is compared with the last valid boundary (a2b1).
    expect(fieldErrors({ ...OWNER, b1b2: 30, b2c1: 125 })).toEqual({
      b1b2: [RANGE],
      b2c1: ["Il confine tra B2 e C1 deve essere più veloce di quello tra A2 e B1 (2:01)."],
    });
  });
});

describe("updatePaceZones", () => {
  const render = (value: any) => new PgDialect().sqlToQuery(value);
  const NOW = new Date("2026-10-29T10:00:00Z");

  beforeEach(() => {
    vi.clearAllMocks();
    m.state.updates.length = 0;
    m.state.profileExists = true;
  });

  it("merges preferences.paceZones (bounds and date) in one UPDATE, then drops the metrics and the insights", async () => {
    expect(await updatePaceZones(42, OWNER, NOW)).toBe(true);
    expect(m.db.select).not.toHaveBeenCalled();
    expect(m.state.updates).toHaveLength(1);
    expect(m.state.updates[0].table).toBe(swimmerProfiles);
    const { sql, params } = render(m.state.updates[0].values.preferences);
    expect(sql).toContain("||");
    expect(params).toEqual([JSON.stringify({ paceZones: { bounds: OWNER, updatedAt: "2026-10-29T10:00:00.000Z" } })]);
    expect(m.deleteCached).toHaveBeenCalledWith("swim-metrics:v3:42:2026-10-29");
    expect(m.db.delete).toHaveBeenCalledWith(aiInsightsCache);
  });

  it("removes only the manual zones", async () => {
    expect(await updatePaceZones(42, null, NOW)).toBe(true);
    const { sql, params } = render(m.state.updates[0].values.preferences);
    expect(sql).toMatch(/- \$\d+::text/);
    expect(params).toEqual(["{}", "paceZones"]);
    expect(m.deleteCached).toHaveBeenCalled();
  });

  it("without a profile nothing is invalidated", async () => {
    m.state.profileExists = false;
    expect(await updatePaceZones(42, OWNER, NOW)).toBe(false);
    expect(m.deleteCached).not.toHaveBeenCalled();
  });
});
