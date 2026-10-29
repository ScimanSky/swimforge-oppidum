import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Statistics from "./Statistics";

const state = vi.hoisted(() => ({
  loading: false,
  periods: [] as number[],
  advanced: undefined as any,
}));

const performance = {
  hrZones: { zone1: 10, zone2: 50, zone3: 30, zone4: 10, zone5: 0 },
  paceDistribution: [{ range: "1:30-1:45", count: 3 }],
  caloriesTotal: 4210,
  avgCaloriesPerSession: 350,
  swolfAvg: 41,
};

vi.mock("@/lib/trpc", () => ({
  trpc: {
    statistics: {
      getTimeline: {
        useQuery: (input: { days: number }) => {
          state.periods.push(input.days);
          return { data: [], isLoading: state.loading };
        },
      },
      getPerformance: { useQuery: () => ({ data: performance, isLoading: false }) },
      getAdvanced: { useQuery: () => ({ data: state.advanced, isLoading: false }) },
    },
  },
}));

vi.mock("@/components/AppLayout", () => ({
  AppLayout: ({ children }: any) => <div>{children}</div>,
}));

// recharts measures its container: jsdom has no layout.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return { ...actual, ResponsiveContainer: ({ children }: any) => <div>{children}</div> };
});

describe("Statistiche", () => {
  afterEach(cleanup);
  beforeEach(() => {
    state.loading = false;
    state.periods.length = 0;
    state.advanced = {
      performanceIndex: 72.4,
      consistencyScore: null,
      recoveryReadinessScore: 64,
      streak: { current: 3, record: 9 },
      swimmingEfficiencyIndex: 55,
      technicalConsistencyIndex: 61,
      strokeEfficiencyRating: 48,
      aerobicCapacityScore: 70,
      poiBaseline: true,
      progressiveOverloadIndex: 12,
      trendBaseline: true,
      trendIndicator: { direction: "down", percentage: 8 },
      predictions: null,
    };
  });

  it("non ripete il titolo della pagina e cambia periodo", async () => {
    render(<Statistics />);
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    for (const name of ["Andamento", "Analisi prestazioni", "Analisi avanzate"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
    expect(screen.getByText("Nessun dato in questo periodo")).toBeTruthy();

    const periods = screen.getByRole("group", { name: "Periodo" });
    expect(within(periods).getByRole("button", { name: "30 giorni" }).getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(within(periods).getByRole("button", { name: "90 giorni" }));
    expect(state.periods.at(-1)).toBe(90);
  });

  it("mostra zone, calorie e punteggi come metriche", async () => {
    render(<Statistics />);
    await userEvent.click(screen.getByRole("button", { name: "Analisi prestazioni" }));
    expect(screen.getByText("Zone cardio")).toBeTruthy();
    expect(screen.getByText("4.210")).toBeTruthy();
    expect(screen.getByText("SWOLF medio")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Analisi avanzate" }));
    expect(screen.getByText("Prestazione")).toBeTruthy();
    expect(screen.getByText("72")).toBeTruthy();
    expect(screen.getByText("Dati insufficienti")).toBeTruthy();
    expect(screen.getByText("−8")).toBeTruthy();
    expect(screen.getByText("Serie attuale")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Come si calcola: SEI" }));
    expect(screen.getByRole("dialog", { name: "Indice di efficienza in acqua (SEI)" })).toBeTruthy();
  });

  it("mostra lo stato di caricamento", () => {
    state.loading = true;
    render(<Statistics />);
    expect(screen.getByRole("status").textContent).toContain("Caricamento statistiche");
  });
});
