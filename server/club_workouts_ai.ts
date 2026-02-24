import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ClubPoolWorkoutDirective, ClubPoolWorkoutPlan, ClubPoolWorkoutBlock } from "@shared/types";
import { logger } from "./middleware/logger";

const MODEL_NAME = (process.env.GEMINI_MODEL ?? "gemini-2.5-flash").trim() || "gemini-2.5-flash";
const PROMPT_VERSION = "club_pool_workout_v2";
const REQUEST_TIMEOUT_MS = 15_000;
const PHASE_ORDER: ClubPoolWorkoutBlock["phase"][] = ["warmup", "activation", "main", "cooldown"];

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

function defaultSendoffForIntensity(intensity: ClubPoolWorkoutDirective["intensity"]) {
  if (intensity === "hard") return "1:35";
  if (intensity === "easy") return "1:55";
  return "1:45";
}

function parseMetersFromToken(value?: string) {
  if (!value) return 0;
  const normalized = value.toLowerCase().trim();
  const repsDistance = normalized.match(/(\d+)\s*x\s*(\d+)\s*m?/);
  if (repsDistance) return Number(repsDistance[1]) * Number(repsDistance[2]);
  const singleDistance = normalized.match(/(\d+)\s*m/);
  if (singleDistance) return Number(singleDistance[1]);
  return 0;
}

function metersFromItem(item: ClubPoolWorkoutBlock["items"][number]) {
  const fromReps = parseMetersFromToken(item.reps);
  if (fromReps > 0) return fromReps;
  const fromDistance = parseMetersFromToken(item.distance);
  if (fromDistance > 0) return fromDistance;
  return 0;
}

function totalMeters(plan: ClubPoolWorkoutPlan) {
  return plan.blocks.reduce((acc, block) => acc + block.items.reduce((inner, item) => inner + metersFromItem(item), 0), 0);
}

