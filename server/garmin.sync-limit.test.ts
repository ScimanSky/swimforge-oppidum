import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  process.env.GARMIN_SERVICE_SECRET = "test-secret";
  return { getDb: vi.fn(), deleteCached: vi.fn(async () => {}) };
});

vi.mock("./db", () => ({ getDb: h.getDb, upsertPersonalRecord: vi.fn() }));
vi.mock("./lib/cache", async () => {
  const actual = await vi.importActual<typeof import("./lib/cache")>("./lib/cache");
  return { ...actual, deleteCached: h.deleteCached };
});

import { invalidateAfterGarminSync, syncGarminActivities } from "./garmin";
import { aiInsightsCache, garminTokens, swimmerProfiles } from "../drizzle/schema";

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

/** A db whose every select resolves to one connected row and that records updates. */
function mockDbRecordingUpdates() {
  const updates: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const rows = [{ userId: 7, oauth1Token: "stored", garminConnected: true, totalXp: 0, level: 1 }];
  const chain: any = {
    from: () => chain,
    where: () => chain,
    limit: () => chain,
    orderBy: () => chain,
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
  };
  const db = {
    select: () => chain,
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => {
        updates.push({ table, values });
        return { where: () => Promise.resolve() };
      },
    }),
  };
  h.getDb.mockResolvedValue(db);
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/auth/status/7")) {
      return new Response(JSON.stringify({ connected: true }), { status: 200 });
    }
    if (url.endsWith("/sync")) {
      return new Response(JSON.stringify({ success: true, synced_count: 0, activities: [] }), { status: 200 });
    }
    return new Response(JSON.stringify({ detail: "unexpected" }), { status: 404 });
  }) as typeof fetch;
  return updates;
}

describe("syncGarminActivities auto-sync timestamp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("moves lastGarminSyncAt forward after an uncapped sync", async () => {
    const updates = mockDbRecordingUpdates();

    const result = await syncGarminActivities(7, 30);

    expect(result).toEqual({ synced: 0, newXp: 0, detectedPbs: [] });
    expect(updates.some((u) => u.table === swimmerProfiles && "lastGarminSyncAt" in u.values)).toBe(true);
    expect(updates.some((u) => u.table === garminTokens && "lastSyncAt" in u.values)).toBe(true);
  });

  it("leaves lastGarminSyncAt alone after a capped sync so auto-sync is not pushed back", async () => {
    const updates = mockDbRecordingUpdates();

    const result = await syncGarminActivities(7, 30, 1);

    expect(result).toEqual({ synced: 0, newXp: 0, detectedPbs: [] });
    expect(updates.some((u) => u.table === swimmerProfiles && "lastGarminSyncAt" in u.values)).toBe(false);
    // The "last sync" shown in Settings still reflects the manual sync.
    expect(updates.some((u) => u.table === garminTokens && "lastSyncAt" in u.values)).toBe(true);
  });

  it("a sync that changed nothing leaves the swim metrics and insights cached", async () => {
    mockDbRecordingUpdates();

    await syncGarminActivities(7, 30);

    expect(h.deleteCached).not.toHaveBeenCalled();
  });
});

describe("invalidateAfterGarminSync", () => {
  const deleted: unknown[] = [];
  beforeEach(() => {
    vi.clearAllMocks();
    deleted.length = 0;
    h.getDb.mockResolvedValue({
      delete: (table: unknown) => {
        deleted.push(table);
        return { where: async () => undefined };
      },
    });
  });

  it.each([
    [{ syncedCount: 2, existingSwimsChanged: false }, true],
    [{ syncedCount: 0, existingSwimsChanged: true }, true],
    [{ syncedCount: 0, existingSwimsChanged: false }, false],
  ] as const)("%o → drops metrics and insights: %s", async (changes, dropped) => {
    await invalidateAfterGarminSync(7, changes);
    if (dropped) {
      expect(h.deleteCached).toHaveBeenCalledWith(expect.stringMatching(/^swim-metrics:v3:7:\d{4}-\d{2}-\d{2}$/));
      expect(deleted).toEqual([aiInsightsCache]);
    } else {
      expect(h.deleteCached).not.toHaveBeenCalled();
      expect(deleted).toEqual([]);
    }
  });
});
