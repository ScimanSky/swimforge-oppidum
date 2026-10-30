import { beforeEach, describe, expect, it, vi } from "vitest";
import { swimmerProfiles, swimmingActivities } from "../drizzle/schema";

// The workout generator reads the heart-rate zones of the recent swims only with the
// health-data consent: without it the prompt says they are excluded and carries none.

const h = vi.hoisted(() => {
  const swim = (day: number) => ({
    id: day,
    userId: 7,
    activityDate: new Date(Date.UTC(2026, 9, day, 8)),
    distanceMeters: 2000,
    durationSeconds: 2400,
    avgPacePer100m: 120,
    avgSwolf: 38,
    avgStrokes: 16,
    avgStrokeCadence: 28,
    poolLengthMeters: 25,
    isOpenWater: false,
    avgHeartRate: 141,
    hrZone1Seconds: 300,
    hrZone2Seconds: 900,
    hrZone3Seconds: 800,
    hrZone4Seconds: 350,
    hrZone5Seconds: 50,
  });
  const db = {
    select: vi.fn(() => {
      let table: unknown;
      const rows = () =>
        table === swimmerProfiles
          ? [{ userId: 7, aiSkillLabel: "Intermedio", level: 5, totalXp: 3000, totalDistanceMeters: 90000, totalSessions: 40 }]
          : table === swimmingActivities
            ? [swim(27), swim(25), swim(22)]
            : [];
      const chain: any = {
        from: (t: unknown) => {
          table = t;
          return chain;
        },
        where: () => chain,
        orderBy: () => chain,
        limit: () => chain,
        then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
          Promise.resolve(rows()).then(resolve, reject),
      };
      return chain;
    }),
  };
  return { db, consent: vi.fn() };
});

vi.mock("./db", () => ({ getDb: vi.fn(async () => h.db) }));
vi.mock("./swim_metrics", () => ({ getSwimMetrics: vi.fn(async () => null) }));
vi.mock("./consent", () => ({ hasHealthDataConsent: h.consent }));

import { buildDrylandWorkoutPrompt, buildPoolWorkoutPrompt, fetchUserStats } from "./ai_coach";

describe("AI workouts and the health-data consent", () => {
  beforeEach(() => {
    h.consent.mockReset();
  });

  it("with the consent, the heart-rate zones of the recent swims are in the prompts", async () => {
    h.consent.mockResolvedValue(true);
    const stats = await fetchUserStats(7);
    expect(h.consent).toHaveBeenCalledWith(7);
    expect(stats.hrZones).toMatchObject({ hasData: true, excluded: false, activitiesWithHR: 3 });
    expect(buildPoolWorkoutPrompt(stats)).toContain("- Zona 2 (Aerobica): 37.5%");
    expect(buildDrylandWorkoutPrompt(stats)).toContain("- Zona 1-2 (Aerobica): 50.0%");
  });

  it("without it, no heart-rate data reaches the prompts and the model is told why", async () => {
    h.consent.mockResolvedValue(false);
    const stats = await fetchUserStats(7);
    expect(stats.hrZones).toMatchObject({ hasData: false, excluded: true, activitiesWithHR: 0 });
    for (const prompt of [buildPoolWorkoutPrompt(stats), buildDrylandWorkoutPrompt(stats)]) {
      expect(prompt).not.toMatch(/Zona [1-5]/);
      expect(prompt).not.toContain("Dati disponibili da");
      expect(prompt).toContain("Dati di frequenza cardiaca esclusi: l'atleta non ha dato il consenso al trattamento dei dati sanitari");
    }
  });
});
