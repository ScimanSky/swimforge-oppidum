/**
 * Training personal records computed from Garmin laps.
 *
 * One set of candidate rules shared by every path that writes training PBs:
 * - the Garmin sync insert path (new activities, emits `pb_detected`);
 * - the silent recompute from stored laps (historical swims, no events).
 */

import { and, asc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  garminActivityLaps,
  garminActivityLengths,
  personalRecords,
  swimmingActivities,
} from "../drizzle/schema";
import { logger } from "./middleware/logger";

export type RecordStroke = "freestyle" | "backstroke" | "breaststroke" | "butterfly" | "mixed";
export type PoolLength = 25 | 50;

export const SUPPORTED_PB_DISTANCES: Readonly<Record<RecordStroke, readonly number[]>> = {
  freestyle: [50, 100, 200, 400, 800, 1500],
  backstroke: [50, 100, 200],
  breaststroke: [50, 100, 200],
  butterfly: [50, 100, 200],
  mixed: [200],
};

/** Every distance that is an event for at least one stroke. */
const PB_EVENT_DISTANCES = Array.from(new Set(Object.values(SUPPORTED_PB_DISTANCES).flat())).sort((a, b) => a - b);

export function isSupportedPbEvent(strokeType: RecordStroke, distanceMeters: number): boolean {
  return SUPPORTED_PB_DISTANCES[strokeType]?.includes(distanceMeters) ?? false;
}

export function buildTrainingRecordType(distanceMeters: number, poolLengthMeters: PoolLength): string {
  return `pb_${distanceMeters}_${poolLengthMeters}_t`;
}

export function normalizeStrokeType(value: unknown): RecordStroke | null {
  if (!value) return null;
  const raw = String(value).toLowerCase();
  if (raw.includes("free") || raw.includes("stile") || raw.includes("crawl")) return "freestyle";
  if (raw.includes("back") || raw.includes("dorso")) return "backstroke";
  if (raw.includes("breast") || raw.includes("rana")) return "breaststroke";
  if (raw.includes("butter") || raw.includes("farf")) return "butterfly";
  if (raw.includes("mix")) return "mixed";
  return "mixed";
}

/** Most common stroke among the lengths of a lap; a tie goes to the stroke swum first. */
export function dominantStroke(strokes: readonly unknown[]): RecordStroke | null {
  const counts = new Map<RecordStroke, number>();
  for (const value of strokes) {
    const stroke = normalizeStrokeType(value);
    if (!stroke) continue;
    counts.set(stroke, (counts.get(stroke) ?? 0) + 1);
  }
  let best: RecordStroke | null = null;
  let bestCount = 0;
  counts.forEach((count, stroke) => {
    if (count > bestCount) {
      best = stroke;
      bestCount = count;
    }
  });
  return best;
}

/**
 * Pool length in metres, or null when it is not a 25/50 m pool. Missing means 25 m (as
 * the insert path always assumed). Garmin reports `poolLength` in centimetres (2500 =
 * 25 m), so values above 100 are read as centimetres.
 */
export function normalizePoolLength(value: unknown): PoolLength | null {
  const raw = Number(value);
  let meters = Number.isFinite(raw) && raw > 0 ? raw : 25;
  if (meters > 100) meters /= 100;
  const rounded = Math.round(meters);
  return rounded === 25 || rounded === 50 ? rounded : null;
}

export type TrainingPbCandidate = {
  strokeType: RecordStroke;
  distanceMeters: number;
  poolLengthMeters: PoolLength;
  timeCs: number;
  achievedAt: Date;
};

export type PbActivityInput = {
  activityDate: Date;
  distanceMeters: number | null;
  durationSeconds: number | null;
  strokeType: unknown;
  poolLengthMeters: unknown;
  isOpenWater: boolean | null | undefined;
};

export type PbLapInput = {
  distanceMeters: number | null;
  durationSeconds: number | null;
  /** Stroke stored on the lap (already the dominant stroke of its lengths). */
  strokeType: unknown;
  /** Strokes of the lap's lengths, in swim order; they win over the stored lap stroke. */
  lengthStrokes?: readonly unknown[];
};

/**
 * Training PB candidates of one pool swim: each lap whose rounded distance is exactly
 * an event for its stroke (time = lap duration), plus the whole swim when its distance
 * is an event. Returns the best time per stroke and distance.
 */
