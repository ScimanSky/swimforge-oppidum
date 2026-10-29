import { describe, expect, it } from "vitest";
import { SWIM_METRICS_COACH_RULES, swimMetricsForCoach, swimMetricsGlossary } from "./coach-context";
import { sampleSwimMetrics } from "./test-helpers";

const OLD_NAMES = [/\bSEI\b/, /\bTCI\b/, /\bSER\b/, /\bACS\b/, /\bRRS\b/, /\bPOI\b/, /Performance Index/i, /Consistency Score/i];

describe("swimMetricsForCoach", () => {
  it("writes the six metrics with source, reliability and readings", () => {
    const text = swimMetricsForCoach(sampleSwimMetrics());
    expect(text).toContain("Passo soglia (CSS): 1:44/100 m");
    expect(text).toContain("stima dai tuoi tratti continui, affidabilità alta");
    expect(text).toContain("200 m in 2:55 il 06/10");
    expect(text).toContain("equilibrio −7,8 (neutro)");
    expect(text).toContain("forma +2,1 punti in 7 giorni");
    expect(text).toContain("facile 72% · medio 18% · intenso 10%");
    expect(text).toContain("Stroke Index, vasca 25 m");
    expect(text).toContain("base 2,02 (+4,0%)");
    expect(text).toContain("variabilità 2,8% (regolare)");
    expect(text).toContain("7,4 km e 2,8 nuotate a settimana (+12% sulle 4 precedenti)");
    expect(text).toContain("serie: 5 settimane");
    for (const name of OLD_NAMES) expect(text).not.toMatch(name);
  });

  it("lists the last 5 swims, newest first, with IF, load and zones", () => {
    const text = swimMetricsForCoach(sampleSwimMetrics());
    const swims = text.split("ULTIME 5 NUOTATE")[1].trim().split("\n");
    expect(swims).toHaveLength(5);
    expect(swims[0]).toBe("- 27/10 · 2,0 km · acque libere · IF 0,86 · carico 42");
    expect(swims[1]).toBe("- 26/10 · 2,5 km · vasca 25 m · IF 0,92 · carico 56 · zone Z1 20%, Z2 40%, Z3 20%, Z4 16%, Z5 4%");
  });

  it("says what is missing and the CSS test date", () => {
    const metrics = sampleSwimMetrics();
    metrics.css.current = { ...metrics.css.current!, source: "test", confidence: null, testDate: "2026-10-20" };
    metrics.load = { today: null, rampPerWeek: null, days: [], missing: "Serve il passo soglia." };
    metrics.pacing = { cv28: null, fade28: null, latestSet: null, missing: "Servono serie di ripetute." };
    const text = swimMetricsForCoach(metrics);
    expect(text).toContain("test del 20/10/2026");
    expect(text).toContain("Forma e fatica: non disponibile. Serve il passo soglia.");
    expect(text).toContain("Regolarità nelle ripetute: non disponibile. Servono serie di ripetute.");
  });

  it("without swims", () => {
    const metrics = sampleSwimMetrics();
    metrics.sessions = [];
    expect(swimMetricsForCoach(metrics)).toContain("ULTIME 5 NUOTATE\n- nessuna nuotata negli ultimi 90 giorni");
  });
});

describe("swimMetricsGlossary", () => {
  it("is generated from the shared definitions", () => {
    const glossary = swimMetricsGlossary();
    for (const name of ["Passo soglia", "Forma e fatica", "Intensità", "Efficienza della bracciata", "Regolarità nelle ripetute", "Volume e costanza"]) {
      expect(glossary).toContain(`- ${name}:`);
    }
    expect(glossary).toContain("Wakayoshi");
    expect(glossary).toContain("Costill");
    for (const name of OLD_NAMES) expect(glossary).not.toMatch(name);
  });
});

describe("SWIM_METRICS_COACH_RULES", () => {
  it("tells the model to use only these metrics and not to invent indices", () => {
    expect(SWIM_METRICS_COACH_RULES).toMatch(/solo/);
    expect(SWIM_METRICS_COACH_RULES).toMatch(/non inventare/);
    expect(SWIM_METRICS_COACH_RULES).toMatch(/affidabilità/);
  });
});
