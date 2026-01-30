import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "./db";
import { swimmingActivities, swimmerProfiles } from "../drizzle/schema";
import { updateUserProfileBadgeByLevel } from "./db_profile_badges";

type IntensityBand = "low" | "medium" | "high";

const LEVEL_LABELS: Record<number, string> = {
  1: "Novizio",
  2: "Principiante",
  3: "Intermedio",
  4: "Avanzato",
  5: "Esperto",
  6: "Maestro",
  7: "Leggenda",
};

const BASE_THRESHOLDS_100 = [
  { level: 7, max: 66 }, // < 1'07"
  { level: 6, max: 71 }, // 1'07"-1'11"
  { level: 5, max: 77 }, // 1'12"-1'17"
  { level: 4, max: 83 }, // 1'18"-1'23"
  { level: 3, max: 89 }, // 1'24"-1'29"
  { level: 2, max: 99 }, // 1'30"-1'39"
  { level: 1, max: 9999 }, // > 1'40"
];

const SWOLF_THRESHOLDS = [
  { level: 7, max: 31 },
  { level: 6, max: 34 },
  { level: 5, max: 37 },
  { level: 4, max: 41 },
  { level: 3, max: 47 },
  { level: 2, max: 55 },
  { level: 1, max: 999 },
];

const TRAINING_MULTIPLIERS: Record<IntensityBand, number> = {
  low: 1.25,
  medium: 1.15,
  high: 1.08,
};

function extractRawActivity(rawData: any) {
  if (!rawData) return null;
  if (rawData.activity) return rawData.activity;
  return rawData;
}

function getFastest100(activity: any): number | null {
  const raw = extractRawActivity(activity.rawData);
  const fromRaw =
    raw?.fastestSplit_100 ??
    raw?.fastestSplit100 ??
    raw?.fastestSplit_100m ??
    null;
  if (fromRaw) return Math.round(fromRaw);
  const pace = activity.avgPacePer100m ?? activity.avg_pace_per_100m ?? null;
  if (pace) return Math.round(pace);
  return null;
}

function getAvgSwolf(activity: any): number | null {
  const raw = extractRawActivity(activity.rawData);
  return (
    activity.avgSwolf ??
    activity.swolf_score ??
    raw?.averageSwolf ??
    raw?.avgSwolf ??
    null
  );
}

function detectIntensity(activity: any): IntensityBand {
  const te =
    activity.trainingEffect ??
    activity.training_effect ??
    extractRawActivity(activity.rawData)?.aerobicTrainingEffect ??
    null;
  if (te !== null && te !== undefined) {
    if (te >= 3.5) return "high";
    if (te >= 2.5) return "medium";
    return "low";
  }

  const zone4 = activity.hrZone4Seconds ?? activity.hr_zone_4_seconds ?? 0;
  const zone5 = activity.hrZone5Seconds ?? activity.hr_zone_5_seconds ?? 0;
  const total =
    (activity.hrZone1Seconds ?? activity.hr_zone_1_seconds ?? 0) +
    (activity.hrZone2Seconds ?? activity.hr_zone_2_seconds ?? 0) +
    (activity.hrZone3Seconds ?? activity.hr_zone_3_seconds ?? 0) +
    zone4 +
    zone5;
  if (total <= 0) return "medium";
  const ratio = (zone4 + zone5) / total;
  if (ratio >= 0.35) return "high";
  if (ratio >= 0.2) return "medium";
  return "low";
}

function getLevelFromTime(seconds100: number, intensity: IntensityBand) {
  const adjusted = seconds100 / TRAINING_MULTIPLIERS[intensity];
  for (const threshold of BASE_THRESHOLDS_100) {
    if (adjusted <= threshold.max) return threshold.level;
  }
  return 1;
}

