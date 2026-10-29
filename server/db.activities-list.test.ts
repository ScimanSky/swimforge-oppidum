import { afterAll, describe, expect, it, vi } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { swimmingActivities } from "../drizzle/schema";

const m = vi.hoisted(() => {
  const state: { selection: unknown } = { selection: undefined };
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    offset: vi.fn(async () => [{ id: 1, distanceMeters: 1500 }]),
  };
  const db = {
    select: vi.fn((selection?: unknown) => {
      state.selection = selection;
      return chain;
    }),
  };
  return { state, db };
});

vi.mock("pg", () => ({
  Pool: class {
    query = vi.fn(async () => ({ rows: [] }));
    end = vi.fn(async () => {});
    on = vi.fn();
  },
}));
vi.mock("drizzle-orm/node-postgres", () => ({ drizzle: () => m.db }));

const previousUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL = "postgres://test@localhost/test";
afterAll(() => {
  if (previousUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousUrl;
});

describe("getActivities (activities.list)", () => {
  it("selects every column except the raw Garmin payload", async () => {
    const { getActivities } = await import("./db");
    await expect(getActivities(4, 50, 0)).resolves.toEqual([{ id: 1, distanceMeters: 1500 }]);

    const selection = m.state.selection as Record<string, unknown> | undefined;
    expect(selection).toBeDefined();
    const keys = Object.keys(selection!);
    expect(keys).not.toContain("rawData");

    const expected = Object.keys(getTableColumns(swimmingActivities)).filter((k) => k !== "rawData");
    expect(keys.sort()).toEqual(expected.sort());
    // Columns used by the list consumers (cards, week summary, Activities panel).
    for (const k of ["hrZone1Seconds", "hrZone5Seconds", "avgSwolf", "calories", "activityDate", "isOpenWater"]) {
      expect(keys).toContain(k);
    }
  });
});
