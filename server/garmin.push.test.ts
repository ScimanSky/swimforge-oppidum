import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ sendPushToUser: vi.fn() }));

vi.mock("./db", () => ({ getDb: vi.fn(), upsertPersonalRecord: vi.fn() }));
vi.mock("./push", () => ({ sendPushToUser: h.sendPushToUser }));

import { notifyGarminSyncResult } from "./garmin";

describe("Garmin sync push hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.sendPushToUser.mockResolvedValue({ sent: 1, failed: 0 });
  });

  it("pushes the sync summary to /track (gated by the activity_sync setting)", () => {
    notifyGarminSyncResult(9, 2, []);
    expect(h.sendPushToUser).toHaveBeenCalledTimes(1);
    expect(h.sendPushToUser).toHaveBeenCalledWith(
      9,
      expect.objectContaining({ body: "2 nuove attività importate", url: "/track" }),
      { settingKey: "activity_sync" },
    );
  });

  it("pushes new personal records to /profile", () => {
    notifyGarminSyncResult(9, 1, [{ strokeType: "freestyle", distanceMeters: 100, newTimeCs: 6532 }]);
    expect(h.sendPushToUser).toHaveBeenCalledWith(
      9,
      expect.objectContaining({ title: "Nuovo record personale!", body: "Stile libero 100m in 1:05.32", url: "/profile" }),
    );
  });

  it("stays silent without new activities", () => {
    notifyGarminSyncResult(9, 0, []);
    expect(h.sendPushToUser).not.toHaveBeenCalled();
  });

  it("never throws when the push rejects", () => {
    h.sendPushToUser.mockRejectedValue(new Error("boom"));
    expect(() => notifyGarminSyncResult(9, 1, [])).not.toThrow();
  });
});
