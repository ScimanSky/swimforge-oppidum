import { getDb } from "./db";
import { swimmingActivities } from "../drizzle/schema";
import { eq, and, gte, sql } from "drizzle-orm";

type DbClient = NonNullable<Awaited<ReturnType<typeof getDb>>>;

async function requireDb(): Promise<DbClient> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db;
}

// ============================================
// TYPES
// ============================================

export interface TimelineDataPoint {
  date: string;
  distance: number; // km
  pace: number | null; // seconds per 100m
  sessions: number;
}

export interface PerformanceAnalysis {
  hrZones: {
    zone1: number; // percentage
    zone2: number;
    zone3: number;
    zone4: number;
    zone5: number;
  };
  paceDistribution: {
    range: string;
    count: number;
  }[];
  caloriesTotal: number;
  avgCaloriesPerSession: number;
  swolfAvg: number | null;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getDaysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
}

function calculateHRZone(hr: number): number {
  // Simplified HR zones (can be personalized later)
  if (hr < 100) return 1;
  if (hr < 120) return 2;
  if (hr < 140) return 3;
  if (hr < 160) return 4;
  return 5;
}

// ============================================
// PROGRESS TIMELINE
// ============================================

export async function getProgressTimeline(
  userId: number,
  days: number = 30
): Promise<TimelineDataPoint[]> {
  const startDate = getDaysAgo(days);

  const db = await requireDb();
  const rows = await db
    .select({
      date: sql<string>`date(${swimmingActivities.activityDate})`,
      distanceMeters: sql<number>`sum(${swimmingActivities.distanceMeters})`,
      sessions: sql<number>`count(*)`,
      avgPace: sql<number | null>`round(avg(${swimmingActivities.avgPacePer100m}))`,
    })
    .from(swimmingActivities)
    .where(
      and(
        eq(swimmingActivities.userId, userId),
        gte(swimmingActivities.activityDate, startDate)
      )
    )
    .groupBy(sql`date(${swimmingActivities.activityDate})`)
    .orderBy(sql`date(${swimmingActivities.activityDate})`);

  return rows.map(row => ({
    date: row.date,
    distance: Math.round((Number(row.distanceMeters || 0) / 1000) * 100) / 100,
    pace: row.avgPace ? Number(row.avgPace) : null,
    sessions: Number(row.sessions || 0),
  }));
}

// ============================================
// PERFORMANCE ANALYSIS
// ============================================

export async function getPerformanceAnalysis(
  userId: number,
  days: number = 30
): Promise<PerformanceAnalysis> {
  const startDate = getDaysAgo(days);

  const db = await requireDb();
  const aggregates = await db
    .select({
      zone1: sql<number>`coalesce(sum(${swimmingActivities.hrZone1Seconds}), 0)`,
      zone2: sql<number>`coalesce(sum(${swimmingActivities.hrZone2Seconds}), 0)`,
      zone3: sql<number>`coalesce(sum(${swimmingActivities.hrZone3Seconds}), 0)`,
      zone4: sql<number>`coalesce(sum(${swimmingActivities.hrZone4Seconds}), 0)`,
      zone5: sql<number>`coalesce(sum(${swimmingActivities.hrZone5Seconds}), 0)`,
      caloriesTotal: sql<number>`coalesce(sum(${swimmingActivities.calories}), 0)`,
      sessions: sql<number>`count(*)`,
      swolfAvg: sql<number | null>`round(avg(${swimmingActivities.avgSwolf}))`,
      avgCaloriesPerSession: sql<number | null>`round(avg(${swimmingActivities.calories}))`,
    })
    .from(swimmingActivities)
    .where(
      and(
        eq(swimmingActivities.userId, userId),
        gte(swimmingActivities.activityDate, startDate)
      )
    );

  const row = aggregates[0] ?? {
    zone1: 0, zone2: 0, zone3: 0, zone4: 0, zone5: 0,
    caloriesTotal: 0, sessions: 0, swolfAvg: null, avgCaloriesPerSession: null,
  };

  const zone1 = Number(row.zone1 ?? 0);
  const zone2 = Number(row.zone2 ?? 0);
  const zone3 = Number(row.zone3 ?? 0);
  const zone4 = Number(row.zone4 ?? 0);
  const zone5 = Number(row.zone5 ?? 0);
  const totalHrSeconds = zone1 + zone2 + zone3 + zone4 + zone5;

  const hrZonesPercent = {
    zone1: totalHrSeconds > 0 ? Math.round((zone1 / totalHrSeconds) * 100) : 0,
    zone2: totalHrSeconds > 0 ? Math.round((zone2 / totalHrSeconds) * 100) : 0,
    zone3: totalHrSeconds > 0 ? Math.round((zone3 / totalHrSeconds) * 100) : 0,
    zone4: totalHrSeconds > 0 ? Math.round((zone4 / totalHrSeconds) * 100) : 0,
    zone5: totalHrSeconds > 0 ? Math.round((zone5 / totalHrSeconds) * 100) : 0,
  };

  const paceDistributionRows = await db
    .select({
      range: sql<string>`case
        when ${swimmingActivities.avgPacePer100m} < 90 then '< 1:30'
        when ${swimmingActivities.avgPacePer100m} < 120 then '1:30-2:00'
        when ${swimmingActivities.avgPacePer100m} < 150 then '2:00-2:30'
        when ${swimmingActivities.avgPacePer100m} < 180 then '2:30-3:00'
        else '> 3:00' end`,
      count: sql<number>`count(*)`,
    })
    .from(swimmingActivities)
    .where(
      and(
        eq(swimmingActivities.userId, userId),
        gte(swimmingActivities.activityDate, startDate),
        sql`${swimmingActivities.avgPacePer100m} is not null`
      )
    )
    .groupBy(sql`1`);

  const paceDistribution = paceDistributionRows.map(row => ({
    range: row.range,
    count: Number(row.count || 0),
  }));

  return {
    hrZones: hrZonesPercent,
    paceDistribution,
    caloriesTotal: Number(row.caloriesTotal || 0),
    avgCaloriesPerSession: Number(row.avgCaloriesPerSession || 0),
    swolfAvg: row.swolfAvg ? Number(row.swolfAvg) : null,
  };
}
