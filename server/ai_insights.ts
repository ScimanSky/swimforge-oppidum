import { GoogleGenerativeAI } from "@google/generative-ai";
import { getDb } from "./db";
import { aiInsightsCache, swimmingActivities } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "./middleware/logger";
import { ENV } from "./_core/env";
import { aiInsightsRateLimit } from "./lib/ai-rate-limit";
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

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type CachedInsights = { insights: string[]; generatedAt?: Date | null; expiresAt: Date };

/** The cached insights live 24 hours. */
const INSIGHTS_TTL_MS = 24 * 60 * 60 * 1000;
/**
 * New swims make the insights stale, but they are regenerated at most once every 6 hours: until
 * then the last ones are served (each regeneration is a Gemini call).
 */
export const INSIGHTS_MIN_REGENERATION_MS = 6 * 60 * 60 * 1000;
/** The Gemini call gives up after this: the last insights (or none) are served instead. */
export const INSIGHTS_GEMINI_TIMEOUT_MS = 25_000;

/** Insights of a user who never swam (analysis and direction, no workouts). */
const ONBOARDING_INSIGHTS = [
  "📈 Progressione: Sei in una fase perfetta per creare una base. La cosa piu' importante adesso e' costruire regolarita' prima di inseguire la velocita'.",
  "🔄 Recupero: Parti con calma. Sessioni leggere e costanti ti aiutano a rendere sostenibile l'abitudine senza accumulare fatica.",
  "🏊 Tecnica: All'inizio i miglioramenti piu' rapidi arrivano dalla tecnica. Concentrarti su scivolamento e controllo del ritmo ti dara' vantaggi immediati.",
  "💪 Intensita': Prima base, poi intensita'. Quando avrai qualche sessione registrata, potremo capire se e quando alzare il ritmo.",
  "⚡ Efficienza: Anche a bassa intensita' puoi migliorare l'efficienza. Piccoli progressi sessione dopo sessione fanno una grande differenza nel tempo.",
  "🎯 Obiettivi: Imposta un obiettivo semplice e misurabile (frequenza settimanale). Una volta che i dati arrivano, potremo renderlo piu' ambizioso.",
];

const isOnboardingInsights = (insights: string[]) => insights[0] === ONBOARDING_INSIGHTS[0];

/**
 * New swims or laps: the user's Coach page insights become stale, but stay served until 6 hours
 * have passed since they were generated (expiry moved to that moment, or to now when it has
 * already passed). Best effort: a failure is logged, never thrown.
 */
