import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/node-postgres";
import { personalRecords, swimmingActivities } from "../drizzle/schema";

const h = vi.hoisted(() => ({
  getDb: vi.fn(),
  upsertPersonalRecord: vi.fn(),
  trackProductEvent: vi.fn(),
}));

vi.mock("./db", () => ({ getDb: h.getDb, upsertPersonalRecord: h.upsertPersonalRecord }));
vi.mock("./product_analytics", () => ({ trackProductEvent: h.trackProductEvent }));

import {
  detectTrainingPbCandidates,
  loadStoredPbCandidates,
  recomputePersonalRecordsFromStoredLaps,
  type PbActivityInput,
} from "./personal_records";

const DAY = new Date("2026-09-15T07:00:00Z");

function activity(overrides: Partial<PbActivityInput> = {}): PbActivityInput {
  return {
    activityDate: DAY,
    distanceMeters: 2000,
    durationSeconds: 2400,
    strokeType: "freestyle",
    poolLengthMeters: 25,
    isOpenWater: false,
    ...overrides,
  };
}

function lap(distanceMeters: number | null, durationSeconds: number | null, strokeType: unknown = "freestyle", lengthStrokes?: unknown[]) {
  return { distanceMeters, durationSeconds, strokeType, lengthStrokes };
}

function byEvent(candidates: Array<{ strokeType: string; distanceMeters: number }>) {
  return [...candidates].sort((a, b) =>
    `${a.strokeType}:${a.distanceMeters}`.localeCompare(`${b.strokeType}:${b.distanceMeters}`),
  );
}

