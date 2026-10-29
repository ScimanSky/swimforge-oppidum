import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn(async () => null) }));
vi.mock("./swim_metrics", () => ({ getSwimMetrics: vi.fn() }));

import { buildDrylandWorkoutPrompt, buildPoolWorkoutPrompt, type UserStatsForCoach } from "./ai_coach";

const OLD_NAMES = [/\bSEI\b/, /\bTCI\b/, /\bSER\b/, /\bACS\b/, /\bRRS\b/, /\bPOI\b/];

const stats: UserStatsForCoach = {
  profile: { aiSkillLabel: "Intermedio", level: 5, totalXp: 3000, totalDistanceMeters: 90000, totalSessions: 40 },
  recent: { activitiesCount: 8, totalDistance: 20000, totalTime: 22000, avgPace: "110.00", avgSwolf: "36.0", sessionsPerWeek: "1.9" },
  swimMetricsText: "METRICHE DI NUOTO (test)\n- Passo soglia (CSS): 1:44/100 m",
  hrZones: { hasData: false, activitiesWithHR: 0, zone1: "0", zone2: "0", zone3: "0", zone4: "0", zone5: "0" },
  latestActivities: [],
};

describe("workout prompts", () => {
  it.each([
    ["pool", buildPoolWorkoutPrompt],
    ["dryland", buildDrylandWorkoutPrompt],
  ] as const)("%s: the new swim metrics with the rules, no invented indices", (_name, build) => {
    const prompt = build(stats);
    expect(prompt).toContain("Passo soglia (CSS): 1:44/100 m");
    expect(prompt).toContain("non inventare altri indici");
    for (const name of OLD_NAMES) expect(prompt).not.toMatch(name);
  });

  it("pool: send-off times from the threshold pace when there is one", () => {
    expect(buildPoolWorkoutPrompt(stats)).toMatch(/passo soglia/i);
  });
});
