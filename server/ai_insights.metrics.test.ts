import { beforeEach, describe, expect, it, vi } from "vitest";
import { aiInsightsCache, swimmingActivities } from "../drizzle/schema";
import { sampleSwimMetrics } from "./swim_metrics/test-helpers";

const h = vi.hoisted(() => {
  process.env.GEMINI_API_KEY = "test-key";
  const state = {
    cached: [] as unknown[],
    swimsEver: [{ id: 1 }] as unknown[],
    inserted: [] as Array<{ table: unknown; values: any }>,
    tables: [] as unknown[],
  };
  const db = {
    select: vi.fn(() => {
      let table: unknown;
      const chain: any = {
        from: (t: unknown) => {
          table = t;
          state.tables.push(t);
          return chain;
        },
        where: () => chain,
        limit: async () => (table === state.activitiesTable ? state.swimsEver : state.cached),
      };
      return chain;
    }),
    delete: vi.fn(() => ({ where: async () => undefined })),
    insert: vi.fn((table: unknown) => ({
      values: async (values: unknown) => {
        state.inserted.push({ table, values });
      },
    })),
  };
  return { state: Object.assign(state, { activitiesTable: null as unknown }), db, generateContent: vi.fn() };
});

vi.mock("./db", () => ({ getDb: async () => h.db }));
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent: h.generateContent };
    }
  },
}));

import { generateAIInsights } from "./ai_insights";

const OLD_NAMES = [/\bSEI\b/, /\bTCI\b/, /\bSER\b/, /\bACS\b/, /\bRRS\b/, /\bPOI\b/, /Performance Index/i, /Consistency/i];
const AI_TEXT = [
  "🏊 Tecnica: lo Stroke Index sopra la tua base dice che la bracciata rende di più a parità di passo.",
  "💪 Intensità: il 72% facile è una buona base, la quota media resta contenuta come suggeriscono gli studi.",
  "📈 Progressione: la forma cresce di 2 punti a settimana, un ritmo sostenibile.",
  "🔄 Recupero: l'equilibrio leggermente negativo indica che stai caricando senza eccessi.",
  "⚡ Efficienza: la variabilità nelle ripetute è regolare, il passo è ben gestito.",
  "🎯 Obiettivi: cinque settimane di fila con almeno due nuotate, la costanza c'è.",
].join("\n");

describe("generateAIInsights from the swim metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.state.cached = [];
    h.state.swimsEver = [{ id: 1 }];
    h.state.activitiesTable = swimmingActivities;
    h.state.inserted.length = 0;
    h.generateContent.mockResolvedValue({ response: { text: () => AI_TEXT } });
  });

  it("prompts with the six metrics and the glossary, never the old indices", async () => {
    const insights = await generateAIInsights(sampleSwimMetrics(), 42);
    expect(insights).toHaveLength(6);

    const prompt = h.generateContent.mock.calls[0][0] as string;
    expect(prompt).toContain("Passo soglia (CSS): 1:44/100 m");
    expect(prompt).toContain("GLOSSARIO DELLE METRICHE");
    expect(prompt).toContain("non inventare altri indici");
    for (const name of OLD_NAMES) expect(prompt).not.toMatch(name);
    // The Stroke Index example no longer claims «a parità di passo» on its own.
    expect(prompt).not.toContain("a parità di passo fai più strada per bracciata");
    expect(prompt).toContain("distanza per bracciata");
    // The examples speak the zones A1–C3, never the old Z1–Z5.
    expect(prompt).not.toMatch(/\bZ[1-5]\b/);
    expect(prompt).toContain("4x100 in B2");
  });

  it("caches the insights for the 90-day metrics (old 30-day insights are never reused)", async () => {
    await generateAIInsights(sampleSwimMetrics(), 42);
    expect(h.state.inserted).toHaveLength(1);
    expect(h.state.inserted[0].table).toBe(aiInsightsCache);
    expect(h.state.inserted[0].values).toMatchObject({ userId: 42, periodDays: 90 });
  });

  it("serves valid cached insights without calling the model", async () => {
    h.state.cached = [{ insights: AI_TEXT.split("\n"), expiresAt: new Date(Date.now() + 3600_000) }];
    expect(await generateAIInsights(sampleSwimMetrics(), 42)).toEqual(AI_TEXT.split("\n"));
    expect(h.generateContent).not.toHaveBeenCalled();
  });

  it("a user who never swam gets the onboarding insights", async () => {
    const metrics = sampleSwimMetrics();
    metrics.sessions = [];
    h.state.swimsEver = [];
    const insights = await generateAIInsights(metrics, 42);
    expect(insights.length).toBeGreaterThanOrEqual(6);
    expect(insights[0]).toMatch(/base/);
    expect(h.generateContent).not.toHaveBeenCalled();
  });

  it("no swims in 90 days but older ones: real insights, not the onboarding (total swims ever)", async () => {
    const metrics = sampleSwimMetrics();
    metrics.sessions = [];
    await generateAIInsights(metrics, 42);
    expect(h.state.tables).toContain(swimmingActivities);
    expect(h.generateContent).toHaveBeenCalledTimes(1);
  });
});
