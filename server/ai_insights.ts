import { GoogleGenerativeAI } from "@google/generative-ai";
import { getDb } from "./db";
import { aiInsightsCache } from "../drizzle/schema";
import { eq, and, gt } from "drizzle-orm";

// Initialize Gemini AI
let genAI: GoogleGenerativeAI | null = null;

function getGeminiClient() {
  if (!genAI && process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
}

export interface UserStatsData {
  level: number;
  totalXp: number;
  currentStreak: number;
  recordStreak: number;
  avgPaceSeconds: number;
  totalDistanceMeters: number;
  sessions: number;
  hrZones?: {
    zone1: number;
    zone2: number;
    zone3: number;
    zone4: number;
    zone5: number;
  };
  trend: "up" | "down" | "stable";
  trendPercentage: number;
  performanceIndex: number;
  consistencyScore: number;
  periodDays: number;
  swolfAvg?: number;
  caloriesTotal?: number;
}

export async function generateAIInsights(
  userData: UserStatsData,
  userId: number
): Promise<string[]> {
  const db = await getDb();
  if (!db) {
    return [];
  }

  // Check cache first
  const cached = await db
    .select()
    .from(aiInsightsCache)
    .where(
      and(
        eq(aiInsightsCache.userId, userId),
        eq(aiInsightsCache.periodDays, userData.periodDays),
        gt(aiInsightsCache.expiresAt, new Date())
      )
    )
    .limit(1);

  if (cached.length > 0 && cached[0].insights.length > 0) {
    console.log(`[AI Insights] Using cached insights for user ${userId}`);
    return cached[0].insights;
  }

  const client = getGeminiClient();
  
  // Return empty array if no API key (no fallback)
  if (!client) {
    console.warn("[AI Insights] No Gemini API key configured");
    return [];
  }

  try {
    const model = client.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `Sei un coach di nuoto esperto e motivazionale. Analizza questi dati di un nuotatore e genera 3-4 insights personalizzati, motivazionali e actionable in italiano.

Dati nuotatore (ultimi ${userData.periodDays} giorni):
- Livello: ${userData.level}
- XP Totali: ${userData.totalXp}
- Streak attuale: ${userData.currentStreak} giorni (record: ${userData.recordStreak})
- Distanza totale: ${(userData.totalDistanceMeters / 1000).toFixed(1)} km
- Sessioni: ${userData.sessions}
- Pace medio: ${formatPace(userData.avgPaceSeconds)}/100m
- Trend: ${userData.trend === "up" ? "crescita" : userData.trend === "down" ? "calo" : "stabile"} ${userData.trendPercentage}%
- Performance Index: ${userData.performanceIndex}/100
- Consistency Score: ${userData.consistencyScore}/100
${userData.hrZones ? `- Zone HR: Z1=${userData.hrZones.zone1}%, Z2=${userData.hrZones.zone2}%, Z3=${userData.hrZones.zone3}%, Z4=${userData.hrZones.zone4}%, Z5=${userData.hrZones.zone5}%` : ""}
${userData.swolfAvg ? `- SWOLF medio: ${userData.swolfAvg}` : ""}
${userData.caloriesTotal ? `- Calorie totali: ${userData.caloriesTotal}` : ""}

REGOLE FONDAMENTALI:

1. ❌ NON RIPETERE I DATI VISIBILI
   - L'utente vede già distanza, sessioni, pace, streak
   - NON dire "Hai nuotato X km in Y sessioni"
   - NON dire "Il tuo pace medio è X:XX/100m"
   - NON dire "Hai un Performance Index di X/100"

2. ✅ INTERPRETA E COLLEGA I DATI
   - Calcola medie (es. km per sessione, frequenza settimanale)
   - Confronta con standard (principiante/intermedio/avanzato)
   - Identifica pattern nascosti (es. "nuoti più veloce ma meno costante")
   - Trova correlazioni (es. "le tue zone HR indicano che potresti spingere di più")

3. ✅ DAI CONSIGLI SPECIFICI E ACTIONABLE
   - Suggerisci modifiche concrete (es. "aggiungi 500m di tecnica ogni 3 sessioni")
   - Proponi obiettivi raggiungibili (es. "punta a 3 sessioni/settimana per 2 settimane")
   - Indica cosa fare DOMANI (es. "nella prossima sessione prova 4x100m in Z3")

4. ✅ USA CONTESTO E PSICOLOGIA
   - Se streak = 0 ma record > 0: motivazione per ripartire
   - Se Performance Index alto ma Consistency basso: focus su regolarità
   - Se trend negativo: incoraggiamento senza giudizio
   - Se trend positivo: celebrazione + sfida successiva

5. 📝 FORMATO
   - Ogni insight inizia con emoji appropriato
   - 1-2 frasi max per insight
   - Tono amichevole e motivazionale
   - Usa "tu" e linguaggio diretto

ESEMPI DI INSIGHTS BUONI:
✅ "Con una media di 2.7 km a sessione, sei già oltre la soglia 'principiante'. Prova ad aggiungere 500m di tecnica ogni 3 sessioni per passare al livello successivo più velocemente."
✅ "Il tuo Performance Index alto ma Consistency basso suggerisce che quando nuoti, nuoti bene! Il prossimo step? Punta a 2-3 sessioni/settimana per 2 settimane consecutive."
✅ "Le tue zone HR mostrano che passi il 60% del tempo in Z2 (aerobica). Ottimo per la base! Ora prova a inserire 1 sessione/settimana con 4x100m in Z3-Z4 per migliorare la velocità."

ESEMPI DI INSIGHTS CATTIVI (DA EVITARE):
❌ "Hai nuotato 16.3 km in 6 sessioni" (RIPETE I DATI)
❌ "Il tuo pace medio è 1:40/100m" (RIPETE I DATI)
❌ "Continua così!" (TROPPO GENERICO)

Genera 3-4 insights seguendo RIGOROSAMENTE queste regole:`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    // Parse insights (split by newlines, filter empty)
    const insights = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && line.match(/^[🔥⚡💪🎯📈🏊‍♂️🌟🚀💯🏆❤️📊🎉]/));

    // Return first 4 insights and save to cache
    if (insights.length > 0) {
      const finalInsights = insights.slice(0, 4);
      
      // Save to cache (expires in 24 hours)
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);
      
      try {
        // Delete old cache
        await db.delete(aiInsightsCache).where(eq(aiInsightsCache.userId, userId));
        
        // Insert new cache
        await db.insert(aiInsightsCache).values({
          userId,
          insights: finalInsights,
          periodDays: userData.periodDays,
          expiresAt,
        });
        
        console.log(`[AI Insights] Cached ${finalInsights.length} insights for user ${userId}`);
      } catch (cacheError) {
        console.error("[AI Insights] Error caching insights:", cacheError);
      }
      
      return finalInsights;
    }

    // Return empty array if parsing fails (no fallback)
    console.warn("[AI Insights] Failed to parse AI response");
    return [];
  } catch (error) {
    console.error("[AI Insights] Error generating AI insights:", error);
    
    // Try to return cached insights even if expired
    const anyCached = await db
      .select()
      .from(aiInsightsCache)
      .where(
        and(
          eq(aiInsightsCache.userId, userId),
          eq(aiInsightsCache.periodDays, userData.periodDays)
        )
      )
      .limit(1);
    
    if (anyCached.length > 0 && anyCached[0].insights.length > 0) {
      console.log(`[AI Insights] Using expired cache for user ${userId} due to error`);
      return anyCached[0].insights;
    }
    
    return [];
  }
}



function formatPace(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}
