import type { ClubPoolWorkoutDirective, ClubPoolWorkoutPlan, ClubPoolWorkoutBlock } from "@shared/types";
import { normalizeWorkoutSeriesItem, parseRepsSpec, parseMetersValue, toCanonicalReps, toSeriesDistanceLabel } from "@shared/workout-series";
import { generateText } from "./_core/text_llm";
import { logger } from "./middleware/logger";
import { config } from "./config";

const PRIMARY_MODEL_NAME =
  (process.env.CLUB_WORKOUTS_AI_MODEL_PRIMARY ??
    process.env.CLUB_WORKOUTS_AI_MODEL ??
    process.env.LOCAL_LLM_MODEL ??
    config.CLUB_WORKOUTS_AI_MODEL_PRIMARY)
    .trim() || "qwen3:8b";
const ESCALATION_MODEL_NAME =
  (process.env.CLUB_WORKOUTS_AI_MODEL_ESCALATION ??
    process.env.LOCAL_LLM_FALLBACK_MODEL ??
    config.CLUB_WORKOUTS_AI_MODEL_ESCALATION).trim() ||
  "qwen3:4b";
const QUALITY_THRESHOLD = config.CLUB_WORKOUTS_AI_QUALITY_THRESHOLD;
const PROMPT_VERSION = "club_pool_workout_v3_qgate";
const REQUEST_TIMEOUT_MS = config.CLUB_WORKOUTS_AI_TIMEOUT_MS;
const REQUEST_TIMEOUT_SOFT_MS = config.CLUB_WORKOUTS_AI_REQUEST_TIMEOUT_SOFT_MS;
const PHASE_ORDER: ClubPoolWorkoutBlock["phase"][] = ["warmup", "activation", "main", "cooldown"];

type WorkoutQualityAssessment = {
  plan: ClubPoolWorkoutPlan;
  score: number;
  warnings: string[];
  hardIssues: string[];
  autoFixes: number;
};

type ModelAttemptResult = {
  model: string;
  elapsedMs: number;
  rawResponse: string;
  assessment: WorkoutQualityAssessment;
};

function titleCaseStroke(stroke: string) {
  const normalized = String(stroke ?? "").trim().toLowerCase();
  const map: Record<string, string> = {
    sl: "Stile Libero",
    do: "Dorso",
    ra: "Rana",
    de: "Delfino",
    mx: "Misti",
  };
  return map[normalized] ?? normalized.toUpperCase();
}

function estimateDistanceTarget(directives: ClubPoolWorkoutDirective) {
  if (directives.targetDistanceMeters && directives.targetDistanceMeters > 0) return directives.targetDistanceMeters;
  if (directives.sessionMinutes >= 90) return 3600;
  if (directives.sessionMinutes >= 75) return 3200;
  if (directives.sessionMinutes >= 60) return 2800;
  return 2300;
}

function splitPhaseMeters(targetMeters: number) {
  const warmup = Math.round(targetMeters * 0.2);
  const activation = Math.round(targetMeters * 0.15);
  const main = Math.round(targetMeters * 0.55);
  const cooldown = Math.max(100, targetMeters - warmup - activation - main);
  return { warmup, activation, main, cooldown };
}