describe("detectTrainingPbCandidates", () => {
  it("keeps only laps whose distance is exactly an event for their stroke", () => {
    const candidates = detectTrainingPbCandidates(activity(), [
      lap(100, 95.5),
      lap(150, 140),
      lap(400, 380),
      lap(1500, 1500),
      lap(400, 420, "backstroke"),
      lap(200, 200, "backstroke"),
      lap(200, 210, "mixed"),
      lap(100, 110, "mixed"),
    ]);

    expect(byEvent(candidates).map((c) => `${c.strokeType}:${c.distanceMeters}:${c.timeCs}`)).toEqual([
      "backstroke:200:20000",
      "freestyle:100:9550",
      "freestyle:1500:150000",
      "freestyle:400:38000",
      "mixed:200:21000",
    ]);
  });

  it("rounds the lap distance before matching an event", () => {
    const candidates = detectTrainingPbCandidates(activity(), [
      lap(99.6, 90),
      lap(50.4, 40),
      lap(199.4, 190),
    ]);

    expect(byEvent(candidates).map((c) => `${c.distanceMeters}:${c.timeCs}`)).toEqual(["100:9000", "50:4000"]);
  });

  it("uses the lap duration in centiseconds and the best lap per event", () => {
    const candidates = detectTrainingPbCandidates(activity(), [
      lap(100, 96.004),
      lap(100, 93.456),
      lap(100, 0),
      lap(100, null),
      lap(null, 60),
    ]);

    expect(candidates).toEqual([
      { strokeType: "freestyle", distanceMeters: 100, poolLengthMeters: 25, timeCs: 9346, achievedAt: DAY },
    ]);
  });

  it("accepts only 25 m and 50 m pools and skips open water", () => {
    expect(detectTrainingPbCandidates(activity({ poolLengthMeters: 50 }), [lap(100, 90)])[0]?.poolLengthMeters).toBe(50);
    expect(detectTrainingPbCandidates(activity({ poolLengthMeters: 33 }), [lap(100, 90)])).toEqual([]);
    expect(detectTrainingPbCandidates(activity({ poolLengthMeters: 23 }), [lap(100, 90)])).toEqual([]);
    expect(detectTrainingPbCandidates(activity({ isOpenWater: true }), [lap(100, 90)])).toEqual([]);
  });

  it("defaults a missing pool length to 25 m, like the Garmin insert path", () => {
    expect(detectTrainingPbCandidates(activity({ poolLengthMeters: null }), [lap(100, 90)])[0]?.poolLengthMeters).toBe(25);
  });

  it("reads a pool length stored in centimetres (Garmin poolLength 2500 = 25 m)", () => {
    expect(detectTrainingPbCandidates(activity({ poolLengthMeters: 2500 }), [lap(100, 90)])[0]?.poolLengthMeters).toBe(25);
    expect(detectTrainingPbCandidates(activity({ poolLengthMeters: 5000 }), [lap(100, 90)])[0]?.poolLengthMeters).toBe(50);
    // 25 yards = 2286 cm: not a metric pool.
    expect(detectTrainingPbCandidates(activity({ poolLengthMeters: 2286 }), [lap(100, 90)])).toEqual([]);
  });

  it("takes the lap stroke from the most common stroke of its lengths", () => {
    const candidates = detectTrainingPbCandidates(activity(), [
      lap(100, 100, "freestyle", ["BACKSTROKE", "FREESTYLE", "backstroke", "BACKSTROKE"]),
    ]);

    expect(candidates.map((c) => c.strokeType)).toEqual(["backstroke"]);
  });

  it("breaks a tie between length strokes with the first one swum", () => {
    const candidates = detectTrainingPbCandidates(activity(), [
      lap(50, 50, null, ["BREASTSTROKE", "FREESTYLE"]),
    ]);

    expect(candidates.map((c) => c.strokeType)).toEqual(["breaststroke"]);
  });

  it("falls back to the stored lap stroke when no length carries a stroke", () => {
    expect(detectTrainingPbCandidates(activity(), [lap(50, 30, "butterfly", [null, null])]).map((c) => c.strokeType)).toEqual(["butterfly"]);
    expect(detectTrainingPbCandidates(activity(), [lap(50, 30, "butterfly")]).map((c) => c.strokeType)).toEqual(["butterfly"]);
    expect(detectTrainingPbCandidates(activity(), [lap(50, 30, null)])).toEqual([]);
  });

  it("also considers the whole swim when its distance is an event (as the insert path always did)", () => {
    const candidates = detectTrainingPbCandidates(
      activity({ distanceMeters: 400, durationSeconds: 400, strokeType: "freestyle" }),
      [lap(100, 90)],
    );

    expect(byEvent(candidates).map((c) => `${c.distanceMeters}:${c.timeCs}`)).toEqual(["100:9000", "400:40000"]);
  });
});