export async function markAIInsightsStale(userId: number, now: Date = new Date()): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const rows = await db
      .select({ generatedAt: aiInsightsCache.generatedAt, expiresAt: aiInsightsCache.expiresAt })
      .from(aiInsightsCache)
      .where(eq(aiInsightsCache.userId, userId))
      .limit(1);
    const row = rows[0];
    if (!row) return;
    const regenerateFrom = new Date(
      Math.max(now.getTime(), new Date(row.generatedAt).getTime() + INSIGHTS_MIN_REGENERATION_MS),
    );
    if (regenerateFrom.getTime() >= new Date(row.expiresAt).getTime()) return;
    await db.update(aiInsightsCache).set({ expiresAt: regenerateFrom }).where(eq(aiInsightsCache.userId, userId));
  } catch (error) {
    log.warn("[AI Insights] Could not mark the cached insights stale", {
      event: "ai_insights:mark_stale_failed",
      userId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/** True when the user has at least one swim, ever (not only in the metrics' 90 days). */
async function hasAnySwim(db: Db, userId: number): Promise<boolean> {
  const rows = await db
    .select({ id: swimmingActivities.id })
    .from(swimmingActivities)
    .where(eq(swimmingActivities.userId, userId))
    .limit(1);
  return rows.length > 0;
}

/** The user's cached insights of the 90-day metrics, expired or not; null when none or unreadable. */
async function readCachedInsights(db: Db, userId: number): Promise<CachedInsights | null> {
  try {
    const rows = await db
      .select()
      .from(aiInsightsCache)
      .where(and(eq(aiInsightsCache.userId, userId), eq(aiInsightsCache.periodDays, INSIGHTS_PERIOD_DAYS)))
      .limit(1);
    return rows[0] ?? null;
  } catch (error) {
    log.warn("[AI Insights] Cache check failed, proceeding without it", {
      event: "ai_insights:cache_check_failed",
      userId,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** Replaces the user's cached insights (valid 24 hours from `now`). Best effort. */
async function saveInsights(db: Db, userId: number, insights: string[], now: Date, kind: "onboarding" | "ai"): Promise<void> {
  try {
    await db.delete(aiInsightsCache).where(eq(aiInsightsCache.userId, userId));
    await db.insert(aiInsightsCache).values({
      userId,
      insights,
      periodDays: INSIGHTS_PERIOD_DAYS,
      generatedAt: now,
      expiresAt: new Date(now.getTime() + INSIGHTS_TTL_MS),
    });
    log.debug("[AI Insights] Cached insights", {
      event: kind === "onboarding" ? "ai_insights:onboarding_cache_saved" : "ai_insights:cache_saved",
      userId,
      count: insights.length,
    });
  } catch (cacheError) {
    log.warn("[AI Insights] Cache table not available, skipping cache save", {
      event: kind === "onboarding" ? "ai_insights:onboarding_cache_save_skipped" : "ai_insights:cache_save_skipped",
      userId,
      message: cacheError instanceof Error ? cacheError.message : String(cacheError),
    });
  }
}

/** One Gemini answer, given up (and the request aborted) after INSIGHTS_GEMINI_TIMEOUT_MS. */
async function generateInsightsText(client: GoogleGenerativeAI, prompt: string): Promise<string> {
  const model = client.getGenerativeModel({ model: GEMINI_MODEL });
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      model.generateContent(prompt, { signal: controller.signal }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Gemini API timeout after ${INSIGHTS_GEMINI_TIMEOUT_MS}ms`));
          controller.abort();
        }, INSIGHTS_GEMINI_TIMEOUT_MS);
      }),
    ]);
    return result.response.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 6-8 insights for the Coach page from the swim metrics, cached 24 hours. When Gemini fails,
 * times out, is not configured or the user is over the hourly limit, the last cached insights are
 * served (expired or not), otherwise none (the page shows its own message).
 */
export async function generateAIInsights(
  metrics: SwimMetrics,
  userId: number,
  now: Date = new Date(),
): Promise<string[]> {
  const db = await getDb();
  if (!db) {
    return [];
  }

  // New users (no swim ever) shouldn't trigger AI generation/parsing noise: onboarding insights
  // (analysis + direction, no workouts). Someone back after a break gets real insights.
  if (metrics.sessions.length === 0 && !(await hasAnySwim(db, userId))) {
    // Cached so the UI stays stable and we avoid repeated generation attempts.
    await saveInsights(db, userId, ONBOARDING_INSIGHTS, now, "onboarding");
    return [...ONBOARDING_INSIGHTS];
  }

  // Cache first. The onboarding insights of a user who swims now are never served from it.
  const cached = await readCachedInsights(db, userId);
  const lastInsights = cached?.insights ?? [];
  if (cached && new Date(cached.expiresAt).getTime() > now.getTime() && lastInsights.length > 0 && !isOnboardingInsights(lastInsights)) {
    if (lastInsights.length >= MIN_INSIGHTS_FOR_VALID_CACHE) {
      log.debug("[AI Insights] Using valid cached insights", {
        event: "ai_insights:cache_hit",
        userId,
        expiresAt: cached.expiresAt,
        count: lastInsights.length,
      });
      return lastInsights;
    }
    log.warn("[AI Insights] Cache hit with incomplete insights, forcing regeneration", {
      event: "ai_insights:cache_hit_incomplete",
      userId,
      count: lastInsights.length,
    });
  } else {
    log.debug("[AI Insights] No valid cache found, generating new insights", {
      event: "ai_insights:cache_miss",
      userId,
    });
  }

  const client = getGeminiClient();
  if (!client) {
    log.warn("[AI Insights] No Gemini API key configured, serving the last insights", {
      event: "ai_insights:no_api_key",
      userId,
      cached: lastInsights.length,
    });
    return lastInsights;
  }

  if (!(await aiInsightsRateLimit.consume(userId))) {
    log.warn("[AI Insights] Hourly generation limit reached, serving the last insights", {
      event: "ai_insights:rate_limited",
      userId,
      cached: lastInsights.length,
    });
    return lastInsights;
  }

  try {
    const text = await generateInsightsText(client, buildInsightsPrompt(metrics));

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

    if (insights.length > 0) {
      const finalInsights = insights.slice(0, 8);
      await saveInsights(db, userId, finalInsights, now, "ai");
      return finalInsights;
    }

    // Nothing parsed: the last complete insights, if any.
    log.warn("[AI Insights] Failed to parse AI response, trying cache fallback", {
      event: "ai_insights:parse_failed",
      userId,
      preview: text.substring(0, 500),
    });
    return lastInsights.length >= MIN_INSIGHTS_FOR_VALID_CACHE ? lastInsights : [];
  } catch (error) {
    log.error("[AI Insights] Error generating AI insights", {
      event: "ai_insights:generate_error",
      userId,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      cached: lastInsights.length,
    });
    // The last insights even if expired (or none).
    return lastInsights;
  }
}

function buildInsightsPrompt(metrics: SwimMetrics): string {
  return `Sei un analista di performance di nuoto esperto. Analizza le metriche di questo nuotatore e genera 6-8 insights analitici in italiano, identificando TENDENZE, PATTERN e AREE DI MIGLIORAMENTO, CATEGORIZZATI per argomento.

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
   - Spiega cosa significa una lettura (es. "in costruzione", "molto lavoro in zona B")

3. ✅ DAI INDICAZIONI GENERALI (NON ALLENAMENTI SPECIFICI)
   - Identifica aree da migliorare e suggerisci direzioni generali
   - ❌ NON dare serie/ripetizioni specifiche (es. NO "4x100 in B2", NO "500 m di tecnica")

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
✅ "💪 Intensità: quasi metà del volume cade in zona B; gli studi indicano che spostarne una parte in zona A, tenendo pochi tratti in zona C, rende di più."
✅ "🏊 Tecnica: lo Stroke Index è sopra la tua base nella vasca da 25 m e anche la distanza per bracciata è salita: fai più strada per bracciata, non vai solo più veloce." (dillo solo se sale la distanza per bracciata; se sale solo il passo, il merito è della velocità)
✅ "⚡ Efficienza: nelle ripetute la distanza per bracciata cala nel finale: la fatica ti accorcia la bracciata, e lì c'è margine con un lavoro di resistenza graduale."
✅ "🎯 Obiettivi: la stima del passo soglia ha affidabilità media; una nuotata con un tratto continuo lungo (800 m o più) la renderebbe più solida."

ESEMPI CATTIVI (DA EVITARE):
❌ "Il tuo passo soglia è 1:44/100 m" (RIPETE I DATI)
❌ "Continua così!" (TROPPO GENERICO)
❌ "Hai un indice di efficienza di 72/100" (INDICE INVENTATO)
❌ "Nella prossima sessione fai 4x100 in B2" (ALLENAMENTO SPECIFICO - NON È IL TUO RUOLO)

Genera 6-8 insights CATEGORIZZATI seguendo RIGOROSAMENTE queste regole:`;
}
