import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Coach from "./Coach";

const state = vi.hoisted(() => ({
  advanced: undefined as any,
  workouts: undefined as any,
  insights: [] as any[],
  generateCalls: 0,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    auth: { me: { useQuery: () => ({ data: { id: 7 } }) } },
    statistics: { getAdvanced: { useQuery: () => ({ data: state.advanced }) } },
    aiCoach: {
      getWorkouts: { useQuery: () => ({ data: state.workouts }) },
      generateWorkouts: {
        useMutation: () => ({
          mutateAsync: async () => {
            state.generateCalls += 1;
            return state.workouts;
          },
        }),
      },
      chat: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
    },
    activityInsights: { list: { useQuery: () => ({ data: state.insights }) } },
    useUtils: () => ({
      aiCoach: { getWorkouts: { setData: vi.fn(), refetch: vi.fn(async () => undefined) } },
    }),
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

vi.mock("@/components/AppLayout", () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("streamdown", () => ({ Streamdown: ({ children }: any) => <p>{children}</p> }));

const workout = (title: string) => ({
  type: "pool",
  title,
  description: "Lavoro aerobico",
  duration: "45 min",
  difficulty: "Media",
  sections: [
    { title: "Riscaldamento", exercises: [{ name: "400 m sciolti", distance: "400 m" }] },
    { title: "Centrale", exercises: [{ name: "8x100 m", rest: "20 s" }] },
  ],
  coachNotes: [],
});

describe("Coach AI", () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState(null, "", "/");
  });
  beforeEach(() => {
    localStorage.clear();
    state.generateCalls = 0;
    state.advanced = {
      performanceIndex: 62,
      consistencyScore: 48,
      recoveryReadinessScore: null,
      streak: { current: 2, record: 6 },
      swimmingEfficiencyIndex: 55,
      technicalConsistencyIndex: null,
      strokeEfficiencyRating: 47,
      aerobicCapacityScore: null,
      progressiveOverloadIndex: null,
      insights: ["Il passo è migliorato del **4%**", "Aggiungi una nuotata"],
    };
    state.workouts = { pool: workout("Aerobico in vasca"), dryland: undefined, canGenerate: true };
    state.insights = [
      {
        id: 1,
        title: "Buona costanza",
        summary: "Passo regolare",
        bullets: JSON.stringify(["Vasche regolari"]),
        activity_date: "2026-10-20T08:00:00Z",
        activity_distance_meters: 1500,
        activity_duration_seconds: 3000,
      },
    ];
  });

  it("non ripete il titolo e mostra riepilogo, punteggi e consigli", async () => {
    render(<Coach />);
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByText("Focus di oggi")).toBeTruthy();
    // Recovery has no data: neither the condition nor the score is shown.
    expect(screen.queryByText("Condizione")).toBeNull();
    expect(screen.getByText("Ultima analisi")).toBeTruthy();

    const scores = screen.getByRole("region", { name: "Punteggi" });
    expect(within(scores).getByText("Prestazione")).toBeTruthy();
    expect(within(scores).queryByText("Recupero")).toBeNull();
    expect(within(scores).getByText("SEI")).toBeTruthy();
    expect(within(scores).queryByText("TCI")).toBeNull();

    expect(screen.getByRole("heading", { level: 2, name: "Consiglio 1" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Consiglio 2" }));
    expect(screen.getByText("Aggiungi una nuotata")).toBeTruthy();
  });

  it("apre la scheda dal parametro tab e genera gli allenamenti", async () => {
    window.history.replaceState(null, "", "/coach?tab=workouts");
    render(<Coach />);
    expect(screen.getByRole("tab", { name: "Piano" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("heading", { level: 3, name: "Aerobico in vasca" })).toBeTruthy();
    expect(screen.getByText("400 m sciolti")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Centrale" }));
    expect(screen.getByText("8x100 m")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "A secco" }));
    expect(screen.getByText(/Allenamento a secco non disponibile/)).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Genera allenamenti" }));
    expect(state.generateCalls).toBe(1);
  });

  it("mostra l'ultima analisi e la chat in italiano", async () => {
    window.history.replaceState(null, "", "/coach?tab=session-iq");
    render(<Coach />);
    expect(screen.getByRole("heading", { level: 3, name: "Buona costanza" })).toBeTruthy();
    expect(screen.getByText(/1,5 km · 50 min/)).toBeTruthy();

    await userEvent.click(screen.getByRole("tab", { name: "Chat" }));
    expect(screen.getByRole("heading", { level: 2, name: "Chat con il coach" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Messaggio" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Invia" })).toBeTruthy();
  });
});
