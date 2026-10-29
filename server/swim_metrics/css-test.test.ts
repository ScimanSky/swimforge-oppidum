import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { swimmerProfiles } from "../../drizzle/schema";

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
import { cssTestSchema, updateCssTest, validateCssTest } from "./css-test";

describe("validateCssTest", () => {
  const today = "2026-10-29";
  const ok = { t200Seconds: 170, t400Seconds: 360, date: "2026-10-20" };
  const T200 = "Il tempo sui 200 m deve essere tra 1:40 e 7:00.";
  const T400 = "Il tempo sui 400 m deve essere tra 3:00 e 15:00.";

  it("accepts plausible times and a past date", () => {
    expect(validateCssTest(ok, today)).toBeNull();
    expect(validateCssTest({ ...ok, date: today }, today)).toBeNull();
  });

  it.each([
    [{ t200Seconds: 99, t400Seconds: 210 }, "t200Seconds", T200], // the 200 must be ≥ 1:40
    [{ t200Seconds: 421, t400Seconds: 900 }, "t200Seconds", T200],
    [{ t400Seconds: 179 }, "t400Seconds", T400],
    [{ t400Seconds: 901 }, "t400Seconds", T400],
    [{ t200Seconds: Number.NaN }, "t200Seconds", T200],
    [{ date: "2026-10-30" }, "date", "La data del test non può essere nel futuro."],
    [{ date: "2026-02-30" }, "date", "Data non valida."],
    [{ date: "20/10/2026" }, "date", "Data non valida."],
  ] as const)("rejects %o", (patch, field, message) => {
    expect(validateCssTest({ ...ok, ...patch }, today)).toEqual({ field, message });
  });

  it("T400 must be 2.02 to 2.4 times T200: the CSS is never faster than the 400 pace (D′ ≥ 0)", () => {
    const tooFast = "Il 400 è troppo veloce rispetto al 200: deve durare almeno 2,02 volte il tempo sui 200 m. Controlla i tempi.";
    const tooSlow = "Il 400 è troppo lento rispetto al 200: deve durare al massimo 2,4 volte il tempo sui 200 m. Controlla i tempi.";
    // 200 in 3:00 and 400 in 6:00: CSS 1:30, as fast as the 400 itself (D′ = 0, ratio 2).
    expect(validateCssTest({ ...ok, t200Seconds: 180, t400Seconds: 360 }, today)).toEqual({ field: "t400Seconds", message: tooFast });
    expect(validateCssTest({ ...ok, t200Seconds: 180, t400Seconds: 363 }, today)).toEqual({ field: "t400Seconds", message: tooFast });
    expect(validateCssTest({ ...ok, t200Seconds: 180, t400Seconds: 433 }, today)).toEqual({ field: "t400Seconds", message: tooSlow });
    expect(validateCssTest({ ...ok, t200Seconds: 180, t400Seconds: 363.6 }, today)).toBeNull(); // 2.02
    expect(validateCssTest({ ...ok, t200Seconds: 180, t400Seconds: 432 }, today)).toBeNull(); // 2.4
  });

  it("the resulting CSS must be within 1:00–3:30/100 m", () => {
    const message =
      "Con questi tempi il passo soglia sarebbe fuori dall'intervallo accettato (tra 1:00 e 3:30 per 100 m): controlla i tempi.";
    // 200 in 6:40 and 400 in 14:00: CSS (840 − 400) / 2 = 220 s/100 m.
    expect(validateCssTest({ ...ok, t200Seconds: 400, t400Seconds: 840 }, today)).toEqual({ field: "t400Seconds", message });
    // 200 in 7:00 and 400 in 14:40: CSS 3:40/100 m.
    expect(validateCssTest({ ...ok, t200Seconds: 420, t400Seconds: 880 }, today)).toEqual({ field: "t400Seconds", message });
    // 200 in 6:00 and 400 in 13:00: CSS 3:30/100 m, the limit.
    expect(validateCssTest({ ...ok, t200Seconds: 360, t400Seconds: 780 }, today)).toBeNull();
  });

  it("the schema puts each message on its field", () => {
    const result = cssTestSchema(() => today).safeParse({ t200Seconds: 180, t400Seconds: 360, date: "2026-10-30" });
    expect(result.success).toBe(false);
    const fieldErrors = z.flattenError(result.error!).fieldErrors as Record<string, string[]>;
    expect(fieldErrors.date).toEqual(["La data del test non può essere nel futuro."]);
    expect(fieldErrors.t400Seconds?.[0]).toMatch(/troppo veloce/);
    expect(fieldErrors.t200Seconds).toBeUndefined();
  });
});

describe("updateCssTest", () => {
  const render = (value: any) => new PgDialect().sqlToQuery(value);

  beforeEach(() => {
    vi.clearAllMocks();
    m.state.updates.length = 0;
    m.state.profileExists = true;
  });

  it("merges the test into the stored preferences in one UPDATE (no read), then drops the cache", async () => {
    const test = { t200Seconds: 170, t400Seconds: 360, date: "2026-10-20" };

    expect(await updateCssTest(42, test)).toBe(true);

    expect(m.db.select).not.toHaveBeenCalled();
    expect(m.state.updates).toHaveLength(1);
    expect(m.state.updates[0].table).toBe(swimmerProfiles);
    const { sql, params } = render(m.state.updates[0].values.preferences);
    expect(sql).toContain("||");
    expect(params).toEqual([JSON.stringify({ cssTest: test })]);
    expect(m.deleteCached).toHaveBeenCalledWith(expect.stringMatching(/^swim-metrics:v\d+:42/));
  });

  it("removes only the test", async () => {
    expect(await updateCssTest(42, null)).toBe(true);
    const { sql, params } = render(m.state.updates[0].values.preferences);
    expect(sql).toMatch(/- \$\d+::text/);
    expect(params).toEqual(["{}", "cssTest"]);
  });

  it("without a profile nothing is invalidated", async () => {
    m.state.profileExists = false;
    expect(await updateCssTest(42, null)).toBe(false);
    expect(m.deleteCached).not.toHaveBeenCalled();
  });
});
