import { generateText } from "./_core/text_llm";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  activityAiInsights,
  garminActivityLaps,
  garminActivityLengths,
  swimmingActivities,
} from "../drizzle/schema";
import { logger } from "./middleware/logger";

const log = logger.child({ component: "ai_activity_insights" });
const inFlightActivityInsightKeys = new Set<string>();
const userBackgroundGenerationThrottle = new Map<number, number>();
const BACKGROUND_THROTTLE_MS = 15_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function formatPace(seconds?: number | null) {
  if (!seconds) return "n/d";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}/100m`;
}

function safeJsonParse(text: string) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function formatRawData(rawData: unknown) {
  if (!rawData) return "n/d";
  try {
    const text = JSON.stringify(rawData);
    if (text.length > 3500) {
      return text.slice(0, 3500) + "...";
    }
    return text;
  } catch {
    return "n/d";
  }
}

type SegmentContext = {
  totalLaps: number;
  avgLapDistanceMeters: number | null;
  avgLapDurationSeconds: number | null;
  bestLapDurationSeconds: number | null;
  worstLapDurationSeconds: number | null;
  avgLapSwolf: number | null;
  avgLapHeartRate: number | null;
  strokeBreakdown: Array<{ stroke: string; count: number }>;
  lapSamples: Array<{
    lapIndex: number;
    distanceMeters: number | null;
    durationSeconds: number | null;
    pacePer100m: number | null;
    swolf: number | null;
    heartRate: number | null;
    stroke: string | null;
  }>;
};

const prettyStroke = (stroke: string) => {
  const key = stroke.trim().toLowerCase();
  if (!key || key === "unknown" || key === "null") return "n/d";
  if (key.includes("free")) return "stile";
  if (key.includes("back")) return "dorso";
  if (key.includes("breast")) return "rana";
  if (key.includes("butter")) return "farfalla";
  if (key.includes("mix")) return "misto";
  return key;
};

async function buildSegmentContext(activityId: number): Promise<SegmentContext | null> {
  const db = await getDb();
  if (!db) return null;

  const lapRows = await db
    .select({
      lapIndex: garminActivityLaps.lapIndex,
      distanceMeters: garminActivityLaps.distanceMeters,
      durationSeconds: garminActivityLaps.durationSeconds,
      averageSwolf: garminActivityLaps.averageSwolf,
      avgHeartRate: garminActivityLaps.avgHeartRate,
      strokeType: garminActivityLaps.strokeType,
    })
    .from(garminActivityLaps)
    .where(eq(garminActivityLaps.activityId, activityId))
    .orderBy(garminActivityLaps.lapIndex);

  if (!lapRows.length) return null;

  const lengthStrokeRows = await db
    .select({
      strokeType: garminActivityLengths.strokeType,
      count: sql<number>`count(*)`,
    })
    .from(garminActivityLengths)
    .where(eq(garminActivityLengths.activityId, activityId))
    .groupBy(garminActivityLengths.strokeType)
    .orderBy(sql`count(*) desc`);

  const strokeRows = lengthStrokeRows.length
    ? lengthStrokeRows
    : await db
        .select({
          strokeType: garminActivityLaps.strokeType,
          count: sql<number>`count(*)`,
        })
        .from(garminActivityLaps)
        .where(eq(garminActivityLaps.activityId, activityId))
        .groupBy(garminActivityLaps.strokeType)
        .orderBy(sql`count(*) desc`);

  const validDistances = lapRows
    .map((row) => toNumber(row.distanceMeters))
    .filter((value): value is number => typeof value === "number" && value > 0);
  const validDurations = lapRows
    .map((row) => toNumber(row.durationSeconds))
    .filter((value): value is number => typeof value === "number" && value > 0);
  const validSwolf = lapRows
    .map((row) => toNumber(row.averageSwolf))
    .filter((value): value is number => typeof value === "number" && value > 0);
  const validHr = lapRows
    .map((row) => toNumber(row.avgHeartRate))
    .filter((value): value is number => typeof value === "number" && value > 0);

  const lapSamples = lapRows.slice(0, 8).map((row) => {
    const distanceMeters = toNumber(row.distanceMeters);
    const durationSeconds = toNumber(row.durationSeconds);
    const pacePer100m =
      distanceMeters && durationSeconds ? (durationSeconds / distanceMeters) * 100 : null;
    return {
      lapIndex: Number(row.lapIndex ?? 0),
      distanceMeters,
      durationSeconds,
      pacePer100m,
      swolf: toNumber(row.averageSwolf),
      heartRate: toNumber(row.avgHeartRate),
      stroke: row.strokeType ? String(row.strokeType) : null,
    };
  });

  return {
    totalLaps: lapRows.length,
    avgLapDistanceMeters: validDistances.length
      ? validDistances.reduce((sum, value) => sum + value, 0) / validDistances.length
      : null,
    avgLapDurationSeconds: validDurations.length
      ? validDurations.reduce((sum, value) => sum + value, 0) / validDurations.length
      : null,
    bestLapDurationSeconds: validDurations.length ? Math.min(...validDurations) : null,
    worstLapDurationSeconds: validDurations.length ? Math.max(...validDurations) : null,
    avgLapSwolf: validSwolf.length
      ? validSwolf.reduce((sum, value) => sum + value, 0) / validSwolf.length
      : null,
    avgLapHeartRate: validHr.length
      ? validHr.reduce((sum, value) => sum + value, 0) / validHr.length
      : null,
    strokeBreakdown: strokeRows.map((row) => ({
      stroke: prettyStroke(String(row.strokeType ?? "unknown")),
      count: Number(row.count ?? 0),
    })),
    lapSamples,
  };
}

function formatSegmentContext(ctx: SegmentContext | null) {
  if (!ctx) return "n/d";

  const strokes = ctx.strokeBreakdown.length
    ? ctx.strokeBreakdown
        .map((item) => `${item.stroke}:${item.count}`)
        .join(", ")
    : "n/d";

  const samples =
    ctx.lapSamples.length > 0
      ? ctx.lapSamples
          .map((lap) => {
            const pace = lap.pacePer100m ? formatPace(lap.pacePer100m) : "n/d";
            return `L${lap.lapIndex} d=${lap.distanceMeters ?? "n/d"}m t=${lap.durationSeconds ?? "n/d"}s pace=${pace} swolf=${lap.swolf ?? "n/d"} hr=${lap.heartRate ?? "n/d"} stroke=${prettyStroke(lap.stroke ?? "n/d")}`;
          })
          .join(" | ")
      : "n/d";

  return [
    `total_laps=${ctx.totalLaps}`,
    `avg_lap_distance_m=${ctx.avgLapDistanceMeters ? Math.round(ctx.avgLapDistanceMeters) : "n/d"}`,
    `avg_lap_duration_s=${ctx.avgLapDurationSeconds ? Math.round(ctx.avgLapDurationSeconds) : "n/d"}`,
    `best_lap_s=${ctx.bestLapDurationSeconds ? Math.round(ctx.bestLapDurationSeconds) : "n/d"}`,
    `worst_lap_s=${ctx.worstLapDurationSeconds ? Math.round(ctx.worstLapDurationSeconds) : "n/d"}`,
    `avg_lap_swolf=${ctx.avgLapSwolf ? Math.round(ctx.avgLapSwolf) : "n/d"}`,
    `avg_lap_hr=${ctx.avgLapHeartRate ? Math.round(ctx.avgLapHeartRate) : "n/d"}`,
    `stroke_breakdown=${strokes}`,
    `lap_samples=${samples}`,
  ].join("\n- ");
}

async function ensureGarminSegmentData(activity: Record<string, unknown>) {
  const activityId = toNumber(activity["id"]);
  if (!activityId) return;

  const db = await getDb();
  if (!db) return;

  const existingLap = await db
    .select({ id: garminActivityLaps.id })
    .from(garminActivityLaps)
    .where(eq(garminActivityLaps.activityId, activityId))
    .limit(1);
  if (existingLap.length > 0) return;

  const source = String(activity["activitySource"] ?? activity["activity_source"] ?? "");
  if (source !== "garmin") return;

  const userId = toNumber(activity["userId"] ?? activity["user_id"]);
  const garminActivityId = activity["garminActivityId"] ?? activity["garmin_activity_id"];
  if (!userId || !garminActivityId) return;

  try {
    const garmin = await import("./garmin");
    const details = await garmin.getGarminActivityFullDetails(userId, String(garminActivityId));
    if (!details) return;
    await garmin.persistGarminLapDetails(db, activityId, details);
    log.debug("[AI Insights] Garmin segment details fetched and persisted", {
      event: "ai_activity_insights:garmin_segments_persisted",
      userId,
      activityId,
    });
  } catch (error) {
    log.warn("[AI Insights] Unable to fetch Garmin segments for activity insight", {
      event: "ai_activity_insights:garmin_segments_failed",
      userId,
      activityId,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

function extractRawActivity(rawData: unknown): Record<string, unknown> | null {
  if (!isRecord(rawData)) return null;
  const activity = rawData["activity"];
  if (isRecord(activity)) return activity;
  return rawData;
}

function normalizeActivity(activity: Record<string, unknown>) {
  const rawData = activity["rawData"] ?? activity["raw_data"] ?? null;
  const raw = extractRawActivity(rawData);
  const distanceMeters = toNumber(activity["distanceMeters"] ?? activity["distance_meters"] ?? raw?.["distance"]);
  const durationSeconds = toNumber(
    activity["durationSeconds"] ??
      activity["duration_seconds"] ??
      raw?.["movingDuration"] ??
      raw?.["duration"]
  );
  const avgPacePer100m =
    toNumber(activity["avgPacePer100m"] ?? activity["avg_pace_per_100m"]) ??
    (distanceMeters && durationSeconds ? (durationSeconds / distanceMeters) * 100 : null);

  const avgHeartRate = toNumber(
    activity["avgHeartRate"] ??
      activity["avg_heart_rate"] ??
      raw?.["averageHR"] ??
      raw?.["avgHeartRate"] ??
      raw?.["average_heartrate"]
  );
  const maxHeartRate = toNumber(
    activity["maxHeartRate"] ??
      activity["max_heart_rate"] ??
      raw?.["maxHR"] ??
      raw?.["maxHeartRate"] ??
      raw?.["max_heartrate"]
  );
  const avgSwolf = toNumber(
    activity["avgSwolf"] ??
      activity["swolf_score"] ??
      raw?.["averageSwolf"] ??
      raw?.["avgSwolf"] ??
      raw?.["swolf"]
  );
  const avgStrokeCadence = toNumber(
    activity["avgStrokeCadence"] ??
      activity["avg_stroke_cadence"] ??
      raw?.["averageSwimCadenceInStrokesPerMinute"] ??
      raw?.["avgStrokeCadenceRpm"] ??
      raw?.["avgStrokeCadence"]
  );
  const avgStrokeDistance = toNumber(
    activity["avgStrokeDistance"] ?? activity["avg_stroke_distance"] ?? raw?.["avgStrokeDistance"]
  );
  const trainingEffect = toNumber(
    activity["trainingEffect"] ?? activity["training_effect"] ?? raw?.["aerobicTrainingEffect"]
  );
  const anaerobicTrainingEffect = toNumber(
    activity["anaerobicTrainingEffect"] ??
      activity["anaerobic_training_effect"] ??
      raw?.["anaerobicTrainingEffect"]
  );
  const vo2MaxValue = toNumber(
    activity["vo2MaxValue"] ?? activity["vo2_max_value"] ?? raw?.["vO2MaxValue"] ?? raw?.["vo2_max_value"]
  );

  const isOpenWater = (() => {
    const direct = activity["isOpenWater"] ?? activity["is_open_water"];
    if (typeof direct === "boolean") return direct;

    const activityType = raw?.["activityType"];
    if (isRecord(activityType) && typeof activityType["typeKey"] === "string") {
      return (activityType["typeKey"] as string).toLowerCase().includes("open_water");
    }
    return false;
  })();

  const strokeType =
    (activity["strokeType"] ?? activity["stroke_type"]) ??
    (typeof raw?.["activityName"] === "string" ? (raw["activityName"] as string) : null) ??
    "n/d";

  return {
    distanceMeters,
    durationSeconds,
    avgPacePer100m,
    avgHeartRate,
    maxHeartRate,
    avgSwolf,
    avgStrokeCadence,
    avgStrokeDistance,
    trainingEffect,
    anaerobicTrainingEffect,
    vo2MaxValue,
    isOpenWater,
    strokeType,
    raw,
  };
}

export async function generateActivityInsight(activity: Record<string, unknown>) {
  const normalized = normalizeActivity(activity);
  const activityId = toNumber(activity["id"]);
  const segmentContext = activityId ? await buildSegmentContext(activityId) : null;
  const segmentContextText = formatSegmentContext(segmentContext);

  if (!normalized.distanceMeters && !normalized.durationSeconds) {
    return null;
  }

  log.debug("[AI Insights] Activity context prepared", {
    event: "ai_activity_insights:context_ready",
    activityId: activityId ?? null,
    hasRawData: Boolean(normalized.raw),
    hasSegmentContext: Boolean(segmentContext),
    segmentLapCount: segmentContext?.totalLaps ?? 0,
  });

  const prompt = `Sei un analista di performance di nuoto. Analizza UNA singola sessione.