export function detectTrainingPbCandidates(
  activity: PbActivityInput,
  laps: readonly PbLapInput[],
): TrainingPbCandidate[] {
  if (activity.isOpenWater) return [];
  const poolLengthMeters = normalizePoolLength(activity.poolLengthMeters);
  if (!poolLengthMeters) return [];

  const bestByKey = new Map<string, TrainingPbCandidate>();
  const register = (strokeType: RecordStroke | null, distance: unknown, duration: unknown) => {
    if (!strokeType) return;
    const distanceMeters = Math.round(Number(distance ?? 0));
    const durationSeconds = Number(duration ?? 0);
    if (!Number.isFinite(distanceMeters) || !Number.isFinite(durationSeconds)) return;
    if (distanceMeters <= 0 || durationSeconds <= 0) return;
    if (!isSupportedPbEvent(strokeType, distanceMeters)) return;
    const candidate: TrainingPbCandidate = {
      strokeType,
      distanceMeters,
      poolLengthMeters,
      timeCs: Math.round(durationSeconds * 100),
      achievedAt: activity.activityDate,
    };
    const key = `${strokeType}:${distanceMeters}`;
    const previous = bestByKey.get(key);
    if (!previous || candidate.timeCs < previous.timeCs) {
      bestByKey.set(key, candidate);
    }
  };

  for (const lap of laps) {
    const strokeType = dominantStroke(lap.lengthStrokes ?? []) ?? normalizeStrokeType(lap.strokeType);
    register(strokeType, lap.distanceMeters, lap.durationSeconds);
  }
  register(normalizeStrokeType(activity.strokeType), activity.distanceMeters, activity.durationSeconds);

  return Array.from(bestByKey.values());
}

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Queryable = Pick<Database, "select">;

export type StoredPbCandidate = TrainingPbCandidate & { activityId: number };

/**
 * Candidates of the user's stored Garmin swims (all of them, or only `activityIds`),
 * read with one query: activities, their event-distance laps and those laps' lengths.
 */
export async function loadStoredPbCandidates(
  db: Queryable,
  userId: number,
  activityIds?: readonly number[],
): Promise<StoredPbCandidate[]> {
  if (activityIds && activityIds.length === 0) return [];

  const rows = await db
    .select({
      activityId: swimmingActivities.id,
      activityDate: swimmingActivities.activityDate,
      activityDistanceMeters: swimmingActivities.distanceMeters,
      activityDurationSeconds: swimmingActivities.durationSeconds,
      activityStrokeType: swimmingActivities.strokeType,
      poolLengthMeters: swimmingActivities.poolLengthMeters,
      isOpenWater: swimmingActivities.isOpenWater,
      lapId: garminActivityLaps.id,
      lapDistanceMeters: garminActivityLaps.distanceMeters,
      lapDurationSeconds: garminActivityLaps.durationSeconds,
      lapStrokeType: garminActivityLaps.strokeType,
      lengthStrokeType: garminActivityLengths.strokeType,
    })
    .from(swimmingActivities)
    .leftJoin(
      garminActivityLaps,
      and(
        eq(garminActivityLaps.activityId, swimmingActivities.id),
        inArray(garminActivityLaps.distanceMeters, PB_EVENT_DISTANCES),
        gt(garminActivityLaps.durationSeconds, 0),
      ),
    )
    .leftJoin(garminActivityLengths, eq(garminActivityLengths.lapId, garminActivityLaps.id))
    .where(
      and(
        eq(swimmingActivities.userId, userId),
        // Garmin imports (the oldest ones predate activity_source = 'garmin').
        isNotNull(swimmingActivities.garminActivityId),
        eq(swimmingActivities.isOpenWater, false),
        activityIds ? inArray(swimmingActivities.id, [...activityIds]) : undefined,
      ),
    )
    .orderBy(
      asc(swimmingActivities.id),
      asc(garminActivityLaps.lapIndex),
      asc(garminActivityLengths.lengthIndex),
    );

  type StoredLap = PbLapInput & { lengthStrokes: unknown[] };
  type Swim = { activity: PbActivityInput; laps: Map<number, StoredLap> };
  const swims = new Map<number, Swim>();
  for (const row of rows) {
    let swim = swims.get(row.activityId);
    if (!swim) {
      swim = {
        activity: {
          activityDate: row.activityDate,
          distanceMeters: row.activityDistanceMeters,
          durationSeconds: row.activityDurationSeconds,
          strokeType: row.activityStrokeType,
          poolLengthMeters: row.poolLengthMeters,
          isOpenWater: row.isOpenWater,
        },
        laps: new Map(),
      };
      swims.set(row.activityId, swim);
    }
    if (row.lapId === null || row.lapId === undefined) continue;
    let lap = swim.laps.get(row.lapId);
    if (!lap) {
      lap = {
        distanceMeters: row.lapDistanceMeters,
        durationSeconds: row.lapDurationSeconds,
        strokeType: row.lapStrokeType,
        lengthStrokes: [],
      };
      swim.laps.set(row.lapId, lap);
    }
    if (row.lengthStrokeType) lap.lengthStrokes.push(row.lengthStrokeType);
  }

  const candidates: StoredPbCandidate[] = [];
  swims.forEach((swim, activityId) => {
    for (const candidate of detectTrainingPbCandidates(swim.activity, Array.from(swim.laps.values()))) {
      candidates.push({ ...candidate, activityId });
    }
  });
  return candidates;
}

