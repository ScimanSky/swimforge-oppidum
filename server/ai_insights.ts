import { GoogleGenerativeAI } from "@google/generative-ai";
import { getDb } from "./db";
import { aiInsightsCache } from "../drizzle/schema";
import { eq, and, gt } from "drizzle-orm";
import { logger } from "./middleware/logger";

// Initialize Gemini AI
let genAI: GoogleGenerativeAI | null = null;
const log = logger.child({ component: "ai_insights" });
const INSIGHT_EMOJI_REGEX = /^[🔥⚡💪🎯📈🏊🔄🌟🚀💯🏆❤️📊🎉👍💬🤯😂😢🌊]/;
const GEMINI_MODEL = (process.env.GEMINI_MODEL ?? "gemini-2.5-flash").trim() || "gemini-2.5-flash";

function getGeminiClient() {
  if (!genAI && process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
}

function cleanupInsightLine(line: string): string {
  return line
    .replace(/^[-*•]\s*/, "")
    .replace(/^\d+[\).\-\s]+/, "")
    .replace(/^#+\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseInsightsFromAiText(text: string): string[] {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => cleanupInsightLine(line))
    .filter(Boolean);

  const picked: string[] = [];
  const seen = new Set<string>();
  const pushUnique = (line: string) => {
    const normalized = line.toLowerCase();
    if (line.length < 24 || seen.has(normalized)) return;
    seen.add(normalized);
    picked.push(line);
  };

  // Pass 1: prefer emoji-prefixed insights (supports markdown bullets too).
  for (const line of lines) {
    if (INSIGHT_EMOJI_REGEX.test(line)) {
      pushUnique(line);
    }
  }

  // Pass 2: fallback to meaningful bullet/numbered lines if model skipped emojis.
  if (picked.length === 0) {
    for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
      const trimmed = rawLine.trim();
      if (!trimmed) continue;
      if (!/^([-*•]|\d+[\).\-\s]+)/.test(trimmed)) continue;
      const cleaned = cleanupInsightLine(trimmed);
      if (!cleaned || cleaned.startsWith("---")) continue;
      pushUnique(cleaned);
    }
  }

  // Pass 3: as last resort, split long paragraphs and extract first statements.
  if (picked.length === 0) {
    const paragraphCandidates = text
      .replace(/\r\n/g, "\n")
      .split(/\n{2,}/)
      .map((p) => cleanupInsightLine(p))
      .filter((p) => p.length >= 40 && !p.startsWith("---") && !p.startsWith("###"));
    for (const paragraph of paragraphCandidates) {
      const sentence = paragraph.split(/(?<=[.!?])\s+/)[0]?.trim() ?? "";
      if (sentence) pushUnique(sentence);
    }
  }

  return picked.slice(0, 8);
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

  // New users (no synced activities) shouldn't trigger AI generation/parsing noise.
  // Provide a small set of onboarding insights (analysis + direction, no workouts).
  if ((userData.sessions ?? 0) <= 0 || (userData.totalDistanceMeters ?? 0) <= 0) {
    const insights = [
      "📈 Progressione: Sei in una fase perfetta per creare una base. La cosa piu' importante adesso e' costruire regolarita' prima di inseguire la velocita'.",
      "🔄 Recupero: Parti con calma. Sessioni leggere e costanti ti aiutano a rendere sostenibile l'abitudine senza accumulare fatica.",
      "🏊 Tecnica: All'inizio i miglioramenti piu' rapidi arrivano dalla tecnica. Concentrarti su scivolamento e controllo del ritmo ti dara' vantaggi immediati.",
      "💪 Intensita': Prima base, poi intensita'. Quando avrai qualche sessione registrata, potremo capire se e quando alzare il ritmo.",
      "⚡ Efficienza: Anche a bassa intensita' puoi migliorare l'efficienza. Piccoli progressi sessione dopo sessione fanno una grande differenza nel tempo.",
      "🎯 Obiettivi: Imposta un obiettivo semplice e misurabile (frequenza settimanale). Una volta che i dati arrivano, potremo renderlo piu' ambizioso.",
    ];

    // Cache these insights so the UI stays stable and we avoid repeated generation attempts.
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);
    try {
      await db.delete(aiInsightsCache).where(eq(aiInsightsCache.userId, userId));
      await db.insert(aiInsightsCache).values({
        userId,
        insights,
        periodDays: userData.periodDays,
        expiresAt,
      });
      log.debug("[AI Insights] Cached onboarding insights (no activities yet)", {
        event: "ai_insights:onboarding_cache_saved",
        userId,
      });
    } catch (cacheError) {
      log.debug("[AI Insights] Skipping onboarding cache save", {
        event: "ai_insights:onboarding_cache_save_skipped",
        userId,
        message: cacheError instanceof Error ? cacheError.message : String(cacheError),
      });
    }

    return insights;
  }

  // 🔥 PRIORITY: Check cache FIRST (before API call)
  try {
    const cached = await db
      .select()
      .from(aiInsightsCache)
      .where(
        and(
          eq(aiInsightsCache.userId, userId),
          eq(aiInsightsCache.periodDays, userData.periodDays),
          gt(aiInsightsCache.expiresAt, new Date()) // Not expired
        )
      )
      .limit(1);

    if (cached.length > 0 && cached[0].insights.length > 0) {
      log.debug("[AI Insights] Using valid cached insights", {
        event: "ai_insights:cache_hit",
        userId,
        expiresAt: cached[0].expiresAt,
      });
      return cached[0].insights;
    }
    
    log.debug("[AI Insights] No valid cache found, generating new insights", {
      event: "ai_insights:cache_miss",
      userId,
    });
  } catch (cacheError) {
    log.warn("[AI Insights] Cache check failed, proceeding with generation", {
      event: "ai_insights:cache_check_failed",
      userId,
      message: cacheError instanceof Error ? cacheError.message : String(cacheError),
    });
  }

  const client = getGeminiClient();
  
  // If no API key, try to use ANY cache as fallback (even expired)
  if (!client) {
    log.warn("[AI Insights] No Gemini API key configured, trying ANY cache fallback", {
      event: "ai_insights:no_api_key",
      userId,
    });
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
        log.debug("[AI Insights] Using ANY cached insights (no API key)", {
          event: "ai_insights:any_cache_hit",
          userId,
        });
        return anyCached[0].insights;
      }
    } catch (cacheError) {
      log.warn("[AI Insights] Cache table not available", {
        event: "ai_insights:cache_table_unavailable",
        userId,
        message: cacheError instanceof Error ? cacheError.message : String(cacheError),
      });
    }
    return [];
  }

  try {
    const model = client.getGenerativeModel({ model: GEMINI_MODEL });

    const prompt = `Sei un analista di performance di nuoto esperto. Analizza questi dati di un nuotatore e genera 6-8 insights analitici, identificando TENDENZE, PATTERN e AREE DI MIGLIORAMENTO in italiano, CATEGORIZZATI per argomento.

⚠️ IMPORTANTE: NON fornire allenamenti specifici o workout dettagliati (quello è il ruolo dell'AI Coach). Focus su ANALISI e DIREZIONE GENERALE.

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

3. ✅ DAI INDICAZIONI GENERALI (NON ALLENAMENTI SPECIFICI)
   - Identifica aree da migliorare (es. "la tua tecnica varia troppo tra sessioni")
   - Suggerisci direzioni generali (es. "considera di lavorare sulla consistenza del ritmo")
   - Proponi focus generali (es. "potrebbe essere utile dedicare più tempo al recupero")
   - ❌ NON dare serie/ripetizioni specifiche (es. NO "4x100m in Z3", NO "500m di tecnica")

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
✅ "Il tuo SEI di 72/100 indica buona efficienza, ma c'è margine di miglioramento: lavorare sulla riduzione delle bracciate potrebbe portarti sopra 80."
✅ "TCI a 65 suggerisce variazioni nel ritmo tra sessioni. Maggiore focus sulla consistenza tecnica potrebbe stabilizzare le tue performance."

💪 INTENSITÀ:
✅ "Passi solo il 15% in Z3-Z4: ottima base aerobica costruita! Il prossimo step naturale è integrare più lavoro ad alta intensità per sviluppare velocità."
✅ "ACS di 78 indica solida capacità aerobica. Mantenere sessioni lunghe in Z2 ti aiuterà a consolidare questa base."

📈 PROGRESSIONE:
✅ "POI a +18% è perfetto! Stai progredendo al ritmo giusto senza rischio sovrallenamento. Questo trend è sostenibile per altre 2-3 settimane."
✅ "Trend +12% con Performance Index 85: crescita costante e sana. Puntare a 50km totali nel prossimo mese consoliderebbe questi progressi."

🔄 RECUPERO:
✅ "RRS a 55 indica recupero parziale. Potrebbe essere utile considerare più giorni di riposo o sessioni più leggere."
✅ "Streak di 12 giorni è ottimo, ma RRS basso suggerisce accumulo di fatica. Bilanciare intensità e recupero diventa prioritario."

⚡ EFFICIENZA:
✅ "SER di 81 con SWOLF 42: stai scivolando bene! C'è potenziale per portare SWOLF sotto 40 lavorando sulla fase di presa."
✅ "Consumi 450 cal/sessione con pace 1:45: ottimo rapporto efficienza/intensità! Aumentare gradualmente l'intensità potrebbe migliorare il metabolismo."

🎯 OBIETTIVI:
✅ "Al ritmo attuale (2.8 km/sessione), raggiungerai 50km in 18 giorni. Una sessione extra a settimana anticiperebbe l'obiettivo a 14 giorni."
✅ "Consistency 88 con solo 3 sessioni/settimana: quando nuoti, nuoti bene! Aumentare la frequenza a 4/settimana sbloccherebbe il livello successivo più velocemente."

ESEMPI CATTIVI (DA EVITARE):
❌ "Hai nuotato 16.3 km in 6 sessioni" (RIPETE I DATI)
❌ "Il tuo SEI è 72/100" (RIPETE I DATI)
❌ "Continua così!" (TROPPO GENERICO)
❌ "Il tuo pace medio è 1:40/100m" (RIPETE I DATI)
❌ "Nella prossima sessione fai 4x100m in Z3" (TROPPO SPECIFICO - È COMPITO DEL COACH)
❌ "Aggiungi 500m di tecnica ogni 3 sessioni" (ALLENAMENTO SPECIFICO - NON È IL TUO RUOLO)

Genera 6-8 insights CATEGORIZZATI seguendo RIGOROSAMENTE queste regole:`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    log.debug("[AI Insights] Raw response from Gemini (first 500 chars)", {
      event: "ai_insights:raw_response",
      userId,
      preview: text.substring(0, 500),
    });

    const insights = parseInsightsFromAiText(text);

    log.debug("[AI Insights] Parsed insights from response", {
      event: "ai_insights:parsed",
      userId,
      count: insights.length,
    });
    if (insights.length === 0) {
      log.warn("[AI Insights] No insights matched regex", {
        event: "ai_insights:regex_no_match",
        userId,
        preview: text.substring(0, 500),
      });
    }

    // Return first 8 insights and save to cache
    if (insights.length > 0) {
      const finalInsights = insights.slice(0, 8);
      
      // Save to cache (expires in 24 hours as per user preference)
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
        
        log.debug("[AI Insights] Cached insights", {
          event: "ai_insights:cache_saved",
          userId,
          count: finalInsights.length,
        });
      } catch (cacheError) {
        log.warn("[AI Insights] Cache table not available yet, skipping cache save", {
          event: "ai_insights:cache_save_skipped",
          userId,
          message: cacheError instanceof Error ? cacheError.message : String(cacheError),
        });
      }
      
      return finalInsights;
    }

    // If parsing fails, try to use cache as fallback
    log.warn("[AI Insights] Failed to parse AI response, trying cache fallback", {
      event: "ai_insights:parse_failed",
      userId,
    });
    try {
      const cached = await db
        .select()
        .from(aiInsightsCache)
        .where(
          and(
            eq(aiInsightsCache.userId, userId),
            eq(aiInsightsCache.periodDays, userData.periodDays)
          )
        )
        .limit(1);

      if (cached.length > 0 && cached[0].insights.length > 0) {
        log.debug("[AI Insights] Using cached insights (parsing failed)", {
          event: "ai_insights:parse_failed_cache_hit",
          userId,
        });
        return cached[0].insights;
      }
    } catch (cacheError) {
      log.warn("[AI Insights] Cache table not available for fallback", {
        event: "ai_insights:cache_fallback_unavailable",
        userId,
        message: cacheError instanceof Error ? cacheError.message : String(cacheError),
      });
    }
    
    return [];
  } catch (error) {
    log.error("[AI Insights] Error generating AI insights", {
      event: "ai_insights:generate_error",
      userId,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    
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
        log.warn("[AI Insights] Using expired cache due to error", {
          event: "ai_insights:expired_cache_fallback",
          userId,
        });
        return anyCached[0].insights;
      }
    } catch (fallbackError) {
      log.warn("[AI Insights] Cache table not available for fallback", {
        event: "ai_insights:expired_cache_fallback_unavailable",
        userId,
        message: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
      });
    }
    
    return [];
  }
}



function formatPace(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}
