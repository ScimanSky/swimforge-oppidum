import { invokeLLM } from "./_core/llm";
import { getSwimmerProfile, getActivities } from "./db";
import { getAdvancedMetrics } from "./db_statistics";
import { getExistingWorkouts } from "./ai_coach";
import { listActivityInsights } from "./ai_activity_insights";
import { logger } from "./middleware/logger";
import { GoogleGenerativeAI } from "@google/generative-ai";

export type CoachChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type CoachChatResult = {
  message: string;
  generatedAt: string;
  fallback: boolean;
  provider: "forge" | "gemini" | "rule_based";
};

export type CoachChatPreferences = {
  goal?: string | null;
  constraints?: string | null;
};

type CoachContext = {
  profile: Awaited<ReturnType<typeof getSwimmerProfile>>;
  advanced: Awaited<ReturnType<typeof getAdvancedMetrics>> | null;
  recentActivities: Awaited<ReturnType<typeof getActivities>>;
  workouts: Awaited<ReturnType<typeof getExistingWorkouts>> | null;
  latestInsights: Awaited<ReturnType<typeof listActivityInsights>>;
};

function formatPace(secPer100m: number | null | undefined) {
  if (!secPer100m || secPer100m <= 0) return "n/d";
  const mins = Math.floor(secPer100m / 60);
  const secs = Math.round(secPer100m % 60);
  return `${mins}:${String(secs).padStart(2, "0")}/100m`;
}

function contextToPrompt(ctx: CoachContext) {
  const profile = ctx.profile;
  const advanced = ctx.advanced;

  const recentSummary = ctx.recentActivities.slice(0, 5).map((activity, index) => {
    const date = activity.activityDate instanceof Date
      ? activity.activityDate.toISOString().slice(0, 10)
      : "n/d";
    return `${index + 1}. ${date} · ${activity.distanceMeters}m · ${Math.round(activity.durationSeconds / 60)} min · passo ${formatPace(activity.avgPacePer100m ?? null)} · SWOLF ${activity.avgSwolf ?? "n/d"}`;
  });

  const insightRows = (ctx.latestInsights ?? []).slice(0, 3).map((row: any, index) => {
    const title = String(row?.title ?? "Insight");
    const summary = String(row?.summary ?? "").replace(/\s+/g, " ").slice(0, 180);
    return `${index + 1}. ${title}: ${summary}`;
  });

  const workoutsStatus = ctx.workouts
    ? `pool=${ctx.workouts.pool ? "si" : "no"}, dryland=${ctx.workouts.dryland ? "si" : "no"}, generatedAt=${ctx.workouts.generatedAt ?? "n/d"}`
    : "n/d";

  return `
CONTESTO ATLETA SWIMFORGE
- Livello: ${profile?.level ?? "n/d"}
- XP totale: ${profile?.totalXp ?? "n/d"}
- Sessioni totali: ${profile?.totalSessions ?? "n/d"}
- Distanza totale: ${profile?.totalDistanceMeters ?? "n/d"} m
- Stile preferito: ${profile?.preferredStroke ?? "n/d"}
- Skill label AI: ${profile?.aiSkillLabel ?? "n/d"}

METRICHE ULTIMI 30 GIORNI
- Performance Index: ${advanced?.performanceIndex ?? "n/d"}
- Consistency Score: ${advanced?.consistencyScore ?? "n/d"}
- Recovery Readiness: ${advanced?.recoveryReadinessScore ?? "n/d"}
- SEI: ${advanced?.swimmingEfficiencyIndex ?? "n/d"}
- TCI: ${advanced?.technicalConsistencyIndex ?? "n/d"}
- SER: ${advanced?.strokeEfficiencyRating ?? "n/d"}
- ACS: ${advanced?.aerobicCapacityScore ?? "n/d"}
- POI: ${advanced?.progressiveOverloadIndex ?? "n/d"}

ULTIME ATTIVITA
${recentSummary.length ? recentSummary.join("\n") : "- Nessuna attività recente disponibile"}

ULTIMI SESSION IQ
${insightRows.length ? insightRows.join("\n") : "- Nessun insight sessione disponibile"}

WORKOUTS GENERATI
- ${workoutsStatus}
`.trim();
}

