import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiInsightsCache, swimmingActivities } from "../drizzle/schema";
import { sampleSwimMetrics } from "./swim_metrics/test-helpers";

const h = vi.hoisted(() => {
  process.env.GEMINI_API_KEY = "test-key";
  const state = {
    cached: [] as unknown[],
    swimsEver: [{ id: 1 }] as unknown[],
    inserted: [] as Array<{ table: unknown; values: any }>,
    updates: [] as Array<Record<string, unknown>>,
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
    // Applies the change to the cached row, like the database would.
    update: vi.fn(() => ({
      set: (values: Record<string, unknown>) => {
        state.updates.push(values);
        if (state.cached[0]) Object.assign(state.cached[0] as object, values);
        return { where: async () => undefined };
      },
    })),
    insert: vi.fn((table: unknown) => ({
      values: async (values: unknown) => {
        state.inserted.push({ table, values });
      },
    })),
  };
  return {
    state: Object.assign(state, { activitiesTable: null as unknown }),
    db,
    generateContent: vi.fn(),
    consume: vi.fn(async () => true),
  };
});

vi.mock("./db", () => ({ getDb: async () => h.db }));
vi.mock("./lib/ai-rate-limit", () => ({ aiInsightsRateLimit: { consume: h.consume } }));
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent: h.generateContent };
    }
  },
}));

import { generateAIInsights, INSIGHTS_GEMINI_TIMEOUT_MS, markAIInsightsStale } from "./ai_insights";

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
    h.state.updates.length = 0;
    h.generateContent.mockResolvedValue({ response: { text: () => AI_TEXT } });
    h.consume.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it("a Gemini call that never answers is given up after the timeout: the last insights are served", async () => {
    vi.useFakeTimers();
    const last = ["🏊 Tecnica: insight di ieri, ancora valido come ripiego."];
    h.state.cached = [{ insights: last, generatedAt: new Date(Date.now() - 30 * 3600_000), expiresAt: new Date(Date.now() - 3600_000) }];
    h.generateContent.mockReturnValue(new Promise(() => {}));

    const pending = generateAIInsights(sampleSwimMetrics(), 42);
    await vi.advanceTimersByTimeAsync(INSIGHTS_GEMINI_TIMEOUT_MS - 1);
    let settled = false;
    void pending.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(await pending).toEqual(last);
    expect(INSIGHTS_GEMINI_TIMEOUT_MS).toBeGreaterThanOrEqual(20_000);
    expect(INSIGHTS_GEMINI_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
    // The request itself is aborted, and nothing is cached.
    expect((h.generateContent.mock.calls[0][1] as { signal: AbortSignal }).signal.aborted).toBe(true);
    expect(h.state.inserted).toHaveLength(0);
  });

  it("a timeout without cached insights serves none (the page shows its own message)", async () => {
    vi.useFakeTimers();
    h.generateContent.mockReturnValue(new Promise(() => {}));
    const pending = generateAIInsights(sampleSwimMetrics(), 42);
    await vi.advanceTimersByTimeAsync(INSIGHTS_GEMINI_TIMEOUT_MS);
    expect(await pending).toEqual([]);
  });

  it("new swims: the last insights are served until 6 hours after their generation, then regenerated", async () => {
    const T0 = new Date("2026-10-29T08:00:00Z");
    const hours = (n: number) => new Date(T0.getTime() + n * 3600_000);
    const last = AI_TEXT.split("\n");
    h.state.cached = [{ insights: last, generatedAt: T0, expiresAt: hours(24) }];

    await markAIInsightsStale(42, hours(1));
    expect(h.state.updates).toEqual([{ expiresAt: hours(6) }]);

    // A second swim does not move the moment.
    await markAIInsightsStale(42, hours(3));
    expect(h.state.updates).toHaveLength(1);

    expect(await generateAIInsights(sampleSwimMetrics(), 42, hours(5.9))).toEqual(last);
    expect(h.generateContent).not.toHaveBeenCalled();

    await generateAIInsights(sampleSwimMetrics(), 42, hours(6.1));
    expect(h.generateContent).toHaveBeenCalledTimes(1);
    expect(h.state.inserted[0].values).toMatchObject({ generatedAt: hours(6.1), expiresAt: hours(30.1) });
  });

  it("new swims more than 6 hours after the generation make the insights expire now", async () => {
    const T0 = new Date("2026-10-29T08:00:00Z");
    h.state.cached = [{ insights: ["x"], generatedAt: T0, expiresAt: new Date(T0.getTime() + 24 * 3600_000) }];
    const now = new Date(T0.getTime() + 8 * 3600_000);
    await markAIInsightsStale(42, now);
    expect(h.state.updates).toEqual([{ expiresAt: now }]);
  });

  it("marking stale without cached insights does nothing", async () => {
    await markAIInsightsStale(42, new Date());
    expect(h.db.update).not.toHaveBeenCalled();
  });

  it("over the hourly generation limit: the last insights, no Gemini call", async () => {
    const last = AI_TEXT.split("\n");
    h.state.cached = [{ insights: last, generatedAt: new Date(0), expiresAt: new Date(Date.now() - 1000) }];
    h.consume.mockResolvedValue(false);
    expect(await generateAIInsights(sampleSwimMetrics(), 42)).toEqual(last);
    expect(h.consume).toHaveBeenCalledWith(42);
    expect(h.generateContent).not.toHaveBeenCalled();
  });

  it("a cache hit does not count against the generation limit", async () => {
    h.state.cached = [{ insights: AI_TEXT.split("\n"), expiresAt: new Date(Date.now() + 3600_000) }];
    await generateAIInsights(sampleSwimMetrics(), 42);
    expect(h.consume).not.toHaveBeenCalled();
  });

  it("cached onboarding insights are not served once the user swims", async () => {
    const metrics = sampleSwimMetrics();
    metrics.sessions = [];
    h.state.swimsEver = [];
    const onboarding = await generateAIInsights(metrics, 42);
    h.state.cached = [{ insights: onboarding, generatedAt: new Date(), expiresAt: new Date(Date.now() + 24 * 3600_000) }];

    h.state.swimsEver = [{ id: 1 }];
    const insights = await generateAIInsights(sampleSwimMetrics(), 42);
    expect(h.generateContent).toHaveBeenCalledTimes(1);
    expect(insights).toEqual(AI_TEXT.split("\n"));
  });
});
