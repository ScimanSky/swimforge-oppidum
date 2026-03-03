import dotenv from "dotenv";
import path from "path";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../server/db";
import { garminActivityLaps, personalRecords, swimmingActivities } from "../drizzle/schema";

const envArgIndex = process.argv.findIndex((arg) => arg === "--env");
const envPathArg = envArgIndex >= 0 ? process.argv[envArgIndex + 1] : undefined;
const envPath = path.resolve(process.cwd(), envPathArg ?? ".env.oracle");
dotenv.config({ path: envPath });

type Stroke = "freestyle" | "backstroke" | "breaststroke" | "butterfly" | "mixed";
type PoolLength = 25 | 50;

const SUPPORTED_DISTANCES: Record<Stroke, number[]> = {
  freestyle: [50, 100, 200, 400, 800, 1500],
  backstroke: [50, 100, 200],
  breaststroke: [50, 100, 200],
  butterfly: [50, 100, 200],
  mixed: [200],
};

function normalizeStrokeType(value: unknown): Stroke | null {
  if (!value) return null;
  const raw = String(value).toLowerCase();
  if (raw.includes("free") || raw.includes("stile") || raw.includes("crawl")) return "freestyle";
  if (raw.includes("back") || raw.includes("dorso")) return "backstroke";
  if (raw.includes("breast") || raw.includes("rana")) return "breaststroke";
  if (raw.includes("butter") || raw.includes("farf")) return "butterfly";
  if (raw.includes("mix")) return "mixed";
  return "mixed";
}

function isSupported(stroke: Stroke, distanceMeters: number): boolean {
  return SUPPORTED_DISTANCES[stroke]?.includes(distanceMeters) ?? false;
}

function normalizePoolLength(value: unknown): PoolLength {
  const num = Number(value);
  if (num === 50) return 50;
  return 25;
}

function buildTrainingRecordType(distanceMeters: number, poolLengthMeters: PoolLength): string {
  return `pb_${distanceMeters}_${poolLengthMeters}_t`;
}

type Candidate = {
  userId: number;
  strokeType: Stroke;
  distanceMeters: number;
  poolLengthMeters: PoolLength;
  timeCs: number;
  activityId: number;
  achievedAt: Date;
};

function candidateKey(candidate: Candidate): string {
  return `${candidate.userId}:${buildTrainingRecordType(candidate.distanceMeters, candidate.poolLengthMeters)}:${candidate.strokeType}`;
}