function baseSystemPrompt(ctx: CoachContext, preferences?: CoachChatPreferences) {
  const goal = preferences?.goal?.trim();
  const constraints = preferences?.constraints?.trim();
  return `
Sei "Coach AI" di SwimForge, un coach di nuoto pragmatico e orientato all'azione.
Rispondi SEMPRE in italiano.

Obiettivo:
- trasformare i dati dell'atleta in indicazioni pratiche per la prossima sessione e per la settimana.

Regole:
- non inventare dati non presenti nel contesto;
- se mancano dati, dichiaralo chiaramente e fai una domanda mirata;
- evita diagnosi mediche e sostituzione di professionisti sanitari;
- se l'utente riferisce dolore/infortunio, raccomanda stop e valutazione specialistica;
- niente testo motivazionale generico.
- se l'utente dice che oggi e' stanco/lento, riduci volume/intensita' e proponi una seduta di qualita' tecnica;
- se l'obiettivo e' 50/100 stile, inserisci lavoro specifico di velocita' e partenze/virate.

Formato di risposta preferito:
1) "Lettura dati" (max 3 bullet)
2) "Cosa fare adesso" (max 4 bullet con target concreti)
3) "Check prossimo" (1 bullet: cosa monitorare nella prossima sessione)
4) "Domanda mirata" (1 domanda breve per affinare il piano)

PREFERENZE UTENTE
- Obiettivo attuale: ${goal && goal.length > 0 ? goal : "n/d"}
- Vincoli attuali: ${constraints && constraints.length > 0 ? constraints : "n/d"}

${contextToPrompt(ctx)}
  `.trim();
}

function normalizeAssistantContent(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (part && typeof part === "object" && "type" in part) {
        const maybeText = part as { type?: string; text?: string };
        if (maybeText.type === "text" && typeof maybeText.text === "string") {
          return maybeText.text;
        }
      }
      return "";
    })
    .join("\n")
    .trim();
}

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY ?? "").trim();
const geminiModel = GEMINI_API_KEY
  ? new GoogleGenerativeAI(GEMINI_API_KEY).getGenerativeModel({ model: GEMINI_MODEL })
  : null;

function extractLastUserMessage(history: CoachChatMessage[]): string {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].role === "user") {
      return history[i].content.trim();
    }
  }
  return "";
}

function fallbackMessage(
  ctx: CoachContext,
  history: CoachChatMessage[],
  preferences?: CoachChatPreferences
) {
  const performance = ctx.advanced?.performanceIndex;
  const consistency = ctx.advanced?.consistencyScore;
  const recovery = ctx.advanced?.recoveryReadinessScore;
  const latest = ctx.recentActivities[0];
  const lastUserMessage = extractLastUserMessage(history).toLowerCase();
  const goal = preferences?.goal?.trim() ?? "";
  const constraints = preferences?.constraints?.trim() ?? "";

  const mentionsFatigue = /(stanc|lento|fatica|scaric|pesant|affatic)/i.test(lastUserMessage);
  const mentionsShoulder = /(spall|dolor|infiam|tendin|male)/i.test(
    `${lastUserMessage} ${constraints}`.toLowerCase()
  );
  const speedGoal = /(50\s?(sl|stile|m)|100\s?(sl|stile|m)|sprint|veloc)/i.test(
    `${lastUserMessage} ${goal}`.toLowerCase()
  );

  const nextFocus =
    recovery !== null && recovery !== undefined && recovery < 45
      ? "recupero + tecnica pulita"
      : consistency !== null && consistency !== undefined && consistency < 50
        ? "regolarità (3 sedute/settimana)"
        : "progressione controllata del volume";

  const latestLine = latest
    ? `Ultima sessione: ${latest.distanceMeters}m in ${Math.round(latest.durationSeconds / 60)} min, passo ${formatPace(latest.avgPacePer100m ?? null)}.`
    : "Non vedo sessioni recenti, quindi parto da una base conservativa.";

  let sessionBullet = "- Sessione oggi: 300 sciolti + 8x100 ritmo controllato + 6x50 progressivi + 200 defaticamento.";
  let checkBullet = "- Monitora passo medio/100m e sensazione di fatica (RPE) a fine seduta.";
  let questionBullet = "- Quante sedute reali puoi fare nei prossimi 7 giorni (2/3/4)?";

  if (mentionsFatigue) {
    sessionBullet =
      "- Sessione oggi (scarico): 200 sciolti + 10x50 tecnica con 20\" rec + 6x75 aerobici facili + 150 defaticamento.";
    checkBullet = "- Se RPE supera 6/10 o il passo peggiora oltre 3\"/100m, chiudi la serie principale.";
    questionBullet = "- Domani vuoi seduta breve tecnica (35-40') o riposo completo?";
  } else if (speedGoal) {
    sessionBullet =
      "- Sessione oggi (focus 50/100): 300 warm-up + 2x(6x25 veloce con 30\" rec) + 4x50 a ritmo gara + 200 sciolti.";
    checkBullet = "- Monitora tempo medio sui 25 veloci e mantenimento tecnica nelle ultime ripetute.";
    questionBullet = "- Hai riferimenti cronometrici attuali su 25m o 50m per calibrare i target?";
  }

  const shoulderLine = mentionsShoulder
    ? "- Vincolo spalla: evita palette/farfalla e interrompi se dolore >3/10, valutando un professionista."
    : "- Vincoli dichiarati: nessuna limitazione critica segnalata.";

  return [
    "Lettura dati",
    `- Performance: ${performance ?? "n/d"} · Consistency: ${consistency ?? "n/d"} · Recovery: ${recovery ?? "n/d"}`,
    `- ${latestLine}`,
    `- Obiettivo: ${goal || "n/d"} · Vincoli: ${constraints || "n/d"}`,
    "",
    "Cosa fare adesso",
    `- Focus prossime 2 sedute: ${nextFocus}.`,
    sessionBullet,
    "- Sessione successiva: lavoro aerobico continuo + 6x50 progressivi in controllo tecnico.",
    shoulderLine,
    "",
    "Check prossimo",
    checkBullet,
    "",
    "Domanda mirata",
    questionBullet,
  ].join("\n");
}

