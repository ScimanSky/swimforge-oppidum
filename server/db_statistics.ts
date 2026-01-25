import { getDb } from "./db";
import { swimmingActivities, swimmerProfiles } from "../drizzle/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { generateAIInsights, UserStatsData } from "./ai_insights";

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

  const db = await getDb();
  const activities = await db
    .select({
      date: swimmingActivities.activityDate,
      distance: swimmingActivities.distanceMeters,
      pace: swimmingActivities.avgPacePer100m,
    })
    .from(swimmingActivities)
    .where(
      and(
        eq(swimmingActivities.userId, userId),
        gte(swimmingActivities.activityDate, startDate)
      )
    )
    .orderBy(swimmingActivities.activityDate);

  // Group by date
  const grouped = new Map<string, { distance: number; pace: number[]; sessions: number }>();

  for (const activity of activities) {
    const dateStr = formatDate(new Date(activity.date));
    const existing = grouped.get(dateStr) || { distance: 0, pace: [], sessions: 0 };

    existing.distance += activity.distance;
    existing.sessions += 1;
    if (activity.pace) {
      existing.pace.push(activity.pace);
    }

    grouped.set(dateStr, existing);
  }

  // Convert to array
  const timeline: TimelineDataPoint[] = [];
  for (const [date, data] of grouped.entries()) {
    timeline.push({
      date,
      distance: Math.round(data.distance / 10) / 100, // meters to km, 2 decimals
      pace: data.pace.length > 0 
        ? Math.round(data.pace.reduce((a, b) => a + b, 0) / data.pace.length)
        : null,
      sessions: data.sessions,
    });
  }

  return timeline.sort((a, b) => a.date.localeCompare(b.date));
}

// ============================================
// PERFORMANCE ANALYSIS
// ============================================

export async function getPerformanceAnalysis(
  userId: number,
  days: number = 30
): Promise<PerformanceAnalysis> {
  const startDate = getDaysAgo(days);

  const db = await getDb();
  const activities = await db
    .select()
    .from(swimmingActivities)
    .where(
      and(
        eq(swimmingActivities.userId, userId),
        gte(swimmingActivities.activityDate, startDate)
      )
    );

  // HR Zones
  const hrZones = { zone1: 0, zone2: 0, zone3: 0, zone4: 0, zone5: 0 };
  let hrCount = 0;

  for (const activity of activities) {
    if (activity.avgHeartRate) {
      const zone = calculateHRZone(activity.avgHeartRate);
      hrZones[`zone${zone}` as keyof typeof hrZones]++;
      hrCount++;
    }
  }

  // Convert to percentages
  const hrZonesPercent = {
    zone1: hrCount > 0 ? Math.round((hrZones.zone1 / hrCount) * 100) : 0,
    zone2: hrCount > 0 ? Math.round((hrZones.zone2 / hrCount) * 100) : 0,
    zone3: hrCount > 0 ? Math.round((hrZones.zone3 / hrCount) * 100) : 0,
    zone4: hrCount > 0 ? Math.round((hrZones.zone4 / hrCount) * 100) : 0,
    zone5: hrCount > 0 ? Math.round((hrZones.zone5 / hrCount) * 100) : 0,
  };

  // Pace Distribution
  const paceRanges: { [key: string]: number } = {};
  for (const activity of activities) {
    if (activity.avgPacePer100m) {
      const pace = activity.avgPacePer100m;
      let range = '';
      if (pace < 90) range = '< 1:30';
      else if (pace < 120) range = '1:30-2:00';
      else if (pace < 150) range = '2:00-2:30';
      else if (pace < 180) range = '2:30-3:00';
      else range = '> 3:00';

      paceRanges[range] = (paceRanges[range] || 0) + 1;
    }
  }

  const paceDistribution = Object.entries(paceRanges).map(([range, count]) => ({
    range,
    count,
  }));

  // Calories
  const caloriesTotal = activities.reduce((sum, a) => sum + (a.calories || 0), 0);
  const avgCaloriesPerSession = activities.length > 0 
    ? Math.round(caloriesTotal / activities.length)
    : 0;

  // SWOLF
  const swolfValues = activities.filter(a => a.swolfScore).map(a => a.swolfScore!);
  const swolfAvg = swolfValues.length > 0
    ? Math.round(swolfValues.reduce((a, b) => a + b, 0) / swolfValues.length)
    : null;

  return {
    hrZones: hrZonesPercent,
    paceDistribution,
    caloriesTotal,
    avgCaloriesPerSession,
    swolfAvg,
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

  const db = await getDb();
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

  // Calculate streak
  let currentStreak = 0;
  let recordStreak = 0;
  let tempStreak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < 365; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() - i);
    const dateStr = formatDate(checkDate);

    if (datesWithActivity.has(dateStr)) {
      tempStreak++;
      if (i === 0 || currentStreak > 0) {
        currentStreak = tempStreak;
      }
      recordStreak = Math.max(recordStreak, tempStreak);
    } else {
      if (i === 0) {
        // Check yesterday
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        if (!datesWithActivity.has(formatDate(yesterday))) {
          currentStreak = 0;
        }
      }
      tempStreak = 0;
    }
  }

  const streakScore = Math.min(currentStreak * 5, 30); // 30 points max
  const gapPenalty = currentStreak === 0 ? 20 : 0;

  const consistencyScore = Math.round(Math.min(regularityScore + streakScore - gapPenalty, 100));

  // Trend Indicator
  const previousDistance = previousActivities.reduce((sum, a) => sum + a.distanceMeters, 0) / 1000;
  const trendPercentage = previousDistance > 0
    ? Math.round(((currentDistance - previousDistance) / previousDistance) * 100)
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
  };

  // Generate AI insights
  const insights = await generateAIInsights(userData);

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

  if (predictions) {
    insights.push(`🎯 Obiettivo ${targetKm}km: ${Math.round(remainingKm)}km rimasti`);
  }

  return {
    performanceIndex,
    consistencyScore,
    trendIndicator,
    insights,
    predictions,
    streak: {
      current: currentStreak,
      record: recordStreak,
    },
  };
}