async function main() {
  console.log(`[backfill-pb] loading env from ${envPath}`);
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL missing");
  }

  const db = await getDb();
  if (!db) throw new Error("database unavailable");

  console.log("[backfill-pb] reading Garmin lap candidates...");
  const lapRows = await db
    .select({
      userId: swimmingActivities.userId,
      activityId: swimmingActivities.id,
      activityDate: swimmingActivities.activityDate,
      poolLengthMeters: swimmingActivities.poolLengthMeters,
      isOpenWater: swimmingActivities.isOpenWater,
      distanceMeters: garminActivityLaps.distanceMeters,
      durationSeconds: garminActivityLaps.durationSeconds,
      strokeType: garminActivityLaps.strokeType,
    })
    .from(garminActivityLaps)
    .innerJoin(swimmingActivities, eq(swimmingActivities.id, garminActivityLaps.activityId))
    .where(sql`${swimmingActivities.isOpenWater} IS DISTINCT FROM true`);

  console.log("[backfill-pb] reading Garmin activity-summary candidates...");
  const activityRows = await db
    .select({
      userId: swimmingActivities.userId,
      activityId: swimmingActivities.id,
      activityDate: swimmingActivities.activityDate,
      poolLengthMeters: swimmingActivities.poolLengthMeters,
      isOpenWater: swimmingActivities.isOpenWater,
      distanceMeters: swimmingActivities.distanceMeters,
      durationSeconds: swimmingActivities.durationSeconds,
      strokeType: swimmingActivities.strokeType,
    })
    .from(swimmingActivities)
    .where(sql`${swimmingActivities.isOpenWater} IS DISTINCT FROM true`);

  const byKey = new Map<string, Candidate>();
  let rejectedUnsupported = 0;
  let rejectedInvalid = 0;

  const register = (row: {
    userId: number;
    activityId: number;
    activityDate: Date;
    poolLengthMeters: number | null;
    distanceMeters: number | null;
    durationSeconds: number | null;
    strokeType: unknown;
  }) => {
    const stroke = normalizeStrokeType(row.strokeType);
    const distanceMeters = Math.round(Number(row.distanceMeters ?? 0));
    const durationSeconds = Number(row.durationSeconds ?? 0);
    if (!stroke || !Number.isFinite(distanceMeters) || !Number.isFinite(durationSeconds)) {
      rejectedInvalid += 1;
      return;
    }
    if (distanceMeters <= 0 || durationSeconds <= 0) {
      rejectedInvalid += 1;
      return;
    }
    if (!isSupported(stroke, distanceMeters)) {
      rejectedUnsupported += 1;
      return;
    }

    const poolLengthMeters = normalizePoolLength(row.poolLengthMeters);
    const candidate: Candidate = {
      userId: Number(row.userId),
      activityId: Number(row.activityId),
      achievedAt: row.activityDate ? new Date(row.activityDate) : new Date(),
      strokeType: stroke,
      distanceMeters,
      poolLengthMeters,
      timeCs: Math.round(durationSeconds * 100),
    };
    const key = candidateKey(candidate);
    const prev = byKey.get(key);
    if (!prev || candidate.timeCs < prev.timeCs) {
      byKey.set(key, candidate);
    }
  };

  for (const row of lapRows) register(row);
  for (const row of activityRows) register(row);

  console.log(`[backfill-pb] candidates=${byKey.size}, rejectedUnsupported=${rejectedUnsupported}, rejectedInvalid=${rejectedInvalid}`);

  const userIds = Array.from(new Set(Array.from(byKey.values()).map((c) => c.userId)));
  const existingRows =
    userIds.length > 0
      ? await db
          .select({
            id: personalRecords.id,
            userId: personalRecords.userId,
            recordType: personalRecords.recordType,
            strokeType: personalRecords.strokeType,
            value: personalRecords.value,
            achievedAt: personalRecords.achievedAt,
          })
          .from(personalRecords)
          .where(inArray(personalRecords.userId, userIds))
      : [];

  const existingBest = new Map<string, { id: number; value: number }>();
  for (const row of existingRows) {
    const key = `${row.userId}:${row.recordType}:${row.strokeType ?? "mixed"}`;
    const value = Number(row.value ?? 0);
    const prev = existingBest.get(key);
    if (!prev || value < prev.value) {
      existingBest.set(key, { id: Number(row.id), value });
    }
  }

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const candidate of byKey.values()) {
    const recordType = buildTrainingRecordType(candidate.distanceMeters, candidate.poolLengthMeters);
    const key = `${candidate.userId}:${recordType}:${candidate.strokeType}`;
    const existing = existingBest.get(key);

    if (!existing) {
      const insertedRows = await db
        .insert(personalRecords)
        .values({
          userId: candidate.userId,
          recordType,
          strokeType: candidate.strokeType,
          value: candidate.timeCs,
          activityId: candidate.activityId,
          achievedAt: candidate.achievedAt,
          previousValue: null,
        })
        .returning({ id: personalRecords.id });
      if (insertedRows[0]?.id) {
        inserted += 1;
        existingBest.set(key, { id: Number(insertedRows[0].id), value: candidate.timeCs });
      }
      continue;
    }

    if (candidate.timeCs < existing.value) {
      await db
        .update(personalRecords)
        .set({
          value: candidate.timeCs,
          activityId: candidate.activityId,
          achievedAt: candidate.achievedAt,
          previousValue: existing.value,
        })
        .where(eq(personalRecords.id, existing.id));
      updated += 1;
      existingBest.set(key, { id: existing.id, value: candidate.timeCs });
    } else {
      unchanged += 1;
    }
  }

  const totalPbResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(personalRecords);
  const totalPb = Number(totalPbResult[0]?.count ?? 0);

  console.log(`[backfill-pb] inserted=${inserted}, updated=${updated}, unchanged=${unchanged}, total_personal_records=${totalPb}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[backfill-pb] failed:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  });

