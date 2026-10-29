import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Goals from "./Goals";

const state = vi.hoisted(() => ({
  goals: [] as any[],
  badges: [] as any[],
  timeline: [] as any[],
  createCalls: [] as any[],
  removeCalls: [] as any[],
}));

const mutation = vi.hoisted(() => (calls: any[]) => () => ({
  mutate: (vars: any) => calls.push(vars),
  mutateAsync: async (vars: any) => calls.push(vars),
  isPending: false,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    profile: {
      get: { useQuery: () => ({ data: { xpLevel: 4, totalXp: 450, nextLevelXp: 1000 } }) },
    },
    statistics: {
      getTimeline: { useQuery: () => ({ data: state.timeline }) },
      getPerformance: { useQuery: () => ({ data: { swolfAvg: null } }) },
    },
    activities: { list: { useQuery: () => ({ data: [] }) } },
    badges: { userBadges: { useQuery: () => ({ data: state.badges }) } },
    goals: {
      list: { useQuery: () => ({ data: state.goals, isSuccess: true }) },
      create: { useMutation: mutation(state.createCalls) },
      update: { useMutation: mutation([]) },
      remove: { useMutation: mutation(state.removeCalls) },
    },
    useUtils: () => ({ goals: { list: { invalidate: vi.fn() } } }),
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock("@/components/AppLayout", () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));

describe("Obiettivi", () => {
  afterEach(cleanup);
  beforeEach(() => {
    state.goals = [];
    state.badges = [];
    state.timeline = [];
    state.createCalls.length = 0;
    state.removeCalls.length = 0;
    localStorage.clear();
  });

  it("non ripete il titolo della pagina e mostra le sezioni", () => {
    render(<Goals />);
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    for (const name of ["Riepilogo", "I tuoi obiettivi", "Obiettivi completati", "Obiettivi suggeriti"]) {
      expect(screen.getByRole("heading", { level: 2, name })).toBeTruthy();
    }
    const summary = screen.getByRole("region", { name: "Riepilogo" });
    expect(within(summary).getByText("Verso il livello 5")).toBeTruthy();
    expect(within(summary).getByText("Obiettivi attivi")).toBeTruthy();
    expect(screen.getByText(/Nessun obiettivo creato/)).toBeTruthy();
  });

  it("somma la distanza settimanale in km (la timeline è già in km)", () => {
    state.timeline = [
      { date: "2026-10-27", distance: 4.5, pace: 120, sessions: 1 },
      { date: "2026-10-28", distance: 4.7, pace: 118, sessions: 1 },
    ];
    render(<Goals />);
    const summary = screen.getByRole("region", { name: "Riepilogo" });
    expect(within(summary).getByText("9,2")).toBeTruthy();
    // 9,2 km is above the 8 km threshold: no «more volume» suggestion.
    expect(screen.queryByText("Aumenta il volume settimanale")).toBeNull();
  });

  it("suggerisce più volume sotto gli 8 km settimanali", () => {
    state.timeline = [{ date: "2026-10-28", distance: 3.2, pace: 120, sessions: 1 }];
    render(<Goals />);
    const summary = screen.getByRole("region", { name: "Riepilogo" });
    expect(within(summary).getByText("3,2")).toBeTruthy();
    expect(screen.getAllByText("Aumenta il volume settimanale").length).toBeGreaterThan(0);
  });

  it("mostra un obiettivo con progresso e lo elimina", async () => {
    state.goals = [
      { id: 9, title: "12 km a settimana", category: "distance", currentValue: 6, targetValue: 12, unit: "km" },
    ];
    render(<Goals />);
    const goal = screen.getByRole("heading", { level: 3, name: "12 km a settimana" }).closest("li")!;
    expect(within(goal).getByText("Distanza")).toBeTruthy();
    expect(within(goal).getByText("6 / 12 km")).toBeTruthy();
    expect(within(goal).getByRole("progressbar", { name: "Progresso: 12 km a settimana" })).toBeTruthy();
    expect(within(goal).getByText("Completamento")).toBeTruthy();

    await userEvent.click(within(goal).getByRole("button", { name: "Elimina obiettivo" }));
    expect(state.removeCalls).toEqual([{ id: 9 }]);
  });

  it("crea un obiettivo dal dialogo", async () => {
    render(<Goals />);
    await userEvent.click(screen.getByRole("button", { name: "Crea obiettivo" }));
    await userEvent.type(screen.getByLabelText("Titolo"), "Delfino 200 m");
    await userEvent.type(screen.getByLabelText("Valore obiettivo"), "200");
    await userEvent.type(screen.getByLabelText("Unità"), "m");
    await userEvent.click(screen.getByRole("button", { name: "Aggiungi obiettivo" }));
    expect(state.createCalls).toEqual([
      { title: "Delfino 200 m", category: "distance", targetValue: 200, unit: "m" },
    ]);
  });
});