function fallbackBlocksFromDirectives(directives: ClubPoolWorkoutDirective): ClubPoolWorkoutBlock[] {
  const targetMeters = estimateDistanceTarget(directives);
  const byPhase = splitPhaseMeters(targetMeters);
  const strokes = directives.strokeMix.length > 0 ? directives.strokeMix : ["sl"];
  const focusLabel = directives.focus.join(", ") || "tecnica";
  const mainSendoff = defaultSendoffForIntensity(directives.intensity);

  return [
    {
      phase: "warmup",
      label: "Riscaldamento",
      items: [
        {
          label: "Nuoto sciolto progressivo",
          stroke: "Misti",
          reps: "2x200",
          distance: `${Math.max(400, Math.round(byPhase.warmup / 50) * 50)}m`,
          sendoff: "3:40",
          rest: "15s",
          intensity: "easy",
          targetPace: "RPE 3-4",
          notes: "Respirazione regolare e allineamento",
        },
        {
          label: "Drill tecnici",
          stroke: titleCaseStroke(strokes[0]),
          reps: "4x50",
          distance: "200m",
          sendoff: "1:05",
          rest: "15s",
          intensity: "easy",
          targetPace: "Controllato",
          notes: `Focus ${focusLabel}`,
        },
      ],
    },
    {
      phase: "activation",
      label: "Attivazione",
      items: [
        {
          label: "Progressivi tecnici",
          stroke: titleCaseStroke(strokes[1] ?? strokes[0]),
          reps: "4x100",
          distance: `${Math.max(300, Math.round(byPhase.activation / 50) * 50)}m`,
          sendoff: "1:55",
          rest: "20s",
          intensity: "mixed",
          targetPace: "RPE 5-6",
          notes: "Ultimi 25m in accelerazione",
        },
        {
          label: "Scatti controllo ritmo",
          stroke: titleCaseStroke(strokes[0]),
          reps: "4x50",
          distance: "200m",
          sendoff: "1:00",
          rest: "20s",
          intensity: "mixed",
          targetPace: "RPE 6-7",
          notes: "Partenze precise",
        },
      ],
    },
    {
      phase: "main",
      label: "Serie principale",
      items: [
        {
          label: "Serie centrale ritmo gara",
          stroke: titleCaseStroke(strokes[0]),
          reps: directives.sessionMinutes >= 75 ? "10x100" : "8x100",
          distance: `${Math.max(1200, Math.round(byPhase.main / 50) * 50)}m`,
          sendoff: mainSendoff,
          rest: "20s",
          intensity: directives.intensity,
          targetPace: directives.intensity === "hard" ? "RPE 8-9" : directives.intensity === "easy" ? "RPE 5-6" : "RPE 7-8",
          notes: "Negativi sugli ultimi 50m",
        },
        {
          label: "Velocità lattacida",
          stroke: titleCaseStroke(strokes[1] ?? "mx"),
          reps: "8x50",
          distance: "400m",
          sendoff: directives.intensity === "hard" ? "1:05" : "1:10",
          rest: "25s",
          intensity: directives.intensity === "easy" ? "mixed" : "hard",
          targetPace: directives.intensity === "hard" ? "RPE 9" : "RPE 7-8",
          notes: directives.equipment.length > 0 ? `Attrezzi: ${directives.equipment.join(", ")}` : "Senza attrezzi",
        },
      ],
    },
    {
      phase: "cooldown",
      label: "Defaticamento",
      items: [
        {
          label: "Nuoto facile",
          stroke: "Misti",
          reps: "2x100",
          distance: `${Math.max(200, Math.round(byPhase.cooldown / 50) * 50)}m`,
          sendoff: "2:20",
          rest: "10s",
          intensity: "easy",
          targetPace: "RPE 2-3",
          notes: "Rilassamento e ampiezza",
        },
        {
          label: "Tecnica sciolta",
          stroke: titleCaseStroke(strokes[0]),
          reps: "4x50",
          distance: "200m",
          sendoff: "1:15",
          rest: "15s",
          intensity: "easy",
          targetPace: "Molto facile",
          notes: "Controllo finale",
        },
      ],
    },
  ];
}

function fallbackPlan(sessionDate: string, directives: ClubPoolWorkoutDirective): ClubPoolWorkoutPlan {
  const targetMeters = estimateDistanceTarget(directives);
  return {
    title: `Allenamento vasca ${sessionDate}`,
    description: `Allenamento dettagliato (${directives.sessionMinutes} min) basato sulle direttive del coach.`,
    totalDistance: `${targetMeters}m`,
    estimatedDuration: `${directives.sessionMinutes} min`,
    blocks: fallbackBlocksFromDirectives(directives),
    coachNotes: [
      "Piano in fallback dettagliato: controlla i ritmi prima di pubblicare.",
      directives.notes?.trim() ? `Nota coach: ${directives.notes.trim()}` : "Adatta recuperi in base al livello del gruppo.",
    ],
  };
}

function buildPrompt(params: { sessionDate: string; directives: ClubPoolWorkoutDirective }) {
  const { sessionDate, directives } = params;
  const targetDistance = directives.targetDistanceMeters ? `${directives.targetDistanceMeters}m` : "coerente con durata/volume";
  const strokes = (directives.strokeMix.length > 0 ? directives.strokeMix : ["sl"]).map(titleCaseStroke).join(", ");
  const coachNotes = directives.notes?.trim() || "nessuna";

  return `Sei un coach di nuoto master esperto. Genera SOLO un allenamento generale in vasca per gruppo club (non personalizzato per singolo atleta).

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
          "distance": "string",
          "reps": "string",
          "sendoff": "tempo di ripartenza es. 1:45",
          "rest": "tempo recupero es. 20s",
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
- Ogni blocco deve avere almeno 2 esercizi.
- Ogni esercizio deve avere: label, stroke, reps o distance, sendoff, rest, intensity.
- Nel blocco main inserire ripetute dettagliate (es 10x100, 8x50) con ripartenze e recuperi realistici.
- Testo tecnico in italiano, niente frasi generiche.
- Rispetta il più possibile la distanza target e le indicazioni del coach.
- Nessun testo fuori dal JSON.`;
}

