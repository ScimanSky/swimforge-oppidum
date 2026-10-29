import { createElement, type ComponentType } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import ClubWorkoutsPage from "./ClubWorkoutsPage";
import ClubWorkoutDetailPage from "./ClubWorkoutDetailPage";

const state = vi.hoisted(() => ({
  club: null as any,
  clubError: null as any,
  workouts: undefined as any,
  workoutsError: null as any,
  workout: undefined as any,
  workoutError: null as any,
  loading: new Set<string>(),
  calls: {} as Record<string, any[]>,
  refetch: {} as Record<string, ReturnType<typeof vi.fn>>,
}));

const helpers = vi.hoisted(() => {
  // Like TanStack Query: a disabled query has no data and stays pending.
  const query = (name: string, data: () => unknown, error: () => unknown = () => null) => ({
    useQuery: (_input?: unknown, options?: { enabled?: boolean }) => {
      state.refetch[name] ??= vi.fn();
      const base = { refetch: state.refetch[name] };
      if (options?.enabled === false || state.loading.has(name)) {
        return { ...base, data: undefined, isPending: true, isError: false, error: null };
      }
      const failure = error();
      if (failure) return { ...base, data: undefined, isPending: false, isError: true, error: failure };
      return { ...base, data: data(), isPending: false, isError: false, error: null };
    },
  });
  const mutation = (name: string) => ({
    useMutation: () => ({
      mutate: (vars: any) => (state.calls[name] ??= []).push(vars),
      isPending: false,
    }),
  });
  return { query, mutation };
});

vi.mock("@/lib/trpc", () => {
  const { query, mutation } = helpers;
  return {
    trpc: {
      community: {
        analytics: { track: mutation("track") },
        clubs: {
          get: query("club", () => state.club, () => state.clubError),
          workouts: {
            listPublished: query("workouts", () => state.workouts, () => state.workoutsError),
            getPublished: query("workout", () => state.workout, () => state.workoutError),
            markCompleted: mutation("markCompleted"),
          },
        },
      },
    },
  };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/AppLayout", () => ({
  AppLayout: ({ children }: any) => <div>{children}</div>,
}));

