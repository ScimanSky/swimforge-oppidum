import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn(async () => null) }));
vi.mock("./swim_metrics", () => ({ getSwimMetrics: vi.fn() }));

import { buildDrylandWorkoutPrompt, buildPoolWorkoutPrompt, type UserStatsForCoach } from "./ai_coach";
import { paceZoneCoachRules } from "./swim_metrics/coach-context";
import { paceZoneBoundsFromCss, paceZoneRanges, type SwimZones } from "@shared/swimMetrics";

const OLD_NAMES = [/\bSEI\b/, /\bTCI\b/, /\bSER\b/, /\bACS\b/, /\bRRS\b/, /\bPOI\b/];

const stats: UserStatsForCoach = {
  profile: { aiSkillLabel: "Intermedio", level: 5, totalXp: 3000, totalDistanceMeters: 90000, totalSessions: 40 },
  recent: { activitiesCount: 8, totalDistance: 20000, totalTime: 22000, avgPace: "110.00", avgSwolf: "36.0", sessionsPerWeek: "1.9" },
  swimMetricsText: "METRICHE DI NUOTO (test)\n- Passo soglia (CSS): 1:44/100 m",
  hrZones: { hasData: false, excluded: false, activitiesWithHR: 0, zone1: "0", zone2: "0", zone3: "0", zone4: "0", zone5: "0" },
  latestActivities: [],
  paceZones: null,
  poolHistory: null,
  referencePace: 110,
};

// CSS 1:48.5: A1 slower than 2:08, B2 1:49–1:54, C2/C3 faster than 1:44.
const OWNER_ZONES: SwimZones = {
  source: "auto",
  ranges: paceZoneRanges(paceZoneBoundsFromCss(108.5)),
  bounds: paceZoneBoundsFromCss(108.5),
  autoBounds: paceZoneBoundsFromCss(108.5),
  manualUpdatedAt: null,
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
    expect(prompt).toContain(paceZoneCoachRules(null, null));
    expect(prompt).toContain('"zone": "B2"');
    expect(prompt).toContain('"intensity": "Soglia"');
    expect(prompt).toContain('"repeats": 6');
    expect(prompt).toContain('"repMeters": 100');
    expect(prompt).toContain('"stroke": "stile libero"');
    expect(prompt).toContain("spiega ogni zona usata");
  });

  it("dry-land: no zone rules", () => {
    expect(buildDrylandWorkoutPrompt(stats)).not.toContain(paceZoneCoachRules(null, null));
  });

  it("pool: the examples carry the athlete's own paces, never fixed ones", () => {
    const prompt = buildPoolWorkoutPrompt({ ...stats, paceZones: OWNER_ZONES });
    expect(prompt).toContain('"notes": "A1 · Facile, più lento di 2:08/100 m: respiro tranquillo');
    expect(prompt).toContain('"notes": "B2 · Soglia, 1:49–1:54/100 m: respiro impegnato');
    // B2 slow end 114.2 s + 20 s = 134.2 s → a 2:15.
    expect(prompt).toContain('"rest": "a 2:15"');
    // C3: 25 m at 104.3 s/100 m = 26.1 s, × 3 → 1′20″.
    expect(prompt).toContain('"rest": "1′20″"');
    expect(prompt).toContain("«6×100 B2 · Soglia 1:49–1:54, rec. 20″»");
    // Without zones: placeholders, not someone else's paces.
    const none = buildPoolWorkoutPrompt(stats);
    expect(none).toContain('"notes": "B2 · Soglia, m:ss–m:ss/100 m:');
    expect(none).toContain("«6×100 B2 · Soglia m:ss–m:ss, rec. 20″»");
    expect(none).not.toContain("1:49–1:54");
  });

  it("pool: the safety limits and a total near the usual pool swims", () => {
    const prompt = buildPoolWorkoutPrompt({ ...stats, poolHistory: { medianMeters: 1600, swims: 6, usualPoolLengthMeters: 25 } });
    expect(prompt).toContain("Totale: vicino alle nuotate abituali in vasca (mediana delle ultime 6: 1600 m), mai oltre 2400 m.");
    expect(prompt).toContain("al massimo 1600 m in C1, 600 m in C2 e 300 m in C3");
    expect(prompt).toContain("almeno 200 m facili in A1");
    expect(prompt).toContain("- Vasca abituale: 25 m");
    expect(prompt).not.toMatch(/1500-2500m|400-600m/);
  });

  it("pool: in a 50 m pool C3 is 25 m sprint + 25 m easy", () => {
    const prompt = buildPoolWorkoutPrompt({ ...stats, poolHistory: { medianMeters: 2000, swims: 6, usualPoolLengthMeters: 50 } });
    expect(prompt).toContain("- Vasca abituale: 50 m");
    expect(prompt).toContain("il C3 si fa su una vasca, 25 m sprint + 25 m facile (repMeters 50)");
    expect(prompt).toContain('"name": "8x50 (25 m sprint + 25 m facile)"');
  });

  it("pool: fading swimmers get a progressive endurance build and stroke-length drills", () => {
    expect(buildPoolWorkoutPrompt(stats)).toContain("ripetute brevi con poco recupero → serie spezzate → nuoto continuo");
  });
});
