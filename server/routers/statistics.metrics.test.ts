import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getSwimMetrics: vi.fn(),
  updateCssTest: vi.fn(),
  updatePaceZones: vi.fn(),
  generateAIInsights: vi.fn(),
}));

vi.mock("../swim_metrics", () => ({ getSwimMetrics: h.getSwimMetrics }));
vi.mock("../ai_insights", () => ({ generateAIInsights: h.generateAIInsights }));
vi.mock("../swim_metrics/pace-zones", async () => {
  const actual = await vi.importActual<typeof import("../swim_metrics/pace-zones")>("../swim_metrics/pace-zones");
  return { ...actual, updatePaceZones: h.updatePaceZones };
});
vi.mock("../swim_metrics/css-test", async () => {
  const actual = await vi.importActual<typeof import("../swim_metrics/css-test")>("../swim_metrics/css-test");
  return { ...actual, updateCssTest: h.updateCssTest };
});

import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { statisticsRouter } from "./admin.router";

const ctx = { user: { id: 42 } as any, req: { protocol: "https", headers: {} } as any, res: {} as any };
const anonymous = { user: null, req: { protocol: "https", headers: {} } as any, res: {} as any };
const OWNER_ZONES = { a1a2: 128, a2b1: 121, b1b2: 114, b2c1: 109, c1c2: 104 };