export type RecomputePersonalRecordsResult = {
  candidates: number;
  inserted: number;
  updated: number;
  unchanged: number;
  skippedManual: number;
};

const EMPTY_RESULT: RecomputePersonalRecordsResult = {
  candidates: 0,
  inserted: 0,
  updated: 0,
  unchanged: 0,
  skippedManual: 0,
};

function isBetterCandidate(next: StoredPbCandidate, current: StoredPbCandidate): boolean {
  if (next.timeCs !== current.timeCs) return next.timeCs < current.timeCs;
  const nextAt = next.achievedAt.getTime();
  const currentAt = current.achievedAt.getTime();
  if (nextAt !== currentAt) return nextAt < currentAt;
  return next.activityId < current.activityId;
}

/**
 * Writes the user's training records from the laps already stored in the DB (no Garmin
 * calls), for all their swims or only `activityIds`. Keeps the better of the stored
 * record and the new time, never touches manual records (official ones, or training
 * ones entered without an activity) and emits no `pb_detected` event or notification:
 * these swims are history, not new achievements. Running it twice changes nothing.
 */
export async function recomputePersonalRecordsFromStoredLaps(
  userId: number,
  options: { activityIds?: readonly number[] } = {},
): Promise<RecomputePersonalRecordsResult> {
  const { activityIds } = options;
  if (activityIds && activityIds.length === 0) return { ...EMPTY_RESULT };

  const db = await getDb();
  if (!db) return { ...EMPTY_RESULT };

  const result = await db.transaction(async (tx) => {
    // Sync and activity detail can recompute the same user at once: serialise them so
    // two runs never insert the same record twice.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`personal_records:recompute:${userId}`}))`);

    const candidates = await loadStoredPbCandidates(tx, userId, activityIds);
    const bestByKey = new Map<string, StoredPbCandidate & { recordType: string }>();
    for (const candidate of candidates) {
      const recordType = buildTrainingRecordType(candidate.distanceMeters, candidate.poolLengthMeters);
      const key = `${recordType}:${candidate.strokeType}`;
      const current = bestByKey.get(key);
      if (!current || isBetterCandidate(candidate, current)) {
        bestByKey.set(key, { ...candidate, recordType });
      }
    }

    const summary: RecomputePersonalRecordsResult = { ...EMPTY_RESULT, candidates: bestByKey.size };
    if (bestByKey.size === 0) return summary;

    const existing = await tx
      .select({
        id: personalRecords.id,
        recordType: personalRecords.recordType,
        strokeType: personalRecords.strokeType,
        value: personalRecords.value,
        activityId: personalRecords.activityId,
      })
      .from(personalRecords)
      .where(eq(personalRecords.userId, userId));

    const existingByKey = new Map<string, typeof existing>();
    for (const row of existing) {
      const key = `${row.recordType}:${row.strokeType ?? "mixed"}`;
      existingByKey.set(key, [...(existingByKey.get(key) ?? []), row]);
    }

    const inserts: Array<typeof personalRecords.$inferInsert> = [];
    for (const [key, candidate] of Array.from(bestByKey.entries())) {
      const rows = existingByKey.get(key) ?? [];
      if (rows.some((row) => row.activityId === null || row.activityId === undefined)) {
        summary.skippedManual += 1;
        continue;
      }
      if (rows.length === 0) {
        inserts.push({
          userId,
          recordType: candidate.recordType,
          strokeType: candidate.strokeType,
          value: candidate.timeCs,
          activityId: candidate.activityId,
          achievedAt: candidate.achievedAt,
          previousValue: null,
        });
        continue;
      }
      const current = rows.reduce((best, row) => (Number(row.value) < Number(best.value) ? row : best));
      const currentValue = Number(current.value);
      if (Number.isFinite(currentValue) && currentValue > 0 && candidate.timeCs >= currentValue) {
        summary.unchanged += 1;
        continue;
      }
      await tx
        .update(personalRecords)
        .set({
          value: candidate.timeCs,
          activityId: candidate.activityId,
          achievedAt: candidate.achievedAt,
          previousValue: Number.isFinite(currentValue) && currentValue > 0 ? currentValue : null,
        })
        .where(eq(personalRecords.id, current.id));
      summary.updated += 1;
    }

    if (inserts.length > 0) {
      await tx.insert(personalRecords).values(inserts);
      summary.inserted = inserts.length;
    }
    return summary;
  });

  if (result.inserted > 0 || result.updated > 0) {
    logger.info(`[Records] Recomputed training records for user ${userId}`, {
      event: "records:recomputed_from_laps",
      userId,
      scope: activityIds ? "activities" : "all",
      activityCount: activityIds?.length ?? null,
      ...result,
    });
  }
  return result;
}
