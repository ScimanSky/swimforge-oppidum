import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn(async () => null) }));
vi.mock("./swim_metrics", () => ({ getSwimMetrics: vi.fn() }));

import { buildDrylandWorkoutPrompt, buildPoolWorkoutPrompt, type UserStatsForCoach } from "./ai_coach";
import { PACE_ZONE_COACH_RULES } from "./swim_metrics/coach-context";

const OLD_NAMES = [/\bSEI\b/, /\bTCI\b/, /\bSER\b/, /\bACS\b/, /\bRRS\b/, /\bPOI\b/];

const stats: UserStatsForCoach = {
  profile: { aiSkillLabel: "Intermedio", level: 5, totalXp: 3000, totalDistanceMeters: 90000, totalSessions: 40 },
  recent: { activitiesCount: 8, totalDistance: 20000, totalTime: 22000, avgPace: "110.00", avgSwolf: "36.0", sessionsPerWeek: "1.9" },
  swimMetricsText: "METRICHE DI NUOTO (test)\n- Passo soglia (CSS): 1:44/100 m",
  hrZones: { hasData: false, activitiesWithHR: 0, zone1: "0", zone2: "0", zone3: "0", zone4: "0", zone5: "0" },
  latestActivities: [],
  paceZones: null,
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

  it("pool: send-off times from the zone paces in m:ss/100 m, never speed percentages alone", () => {
    const prompt = buildPoolWorkoutPrompt(stats);
    expect(prompt).toMatch(/passo soglia/i);
    expect(prompt).toContain("passi delle zone A1–C3 in m:ss/100 m");
    expect(prompt).not.toMatch(/85-92%|97-103%|% della velocità soglia|Zona 4|\bZ[1-5]\b/);
  });

  it("pool: the zone rules, and every rep in the JSON with zone, stroke and numbers the server can check", () => {
    const prompt = buildPoolWorkoutPrompt(stats);
    expect(prompt).toContain(PACE_ZONE_COACH_RULES);
    expect(prompt).toContain('"zone": "B2"');
    expect(prompt).toContain('"intensity": "Soglia"');
    expect(prompt).toContain('"repeats": 6');
    expect(prompt).toContain('"repMeters": 100');
    expect(prompt).toContain('"stroke": "stile libero"');
    expect(prompt).toContain("spiega ogni zona usata");
  });

  it("dry-land: no zone rules", () => {
    expect(buildDrylandWorkoutPrompt(stats)).not.toContain(PACE_ZONE_COACH_RULES);
  });

  it("pool: fading swimmers get a progressive endurance build and stroke-length drills", () => {
    expect(buildPoolWorkoutPrompt(stats)).toContain("ripetute brevi con poco recupero → serie spezzate → nuoto continuo");
  });
});
