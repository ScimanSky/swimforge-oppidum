import {
  NO_VALUE,
  distanceParts,
  formatDurationParts,
  formatInteger,
  formatPaceValue,
} from "@/lib/format";

/** Labels shared by the challenge list, the create dialog and the challenge detail. */
export const CHALLENGE_TYPE_LABELS: Record<string, string> = {
  pool: "Vasca",
  open_water: "Acque libere",
  both: "Vasca e acque libere",
};

export const CHALLENGE_OBJECTIVE_LABELS: Record<string, string> = {
  total_distance: "Distanza totale",
  total_sessions: "Nuotate totali",
  consistency: "Costanza",
  avg_pace: "Passo medio",
  total_time: "Tempo totale",
  longest_session: "Nuotata più lunga",
};

export const CHALLENGE_DURATION_LABELS: Record<string, string> = {
  "3_days": "3 giorni",
  "1_week": "1 settimana",
  "2_weeks": "2 settimane",
  "1_month": "1 mese",
};

export const challengeObjectiveLabel = (objective: string) =>
  CHALLENGE_OBJECTIVE_LABELS[objective] ?? objective;

/**
 * A challenge progress value split for `<Metric>` / ranking rows, by objective: metres for
 * distances, seconds for time, seconds per 100 m for pace, counts otherwise. Zero is shown as
 * zero (a participant who has not swum yet), a pace without data as «—».
 */
export function challengeProgressParts(
  objective: string,
  raw: number | null | undefined
): { value: string; unit?: string } {
  const value = Number(raw ?? 0);
  const safe = Number.isFinite(value) && value > 0 ? value : 0;
  switch (objective) {
    case "total_distance":
    case "longest_session":
      return safe > 0 ? distanceParts(safe) : { value: "0", unit: "km" };
    case "total_time":
      return formatDurationParts(safe) ?? { value: "0", unit: "min" };
    case "avg_pace":
      return safe > 0 ? { value: formatPaceValue(safe), unit: "/100 m" } : { value: NO_VALUE };
    case "total_sessions":
      return { value: formatInteger(safe), unit: Math.round(safe) === 1 ? "nuotata" : "nuotate" };
    case "consistency":
      return { value: formatInteger(safe), unit: Math.round(safe) === 1 ? "giorno" : "giorni" };
    default:
      return { value: formatInteger(safe) };
  }
}

