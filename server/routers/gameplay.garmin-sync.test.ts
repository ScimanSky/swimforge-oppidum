import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  syncGarminActivities: vi.fn(),
  hasGrantedConsent: vi.fn(),
}));

vi.mock("../garmin", () => ({ syncGarminActivities: h.syncGarminActivities }));
vi.mock("../consent", () => ({ hasGrantedConsent: h.hasGrantedConsent }));

import { garminRouter } from "./gameplay.router";

const ctx = { user: { id: 42 } as any, req: { protocol: "https", headers: {} } as any, res: {} as any };

describe("garmin.sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.hasGrantedConsent.mockResolvedValue(true);
    h.syncGarminActivities.mockResolvedValue({ synced: 1, newXp: 10, detectedPbs: [] });
  });

  it("passes the chosen number of recent swims to the sync", async () => {
    await garminRouter.createCaller(ctx).sync({ daysBack: 30, maxActivities: 5 });
    expect(h.syncGarminActivities).toHaveBeenCalledWith(42, 30, 5);
  });

  it("keeps the day-window sync when no count is given", async () => {
    await garminRouter.createCaller(ctx).sync({ daysBack: 30 });
    expect(h.syncGarminActivities).toHaveBeenCalledWith(42, 30, undefined);
  });

  it.each([0, 2, 11])("rejects %s as a count (only 1, 5 or 10)", async (count) => {
    await expect(
      garminRouter.createCaller(ctx).sync({ daysBack: 30, maxActivities: count as any }),
    ).rejects.toThrow();
    expect(h.syncGarminActivities).not.toHaveBeenCalled();
  });

  it("still requires the consents before syncing", async () => {
    h.hasGrantedConsent.mockResolvedValue(false);
    await expect(
      garminRouter.createCaller(ctx).sync({ daysBack: 30, maxActivities: 1 }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(h.syncGarminActivities).not.toHaveBeenCalled();
  });
});