function sanitizePlan(raw: unknown, fallback: ClubPoolWorkoutPlan): ClubPoolWorkoutPlan {
  if (!raw || typeof raw !== "object") return fallback;
  const value = raw as Record<string, unknown>;
  const blocks = Array.isArray(value.blocks) ? value.blocks : [];
  if (!blocks.length) return fallback;

  const normalizedBlocks: ClubPoolWorkoutBlock[] = blocks
    .map((block) => {
      const b = block as Record<string, unknown>;
      const phase = String(b.phase ?? "").trim().toLowerCase();
      if (!PHASE_ORDER.includes(phase as ClubPoolWorkoutBlock["phase"])) return null;
      const itemsRaw = Array.isArray(b.items) ? b.items : [];
      const items = itemsRaw
        .map((item) => {
          const it = item as Record<string, unknown>;
          const label = String(it.label ?? "").trim();
          if (!label) return null;
          return {
            label,
            stroke: typeof it.stroke === "string" ? it.stroke : undefined,
            distance: typeof it.distance === "string" ? it.distance : undefined,
            reps: typeof it.reps === "string" ? it.reps : undefined,
            sendoff: typeof it.sendoff === "string" ? it.sendoff : undefined,
            rest: typeof it.rest === "string" ? it.rest : undefined,
            intensity: typeof it.intensity === "string" ? it.intensity : undefined,
            targetPace: typeof it.targetPace === "string" ? it.targetPace : undefined,
            notes: typeof it.notes === "string" ? it.notes : undefined,
          };
        })
        .filter(Boolean) as ClubPoolWorkoutBlock["items"];
      if (!items.length) return null;
      return {
        phase: phase as ClubPoolWorkoutBlock["phase"],
        label: String(b.label ?? "").trim() || phase,
        items,
      };
    })
    .filter(Boolean) as ClubPoolWorkoutBlock[];

  if (normalizedBlocks.length < 2) return fallback;

  return {
    title: String(value.title ?? "").trim() || fallback.title,
    description: String(value.description ?? "").trim() || fallback.description,
    totalDistance: String(value.totalDistance ?? "").trim() || fallback.totalDistance,
    estimatedDuration: String(value.estimatedDuration ?? "").trim() || fallback.estimatedDuration,
    blocks: normalizedBlocks,
    coachNotes: Array.isArray(value.coachNotes)
      ? value.coachNotes.map((item) => String(item)).filter((item) => item.trim().length > 0).slice(0, 8)
      : fallback.coachNotes,
  };
}

