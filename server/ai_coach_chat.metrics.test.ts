import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleSwimMetrics } from "./swim_metrics/test-helpers";

const h = vi.hoisted(() => ({
  invokeLLM: vi.fn(),
  getSwimMetrics: vi.fn(),
  getSwimmerProfile: vi.fn(),
  getActivities: vi.fn(),
}));

vi.mock("./_core/llm", () => ({ invokeLLM: h.invokeLLM }));
vi.mock("./db", () => ({ getSwimmerProfile: h.getSwimmerProfile, getActivities: h.getActivities }));
vi.mock("./swim_metrics", () => ({ getSwimMetrics: h.getSwimMetrics }));
vi.mock("./ai_coach", () => ({ getExistingWorkouts: vi.fn(async () => null) }));
vi.mock("./ai_activity_insights", () => ({ listActivityInsights: vi.fn(async () => []) }));

import { generateCoachChatReply } from "./ai_coach_chat";

const OLD_NAMES = [/\bSEI\b/, /\bTCI\b/, /\bSER\b/, /\bACS\b/, /\bPOI\b/, /Performance Index/i, /Consistency/i, /Recovery Readiness/i];
const previousKey = process.env.BUILT_IN_FORGE_API_KEY;

describe("coach chat context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BUILT_IN_FORGE_API_KEY = "test-key";
    h.invokeLLM.mockResolvedValue({ choices: [{ message: { content: "Lettura dati: ok" } }] });
    h.getSwimMetrics.mockResolvedValue(sampleSwimMetrics());
    h.getSwimmerProfile.mockResolvedValue({ level: 5, totalXp: 3000, totalSessions: 40, totalDistanceMeters: 90000 });
    h.getActivities.mockResolvedValue([]);
  });

  afterAll(() => {
    if (previousKey === undefined) delete process.env.BUILT_IN_FORGE_API_KEY;
    else process.env.BUILT_IN_FORGE_API_KEY = previousKey;
  });

  const systemPrompt = () => h.invokeLLM.mock.calls[0][0].messages[0].content as string;

  it("gives the model the six swim metrics, the glossary and the rules", async () => {
    const reply = await generateCoachChatReply(7, [{ role: "user", content: "Come sto?" }]);
    expect(reply).toMatchObject({ provider: "forge", fallback: false });
    expect(h.getSwimMetrics).toHaveBeenCalledWith(7);

    const prompt = systemPrompt();
    expect(prompt).toContain("Passo soglia (CSS): 1:44/100 m");
    expect(prompt).toContain("equilibrio −7,8 (neutro)");
    expect(prompt).toContain("GLOSSARIO DELLE METRICHE");
    expect(prompt).toContain("non inventare altri indici");
    for (const name of OLD_NAMES) expect(prompt).not.toMatch(name);
  });

  it("says so when the metrics cannot be read", async () => {
    h.getSwimMetrics.mockRejectedValue(new Error("db down"));
    await generateCoachChatReply(7, [{ role: "user", content: "Come sto?" }]);
    expect(systemPrompt()).toContain("METRICHE DI NUOTO: non disponibili");
  });

  it("the rule-based reply reads the new metrics", async () => {
    const reply = await generateCoachChatReply(7, []);
    expect(reply.provider).toBe("rule_based");
    expect(reply.message).toContain("Passo soglia 1:44/100m (stima, affidabilità alta)");
    expect(reply.message).toContain("equilibrio −7,8 (neutro)");
    expect(reply.message).toContain("progressione controllata del volume");
    for (const name of OLD_NAMES) expect(reply.message).not.toMatch(name);
  });

  it("rounds the pace before splitting minutes and seconds (119.6 s is 2:00, never 1:60)", async () => {
    const metrics = sampleSwimMetrics();
    metrics.css.current = { ...metrics.css.current!, paceSecondsPer100: 119.6 };
    h.getSwimMetrics.mockResolvedValue(metrics);
    h.getActivities.mockResolvedValue([
      { activityDate: new Date("2026-10-27T08:00:00Z"), distanceMeters: 2000, durationSeconds: 2400, avgPacePer100m: 59.7, avgSwolf: 35 },
    ]);
    const reply = await generateCoachChatReply(7, []);
    expect(reply.message).toContain("Passo soglia 2:00/100m");
    expect(reply.message).toContain("passo 1:00/100m");
    expect(reply.message).not.toMatch(/:60/);
  });

  it("the rule-based reply suggests recovery with a high load", async () => {
    const metrics = sampleSwimMetrics();
    metrics.load.today = { ctl: 30, atl: 65, tsb: -35, reading: "carico_alto" };
    h.getSwimMetrics.mockResolvedValue(metrics);
    const reply = await generateCoachChatReply(7, []);
    expect(reply.message).toContain("recupero + tecnica pulita");
  });

  it("the rule-based reply asks for regularity with few swims a week", async () => {
    const metrics = sampleSwimMetrics();
    metrics.volume.avgSessions4 = 1.2;
    h.getSwimMetrics.mockResolvedValue(metrics);
    const reply = await generateCoachChatReply(7, []);
    expect(reply.message).toContain("regolarità (almeno 2 nuotate a settimana)");
  });
});
