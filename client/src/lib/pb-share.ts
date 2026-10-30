import { formatSwimCentiseconds } from "@/lib/swimTime";

export type PbShareEvent = {
  strokeType: "freestyle" | "backstroke" | "breaststroke" | "butterfly" | "mixed";
  distanceMeters: number;
  poolLengthMeters: 25 | 50;
  source: "official" | "training";
  newTimeCs: number;
  improvementCs: number | null;
};

const strokeLabels: Record<PbShareEvent["strokeType"], string> = {
  freestyle: "Stile libero",
  backstroke: "Dorso",
  breaststroke: "Rana",
  butterfly: "Farfalla",
  mixed: "Misti",
};

/** The text a new personal record opens the post editor with (no hashtags). */
export function buildPbSharePrefill(event: PbShareEvent) {
  const eventLabel = `${strokeLabels[event.strokeType]} ${event.distanceMeters}m`;
  const improvementLine =
    event.improvementCs && event.improvementCs > 0
      ? `Nuovo PB nei ${eventLabel}: ${formatSwimCentiseconds(event.newTimeCs)} (migliorato di ${formatSwimCentiseconds(event.improvementCs)})`
      : `Nuovo PB nei ${eventLabel}: ${formatSwimCentiseconds(event.newTimeCs)}`;
  const sourceLine = event.source === "official" ? "Gara ufficiale" : "Allenamento";
  return `${improvementLine}\nVasca ${event.poolLengthMeters}m · ${sourceLine}`;
}