describe("loadStoredPbCandidates", () => {
  it("reads the swims, their event-distance laps and those laps' lengths in one query", async () => {
    const queries: Array<{ text: string; values: unknown[] }> = [];
    const client = {
      query: async (query: { text: string }, values: unknown[]) => {
        queries.push({ text: query.text, values });
        return { rows: [], fields: [] };
      },
    };

    await loadStoredPbCandidates(drizzle({ client: client as any }), 7, [3, 4]);

    expect(queries).toHaveLength(1);
    const { text, values } = queries[0]!;
    expect(text).toMatch(/left join "garmin_activity_laps" on \("garmin_activity_laps"."activity_id" = "swimming_activities"."id" and "garmin_activity_laps"."distance_meters" in \(\$1, \$2, \$3, \$4, \$5, \$6\) and "garmin_activity_laps"."duration_seconds" > \$7\)/);
    expect(text).toContain('left join "garmin_activity_lengths" on "garmin_activity_lengths"."lap_id" = "garmin_activity_laps"."id"');
    expect(text).toContain('"swimming_activities"."user_id" = $8');
    expect(text).toContain('"swimming_activities"."garmin_activity_id" is not null');
    expect(text).toContain('"swimming_activities"."is_open_water" = $9');
    expect(text).toContain('"swimming_activities"."id" in ($10, $11)');
    expect(values).toEqual([50, 100, 200, 400, 800, 1500, 0, 7, false, 3, 4]);
  });

  it("skips the query for an empty activity list", async () => {
    const client = { query: vi.fn() };
    await expect(loadStoredPbCandidates(drizzle({ client: client as any }), 7, [])).resolves.toEqual([]);
    expect(client.query).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// recomputePersonalRecordsFromStoredLaps
// ---------------------------------------------------------------------------

type RecordRow = {
  id: number;
  userId: number;
  recordType: string;
  value: number;
  strokeType: string | null;
  activityId: number | null;
  achievedAt: Date;
  previousValue: number | null;
};

type CandidateRow = {
  activityId: number;
  activityDate: Date;
  activityDistanceMeters: number;
  activityDurationSeconds: number;
  activityStrokeType: string | null;
  poolLengthMeters: number | null;
  isOpenWater: boolean;
  lapId: number | null;
  lapDistanceMeters: number | null;
  lapDurationSeconds: number | null;
  lapStrokeType: string | null;
  lengthStrokeType: string | null;
};

/** One row per stored length, as the single laps query returns them. */
function storedSwim(
  activityId: number,
  activityDate: Date,
  laps: Array<{ lapId: number; distance: number; seconds: number; strokes: string[] }>,
  overrides: Partial<CandidateRow> = {},
): CandidateRow[] {
  const base = {
    activityId,
    activityDate,
    activityDistanceMeters: 2000,
    activityDurationSeconds: 2700,
    activityStrokeType: "mixed",
    poolLengthMeters: 25,
    isOpenWater: false,
    ...overrides,
  };
  if (laps.length === 0) {
    return [{ ...base, lapId: null, lapDistanceMeters: null, lapDurationSeconds: null, lapStrokeType: null, lengthStrokeType: null }];
  }
  return laps.flatMap((l) =>
    l.strokes.map((stroke) => ({
      ...base,
      lapId: l.lapId,
      lapDistanceMeters: l.distance,
      lapDurationSeconds: l.seconds,
      lapStrokeType: l.strokes[0] ?? null,
      lengthStrokeType: stroke,
    })),
  );
}

function freeLengths(count: number) {
  return Array.from({ length: count }, () => "freestyle");
}

/** In-memory personal_records behind the drizzle calls the recompute makes. */
function createFakeDb(params: { candidateRows: CandidateRow[]; records?: RecordRow[] }) {
  const dialect = new PgDialect();
  const state = {
    records: [...(params.records ?? [])].map((r) => ({ ...r })),
    inserts: [] as Array<Record<string, unknown>>,
    updates: [] as Array<{ id: number; values: Record<string, unknown> }>,
    executed: [] as string[],
    candidateQueries: 0,
    nextId: 1000,
  };

  const select = () => {
    let table: unknown;
    const chain: any = {
      from: (t: unknown) => {
        table = t;
        return chain;
      },
      leftJoin: () => chain,
      innerJoin: () => chain,
      where: () => chain,
      orderBy: () => chain,
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
        let rows: unknown[] = [];
        if (table === personalRecords) rows = state.records.map((r) => ({ ...r }));
        if (table === swimmingActivities) {
          state.candidateQueries += 1;
          rows = params.candidateRows;
        }
        return Promise.resolve(rows).then(resolve, reject);
      },
    };
    return chain;
  };

  const db: any = {
    select,
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown> | Array<Record<string, unknown>>) => {
        expect(table).toBe(personalRecords);
        const list = Array.isArray(values) ? values : [values];
        for (const value of list) {
          state.inserts.push(value);
          state.records.push({ id: state.nextId++, previousValue: null, ...(value as any) });
        }
        return Promise.resolve();
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: (condition: any) => {
          expect(table).toBe(personalRecords);
          const { params: queryParams } = dialect.sqlToQuery(condition);
          const id = Number(queryParams[0]);
          state.updates.push({ id, values });
          const row = state.records.find((r) => r.id === id);
          if (row) Object.assign(row, values);
          return Promise.resolve();
        },
      }),
    }),
    execute: async (query: any) => {
      state.executed.push(dialect.sqlToQuery(query).sql);
      return { rows: [] };
    },
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };

  h.getDb.mockResolvedValue(db);
  return state;
}

