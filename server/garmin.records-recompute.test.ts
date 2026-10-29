import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  process.env.GARMIN_SERVICE_SECRET = "test-secret";
  return {
    getDb: vi.fn(),
    upsertPersonalRecord: vi.fn(),
    recompute: vi.fn(),
    loadCandidates: vi.fn(),
    sendPushToUser: vi.fn(),
    trackProductEvent: vi.fn(),
    calls: [] as string[],
  };
});

vi.mock("./db", () => ({
  getDb: h.getDb,
  upsertPersonalRecord: h.upsertPersonalRecord,
  getActivityAggregates: vi.fn(async () => ({
    totalDistance: 2000,
    totalTime: 2400,
    totalSessions: 1,
    totalOpenWaterSessions: 0,
    totalOpenWaterMeters: 0,
  })),
}));
vi.mock("./push", () => ({ sendPushToUser: h.sendPushToUser }));
vi.mock("./product_analytics", () => ({ trackProductEvent: h.trackProductEvent }));
vi.mock("./db_profile_badges", () => ({ updateUserProfileBadge: vi.fn(async () => {}) }));
vi.mock("./badge_engine", () => ({ checkAndAwardBadges: vi.fn(async () => []) }));
vi.mock("./lib/cache", () => ({ invalidateUserCache: vi.fn(async () => {}) }));
vi.mock("./personal_records", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./personal_records")>()),
  recomputePersonalRecordsFromStoredLaps: h.recompute,
  loadStoredPbCandidates: h.loadCandidates,
}));

import { syncGarminActivities } from "./garmin";
import {
  garminActivityLaps,
  garminTokens,
  personalRecords,
  swimmerProfiles,
  swimmingActivities,
} from "../drizzle/schema";

const USER = 7;
const originalFetch = global.fetch;

/** Garmin full details with two laps of 100 m (four 25 m lengths each). */
const FULL_DETAILS = {
  activity: { summaryDTO: { averageSwolf: 35 } },
  splits: {
    lapDTOs: [1, 2].map((lapIndex) => ({
      lapIndex,
      distance: 100,
      duration: 90 + lapIndex,
      lengthDTOs: [1, 2, 3, 4].map((lengthIndex) => ({ lengthIndex, distance: 25, duration: 22, swimStroke: "FREESTYLE" })),
    })),
  },
};

type ExistingActivity = {
  garminActivityId: string;
  id: number;
  strokeType: string;
  rawData: Record<string, unknown>;
  avgSwolf: number | null;
};

type Scenario = {
  garminActivities: Array<Record<string, unknown>>;
  existing?: ExistingActivity[];
  records?: Array<Record<string, unknown>>;
  /** Activity ids that already have stored laps. */
  storedLapActivityIds?: number[];
};

function garminActivity(activityId: string, overrides: Record<string, unknown> = {}) {
  return {
    activity_id: activityId,
    activity_name: "Nuoto in piscina",
    start_time: "2026-10-20T07:00:00",
    distance_meters: 2000,
    duration_seconds: 2400,
    pool_length: 25,
    stroke_type: "freestyle",
    is_open_water: false,
    ...overrides,
  };
}