function secondsToClock(totalSeconds: number) {
  const safe = Math.max(30, Math.round(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function defaultSendoffForSeries(distancePerRepMeters: number, intensity: ClubPoolWorkoutDirective["intensity"]) {
  const baseByDistance: Record<number, number> = {
    25: 40,
    50: 60,
    75: 90,
    100: 110,
    150: 170,
    200: 240,
    300: 360,
    400: 510,
  };
  const fallbackBase = Math.round(distancePerRepMeters * 1.15);
  const base = baseByDistance[distancePerRepMeters] ?? fallbackBase;
  const intensityAdjustment = intensity === "hard" ? -8 : intensity === "easy" ? 12 : 0;
  return secondsToClock(base + intensityAdjustment);
}

function defaultBetweenSetsRest(
  phase: ClubPoolWorkoutBlock["phase"],
  intensity: ClubPoolWorkoutDirective["intensity"],
) {
  if (phase === "main") {
    if (intensity === "hard") return "30s";
    if (intensity === "easy") return "20s";
    return "25s";
  }
  if (phase === "activation") return "20s";
  if (phase === "warmup") return "15s";
  return "15s";
}

function parseMetersFromReps(value?: string) {
  const parsed = parseRepsSpec(value);
  if (!parsed) return 0;
  return parsed.repsCount * parsed.distancePerRepMeters;
}

function metersFromItem(item: ClubPoolWorkoutBlock["items"][number]) {
  if (item.seriesDistanceMeters && item.seriesDistanceMeters > 0) return item.seriesDistanceMeters;
  const repsMeters = parseMetersFromReps(item.reps);
  if (repsMeters > 0) return repsMeters;
  const labelMeters = parseMetersValue(item.seriesDistanceLabel);
  if (labelMeters) return labelMeters;
  const distanceMeters = parseMetersValue(item.distance);
  return distanceMeters ?? 0;
}

function totalMeters(plan: ClubPoolWorkoutPlan) {
  return plan.blocks.reduce((acc, block) => acc + block.items.reduce((inner, item) => inner + metersFromItem(item), 0), 0);
}

function buildSeriesItem(params: {
  label: string;
  stroke: string;
  repsCount: number;
  distancePerRepMeters: number;
  intensity: string;
  targetPace: string;
  notes: string;
  sendoff?: string;
  betweenSetsRest?: string;
}) {
  const reps = toCanonicalReps(params.repsCount, params.distancePerRepMeters);
  const seriesDistanceMeters = params.repsCount * params.distancePerRepMeters;
  const seriesDistanceLabel = toSeriesDistanceLabel(seriesDistanceMeters);
  return {
    label: params.label,
    stroke: params.stroke,
    reps,
    repsCount: params.repsCount,
    distancePerRepMeters: params.distancePerRepMeters,
    seriesDistanceMeters,
    seriesDistanceLabel,
    sendoff: params.sendoff,
    betweenSetsRest: params.betweenSetsRest,
    intensity: params.intensity,
    targetPace: params.targetPace,
    notes: params.notes,
    distance: seriesDistanceLabel,
    rest: params.betweenSetsRest,
  };
}

function fallbackBlocksFromDirectives(directives: ClubPoolWorkoutDirective): ClubPoolWorkoutBlock[] {
  const strokes = directives.strokeMix.length > 0 ? directives.strokeMix : ["sl"];
  const focusLabel = directives.focus.join(", ") || "tecnica";
  const mainIntensity = directives.intensity;

  return [
    {
      phase: "warmup",
      label: "Riscaldamento Generale e Sensibilità",
      items: [
        buildSeriesItem({
          label: "Nuoto sciolto progressivo",
          stroke: "Misti",
          repsCount: 4,
          distancePerRepMeters: 50,
          sendoff: defaultSendoffForSeries(50, "easy"),
          betweenSetsRest: defaultBetweenSetsRest("warmup", "easy"),
          intensity: "easy",
          targetPace: "RPE 3-4",
          notes: "Allineamento e respirazione controllata",
        }),
        buildSeriesItem({
          label: "Drill tecnici",
          stroke: titleCaseStroke(strokes[0]),
          repsCount: 4,
          distancePerRepMeters: 50,
          sendoff: defaultSendoffForSeries(50, "easy"),
          intensity: "easy",
          targetPace: "RPE 4",
          notes: `Focus ${focusLabel}`,
        }),
      ],
    },
    {
      phase: "activation",
      label: "Attivazione Muscolare e Tecnica Specifica",
      items: [
        buildSeriesItem({
          label: "Progressivi controllati",
          stroke: titleCaseStroke(strokes[0]),
          repsCount: 4,
          distancePerRepMeters: 100,
          sendoff: defaultSendoffForSeries(100, "mixed"),
          betweenSetsRest: defaultBetweenSetsRest("activation", "mixed"),
          intensity: "mixed",
          targetPace: "RPE 5-6",
          notes: "Ultimi 25m in accelerazione progressiva",
        }),
        buildSeriesItem({
          label: "Tecnica con andature",
          stroke: titleCaseStroke(strokes[1] ?? strokes[0]),
          repsCount: 4,
          distancePerRepMeters: 50,
          sendoff: defaultSendoffForSeries(50, "mixed"),
          intensity: "mixed",
          targetPace: "RPE 5",
          notes: "Controllo ampiezza e frequenza",
        }),
      ],
    },
    {
      phase: "main",
      label: "Corpo Centrale: Aerobico e Ritmo",
      items: [
        buildSeriesItem({
          label: "Serie aerobica di qualità",
          stroke: titleCaseStroke(strokes[0]),
          repsCount: directives.sessionMinutes >= 75 ? 10 : 8,
          distancePerRepMeters: 100,
          sendoff: defaultSendoffForSeries(100, mainIntensity),
          betweenSetsRest: defaultBetweenSetsRest("main", mainIntensity),
          intensity: mainIntensity,
          targetPace: mainIntensity === "hard" ? "RPE 8" : mainIntensity === "easy" ? "RPE 6" : "RPE 7",
          notes: "Mantenere ritmo uniforme con split negativo nell'ultima coppia",
        }),
        buildSeriesItem({
          label: "Tecnica in fatica controllata",
          stroke: titleCaseStroke(strokes[1] ?? "mx"),
          repsCount: 6,
          distancePerRepMeters: 50,
          sendoff: defaultSendoffForSeries(50, mainIntensity === "easy" ? "mixed" : "hard"),
          intensity: mainIntensity === "easy" ? "mixed" : "hard",
          targetPace: mainIntensity === "hard" ? "RPE 8-9" : "RPE 7",
          notes: directives.equipment.length > 0 ? `Con attrezzi: ${directives.equipment.join(", ")}` : "Senza attrezzi",
        }),
      ],
    },
    {
      phase: "cooldown",
      label: "Defaticamento e Recupero",
      items: [
        buildSeriesItem({
          label: "Sciolto respirato",
          stroke: "Misti",
          repsCount: 4,
          distancePerRepMeters: 50,
          sendoff: defaultSendoffForSeries(50, "easy"),
          betweenSetsRest: defaultBetweenSetsRest("cooldown", "easy"),
          intensity: "easy",
          targetPace: "RPE 2-3",
          notes: "Allungare la nuotata e ridurre la frequenza",
        }),
        buildSeriesItem({
          label: "Chiusura tecnica",
          stroke: titleCaseStroke(strokes[0]),
          repsCount: 2,
          distancePerRepMeters: 100,
          sendoff: defaultSendoffForSeries(100, "easy"),
          intensity: "easy",
          targetPace: "RPE 2",
          notes: "Respirazione regolare e rilascio",
        }),
      ],
    },
  ];
}

function fallbackPlan(sessionDate: string, directives: ClubPoolWorkoutDirective): ClubPoolWorkoutPlan {
  const targetMeters = estimateDistanceTarget(directives);
  const blocks = fallbackBlocksFromDirectives(directives);
  const computedMeters = blocks.reduce(
    (total, block) => total + block.items.reduce((acc, item) => acc + Number(item.seriesDistanceMeters ?? 0), 0),
    0,
  );
  return {
    title: `Allenamento Master ${sessionDate}`,
    description: `Sessione vasca (${directives.sessionMinutes} min) per gruppo Master 35-60, con progressioni tecniche e controllo ritmo.`,
    totalDistance: `${computedMeters > 0 ? computedMeters : targetMeters}m`,
    estimatedDuration: `${directives.sessionMinutes} min`,
    blocks,
    coachNotes: [
      "Piano fallback dettagliato: verifica solo ripartenze finali in base al livello reale del gruppo.",
      directives.notes?.trim()
        ? `Nota coach applicata: ${directives.notes.trim()}`
        : "Per gruppi eterogenei usa variante conservativa +5\" su tutte le ripartenze.",
    ],
  };
}

function sanitizePlan(raw: unknown, fallback: ClubPoolWorkoutPlan): ClubPoolWorkoutPlan {
  if (!raw || typeof raw !== "object") return fallback;
  const value = raw as Record<string, unknown>;
  const blocksRaw = Array.isArray(value.blocks) ? value.blocks : [];
  const blocks: ClubPoolWorkoutBlock[] = [];
  for (const block of blocksRaw) {
    const payload = block as Record<string, unknown>;
    const phase = String(payload.phase ?? "").trim().toLowerCase();
    if (!PHASE_ORDER.includes(phase as ClubPoolWorkoutBlock["phase"])) continue;

    const itemsRaw = Array.isArray(payload.items) ? payload.items : [];
    const items: ClubPoolWorkoutBlock["items"] = [];

    for (const item of itemsRaw) {
      const source = item as Record<string, unknown>;
      const label = String(source.label ?? "").trim();
      if (!label) continue;

      const normalizedItem: ClubPoolWorkoutBlock["items"][number] = {
        label,
        stroke: typeof source.stroke === "string" ? source.stroke.trim() : undefined,
        reps: typeof source.reps === "string" ? source.reps.trim() : undefined,
        repsCount: typeof source.repsCount === "number" ? source.repsCount : undefined,
        distancePerRepMeters: typeof source.distancePerRepMeters === "number" ? source.distancePerRepMeters : undefined,
        seriesDistanceMeters: typeof source.seriesDistanceMeters === "number" ? source.seriesDistanceMeters : undefined,
        seriesDistanceLabel: typeof source.seriesDistanceLabel === "string" ? source.seriesDistanceLabel.trim() : undefined,
        sendoff: typeof source.sendoff === "string" ? source.sendoff.trim() : undefined,
        betweenSetsRest: typeof source.betweenSetsRest === "string" ? source.betweenSetsRest.trim() : undefined,
        intensity: typeof source.intensity === "string" ? source.intensity.trim() : undefined,
        targetPace: typeof source.targetPace === "string" ? source.targetPace.trim() : undefined,
        notes: typeof source.notes === "string" ? source.notes.trim() : undefined,
        distance: typeof source.distance === "string" ? source.distance.trim() : undefined,
        rest: typeof source.rest === "string" ? source.rest.trim() : undefined,
      };
      items.push(normalizedItem);
    }

    if (items.length === 0) continue;
    blocks.push({
      phase: phase as ClubPoolWorkoutBlock["phase"],
      label: String(payload.label ?? "").trim() || phase,
      items,
    });
  }

  if (blocks.length === 0) return fallback;

  return {
    title: String(value.title ?? "").trim() || fallback.title,
    description: String(value.description ?? "").trim() || fallback.description,
    totalDistance: String(value.totalDistance ?? "").trim() || fallback.totalDistance,
    estimatedDuration: String(value.estimatedDuration ?? "").trim() || fallback.estimatedDuration,
    blocks,
    coachNotes: Array.isArray(value.coachNotes)
      ? value.coachNotes
          .map((entry) => String(entry).trim())
          .filter((entry) => entry.length > 0)
          .slice(0, 10)
      : fallback.coachNotes,
  };
}

function normalizeAndScorePlan(
  plan: ClubPoolWorkoutPlan,
  fallback: ClubPoolWorkoutPlan,
  directives: ClubPoolWorkoutDirective,
): WorkoutQualityAssessment {
  const warnings: string[] = [];
  const hardIssues: string[] = [];
  let autoFixes = 0;

  const blocks = PHASE_ORDER.map((phase) => {
    const sourceBlock = plan.blocks.find((block) => block.phase === phase);
    const fallbackBlock = fallback.blocks.find((block) => block.phase === phase);
    if (!sourceBlock) {
      hardIssues.push(`missing_phase:${phase}`);
    }

    const sourceItems = (sourceBlock?.items?.length ? sourceBlock.items : fallbackBlock?.items ?? []).slice(0, 10);
    if (sourceItems.length < 2) {
      hardIssues.push(`not_enough_items:${phase}`);
    }

    const completedItems = [...sourceItems];
    const fallbackItems = fallbackBlock?.items ?? [];
    while (completedItems.length < 2 && fallbackItems.length > 0) {
      completedItems.push(fallbackItems[completedItems.length % fallbackItems.length]);
      autoFixes += 1;
      warnings.push(`item_autofilled:${phase}`);
    }

    const normalizedItems = completedItems.map((item, index) => {
      const distancePerRep =
        item.distancePerRepMeters ?? parseRepsSpec(item.reps)?.distancePerRepMeters ?? parseMetersValue(item.distance) ?? 100;
      const normalized = normalizeWorkoutSeriesItem(item, {
        isLastInBlock: index === completedItems.length - 1,
        defaultSendoff: defaultSendoffForSeries(distancePerRep, directives.intensity),
        defaultBetweenSetsRest:
          index === completedItems.length - 1 ? undefined : defaultBetweenSetsRest(phase, directives.intensity),
      });

      if (normalized.warnings.length > 0) {
        warnings.push(...normalized.warnings.map((entry) => `${phase}:${entry}`));
      }
      if (normalized.hardIssues.length > 0) {
        hardIssues.push(...normalized.hardIssues.map((entry) => `${phase}:${entry}`));
      }
      autoFixes += normalized.warnings.filter((entry) => entry.includes("default") || entry.includes("autof")).length;
      return normalized.item;
    });

    return {
      phase,
      label: sourceBlock?.label || fallbackBlock?.label || phase,
      items: normalizedItems,
    };
  });

  const total = totalMeters({ ...plan, blocks });
  const baseCoachNotes = plan.coachNotes.length > 0 ? plan.coachNotes : fallback.coachNotes;
  const normalizedCoachNotes = baseCoachNotes.filter((note) => note.trim().length > 0).slice(0, 8);
  if (normalizedCoachNotes.length === 0) {
    hardIssues.push("missing_coach_notes");
    normalizedCoachNotes.push("Aggiungi note coach prima della pubblicazione.");
  }

  const normalizedPlan: ClubPoolWorkoutPlan = {
    title: plan.title.trim() || fallback.title,
    description: plan.description.trim() || fallback.description,
    totalDistance: `${total > 0 ? total : estimateDistanceTarget(directives)}m`,
    estimatedDuration: plan.estimatedDuration.trim() || `${directives.sessionMinutes} min`,
    blocks,
    coachNotes: normalizedCoachNotes,
  };

  const hardPenalty = hardIssues.length * 0.12;
  const warningPenalty = warnings.length * 0.02;
  const score = Math.max(0, Math.min(1, Number((1 - hardPenalty - warningPenalty).toFixed(3))));

  return {
    plan: normalizedPlan,
    score,
    warnings,
    hardIssues,
    autoFixes,
  };
}

function buildPrompt(params: { sessionDate: string; directives: ClubPoolWorkoutDirective }) {
  const { sessionDate, directives } = params;
  const targetDistance = directives.targetDistanceMeters ? `${directives.targetDistanceMeters}m` : "coerente con durata/volume";
  const strokes = (directives.strokeMix.length > 0 ? directives.strokeMix : ["sl"]).map(titleCaseStroke).join(", ");
  const coachNotes = directives.notes?.trim() || "nessuna";

  return `Sei un head coach esperto di nuoto Master (35-60 anni). Genera SOLO un allenamento generale in vasca per gruppo, non personalizzato per singolo atleta.

Direttive coach (vincolanti):
- Data: ${sessionDate}
- Durata: ${directives.sessionMinutes} minuti
- Distanza target: ${targetDistance}
- Volume: ${directives.volume}
- Intensità: ${directives.intensity}
- Focus: ${directives.focus.join(", ") || "tecnica"}
- Stili richiesti: ${strokes}
- Attrezzi consentiti: ${directives.equipment.join(", ") || "nessuno"}
- Nota coach: ${coachNotes}

Rispondi SOLO con JSON valido:
{
  "title": "string",
  "description": "string",
  "totalDistance": "es. 2800m",
  "estimatedDuration": "es. 60 min",
  "blocks": [
    {
      "phase": "warmup|activation|main|cooldown",
      "label": "string",
      "items": [
        {
          "label": "string",
          "stroke": "string",
          "reps": "es. 4x100",
          "repsCount": 4,
          "distancePerRepMeters": 100,
          "seriesDistanceMeters": 400,
          "seriesDistanceLabel": "400m",
          "sendoff": "es. 1:45",
          "betweenSetsRest": "es. 20s",
          "intensity": "string",
          "targetPace": "string",
          "notes": "string"
        }
      ]
    }
  ],
  "coachNotes": ["string"]
}

Vincoli obbligatori:
- Esattamente 4 blocchi: warmup, activation, main, cooldown.
- Ogni blocco deve avere almeno 2 serie.
- Ogni serie deve avere reps/repsCount/distancePerRepMeters coerenti.
- seriesDistanceMeters deve essere uguale a repsCount * distancePerRepMeters.
- sendoff obbligatorio per ogni serie.
- betweenSetsRest è recupero SOLO prima della serie successiva, quindi assente nell'ultima serie di ogni blocco.
- Linguaggio tecnico in italiano, stile coach Master: progressioni realistiche, gestione fatica, tecnica e ritmo.
- Evita prescrizioni elite non sostenibili per amatori 35-60.
- Nessun testo fuori dal JSON.`;
}

async function generateModelContent(params: {
  modelName: string;
  prompt: string;
}) {
  const { modelName, prompt } = params;
  const startedAt = Date.now();
  const softTimeoutMs =
    REQUEST_TIMEOUT_SOFT_MS > 0 && REQUEST_TIMEOUT_SOFT_MS < REQUEST_TIMEOUT_MS ? REQUEST_TIMEOUT_SOFT_MS : null;
  let softTimeoutHandle: NodeJS.Timeout | null = null;

  if (softTimeoutMs) {
    softTimeoutHandle = setTimeout(() => {
      logger.warn("[club_workouts_ai] generation still running after soft timeout", {
        event: "club_workouts_ai:slow_generation",
        model: modelName,
        softTimeoutMs,
        hardTimeoutMs: REQUEST_TIMEOUT_MS,
        elapsedMs: Date.now() - startedAt,
      });
    }, softTimeoutMs);
  }

  try {
    const llm = await generateText({
      messages: [{ role: "user", content: prompt }],
      model: modelName,
      timeoutMs: REQUEST_TIMEOUT_MS,
      maxTokens: 1_500,
      temperature: 0.2,
    });
    const elapsedMs = Date.now() - startedAt;
    const rawText = String(llm.text ?? "").trim();
    const clean = rawText.replace(/^```json\s*/i, "").replace(/^```/i, "").replace(/```$/i, "").trim();
    return { clean, elapsedMs };
  } finally {
    if (softTimeoutHandle) {
      clearTimeout(softTimeoutHandle);
    }
  }
}

async function runModelAttempt(params: {
  modelName: string;
  prompt: string;
  directives: ClubPoolWorkoutDirective;
  fallback: ClubPoolWorkoutPlan;
}) {
  const content = await generateModelContent({
    modelName: params.modelName,
    prompt: params.prompt,
  });

  const parsed = JSON.parse(content.clean);
  const sanitized = sanitizePlan(parsed, params.fallback);
  const assessment = normalizeAndScorePlan(sanitized, params.fallback, params.directives);

  logger.info("[club_workouts_ai] generation completed", {
    event: "club_workouts_ai:success",
    model: params.modelName,
    timeoutMs: REQUEST_TIMEOUT_MS,
    elapsedMs: content.elapsedMs,
    qualityScore: assessment.score,
    hardIssues: assessment.hardIssues.length,
    warnings: assessment.warnings.length,
  });

  const result: ModelAttemptResult = {
    model: params.modelName,
    elapsedMs: content.elapsedMs,
    rawResponse: content.clean,
    assessment,
  };

  return result;
}

export async function generateClubPoolWorkoutPlan(params: {
  sessionDate: string;
  directives: ClubPoolWorkoutDirective;
}) {
  const fallback = fallbackPlan(params.sessionDate, params.directives);
  const prompt = buildPrompt(params);

  let primaryAttempt: ModelAttemptResult | null = null;
  let primaryError: string | null = null;
  try {
    primaryAttempt = await runModelAttempt({
      modelName: PRIMARY_MODEL_NAME,
      prompt,
      directives: params.directives,
      fallback,
    });
  } catch (error) {
    primaryError = error instanceof Error ? error.message : String(error);
    logger.warn("[club_workouts_ai] primary attempt failed", {
      event: "club_workouts_ai:primary_failed",
      model: PRIMARY_MODEL_NAME,
      message: primaryError,
    });
  }

  const shouldEscalate =
    !primaryAttempt ||
    primaryAttempt.assessment.hardIssues.length > 0 ||
    primaryAttempt.assessment.score < QUALITY_THRESHOLD;

  let escalationAttempt: ModelAttemptResult | null = null;
  let escalationError: string | null = null;

  if (shouldEscalate && ESCALATION_MODEL_NAME !== PRIMARY_MODEL_NAME) {
    try {
      escalationAttempt = await runModelAttempt({
        modelName: ESCALATION_MODEL_NAME,
        prompt,
        directives: params.directives,
        fallback,
      });
      logger.info("[club_workouts_ai] escalation attempt executed", {
        event: "club_workouts_ai:escalation_executed",
        primaryModel: PRIMARY_MODEL_NAME,
        escalationModel: ESCALATION_MODEL_NAME,
        primaryScore: primaryAttempt?.assessment.score ?? null,
        escalationScore: escalationAttempt.assessment.score,
      });
    } catch (error) {
      escalationError = error instanceof Error ? error.message : String(error);
      logger.warn("[club_workouts_ai] escalation attempt failed", {
        event: "club_workouts_ai:escalation_failed",
        model: ESCALATION_MODEL_NAME,
        message: escalationError,
      });
    }
  }

  const finalAttempt = (() => {
    if (primaryAttempt && escalationAttempt) {
      return escalationAttempt.assessment.score >= primaryAttempt.assessment.score ? escalationAttempt : primaryAttempt;
    }
    return escalationAttempt ?? primaryAttempt;
  })();

  if (!finalAttempt) {
    const errorMessage = escalationError ?? primaryError ?? "AI generation failed";
    logger.warn(`[club_workouts_ai] fallback used: ${errorMessage}`, {
      event: "club_workouts_ai:fallback",
      message: errorMessage,
      model: PRIMARY_MODEL_NAME,
      timeoutMs: REQUEST_TIMEOUT_MS,
    });

    return {
      plan: fallback,
      status: "partial" as const,
      provider: "local",
      model: PRIMARY_MODEL_NAME,
      promptVersion: PROMPT_VERSION,
      rawResponse: null,
      error: errorMessage,
      warnings: ["Fallback attivato per errore AI"],
      quality: {
        score: 0,
        threshold: QUALITY_THRESHOLD,
        escalated: shouldEscalate,
        autoFixes: 0,
      },
    };
  }

  const escalated = Boolean(escalationAttempt);
  const warnings = [...finalAttempt.assessment.warnings];
  if (finalAttempt.assessment.hardIssues.length > 0) {
    warnings.unshift(
      `Auto-fix applicato su ${finalAttempt.assessment.hardIssues.length} incoerenze (serie/ripartenze/recovery). Verifica il piano prima della pubblicazione.`,
    );
  }
  if (escalated) {
    warnings.unshift(`Quality gate: usato${finalAttempt.model === ESCALATION_MODEL_NAME ? "" : " anche"} modello escalation quando necessario.`);
  }

  const status = finalAttempt.assessment.hardIssues.length > 0 ? ("partial" as const) : ("success" as const);

  return {
    plan: finalAttempt.assessment.plan,
    status,
    provider: "local",
    model: finalAttempt.model,
    promptVersion: PROMPT_VERSION,
    rawResponse: finalAttempt.rawResponse.slice(0, 12000),
    error: status === "partial" ? `Auto-fix quality gate: ${finalAttempt.assessment.hardIssues.length} issue` : null,
    warnings,
    quality: {
      score: finalAttempt.assessment.score,
      threshold: QUALITY_THRESHOLD,
      escalated,
      autoFixes: finalAttempt.assessment.autoFixes,
    },
  };
}
