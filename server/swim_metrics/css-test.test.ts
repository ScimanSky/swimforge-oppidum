import { beforeEach, describe, expect, it, vi } from "vitest";
import { swimmerProfiles } from "../../drizzle/schema";

const m = vi.hoisted(() => {
  const state = { preferences: undefined as unknown, profileExists: true, updates: [] as Array<{ table: unknown; values: any }> };
  const db = {
    select: vi.fn(() => {
      const chain: any = {
        from: () => chain,
        where: () => chain,
        limit: async () => (state.profileExists ? [{ preferences: state.preferences }] : []),
      };
      return chain;
    }),
    update: vi.fn((table: unknown) => ({
      set: (values: unknown) => {
        state.updates.push({ table, values });
        return { where: async () => undefined };
      },
    })),
  };
  return { state, db, deleteCached: vi.fn(async () => {}) };
});

vi.mock("../db", () => ({ getDb: async () => m.db }));
vi.mock("../lib/cache", async () => {
  const actual = await vi.importActual<typeof import("../lib/cache")>("../lib/cache");
  return { ...actual, deleteCached: m.deleteCached };
});

import { updateCssTest, validateCssTest } from "./css-test";

describe("validateCssTest", () => {
  const today = "2026-10-29";
  const ok = { t200Seconds: 170, t400Seconds: 360, date: "2026-10-20" };

  it("accepts plausible times and a past date", () => {
    expect(validateCssTest(ok, today)).toBeNull();
    expect(validateCssTest({ ...ok, date: today }, today)).toBeNull();
  });

  it.each([
    [{ t200Seconds: 89 }, "t200Seconds", "Il tempo sui 200 m deve essere tra 1:30 e 7:00."],
    [{ t200Seconds: 421, t400Seconds: 900 }, "t200Seconds", "Il tempo sui 200 m deve essere tra 1:30 e 7:00."],
    [{ t400Seconds: 179 }, "t400Seconds", "Il tempo sui 400 m deve essere tra 3:00 e 15:00."],
    [{ t400Seconds: 901 }, "t400Seconds", "Il tempo sui 400 m deve essere tra 3:00 e 15:00."],
    [{ date: "2026-10-30" }, "date", "La data del test non può essere nel futuro."],
    [{ date: "2026-02-30" }, "date", "Data non valida."],
    [{ date: "20/10/2026" }, "date", "Data non valida."],
  ] as const)("rejects %o", (patch, field, message) => {
    expect(validateCssTest({ ...ok, ...patch }, today)).toEqual({ field, message });
  });

  it("T400 must be 1.9 to 2.4 times T200", () => {
    const message = "Il tempo sui 400 m deve essere tra 1,9 e 2,4 volte quello sui 200 m: controlla i tempi.";
    expect(validateCssTest({ ...ok, t200Seconds: 180, t400Seconds: 341 }, today)).toEqual({ field: "t400Seconds", message });
    expect(validateCssTest({ ...ok, t200Seconds: 180, t400Seconds: 433 }, today)).toEqual({ field: "t400Seconds", message });
    expect(validateCssTest({ ...ok, t200Seconds: 180, t400Seconds: 342 }, today)).toBeNull(); // 1.9
    expect(validateCssTest({ ...ok, t200Seconds: 180, t400Seconds: 432 }, today)).toBeNull(); // 2.4
  });
});

describe("updateCssTest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.state.updates.length = 0;
    m.state.profileExists = true;
  });

  it("saves the test without touching the other preference keys, then drops the cache", async () => {
    m.state.preferences = { units: "metric", autoplayVideos: false };
    const test = { t200Seconds: 170, t400Seconds: 360, date: "2026-10-20" };

    expect(await updateCssTest(42, test)).toBe(true);

    expect(m.state.updates).toHaveLength(1);
    expect(m.state.updates[0].table).toBe(swimmerProfiles);
    expect(m.state.updates[0].values.preferences).toEqual({ units: "metric", autoplayVideos: false, cssTest: test });
    expect(m.deleteCached).toHaveBeenCalledWith("swim-metrics:v1:42");
  });

  it("removes only the test", async () => {
    m.state.preferences = { units: "metric", cssTest: { t200Seconds: 170, t400Seconds: 360, date: "2026-10-20" } };

    expect(await updateCssTest(42, null)).toBe(true);

    expect(m.state.updates[0].values.preferences).toEqual({ units: "metric" });
  });

  it("reads preferences stored as a JSON string", async () => {
    m.state.preferences = JSON.stringify({ language: "it" });
    await updateCssTest(42, { t200Seconds: 170, t400Seconds: 360, date: "2026-10-20" });
    expect(m.state.updates[0].values.preferences).toMatchObject({ language: "it", cssTest: { t200Seconds: 170 } });
  });

  it("without a profile nothing is written", async () => {
    m.state.profileExists = false;
    expect(await updateCssTest(42, null)).toBe(false);
    expect(m.state.updates).toHaveLength(0);
  });
});