const pad2 = (value: number) => String(value).padStart(2, "0");
const dayKey = (date: Date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
// The plan normalizer drops a plan without a valid block: every plan has one.
const plan = (title: string, extra: Record<string, unknown> = {}) => ({
  title,
  description: "",
  totalDistance: "2500m",
  estimatedDuration: "60 min",
  blocks: [{ phase: "main", label: "Centrale", items: [{ label: "Serie", reps: "4x100", sendoff: "1:50" }] }],
  coachNotes: [],
  ...extra,
});

function renderAt(path: string, page: ComponentType) {
  const location = memoryLocation({ path, record: true });
  render(<Router hook={location.hook}>{createElement(page)}</Router>);
  return location;
}

describe("Allenamenti del club (Corsia)", () => {
  afterEach(cleanup);
  beforeEach(() => {
    state.club = { id: 7, name: "Rari Nantes", is_member: true, member_role: "member" };
    state.clubError = null;
    state.workouts = {
      workouts: [
        { id: 11, sessionDate: dayKey(new Date()), workoutJson: plan("Soglia lunga") },
        { id: 12, sessionDate: "2020-03-02", workoutJson: plan("Tecnica di virata", { totalDistance: "" }) },
      ],
    };
    state.workoutsError = null;
    state.workout = undefined;
    state.workoutError = null;
    state.loading = new Set();
    state.calls = {};
    for (const refetch of Object.values(state.refetch)) refetch.mockClear();
  });

  it("senza h1: allenamento di oggi in testa, archivio per giorno a link", async () => {
    const location = renderAt("/community/club/7/workouts", ClubWorkoutsPage);
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Allenamenti" })).toBeTruthy();
    expect(screen.getByText("Rari Nantes · pubblicati dal coach")).toBeTruthy();

    const today = screen.getByRole("heading", { level: 3, name: "Allenamento di oggi" }).closest("section")!;
    expect(within(today).getByText("Distanza 2500m · Durata 60 min")).toBeTruthy();
    const open = within(today).getByRole("link", { name: "Apri l'allenamento di oggi" });
    expect(open.getAttribute("href")).toBe("/community/club/7/workouts/11");

    const archive = screen.getByRole("heading", { level: 3, name: "Archivio" }).closest("section")!;
    expect(within(archive).getByRole("heading", { level: 4, name: "2 mar 2020" })).toBeTruthy();
    const old = within(archive).getByRole("link", { name: /Tecnica di virata/ });
    expect(old.textContent).toContain("Durata 60 min");
    expect(old.textContent).not.toContain("Distanza");

    await userEvent.setup({ delay: null }).click(open);
    expect(location.history.at(-1)).toBe("/community/club/7/workouts/11");
    expect(state.calls.track?.[0]).toMatchObject({ entityId: 11, metadata: { entryPoint: "day_card" } });
  });

  it("in caricamento: scheletri, non il messaggio per i non iscritti", () => {
    state.loading.add("club");
    renderAt("/community/club/7/workouts", ClubWorkoutsPage);
    expect(screen.getByRole("status").textContent).toContain("Caricamento degli allenamenti");
    expect(screen.queryByText(/Iscriviti al club/)).toBeNull();
  });

  it("un errore del club si riprova; NOT_FOUND è «Club non trovato»; chi non è iscritto lo legge", async () => {
    state.club = undefined;
    state.clubError = { data: { code: "INTERNAL_SERVER_ERROR" } };
    renderAt("/community/club/7/workouts", ClubWorkoutsPage);
    expect(screen.queryByText(/Iscriviti al club/)).toBeNull();
    await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: "Riprova" }));
    expect(state.refetch.club).toHaveBeenCalled();

    cleanup();
    state.clubError = { data: { code: "NOT_FOUND" } };
    renderAt("/community/club/7/workouts", ClubWorkoutsPage);
    expect(screen.getByText("Club non trovato.")).toBeTruthy();

    cleanup();
    state.clubError = null;
    state.club = { id: 7, name: "Rari Nantes", is_member: false };
    renderAt("/community/club/7/workouts", ClubWorkoutsPage);
    expect(screen.getByText("Iscriviti al club per vedere gli allenamenti pubblicati.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Torna al club" }).getAttribute("href")).toBe("/community/club/7");
  });

  it("un errore dell'elenco non diventa «Nessun allenamento pubblicato»", async () => {
    state.workouts = undefined;
    state.workoutsError = { data: { code: "BAD_REQUEST" } };
    renderAt("/community/club/7/workouts", ClubWorkoutsPage);
    expect(screen.queryByText("Nessun allenamento pubblicato.")).toBeNull();
    await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: "Riprova" }));
    expect(state.refetch.workouts).toHaveBeenCalled();
  });

  it("dettaglio: titolo h2, blocchi h3, segna completato e stampa", async () => {
    state.workout = {
      workout: {
        id: 11,
        sessionDate: "2020-03-02",
        workoutJson: plan("Soglia lunga", {
          blocks: [{ phase: "warmup", label: "Riscaldamento", items: [{ label: "Sciolto", reps: "4x100", sendoff: "1:50", targetPace: "1:35" }] }],
          coachNotes: ["Virate strette"],
        }),
      },
    };
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    renderAt("/community/club/7/workouts/11", ClubWorkoutDetailPage);
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Soglia lunga" })).toBeTruthy();
    expect(screen.getByText("2 mar 2020")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "Riscaldamento" })).toBeTruthy();
    expect(screen.getByText("Passo obiettivo: 1:35")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "Note del coach" })).toBeTruthy();

    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole("button", { name: "Segna completato" }));
    expect(state.calls.markCompleted).toEqual([{ clubId: 7, workoutId: 11, completionStatus: "completed" }]);
    await user.click(screen.getByRole("button", { name: "Stampa" }));
    expect(print).toHaveBeenCalled();
    print.mockRestore();
  });

  it("dettaglio: NOT_FOUND è «non trovato», un altro errore si riprova", async () => {
    state.workoutError = { data: { code: "NOT_FOUND" } };
    renderAt("/community/club/7/workouts/11", ClubWorkoutDetailPage);
    expect(screen.getByText("Allenamento non trovato o non disponibile.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Torna agli allenamenti" }).getAttribute("href")).toBe(
      "/community/club/7/workouts"
    );

    cleanup();
    state.workoutError = { data: { code: "INTERNAL_SERVER_ERROR" } };
    renderAt("/community/club/7/workouts/11", ClubWorkoutDetailPage);
    expect(screen.queryByText("Allenamento non trovato o non disponibile.")).toBeNull();
    await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: "Riprova" }));
    expect(state.refetch.workout).toHaveBeenCalled();
  });

  it("dettaglio con un id non valido: nessuno scheletro infinito", () => {
    renderAt("/community/club/7/workouts/abc", ClubWorkoutDetailPage);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Allenamento non trovato o non disponibile.")).toBeTruthy();
  });
});
