import { invokeLLM } from "./_core/llm";
import { getSwimmerProfile, getActivities } from "./db";
import { getSwimMetrics } from "./swim_metrics";
import {
  SWIM_METRICS_COACH_RULES,
  paceZoneCoachRules,
  swimMetricsForCoach,
  swimMetricsGlossary,
  zonePaceText,
} from "./swim_metrics/coach-context";
import {
  PACE_ZONE_BY_CODE,
  PACE_ZONE_CODES,
  TSB_READING_LABELS,
  type PaceZoneCode,
  type PaceZoneRange,
  type SwimMetrics,
} from "@shared/swimMetrics";
import { formatRestSeconds, parseRest } from "@shared/coachWorkout";
import { minRestSeconds, poolHistoryOf, type SafetyContext } from "./ai_coach_safety";
import { getExistingWorkouts } from "./ai_coach";
import { listActivityInsights } from "./ai_activity_insights";
import { hasHealthDataConsent } from "./consent";
import { logger } from "./middleware/logger";
import { ENV } from "./_core/env";
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
  swimMetrics: SwimMetrics | null;
  recentActivities: Awaited<ReturnType<typeof getActivities>>;
  workouts: Awaited<ReturnType<typeof getExistingWorkouts>> | null;
  latestInsights: Awaited<ReturnType<typeof listActivityInsights>>;
  /** The health-data consent: without it the session analyses (built on heart rate) stay out. */
  healthDataAllowed: boolean;
};