const USER = 7;

describe("recomputePersonalRecordsFromStoredLaps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes the best stored lap per event for historical swims, without pb_detected events", async () => {
    const june = new Date("2026-06-01T07:00:00Z");
    const july = new Date("2026-07-01T07:00:00Z");
    const state = createFakeDb({
      candidateRows: [
        ...storedSwim(11, june, [
          { lapId: 1, distance: 100, seconds: 98.2, strokes: freeLengths(4) },
          { lapId: 2, distance: 200, seconds: 205, strokes: freeLengths(8) },
        ]),
        ...storedSwim(12, july, [
          { lapId: 3, distance: 100, seconds: 95.37, strokes: freeLengths(4) },
          { lapId: 4, distance: 300, seconds: 300, strokes: freeLengths(12) },
        ]),
      ],
    });

    const result = await recomputePersonalRecordsFromStoredLaps(USER);

    expect(result).toMatchObject({ inserted: 2, updated: 0, unchanged: 0, skippedManual: 0 });
    expect(state.inserts).toEqual(
      expect.arrayContaining([
        {
          userId: USER,
          recordType: "pb_100_25_t",
          strokeType: "freestyle",
          value: 9537,
          activityId: 12,
          achievedAt: july,
          previousValue: null,
        },
        {
          userId: USER,
          recordType: "pb_200_25_t",
          strokeType: "freestyle",
          value: 20500,
          activityId: 11,
          achievedAt: june,
          previousValue: null,
        },
      ]),
    );
    expect(h.trackProductEvent).not.toHaveBeenCalled();
    expect(h.upsertPersonalRecord).not.toHaveBeenCalled();
  });

  it("serialises concurrent recomputes of the same user with an advisory lock", async () => {
    const state = createFakeDb({ candidateRows: [] });

    await recomputePersonalRecordsFromStoredLaps(USER);

    expect(state.executed).toHaveLength(1);
    expect(state.executed[0]).toContain("pg_advisory_xact_lock");
  });

  it("keeps the better of the existing and the stored time", async () => {
    const old = new Date("2026-01-10T07:00:00Z");
    const state = createFakeDb({
      candidateRows: storedSwim(20, DAY, [
        { lapId: 1, distance: 100, seconds: 90, strokes: freeLengths(4) },
        { lapId: 2, distance: 50, seconds: 40, strokes: freeLengths(2) },
      ]),
      records: [
        { id: 1, userId: USER, recordType: "pb_100_25_t", value: 9500, strokeType: "freestyle", activityId: 3, achievedAt: old, previousValue: null },
        { id: 2, userId: USER, recordType: "pb_50_25_t", value: 3900, strokeType: "freestyle", activityId: 3, achievedAt: old, previousValue: null },
      ],
    });

    const result = await recomputePersonalRecordsFromStoredLaps(USER, { activityIds: [20] });

    expect(result).toMatchObject({ inserted: 0, updated: 1, unchanged: 1 });
    expect(state.updates).toEqual([
      { id: 1, values: { value: 9000, activityId: 20, achievedAt: DAY, previousValue: 9500 } },
    ]);
    expect(state.records.find((r) => r.id === 2)?.value).toBe(3900);
    expect(h.trackProductEvent).not.toHaveBeenCalled();
  });

  it("is idempotent: a second run changes nothing", async () => {
    const state = createFakeDb({
      candidateRows: [
        ...storedSwim(30, DAY, [
          { lapId: 1, distance: 100, seconds: 91, strokes: freeLengths(4) },
          { lapId: 2, distance: 400, seconds: 390, strokes: freeLengths(16) },
        ]),
        ...storedSwim(31, new Date("2026-09-20T07:00:00Z"), [
          { lapId: 3, distance: 100, seconds: 91, strokes: freeLengths(4) },
          { lapId: 4, distance: 50, seconds: 44, strokes: ["backstroke", "backstroke"] },
        ]),
      ],
      records: [
        { id: 1, userId: USER, recordType: "pb_400_25_t", value: 40000, strokeType: "freestyle", activityId: 2, achievedAt: DAY, previousValue: null },
      ],
    });

    const first = await recomputePersonalRecordsFromStoredLaps(USER);
    const snapshot = JSON.stringify(state.records);
    const writesAfterFirst = state.inserts.length + state.updates.length;
    const second = await recomputePersonalRecordsFromStoredLaps(USER);

    expect(first).toMatchObject({ inserted: 2, updated: 1 });
    expect(second).toMatchObject({ inserted: 0, updated: 0, unchanged: 3 });
    expect(state.inserts.length + state.updates.length).toBe(writesAfterFirst);
    expect(JSON.stringify(state.records)).toBe(snapshot);
    // Equal times on two swims: the first one swum keeps the record.
    expect(state.records.find((r) => r.recordType === "pb_100_25_t")?.activityId).toBe(30);
  });

  it("never touches manual records", async () => {
    const manualAt = new Date("2025-05-05T10:00:00Z");
    const official = { id: 1, userId: USER, recordType: "pb_100_25_o", value: 9900, strokeType: "freestyle", activityId: null, achievedAt: manualAt, previousValue: null };
    const manualTraining = { id: 2, userId: USER, recordType: "pb_50_25_t", value: 4500, strokeType: "freestyle", activityId: null, achievedAt: manualAt, previousValue: null };
    const state = createFakeDb({
      candidateRows: storedSwim(40, DAY, [
        { lapId: 1, distance: 100, seconds: 90, strokes: freeLengths(4) },
        { lapId: 2, distance: 50, seconds: 40, strokes: freeLengths(2) },
      ]),
      records: [official, manualTraining],
    });

    const result = await recomputePersonalRecordsFromStoredLaps(USER);

    expect(result).toMatchObject({ inserted: 1, updated: 0, skippedManual: 1 });
    expect(state.updates).toEqual([]);
    expect(state.inserts.map((i) => i.recordType)).toEqual(["pb_100_25_t"]);
    expect(state.records.find((r) => r.id === 1)).toEqual(official);
    expect(state.records.find((r) => r.id === 2)).toEqual(manualTraining);
  });

  it("does nothing for an empty activity list", async () => {
    const state = createFakeDb({ candidateRows: [] });

    const result = await recomputePersonalRecordsFromStoredLaps(USER, { activityIds: [] });

    expect(result).toEqual({ candidates: 0, inserted: 0, updated: 0, unchanged: 0, skippedManual: 0 });
    expect(state.candidateQueries).toBe(0);
    expect(state.executed).toEqual([]);
  });

  it("reads all stored laps with a single query, however many swims", async () => {
    const rows = Array.from({ length: 300 }, (_, i) =>
      storedSwim(100 + i, new Date(Date.UTC(2026, 0, 1 + i)), [
        { lapId: 1000 + i, distance: 100, seconds: 100 + (i % 7), strokes: freeLengths(4) },
      ]),
    ).flat();
    const state = createFakeDb({ candidateRows: rows });

    const result = await recomputePersonalRecordsFromStoredLaps(USER);

    expect(state.candidateQueries).toBe(1);
    expect(result).toMatchObject({ candidates: 1, inserted: 1 });
    expect(state.inserts[0]).toMatchObject({ value: 10000, activityId: 100 });
  });

  it("returns zeros when the database is unavailable", async () => {
    h.getDb.mockResolvedValue(null);
    await expect(recomputePersonalRecordsFromStoredLaps(USER)).resolves.toEqual({
      candidates: 0,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      skippedManual: 0,
    });
  });
});
