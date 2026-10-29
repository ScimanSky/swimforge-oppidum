import { describe, expect, it } from "vitest";
import { swimMetricsFixture } from "@/components/stats/metrics-fixture";
import {
  dpsDropReading,
  efficiencyComparison,
  intensityCoverageText,
  loadEstimatedText,
  zonePaceRows,
} from "./swim-metrics-view";

describe("metriche: testi del riquadro", () => {
  it("passi delle zone da un passo soglia di 1:40 (confini dalle velocità condivise)", () => {
    expect(zonePaceRows(100).map((row) => `Z${row.zone} ${row.name}: ${row.pace}`)).toEqual([
      "Z1 Facile: più lento di 1:58",
      "Z2 Aerobico: 1:49–1:58",
      "Z3 Medio: 1:43–1:49",
      "Z4 Soglia: 1:37–1:43",
      "Z5 Sopra soglia: più veloce di 1:37",
    ]);
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
        { label: "Distanza per ciclo", recent: "1,72 m", baseline: null },
        { label: "Passo", recent: "1:53 /100 m", baseline: null },
      ]);
    });
  });
});