REGOLE:
- Usa SOLO i dati forniti di questa sessione.
- NON usare dati globali o storici.
- Output in JSON puro, senza markdown.
- Mantieni tono professionale, mirato e non generico.
- NON ripetere i dati grezzi (distanza, durata, HR) come elenco.
- Deve emergere interpretazione: cosa indicano i numeri e perché.
- 1 titolo, 1 summary, 3-5 bullet analitici.
- Inserisci 1 consiglio pratico specifico per la prossima sessione.
- Inserisci 1 focus tecnico (es: pacing, virata, bracciata, respirazione, coerenza).

DATI SESSIONE:
- Distanza: ${normalized.distanceMeters ?? "n/d"} m
- Durata: ${normalized.durationSeconds ?? "n/d"} s
- Pace medio: ${formatPace(normalized.avgPacePer100m)}
- Stroke: ${normalized.strokeType || "n/d"}
- Open water: ${normalized.isOpenWater ? "sì" : "no"}
- HR medio: ${normalized.avgHeartRate ?? "n/d"}
- HR max: ${normalized.maxHeartRate ?? "n/d"}
- SWOLF medio: ${normalized.avgSwolf ?? "n/d"}
- Stroke cadence: ${normalized.avgStrokeCadence ?? "n/d"}
- Stroke distance: ${normalized.avgStrokeDistance ?? "n/d"}
- Training effect: ${normalized.trainingEffect ?? "n/d"}
- Anaerobic TE: ${normalized.anaerobicTrainingEffect ?? "n/d"}
- VO2max: ${normalized.vo2MaxValue ?? "n/d"}
- Segmenti/Laps disponibili:
- ${segmentContextText}
- Raw data (JSON): ${formatRawData(normalized.raw)}

