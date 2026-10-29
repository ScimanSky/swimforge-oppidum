import { GoogleGenerativeAI } from "@google/generative-ai";
import { getDb } from "./db";
import { aiInsightsCache, swimmingActivities } from "../drizzle/schema";
import { eq, and, gt } from "drizzle-orm";
import { logger } from "./middleware/logger";
import { ENV } from "./_core/env";
import type { SwimMetrics } from "@shared/swimMetrics";
import {
  SWIM_METRICS_COACH_RULES,
  swimMetricsForCoach,
  swimMetricsGlossary,
} from "./swim_metrics/coach-context";

// Initialize Gemini AI
let genAI: GoogleGenerativeAI | null = null;
const log = logger.child({ component: "ai_insights" });
const INSIGHT_EMOJI_REGEX = /^[🔥⚡💪🎯📈🏊🔄🌟🚀💯🏆❤️📊🎉👍💬🤯😂😢🌊]/;
const INSIGHT_EMOJIS = ["🔥", "⚡", "💪", "🎯", "📈", "🏊", "🔄", "🌟", "🚀", "💯", "🏆", "❤️", "📊", "🎉", "👍", "💬", "🤯", "😂", "😢", "🌊"] as const;
const MIN_INSIGHTS_FOR_VALID_CACHE = 6;
const GEMINI_MODEL = ENV.geminiTextModel;
/**
 * Window of the swim metrics behind the insights. It is also the cache key: rows cached with
 * the old 30-day window came from the removed invented scores and are never read again.
 */
const INSIGHTS_PERIOD_DAYS = 90;

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
  const normalizedText = text.replace(/\r\n/g, "\n");
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

  // Pass 0: extract emoji-starting segments even when the model sends a single long paragraph.
  const escapedEmojiAlternation = INSIGHT_EMOJIS.map((emoji) => emoji.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  if (escapedEmojiAlternation) {
    const emojiBlockRegex = new RegExp(`(?:${escapedEmojiAlternation})[\\s\\S]*?(?=(?:${escapedEmojiAlternation})|$)`, "gu");
    let match: RegExpExecArray | null;
    while ((match = emojiBlockRegex.exec(normalizedText)) !== null) {
      const cleaned = cleanupInsightLine(match[0] ?? "");
      if (cleaned) pushUnique(cleaned);
    }
  }

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
  if (picked.length < MIN_INSIGHTS_FOR_VALID_CACHE) {
    const paragraphCandidates = text
      .replace(/\r\n/g, "\n")
      .split(/\n{2,}/)
      .map((p) => cleanupInsightLine(p))
      .filter((p) => p.length >= 40 && !p.startsWith("---") && !p.startsWith("###"));
    for (const paragraph of paragraphCandidates) {
      const sentences = paragraph
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => cleanupInsightLine(sentence))
        .filter((sentence) => sentence.length >= 24);
      for (const sentence of sentences) {
        pushUnique(sentence);
        if (picked.length >= 8) break;
      }
      if (picked.length >= 8) break;
    }
  }

  return picked.slice(0, 8);
}

/**
 * Drops the user's cached Coach page insights (their swims or CSS changed). Best effort: a
 * failure is logged, never thrown.
 */
