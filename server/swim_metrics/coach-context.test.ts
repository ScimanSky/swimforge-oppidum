import { describe, expect, it } from "vitest";
import {
  PACE_ZONE_COACH_RULES,
  SWIM_METRICS_COACH_RULES,
  swimMetricsForCoach,
  swimMetricsGlossary,
} from "./coach-context";
import { paceZoneRanges } from "@shared/swimMetrics";
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
    expect(text).toContain("facile (A1–A2) 72% · medio (B1–B2) 18% · intenso (C1–C3) 10%");
    expect(text).toContain("per zona A1 30%, A2 42%, B1 10%, B2 8%, C1 6%, C2 3%, C3 1%");
    expect(text).toContain("Stroke Index, vasca 25 m");
    expect(text).toContain("base 2,02 su 9 nuotate (+4,0%)");
    expect(text).toContain("variabilità 2,8% (regolare)");
    expect(text).toContain("7,4 km e 2,8 nuotate a settimana (+12% sulle 4 precedenti)");
    expect(text).toContain("serie: 5 settimane");
    for (const name of OLD_NAMES) expect(text).not.toMatch(name);
  });

  it("gives the seven zones with the user's paces, levels, maximum reps, sensations and purpose", () => {
    const text = swimMetricsForCoach(sampleSwimMetrics()); // CSS 1:44.3
    const block = text.split("ZONE DI PASSO A1–C3")[1].split("\nULTIME 5 NUOTATE")[0];
    expect(block.split("\n")[0]).toBe(
      " (zone automatiche dal passo soglia 1:44/100 m, stima; valgono per lo stile libero; dalla più lenta alla più esplosiva)",
    );
    expect(block).toContain(
      "- A1 Recupero attivo · livello Facile: più lento di 2:03/100 m · respiro tranquillo, quasi come a riposo, potresti parlare normalmente, RPE 2–3 · Scalda, fa recuperare tra le serie e scioglie a fine allenamento; è il ritmo giusto per curare la tecnica.",
    );
    expect(block).toContain("- A2 Fondo lento · livello Aerobico: 1:56–2:03/100 m ·");
    expect(block).toContain("- B1 Fondo medio · livello Medio: 1:50–1:56/100 m ·");
    expect(block).toContain("- B2 Fondo medio-alto · livello Soglia: 1:44–1:50/100 m · respiro impegnato, poche parole tra una vasca e l'altra, RPE 6–7");
    expect(block).toContain("- C1 Soglia anaerobica · livello Soglia: 1:40–1:44/100 m · max 200 m a ripetuta ·");
    expect(block).toContain("- C2 Capacità anaerobica · livello Sopra soglia: più veloce di 1:40/100 m · max 150 m a ripetuta ·");
    expect(block).toContain("- C3 Potenza anaerobica · livello Sopra soglia: più veloce di 1:40/100 m · max 25 m a ripetuta ·");
    expect(text).not.toMatch(/\d+\s?% della velocità/);
    expect(text).not.toMatch(/85%|90%|95%|104%/);
  });

  it("says when the zones are the athlete's own", () => {
    const metrics = sampleSwimMetrics();
    const bounds = { a1a2: 130, a2b1: 122, b1b2: 116, b2c1: 110, c1c2: 105 };
    metrics.zones = { ...metrics.zones, source: "manuali", bounds, ranges: paceZoneRanges(bounds) };
    const text = swimMetricsForCoach(metrics);
    expect(text).toContain("ZONE DI PASSO A1–C3 (zone manuali inserite dall'atleta, al posto di quelle dal passo soglia;");
    expect(text).toContain("- B2 Fondo medio-alto · livello Soglia: 1:50–1:56/100 m");
  });

  it("without zones: the guide without paces, and what is missing", () => {
    const metrics = sampleSwimMetrics();
    metrics.zones = { source: null, ranges: [], bounds: null, autoBounds: null, manualUpdatedAt: null };
    const text = swimMetricsForCoach(metrics);
    expect(text).toContain(
      "ZONE DI PASSO A1–C3 (passi non disponibili: servono il passo soglia o le zone dell'atleta; usa livello e fatica percepita)",
    );
    expect(text).toContain("- B2 Fondo medio-alto · livello Soglia · respiro impegnato");
    expect(text).not.toContain("/100 m · respiro impegnato");
  });

  it("says when the threshold of the load is the B2/C1 boundary of the manual zones", () => {
    const metrics = sampleSwimMetrics();
    metrics.load.threshold = { paceSecondsPer100: 110, source: "zone manuali" };
    expect(swimMetricsForCoach(metrics)).toContain(
      "soglia del carico: confine B2/C1 delle zone manuali (1:50/100 m), perché manca il passo soglia",
    );
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
    expect(swims[1]).toBe("- 26/10 · 2,5 km · vasca 25 m · IF 0,92 · carico 56 · zone A1 20%, A2 40%, B1 12%, B2 8%, C1 12%, C2 4%, C3 4%");
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
    expect(glossary).not.toMatch(/85%|90%|95%|104%/);
    expect(glossary).toContain("zone A1–C3");
    expect(glossary).toContain("facile = A1–A2, medio = B1–B2, intenso = C1–C3");
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
    expect(SWIM_METRICS_COACH_RULES).toMatch(/zone A1–C3/);
    expect(SWIM_METRICS_COACH_RULES).toMatch(/m:ss\/100 m/);
    expect(SWIM_METRICS_COACH_RULES).toMatch(/ripetute brevi con poco recupero → serie spezzate → nuoto continuo/);
    expect(SWIM_METRICS_COACH_RULES).toMatch(/esercizi tecnici/);
    expect(SWIM_METRICS_COACH_RULES).toMatch(/«nuota di più»/);
  });
});

describe("PACE_ZONE_COACH_RULES", () => {
  it("every rep has zone, level and pace; the maximum reps; the zones explained; followable without them", () => {
    expect(PACE_ZONE_COACH_RULES).toContain(
      "ogni ripetuta di un allenamento che proponi ha il codice della zona, il livello e il passo obiettivo dalle zone dell'atleta, per esempio «6×100 B2 · Soglia 1:49–1:54, rec. 20″»",
    );
    expect(PACE_ZONE_COACH_RULES).toContain("non superare mai la ripetuta massima: C1 200 m, C2 150 m, C3 25 m");
    expect(PACE_ZONE_COACH_RULES).toContain("il suo allenatore non le usa");
    expect(PACE_ZONE_COACH_RULES).toContain(
      "spiega in breve, con parole semplici, ogni zona che usi: sensazione (respiro, quanto riesci a parlare, fatica da 1 a 10), passo e a cosa serve",
    );
    expect(PACE_ZONE_COACH_RULES).toContain("Facile, Aerobico, Medio, Soglia, Sopra soglia");
  });
});
