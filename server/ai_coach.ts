/**
 * AI Coach Module
 * Generates personalized swimming workouts (pool and dryland) using Google Gemini AI
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { getDb } from "./db";
import { aiCoachWorkouts, swimmerProfiles, swimmingActivities } from "../drizzle/schema";
import { eq, and, gt, gte, desc, sql } from "drizzle-orm";
import { logger } from "./middleware/logger";
import { ENV } from "./_core/env";
import { withErrorHandling } from "./lib/withErrorHandling";
import { config } from "./config";
import { getSwimMetrics } from "./swim_metrics";
import {
  PACE_ZONE_COACH_RULES,
  SWIM_METRICS_COACH_RULES,
  swimMetricsForCoach,
  swimMetricsGlossary,
} from "./swim_metrics/coach-context";
import { finalizePoolWorkout, generateZonedPoolWorkout, parseWorkoutJson } from "./ai_coach_zones";
import type { SwimZones } from "@shared/swimMetrics";
import type { CoachWorkout } from "@shared/coachWorkout";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const GEMINI_MODEL = ENV.geminiTextModel;
const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

/** A generated workout (shared with the client): pool reps carry a pace zone A1–C3. */
export type GeneratedWorkout = CoachWorkout;

export type UserStatsForCoach = {
  profile: {
    aiSkillLabel: string | null;
    level: number;
    totalXp: number;
    totalDistanceMeters: number;
    totalSessions: number;
  };
  recent: {
    activitiesCount: number;
    totalDistance: number;
    totalTime: number;
    avgPace: string;
    avgSwolf: string;
    sessionsPerWeek: string;
  };
  /** The swim metrics block and glossary (coach-context), or a line saying they are missing. */
  swimMetricsText: string;
  /** The athlete's zones A1–C3 in effect: the server checks the reps and adds the paces. */
  paceZones: SwimZones | null;
  hrZones: {
    hasData: boolean;
    activitiesWithHR: number;
    zone1: string;
    zone2: string;
    zone3: string;
    zone4: string;
    zone5: string;
  };
  latestActivities: Array<{
    date: Date;
    distance: number;
    duration: number;
    pace: number | null;
    swolf: number | null;
    strokes: number | null;
    strokeRate: number | null;
  }>;
};

function buildDefaultWorkout(workoutType: "pool" | "dryland"): GeneratedWorkout {
  if (workoutType === "dryland") {
    return {
      type: "dryland",
      title: "Workout Dryland (Standard)",
      description: "Allenamento standard generato in fallback (AI non disponibile).",
      duration: "30-40 min",
      difficulty: "Intermedio",
      sections: [
        {
          title: "Riscaldamento",
          exercises: [
            { name: "Mobilita' spalle e anca", duration: "6-8 min", notes: "Movimenti controllati" },
          ],
        },
        {
          title: "Forza + Core",
          exercises: [
            { name: "Squat a corpo libero", sets: "3", reps: "12" },
            { name: "Push-up (variante)", sets: "3", reps: "8-12" },
            { name: "Rematore con elastico", sets: "3", reps: "12-15" },
            { name: "Plank", sets: "3", duration: "30-45s" },
          ],
        },
        {
          title: "Defaticamento",
          exercises: [
            { name: "Stretching pettorali/dorso", duration: "5 min" },
          ],
        },
      ],
      coachNotes: [
        "AI Coach temporaneamente non disponibile: workout standard in fallback.",
        "Se senti dolore acuto, interrompi l'esercizio.",
      ],
    };
  }

  return {
    type: "pool",
    title: "Workout Piscina (Standard)",
    description: "Allenamento standard generato in fallback (AI non disponibile).",
    duration: "45-60 min",
    difficulty: "Intermedio",
    sections: [
      {
        title: "Riscaldamento",
        exercises: [
          { name: "200m stile facile", distance: "200m", rest: "20s", zone: "A1", stroke: "stile libero" },
          { name: "4x50m tecnica (catch-up / sculling)", distance: "4x50m", rest: "20s", zone: "A1", stroke: "tecnica" },
        ],
      },
      {
        title: "Serie Principale",
        exercises: [
          { name: "6x100m a ritmo controllato", distance: "6x100m", rest: "20-30s", intensity: "RPE 5", zone: "B1", stroke: "stile libero" },
          { name: "4x50m forte", distance: "4x50m", rest: "30-40s", intensity: "RPE 8-9", zone: "C2", stroke: "stile libero" },
        ],
      },
      {
        title: "Defaticamento",
        exercises: [
          { name: "200m facile", distance: "200m", rest: "0-20s", zone: "A1", stroke: "stile libero" },
        ],
      },
    ],
    coachNotes: [
      "AI Coach temporaneamente non disponibile: workout standard in fallback.",
      "Mantieni tecnica pulita: priorita' alla qualita'.",
    ],
  };
}

