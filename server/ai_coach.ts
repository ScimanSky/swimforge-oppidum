/**
 * AI Coach Module
 * Generates personalized swimming workouts (pool and dryland) using Google Gemini AI
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { getDb } from "./db";
import { aiCoachWorkouts } from "../drizzle/schema";
import { eq, and, gt } from "drizzle-orm";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

interface WorkoutSection {
  title: string;
  exercises: WorkoutExercise[];
  notes?: string;
}

interface WorkoutExercise {
  name: string;
  sets?: string;
  reps?: string;
  distance?: string;
  duration?: string;
  rest?: string;
  intensity?: string;
  notes?: string;
}

export interface GeneratedWorkout {
  type: "pool" | "dryland";
  title: string;
  description: string;
  duration: string;
  difficulty: string;
  sections: WorkoutSection[];
  coachNotes: string[];
}

/**
 * Get cached workout or generate new one
 */
export async function getOrGenerateWorkout(
  userId: number,
  workoutType: "pool" | "dryland",
  forceRegenerate: boolean = false
): Promise<GeneratedWorkout> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  // Check cache first (unless force regenerate)
  if (!forceRegenerate) {
    const cached = await db
      .select()
      .from(aiCoachWorkouts)
      .where(
        and(
          eq(aiCoachWorkouts.userId, userId),
          eq(aiCoachWorkouts.workoutType, workoutType),
          gt(aiCoachWorkouts.expiresAt, new Date())
        )
      )
      .limit(1);

    if (cached.length > 0) {
      return JSON.parse(cached[0].workoutData);
    }
  }

  // Generate new workout
  const workout = await generateWorkout(userId, workoutType);

  // Cache the workout (24 hour expiration)
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  await db
    .insert(aiCoachWorkouts)
    .values({
      userId,
      workoutType,
      workoutData: JSON.stringify(workout),
      expiresAt,
    })
    .onConflictDoUpdate({
      target: [aiCoachWorkouts.userId, aiCoachWorkouts.workoutType],
      set: {
        workoutData: JSON.stringify(workout),
        generatedAt: new Date(),
        expiresAt,
      },
    });

  return workout;
}

/**
 * Generate personalized workout using Gemini AI
 */
async function generateWorkout(
  userId: number,
  workoutType: "pool" | "dryland"
): Promise<GeneratedWorkout> {
  // Fetch user statistics
  const userStats = await fetchUserStats(userId);

  // Build prompt based on workout type
  const prompt =
    workoutType === "pool"
      ? buildPoolWorkoutPrompt(userStats)
      : buildDrylandWorkoutPrompt(userStats);

  // Call Gemini API
  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response.text();

  // Parse the response
  const workout = parseWorkoutResponse(text, workoutType);

  return workout;
}

/**
 * Fetch comprehensive user statistics for workout generation
 */
