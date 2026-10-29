import { describe, expect, it } from "vitest";
import { activityMetrics, activityZoneSeconds } from "./activity-metrics";

const full = {
  distanceMeters: 3200,
  durationSeconds: 3720,
  avgPacePer100m: 112,
  avgSwolf: 38.4,
  avgHeartRate: 141.6,
  maxHeartRate: 171,
  calories: 1234,
};

describe("activityMetrics", () => {
  it("ordine fisso: Distanza, Durata, Passo medio, SWOLF, FC media, FC massima, Calorie", () => {
    expect(activityMetrics(full)).toEqual([
      { id: "distance", value: "3,2", unit: "km", label: "Distanza" },
      { id: "duration", value: "1:02", unit: "h", label: "Durata" },
      { id: "pace", value: "1:52", unit: "/100", label: "Passo medio", tone: "action" },
      { id: "swolf", value: "38", label: "SWOLF" },
      { id: "avgHr", value: "142", unit: "bpm", label: "FC media" },
      { id: "maxHr", value: "171", unit: "bpm", label: "FC massima" },
      { id: "calories", value: "1.234", unit: "kcal", label: "Calorie" },
    ]);
  });

  it("solo le metriche con dato, mai «—»", () => {
    const metrics = activityMetrics({
      distanceMeters: 800,
      durationSeconds: 0,
      avgPacePer100m: null,
      avgHeartRate: Number.NaN,
      calories: -5,
    });
    // The pace comes from distance and duration only when both are there.
    expect(metrics).toEqual([{ id: "distance", value: "800", unit: "m", label: "Distanza" }]);
    expect(activityMetrics({})).toEqual([]);
  });

  it("passo ricavato da distanza e durata quando manca quello salvato", () => {
    const pace = activityMetrics({ distanceMeters: 1000, durationSeconds: 1300 }).find(
      metric => metric.id === "pace"
    );
    expect(pace?.value).toBe("2:10");
  });

  it("accetta i nomi alternativi (snake_case, caloriesBurned)", () => {
    const labels = (activity: Record<string, unknown>) =>
      activityMetrics(activity).map(metric => `${metric.label} ${metric.value}`);
    expect(
      labels({ avg_swolf: 40, avg_heart_rate: "150", max_heart_rate: 180, calories_burned: 300 })
    ).toEqual(["SWOLF 40", "FC media 150", "FC massima 180", "Calorie 300"]);
    expect(labels({ caloriesBurned: 410 })).toEqual(["Calorie 410"]);
    // `calories` wins over the fallbacks.
    expect(labels({ calories: 500, caloriesBurned: 410 })).toEqual(["Calorie 500"]);
  });
});

describe("activityZoneSeconds", () => {
  it("secondi nelle zone 1-5, valori non validi a zero", () => {
    expect(
      activityZoneSeconds({
        hrZone1Seconds: 80,
        hrZone2Seconds: null,
        hrZone3Seconds: 380,
        hrZone4Seconds: Number.NaN,
        hrZone5Seconds: -3,
      })
    ).toEqual([80, 0, 380, 0, 0]);
  });

  it("null senza tempo in nessuna zona", () => {
    expect(activityZoneSeconds({})).toBeNull();
    expect(activityZoneSeconds({ hrZone1Seconds: 0, hrZone2Seconds: null })).toBeNull();
  });
});