async function getLatestCachedWorkout(
  userId: number,
  workoutType: "pool" | "dryland",
): Promise<GeneratedWorkout | null> {
  const db = await getDb();
  if (!db) return null;

  const cached = await db
    .select()
    .from(aiCoachWorkouts)
    .where(and(eq(aiCoachWorkouts.userId, userId), eq(aiCoachWorkouts.workoutType, workoutType)))
    .orderBy(desc(aiCoachWorkouts.generatedAt))
    .limit(1);

  if (cached.length === 0) return null;
  try {
    return JSON.parse(cached[0].workoutData);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[AI Coach] Failed to parse cached workout JSON: ${message}`, {
      event: "ai_coach:cache_parse_failed",
      userId,
      workoutType,
      message,
    });
    return null;
  }
}

const COOLDOWN_DAYS = 7;
const MIN_SWIMMING_ACTIVITIES_FOR_GENERATION = 3;

export interface WorkoutsResponse {
  pool: GeneratedWorkout | null;
  dryland: GeneratedWorkout | null;
  generatedAt: string | null;
  nextAvailableAt: string | null;
  canGenerate: boolean;
  generationBlockedReason: string | null;
  minActivitiesRequired: number;
  activityCount: number;
}

async function getUserSwimmingActivityCount(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const result = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(swimmingActivities)
    .where(eq(swimmingActivities.userId, userId));

  return Number(result[0]?.count ?? 0);
}

/**
 * Get existing cached workouts (read-only, no generation)
 */
export async function getExistingWorkouts(userId: number): Promise<WorkoutsResponse> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }
  const activityCount = await getUserSwimmingActivityCount(userId);
  const hasMinimumActivities = activityCount >= MIN_SWIMMING_ACTIVITIES_FOR_GENERATION;
  const generationBlockedReason = hasMinimumActivities
    ? null
    : `Servono almeno ${MIN_SWIMMING_ACTIVITIES_FOR_GENERATION} attività di nuoto sincronizzate per generare i workout AI.`;

  const cached = await db
    .select()
    .from(aiCoachWorkouts)
    .where(eq(aiCoachWorkouts.userId, userId))
    .orderBy(desc(aiCoachWorkouts.generatedAt));

  let pool: GeneratedWorkout | null = null;
  let dryland: GeneratedWorkout | null = null;
  let latestGeneratedAt: Date | null = null;

  for (const row of cached) {
    try {
      const workout = JSON.parse(row.workoutData) as GeneratedWorkout;
      if (row.workoutType === "pool" && !pool) pool = workout;
      if (row.workoutType === "dryland" && !dryland) dryland = workout;
      if (!latestGeneratedAt || row.generatedAt > latestGeneratedAt) {
        latestGeneratedAt = row.generatedAt;
      }
    } catch {
      // skip corrupt cache entries
    }
  }

  const nextAvailableAt = latestGeneratedAt
    ? new Date(latestGeneratedAt.getTime() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000)
    : null;
  const canGenerate = hasMinimumActivities && (!nextAvailableAt || nextAvailableAt <= new Date());

  return {
    pool,
    dryland,
    generatedAt: latestGeneratedAt?.toISOString() ?? null,
    nextAvailableAt: nextAvailableAt?.toISOString() ?? null,
    canGenerate,
    generationBlockedReason,
    minActivitiesRequired: MIN_SWIMMING_ACTIVITIES_FOR_GENERATION,
    activityCount,
  };
}

/**
 * Generate both pool + dryland workouts (7-day cooldown)
 */
export async function generateBothWorkouts(userId: number): Promise<WorkoutsResponse> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }
  const activityCount = await getUserSwimmingActivityCount(userId);
  if (activityCount < MIN_SWIMMING_ACTIVITIES_FOR_GENERATION) {
    throw new Error(`Servono almeno ${MIN_SWIMMING_ACTIVITIES_FOR_GENERATION} attività di nuoto sincronizzate per generare i workout AI.`);
  }

  // Check cooldown: find the most recent generation
  const latest = await db
    .select({ generatedAt: aiCoachWorkouts.generatedAt })
    .from(aiCoachWorkouts)
    .where(eq(aiCoachWorkouts.userId, userId))
    .orderBy(desc(aiCoachWorkouts.generatedAt))
    .limit(1);

  if (latest.length > 0) {
    const cooldownEnd = new Date(latest[0].generatedAt.getTime() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
    if (cooldownEnd > new Date()) {
      throw new Error(`Workout generation is on cooldown until ${cooldownEnd.toISOString()}`);
    }
  }

  // Generate both workouts in parallel
  const [poolWorkout, drylandWorkout] = await Promise.all([
    generateWorkout(userId, "pool"),
    generateWorkout(userId, "dryland"),
  ]);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000);

  // Save both
  logger.info(`[AI Coach] Starting persistence for user ${userId}`, { event: "ai_coach:persistence_start" });

  for (const { type, workout } of [
    { type: "pool" as const, workout: poolWorkout },
    { type: "dryland" as const, workout: drylandWorkout },
  ]) {
    try {
      // Manual upsert to avoid issues if unique constraint is missing
      const existing = await db
        .select({ id: aiCoachWorkouts.id })
        .from(aiCoachWorkouts)
        .where(
          and(
            eq(aiCoachWorkouts.userId, userId),
            eq(aiCoachWorkouts.workoutType, type)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(aiCoachWorkouts)
          .set({
            workoutData: JSON.stringify(workout),
            generatedAt: now,
            expiresAt,
          })
          .where(eq(aiCoachWorkouts.id, existing[0].id));

        logger.info(`[AI Coach] Updated existing workout for user ${userId} type ${type}`, {
          event: "ai_coach:workout_updated",
          userId,
          workoutType: type
        });
      } else {
        await db.insert(aiCoachWorkouts).values({
          userId,
          workoutType: type,
          workoutData: JSON.stringify(workout),
          expiresAt,
        });

        logger.info(`[AI Coach] Inserted new workout for user ${userId} type ${type}`, {
          event: "ai_coach:workout_inserted",
          userId,
          workoutType: type
        });
      }
    } catch (error: any) {
      const message = error.message || String(error);
      logger.error(`[AI Coach] Persistence failed for ${type}: ${message}`, {
        event: "ai_coach:persistence_error",
        userId,
        workoutType: type,
        error: message,
        code: error.code,
        detail: error.detail,
        hint: error.hint
      });
      throw error;
    }
  }


  const nextAvailableAt = new Date(now.getTime() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000);

  return {
    pool: poolWorkout,
    dryland: drylandWorkout,
    generatedAt: now.toISOString(),
    nextAvailableAt: nextAvailableAt.toISOString(),
    canGenerate: false,
    generationBlockedReason: null,
    minActivitiesRequired: MIN_SWIMMING_ACTIVITIES_FOR_GENERATION,
    activityCount,
  };
}

/**
 * Generate personalized workout using Gemini AI
 */
async function generateWorkout(
  userId: number,
  workoutType: "pool" | "dryland"
): Promise<GeneratedWorkout> {
  const context = `ai_coach:generateWorkout user=${userId} type=${workoutType}`;
  const fallback =
    (await getLatestCachedWorkout(userId, workoutType)) ??
    (workoutType === "pool"
      ? finalizePoolWorkout(buildDefaultWorkout("pool"), null).workout
      : buildDefaultWorkout(workoutType));

  return withErrorHandling(
    async () => {
      logger.info(`[AI Coach] Starting workout generation for user ${userId}`, {
        event: "ai_coach:generate_start",
        userId,
        workoutType,
      });

      if (!process.env.GEMINI_API_KEY) {
        throw new Error("Gemini not configured (missing GEMINI_API_KEY)");
      }

      const userStats = await fetchUserStats(userId);

      // Pool reps are checked against the athlete's zones (maximum rep, zone codes), fixed or
      // asked again once, and completed with level, target pace and the total.
      const workout =
        workoutType === "pool"
          ? await generateZonedPoolWorkout({
              prompt: buildPoolWorkoutPrompt(userStats),
              generate: generateText,
              zones: userStats.paceZones,
              fallback: createFallbackWorkout("pool"),
            })
          : parseWorkoutResponse(await generateText(buildDrylandWorkoutPrompt(userStats)), workoutType);

      logger.info(`[AI Coach] Workout generated successfully for user ${userId}`, {
        event: "ai_coach:generate_success",
        userId,
        workoutType,
        sections: workout.sections.length,
      });

      return workout;
    },
    fallback,
    context
  );
}

/** One Gemini answer, with the configured timeout. */
async function generateText(prompt: string): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = (await Promise.race([
      model.generateContent(prompt),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Gemini API timeout after ${config.GEMINI_API_TIMEOUT_MS}ms`)),
          config.GEMINI_API_TIMEOUT_MS
        );
      }),
    ])) as any;
    return result.response.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch comprehensive user statistics for workout generation
 */
