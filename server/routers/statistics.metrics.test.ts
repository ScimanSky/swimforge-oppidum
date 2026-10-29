import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getSwimMetrics: vi.fn(),
  updateCssTest: vi.fn(),
}));

vi.mock("../swim_metrics", () => ({ getSwimMetrics: h.getSwimMetrics }));
vi.mock("../swim_metrics/css-test", async () => {
  const actual = await vi.importActual<typeof import("../swim_metrics/css-test")>("../swim_metrics/css-test");
  return { ...actual, updateCssTest: h.updateCssTest };
});

import { statisticsRouter } from "./admin.router";

const ctx = { user: { id: 42 } as any, req: { protocol: "https", headers: {} } as any, res: {} as any };
const anonymous = { user: null, req: { protocol: "https", headers: {} } as any, res: {} as any };

describe("statistics: swim metrics procedures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    h.updateCssTest.mockResolvedValue(true);
  });

  it("getMetrics returns the caller's metrics only", async () => {
    h.getSwimMetrics.mockResolvedValue({ generatedAt: "x" });
    const caller = statisticsRouter.createCaller(ctx);
    expect(await caller.getMetrics()).toEqual({ generatedAt: "x" });
    await (caller.getMetrics as any)({ userId: 99 });
    expect(h.getSwimMetrics).toHaveBeenCalledTimes(2);
    expect(h.getSwimMetrics.mock.calls.every(([userId]) => userId === 42)).toBe(true);
  });

  it("the old getAdvanced procedure is gone", () => {
    expect((statisticsRouter as any)._def.procedures.getAdvanced).toBeUndefined();
  });

  it.each(["getMetrics", "setCssTest", "clearCssTest"] as const)("%s requires login", async (name) => {
    const caller = statisticsRouter.createCaller(anonymous as any) as any;
    const input = name === "setCssTest" ? { t200Seconds: 170, t400Seconds: 360, date: "2026-10-20" } : undefined;
    await expect(caller[name](input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(h.getSwimMetrics).not.toHaveBeenCalled();
    expect(h.updateCssTest).not.toHaveBeenCalled();
  });

  it("setCssTest saves the caller's test", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-29T10:00:00Z"));
    const result = await statisticsRouter
      .createCaller(ctx)
      .setCssTest({ t200Seconds: 170, t400Seconds: 360, date: "2026-10-20" });
    expect(h.updateCssTest).toHaveBeenCalledWith(42, { t200Seconds: 170, t400Seconds: 360, date: "2026-10-20" });
    expect(result).toEqual({ success: true });
  });

  it("setCssTest rejects implausible times with an Italian message", async () => {
    await expect(
      statisticsRouter.createCaller(ctx).setCssTest({ t200Seconds: 180, t400Seconds: 300, date: "2026-10-20" }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Il tempo sui 400 m deve essere tra 1,9 e 2,4 volte quello sui 200 m: controlla i tempi.",
    });
    expect(h.updateCssTest).not.toHaveBeenCalled();
  });

  it("setCssTest rejects a future date", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-29T10:00:00Z"));
    await expect(
      statisticsRouter.createCaller(ctx).setCssTest({ t200Seconds: 170, t400Seconds: 360, date: "2026-10-30" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "La data del test non può essere nel futuro." });
  });

  it("clearCssTest removes the caller's test", async () => {
    expect(await statisticsRouter.createCaller(ctx).clearCssTest()).toEqual({ success: true });
    expect(h.updateCssTest).toHaveBeenCalledWith(42, null);
  });

  it("NOT_FOUND without a profile", async () => {
    h.updateCssTest.mockResolvedValue(false);
    await expect(statisticsRouter.createCaller(ctx).clearCssTest()).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
