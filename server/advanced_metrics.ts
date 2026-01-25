/**
 * Advanced Swimming Metrics Calculator
 * 
 * This module calculates advanced performance metrics for swimmers
 * based on activity data from Garmin Connect.
 */

interface ActivityData {
  distanceMeters: number;
  durationSeconds: number;
  avgPacePer100m?: number | null;
  swolfScore?: number | null;
  avgStrokeDistance?: number | null;  // cm
  avgStrokes?: number | null;
  avgStrokeCadence?: number | null;
  trainingEffect?: number | null;  // 0-50 (x10)
  anaerobicTrainingEffect?: number | null;
  hrZone1Seconds?: number | null;
  hrZone2Seconds?: number | null;
  hrZone3Seconds?: number | null;
  hrZone4Seconds?: number | null;
  hrZone5Seconds?: number | null;
  poolLengthMeters?: number | null;
}

/**
 * Swimming Efficiency Index (SEI)
 * Range: 0-100
 * Combines SWOLF, stroke distance, and pace into a single efficiency score
 */
export function calculateSEI(activity: ActivityData): number | null {
  const { swolfScore, avgStrokeDistance, avgPacePer100m } = activity;
  
  if (!swolfScore && !avgStrokeDistance && !avgPacePer100m) {
    return null;
  }
  
  // SWOLF score component (0-100)
  // Optimal SWOLF is around 35, every point above reduces score
  const swolfComponent = swolfScore 
    ? Math.max(0, Math.min(100, 100 - (swolfScore - 35) * 2))
    : 50;  // Default if missing
  
  // Stroke efficiency component (0-100)
  // Optimal stroke distance is 250cm (2.5m) for freestyle
  const optimalStrokeDistance = 250;  // cm
  const strokeComponent = avgStrokeDistance
    ? Math.min(100, (avgStrokeDistance / optimalStrokeDistance) * 100)
    : 50;
  
  // Pace score component (0-100)
  // Optimal pace is 90 seconds per 100m
  const optimalPace = 90;  // seconds
  const paceComponent = avgPacePer100m
    ? Math.min(100, (optimalPace / avgPacePer100m) * 100)
    : 50;
  
  // Weighted average
  const sei = (swolfComponent * 0.4) + (strokeComponent * 0.35) + (paceComponent * 0.25);
  
  return Math.round(sei);
}

/**
 * Technical Consistency Index (TCI)
 * Range: 0-100
 * Measures how consistent the swimmer is across laps
 * Note: Requires lap-by-lap data, for now we estimate based on available data
 */
export function calculateTCI(activities: ActivityData[]): number | null {
  if (activities.length < 3) {
    return null;  // Need at least 3 activities for consistency
  }
  
  // Calculate coefficient of variation for pace
  const paces = activities
    .map(a => a.avgPacePer100m)
    .filter((p): p is number => p !== null && p !== undefined);
  
  if (paces.length < 3) {
    return null;
  }
  
  const mean = paces.reduce((sum, p) => sum + p, 0) / paces.length;
  const variance = paces.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / paces.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean;  // Coefficient of variation
  
  // Convert CV to 0-100 scale (lower CV = higher consistency)
  // CV of 0.1 (10%) = 90 points, CV of 0.3 (30%) = 70 points
  const tci = Math.max(0, Math.min(100, 100 - (cv * 100)));
  
  return Math.round(tci);
}

/**
 * Stroke Efficiency Rating (SER)
 * Range: 0-100
 * Measures how efficiently the swimmer uses their strokes
 */
export function calculateSER(activity: ActivityData): number | null {
  const { avgStrokeDistance, avgStrokes, poolLengthMeters } = activity;
  
  if (!avgStrokeDistance && !avgStrokes) {
    return null;
  }
  
  // Stroke distance ratio component
  const optimalStrokeDistance = 250;  // cm (2.5m for freestyle)
  const strokeDistanceRatio = avgStrokeDistance
    ? Math.min(100, (avgStrokeDistance / optimalStrokeDistance) * 100)
    : 50;
  
  // Stroke count ratio component
  const poolLength = poolLengthMeters || 25;
  const optimalStrokes = poolLength === 25 ? 10 : 20;  // 10 for 25m, 20 for 50m
  const strokeCountRatio = avgStrokes
    ? Math.min(100, (optimalStrokes / avgStrokes) * 100)
    : 50;
  
  // Weighted average
  const ser = (strokeDistanceRatio * 0.6) + (strokeCountRatio * 0.4);
  
  return Math.round(ser);
}

/**
 * Aerobic Capacity Score (ACS)
 * Range: 0-100
 * Measures aerobic capacity based on HR zones and training effect
 */