function getLevelFromSwolf(swolf: number) {
  for (const threshold of SWOLF_THRESHOLDS) {
    if (swolf <= threshold.max) return threshold.level;
  }
  return 1;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

function clampLevel(level: number) {
  return Math.max(1, Math.min(7, level));
}

function buildMessage(change: "promoted" | "demoted" | "unchanged", label: string) {
  if (change === "promoted") {
    return `Complimenti! La tua performance media ti colloca ora in fascia ${label}. Continua così: stai consolidando un livello superiore.`;
  }
  if (change === "demoted") {
    return `Nessun problema: la stima attuale ti colloca in fascia ${label}. Focalizzati su continuità e tecnica per risalire.`;
  }
  return `Stima stabile: resti in fascia ${label}. Ottimo equilibrio tra qualità e costanza.`;
}

export async function evaluateUserSkillLevel(userId: number) {
  const db = await getDb();
  if (!db) return null;

  const profile = await db
    .select()
    .from(swimmerProfiles)
    .where(eq(swimmerProfiles.userId, userId))
    .limit(1);

  if (!profile.length) return null;
  const currentProfile = profile[0];

  const activities = await db
    .select()
    .from(swimmingActivities)
    .where(eq(swimmingActivities.userId, userId))
    .orderBy(desc(swimmingActivities.activityDate))
    .limit(6);

  if (!activities.length) return null;

  const fastestSamples: number[] = [];
  const intensities: IntensityBand[] = [];
  const swolfSamples: number[] = [];

  activities.forEach((activity: any) => {
    const fastest = getFastest100(activity);
    if (fastest) fastestSamples.push(fastest);
    intensities.push(detectIntensity(activity));
    const swolf = getAvgSwolf(activity);
    if (swolf) swolfSamples.push(swolf);
  });

  const medianFastest = median(fastestSamples);
  if (!medianFastest) return null;

  const intensityScore =
    intensities.filter((i) => i === "high").length >= 3
      ? "high"
      : intensities.filter((i) => i === "low").length >= 3
      ? "low"
      : "medium";

  const timeLevel = getLevelFromTime(medianFastest, intensityScore);
  const swolfMedian = median(swolfSamples);
  const swolfLevel = swolfMedian ? getLevelFromSwolf(swolfMedian) : timeLevel;

  const blended = Math.round(timeLevel * 0.7 + swolfLevel * 0.3);
  const newLevel = clampLevel(blended);

  const currentLevel = currentProfile.aiSkillLevel ?? null;
  const change: "promoted" | "demoted" | "unchanged" =
    currentLevel === null
      ? "promoted"
      : newLevel > currentLevel
      ? "promoted"
      : newLevel < currentLevel
      ? "demoted"
      : "unchanged";

  const confidence = Math.min(95, 60 + Math.floor((fastestSamples.length / 6) * 20) + (swolfSamples.length ? 10 : 0));
  const message = buildMessage(change, LEVEL_LABELS[newLevel]);

  await db
    .update(swimmerProfiles)
    .set({
      aiSkillLevel: newLevel,
      aiSkillLabel: LEVEL_LABELS[newLevel],
      aiSkillConfidence: confidence,
      aiSkillLastEvaluatedAt: new Date(),
      aiSkillChange: change,
      aiSkillMessage: message,
    })
    .where(eq(swimmerProfiles.userId, userId));

  await updateUserProfileBadgeByLevel(userId, newLevel);

  return { newLevel, change, confidence };
}

export async function evaluateAllUsersWeekly() {
  const db = await getDb();
  if (!db) return { updated: 0 };

  const users = await db
    .select({
      userId: swimmerProfiles.userId,
      lastEvaluated: swimmerProfiles.aiSkillLastEvaluatedAt,
    })
    .from(swimmerProfiles)
    .where(isNotNull(swimmerProfiles.userId));

  let updated = 0;
  const now = Date.now();

  for (const user of users) {
    const last = user.lastEvaluated ? new Date(user.lastEvaluated).getTime() : 0;
    const daysSince = (now - last) / (1000 * 60 * 60 * 24);
    if (daysSince < 6.5) continue;
    const result = await evaluateUserSkillLevel(user.userId);
    if (result) updated += 1;
  }

  return { updated };
}
