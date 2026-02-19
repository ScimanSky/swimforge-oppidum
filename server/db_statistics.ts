import { getDb } from "./db";
import { swimmingActivities, swimmerProfiles } from "../drizzle/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { generateAIInsights, UserStatsData } from "./ai_insights";
import { 
  calculateSEI, 
  calculateTCI, 
  calculateSER, 
  calculateACS, 
  calculateRRS, 
  calculatePOI 
} from "./advanced_metrics";

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

export interface AdvancedMetrics {
  performanceIndex: number; // 0-100
  consistencyScore: number; // 0-100
  trendIndicator: {
    direction: 'up' | 'down' | 'stable';
    percentage: number;
  };
  trendBaseline: boolean;
  insights: string[];
  predictions: {
    targetKm: number;
    estimatedDate: string;
    daysRemaining: number;
  } | null;
  streak: {
    current: number;
    record: number;
  };
  // New advanced metrics
  swimmingEfficiencyIndex: number | null; // SEI: 0-100
  technicalConsistencyIndex: number | null; // TCI: 0-100
  strokeEfficiencyRating: number | null; // SER: 0-100
  aerobicCapacityScore: number | null; // ACS: 0-100
  recoveryReadinessScore: number | null; // RRS: 0-100
  progressiveOverloadIndex: number | null; // POI: -100 to +100
  poiBaseline: boolean;
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

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
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

// ============================================
// ADVANCED METRICS
// ============================================

export async function getAdvancedMetrics(
  userId: number,
  days: number = 30
): Promise<AdvancedMetrics> {
  const startDate = getDaysAgo(days);
  const previousStartDate = getDaysAgo(days * 2);

  const db = await requireDb();
  // Current period
  const currentActivities = await db
    .select()
    .from(swimmingActivities)
    .where(
      and(
        eq(swimmingActivities.userId, userId),
        gte(swimmingActivities.activityDate, startDate)
      )
    )
    .orderBy(desc(swimmingActivities.activityDate));

  // Previous period (for comparison)
  const previousActivities = await db
    .select()
    .from(swimmingActivities)
    .where(
      and(
        eq(swimmingActivities.userId, userId),
        gte(swimmingActivities.activityDate, previousStartDate),
        lte(swimmingActivities.activityDate, startDate)
      )
    );

  // If no previous period activities, fall back to splitting the current period in half
  const midDate = getDaysAgo(Math.floor(days / 2));
  const useFallbackComparison = previousActivities.length === 0;
  const comparisonCurrentActivities = useFallbackComparison
    ? currentActivities.filter((a) => new Date(a.activityDate).getTime() >= midDate.getTime())
    : currentActivities;
  const comparisonPreviousActivities = useFallbackComparison
    ? currentActivities.filter((a) => new Date(a.activityDate).getTime() < midDate.getTime())
    : previousActivities;

  // Calculate Performance Index (0-100)
  const currentDistance = currentActivities.reduce((sum, a) => sum + a.distanceMeters, 0) / 1000;
  const currentSessions = currentActivities.length;
  const avgPace = currentActivities
    .filter(a => a.avgPacePer100m)
    .reduce((sum, a) => sum + a.avgPacePer100m!, 0) / Math.max(currentActivities.filter(a => a.avgPacePer100m).length, 1);

  const distanceScore = Math.min((currentDistance / (days / 7)) * 10, 40); // 40 points max
  const frequencyScore = Math.min((currentSessions / (days / 7)) * 10, 30); // 30 points max
  const paceScore = avgPace > 0 ? Math.max(30 - (avgPace - 120) / 10, 0) : 0; // 30 points max, optimal at 2:00/100m

  const performanceIndex = Math.round(Math.min(distanceScore + frequencyScore + paceScore, 100));

  // Calculate Consistency Score (0-100)
  const datesWithActivity = new Set(
    currentActivities.map(a => formatDate(new Date(a.activityDate)))
  );
  const regularityScore = (datesWithActivity.size / days) * 50; // 50 points max

  // Calculate streak based on training days (Mon/Wed/Fri)
  const trainingDays = new Set([1, 3, 5]); // 0=Sun, 1=Mon, 3=Wed, 5=Fri
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const trainingDates: string[] = [];

  for (let i = 0; i < 365; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() - i);
    if (trainingDays.has(checkDate.getDay())) {
      trainingDates.push(formatDate(checkDate));
    }
  }

  trainingDates.reverse(); // oldest -> newest