function toGeminiPrompt(systemPrompt: string, history: CoachChatMessage[]): string {
  const transcript = history
    .slice(-16)
    .map((message) => `${message.role === "assistant" ? "Coach" : "Atleta"}: ${message.content}`)
    .join("\n");

  return [
    systemPrompt,
    "",
    "CONVERSAZIONE RECENTE",
    transcript,
    "",
    "Rispondi all'ultimo messaggio dell'atleta seguendo esattamente il formato richiesto.",
  ].join("\n");
}

async function generateWithGemini(systemPrompt: string, history: CoachChatMessage[]): Promise<string> {
  if (!geminiModel) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  const result = await geminiModel.generateContent(toGeminiPrompt(systemPrompt, history));
  const text = result.response.text().trim();
  if (!text) throw new Error("Gemini returned empty content");
  return text;
}

export async function generateCoachChatReply(
  userId: number,
  history: CoachChatMessage[],
  preferences?: CoachChatPreferences
): Promise<CoachChatResult> {
  const [profile, advancedResult, recentActivities, workoutsResult, insights] =
    await Promise.all([
      getSwimmerProfile(userId),
      getAdvancedMetrics(userId, 30).catch(() => null),
      getActivities(userId, 10, 0),
      getExistingWorkouts(userId).catch(() => null),
      listActivityInsights(userId, 5, 0).catch(() => []),
    ]);

  const context: CoachContext = {
    profile,
    advanced: advancedResult,
    recentActivities,
    workouts: workoutsResult,
    latestInsights: insights,
  };

  const safeHistory = history
    .slice(-20)
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }))
    .filter((message) => message.content.length > 0);

  if (safeHistory.length === 0) {
    return {
      message: fallbackMessage(context, safeHistory, preferences),
      generatedAt: new Date().toISOString(),
      fallback: true,
      provider: "rule_based",
    };
  }

  const systemPrompt = baseSystemPrompt(context, preferences);
  const hasForgeKey = (process.env.BUILT_IN_FORGE_API_KEY ?? "").trim().length > 0;

  if (hasForgeKey) {
    try {
      const result = await invokeLLM({
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          ...safeHistory,
        ],
      });

      const message = normalizeAssistantContent(result.choices?.[0]?.message?.content);
      if (!message) {
        throw new Error("Empty assistant response");
      }

      return {
        message,
        generatedAt: new Date().toISOString(),
        fallback: false,
        provider: "forge",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("[AI Coach Chat] Forge provider failed, trying Gemini fallback", {
        event: "ai_coach_chat:forge_failed",
        userId,
        message,
      });
    }
  }

  try {
    const message = await generateWithGemini(systemPrompt, safeHistory);
    return {
      message,
      generatedAt: new Date().toISOString(),
      fallback: false,
      provider: "gemini",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("[AI Coach Chat] Falling back due to LLM error", {
      event: "ai_coach_chat:fallback",
      userId,
      message,
    });

    return {
      message: fallbackMessage(context, safeHistory, preferences),
      generatedAt: new Date().toISOString(),
      fallback: true,
      provider: "rule_based",
    };
  }
}