async function fetchUserStats(userId: number): Promise<UserStatsForCoach> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  // Get swimmer profile
  const profileResult = await db
    .select()
    .from(swimmerProfiles)
    .where(eq(swimmerProfiles.userId, userId))
    .limit(1);

  if (profileResult.length === 0) {
    throw new Error("Swimmer profile not found");
  }

  const profile = profileResult[0];

  // Get recent activities (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentActivities = await db
    .select()
    .from(swimmingActivities)
    .where(
      and(
        eq(swimmingActivities.userId, userId),
        gte(swimmingActivities.activityDate, thirtyDaysAgo)
      )
    )
    .orderBy(desc(swimmingActivities.activityDate))
    .limit(20);

  // Calculate aggregate metrics
  const totalDistance = recentActivities.reduce(
    (sum, a) => sum + (a.distanceMeters || 0),
    0
  );
  const totalTime = recentActivities.reduce(
    (sum, a) => sum + (a.durationSeconds || 0),
    0
  );

  // Calculate average pace from activities that have pace data
  const activitiesWithPace = recentActivities.filter(a => a.avgPacePer100m && a.avgPacePer100m > 0);
  const avgPace = activitiesWithPace.length > 0
    ? activitiesWithPace.reduce((sum, a) => sum + (a.avgPacePer100m || 0), 0) / activitiesWithPace.length
    : 0; // seconds per 100m

  const avgSwolf =
    recentActivities.reduce((sum, a) => sum + (a.avgSwolf || 0), 0) /
    (recentActivities.length || 1);

  // The swim metrics shared with Statistics and the coach chat.
  const swimMetrics = await getSwimMetrics(userId).catch(() => null);
  const swimMetricsText = swimMetrics
    ? `${swimMetricsForCoach(swimMetrics)}\n\n${swimMetricsGlossary()}`
    : "Metriche di nuoto non disponibili in questo momento.";

  // HR zones analysis - only from activities with HR data (using hrZoneXSeconds)
  const activitiesWithHR = recentActivities.filter(a =>
    (a.hrZone1Seconds || 0) + (a.hrZone2Seconds || 0) + (a.hrZone3Seconds || 0) + (a.hrZone4Seconds || 0) + (a.hrZone5Seconds || 0) > 0
  );

  const hasHRData = activitiesWithHR.length > 0;

  // Calculate total seconds in each zone across all activities with HR data
  const zone1Total = activitiesWithHR.reduce((sum, a) => sum + (a.hrZone1Seconds || 0), 0);
  const zone2Total = activitiesWithHR.reduce((sum, a) => sum + (a.hrZone2Seconds || 0), 0);
  const zone3Total = activitiesWithHR.reduce((sum, a) => sum + (a.hrZone3Seconds || 0), 0);
  const zone4Total = activitiesWithHR.reduce((sum, a) => sum + (a.hrZone4Seconds || 0), 0);
  const zone5Total = activitiesWithHR.reduce((sum, a) => sum + (a.hrZone5Seconds || 0), 0);
  const totalHRSeconds = zone1Total + zone2Total + zone3Total + zone4Total + zone5Total;

  // Convert to percentages
  const avgHRZone1Pct = totalHRSeconds > 0 ? (zone1Total / totalHRSeconds) * 100 : 0;
  const avgHRZone2Pct = totalHRSeconds > 0 ? (zone2Total / totalHRSeconds) * 100 : 0;
  const avgHRZone3Pct = totalHRSeconds > 0 ? (zone3Total / totalHRSeconds) * 100 : 0;
  const avgHRZone4Pct = totalHRSeconds > 0 ? (zone4Total / totalHRSeconds) * 100 : 0;
  const avgHRZone5Pct = totalHRSeconds > 0 ? (zone5Total / totalHRSeconds) * 100 : 0;

  // Training frequency
  const sessionsPerWeek = (recentActivities.length / 30) * 7;

  return {
    profile: {
      aiSkillLabel: profile.aiSkillLabel ?? null,
      level: profile.level,
      totalXp: profile.totalXp,
      totalDistanceMeters: profile.totalDistanceMeters,
      totalSessions: profile.totalSessions,
    },
    recent: {
      activitiesCount: recentActivities.length,
      totalDistance,
      totalTime,
      avgPace: avgPace.toFixed(2),
      avgSwolf: avgSwolf.toFixed(1),
      sessionsPerWeek: sessionsPerWeek.toFixed(1),
    },
    swimMetricsText,
    paceZones: swimMetrics?.zones ?? null,
    hrZones: {
      hasData: hasHRData,
      activitiesWithHR: activitiesWithHR.length,
      zone1: avgHRZone1Pct.toFixed(1),
      zone2: avgHRZone2Pct.toFixed(1),
      zone3: avgHRZone3Pct.toFixed(1),
      zone4: avgHRZone4Pct.toFixed(1),
      zone5: avgHRZone5Pct.toFixed(1),
    },
    latestActivities: recentActivities.slice(0, 5).map((a) => ({
      date: a.activityDate,
      distance: a.distanceMeters,
      duration: a.durationSeconds,
      pace: a.avgPacePer100m ?? null,
      swolf: a.avgSwolf,
      strokes: a.avgStrokes ?? null,
      strokeRate: a.avgStrokeCadence ?? null,
    })),
  };
}

