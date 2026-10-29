import { describe, expect, it } from "vitest";
import { swimMetricsFixture } from "@/components/stats/metrics-fixture";
import {
  dpsDropReading,
  efficiencyComparison,
  intensityChartSummary,
  intensityCoverageText,
  loadEstimatedText,
  zoneShareItems,
  zonesSourceText,
  zoneTableRows,
} from "./swim-metrics-view";

describe("metriche: testi del riquadro", () => {
  it("le sette zone del proprietario dal passo soglia 1:48,5: codice, nome, livello, passo e ripetuta massima", () => {
    const rows = zoneTableRows(swimMetricsFixture().zones, "zone");
    expect(rows.map((row) => [row.label, row.detail, row.pace, row.maxRep])).toEqual([
      ["A1 Recupero attivo", "Facile", "più lento di 2:08", null],
      ["A2 Fondo lento", "Aerobico", "2:01–2:08", null],
      ["B1 Fondo medio", "Medio", "1:54–2:01", null],
      ["B2 Fondo medio-alto", "Soglia", "1:49–1:54", null],
      ["C1 Soglia anaerobica", "Soglia", "1:44–1:49", "max 200 m"],
      ["C2 Capacità anaerobica", "Sopra soglia", "più veloce di 1:44", "max 150 m"],
      ["C3 Potenza anaerobica", "Sopra soglia", "più veloce di 1:44", "max 25 m"],
    ]);
    expect(rows.map((row) => row.color)).toEqual([
      "var(--pace-a1)", "var(--pace-a2)", "var(--pace-b1)", "var(--pace-b2)", "var(--pace-c1)", "var(--pace-c2)", "var(--pace-c3)",
    ]);
  });

  it("i cinque livelli allineati alle zone", () => {
    const rows = zoneTableRows(swimMetricsFixture().zones, "livelli");
    expect(rows.map((row) => [row.label, row.detail, row.pace])).toEqual([
      ["Facile", "A1", "più lento di 2:08"],
      ["Aerobico", "A2", "2:01–2:08"],
      ["Medio", "B1", "1:54–2:01"],
      ["Soglia", "B2 e C1", "1:44–1:54"],
      ["Sopra soglia", "C2 e C3", "più veloce di 1:44"],
    ]);
  });

  it("metri per zona o per livello, con il colore della zona", () => {
    const zoneMeters = swimMetricsFixture().intensity.last28!.zoneMeters;
    expect(zoneShareItems(zoneMeters, "zone").map((item) => [item.label, item.meters])).toEqual([
      ["A1 Recupero attivo", 2500], ["A2 Fondo lento", 2900], ["B1 Fondo medio", 900], ["B2 Fondo medio-alto", 400],
      ["C1 Soglia anaerobica", 1100], ["C2 Capacità anaerobica", 450], ["C3 Potenza anaerobica", 150],
    ]);
    expect(zoneShareItems(zoneMeters, "livelli").map((item) => [item.label, item.meters, item.color])).toEqual([
      ["Facile", 2500, "var(--pace-a1)"],
      ["Aerobico", 2900, "var(--pace-a2)"],
      ["Medio", 900, "var(--pace-b1)"],
      ["Soglia", 1500, "var(--pace-c1)"],
      ["Sopra soglia", 600, "var(--pace-c2)"],
    ]);
  });

  it("sintesi del grafico settimanale nelle due viste", () => {
    const weeks = swimMetricsFixture().intensity.weeks;
    expect(intensityChartSummary(weeks, "zone")).toBe(
      "Ultime 8 settimane: 13,6 km a stile libero nelle zone, 8,6 in A1–A2 (facile), 2,4 in B1–B2 (medio), 2,6 in C1–C3 (intenso); 1,8 km di altri stili, tecnica o gambe non classificati."
    );
    expect(intensityChartSummary(weeks, "livelli")).toBe(
      "Ultime 8 settimane: 13,6 km a stile libero nelle zone: Facile 4, Aerobico 4,6, Medio 1,7, Soglia 2,5, Sopra soglia 0,9; 1,8 km di altri stili, tecnica o gambe non classificati."
    );
  });

  it("da dove vengono le zone", () => {
    const metrics = swimMetricsFixture();
    expect(zonesSourceText(metrics)).toBe(
      "Calcolate dal tuo passo soglia 1:49 (stima, affidabilità media), che è il confine tra B2 e C1."
    );
    metrics.zones = { ...metrics.zones, source: "manuali", manualUpdatedAt: "2026-10-25T09:00:00.000Z" };
    expect(zonesSourceText(metrics)).toBe("Le tue zone, inserite il 25 ott.");
    metrics.zones = { source: null, ranges: [], bounds: null, autoBounds: null, manualUpdatedAt: null };
    expect(zonesSourceText(metrics)).toBeNull();
  });

  it("tenuta della bracciata: oltre il 5% si accorcia, fino al 5% tiene", () => {
    expect(dpsDropReading(5)).toBe("la bracciata tiene");
    expect(dpsDropReading(5.1)).toBe("la bracciata si accorcia nel finale");
    expect(dpsDropReading(-1)).toBe("la bracciata tiene");
  });

  it("carico stimato: quante nuotate senza giri", () => {
    const metrics = swimMetricsFixture();
    expect(loadEstimatedText(metrics)).toBe(
      "1 nuotata senza giri: carico stimato su distanza e durata totale, come fa TrainingPeaks."
    );
    metrics.sessions[0] = { ...metrics.sessions[0], loadEstimated: true, hasLaps: false };
    expect(loadEstimatedText(metrics)).toMatch(/^2 nuotate senza giri:/);
  });

  it("intensità: le nuotate con i giri prima del passo soglia restano fuori dalle zone, e lo dice", () => {
    const metrics = swimMetricsFixture();
    metrics.sessions = metrics.sessions.map((session) =>
      session.date === "2026-10-06" ? { ...session, zoneMeters: null, cssPaceSecondsPer100: null } : session
    );
    expect(intensityCoverageText(metrics)).toBe(
      "Zone calcolate sul 72% del volume delle ultime 4 settimane. Fuori dalle zone: 1,2 km di altri stili, tecnica o gambe; 2 km in acque libere; 3,2 km di nuotate senza passo soglia."
    );
  });

  describe("efficienza: lo Stroke Index sale con la bracciata o solo con la velocità", () => {
    const base = swimMetricsFixture().efficiency;
    const reading = (values: Partial<typeof base>) => efficiencyComparison({ ...base, ...values }).reading;

    it("più lunga e più veloce, solo più lunga, solo più veloce", () => {
      expect(reading({})).toBe("Lo Stroke Index sale con una bracciata più lunga e un passo più veloce.");
      expect(reading({ pace28: 119.6 })).toBe("Lo Stroke Index sale con una bracciata più lunga.");
      // 1,704 is shown as 1,70: the same distance per cycle as the base.
      expect(reading({ dps28: 1.704 })).toBe(
        "Lo Stroke Index sale solo perché vai più veloce: la distanza per ciclo non cresce."
      );
    });

    it("quando scende", () => {
      expect(reading({ deltaPct: -5, dps28: 1.66, pace28: 121 })).toBe(
        "Lo Stroke Index scende con una bracciata più corta e un passo più lento."
      );
      expect(reading({ deltaPct: -5, dps28: 1.66, pace28: 119.7 })).toBe(
        "Lo Stroke Index scende con una bracciata più corta."
      );
      expect(reading({ deltaPct: -5, dps28: 1.7, pace28: 125 })).toBe(
        "Lo Stroke Index scende perché vai più piano: la distanza per ciclo non cala."
      );
    });

    it("nessuna frase senza variazione visibile o senza base", () => {
      expect(reading({ deltaPct: 0.3 })).toBeNull();
      const noBase = efficiencyComparison({ ...base, baseline: null, deltaPct: null, dpsBaseline: null, paceBaseline: null });
      expect(noBase.reading).toBeNull();
      expect(noBase.rows).toEqual([
        { label: "Stroke Index", recent: "1,52", baseline: null },
        { label: "Distanza per ciclo (m)", recent: "1,72", baseline: null },
        { label: "Passo (/100 m)", recent: "1:53", baseline: null },
      ]);
    });
  });
});