async function fetchUserStats(userId: number): Promise<any> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  // Get swimmer profile
  const profile = await db.query.swimmerProfiles.findFirst({
    where: (profiles, { eq }) => eq(profiles.userId, userId),
  });

  if (!profile) {
    throw new Error("Swimmer profile not found");
  }

  // Get recent activities (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentActivities = await db.query.swimmingActivities.findMany({
    where: (activities, { eq, and, gte }) =>
      and(
        eq(activities.userId, userId),
        gte(activities.activityDate, thirtyDaysAgo)
      ),
    orderBy: (activities, { desc }) => [desc(activities.activityDate)],
    limit: 20,
  });

  // Calculate aggregate metrics
  const totalDistance = recentActivities.reduce(
    (sum, a) => sum + (a.distanceMeters || 0),
    0
  );
  const totalTime = recentActivities.reduce(
    (sum, a) => sum + (a.durationSeconds || 0),
    0
  );
  const avgPace =
    totalDistance > 0 ? (totalTime / totalDistance) * 100 : 0; // seconds per 100m
  const avgSwolf =
    recentActivities.reduce((sum, a) => sum + (a.avgSwolf || 0), 0) /
    (recentActivities.length || 1);

  // Calculate advanced metrics averages
  const avgSEI =
    recentActivities.reduce(
      (sum, a) => sum + (a.strokeEfficiencyIndex || 0),
      0
    ) / (recentActivities.length || 1);
  const avgTCI =
    recentActivities.reduce(
      (sum, a) => sum + (a.technicalConsistencyIndex || 0),
      0
    ) / (recentActivities.length || 1);
  const avgSER =
    recentActivities.reduce(
      (sum, a) => sum + (a.strokeEfficiencyRatio || 0),
      0
    ) / (recentActivities.length || 1);
  const avgACS =
    recentActivities.reduce(
      (sum, a) => sum + (a.aerobicCapacityScore || 0),
      0
    ) / (recentActivities.length || 1);
  const avgRRS =
    recentActivities.reduce(
      (sum, a) => sum + (a.recoveryReadinessScore || 0),
      0
    ) / (recentActivities.length || 1);
  const avgPOI =
    recentActivities.reduce(
      (sum, a) => sum + (a.performanceOptimizationIndex || 0),
      0
    ) / (recentActivities.length || 1);

  // HR zones analysis
  const avgHRZone1Pct =
    recentActivities.reduce((sum, a) => sum + (a.hrZone1Pct || 0), 0) /
    (recentActivities.length || 1);
  const avgHRZone2Pct =
    recentActivities.reduce((sum, a) => sum + (a.hrZone2Pct || 0), 0) /
    (recentActivities.length || 1);
  const avgHRZone3Pct =
    recentActivities.reduce((sum, a) => sum + (a.hrZone3Pct || 0), 0) /
    (recentActivities.length || 1);
  const avgHRZone4Pct =
    recentActivities.reduce((sum, a) => sum + (a.hrZone4Pct || 0), 0) /
    (recentActivities.length || 1);
  const avgHRZone5Pct =
    recentActivities.reduce((sum, a) => sum + (a.hrZone5Pct || 0), 0) /
    (recentActivities.length || 1);

  // Training frequency
  const sessionsPerWeek = (recentActivities.length / 30) * 7;

  return {
    profile: {
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
    advancedMetrics: {
      sei: avgSEI.toFixed(2),
      tci: avgTCI.toFixed(2),
      ser: avgSER.toFixed(2),
      acs: avgACS.toFixed(2),
      rrs: avgRRS.toFixed(2),
      poi: avgPOI.toFixed(2),
    },
    hrZones: {
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
      pace: a.avgPacePerHundredMeters,
      swolf: a.avgSwolf,
      strokes: a.avgStrokesPerLength,
      strokeRate: a.avgStrokeRate,
    })),
  };
}

/**
 * Build prompt for pool workout generation
 */
function buildPoolWorkoutPrompt(userStats: any): string {
  return `Sei un allenatore olimpico di nuoto esperto. Genera un allenamento personalizzato IN VASCA per un nuotatore basato sulle sue statistiche.

**STATISTICHE NUOTATORE:**
- Livello: ${userStats.profile.level}
- Sessioni totali: ${userStats.profile.totalSessions}
- Distanza totale: ${(userStats.profile.totalDistanceMeters / 1000).toFixed(1)} km
- Ultimi 30 giorni: ${userStats.recent.activitiesCount} sessioni (${userStats.recent.sessionsPerWeek} a settimana)
- Distanza media: ${(userStats.recent.totalDistance / userStats.recent.activitiesCount).toFixed(0)}m per sessione
- Passo medio: ${userStats.recent.avgPace} sec/100m
- SWOLF medio: ${userStats.recent.avgSwolf}

**METRICHE AVANZATE:**
- SEI (Stroke Efficiency Index): ${userStats.advancedMetrics.sei} - Efficienza bracciata
- TCI (Technical Consistency Index): ${userStats.advancedMetrics.tci} - Consistenza tecnica
- SER (Stroke Efficiency Ratio): ${userStats.advancedMetrics.ser} - Rapporto efficienza
- ACS (Aerobic Capacity Score): ${userStats.advancedMetrics.acs} - Capacità aerobica
- RRS (Recovery Readiness Score): ${userStats.advancedMetrics.rrs} - Prontezza al recupero
- POI (Performance Optimization Index): ${userStats.advancedMetrics.poi} - Ottimizzazione performance

**ZONE FREQUENZA CARDIACA (% tempo):**
- Zona 1 (Recupero): ${userStats.hrZones.zone1}%
- Zona 2 (Aerobica): ${userStats.hrZones.zone2}%
- Zona 3 (Soglia): ${userStats.hrZones.zone3}%
- Zona 4 (Anaerobica): ${userStats.hrZones.zone4}%
- Zona 5 (Massimale): ${userStats.hrZones.zone5}%

**ISTRUZIONI:**
1. Analizza TUTTE le metriche per identificare punti di forza e debolezza
2. Crea un allenamento strutturato: Riscaldamento → Serie Principali → Defaticamento
3. Includi esercizi tecnici specifici basati su SEI, TCI, SER
4. Bilancia intensità basandoti su ACS, RRS, zone HR
5. Fornisci note tecniche dettagliate per ogni serie
6. L'allenamento deve essere sfidante ma adatto al livello del nuotatore

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
          "name": "Nome esercizio",
          "distance": "400m",
          "intensity": "Facile",
          "notes": "Note tecniche specifiche"
        }
      ]
    },
    {
      "title": "Serie Principale 1: Tecnica",
      "exercises": [
        {
          "name": "Esercizio tecnico",
          "sets": "4x",
          "distance": "100m",
          "rest": "20 sec",
          "intensity": "Moderata",
          "notes": "Focus su aspetto tecnico specifico"
        }
      ],
      "notes": "Obiettivo della serie"
    },
    {
      "title": "Serie Principale 2: Velocità/Resistenza",
      "exercises": [
        {
          "name": "Serie principale",
          "sets": "8x",
          "distance": "50m",
          "rest": "15 sec",
          "intensity": "Alta - Zona 4",
          "notes": "Mantenere ritmo costante"
        }
      ]
    },
    {
      "title": "Defaticamento",
      "exercises": [
        {
          "name": "Nuoto facile",
          "distance": "200m",
          "intensity": "Molto facile",
          "notes": "Recupero attivo"
        }
      ]
    }
  ],
  "coachNotes": [
    "Nota importante 1 basata sulle metriche",
    "Nota importante 2 su aspetto da migliorare",
    "Nota importante 3 su punti di forza da sfruttare"
  ]
}

Rispondi SOLO con il JSON valido, senza testo aggiuntivo.`;
}