/** A mutation through the HTTP handler, as the client sends it. */
async function post(procedure: string, input: unknown, context: unknown = ctx) {
  const response = await fetchRequestHandler({
    endpoint: "/trpc",
    req: new Request(`http://localhost/trpc/${procedure}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: input }),
    }),
    router: statisticsRouter,
    createContext: () => context as any,
  });
  return { status: response.status, body: (await response.json()) as any };
}

describe("statistics: swim metrics procedures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    h.updateCssTest.mockResolvedValue(true);
    h.updatePaceZones.mockResolvedValue(true);
  });

  it("getMetrics returns the caller's metrics only", async () => {
    h.getSwimMetrics.mockResolvedValue({ generatedAt: "x" });
    const caller = statisticsRouter.createCaller(ctx);
    expect(await caller.getMetrics()).toEqual({ generatedAt: "x" });
    await (caller.getMetrics as any)({ userId: 99 });
    expect(h.getSwimMetrics).toHaveBeenCalledTimes(2);
    expect(h.getSwimMetrics.mock.calls.every(([userId]) => userId === 42)).toBe(true);
  });

  it("getAdvanced is only a stub for the old installed builds: null for a logged-in caller, whatever the input", async () => {
    const caller = statisticsRouter.createCaller(ctx) as any;
    expect(await caller.getAdvanced({ days: 30 })).toBeNull();
    expect(await caller.getAdvanced()).toBeNull();
    // Through the HTTP handler as the old builds send it (GET, superjson input).
    const response = await fetchRequestHandler({
      endpoint: "/trpc",
      req: new Request(`http://localhost/trpc/getAdvanced?input=${encodeURIComponent(JSON.stringify({ json: { days: 30 } }))}`),
      router: statisticsRouter,
      createContext: () => ctx as any,
    });
    expect(response.status).toBe(200);
    expect(((await response.json()) as any).result.data.json).toBeNull();
    expect(h.getSwimMetrics).not.toHaveBeenCalled();
  });

  it("getInsights builds the Coach page insights from the caller's metrics", async () => {
    const metrics = { generatedAt: "x", sessions: [] };
    h.getSwimMetrics.mockResolvedValue(metrics);
    h.generateAIInsights.mockResolvedValue(["🏊 Tecnica: ..."]);
    expect(await statisticsRouter.createCaller(ctx).getInsights()).toEqual(["🏊 Tecnica: ..."]);
    expect(h.getSwimMetrics).toHaveBeenCalledWith(42);
    expect(h.generateAIInsights).toHaveBeenCalledWith(metrics, 42);
  });

  it.each(["getMetrics", "getAdvanced", "getInsights", "setCssTest", "clearCssTest", "setPaceZones", "clearPaceZones"] as const)(
    "%s requires login",
    async (name) => {
      const caller = statisticsRouter.createCaller(anonymous as any) as any;
      const input =
        name === "setCssTest"
          ? { t200Seconds: 170, t400Seconds: 360, date: "2026-10-20" }
          : name === "setPaceZones"
            ? OWNER_ZONES
            : undefined;
      await expect(caller[name](input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      expect(h.getSwimMetrics).not.toHaveBeenCalled();
      expect(h.updateCssTest).not.toHaveBeenCalled();
      expect(h.updatePaceZones).not.toHaveBeenCalled();
    },
  );

  it("setPaceZones saves the caller's zones", async () => {
    expect(await statisticsRouter.createCaller(ctx).setPaceZones(OWNER_ZONES)).toEqual({ success: true });
    expect(h.updatePaceZones).toHaveBeenCalledWith(42, OWNER_ZONES);
  });

  it("setPaceZones errors carry the Italian message on their field (zodError.fieldErrors)", async () => {
    const { status, body } = await post("setPaceZones", { ...OWNER_ZONES, a1a2: 300, c1c2: 110 });
    expect(status).toBe(400);
    expect(body.error.json.data.zodError.fieldErrors).toEqual({
      a1a2: ["Scrivi un passo tra 1:00 e 4:00 per 100 m."],
      c1c2: ["Il confine tra C1 e C2 deve essere più veloce di quello tra B2 e C1 (1:49)."],
    });
    expect(h.updatePaceZones).not.toHaveBeenCalled();
  });

  it("clearPaceZones removes the caller's zones; NOT_FOUND without a profile", async () => {
    expect(await statisticsRouter.createCaller(ctx).clearPaceZones()).toEqual({ success: true });
    expect(h.updatePaceZones).toHaveBeenCalledWith(42, null);
    h.updatePaceZones.mockResolvedValue(false);
    await expect(statisticsRouter.createCaller(ctx).clearPaceZones()).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(statisticsRouter.createCaller(ctx).setPaceZones(OWNER_ZONES)).rejects.toMatchObject({ code: "NOT_FOUND" });
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

  it("setCssTest rejects implausible times as BAD_REQUEST", async () => {
    await expect(
      statisticsRouter.createCaller(ctx).setCssTest({ t200Seconds: 180, t400Seconds: 300, date: "2026-10-20" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(h.updateCssTest).not.toHaveBeenCalled();
  });

  // Through the HTTP handler: the client reads error.data.zodError.fieldErrors[field].
  async function postSetCssTest(input: unknown, context: unknown = ctx) {
    return post("setCssTest", input, context);
  }

  it("setCssTest errors carry the Italian message on their field (zodError.fieldErrors)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-29T10:00:00Z"));
    const { status, body } = await postSetCssTest({ t200Seconds: 99, t400Seconds: 300, date: "2026-10-30" });
    expect(status).toBe(400);
    const data = body.error.json.data;
    expect(data.code).toBe("BAD_REQUEST");
    expect(data.zodError.fieldErrors).toEqual({
      t200Seconds: ["Il tempo sui 200 m deve essere tra 1:40 e 7:00."],
      date: ["La data del test non può essere nel futuro."],
    });
    expect(data.zodError.formErrors).toEqual([]);
    // Nothing else is added to the error shape.
    expect(Object.keys(data).sort()).toEqual(expect.arrayContaining(["code", "httpStatus", "path", "zodError"]));
    expect(JSON.stringify(data.zodError)).not.toContain("99");
    expect(h.updateCssTest).not.toHaveBeenCalled();
  });

  it("the 400 ratio error sits on t400Seconds", async () => {
    const { body } = await postSetCssTest({ t200Seconds: 180, t400Seconds: 300, date: "2026-10-20" });
    expect(body.error.json.data.zodError.fieldErrors).toEqual({
      t400Seconds: ["Il 400 è troppo veloce rispetto al 200: deve durare almeno 2,02 volte il tempo sui 200 m. Controlla i tempi."],
    });
  });

  it("errors that are not input validation have zodError null", async () => {
    h.updateCssTest.mockResolvedValue(false);
    const { status, body } = await postSetCssTest({ t200Seconds: 170, t400Seconds: 360, date: "2026-10-20" });
    expect(status).toBe(404);
    expect(body.error.json.data.zodError).toBeNull();
    const anonymous = await postSetCssTest({ t200Seconds: 170, t400Seconds: 360, date: "2026-10-20" }, { user: null, req: { headers: {} }, res: {} });
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.json.data.zodError).toBeNull();
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
