import { beforeEach, describe, expect, it, vi } from "vitest";

// The AI insight job stores Garmin laps lazily for swims that had none: their
// training records must follow, like in the sync and in activities.get.

const m = vi.hoisted(() => {
  // Never reach Gemini from a test: the job stops after the lap storage.
  delete process.env.GEMINI_API_KEY;
  const state = { existingLapRows: [] as Array<{ id: number }> };
  const chain: any = {
    from: () => chain,
    where: () => chain,
    limit: async () => state.existingLapRows,
  };
  const db = {
    execute: vi.fn(),
    select: vi.fn(() => chain),
  };
  return {
    state,
    db,
    getGarminActivityFullDetails: vi.fn(),
    persistGarminLapDetails: vi.fn(),
    recompute: vi.fn(),
  };
});

vi.mock("./db", () => ({ getDb: async () => m.db }));
vi.mock("./garmin", () => ({
  getGarminActivityFullDetails: m.getGarminActivityFullDetails,
  persistGarminLapDetails: m.persistGarminLapDetails,
}));
vi.mock("./personal_records", () => ({ recomputePersonalRecordsFromStoredLaps: m.recompute }));
vi.mock("./_core/env", () => ({ ENV: { geminiTextModel: "test-model" } }));
vi.mock("./consent", () => ({ hasHealthDataConsent: async () => true }));

import { getPendingActivityInsights } from "./ai_activity_insights";

let nextUserId = 100;

function queueSwim(userId: number) {
  m.db.execute
    .mockResolvedValueOnce({ rows: [] }) // pending insights
    .mockResolvedValueOnce({
      rows: [{ id: 31, user_id: userId, activity_source: "garmin", garmin_activity_id: "g31", distance_meters: 2000 }],
    });
}

describe("AI insight job records recompute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.state.existingLapRows = [];
    m.getGarminActivityFullDetails.mockResolvedValue({ splits: { lapDTOs: [{}] } });
    m.persistGarminLapDetails.mockResolvedValue(2);
    m.recompute.mockResolvedValue({ candidates: 0, inserted: 0, updated: 0, unchanged: 0, skippedManual: 0 });
  });

  it("recomputes the swim's records after storing its laps", async () => {
    const userId = nextUserId++;
    queueSwim(userId);

    await getPendingActivityInsights(userId, 1);

    await vi.waitFor(() => expect(m.recompute).toHaveBeenCalledWith(userId, { activityIds: [31] }), { timeout: 5000 });
    expect(m.persistGarminLapDetails).toHaveBeenCalledWith(m.db, 31, expect.anything());
  });

  it("does not recompute when the swim already had laps", async () => {
    const userId = nextUserId++;
    m.state.existingLapRows = [{ id: 1 }];
    queueSwim(userId);

    await getPendingActivityInsights(userId, 1);

    await vi.waitFor(() => expect(m.db.execute).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(m.persistGarminLapDetails).not.toHaveBeenCalled();
    expect(m.recompute).not.toHaveBeenCalled();
  });
});
