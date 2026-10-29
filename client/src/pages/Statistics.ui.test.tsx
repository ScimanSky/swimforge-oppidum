import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Statistics from "./Statistics";
import { swimMetricsFixture } from "@/components/stats/metrics-fixture";

const state = vi.hoisted(() => ({
  loading: false,
  periods: [] as number[],
  metrics: undefined as any,
  metricsError: false,
  refetchMetrics: undefined as any,
  timeline: [] as any[],
  performance: undefined as any,
}));

const basePerformance = {
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
          return { data: state.timeline, isLoading: state.loading };
        },
      },
      getPerformance: { useQuery: () => ({ data: state.performance, isLoading: false }) },
      getMetrics: {
        useQuery: () => ({
          data: state.metrics,
          isPending: !state.metrics && !state.metricsError,
          isError: state.metricsError,
          refetch: state.refetchMetrics,
        }),
      },
      setCssTest: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      clearCssTest: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    useUtils: () => ({ statistics: { getMetrics: { invalidate: vi.fn() } } }),
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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
    state.timeline = [];
    state.performance = { ...basePerformance };
    state.metrics = swimMetricsFixture();
    state.metricsError = false;
    state.refetchMetrics = vi.fn();
  });

  it("non ripete il titolo della pagina e cambia periodo", async () => {
    render(<Statistics />);
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    for (const name of ["Andamento", "Analisi prestazioni", "Metriche"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
      expect(screen.getByRole("heading", { level: 2, name })).toBeTruthy();
    }
    expect(screen.getByText("Nessun dato in questo periodo")).toBeTruthy();

    const periods = screen.getByRole("group", { name: "Periodo" });
    expect(within(periods).getByRole("button", { name: "30 giorni" }).getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(within(periods).getByRole("button", { name: "90 giorni" }));
    expect(state.periods.at(-1)).toBe(90);
  });

  it("mostra zone e calorie come metriche", async () => {
    render(<Statistics />);
    await userEvent.click(screen.getByRole("button", { name: "Analisi prestazioni" }));
    expect(screen.getByText("Zone cardio")).toBeTruthy();
    expect(screen.getByText("4.210")).toBeTruthy();
    expect(screen.getByText("SWOLF medio")).toBeTruthy();
  });

  it("«Metriche»: sei riquadri chiusi, che non dipendono dal periodo", async () => {
    render(<Statistics />);
    await userEvent.click(screen.getByRole("button", { name: "Metriche" }));
    const cards = screen.getAllByRole("heading", { level: 3 });
    expect(cards.map((heading) => heading.textContent?.split(/[\d−+—]/)[0].trim())).toEqual([
      "Passo soglia",
      "Forma e fatica",
      "Intensità",
      "Efficienza della bracciata",
      "Regolarità e tenuta nelle ripetute",
      "Volume e costanza",
    ]);
    for (const heading of cards) {
      expect(within(heading).getByRole("button").getAttribute("aria-expanded")).toBe("false");
    }
    expect(screen.getByText(/il periodo scelto sopra non le cambia/)).toBeTruthy();
    // No old invented scores.
    for (const old of ["SEI", "TCI", "ACS", "Prestazione", "Previsioni", "Analisi avanzate"]) {
      expect(screen.queryByText(old)).toBeNull();
    }
  });

  it("«Metriche» in caricamento: scheletri, mentre il resto della pagina è già pronto", async () => {
    state.metrics = undefined;
    render(<Statistics />);
    await userEvent.click(screen.getByRole("button", { name: "Metriche" }));
    expect(screen.getByRole("status")).toHaveTextContent("Caricamento delle metriche");
    expect(screen.getByRole("button", { name: "Andamento" })).toBeTruthy();
  });

  it("«Metriche» non caricate: messaggio breve e Riprova", async () => {
    state.metrics = undefined;
    state.metricsError = true;
    render(<Statistics />);
    await userEvent.click(screen.getByRole("button", { name: "Metriche" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Non riesco a caricare i dati");
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(state.refetchMetrics).toHaveBeenCalled();
  });

  it("dà un nome alle zone cardio e titoli h3 sotto le sezioni h2", async () => {
    render(<Statistics />);
    await userEvent.click(screen.getByRole("button", { name: "Analisi prestazioni" }));
    expect(screen.getByRole("heading", { level: 3, name: "Zone cardio" })).toBeTruthy();
    const zones = screen.getAllByRole("listitem").map((item) => item.textContent);
    expect(zones).toEqual([
      "Z1 Recupero 10%",
      "Z2 Aerobica 50%, prevalente",
      "Z3 Soglia 30%",
      "Z4 Anaerobica 10%",
      "Z5 Massima 0%",
    ]);
  });

  it("riassume i grafici per i lettori di schermo", async () => {
    state.timeline = [
      { date: "2026-10-20", distance: 2.5, pace: 110, sessions: 1 },
      { date: "2026-10-22", distance: 3.2, pace: 120, sessions: 2 },
      { date: "2026-10-24", distance: 0, pace: null, sessions: 0 },
    ];
    render(<Statistics />);
    // Weighted by sessions: (110 + 2 × 120) / 3 = 116,7 s → 1:57.
    expect(screen.getByText("Nel periodo 5,7 km in 3 nuotate, passo medio 1:57 /100 m.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Analisi prestazioni" }));
    expect(screen.getByText("Nuotate per fascia di passo: 1:30-1:45 3.")).toBeTruthy();
  });

  it("cambiando periodo resta aperta la sezione scelta", async () => {
    const user = userEvent.setup({ delay: null });
    const { rerender } = render(<Statistics />);
    await user.click(screen.getByRole("button", { name: "Metriche" }));
    expect(screen.getByRole("button", { name: "Metriche" }).getAttribute("aria-expanded")).toBe("true");
    state.loading = true;
    await user.click(screen.getByRole("button", { name: "90 giorni" }));
    state.loading = false;
    rerender(<Statistics />);
    expect(screen.getByRole("button", { name: "Metriche" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("senza calorie non mostra lo zero", async () => {
    state.performance = { ...basePerformance, caloriesTotal: 0, avgCaloriesPerSession: 0 };
    render(<Statistics />);
    await userEvent.click(screen.getByRole("button", { name: "Analisi prestazioni" }));
    expect(screen.queryByText("Calorie totali")).toBeNull();
    expect(screen.getByText("SWOLF medio")).toBeTruthy();
  });

  it("mostra lo stato di caricamento", () => {
    state.loading = true;
    render(<Statistics />);
    expect(screen.getByRole("status").textContent).toContain("Caricamento statistiche");
  });
});