/** «m:ss/100m»; the total is rounded first, so 119.6 s is 2:00 and never 1:60. */
export function formatPace(secPer100m: number | null | undefined) {
  if (!secPer100m || secPer100m <= 0) return "n/d";
  const total = Math.round(secPer100m);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}/100m`;
}

function contextToPrompt(ctx: CoachContext) {
  const profile = ctx.profile;

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

${ctx.swimMetrics ? swimMetricsForCoach(ctx.swimMetrics) : "METRICHE DI NUOTO: non disponibili in questo momento."}

${swimMetricsGlossary()}

ULTIME ATTIVITA
${recentSummary.length ? recentSummary.join("\n") : "- Nessuna attività recente disponibile"}

ULTIMI SESSION IQ
${!ctx.healthDataAllowed
  ? "- Non disponibili: l'atleta non ha dato il consenso al trattamento dei dati sanitari, quindi frequenza cardiaca, zone cardio, training effect, VO2max, recupero e stress sono esclusi. Non chiederli e non usarli."
  : insightRows.length ? insightRows.join("\n") : "- Nessun insight sessione disponibile"}

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
${SWIM_METRICS_COACH_RULES}
${paceZoneCoachRules(ctx.swimMetrics?.zones ?? null, poolHistoryOf(ctx.recentActivities))}
- se l'utente dice che oggi e' stanco/lento, riduci volume/intensita' e proponi una seduta di qualita' tecnica;
- se l'obiettivo e' 50/100 stile, inserisci lavoro specifico di velocita' e partenze/virate.

Formato di risposta preferito:
1) "Lettura dati" (max 2 bullet)
2) "Cosa fare adesso" (max 3 bullet con target concreti)
3) "Le zone di oggi" (ogni volta che nella risposta ci sono zone: una riga per ogni zona usata, con codice, livello, passo e sensazione; senza zone ometti la sezione)
4) "Check prossimo" (1 bullet: cosa monitorare nella prossima sessione)
5) "Domanda mirata" (1 domanda breve per affinare il piano)

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

const GEMINI_MODEL = ENV.geminiTextModel;
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

/** A rep of the rule-based sessions: «8×100 B1 · Medio 1:50–1:56, rec. 20″». */
type FallbackRep = {
  meters: number;
  code: PaceZoneCode;
  count?: number;
  /** Groups of the rep: «2 serie di 6×25». */
  sets?: number;
  label?: string;
  rest?: string;
  /** False for drill or other strokes: the zone paces hold for freestyle only. */
  freestyle?: boolean;
};

/**
 * The rest of a rule-based rep: the one written, or longer when the safety limits want it (C2 at
 * least the rep time, C3 three times, at the athlete's zone pace).
 */
function safeRest(rep: FallbackRep, safety: SafetyContext): string | undefined {
  if (!rep.rest) return rep.rest;
  const min = minRestSeconds(rep.code, { name: "", repMeters: rep.meters }, safety);
  const written = parseRest(rep.rest)?.seconds ?? 0;
  return min !== null && written < min ? formatRestSeconds(min) : rep.rest;
}

function repText(rep: FallbackRep, safety: SafetyContext): string {
  const ranges = safety.zones?.ranges ?? [];
  const range = rep.freestyle === false ? undefined : ranges.find((candidate) => candidate.code === rep.code);
  const paceText = range ? zonePaceText(range) : null;
  const pace = !range ? "" : range.fastPace !== null && range.slowPace !== null ? ` ${paceText}` : ` (${paceText})`;
  const reps = rep.count ? `${rep.sets ? `${rep.sets} serie di ` : ""}${rep.count}×${rep.meters}` : `${rep.meters}`;
  const rest = safeRest(rep, safety);
  return `${reps}${rep.label ? ` ${rep.label}` : ""} ${rep.code} · ${PACE_ZONE_BY_CODE[rep.code].level}${pace}${rest ? `, rec. ${rest}` : ""}`;
}

const sessionText = (reps: FallbackRep[], safety: SafetyContext) => reps.map((rep) => repText(rep, safety)).join(" + ");

/** «B1 · Medio (1:50–1:56/100 m): ritmo sostenuto, …», the pace only when the zones are known. */
function zoneLine(code: PaceZoneCode, ranges: PaceZoneRange[]): string {
  const zone = PACE_ZONE_BY_CODE[code];
  const range = ranges.find((candidate) => candidate.code === code);
  return `- ${code} · ${zone.level}${range ? ` (${zonePaceText(range)}/100 m)` : ""}: ${zone.explanation}`;
}

function fallbackMessage(
  ctx: CoachContext,
  history: CoachChatMessage[],
  preferences?: CoachChatPreferences
) {
  const metrics = ctx.swimMetrics;
  const css = metrics?.css.current ?? null;
  const loadToday = metrics?.load.today ?? null;
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
    loadToday?.reading === "carico_alto"
      ? "recupero + tecnica pulita"
      : metrics && metrics.volume.avgSessions4 < 2
        ? "regolarità (almeno 2 nuotate a settimana)"
        : "progressione controllata del volume";

  const metricsLine = metrics
    ? [
        css ? `Passo soglia ${formatPace(css.paceSecondsPer100)} (${css.source === "test" ? "test" : `stima, affidabilità ${css.confidence}`})` : "Passo soglia n/d",
        loadToday
          ? `equilibrio ${loadToday.tsb > 0 ? "+" : loadToday.tsb < 0 ? "−" : ""}${Math.abs(loadToday.tsb).toFixed(1).replace(".", ",")} (${TSB_READING_LABELS[loadToday.reading]})`
          : "equilibrio n/d",
        `${metrics.volume.avgKm4.toFixed(1).replace(".", ",")} km/settimana`,
      ].join(" · ")
    : "Metriche non disponibili";

  const latestLine = latest
    ? `Ultima sessione: ${latest.distanceMeters}m in ${Math.round(latest.durationSeconds / 60)} min, passo ${formatPace(latest.avgPacePer100m ?? null)}.`
    : "Non vedo sessioni recenti, quindi parto da una base conservativa.";

  // Every rep with zone, level and the athlete's pace (rules of paceZoneCoachRules), rests
  // within the safety limits.
  const ranges = metrics?.zones.ranges ?? [];
  const safety: SafetyContext = { zones: metrics?.zones ?? null, history: null, referencePace: latest?.avgPacePer100m ?? null };
  let today: FallbackRep[] = [
    { meters: 300, code: "A1" },
    { count: 8, meters: 100, code: "B1", rest: "20″" },
    { count: 6, meters: 50, code: "B2", rest: "20″" },
    { meters: 200, code: "A1" },
  ];
  let sessionLabel = "Sessione oggi";
  let checkBullet = "- Monitora passo medio/100m e sensazione di fatica (RPE) a fine seduta.";
  let questionBullet = "- Quante sedute reali puoi fare nei prossimi 7 giorni (2/3/4)?";

  if (mentionsFatigue) {
    sessionLabel = "Sessione oggi (scarico)";
    today = [
      { meters: 200, code: "A1" },
      { count: 10, meters: 50, label: "tecnica", code: "A1", rest: "20″", freestyle: false },
      { count: 6, meters: 75, code: "A2", rest: "20″" },
      { meters: 150, code: "A1" },
    ];
    checkBullet = "- Se RPE supera 6/10 o il passo peggiora oltre 3\"/100m, chiudi la serie principale.";
    questionBullet = "- Domani vuoi seduta breve tecnica (35-40') o riposo completo?";
  } else if (speedGoal) {
    sessionLabel = "Sessione oggi (focus 50/100)";
    today = [
      { meters: 300, code: "A1" },
      { sets: 2, count: 6, meters: 25, code: "C3", rest: "30″" },
      { count: 4, meters: 50, code: "C2", rest: "1′" },
      { meters: 200, code: "A1" },
    ];
    checkBullet = "- Monitora tempo medio sui 25 veloci e mantenimento tecnica nelle ultime ripetute.";
    questionBullet = "- Hai riferimenti cronometrici attuali su 25m o 50m per calibrare i target?";
  }
  const next: FallbackRep[] = [
    { count: 3, meters: 400, code: "A2", rest: "30″" },
    { count: 6, meters: 50, code: "B1", rest: "15″" },
  ];
  const sessionBullet = `- ${sessionLabel}: ${sessionText(today, safety)}.`;
  const used = new Set([...today, ...next].map((rep) => rep.code));
  const zoneLines = PACE_ZONE_CODES.filter((code) => used.has(code)).map((code) => zoneLine(code, ranges));
  if (ranges.length === 0) zoneLines.push("- Passi delle zone non disponibili: servono il passo soglia o le tue zone.");

  const shoulderLine = mentionsShoulder
    ? "- Vincolo spalla: evita palette/farfalla e interrompi se dolore >3/10, valutando un professionista."
    : "- Vincoli dichiarati: nessuna limitazione critica segnalata.";

  return [
    "Lettura dati",
    `- ${metricsLine}`,
    `- ${latestLine}`,
    `- Obiettivo: ${goal || "n/d"} · Vincoli: ${constraints || "n/d"}`,
    "",
    "Cosa fare adesso",
    `- Focus prossime 2 sedute: ${nextFocus}.`,
    sessionBullet,
    `- Sessione successiva: ${sessionText(next, safety)}, curando la tecnica.`,
    shoulderLine,
    "",
    "Le zone di oggi",
    ...zoneLines,
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
  // The session analyses interpret heart rate and training effect: read only with the
  // health-data consent.
  const healthDataAllowed = await hasHealthDataConsent(userId);
  const [profile, swimMetrics, recentActivities, workoutsResult, insights] =
    await Promise.all([
      getSwimmerProfile(userId),
      getSwimMetrics(userId).catch(() => null),
      getActivities(userId, 10, 0),
      getExistingWorkouts(userId).catch(() => null),
      healthDataAllowed ? listActivityInsights(userId, 5, 0).catch(() => []) : Promise.resolve([]),
    ]);

  const context: CoachContext = {
    profile,
    swimMetrics,
    recentActivities,
    workouts: workoutsResult,
    latestInsights: insights,
    healthDataAllowed,
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
