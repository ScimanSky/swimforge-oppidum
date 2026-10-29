import { describe, expect, it } from "vitest";
import { niceScale } from "./MetricCharts";

describe("assi dei grafici delle metriche", () => {
  it("Stroke Index: tacche tonde a passo 0,05", () => {
    expect(niceScale([1.39, 1.55], [0.01, 0.02, 0.05, 0.1])).toEqual({
      domain: [1.35, 1.55],
      ticks: [1.35, 1.4, 1.45, 1.5, 1.55],
    });
  });

  it("tempi delle ripetute: tacche ogni 5 secondi", () => {
    expect(niceScale([87, 96], [1, 2, 5, 10])).toEqual({ domain: [85, 100], ticks: [85, 90, 95, 100] });
  });

  it("un solo valore resta in mezzo all'asse", () => {
    expect(niceScale([100, 100], [1, 2, 5])).toEqual({ domain: [99, 101], ticks: [99, 100, 101] });
  });
});