export async function clearAIInsightsCache(userId: number): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.delete(aiInsightsCache).where(eq(aiInsightsCache.userId, userId));
  } catch (error) {
    log.warn("[AI Insights] Could not clear the cached insights", {
      event: "ai_insights:cache_clear_failed",
      userId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/** True when the user has at least one swim, ever (not only in the metrics' 90 days). */
async function hasAnySwim(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, userId: number): Promise<boolean> {
  const rows = await db
    .select({ id: swimmingActivities.id })
    .from(swimmingActivities)
    .where(eq(swimmingActivities.userId, userId))
    .limit(1);
  return rows.length > 0;
}

/** 6-8 insights for the Coach page from the swim metrics (cached 24 hours). */
export async function generateAIInsights(
  metrics: SwimMetrics,
  userId: number
): Promise<string[]> {
  const db = await getDb();
  if (!db) {
    return [];
  }

  // New users (no swim ever) shouldn't trigger AI generation/parsing noise: onboarding insights
  // (analysis + direction, no workouts). Someone back after a break gets real insights.
  if (metrics.sessions.length === 0 && !(await hasAnySwim(db, userId))) {
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
        periodDays: INSIGHTS_PERIOD_DAYS,
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
          eq(aiInsightsCache.periodDays, INSIGHTS_PERIOD_DAYS),
          gt(aiInsightsCache.expiresAt, new Date()) // Not expired
        )
      )
      .limit(1);

    if (cached.length > 0 && cached[0].insights.length > 0) {
      if (cached[0].insights.length >= MIN_INSIGHTS_FOR_VALID_CACHE) {
        log.debug("[AI Insights] Using valid cached insights", {
          event: "ai_insights:cache_hit",
          userId,
          expiresAt: cached[0].expiresAt,
          count: cached[0].insights.length,
        });
        return cached[0].insights;
      }

      log.warn("[AI Insights] Cache hit with incomplete insights, forcing regeneration", {
        event: "ai_insights:cache_hit_incomplete",
        userId,
        count: cached[0].insights.length,
      });
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
            eq(aiInsightsCache.periodDays, INSIGHTS_PERIOD_DAYS)
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

    const prompt = `Sei un analista di performance di nuoto esperto. Analizza le metriche di questo nuotatore e genera 6-8 insights analitici in italiano, identificando TENDENZE, PATTERN e AREE DI MIGLIORAMENTO, CATEGORIZZATI per argomento.

⚠️ IMPORTANTE: NON fornire allenamenti specifici o workout dettagliati (quello è il ruolo dell'AI Coach). Focus su ANALISI e DIREZIONE GENERALE.

${swimMetricsForCoach(metrics)}

${swimMetricsGlossary()}

REGOLE FONDAMENTALI:

0. METRICHE
${SWIM_METRICS_COACH_RULES}

1. ❌ NON RIPETERE I DATI VISIBILI
   - L'utente vede già i valori nella pagina Statistiche
   - NON dire "Il tuo passo soglia è 1:44/100 m" o "Hai fatto 7,4 km a settimana"

2. ✅ INTERPRETA E COLLEGA I DATI
   - Confronta con la base personale e con le settimane precedenti, mai con altri nuotatori
   - Collega le metriche tra loro (es. equilibrio negativo e volume in crescita; quota media alta e regolarità nelle ripetute)
   - Spiega cosa significa una lettura (es. "in costruzione", "molto lavoro in zona media")

3. ✅ DAI INDICAZIONI GENERALI (NON ALLENAMENTI SPECIFICI)
   - Identifica aree da migliorare e suggerisci direzioni generali
   - ❌ NON dare serie/ripetizioni specifiche (es. NO "4x100 in Z3", NO "500 m di tecnica")

4. ✅ USA CONTESTO E PSICOLOGIA
   - Serie di settimane a 0: motivazione per ripartire, senza giudizio
   - Equilibrio molto negativo: priorità al recupero
   - Dati scarsi o stime con affidabilità media: dillo e indica quali nuotate servono

5. 📝 FORMATO E CATEGORIZZAZIONE
   - Genera 6-8 insights totali
   - Ogni insight inizia con emoji CATEGORIZZATO:
     * 🏊 Tecnica (Stroke Index, distanza per ciclo, frequenza, SWOLF)
     * 💪 Intensità (passo soglia, zone di passo)
     * 📈 Progressione (forma, volume, passo soglia nel tempo)
     * 🔄 Recupero (equilibrio tra forma e fatica)
     * ⚡ Efficienza (Stroke Index rispetto alla tua base, regolarità nelle ripetute)
     * 🎯 Obiettivi (costanza, serie di settimane)
   - 1-2 frasi max per insight
   - Tono amichevole e diretto, usa "tu"

ESEMPI DI INSIGHTS BUONI:
✅ "🔄 Recupero: il tuo equilibrio è in costruzione da due settimane mentre la forma sale: stai caricando bene, ma una settimana più leggera ogni 3-4 ti aiuterà ad assorbire il lavoro."
✅ "💪 Intensità: quasi metà del volume cade in zona media; gli studi indicano che spostarne una parte sul facile, tenendo pochi tratti intensi, rende di più."
✅ "🏊 Tecnica: lo Stroke Index è sopra la tua base nella vasca da 25 m: a parità di passo fai più strada per bracciata."
✅ "🎯 Obiettivi: la stima del passo soglia ha affidabilità media; una nuotata con un tratto continuo lungo (800 m o più) la renderebbe più solida."

ESEMPI CATTIVI (DA EVITARE):
❌ "Il tuo passo soglia è 1:44/100 m" (RIPETE I DATI)
❌ "Continua così!" (TROPPO GENERICO)
❌ "Hai un indice di efficienza di 72/100" (INDICE INVENTATO)
❌ "Nella prossima sessione fai 4x100 in Z3" (ALLENAMENTO SPECIFICO - NON È IL TUO RUOLO)

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
          periodDays: INSIGHTS_PERIOD_DAYS,
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
            eq(aiInsightsCache.periodDays, INSIGHTS_PERIOD_DAYS)
          )
        )
        .limit(1);

      if (cached.length > 0 && cached[0].insights.length >= MIN_INSIGHTS_FOR_VALID_CACHE) {
        log.debug("[AI Insights] Using cached insights (parsing failed)", {
          event: "ai_insights:parse_failed_cache_hit",
          userId,
          count: cached[0].insights.length,
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
            eq(aiInsightsCache.periodDays, INSIGHTS_PERIOD_DAYS)
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