/**
 * Build prompt for dryland workout generation
 */
function buildDrylandWorkoutPrompt(userStats: any): string {
  return `Sei un allenatore olimpico di nuoto e preparatore atletico esperto. Genera un allenamento FUORI VASCA (dryland) personalizzato per un nuotatore basato sulle sue statistiche.

**STATISTICHE NUOTATORE:**
- Livello: ${userStats.profile.level}
- Sessioni totali: ${userStats.profile.totalSessions}
- Frequenza allenamento: ${userStats.recent.sessionsPerWeek} sessioni/settimana
- Passo medio: ${userStats.recent.avgPace} sec/100m
- SWOLF medio: ${userStats.recent.avgSwolf}

**METRICHE AVANZATE:**
- SEI (Stroke Efficiency Index): ${userStats.advancedMetrics.sei} - Efficienza bracciata
- TCI (Technical Consistency Index): ${userStats.advancedMetrics.tci} - Consistenza tecnica
- SER (Stroke Efficiency Ratio): ${userStats.advancedMetrics.ser} - Rapporto efficienza
- ACS (Aerobic Capacity Score): ${userStats.advancedMetrics.acs} - Capacità aerobica
- RRS (Recovery Readiness Score): ${userStats.advancedMetrics.rrs} - Prontezza al recupero
- POI (Performance Optimization Index): ${userStats.advancedMetrics.poi} - Ottimizzazione performance

**ZONE FREQUENZA CARDIACA (% tempo):**
- Zona 1-2 (Aerobica): ${(parseFloat(userStats.hrZones.zone1) + parseFloat(userStats.hrZones.zone2)).toFixed(1)}%
- Zona 3-5 (Alta intensità): ${(parseFloat(userStats.hrZones.zone3) + parseFloat(userStats.hrZones.zone4) + parseFloat(userStats.hrZones.zone5)).toFixed(1)}%

**ISTRUZIONI:**
1. Analizza le metriche per identificare aree da rafforzare
2. Crea allenamento con: Riscaldamento → Forza → Core → Mobilità/Stretching
3. Includi esercizi specifici per nuotatori (spalle, core, gambe, mobilità)
4. Considera RRS per dosare volume e intensità
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
  try {
    // Remove markdown code blocks if present
    let cleanText = text.trim();
    if (cleanText.startsWith("```json")) {
      cleanText = cleanText.replace(/```json\n?/g, "").replace(/```\n?/g, "");
    } else if (cleanText.startsWith("```")) {
      cleanText = cleanText.replace(/```\n?/g, "");
    }

    // Parse JSON
    const workout = JSON.parse(cleanText);

    // Validate structure
    if (!workout.title || !workout.sections || !Array.isArray(workout.sections)) {
      throw new Error("Invalid workout structure");
    }

    return workout;
  } catch (error) {
    console.error("Failed to parse workout response:", error);
    console.error("Raw response:", text);

    // Return fallback workout
    return createFallbackWorkout(workoutType);
  }
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
              intensity: "Moderata",
              notes: "Concentrati sulla fase di presa e trazione",
            },
          ],
        },
        {
          title: "Serie Principale",
          exercises: [
            {
              name: "Intervalli misti",
              sets: "6x",
              distance: "100m",
              rest: "30 sec",
              intensity: "Moderata-Alta",
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
              intensity: "Molto facile",
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