export function calculateACS(activity: ActivityData): number | null {
  const { 
    hrZone1Seconds, hrZone2Seconds, hrZone3Seconds, 
    hrZone4Seconds, hrZone5Seconds, trainingEffect 
  } = activity;
  
  // Need HR zone data
  if (!hrZone1Seconds && !hrZone2Seconds && !hrZone3Seconds && !hrZone4Seconds && !hrZone5Seconds) {
    return null;
  }
  
  const totalTime = (hrZone1Seconds || 0) + (hrZone2Seconds || 0) + 
                    (hrZone3Seconds || 0) + (hrZone4Seconds || 0) + (hrZone5Seconds || 0);
  
  if (totalTime === 0) {
    return null;
  }
  
  // Calculate zone distribution percentages
  const z1Pct = ((hrZone1Seconds || 0) / totalTime) * 100;
  const z2Pct = ((hrZone2Seconds || 0) / totalTime) * 100;
  const z3Pct = ((hrZone3Seconds || 0) / totalTime) * 100;
  const z4Pct = ((hrZone4Seconds || 0) / totalTime) * 100;
  const z5Pct = ((hrZone5Seconds || 0) / totalTime) * 100;
  
  // Zone distribution score (privilege Z2-Z3 for aerobic development)
  const zoneScore = (z1Pct * 0.1) + (z2Pct * 0.3) + (z3Pct * 0.5) + (z4Pct * 0.2) + (z5Pct * 0.1);
  
  // Training effect multiplier (0-5 scale, divided by 10 in storage)
  const teMultiplier = trainingEffect ? (trainingEffect / 10) / 5.0 : 0.5;
  
  const acs = zoneScore * teMultiplier;
  
  return Math.round(Math.min(100, acs));
}

/**
 * Recovery Readiness Score (RRS)
 * Range: 0-100
 * Estimates recovery readiness based on resting HR and time since last workout
 */
export function calculateRRS(
  restingHeartRate: number | null,
  baselineRestingHR: number,
  hoursSinceLastWorkout: number,
  recommendedRecoveryHours: number = 24
): number | null {
  if (!restingHeartRate) {
    // If no resting HR, use time-based recovery only
    const timeFactor = Math.min(1.0, hoursSinceLastWorkout / recommendedRecoveryHours);
    return Math.round(timeFactor * 100);
  }
  
  // HR recovery score (lower resting HR = better recovery)
  const hrDelta = restingHeartRate - baselineRestingHR;
  const hrScore = Math.max(0, 100 - (hrDelta / baselineRestingHR * 100));
  
  // Time factor
  const timeFactor = Math.min(1.0, hoursSinceLastWorkout / recommendedRecoveryHours);
  
  // Combined score
  const rrs = hrScore * timeFactor;
  
  return Math.round(Math.max(0, Math.min(100, rrs)));
}

/**
 * Progressive Overload Index (POI)
 * Range: -100 to +100
 * Measures if training is progressing optimally
 */
export function calculatePOI(
  currentPeriodStats: { distance: number; intensity: number; frequency: number },
  previousPeriodStats: { distance: number; intensity: number; frequency: number }
): number | null {
  const { distance: currDist, intensity: currInt, frequency: currFreq } = currentPeriodStats;
  const { distance: prevDist, intensity: prevInt, frequency: prevFreq } = previousPeriodStats;
  
  if (prevDist === 0 || prevInt === 0 || prevFreq === 0) {
    return null;
  }
  
  // Calculate trends (percentage change)
  const distanceTrend = ((currDist - prevDist) / prevDist) * 100;
  const intensityTrend = ((currInt - prevInt) / prevInt) * 100;
  const frequencyTrend = ((currFreq - prevFreq) / prevFreq) * 100;
  
  // Weighted average
  const poi = (distanceTrend * 0.3) + (intensityTrend * 0.4) + (frequencyTrend * 0.3);
  
  // Clamp to -100 to +100
  return Math.round(Math.max(-100, Math.min(100, poi)));
}

/**
 * Get interpretation for SEI score
 */
export function interpretSEI(score: number): { level: string; color: string; description: string } {
  if (score >= 80) {
    return {
      level: "Eccellente",
      color: "green",
      description: "Tecnica molto efficiente, continua così!"
    };
  } else if (score >= 60) {
    return {
      level: "Buono",
      color: "blue",
      description: "Tecnica solida con margini di miglioramento"
    };
  } else if (score >= 40) {
    return {
      level: "Discreto",
      color: "yellow",
      description: "Lavora su tecnica e ritmo per migliorare"
    };
  } else {
    return {
      level: "Da migliorare",
      color: "red",
      description: "Focus su efficienza della bracciata"
    };
  }
}

/**
 * Get interpretation for other metrics
 */
export function interpretScore(
  score: number,
  metric: "TCI" | "SER" | "ACS" | "RRS"
): { level: string; color: string; description: string } {
  const interpretations = {
    TCI: {
      high: "Ritmo molto costante",
      good: "Buona consistenza",
      fair: "Variazioni moderate",
      low: "Lavora sulla gestione del ritmo"
    },
    SER: {
      high: "Scivolamento ottimale",
      good: "Buona efficienza bracciata",
      fair: "Aumenta la distanza per bracciata",
      low: "Troppe bracciate, poco scivolamento"
    },
    ACS: {
      high: "Ottima capacità aerobica",
      good: "Buona base aerobica",
      fair: "Continua a costruire base",
      low: "Lavora su volume Z2-Z3"
    },
    RRS: {
      high: "Pronto per allenamento intenso",
      good: "Allenamento moderato ok",
      fair: "Allenamento leggero consigliato",
      low: "Riposo o recupero attivo"
    }
  };
  
  const messages = interpretations[metric];
  
  if (score >= 85) {
    return { level: "Eccellente", color: "green", description: messages.high };
  } else if (score >= 70) {
    return { level: "Buono", color: "blue", description: messages.good };
  } else if (score >= 50) {
    return { level: "Discreto", color: "yellow", description: messages.fair };
  } else {
    return { level: "Basso", color: "red", description: messages.low };
  }
}
