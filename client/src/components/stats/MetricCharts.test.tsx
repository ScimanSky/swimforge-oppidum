import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LoadTooltipContent, niceScale, PacingTooltipContent, type LoadDatum } from "./MetricCharts";
import { swimMetricsFixture } from "./metrics-fixture";

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

/** The rows of a tooltip as the user reads them: «label value». */
const tooltipRows = () =>
  Array.from(screen.getAllByRole("definition")[0].closest("dl")!.children).map((row) =>
    Array.from(row.children)
      .map((cell) => cell.textContent)
      .join(" ")
  );

describe("suggerimenti dei grafici delle metriche", () => {
  afterEach(cleanup);
  const sessions = swimMetricsFixture().sessions;
  const day = (values: Partial<LoadDatum>): LoadDatum => ({
    date: "2026-10-20",
    forma: 40.4,
    fatica: 47.2,
    equilibrio: -6.8,
    stss: 0,
    sessions: [],
    ...values,
  });
  const showLoad = (datum: LoadDatum) =>
    render(<>{LoadTooltipContent({ active: true, payload: [{ payload: datum } as any] })}</>);

  it("forma: giorno con una nuotata, il passo soglia usato per il suo carico", () => {
    const swim = sessions.find((session) => session.date === "2026-10-20")!;
    showLoad(day({ stss: 69.4, sessions: [swim] }));
    expect(screen.getByText("20 ott")).toBeTruthy();
    expect(tooltipRows()).toEqual([
      "Forma 40",
      "Fatica 47",
      "Equilibrio −7 · neutro",
      "Carico del giorno 69",
      "Soglia usata 1:49 /100 m (stima)",
    ]);
  });

  it("forma: la soglia di ogni fonte, test, stima o le tue zone", () => {
    const swim = sessions.find((session) => session.date === "2026-10-20")!;
    const rows = (cssSource: "test" | "stima" | "zone manuali", pace: number) => {
      cleanup();
      showLoad(day({ stss: 69.4, sessions: [{ ...swim, cssPaceSecondsPer100: pace, cssSource }] }));
      return tooltipRows().find((row) => row.startsWith("Soglia usata"));
    };
    expect(rows("test", 108.5)).toBe("Soglia usata 1:49 /100 m (test)");
    expect(rows("stima", 108.5)).toBe("Soglia usata 1:49 /100 m (stima)");
    expect(rows("zone manuali", 110)).toBe("Soglia usata 1:50 /100 m (confine B2/C1 delle tue zone)");
  });

  it("forma: una nuotata senza giri ha il carico stimato", () => {
    const openWater = sessions.find((session) => session.isOpenWater)!;
    showLoad(day({ date: "2026-10-13", stss: 31.6, sessions: [openWater] }));
    expect(tooltipRows()).toContain("Carico del giorno 32 (stimato)");
  });

  it("forma: la lettura di ogni giorno segue le fasce condivise", () => {
    showLoad(day({ equilibrio: -12.4 }));
    expect(tooltipRows()).toEqual(["Forma 40", "Fatica 47", "Equilibrio −12 · in costruzione"]);
    cleanup();
    showLoad(day({ equilibrio: 25.6 }));
    expect(tooltipRows()).toContain("Equilibrio +26 · molto riposato");
    cleanup();
    showLoad(day({ equilibrio: -31 }));
    expect(tooltipRows()).toContain("Equilibrio −31 · carico alto");
  });

  it("ripetute: variabilità, calo e tenuta della bracciata della nuotata", () => {
    const swim = sessions.find((session) => session.date === "2026-10-27")! as any;
    render(<>{PacingTooltipContent({ active: true, payload: [{ payload: swim }] })}</>);
    expect(screen.getByText("27 ott")).toBeTruthy();
    expect(tooltipRows()).toEqual([
      "Variabilità 2,7%",
      "Calo nel finale +5,8%",
      "Bracciata nel finale −5,6%",
      "Frequenza nel finale +6,2%",
    ]);
  });

  it("nessun suggerimento fuori dal grafico", () => {
    const { container } = render(<>{PacingTooltipContent({ active: false, payload: [] })}</>);
    expect(container).toBeEmptyDOMElement();
  });
});
