/**
 * AI Coach Module
 * Generates personalized swimming workouts (pool and dryland) using Google Gemini AI
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { getDb } from "./db";
import { aiCoachWorkouts } from "../drizzle/schema";
import { eq, and, gt } from "drizzle-orm";
import { 
  calculateSEI, 
  calculateTCI, 
  calculateSER, 
  calculateACS, 
  calculateRRS 
} from "./advanced_metrics";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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
  try {
    console.log(`[AI Coach] Starting workout generation for user ${userId}, type: ${workoutType}`);
    
    // Fetch user statistics
    console.log(`[AI Coach] Fetching user stats for user ${userId}`);
    const userStats = await fetchUserStats(userId);
    console.log(`[AI Coach] User stats fetched successfully`);

    // Build prompt based on workout type
    const prompt =
      workoutType === "pool"
        ? buildPoolWorkoutPrompt(userStats)
        : buildDrylandWorkoutPrompt(userStats);
    console.log(`[AI Coach] Prompt built, length: ${prompt.length} chars`);

    // Call Gemini API with timeout
    console.log(`[AI Coach] Calling Gemini API...`);
    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Gemini API timeout after 60s')), 60000)
      )
    ]) as any;
    
    const response = result.response;
    const text = response.text();
    console.log(`[AI Coach] Gemini response received, length: ${text.length} chars`);

    // Parse the response
    console.log(`[AI Coach] Parsing workout response...`);
    const workout = parseWorkoutResponse(text, workoutType);
    console.log(`[AI Coach] Workout generated successfully with ${workout.sections.length} sections`);

    return workout;
  } catch (error) {
    console.error(`[AI Coach] Error generating workout for user ${userId}:`, error);
    throw error;
  }
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
  const { swimmerProfiles, swimmingActivities } = await import("../drizzle/schema");
  const { eq, and, gte, desc } = await import("drizzle-orm");
  
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
  const activitiesWithPace = recentActivities.filter(a => a.avgPacePerHundredMeters && a.avgPacePerHundredMeters > 0);
  const avgPace = activitiesWithPace.length > 0
    ? activitiesWithPace.reduce((sum, a) => sum + (a.avgPacePerHundredMeters || 0), 0) / activitiesWithPace.length
    : 0; // seconds per 100m
    
  const avgSwolf =
    recentActivities.reduce((sum, a) => sum + (a.avgSwolf || 0), 0) /
    (recentActivities.length || 1);

  // Calculate advanced metrics using same functions as Statistics
  // SEI: Average across all activities
  const seiScores = recentActivities
    .map(a => calculateSEI(a))
    .filter((s): s is number => s !== null);
  const avgSEI = seiScores.length > 0
    ? Math.round(seiScores.reduce((sum, s) => sum + s, 0) / seiScores.length)
    : 0;

  // TCI: Consistency across activities
  const avgTCI = calculateTCI(recentActivities) || 0;

  // SER: Average across all activities
  const serScores = recentActivities
    .map(a => calculateSER(a))
    .filter((s): s is number => s !== null);
  const avgSER = serScores.length > 0
    ? Math.round(serScores.reduce((sum, s) => sum + s, 0) / serScores.length)
    : 0;

  // ACS: Average across all activities
  const acsScores = recentActivities
    .map(a => calculateACS(a))
    .filter((s): s is number => s !== null);
  const avgACS = acsScores.length > 0
    ? Math.round(acsScores.reduce((sum, s) => sum + s, 0) / acsScores.length)
    : 0;

  // RRS: Average across all activities
  const rrsScores = recentActivities
    .map(a => calculateRRS(a))
    .filter((s): s is number => s !== null);
  const avgRRS = rrsScores.length > 0
    ? Math.round(rrsScores.reduce((sum, s) => sum + s, 0) / rrsScores.length)
    : 0;

  // POI: Simplified (would need previous period for proper calculation)
  const avgPOI = 0;

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
      sei: avgSEI,
      tci: avgTCI,
      ser: avgSER,
      acs: avgACS,
      rrs: avgRRS,
      poi: avgPOI,
    },
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
  return `Sei un ALLENATORE OLIMPICO DI NUOTO con 20+ anni di esperienza nell'allenamento di atleti di livello mondiale. Genera un allenamento personalizzato IN VASCA completo e vario per un nuotatore basato sulle sue statistiche.

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
   - Se SEI, TCI, SER sono 0 o bassi: NON menzionare negativamente, concentrati su tecnica base e costruzione fondamentali
   - Se metriche > 0: Usa per personalizzare esercizi tecnici specifici
   - Bilancia intensità basandoti su ACS, RRS${userStats.hrZones.hasData ? ', zone HR' : ''}

4. **TEMPI DI RIPARTENZA** (OBBLIGATORIO):
   - Per ogni serie con ripetizioni (es. 4x100), specifica SEMPRE il tempo di ripartenza
   - Formato: "a 1:50", "a 1:20", "a 0:50"
   - Calcolo: Passo medio (${userStats.recent.avgPace} sec/100m) + 10-20 sec (tecnica) o + 5-10 sec (resistenza)

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
          "rest": "a 1:50" (tempo di ripartenza basato sul passo),
          "intensity": "Moderata",
          "equipment": "Palette" (opzionale: Pinne, Palette, Pull buoy, Tavoletta),
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
          "rest": "a 0:50" (tempo di ripartenza),
          "intensity": "Alta - Zona 4",
          "equipment": "Pinne" (se venerdì),
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

**ZONE FREQUENZA CARDIACA:**
${userStats.hrZones.hasData ? `- Zona 1-2 (Aerobica): ${(parseFloat(userStats.hrZones.zone1) + parseFloat(userStats.hrZones.zone2)).toFixed(1)}%
- Zona 3-5 (Alta intensità): ${(parseFloat(userStats.hrZones.zone3) + parseFloat(userStats.hrZones.zone4) + parseFloat(userStats.hrZones.zone5)).toFixed(1)}%
- Dati disponibili da ${userStats.hrZones.activitiesWithHR} attività` : '- Dati HR non disponibili (il nuotatore dovrebbe monitorare HR nelle prossime sessioni)'}

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
    
    // More robust markdown block removal
    const jsonMatch = cleanText.match(/```json\s*([\s\S]*?)\s*```/) || 
                      cleanText.match(/```\s*([\s\S]*?)\s*```/);
    
    if (jsonMatch) {
      cleanText = jsonMatch[1];
    } else {
      // Fallback: strip any backticks and common text before/after
      cleanText = cleanText.replace(/```json/g, "")
                          .replace(/```/g, "")
                          .trim();
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