/**
 * Build prompt for pool workout generation
 */
export function buildPoolWorkoutPrompt(userStats: UserStatsForCoach): string {
  return `Sei un ALLENATORE OLIMPICO DI NUOTO con 20+ anni di esperienza nell'allenamento di atleti di livello mondiale. Genera un allenamento personalizzato IN VASCA completo e vario per un nuotatore basato sulle sue statistiche.

**STATISTICHE NUOTATORE:**
- Livello Coach: ${userStats.profile.aiSkillLabel ?? "n/d"}
- Livello XP: ${userStats.profile.level}
- Sessioni totali: ${userStats.profile.totalSessions}
- Distanza totale: ${(userStats.profile.totalDistanceMeters / 1000).toFixed(1)} km
- Ultimi 30 giorni: ${userStats.recent.activitiesCount} sessioni (${userStats.recent.sessionsPerWeek} a settimana)
- Distanza media: ${(userStats.recent.totalDistance / userStats.recent.activitiesCount).toFixed(0)}m per sessione
- Passo medio: ${userStats.recent.avgPace} sec/100m
- SWOLF medio: ${userStats.recent.avgSwolf}

**METRICHE DI NUOTO:**
${userStats.swimMetricsText}

**USO DELLE METRICHE:**
${SWIM_METRICS_COACH_RULES}

**ZONE DI PASSO A1–C3 (OBBLIGATORIO):**
${PACE_ZONE_COACH_RULES}
- in "zone" metti solo il codice (A1, A2, B1, B2, C1, C2, C3) e in "intensity" il livello della zona; il server controlla la ripetuta massima e aggiunge il passo dalle zone dell'atleta;
- nelle "notes" di ogni serie con una zona, o nei "coachNotes", spiega ogni zona usata in una riga: sensazione, passo e a cosa serve.

**ZONE FREQUENZA CARDIACA:**
${userStats.hrZones.hasData ? `- Zona 1 (Recupero): ${userStats.hrZones.zone1}%
- Zona 2 (Aerobica): ${userStats.hrZones.zone2}%
- Zona 3 (Soglia): ${userStats.hrZones.zone3}%
- Zona 4 (Anaerobica): ${userStats.hrZones.zone4}%
- Zona 5 (Massimale): ${userStats.hrZones.zone5}%
- Dati disponibili da ${userStats.hrZones.activitiesWithHR} attività` : '- Dati HR non disponibili (il nuotatore dovrebbe monitorare HR nelle prossime sessioni)'}

**ISTRUZIONI FONDAMENTALI:**

1. **STRUTTURA ALLENAMENTO** (4 fasi obbligatorie):
   - **Riscaldamento** (400-600m): Nuoto facile, mobilità articolare
   - **Attivazione** (200-400m): Esercizi tecnici, drill, progressivi
   - **Allenamento Principale** (1500-2500m): Serie intensive con obiettivi specifici
   - **Defaticamento** (200-400m): Nuoto lento, stretching in acqua

2. **VARIETÀ DI STILI** (OBBLIGATORIO):
   - Includi ALMENO 3 stili diversi nell'allenamento: Stile Libero, Dorso, Rana, Farfalla
   - Usa serie miste (es. "4x100 misti", "200 stile + 100 dorso")
   - Varia gli stili nelle diverse fasi (riscaldamento, attivazione, principale)
   - Focus principale su Stile Libero, ma integra altri stili per completezza

3. **ANALISI METRICHE**:
   - Se una metrica non è disponibile: NON menzionarlo negativamente, concentrati su tecnica di base e costruzione dei fondamentali
   - Efficienza della bracciata e regolarità nelle ripetute: usale per scegliere gli esercizi tecnici
   - Bilancia volume e intensità con l'equilibrio tra forma e fatica e con la distribuzione dell'intensità${userStats.hrZones.hasData ? ' (e le zone HR)' : ''}

4. **TEMPI DI RIPARTENZA** (OBBLIGATORIO):
   - Per ogni serie con ripetizioni (es. 4x100), specifica SEMPRE il tempo di ripartenza
   - Formato: "a 1:50", "a 1:20", "a 0:50"
   - Calcolo: se ci sono le zone, imposta il passo delle serie con i passi delle zone A1–C3 in m:ss/100 m del blocco ZONE DI PASSO (valgono per lo stile libero) e aggiungi il recupero; altrimenti passo medio (${userStats.recent.avgPace} sec/100m) + 10-20 sec (tecnica) o + 5-10 sec (resistenza)

5. **ATTREZZI** (usa frequentemente):
   - **Pinne**: Propulsione, tecnica gambe (specialmente venerdì)
   - **Palette**: Forza, presa acqua
   - **Pull buoy**: Isolamento braccia, posizione
   - **Tavoletta**: Gambe, tecnica

6. **NOTE TECNICHE**: Fornisci indicazioni dettagliate per ogni serie (focus, respirazione, ritmo)

7. **LIVELLO**: Allenamento sfidante ma adatto al nuotatore

**FORMATO RICHIESTO (JSON):**
{
  "type": "pool",
  "title": "Titolo allenamento breve e specifico",
  "description": "Descrizione obiettivo principale (1-2 frasi)",
  "duration": "60-90 minuti",
  "difficulty": "Intermedio/Avanzato/Elite",
  "sections": [
    {
      "title": "Riscaldamento",
      "exercises": [
        {
          "name": "400 stile libero sciolto",
          "repeats": 1,
          "repMeters": 400,
          "distance": "400m",
          "stroke": "stile libero",
          "zone": "A1",
          "intensity": "Facile",
          "notes": "A1: respiro tranquillo, potresti parlare; scalda e prepara alla serie"
        }
      ]
    },
    {
      "title": "Serie Principale 1: Soglia",
      "exercises": [
        {
          "name": "6x100 stile libero",
          "repeats": 6,
          "repMeters": 100,
          "sets": "6x",
          "distance": "100m",
          "stroke": "stile libero",
          "zone": "B2",
          "intensity": "Soglia",
          "rest": "a 2:10" (tempo di ripartenza basato sul passo della zona),
          "equipment": "Palette" (opzionale: Pinne, Palette, Pull buoy, Tavoletta),
          "notes": "B2: respiro impegnato, poche parole tra una vasca e l'altra, al passo della zona; alza la soglia"
        }
      ],
      "notes": "Obiettivo della serie"
    },
    {
      "title": "Serie Principale 2: Velocità",
      "exercises": [
        {
          "name": "8x25 sprint",
          "repeats": 8,
          "repMeters": 25,
          "sets": "8x",
          "distance": "25m",
          "stroke": "stile libero",
          "zone": "C3",
          "intensity": "Sopra soglia",
          "rest": "a 0:45" (tempo di ripartenza),
          "equipment": "Pinne" (se venerdì),
          "notes": "C3: a tutta, pochissimi respiri; velocità pura (mai oltre 25 m)"
        }
      ]
    },
    {
      "title": "Defaticamento",
      "exercises": [
        {
          "name": "200 misti facili",
          "repeats": 1,
          "repMeters": 200,
          "distance": "200m",
          "stroke": "misti",
          "zone": "A1",
          "intensity": "Facile",
          "notes": "Recupero attivo"
        }
      ]
    }
  ],
  "coachNotes": [
    "Le zone di oggi: una riga per ogni zona usata (sensazione, passo, a cosa serve)",
    "Nota importante basata sulle metriche",
    "Nota importante su aspetto da migliorare"
  ]
}

In ogni esercizio in vasca "repeats" (numero di ripetute) e "repMeters" (metri di ciascuna) sono numeri; "stroke" è uno tra: stile libero, dorso, rana, farfalla, misti, tecnica, gambe. Non scrivere il totale dei metri: lo calcola il server.

Rispondi SOLO con il JSON valido, senza testo aggiuntivo.`;
}

