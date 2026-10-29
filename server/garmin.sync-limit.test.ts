import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  process.env.GARMIN_SERVICE_SECRET = "test-secret";
  return { getDb: vi.fn() };
});

vi.mock("./db", () => ({ getDb: h.getDb, upsertPersonalRecord: vi.fn() }));

import { syncGarminActivities } from "./garmin";

const originalFetch = global.fetch;

function mockDbWithGarminTokens() {
  const db = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([{ userId: 7, oauth1Token: "stored" }]),
  };
  h.getDb.mockResolvedValue(db);
}

/** Fakes the Garmin microservice; returns the parsed JSON body of each POST /sync. */
function mockGarminService() {
  const syncBodies: Array<Record<string, unknown>> = [];
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/auth/status/7")) {
      return new Response(JSON.stringify({ connected: true }), { status: 200 });
    }
    if (url.endsWith("/sync")) {
      syncBodies.push(JSON.parse(String(init?.body)));
      // Stop the sync right after the call: only the request body matters here.
      return new Response(JSON.stringify({ success: false, message: "stop" }), { status: 200 });
    }
    return new Response(JSON.stringify({ detail: "unexpected" }), { status: 404 });
  }) as typeof fetch;
  return syncBodies;
}

describe("syncGarminActivities request to the Garmin service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbWithGarminTokens();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("sends max_activities when a cap is given", async () => {
    const bodies = mockGarminService();

    const result = await syncGarminActivities(7, 30, 5);

    expect(result.error).toBe("stop");
    expect(bodies).toEqual([{ user_id: "7", days_back: 30, max_activities: 5 }]);
  });

  it("omits max_activities without a cap (auto-sync and old clients)", async () => {
    const bodies = mockGarminService();

    await syncGarminActivities(7, 30);
    await syncGarminActivities(7);

    expect(bodies).toEqual([
      { user_id: "7", days_back: 30 },
      { user_id: "7", days_back: 30 },
    ]);
  });
});