  let recordStreak = 0;
  let tempStreak = 0;
  for (const dateStr of trainingDates) {
    if (datesWithActivity.has(dateStr)) {
      tempStreak += 1;
      recordStreak = Math.max(recordStreak, tempStreak);
    } else {
      tempStreak = 0;
    }
  }

  let currentStreak = 0;
  let endIndex = trainingDates.length - 1;
  const todayStr = formatDate(today);
  if (trainingDays.has(today.getDay()) && !datesWithActivity.has(todayStr)) {
    endIndex -= 1;
  }
  for (let i = endIndex; i >= 0; i--) {
    if (datesWithActivity.has(trainingDates[i])) {
      currentStreak += 1;
    } else {
      break;
    }
  }

  const streakScore = Math.min(currentStreak * 5, 30); // 30 points max
  const gapPenalty = currentStreak === 0 ? 20 : 0;

  const consistencyScore = Math.round(Math.min(regularityScore + streakScore - gapPenalty, 100));

  // Trend Indicator
  const comparisonCurrentDistance =
    comparisonCurrentActivities.reduce((sum, a) => sum + a.distanceMeters, 0) / 1000;
  const previousDistance =
    comparisonPreviousActivities.reduce((sum, a) => sum + a.distanceMeters, 0) / 1000;
  const trendBaseline = previousDistance > 0;
  const trendPercentage = trendBaseline
    ? Math.round(((comparisonCurrentDistance - previousDistance) / previousDistance) * 100)
    : 0;

  const trendIndicator = {
    direction: (trendPercentage > 5 ? 'up' : trendPercentage < -5 ? 'down' : 'stable') as 'up' | 'down' | 'stable',
    percentage: Math.abs(trendPercentage),
  };

  // Get user profile for level and XP
  const profile = await db
    .select()
    .from(swimmerProfiles)
    .where(eq(swimmerProfiles.userId, userId))
    .limit(1);

  const userLevel = profile[0]?.level || 1;
  const userXp = profile[0]?.totalXp || 0;

  // Calculate HR zones from real Garmin data (time in seconds per zone)
  const hrActivities = currentActivities.filter(a => 
    a.hrZone1Seconds || a.hrZone2Seconds || a.hrZone3Seconds || a.hrZone4Seconds || a.hrZone5Seconds
  );
  let hrZones = undefined;
  if (hrActivities.length > 0) {
    // Sum up total seconds in each zone across all activities
    const zone1Total = hrActivities.reduce((sum, a) => sum + (a.hrZone1Seconds || 0), 0);
    const zone2Total = hrActivities.reduce((sum, a) => sum + (a.hrZone2Seconds || 0), 0);
    const zone3Total = hrActivities.reduce((sum, a) => sum + (a.hrZone3Seconds || 0), 0);
    const zone4Total = hrActivities.reduce((sum, a) => sum + (a.hrZone4Seconds || 0), 0);
    const zone5Total = hrActivities.reduce((sum, a) => sum + (a.hrZone5Seconds || 0), 0);
    const totalSeconds = zone1Total + zone2Total + zone3Total + zone4Total + zone5Total;
    
    if (totalSeconds > 0) {
      hrZones = {
        zone1: Math.round((zone1Total / totalSeconds) * 100),
        zone2: Math.round((zone2Total / totalSeconds) * 100),
        zone3: Math.round((zone3Total / totalSeconds) * 100),
        zone4: Math.round((zone4Total / totalSeconds) * 100),
        zone5: Math.round((zone5Total / totalSeconds) * 100),
      };
    }
  }

  const swolfActivities = currentActivities.filter(a => a.avgSwolf && a.avgSwolf > 0);
  const swolfAvg = swolfActivities.length > 0
    ? Math.round(swolfActivities.reduce((sum, a) => sum + a.avgSwolf!, 0) / swolfActivities.length)
    : undefined;

  const caloriesTotal = currentActivities.reduce((sum, a) => sum + (a.calories || 0), 0);

  // Calculate new advanced metrics first (before AI insights)
  // SEI: Average across all activities
  const seiScores = currentActivities
    .map(a => calculateSEI(a))
    .filter((s): s is number => s !== null);
  const swimmingEfficiencyIndex = seiScores.length > 0
    ? Math.round(seiScores.reduce((sum, s) => sum + s, 0) / seiScores.length)
    : undefined;

  // TCI: Consistency across activities
  const technicalConsistencyIndex = calculateTCI(currentActivities) || undefined;

  // SER: Average across all activities
  const serScores = currentActivities
    .map(a => calculateSER(a))
    .filter((s): s is number => s !== null);
  const strokeEfficiencyRating = serScores.length > 0
    ? Math.round(serScores.reduce((sum, s) => sum + s, 0) / serScores.length)
    : undefined;