/**
 * Build prompt for dryland workout generation
 */
export function buildDrylandWorkoutPrompt(userStats: UserStatsForCoach): string {
  return `Sei un allenatore olimpico di nuoto e preparatore atletico esperto. Genera un allenamento FUORI VASCA (dryland) personalizzato per un nuotatore basato sulle sue statistiche.

**STATISTICHE NUOTATORE:**
- Livello Coach: ${userStats.profile.aiSkillLabel ?? "n/d"}
- Livello XP: ${userStats.profile.level}
- Sessioni totali: ${userStats.profile.totalSessions}
- Frequenza allenamento: ${userStats.recent.sessionsPerWeek} sessioni/settimana
- Passo medio: ${userStats.recent.avgPace} sec/100m
- SWOLF medio: ${userStats.recent.avgSwolf}

**METRICHE DI NUOTO:**
${userStats.swimMetricsText}

**USO DELLE METRICHE:**
${SWIM_METRICS_COACH_RULES}

**ZONE FREQUENZA CARDIACA:**
${userStats.hrZones.hasData ? `- Zona 1-2 (Aerobica): ${(parseFloat(userStats.hrZones.zone1) + parseFloat(userStats.hrZones.zone2)).toFixed(1)}%
- Zona 3-5 (Alta intensità): ${(parseFloat(userStats.hrZones.zone3) + parseFloat(userStats.hrZones.zone4) + parseFloat(userStats.hrZones.zone5)).toFixed(1)}%
- Dati disponibili da ${userStats.hrZones.activitiesWithHR} attività` : '- Dati HR non disponibili (il nuotatore dovrebbe monitorare HR nelle prossime sessioni)'}

**ISTRUZIONI:**
1. Analizza le metriche per identificare aree da rafforzare
2. Crea allenamento con: Riscaldamento → Forza → Core → Mobilità/Stretching
3. Includi esercizi specifici per nuotatori (spalle, core, gambe, mobilità)
4. Considera l'equilibrio tra forma e fatica per dosare volume e intensità
5. Bilancia forza, potenza, resistenza, mobilità
6. Fornisci varianti per diversi livelli di fitness

**TIPI DI ESERCIZI DA INCLUDERE:**
- Forza spalle: pull-up, lat pulldown, face pull, rotazioni cuffia
- Core: plank, russian twist, dead bug, hollow body
- Gambe: squat, affondi, box jump, single leg work
- Potenza: medicine ball throw, plyometrics
- Mobilità: shoulder dislocations, thoracic rotation, hip mobility
- Cardio: burpees, mountain climbers, jump rope

**FORMATO RICHIESTO (JSON):**
{
  "type": "dryland",
  "title": "Titolo allenamento breve e specifico",
  "description": "Descrizione obiettivo principale (1-2 frasi)",
  "duration": "45-60 minuti",
  "difficulty": "Intermedio/Avanzato/Elite",
  "sections": [
    {
      "title": "Riscaldamento Dinamico",
      "exercises": [
        {
          "name": "Nome esercizio",
          "duration": "5 minuti",
          "notes": "Descrizione esecuzione"
        }
      ]
    },
    {
      "title": "Forza Parte Superiore",
      "exercises": [
        {
          "name": "Pull-up",
          "sets": "4x",
          "reps": "8-10",
          "rest": "90 sec",
          "notes": "Variante: assisted se necessario"
        }
      ],
      "notes": "Focus su controllo e range completo"
    },
    {
      "title": "Core Stability",
      "exercises": [
        {
          "name": "Plank",
          "sets": "3x",
          "duration": "45 sec",
          "rest": "30 sec",
          "notes": "Mantenere linea neutra"
        }
      ]
    },
    {
      "title": "Mobilità e Stretching",
      "exercises": [
        {
          "name": "Shoulder dislocations",
          "sets": "2x",
          "reps": "15",
          "notes": "Con elastico o bastone"
        }
      ]
    }
  ],
  "coachNotes": [
    "Nota importante 1 su area da rafforzare",
    "Nota importante 2 su prevenzione infortuni",
    "Nota importante 3 su progressione"
  ]
}

Rispondi SOLO con il JSON valido, senza testo aggiuntivo.`;
}