function setup(scenario: Scenario) {
  const state = {
    records: [...(scenario.records ?? [])],
    insertedLapActivityIds: [] as number[],
  };

  const select = (fields?: unknown) => {
    let table: unknown;
    const chain: any = {
      from: (t: unknown) => {
        table = t;
        return chain;
      },
      where: () => chain,
      innerJoin: () => chain,
      leftJoin: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
        let rows: unknown[] = [];
        if (table === garminTokens) rows = [{ userId: USER, oauth1Token: "stored" }];
        if (table === swimmerProfiles) rows = [{ userId: USER, totalXp: 0, level: 1 }];
        if (table === personalRecords) rows = [...state.records];
        // The bulk lookup of existing Garmin ids selects explicit columns; the
        // Strava-duplicate and longest-swim lookups select whole rows.
        if (table === swimmingActivities) rows = fields ? scenario.existing ?? [] : [];
        if (table === garminActivityLaps) {
          rows = (scenario.storedLapActivityIds ?? []).length > 0 ? [{ id: 1 }] : [];
        }
        return Promise.resolve(rows).then(resolve, reject);
      },
    };
    return chain;
  };

  let nextLapId = 1;
  const db: any = {
    select,
    insert: (table: unknown) => ({
      values: (values: any) => {
        const list = Array.isArray(values) ? values : [values];
        if (table === garminActivityLaps) {
          state.insertedLapActivityIds.push(...list.map((v: any) => v.activityId));
        }
        const done = Promise.resolve();
        return {
          returning: async () => {
            if (table === swimmingActivities) return [{ id: 500 }];
            if (table === garminActivityLaps) return list.map((v: any) => ({ id: nextLapId++, lapIndex: v.lapIndex }));
            return [];
          },
          then: done.then.bind(done),
        };
      },
    }),
    update: () => ({ set: () => ({ where: async () => {} }) }),
    delete: () => ({ where: async () => {} }),
    execute: async () => ({ rows: [] }),
  };
  h.getDb.mockResolvedValue(db);

  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith(`/auth/status/${USER}`)) {
      return new Response(JSON.stringify({ connected: true }), { status: 200 });
    }
    if (url.endsWith("/sync")) {
      return new Response(JSON.stringify({ success: true, activities: scenario.garminActivities }), { status: 200 });
    }
    if (url.endsWith("/activity/g-enrich/full")) {
      return new Response(JSON.stringify(FULL_DETAILS), { status: 200 });
    }
    return new Response(JSON.stringify({ detail: "not found" }), { status: 404 });
  }) as typeof fetch;

  return state;
}

const EXISTING_RECORD = {
  recordType: "pb_100_25_t",
  strokeType: "freestyle",
  value: 9500,
};

