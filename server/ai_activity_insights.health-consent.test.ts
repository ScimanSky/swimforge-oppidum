import { beforeEach, describe, expect, it, vi } from "vitest";

// Without the health-data consent the per-swim analysis stops, also for the swims imported
// before the revocation: no Gemini call, no lazy Garmin lap import.

const m = vi.hoisted(() => {
  process.env.GEMINI_API_KEY = "test-key";
  const chain: any = {
    from: () => chain,
    where: () => chain,
    // No laps stored: an empty result for the lap query.
    orderBy: async () => [],
    limit: async () => [],
  };
  const db = {
    execute: vi.fn(),
    select: vi.fn(() => chain),
    insert: vi.fn(),
  };
  return {
    db,
    consent: vi.fn(),
    generateContent: vi.fn(),
    getGarminActivityFullDetails: vi.fn(),
  };
});

vi.mock("./db", () => ({ getDb: async () => m.db }));
vi.mock("./consent", () => ({ hasHealthDataConsent: m.consent }));
vi.mock("./garmin", () => ({
  getGarminActivityFullDetails: m.getGarminActivityFullDetails,
  persistGarminLapDetails: vi.fn(),
}));
vi.mock("./_core/env", () => ({ ENV: { geminiTextModel: "test-model" } }));
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent: m.generateContent };
    }
  },
}));

import { getPendingActivityInsights } from "./ai_activity_insights";

let nextUserId = 500;

function queueImportedSwim(userId: number) {
  m.db.execute
    .mockResolvedValueOnce({ rows: [] }) // pending insights
    .mockResolvedValueOnce({
      rows: [
        {
          id: 77,
          user_id: userId,
          activity_source: "garmin",
          garmin_activity_id: "g77",
          distance_meters: 1500,
          duration_seconds: 1800,
          avg_heart_rate: 140,
        },
      ],
    });
}

describe("per-swim AI analysis and the health-data consent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Rows queued by a previous test and never read must not leak into the next one.
    m.db.execute.mockReset();
    m.generateContent.mockResolvedValue({
      response: { text: () => JSON.stringify({ title: "T", summary: "S", bullets: ["a", "b", "c"] }) },
    });
    m.db.insert.mockReturnValue({ values: () => ({ onConflictDoNothing: async () => undefined }) });
  });

  it("analyses nothing without the consent: no Gemini call, no Garmin lap import", async () => {
    const userId = nextUserId++;
    m.consent.mockResolvedValue(false);
    queueImportedSwim(userId);

    await expect(getPendingActivityInsights(userId, 1)).resolves.toEqual([]);

    await vi.waitFor(() => expect(m.consent).toHaveBeenCalledWith(userId));
    await new Promise((resolve) => setTimeout(resolve, 20));
    // Only the pending insights were read: the swims to analyse were never even selected.
    expect(m.db.execute).toHaveBeenCalledTimes(1);
    expect(m.getGarminActivityFullDetails).not.toHaveBeenCalled();
    expect(m.generateContent).not.toHaveBeenCalled();
  });

  it("analyses the imported swim with the consent", async () => {
    const userId = nextUserId++;
    m.consent.mockResolvedValue(true);
    queueImportedSwim(userId);

    await getPendingActivityInsights(userId, 1);

    await vi.waitFor(() => expect(m.generateContent).toHaveBeenCalledTimes(1));
    expect(m.generateContent.mock.calls[0][0]).toContain("HR medio: 140");
  });
});