/**
 * Parse Gemini response into structured workout
 */
function parseWorkoutResponse(
  text: string,
  workoutType: "pool" | "dryland"
): GeneratedWorkout {
  const workout = parseWorkoutJson(text);
  if (workout) return workout;
  logger.warn("Failed to parse workout response", {
    event: "ai_coach:parse_failed",
    // Keep logs bounded; raw model output can be large and may contain junk.
    rawPreview: typeof text === "string" ? text.slice(0, 800) : undefined,
  });
  return createFallbackWorkout(workoutType);
}

/**
 * Create fallback workout if AI generation fails
 */
function createFallbackWorkout(workoutType: "pool" | "dryland"): GeneratedWorkout {
  if (workoutType === "pool") {
    return {
      type: "pool",
      title: "Allenamento Tecnico Base",
      description: "Allenamento equilibrato per migliorare tecnica e resistenza",
      duration: "60 minuti",
      difficulty: "Intermedio",
      sections: [
        {
          title: "Riscaldamento",
          exercises: [
            {
              name: "Nuoto libero facile",
              distance: "400m",
              intensity: "Facile",
              zone: "A1",
              stroke: "stile libero",
              notes: "Focus sulla respirazione e rilassamento",
            },
          ],
        },
        {
          title: "Serie Tecnica",
          exercises: [
            {
              name: "Drill bracciata",
              sets: "4x",
              distance: "100m",
              rest: "20 sec",
              intensity: "Aerobico",
              zone: "A2",
              stroke: "tecnica",
              notes: "Concentrati sulla fase di presa e trazione",
            },
          ],
        },
        {
          title: "Serie Principale",
          exercises: [
            {
              name: "Intervalli a stile libero",
              sets: "6x",
              distance: "100m",
              rest: "30 sec",
              intensity: "Medio",
              zone: "B1",
              stroke: "stile libero",
              notes: "Mantieni ritmo costante",
            },
          ],
        },
        {
          title: "Defaticamento",
          exercises: [
            {
              name: "Nuoto facile",
              distance: "200m",
              intensity: "Facile",
              zone: "A1",
              stroke: "stile libero",
              notes: "Recupero attivo",
            },
          ],
        },
      ],
      coachNotes: [
        "Mantieni una buona tecnica anche quando sei stanco",
        "Idratati regolarmente durante l'allenamento",
        "Ascolta il tuo corpo e adatta l'intensità se necessario",
      ],
    };
  } else {
    return {
      type: "dryland",
      title: "Allenamento Forza e Core",
      description: "Rafforzamento muscolare specifico per nuotatori",
      duration: "45 minuti",
      difficulty: "Intermedio",
      sections: [
        {
          title: "Riscaldamento",
          exercises: [
            {
              name: "Cardio leggero e mobilità",
              duration: "5 minuti",
              notes: "Jumping jacks, arm circles, leg swings",
            },
          ],
        },
        {
          title: "Forza Superiore",
          exercises: [
            {
              name: "Push-up",
              sets: "3x",
              reps: "12-15",
              rest: "60 sec",
              notes: "Mantieni core attivo",
            },
            {
              name: "Lat pulldown",
              sets: "3x",
              reps: "10-12",
              rest: "60 sec",
              notes: "Simula movimento bracciata",
            },
          ],
        },
        {
          title: "Core",
          exercises: [
            {
              name: "Plank",
              sets: "3x",
              duration: "45 sec",
              rest: "30 sec",
              notes: "Linea neutra dalla testa ai piedi",
            },
          ],
        },
        {
          title: "Stretching",
          exercises: [
            {
              name: "Stretching completo",
              duration: "10 minuti",
              notes: "Focus su spalle, schiena, anche",
            },
          ],
        },
      ],
      coachNotes: [
        "Esegui ogni esercizio con controllo e forma corretta",
        "Aumenta gradualmente peso e ripetizioni",
        "Il core forte migliora la posizione in acqua",
      ],
    };
  }
}
