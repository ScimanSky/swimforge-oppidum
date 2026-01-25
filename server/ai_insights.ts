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
  // New advanced metrics
  swimmingEfficiencyIndex?: number;
  technicalConsistencyIndex?: number;
  strokeEfficiencyRating?: number;
  aerobicCapacityScore?: number;
  recoveryReadinessScore?: number;
  progressiveOverloadIndex?: number;
}

export async function generateAIInsights(
  userData: UserStatsData,
  userId: number
): Promise<string[]> {
  const db = await getDb();
  if (!db) {
    return [];
  }

  // Check cache first (with error handling for missing table)
  try {
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
  } catch (cacheError) {
    console.warn("[AI Insights] Cache table not available yet, skipping cache check");
  }

  const client = getGeminiClient();
  
  // Return empty array if no API key (no fallback)
  if (!client) {
    console.warn("[AI Insights] No Gemini API key configured");
    return [];
  }

  try {
    const model = client.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `Sei un coach di nuoto esperto e motivazionale. Analizza questi dati di un nuotatore e genera 6-8 insights personalizzati, motivazionali e actionable in italiano, CATEGORIZZATI per argomento.

Dati nuotatore (ultimi ${userData.periodDays} giorni):

📊 DATI BASE:
- Livello: ${userData.level}
- XP Totali: ${userData.totalXp}
- Streak attuale: ${userData.currentStreak} giorni (record: ${userData.recordStreak})
- Distanza totale: ${(userData.totalDistanceMeters / 1000).toFixed(1)} km
- Sessioni: ${userData.sessions}
- Pace medio: ${formatPace(userData.avgPaceSeconds)}/100m
- Trend: ${userData.trend === "up" ? "crescita" : userData.trend === "down" ? "calo" : "stabile"} ${userData.trendPercentage}%

📈 INDICI GENERALI:
- Performance Index: ${userData.performanceIndex}/100
- Consistency Score: ${userData.consistencyScore}/100
${userData.swolfAvg ? `- SWOLF medio: ${userData.swolfAvg}` : ""}
${userData.caloriesTotal ? `- Calorie totali: ${userData.caloriesTotal}` : ""}

🏊 METRICHE AVANZATE:
${userData.swimmingEfficiencyIndex ? `- SEI (Swimming Efficiency): ${userData.swimmingEfficiencyIndex}/100` : ""}
${userData.technicalConsistencyIndex ? `- TCI (Technical Consistency): ${userData.technicalConsistencyIndex}/100` : ""}
${userData.strokeEfficiencyRating ? `- SER (Stroke Efficiency): ${userData.strokeEfficiencyRating}/100` : ""}
${userData.aerobicCapacityScore ? `- ACS (Aerobic Capacity): ${userData.aerobicCapacityScore}/100` : ""}
${userData.recoveryReadinessScore ? `- RRS (Recovery Readiness): ${userData.recoveryReadinessScore}/100` : ""}
${userData.progressiveOverloadIndex !== undefined ? `- POI (Progressive Overload): ${userData.progressiveOverloadIndex > 0 ? '+' : ''}${userData.progressiveOverloadIndex}%` : ""}

❤️ ZONE FREQUENZA CARDIACA:
${userData.hrZones ? `Z1=${userData.hrZones.zone1}%, Z2=${userData.hrZones.zone2}%, Z3=${userData.hrZones.zone3}%, Z4=${userData.hrZones.zone4}%, Z5=${userData.hrZones.zone5}%` : "Non disponibili"}

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

5. 📝 FORMATO E CATEGORIZZAZIONE
   - Genera 6-8 insights totali
   - Ogni insight inizia con emoji CATEGORIZZATO:
     * 🏊 Tecnica (SEI, TCI, SER, SWOLF)
     * 💪 Intensità (Zone HR, ACS, pace)
     * 📈 Progressione (POI, trend, livello)
     * 🔄 Recupero (RRS, streak)
     * ⚡ Efficienza (SEI, SER, calorie)
     * 🎯 Obiettivi (predictions, consistency)
   - 1-2 frasi max per insight
   - Tono amichevole e motivazionale
   - Usa "tu" e linguaggio diretto

ESEMPI DI INSIGHTS BUONI PER CATEGORIA:

🏊 TECNICA:
✅ "Il tuo SEI di 72/100 indica buona efficienza, ma c'è margine: riduci di 1-2 bracciate per vasca mantenendo il pace per salire sopra 80."
✅ "TCI a 65 suggerisce variazioni nel ritmo. Usa un tempo trainer a 1:30/100m per 10x100 per stabilizzare la tecnica."

💪 INTENSITÀ:
✅ "Passi solo il 15% in Z3-Z4: ottimo per base aerobica! Ora aggiungi 1 sessione/settimana con 6x100m @ Z3 per sviluppare velocità."
✅ "ACS di 78 indica solida capacità aerobica. Mantieni 2 sessioni lunghe/settimana in Z2 per consolidare."

📈 PROGRESSIONE:
✅ "POI a +18% è perfetto! Stai progredendo al ritmo giusto senza rischio sovrallenamento. Mantieni questo trend per altre 2 settimane."
✅ "Trend +12% con Performance Index 85: sei in crescita costante. Punta a 50km totali nel prossimo mese per consolidare."

🔄 RECUPERO:
✅ "RRS a 55 indica recupero parziale. Considera 1 giorno extra di riposo o una sessione facile in Z1-Z2 prima dell'allenamento intenso."
✅ "Streak di 12 giorni è ottimo, ma RRS basso suggerisce stanchezza. Inserisci 1 giorno di recupero attivo ogni 4-5 allenamenti."

⚡ EFFICIENZA:
✅ "SER di 81 con SWOLF 42: stai scivolando bene! Lavora su catch-up drill per portare SWOLF sotto 40 e SER sopra 85."
✅ "Consumi 450 cal/sessione con pace 1:45: ottimo rapporto! Aumenta intensità gradualmente per migliorare metabolismo."

🎯 OBIETTIVI:
✅ "Al ritmo attuale (2.8 km/sessione), raggiungerai 50km in 18 giorni. Aggiungi 1 sessione/settimana per anticipare a 14 giorni."
✅ "Consistency 88 con solo 3 sessioni/settimana: quando nuoti, nuoti bene! Porta a 4/settimana per sbloccare livello successivo."

ESEMPI CATTIVI (DA EVITARE):
❌ "Hai nuotato 16.3 km in 6 sessioni" (RIPETE I DATI)
❌ "Il tuo SEI è 72/100" (RIPETE I DATI)
❌ "Continua così!" (TROPPO GENERICO)
❌ "Il tuo pace medio è 1:40/100m" (RIPETE I DATI)

Genera 6-8 insights CATEGORIZZATI seguendo RIGOROSAMENTE queste regole:`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    // Parse insights (split by newlines, filter empty)
    const insights = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && line.match(/^[🔥⚡💪🎯📈🏊🔄🌟🚀💯🏆❤️📊🎉👍🚀]/));

    // Return first 8 insights and save to cache
    if (insights.length > 0) {
      const finalInsights = insights.slice(0, 8);
      
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
        console.warn("[AI Insights] Cache table not available yet, skipping cache save:", cacheError);
      }
      
      return finalInsights;
    }

    // Return empty array if parsing fails (no fallback)
    console.warn("[AI Insights] Failed to parse AI response");
    return [];
  } catch (error) {
    console.error("[AI Insights] Error generating AI insights:", error);
    
    // Try to return cached insights even if expired
    try {
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
    } catch (fallbackError) {
      console.warn("[AI Insights] Cache table not available for fallback");
    }
    
    return [];
  }
}



function formatPace(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}
