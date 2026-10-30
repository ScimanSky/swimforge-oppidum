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
vi.mock("./consent", () => ({ hasHealthDataConsent: vi.fn(async () => true) }));

import { generateCoachChatReply } from "./ai_coach_chat";
import { paceZoneCoachRules } from "./swim_metrics/coach-context";

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

  it("speaks the zones A1–C3: the athlete's zones and the rules for every rep", async () => {
    await generateCoachChatReply(7, [{ role: "user", content: "Mi prepari un allenamento?" }]);
    const prompt = systemPrompt();
    expect(prompt).toContain("ZONE DI PASSO A1–C3 (zone automatiche dal passo soglia 1:44/100 m, stima;");
    expect(prompt).toContain("- B2 Fondo medio-alto · livello Soglia: 1:44–1:50/100 m");
    // No pool swims among the last activities: no cap on the total.
    expect(prompt).toContain(paceZoneCoachRules(sampleSwimMetrics().zones, { medianMeters: null, swims: 0, usualPoolLengthMeters: null }));
    // The example rep uses the athlete's own B2, never someone else's paces.
    expect(prompt).toContain("«6×100 B2 · Soglia 1:44–1:50, rec. 20″»");
  });

  it("asks for «Le zone di oggi» whenever zones appear, with room in the bullet limits", async () => {
    await generateCoachChatReply(7, [{ role: "user", content: "Mi prepari un allenamento?" }]);
    const prompt = systemPrompt();
    expect(prompt).toContain('1) "Lettura dati" (max 2 bullet)');
    expect(prompt).toContain('2) "Cosa fare adesso" (max 3 bullet con target concreti)');
    expect(prompt).toContain(
      '3) "Le zone di oggi" (ogni volta che nella risposta ci sono zone: una riga per ogni zona usata, con codice, livello, passo e sensazione; senza zone ometti la sezione)',
    );
    expect(prompt).toContain('5) "Domanda mirata"');
  });

  it("the safety limits with the athlete's own total, from the last pool swims", async () => {
    h.getActivities.mockResolvedValue(
      [1000, 1200, 800].map((distanceMeters, index) => ({
        activityDate: new Date(Date.UTC(2026, 9, 27 - index, 8)),
        distanceMeters,
        durationSeconds: 1800,
        isOpenWater: false,
        poolLengthMeters: 25,
      })),
    );
    await generateCoachChatReply(7, [{ role: "user", content: "Mi prepari un allenamento?" }]);
    expect(systemPrompt()).toContain("il totale non supera 1500 m, 1,5 volte la mediana delle tue ultime 3 nuotate in vasca (1000 m)");
  });

  it("the rule-based session speaks the zones too, with the athlete's paces and what each zone is", async () => {
    const reply = await generateCoachChatReply(7, []);
    expect(reply.message).toContain(
      "- Sessione oggi: 300 A1 · Facile (più lento di 2:03) + 8×100 B1 · Medio 1:50–1:56, rec. 20″ + 6×50 B2 · Soglia 1:44–1:50, rec. 20″ + 200 A1 · Facile (più lento di 2:03).",
    );
    const zones = reply.message.split("Le zone di oggi\n")[1].split("\n\n")[0].split("\n");
    expect(zones).toEqual([
      "- A1 · Facile (più lento di 2:03/100 m): nuoto sciolto, potresti parlare normalmente; scalda e fa recuperare",
      "- A2 · Aerobico (1:56–2:03/100 m): ritmo comodo, frasi intere tra una vasca e l'altra; costruisce la base",
      "- B1 · Medio (1:50–1:56/100 m): ritmo sostenuto, solo frasi brevi; allunga la resistenza",
      "- B2 · Soglia (1:44–1:50/100 m): respiro impegnato, poche parole tra una vasca e l'altra; alza la soglia",
    ]);
  });

  it("the rule-based sprint session stays within 25 m in C3 and 150 m in C2, with safe rests", async () => {
    const reply = await generateCoachChatReply(7, [], { goal: "migliorare i 50 stile" });
    // C1/C2 boundary 104.3 / 1.04 = 100.3 s/100 m: 25 m = 25.1 s, × 3 = 75.2 s → 1′20″.
    expect(reply.message).toContain("2 serie di 6×25 C3 · Sopra soglia (più veloce di 1:40), rec. 1′20″");
    // 50 m = 50.1 s → 55″: the written 1′ is enough.
    expect(reply.message).toContain("4×50 C2 · Sopra soglia (più veloce di 1:40), rec. 1′");
  });

  it("without zones the rule-based session keeps zones and levels, and says the paces are missing", async () => {
    const metrics = sampleSwimMetrics();
    metrics.zones = { source: null, ranges: [], bounds: null, autoBounds: null, manualUpdatedAt: null };
    h.getSwimMetrics.mockResolvedValue(metrics);
    const reply = await generateCoachChatReply(7, []);
    expect(reply.message).toContain("8×100 B1 · Medio, rec. 20″");
    expect(reply.message).toContain("Passi delle zone non disponibili: servono il passo soglia o le tue zone.");
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
