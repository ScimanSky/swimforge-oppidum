import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

// Opening a Garmin swim stores its laps lazily: its training records must follow.

const m = vi.hoisted(() => {
  const state = { existingLapRows: [] as Array<{ id: number }> };
  const chain: any = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: async () => state.existingLapRows,
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve([]).then(resolve, reject),
  };
  const db = {
    select: vi.fn(() => chain),
    update: vi.fn(() => ({ set: () => ({ where: async () => {} }) })),
  };
  return {
    state,
    db,
    getActivityById: vi.fn(),
    getGarminActivityFullDetails: vi.fn(),
    persistGarminLapDetails: vi.fn(),
    recompute: vi.fn(),
  };
});

vi.mock("../db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../db")>()),
  getDb: async () => m.db,
  getActivityById: m.getActivityById,
}));
vi.mock("../garmin", () => ({
  getGarminActivityFullDetails: m.getGarminActivityFullDetails,
  extractGarminAdvancedFields: () => ({ strokeType: null, hrZones: null }),
  persistGarminLapDetails: m.persistGarminLapDetails,
}));
vi.mock("../personal_records", () => ({ recomputePersonalRecordsFromStoredLaps: m.recompute }));

import { activitiesRouter } from "./activities.router";

const USER = 42;

function ctx(): TrpcContext {
  return {
    user: { id: USER } as TrpcContext["user"],
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const GARMIN_SWIM = {
  id: 21,
  userId: USER,
  activitySource: "garmin",
  garminActivityId: "g21",
  strokeType: "freestyle",
  rawData: {},
};

describe("activities.get records recompute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.state.existingLapRows = [];
    m.getActivityById.mockResolvedValue({ ...GARMIN_SWIM });
    m.getGarminActivityFullDetails.mockResolvedValue({ activity: { summaryDTO: {} }, splits: { lapDTOs: [{}] } });
    m.persistGarminLapDetails.mockResolvedValue(3);
    m.recompute.mockResolvedValue({ candidates: 1, inserted: 1, updated: 0, unchanged: 0, skippedManual: 0 });
  });

  it("recomputes the swim's records right after storing its laps", async () => {
    await activitiesRouter.createCaller(ctx()).get({ id: 21 });

    expect(m.persistGarminLapDetails).toHaveBeenCalledWith(m.db, 21, expect.anything());
    expect(m.recompute).toHaveBeenCalledTimes(1);
    expect(m.recompute).toHaveBeenCalledWith(USER, { activityIds: [21] });
    expect(m.persistGarminLapDetails.mock.invocationCallOrder[0]).toBeLessThan(m.recompute.mock.invocationCallOrder[0]!);
  });

  it("does not recompute when the laps were already stored", async () => {
    m.state.existingLapRows = [{ id: 1 }];

    await activitiesRouter.createCaller(ctx()).get({ id: 21 });

    expect(m.persistGarminLapDetails).not.toHaveBeenCalled();
    expect(m.recompute).not.toHaveBeenCalled();
  });

  it("does not recompute when Garmin had no laps to store", async () => {
    m.persistGarminLapDetails.mockResolvedValue(0);

    await activitiesRouter.createCaller(ctx()).get({ id: 21 });

    expect(m.recompute).not.toHaveBeenCalled();
  });

  it("still returns the swim when the recompute fails", async () => {
    m.recompute.mockRejectedValue(new Error("db down"));

    const result = await activitiesRouter.createCaller(ctx()).get({ id: 21 });

    expect(result).toMatchObject({ id: 21, garminLaps: [], garminLengths: [] });
  });
});
