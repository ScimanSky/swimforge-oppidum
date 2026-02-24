import type { ClubPoolWorkoutBlock, ClubPoolWorkoutPlan } from "@shared/types";
import { normalizeWorkoutPlanForRender, toCanonicalReps, toSeriesDistanceLabel } from "@shared/workout-series";

type WorkoutSeriesItem = ClubPoolWorkoutBlock["items"][number];

export function parseWorkoutPlan(raw: unknown): ClubPoolWorkoutPlan | null {
  return normalizeWorkoutPlanForRender(raw);
}

export function getWorkoutSeriesDisplay(item: WorkoutSeriesItem) {
  const reps =
    item.reps ||
    toCanonicalReps(
      item.repsCount ?? null,
      item.distancePerRepMeters ?? null,
    ) ||
    "n/d";

  const seriesDistance =
    item.seriesDistanceLabel ||
    toSeriesDistanceLabel(item.seriesDistanceMeters ?? null) ||
    item.distance ||
    "n/d";

  return {
    reps,
    seriesDistance,
    sendoff: item.sendoff || "n/d",
    betweenSetsRest: item.betweenSetsRest || item.rest || null,
    intensity: item.intensity || null,
    targetPace: item.targetPace || null,
    notes: item.notes || null,
  };
}
