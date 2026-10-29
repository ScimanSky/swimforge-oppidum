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
    expect(text).toContain("scartato 300 m in 5:00 il 10/10 (più lento del tuo 400 m)");
    expect(text).toContain("equilibrio −7,8 (neutro), cioè forma − fatica a fine di ieri");
    expect(text).toContain("forma +2,1 punti in 7 giorni");
    expect(text).toContain("facile 72% · medio 18% · intenso 10%");
    expect(text).toContain("Stroke Index, vasca 25 m");
    expect(text).toContain("base 2,02 su 9 nuotate (+4,0%)");
    expect(text).toContain("variabilità 2,8% (regolare)");
    expect(text).toContain("7,4 km e 2,8 nuotate a settimana (+12% sulle 4 precedenti)");
    expect(text).toContain("serie: 5 settimane");
    for (const name of OLD_NAMES) expect(text).not.toMatch(name);
  });

  it("gives the zones as paces for the current CSS, never as speed percentages alone", () => {
    const text = swimMetricsForCoach(sampleSwimMetrics()); // CSS 1:44.3
    expect(text).toContain(
      "Zone di passo per questo passo soglia (solo stile libero): Z1 Facile più lento di 2:03 · Z2 Aerobico 1:53–2:03 · Z3 Medio 1:48–1:53 · Z4 Soglia 1:41–1:48 · Z5 Sopra soglia più veloce di 1:41 (per 100 m)",
    );
    expect(text).not.toMatch(/\d+\s?% della velocità/);
    expect(text).not.toMatch(/85%|92%|97%|103%/);
  });

  it("gives the sample sizes and the coverage behind each number", () => {
    const text = swimMetricsForCoach(sampleSwimMetrics());
    expect(text).toContain("mediana 28 giorni 2,10 su 5 nuotate");
    expect(text).toContain("copertura 80% del volume (non classificati 1,2 km: altri stili, tecnica, gambe)");
    // One of the 6 swims of the last 6 weeks has no laps.
    expect(text).toContain("carico di 6 nuotate nelle ultime 6 settimane, 1 senza giri (stimato su distanza e durata totale)");
  });

  it("tells a longer stroke from a faster one: distance per cycle and pace against the baseline", () => {
    const text = swimMetricsForCoach(sampleSwimMetrics());
    expect(text).toContain("distanza per bracciata 2,05 m (base 1,98 m, +3,5%: più strada per bracciata)");
    expect(text).toContain("passo 1:52/100 m (base 1:55/100 m)");
    const faster = sampleSwimMetrics();
    faster.efficiency = { ...faster.efficiency, dps28: 1.98, dpsBaseline: 1.98, pace28: 108 };
    expect(swimMetricsForCoach(faster)).toContain("(base 1,98 m, 0,0%: distanza per bracciata invariata, lo Stroke Index cambia per il passo)");
  });

  it("writes the stroke holding in the repeat sets", () => {
    const text = swimMetricsForCoach(sampleSwimMetrics());
    expect(text).toContain("Regolarità e tenuta nelle ripetute (ultimi 28 giorni)");
    expect(text).toContain("distanza per bracciata nel finale −2,0% · frequenza +1,5%");
    expect(text).toContain("ultima serie 3×100 stile libero il 26/10: 1:32, 1:33, 1:34 (distanza per bracciata 2,40, 2,35, 2,25 m: −6,3%, la bracciata si accorcia nel finale)");
    const shortening = sampleSwimMetrics();
    shortening.pacing = { ...shortening.pacing, dpsDrop28: 7.2 };
    expect(swimMetricsForCoach(shortening)).toContain("distanza per bracciata nel finale −7,2% (la bracciata si accorcia nel finale)");
  });

  it("labels a 25-yard pool as such", () => {
    const metrics = sampleSwimMetrics();
    metrics.efficiency.poolLengthMeters = 23;
    metrics.sessions[4] = { ...metrics.sessions[4], poolLengthMeters: 23 };
    metrics.css.current!.points = [
      { distanceMeters: 183, seconds: 160, date: "2026-10-06", nominalDistance: 200, distanceUnit: "yd" },
      { distanceMeters: 366, seconds: 340, date: "2026-10-06", nominalDistance: 400, distanceUnit: "yd" },
    ];
    const text = swimMetricsForCoach(metrics);
    expect(text).toContain("Stroke Index, vasca 25 yd");
    expect(text).toContain("vasca 25 yd · IF");
    expect(text).toContain("200 yd in 2:40 il 06/10");
  });

  it("lists the last 5 swims, newest first, with IF, load and zones", () => {
    const text = swimMetricsForCoach(sampleSwimMetrics());
    const swims = text.split("ULTIME 5 NUOTATE")[1].trim().split("\n");
    expect(swims).toHaveLength(5);
    expect(swims[0]).toBe("- 27/10 · 2,0 km · acque libere · IF 0,86 · carico 42 (stimato, senza giri)");
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
    expect(text).toContain("Regolarità e tenuta nelle ripetute: non disponibile. Servono serie di ripetute.");
  });

  it("without swims", () => {
    const metrics = sampleSwimMetrics();
    metrics.sessions = [];
    expect(swimMetricsForCoach(metrics)).toContain("ULTIME 5 NUOTATE\n- nessuna nuotata negli ultimi 90 giorni");
  });
});

describe("swimMetricsGlossary", () => {
  it("is a compact version of the shared definitions (at most 1,500 characters)", () => {
    const glossary = swimMetricsGlossary();
    for (const name of ["Passo soglia", "Forma e fatica", "Intensità", "Efficienza della bracciata", "Regolarità e tenuta nelle ripetute", "Volume e costanza"]) {
      expect(glossary).toContain(`- ${name}:`);
    }
    expect(glossary.length).toBeLessThanOrEqual(1500);
    expect(glossary).toContain("Wakayoshi");
    expect(glossary).toContain("Costill");
    expect(glossary).toContain("equilibrio = forma − fatica a fine di ieri");
    expect(glossary).toContain("IF 0,80");
    expect(glossary).toContain("Craig e Pendergast");
    expect(glossary).not.toMatch(/85%|92%|97%|103%/);
    for (const name of OLD_NAMES) expect(glossary).not.toMatch(name);
  });
});

describe("SWIM_METRICS_COACH_RULES", () => {
  it("tells the model to use only these metrics and not to invent indices", () => {
    expect(SWIM_METRICS_COACH_RULES).toMatch(/solo/);
    expect(SWIM_METRICS_COACH_RULES).toMatch(/non inventare/);
    expect(SWIM_METRICS_COACH_RULES).toMatch(/affidabilità/);
  });

  it("asks for the zone paces and a progressive endurance build when the swimmer fades", () => {
    expect(SWIM_METRICS_COACH_RULES).toMatch(/m:ss\/100 m/);
    expect(SWIM_METRICS_COACH_RULES).toMatch(/ripetute brevi con poco recupero → serie spezzate → nuoto continuo/);
    expect(SWIM_METRICS_COACH_RULES).toMatch(/esercizi tecnici/);
    expect(SWIM_METRICS_COACH_RULES).toMatch(/«nuota di più»/);
  });
});