describe("syncGarminActivities recomputes records from stored laps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.calls.length = 0;
    h.recompute.mockImplementation(async (_userId: number, options?: { activityIds?: number[] }) => {
      h.calls.push(options?.activityIds ? `recompute:${options.activityIds.join(",")}` : "recompute:all");
      return { candidates: 0, inserted: 0, updated: 0, unchanged: 0, skippedManual: 0 };
    });
    h.loadCandidates.mockImplementation(async (_db: unknown, _userId: number, ids?: number[]) => {
      h.calls.push(`load:${(ids ?? []).join(",")}`);
      return [];
    });
    h.sendPushToUser.mockResolvedValue({ sent: 1, failed: 0 });
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("recomputes an existing swim whose laps it stored from the saved Garmin details", async () => {
    const state = setup({
      garminActivities: [garminActivity("g-saved")],
      existing: [
        { garminActivityId: "g-saved", id: 11, strokeType: "freestyle", rawData: { garmin_details: FULL_DETAILS }, avgSwolf: 35 },
      ],
      records: [EXISTING_RECORD],
    });

    const result = await syncGarminActivities(USER, 30);

    expect(result).toEqual({ synced: 0, newXp: 0, detectedPbs: [] });
    expect(state.insertedLapActivityIds).toContain(11);
    expect(h.recompute).toHaveBeenCalledTimes(1);
    expect(h.recompute).toHaveBeenCalledWith(USER, { activityIds: [11] });
    // History: no celebration event, no push.
    expect(h.upsertPersonalRecord).not.toHaveBeenCalled();
    expect(h.sendPushToUser).not.toHaveBeenCalled();
  });

  it("recomputes an existing swim whose laps came with the re-enrichment", async () => {
    const state = setup({
      garminActivities: [garminActivity("g-enrich")],
      existing: [{ garminActivityId: "g-enrich", id: 12, strokeType: "freestyle", rawData: {}, avgSwolf: null }],
      records: [EXISTING_RECORD],
    });

    await syncGarminActivities(USER, 30);

    expect(state.insertedLapActivityIds).toContain(12);
    expect(h.recompute).toHaveBeenCalledWith(USER, { activityIds: [12] });
    expect(h.upsertPersonalRecord).not.toHaveBeenCalled();
  });

  it("does not recompute when no laps were stored in the sync", async () => {
    setup({
      garminActivities: [garminActivity("g-done")],
      existing: [
        { garminActivityId: "g-done", id: 13, strokeType: "freestyle", rawData: { garmin_details: FULL_DETAILS }, avgSwolf: 35 },
      ],
      records: [EXISTING_RECORD],
      storedLapActivityIds: [13],
    });

    await syncGarminActivities(USER, 30);

    expect(h.recompute).not.toHaveBeenCalled();
  });

  it("does not recompute when the enrichment brought no details", async () => {
    setup({
      garminActivities: [garminActivity("g-missing")],
      existing: [{ garminActivityId: "g-missing", id: 14, strokeType: "freestyle", rawData: {}, avgSwolf: null }],
      records: [EXISTING_RECORD],
    });

    await syncGarminActivities(USER, 30);

    expect(h.recompute).not.toHaveBeenCalled();
  });

  it("fills all records of a user who has none yet, before judging the new swims", async () => {
    const state = setup({
      garminActivities: [garminActivity("g-new")],
      existing: [],
      records: [],
    });
    // The backfill finds an older, faster 100 m in the stored laps.
    h.recompute.mockImplementationOnce(async () => {
      h.calls.push("recompute:all");
      state.records.push({ recordType: "pb_100_25_t", strokeType: "freestyle", value: 8800 });
      return { candidates: 1, inserted: 1, updated: 0, unchanged: 0, skippedManual: 0 };
    });
    h.loadCandidates.mockImplementation(async (_db: unknown, _userId: number, ids?: number[]) => {
      h.calls.push(`load:${(ids ?? []).join(",")}`);
      return [
        {
          strokeType: "freestyle",
          distanceMeters: 100,
          poolLengthMeters: 25,
          timeCs: 9000,
          achievedAt: new Date("2026-10-20T07:00:00"),
          activityId: 500,
        },
      ];
    });

    const result = await syncGarminActivities(USER, 30);

    expect(result.synced).toBe(1);
    expect(h.recompute).toHaveBeenCalledWith(USER);
    expect(h.calls).toEqual(["recompute:all", "load:500"]);
    // 1:30.00 is not a record against the backfilled 1:28.00: no celebration.
    expect(result.detectedPbs).toEqual([]);
    expect(h.upsertPersonalRecord).not.toHaveBeenCalled();
  });

  it("still detects and celebrates a genuine record on a new swim", async () => {
    setup({
      garminActivities: [garminActivity("g-new")],
      existing: [],
      records: [EXISTING_RECORD],
    });
    h.loadCandidates.mockResolvedValue([
      {
        strokeType: "freestyle",
        distanceMeters: 100,
        poolLengthMeters: 25,
        timeCs: 9000,
        achievedAt: new Date("2026-10-20T07:00:00"),
        activityId: 500,
      },
    ]);

    const result = await syncGarminActivities(USER, 30);

    expect(h.loadCandidates).toHaveBeenCalledWith(expect.anything(), USER, [500]);
    expect(h.recompute).not.toHaveBeenCalled();
    expect(result.detectedPbs).toEqual([
      expect.objectContaining({ strokeType: "freestyle", distanceMeters: 100, previousTimeCs: 9500, newTimeCs: 9000 }),
    ]);
    expect(h.upsertPersonalRecord).toHaveBeenCalledWith(
      expect.objectContaining({ recordType: "pb_100_25_t", value: 9000, activityId: 500, analyticsSource: "garmin_sync" }),
    );
  });

  it("keeps the sync result when the recompute fails", async () => {
    setup({
      garminActivities: [garminActivity("g-saved")],
      existing: [
        { garminActivityId: "g-saved", id: 11, strokeType: "freestyle", rawData: { garmin_details: FULL_DETAILS }, avgSwolf: 35 },
      ],
      records: [EXISTING_RECORD],
    });
    h.recompute.mockRejectedValue(new Error("db down"));

    const result = await syncGarminActivities(USER, 30);

    expect(result).toEqual({ synced: 0, newXp: 0, detectedPbs: [] });
  });
});