function ensureDetailedPlan(plan: ClubPoolWorkoutPlan, directives: ClubPoolWorkoutDirective): ClubPoolWorkoutPlan {
  const targetMeters = estimateDistanceTarget(directives);
  const byPhase = splitPhaseMeters(targetMeters);
  const fallback = fallbackPlan(new Date().toISOString().slice(0, 10), directives);
  const strokes = directives.strokeMix.length > 0 ? directives.strokeMix : ["sl"];

  const blocks: ClubPoolWorkoutBlock[] = PHASE_ORDER.map((phase, phaseIndex) => {
    const fromPlan = plan.blocks.find((block) => block.phase === phase) ?? fallback.blocks.find((block) => block.phase === phase)!;
    const sourceItems = Array.isArray(fromPlan.items) ? fromPlan.items : [];
    const enriched = sourceItems.map((item, itemIndex) => {
      const stroke = item.stroke || titleCaseStroke(strokes[(phaseIndex + itemIndex) % strokes.length]);
      const reps = item.reps || (phase === "main" ? "8x100" : "4x50");
      const distance = item.distance || `${Math.max(200, Math.round((byPhase as Record<string, number>)[phase] / Math.max(2, sourceItems.length) / 50) * 50)}m`;
      const sendoff = item.sendoff || (phase === "main" ? defaultSendoffForIntensity(directives.intensity) : "1:10");
      const rest = item.rest || (phase === "main" ? "20s" : "15s");
      const intensity = item.intensity || (phase === "warmup" || phase === "cooldown" ? "easy" : directives.intensity);
      const targetPace = item.targetPace || (phase === "main" ? "RPE 7-8" : "RPE 4-6");
      const notes = item.notes || `Focus ${directives.focus.join(", ") || "tecnica"}`;
      return {
        label: item.label || `${fromPlan.label} ${itemIndex + 1}`,
        stroke,
        distance,
        reps,
        sendoff,
        rest,
        intensity,
        targetPace,
        notes,
      };
    });

    while (enriched.length < 2) {
      const idx = enriched.length;
      enriched.push({
        label: `${fromPlan.label} ${idx + 1}`,
        stroke: titleCaseStroke(strokes[(phaseIndex + idx) % strokes.length]),
        distance: phase === "main" ? "400m" : "200m",
        reps: phase === "main" ? "4x100" : "4x50",
        sendoff: phase === "main" ? defaultSendoffForIntensity(directives.intensity) : "1:10",
        rest: phase === "main" ? "20s" : "15s",
        intensity: phase === "warmup" || phase === "cooldown" ? "easy" : directives.intensity,
        targetPace: phase === "main" ? "RPE 7-8" : "RPE 4-6",
        notes: `Focus ${directives.focus.join(", ") || "tecnica"}`,
      });
    }

    return {
      phase,
      label: fromPlan.label,
      items: enriched,
    };
  });

  const detailed: ClubPoolWorkoutPlan = {
    title: plan.title || fallback.title,
    description: plan.description || fallback.description,
    totalDistance: plan.totalDistance || fallback.totalDistance,
    estimatedDuration: plan.estimatedDuration || `${directives.sessionMinutes} min`,
    blocks,
    coachNotes: plan.coachNotes?.length ? plan.coachNotes : fallback.coachNotes,
  };

  const computed = totalMeters(detailed);
  const total = directives.targetDistanceMeters && directives.targetDistanceMeters > 0
    ? directives.targetDistanceMeters
    : computed > 0
      ? computed
      : targetMeters;

  return {
    ...detailed,
    totalDistance: `${Math.round(total)}m`,
  };
}

export async function generateClubPoolWorkoutPlan(params: {
  sessionDate: string;
  directives: ClubPoolWorkoutDirective;
}) {
  const fallback = fallbackPlan(params.sessionDate, params.directives);
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      plan: fallback,
      status: "partial" as const,
      provider: "gemini",
      model: MODEL_NAME,
      promptVersion: PROMPT_VERSION,
      rawResponse: null,
      error: "GEMINI_API_KEY mancante",
    };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });
    const prompt = buildPrompt(params);

    const result = (await Promise.race([
      model.generateContent(prompt),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`AI timeout after ${REQUEST_TIMEOUT_MS}ms`)), REQUEST_TIMEOUT_MS)),
    ])) as { response?: { text?: () => string } };

    const text = String(result?.response?.text?.() ?? "").trim();
    const clean = text.replace(/^```json\s*/i, "").replace(/^```/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(clean);
    const plan = ensureDetailedPlan(sanitizePlan(parsed, fallback), params.directives);

    return {
      plan,
      status: "success" as const,
      provider: "gemini",
      model: MODEL_NAME,
      promptVersion: PROMPT_VERSION,
      rawResponse: clean.slice(0, 12000),
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[club_workouts_ai] fallback used: ${message}`, {
      event: "club_workouts_ai:fallback",
      message,
    });

    return {
      plan: fallback,
      status: "partial" as const,
      provider: "gemini",
      model: MODEL_NAME,
      promptVersion: PROMPT_VERSION,
      rawResponse: null,
      error: message,
    };
  }
}