FORMAT JSON richiesto:
{
  "title": "...",
  "summary": "...",
  "bullets": ["...", "...", "..."],
  "tags": ["Tecnica", "Intensità", "Recupero", "Consiglio"]
}`;

  const llm = await generateText({
    messages: [{ role: "user", content: prompt }],
    maxTokens: 700,
  });
  const text = llm.text;
  const data = safeJsonParse(text);
  if (!data || !data.title || !data.summary || !Array.isArray(data.bullets)) {
    return null;
  }

  return {
    title: String(data.title).slice(0, 120),
    summary: String(data.summary).slice(0, 500),
    bullets: Array.isArray(data.bullets) ? data.bullets.slice(0, 5) : [],
    tags: Array.isArray(data.tags) ? data.tags.slice(0, 5) : [],
  };
}

export async function getPendingActivityInsights(userId: number, limit = 3) {
  const db = await getDb();
  if (!db) return [];

  const pendingResult = await db.execute(sql`
    SELECT i.*, a.distance_meters AS activity_distance_meters, a.duration_seconds AS activity_duration_seconds,
           a.activity_date AS activity_date
    FROM activity_ai_insights i
    LEFT JOIN swimming_activities a ON a.id = i.activity_id
    WHERE i.user_id = ${userId} AND i.seen_at IS NULL
    ORDER BY i.generated_at DESC
    LIMIT ${limit}
  `);
  const pending = pendingResult.rows as any[];

  // If we have enough, return immediately
  if (pending.length >= limit) return pending;

  // Schedule background generation (fire-and-forget) for missing insights
  // This does NOT block the response
  const remaining = limit - pending.length;
  const now = Date.now();
  const lastScheduledAt = userBackgroundGenerationThrottle.get(userId) ?? 0;
  if (now - lastScheduledAt >= BACKGROUND_THROTTLE_MS) {
    userBackgroundGenerationThrottle.set(userId, now);
    generateMissingInsightsBackground(userId, remaining).catch((err) => {
      log.error("[AI Insights] Background generation failed", {
        event: "ai_activity_insights:background_failed",
        userId,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    });
  }

  // Return what we have now (user gets fast response)
  return pending;
}

// Separate background function
async function generateMissingInsightsBackground(userId: number, limit: number) {
  const db = await getDb();
  if (!db) return;

  const activities = await db.execute(sql`
    SELECT a.*
    FROM swimming_activities a
    LEFT JOIN activity_ai_insights i ON i.activity_id = a.id
    WHERE a.user_id = ${userId} AND i.id IS NULL
    ORDER BY a.activity_date DESC
    LIMIT ${limit}
  `);

  for (const row of activities.rows as any[]) {
    const activityId = Number(row.id);
    if (!Number.isFinite(activityId)) continue;
    const inFlightKey = `${userId}:${activityId}`;
    if (inFlightActivityInsightKeys.has(inFlightKey)) continue;

    inFlightActivityInsightKeys.add(inFlightKey);
    try {
      await ensureGarminSegmentData(row as Record<string, unknown>);

      const alreadyExists = await db
        .select({ id: activityAiInsights.id })
        .from(activityAiInsights)
        .where(eq(activityAiInsights.activityId, activityId))
        .limit(1);
      if (alreadyExists.length > 0) continue;

      const insight = await generateActivityInsight(row);
      if (!insight) continue;
      await db
        .insert(activityAiInsights)
        .values({
          userId,
          activityId,
          title: insight.title,
          summary: insight.summary,
          bullets: insight.bullets,
          tags: insight.tags,
          generatedAt: new Date(),
        })
        .onConflictDoNothing({ target: activityAiInsights.activityId });
    } catch (err) {
      log.error("[AI Insights] Failed to generate insight for activity", {
        event: "ai_activity_insights:generate_failed",
        userId,
        activityId,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    } finally {
      inFlightActivityInsightKeys.delete(inFlightKey);
    }
  }
}

export async function markActivityInsightSeen(userId: number, activityId: number) {
  const db = await getDb();
  if (!db) return;

  await db
    .update(activityAiInsights)
    .set({ seenAt: new Date() })
    .where(and(eq(activityAiInsights.userId, userId), eq(activityAiInsights.activityId, activityId)));
}

export async function listActivityInsights(userId: number, limit = 20, offset = 0) {
  const db = await getDb();
  if (!db) return [];

  const result = await db.execute(sql`
    SELECT i.*, a.distance_meters AS activity_distance_meters, a.duration_seconds AS activity_duration_seconds,
           a.activity_date AS activity_date, a.activity_source AS activity_source, a.stroke_type AS stroke_type,
           COALESCE(a.activity_date, i.generated_at) AS sort_ts
    FROM activity_ai_insights i
    LEFT JOIN swimming_activities a ON a.id = i.activity_id
    WHERE i.user_id = ${userId}
    ORDER BY sort_ts DESC NULLS LAST, i.generated_at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  return result.rows;
}
