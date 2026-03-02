import type { ClubPoolWorkoutBlock, ClubPoolWorkoutPlan } from "./types";

type WorkoutSeriesItem = ClubPoolWorkoutBlock["items"][number];

const REPS_PATTERN = /(\d+)\s*x\s*(\d+)/i;
const METERS_PATTERN = /(\d+)\s*m?/i;
const VALID_PHASES: ClubPoolWorkoutBlock["phase"][] = ["warmup", "activation", "main", "cooldown"];

export type WorkoutSeriesNormalizationOptions = {
  isLastInBlock: boolean;
  defaultStroke?: string;
  defaultSendoff?: string;
  defaultBetweenSetsRest?: string;
};

export type WorkoutSeriesNormalizationResult = {
  item: WorkoutSeriesItem;
  warnings: string[];
  hardIssues: string[];
};

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizePositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.trunc(value);
  if (typeof value === "string") {
    const numeric = Number(value.trim());
    if (Number.isFinite(numeric) && numeric > 0) return Math.trunc(numeric);
  }
  return null;
}

export function parseRepsSpec(value: unknown): { repsCount: number; distancePerRepMeters: number } | null {
  const text = normalizeText(value);
  if (!text) return null;
  const match = text.match(REPS_PATTERN);
  if (!match) return null;
  const repsCount = Number(match[1]);
  const distancePerRepMeters = Number(match[2]);
  if (!Number.isFinite(repsCount) || !Number.isFinite(distancePerRepMeters) || repsCount <= 0 || distancePerRepMeters <= 0) {
    return null;
  }
  return {
    repsCount: Math.trunc(repsCount),
    distancePerRepMeters: Math.trunc(distancePerRepMeters),
  };
}

export function parseMetersValue(value: unknown): number | null {
  const text = normalizeText(value);
  if (!text) return null;
  const match = text.match(METERS_PATTERN);
  if (!match) return null;
  const meters = Number(match[1]);
  if (!Number.isFinite(meters) || meters <= 0) return null;
  return Math.trunc(meters);
}

export function toCanonicalReps(repsCount: number | null | undefined, distancePerRepMeters: number | null | undefined): string | undefined {
  if (!repsCount || !distancePerRepMeters) return undefined;
  return `${Math.trunc(repsCount)}x${Math.trunc(distancePerRepMeters)}`;
}

export function toSeriesDistanceLabel(seriesDistanceMeters: number | null | undefined): string | undefined {
  if (!seriesDistanceMeters) return undefined;
  return `${Math.trunc(seriesDistanceMeters)}m`;
}

