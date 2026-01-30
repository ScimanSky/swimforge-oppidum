import { GoogleGenerativeAI } from "@google/generative-ai";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "./db";
import { activityAiInsights, swimmingActivities } from "../drizzle/schema";

let genAI: GoogleGenerativeAI | null = null;

function getGeminiClient() {
  if (!genAI && process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
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
    if (text.length > 2000) {
      return text.slice(0, 2000) + "...";
    }
    return text;
  } catch {
    return "n/d";
  }
}

function extractRawActivity(rawData: any) {
  if (!rawData) return null;
  if (rawData.activity) return rawData.activity;
  return rawData;
}

function normalizeActivity(activity: any) {
  const rawData = activity.rawData ?? activity.raw_data ?? null;
  const raw = extractRawActivity(rawData);
  const distanceMeters =
    activity.distanceMeters ?? activity.distance_meters ?? raw?.distance ?? null;
  const durationSeconds =
    activity.durationSeconds ??
    activity.duration_seconds ??
    raw?.movingDuration ??
    raw?.duration ??
    null;
  const avgPacePer100m =
    activity.avgPacePer100m ??
    activity.avg_pace_per_100m ??
    (distanceMeters && durationSeconds ? (durationSeconds / distanceMeters) * 100 : null);

  const avgHeartRate =
    activity.avgHeartRate ??
    activity.avg_heart_rate ??
    raw?.averageHR ??
    raw?.avgHeartRate ??
    raw?.average_heartrate ??
    null;
  const maxHeartRate =
    activity.maxHeartRate ??
    activity.max_heart_rate ??
    raw?.maxHR ??
    raw?.maxHeartRate ??
    raw?.max_heartrate ??
    null;
  const avgSwolf =
    activity.avgSwolf ??
    activity.swolf_score ??
    raw?.averageSwolf ??
    raw?.avgSwolf ??
    raw?.swolf ??
    null;
  const avgStrokeCadence =
    activity.avgStrokeCadence ??
    activity.avg_stroke_cadence ??
    raw?.averageSwimCadenceInStrokesPerMinute ??
    raw?.avgStrokeCadenceRpm ??
    raw?.avgStrokeCadence ??
    null;
  const avgStrokeDistance =
    activity.avgStrokeDistance ??
    activity.avg_stroke_distance ??
    raw?.avgStrokeDistance ??
    null;
  const trainingEffect =
    activity.trainingEffect ??
    activity.training_effect ??
    raw?.aerobicTrainingEffect ??
    null;
  const anaerobicTrainingEffect =
    activity.anaerobicTrainingEffect ??
    activity.anaerobic_training_effect ??
    raw?.anaerobicTrainingEffect ??
    null;
  const vo2MaxValue =
    activity.vo2MaxValue ??
    activity.vo2_max_value ??
    raw?.vO2MaxValue ??
    raw?.vo2_max_value ??
    null;

  const isOpenWater =
    activity.isOpenWater ??
    activity.is_open_water ??
    (typeof raw?.activityType?.typeKey === "string" &&
      raw.activityType.typeKey.toLowerCase().includes("open_water"));

  const strokeType =
    activity.strokeType ??
    activity.stroke_type ??
    (typeof raw?.activityName === "string" ? raw.activityName : null) ??
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

export async function generateActivityInsight(activity: any) {
  const client = getGeminiClient();
  if (!client) return null;

  const model = client.getGenerativeModel({ model: "gemini-2.5-flash" });
  const normalized = normalizeActivity(activity);

  if (!normalized.distanceMeters && !normalized.durationSeconds) {
    return null;
  }

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
- Raw data (JSON): ${formatRawData(normalized.raw)}

FORMAT JSON richiesto:
{
  "title": "...",
  "summary": "...",
  "bullets": ["...", "...", "..."],
  "tags": ["Tecnica", "Intensità", "Recupero", "Consiglio"]
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
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

  if (pending.length >= limit) return pending;

  const remaining = limit - pending.length;
  const activities = await db.execute(sql`
    SELECT a.*
    FROM swimming_activities a
    LEFT JOIN activity_ai_insights i ON i.activity_id = a.id
    WHERE a.user_id = ${userId} AND i.id IS NULL
    ORDER BY a.activity_date DESC
    LIMIT ${remaining}
  `);

  for (const row of activities.rows as any[]) {
    const insight = await generateActivityInsight(row);
    if (!insight) continue;

    await db.insert(activityAiInsights).values({
      userId,
      activityId: row.id,
      title: insight.title,
      summary: insight.summary,
      bullets: insight.bullets,
      tags: insight.tags,
      generatedAt: new Date(),
    });
  }

  const freshResult = await db.execute(sql`
    SELECT i.*, a.distance_meters AS activity_distance_meters, a.duration_seconds AS activity_duration_seconds,
           a.activity_date AS activity_date
    FROM activity_ai_insights i
    LEFT JOIN swimming_activities a ON a.id = i.activity_id
    WHERE i.user_id = ${userId} AND i.seen_at IS NULL
    ORDER BY i.generated_at DESC
    LIMIT ${limit}
  `);

  return freshResult.rows;
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
