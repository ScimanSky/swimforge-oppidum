import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ClubPoolWorkoutDirective, ClubPoolWorkoutPlan, ClubPoolWorkoutBlock } from "@shared/types";
import { logger } from "./middleware/logger";

const MODEL_NAME = "gemini-2.5-flash";
const PROMPT_VERSION = "club_pool_workout_v1";
const REQUEST_TIMEOUT_MS = 15_000;

function fallbackBlocksFromDirectives(directives: ClubPoolWorkoutDirective): ClubPoolWorkoutBlock[] {
  const minutes = directives.sessionMinutes;
  const baseMainReps = minutes >= 90 ? "10x100" : minutes >= 75 ? "8x100" : minutes >= 60 ? "6x100" : "5x100";
  const focusLabel = directives.focus.length ? directives.focus.join(", ") : "tecnica generale";

  return [
    {
      phase: "warmup",
      label: "Riscaldamento",
      items: [
        { label: "Nuoto sciolto", distance: "300m", intensity: "easy", notes: "Respirazione regolare" },
        { label: "Tecnica progressiva", distance: "4x50m", rest: "20s", intensity: "easy" },
      ],
    },
    {
      phase: "activation",
      label: "Attivazione",
      items: [
        { label: "Drill di tecnica", distance: "4x50m", rest: "20s", intensity: "mixed", notes: `Focus: ${focusLabel}` },
      ],
    },
    {
      phase: "main",
      label: "Serie principale",
      items: [
        {
          label: "Serie centrale",
          reps: baseMainReps,
          rest: "25s",
          intensity: directives.intensity,
          notes: `Stili: ${directives.strokeMix.join(", ") || "sl"}`,
        },
        {
          label: "Serie qualità",
          reps: "6x50m",
          rest: "30s",
          intensity: directives.intensity === "easy" ? "mixed" : "hard",
          notes: directives.equipment.length ? `Attrezzi: ${directives.equipment.join(", ")}` : "Senza attrezzi",
        },
      ],
    },
    {
      phase: "cooldown",
      label: "Defaticamento",
      items: [
        { label: "Nuoto facile", distance: "200m", intensity: "easy", notes: "Allungamento e controllo tecnico" },
      ],
    },
  ];
}

function fallbackPlan(sessionDate: string, directives: ClubPoolWorkoutDirective): ClubPoolWorkoutPlan {
  return {
    title: `Allenamento vasca ${sessionDate}`,
    description: `Allenamento generale generato in fallback (${directives.sessionMinutes} min).`,
    totalDistance: directives.sessionMinutes >= 90 ? "3600m" : directives.sessionMinutes >= 75 ? "3200m" : directives.sessionMinutes >= 60 ? "2800m" : "2300m",
    estimatedDuration: `${directives.sessionMinutes} min`,
    blocks: fallbackBlocksFromDirectives(directives),
    coachNotes: [
      "Generazione AI in fallback: verifica il carico prima della pubblicazione.",
      directives.notes?.trim() ? `Nota coach: ${directives.notes.trim()}` : "Adatta recuperi in base al livello del gruppo.",
    ],
  };
}

function buildPrompt(params: { sessionDate: string; directives: ClubPoolWorkoutDirective }) {
  const { sessionDate, directives } = params;

  return `Sei un coach di nuoto master. Genera SOLO un allenamento generale in vasca per gruppo club (non personalizzato su atleta).\n\nData sessione: ${sessionDate}\nVolume: ${directives.volume}\nIntensità: ${directives.intensity}\nDurata target: ${directives.sessionMinutes} minuti\nFocus: ${directives.focus.join(", ") || "tecnica"}\nStili: ${directives.strokeMix.join(", ") || "sl"}\nAttrezzi consentiti: ${directives.equipment.join(", ") || "nessuno"}\nNota coach: ${directives.notes?.trim() || "nessuna"}\n\nRestituisci ESCLUSIVAMENTE JSON valido in questo schema:\n{\n  "title": "string",\n  "description": "string",\n  "totalDistance": "string",\n  "estimatedDuration": "string",\n  "blocks": [\n    {\n      "phase": "warmup|activation|main|cooldown",\n      "label": "string",\n      "items": [\n        {\n          "label": "string",\n          "distance": "string opzionale",\n          "reps": "string opzionale",\n          "rest": "string opzionale",\n          "intensity": "string opzionale",\n          "notes": "string opzionale"\n        }\n      ]\n    }\n  ],\n  "coachNotes": ["string"]\n}\n\nVincoli:\n- 4 blocchi obbligatori (warmup, activation, main, cooldown)\n- testo in italiano\n- workout realistico per club master`;}

function sanitizePlan(raw: unknown, fallback: ClubPoolWorkoutPlan): ClubPoolWorkoutPlan {
  if (!raw || typeof raw !== "object") return fallback;
  const value = raw as Record<string, unknown>;
  const blocks = Array.isArray(value.blocks) ? value.blocks : [];

  if (blocks.length === 0) return fallback;

  const normalizedBlocks: ClubPoolWorkoutBlock[] = blocks
    .map((block) => {
      const b = block as Record<string, unknown>;
      const phase = String(b.phase ?? "").trim().toLowerCase();
      if (!["warmup", "activation", "main", "cooldown"].includes(phase)) return null;
      const itemsRaw = Array.isArray(b.items) ? b.items : [];
      const items = itemsRaw
        .map((item) => {
          const it = item as Record<string, unknown>;
          const label = String(it.label ?? "").trim();
          if (!label) return null;
          return {
            label,
            distance: typeof it.distance === "string" ? it.distance : undefined,
            reps: typeof it.reps === "string" ? it.reps : undefined,
            rest: typeof it.rest === "string" ? it.rest : undefined,
            intensity: typeof it.intensity === "string" ? it.intensity : undefined,
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

  if (normalizedBlocks.length < 4) return fallback;

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
    ])) as any;

    const text = String(result?.response?.text?.() ?? "").trim();
    const clean = text.replace(/^```json\s*/i, "").replace(/^```/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(clean);
    const plan = sanitizePlan(parsed, fallback);

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