export function normalizeWorkoutSeriesItem(
  rawItem: WorkoutSeriesItem,
  options: WorkoutSeriesNormalizationOptions,
): WorkoutSeriesNormalizationResult {
  const warnings: string[] = [];
  const hardIssues: string[] = [];

  const label = normalizeText(rawItem.label) ?? "Serie";
  let stroke = normalizeText(rawItem.stroke);
  if (!stroke && options.defaultStroke) {
    const fallbackStroke = normalizeText(options.defaultStroke);
    if (fallbackStroke) {
      stroke = fallbackStroke;
      warnings.push("stroke_defaulted");
    }
  }
  const intensity = normalizeText(rawItem.intensity);
  const targetPace = normalizeText(rawItem.targetPace);
  const notes = normalizeText(rawItem.notes);

  let repsCount = normalizePositiveInt(rawItem.repsCount);
  let distancePerRepMeters = normalizePositiveInt(rawItem.distancePerRepMeters);
  let seriesDistanceMeters = normalizePositiveInt(rawItem.seriesDistanceMeters);

  const repsFromReps = parseRepsSpec(rawItem.reps);
  if (repsFromReps) {
    repsCount = repsCount ?? repsFromReps.repsCount;
    distancePerRepMeters = distancePerRepMeters ?? repsFromReps.distancePerRepMeters;
  }

  const repsFromLegacyDistance = parseRepsSpec(rawItem.distance);
  if (repsFromLegacyDistance && (!repsCount || !distancePerRepMeters)) {
    repsCount = repsFromLegacyDistance.repsCount;
    distancePerRepMeters = repsFromLegacyDistance.distancePerRepMeters;
    warnings.push("legacy_distance_reps_parsed");
  }

  if (!seriesDistanceMeters) {
    seriesDistanceMeters =
      normalizePositiveInt(rawItem.seriesDistanceLabel) ?? parseMetersValue(rawItem.seriesDistanceLabel) ?? parseMetersValue(rawItem.distance);
  }

  if ((!repsCount || !distancePerRepMeters) && seriesDistanceMeters) {
    repsCount = 1;
    distancePerRepMeters = seriesDistanceMeters;
    warnings.push("series_without_reps_converted_to_1xD");
  }

  if (!seriesDistanceMeters && repsCount && distancePerRepMeters) {
    seriesDistanceMeters = repsCount * distancePerRepMeters;
  }

  if (repsCount && distancePerRepMeters && seriesDistanceMeters) {
    const expectedMeters = repsCount * distancePerRepMeters;
    if (seriesDistanceMeters !== expectedMeters) {
      hardIssues.push("series_distance_mismatch");
      warnings.push("series_distance_autofixed_from_reps");
      seriesDistanceMeters = expectedMeters;
    }
  }

  if (!repsCount || !distancePerRepMeters || !seriesDistanceMeters) {
    hardIssues.push("series_geometry_missing");
    const safeDistancePerRep = distancePerRepMeters ?? seriesDistanceMeters ?? 100;
    const safeRepsCount = repsCount ?? 1;
    repsCount = safeRepsCount;
    distancePerRepMeters = safeDistancePerRep;
    seriesDistanceMeters = safeRepsCount * safeDistancePerRep;
    warnings.push("series_geometry_autofilled");
  }

  let sendoff = normalizeText(rawItem.sendoff);
  if (!sendoff) {
    hardIssues.push("missing_sendoff");
    if (options.defaultSendoff) {
      sendoff = options.defaultSendoff;
      warnings.push("sendoff_defaulted");
    }
  }

  let betweenSetsRest = normalizeText(rawItem.betweenSetsRest) ?? normalizeText(rawItem.rest);
  if (options.isLastInBlock) {
    if (betweenSetsRest) {
      warnings.push("trailing_between_sets_rest_removed");
      betweenSetsRest = undefined;
    }
  } else if (!betweenSetsRest && options.defaultBetweenSetsRest) {
    betweenSetsRest = options.defaultBetweenSetsRest;
    warnings.push("between_sets_rest_defaulted");
  }

  const reps = toCanonicalReps(repsCount, distancePerRepMeters);
  const seriesDistanceLabel = toSeriesDistanceLabel(seriesDistanceMeters);

  return {
    item: {
      label,
      stroke,
      reps,
      repsCount,
      distancePerRepMeters,
      seriesDistanceMeters,
      seriesDistanceLabel,
      sendoff,
      betweenSetsRest,
      intensity,
      targetPace,
      notes,
      distance: seriesDistanceLabel,
      rest: betweenSetsRest,
    },
    warnings,
    hardIssues,
  };
}

export function normalizeWorkoutPlanForRender(raw: unknown): ClubPoolWorkoutPlan | null {
  let value: Record<string, unknown> | null = null;

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      value = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  } else if (raw && typeof raw === "object") {
    value = raw as Record<string, unknown>;
  }

  if (!value) return null;

  const blocksRaw = Array.isArray(value.blocks) ? value.blocks : [];
  const blocks: ClubPoolWorkoutBlock[] = blocksRaw
    .map((block) => {
      const payload = block as Record<string, unknown>;
      const phase = String(payload.phase ?? "").trim().toLowerCase() as ClubPoolWorkoutBlock["phase"];
      if (!VALID_PHASES.includes(phase)) return null;
      const itemsRaw = Array.isArray(payload.items) ? payload.items : [];
      const normalizedItems = itemsRaw
        .map((entry, index) => {
          const source = entry as WorkoutSeriesItem;
          return normalizeWorkoutSeriesItem(source, {
            isLastInBlock: index === itemsRaw.length - 1,
          }).item;
        })
        .filter((item) => String(item.label ?? "").trim().length > 0);

      if (normalizedItems.length === 0) return null;
      return {
        phase,
        label: normalizeText(payload.label) ?? phase,
        items: normalizedItems,
      } as ClubPoolWorkoutBlock;
    })
    .filter((block): block is ClubPoolWorkoutBlock => block !== null);

  if (blocks.length === 0) return null;

  const coachNotes = Array.isArray(value.coachNotes)
    ? value.coachNotes
        .map((note) => normalizeText(note))
        .filter((note): note is string => Boolean(note))
    : [];

  return {
    title: normalizeText(value.title) ?? "Workout vasca",
    description: normalizeText(value.description) ?? "",
    totalDistance: normalizeText(value.totalDistance) ?? "n/d",
    estimatedDuration: normalizeText(value.estimatedDuration) ?? "n/d",
    blocks,
    coachNotes,
  };
}
