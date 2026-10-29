import { describe, expect, it, vi } from "vitest";
import { aiCoachWorkouts, swimmingActivities } from "../drizzle/schema";

const h = vi.hoisted(() => {
  const state = { swims: 5, lastGeneratedAt: null as Date | null };
  const db = {
    select: vi.fn(() => {
      let table: unknown;
      const rows = () =>
        table === swimmingActivities
          ? [{ count: state.swims }]
          : table === aiCoachWorkouts && state.lastGeneratedAt
            ? [{ generatedAt: state.lastGeneratedAt }]
            : [];
      const chain: any = {
        from: (t: unknown) => {
          table = t;
          return chain;
        },
        where: () => chain,
        orderBy: () => chain,
        limit: () => chain,
        then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
          Promise.resolve(rows()).then(resolve, reject),
      };
      return chain;
    }),
  };
  return { state, db };
});

vi.mock("./db", () => ({ getDb: vi.fn(async () => h.db) }));
vi.mock("./swim_metrics", () => ({ getSwimMetrics: vi.fn() }));

import { generateBothWorkouts, workoutCooldownMessage } from "./ai_coach";
import { AppError } from "./lib/errors";

describe("workout generation cooldown", () => {
  it("says when the next generation is possible, in Italian and in Rome time", () => {
    expect(workoutCooldownMessage(new Date("2026-11-05T17:30:00Z"))).toBe(
      "Potrai generare nuovi allenamenti dal 5 novembre alle 18:30.",
    );
    // Summer time, and the article elided before «8» and «11».
    expect(workoutCooldownMessage(new Date("2026-07-08T07:05:00Z"))).toBe(
      "Potrai generare nuovi allenamenti dall'8 luglio alle 09:05.",
    );
    expect(workoutCooldownMessage(new Date("2026-12-11T20:00:00Z"))).toBe(
      "Potrai generare nuovi allenamenti dall'11 dicembre alle 21:00.",
    );
    // 23:30 UTC on 31 October is already 1 November in Rome.
    expect(workoutCooldownMessage(new Date("2026-10-31T23:30:00Z"))).toBe(
      "Potrai generare nuovi allenamenti dal 1° novembre alle 00:30.",
    );
  });

  it("during the 7 days after a generation: PRECONDITION_FAILED with the Italian date, no Gemini call", async () => {
    h.state.swims = 5;
    h.state.lastGeneratedAt = new Date(Date.now() - 2 * 24 * 3600_000);
    const end = new Date(h.state.lastGeneratedAt.getTime() + 7 * 24 * 3600_000);

    const error = await generateBothWorkouts(42).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: "PRECONDITION_FAILED", message: workoutCooldownMessage(end) });
    expect((error as Error).message).not.toMatch(/cooldown|\dT\d/);
  });

  it("fewer than 3 swims: PRECONDITION_FAILED", async () => {
    h.state.swims = 2;
    h.state.lastGeneratedAt = null;
    await expect(generateBothWorkouts(42)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "Servono almeno 3 attività di nuoto sincronizzate per generare i workout AI.",
    });
  });
});