  // ACS: Average across activities with HR data
  const acsScores = currentActivities
    .map(a => calculateACS(a))
    .filter((s): s is number => s !== null);
  const aerobicCapacityScore = acsScores.length > 0
    ? Math.round(acsScores.reduce((sum, s) => sum + s, 0) / acsScores.length)
    : undefined;

  // RRS: Based on most recent activity
  const lastActivity = currentActivities[0];
  const baselineRestingHR = 60;  // TODO: Get from user profile
  const hoursSinceLastWorkout = lastActivity 
    ? (Date.now() - new Date(lastActivity.activityDate).getTime()) / (1000 * 60 * 60)
    : 999;
  const recoveryReadinessScore = lastActivity
    ? calculateRRS(
        lastActivity.restingHeartRate,
        baselineRestingHR,
        hoursSinceLastWorkout,
        lastActivity.recoveryTimeHours || 24
      ) || undefined
    : undefined;

  // POI: Compare current vs previous period
  const comparisonAvgPace = comparisonCurrentActivities.length > 0
    ? comparisonCurrentActivities
        .filter(a => a.avgPacePer100m)
        .reduce((sum, a) => sum + a.avgPacePer100m!, 0) / Math.max(comparisonCurrentActivities.filter(a => a.avgPacePer100m).length, 1)
    : 0;
  const currentStats = {
    distance: comparisonCurrentDistance,
    intensity: comparisonAvgPace > 0 ? 120 / comparisonAvgPace : 0,  // Normalized intensity
    frequency: comparisonCurrentActivities.length
  };
  const avgPrevPace = comparisonPreviousActivities.length > 0
    ? comparisonPreviousActivities.reduce((sum, a) => sum + (a.avgPacePer100m || 0), 0) / comparisonPreviousActivities.length
    : 0;
  const previousStats = {
    distance: previousDistance,
    intensity: avgPrevPace > 0 ? 120 / avgPrevPace : 0,
    frequency: comparisonPreviousActivities.length
  };
  const poiBaseline = previousStats.distance > 0 || previousStats.intensity > 0 || previousStats.frequency > 0;
  const progressiveOverloadIndex = poiBaseline
    ? calculatePOI(currentStats, previousStats) ?? undefined
    : undefined;

  // Prepare data for AI
  const userData: UserStatsData = {
    level: userLevel,
    totalXp: userXp,
    currentStreak,
    recordStreak,
    avgPaceSeconds: avgPace,
    totalDistanceMeters: currentDistance * 1000,
    sessions: currentSessions,
    hrZones,
    trend: trendIndicator.direction,
    trendPercentage: trendIndicator.percentage,
    performanceIndex,
    consistencyScore,
    periodDays: days,
    swolfAvg,
    caloriesTotal,
    // New advanced metrics
    swimmingEfficiencyIndex,
    technicalConsistencyIndex,
    strokeEfficiencyRating,
    aerobicCapacityScore,
    recoveryReadinessScore,
    progressiveOverloadIndex,
  };

  // Generate AI insights
  const insights = await generateAIInsights(userData, userId);

  // Predictions (estimate when user will reach 50km)
  const targetKm = 50;
  const kmPerDay = currentDistance / days;
  const remainingKm = Math.max(targetKm - currentDistance, 0);
  const daysToTarget = kmPerDay > 0 ? Math.ceil(remainingKm / kmPerDay) : 0;

  const predictions = daysToTarget > 0 && daysToTarget < 90 ? {
    targetKm,
    estimatedDate: formatDate(new Date(Date.now() + daysToTarget * 24 * 60 * 60 * 1000)),
    daysRemaining: daysToTarget,
  } : null;

  // Remove static insight - only AI insights

	  return {
	    performanceIndex,
	    consistencyScore,
	    trendIndicator,
	    trendBaseline,
	    insights,
	    predictions,
	    streak: {
	      current: currentStreak,
	      record: recordStreak,
	    },
	    swimmingEfficiencyIndex: swimmingEfficiencyIndex ?? null,
	    technicalConsistencyIndex: technicalConsistencyIndex ?? null,
	    strokeEfficiencyRating: strokeEfficiencyRating ?? null,
	    aerobicCapacityScore: aerobicCapacityScore ?? null,
	    recoveryReadinessScore: recoveryReadinessScore ?? null,
	    progressiveOverloadIndex: progressiveOverloadIndex ?? null,
	    poiBaseline,
	  };
	}
