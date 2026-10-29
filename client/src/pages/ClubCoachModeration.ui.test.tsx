import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import ClubCoachModeration from "./ClubCoachModeration";

const state = vi.hoisted(() => ({
  club: null as any,
  clubError: null as any,
  clubLoading: false,
  invites: [] as any[] | undefined,
  invitesError: null as any,
  status: { canGenerate: true, nextAvailableAt: null } as any,
  workout: null as any,
  calls: {} as Record<string, any[]>,
  refetch: {} as Record<string, ReturnType<typeof vi.fn>>,
}));

const helpers = vi.hoisted(() => {
  // Like TanStack Query: a disabled query has no data and stays pending.
  const query = (
    name: string,
    data: () => unknown,
    error: () => unknown = () => null,
    loading: () => boolean = () => false
  ) => ({
    useQuery: (_input?: unknown, options?: { enabled?: boolean }) => {
      state.refetch[name] ??= vi.fn(async () => ({}));
      const base = { refetch: state.refetch[name], isFetching: false };
      if (options?.enabled === false) {
        return { ...base, data: undefined, isPending: true, isLoading: false, isSuccess: false, isError: false, error: null };
      }
      if (loading()) {
        return { ...base, data: undefined, isPending: true, isLoading: true, isSuccess: false, isError: false, error: null };
      }
      const failure = error();
      if (failure) {
        return { ...base, data: undefined, isPending: false, isLoading: false, isSuccess: false, isError: true, error: failure };
      }
      return { ...base, data: data(), isPending: false, isLoading: false, isSuccess: true, isError: false, error: null };
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
  const invalidate = { invalidate: () => Promise.resolve() };
  return {
    trpc: {
      community: {
        clubs: {
          get: query("club", () => state.club, () => state.clubError, () => state.clubLoading),
          invites: query("invites", () => state.invites, () => state.invitesError),
          createInvite: mutation("createInvite"),
          meets: {
            list: query("meets", () => ({ meets: [] })),
            entries: { list: query("entries", () => undefined) },
            create: mutation("createMeet"),
            publish: mutation("publishMeet"),
          },
          history: {
            config: { get: query("historyConfig", () => ({ enabled: false })) },
            import: { lastRun: query("historyLastRun", () => null), start: mutation("historyImport") },
          },
          workouts: {
            coach: {
              generationStatus: query("generationStatus", () => state.status),
              getByDate: query("workoutByDate", () => ({ workout: state.workout })),
              generateDraft: mutation("generateDraft"),
              publish: mutation("publishWorkout"),
            },
          },
          aiCoach: {
            getConfig: query("aiConfig", () => undefined),
            lastRuns: query("aiRuns", () => ({ runs: [] })),
            upsertConfig: mutation("aiUpsert"),
            manualRun: mutation("aiRun"),
          },
        },
      },
      useUtils: () => ({
        community: {
          clubs: {
            meets: { list: invalidate },
            history: { athletes: { list: invalidate }, meets: { list: invalidate } },
          },
        },
      }),
    },
  };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock("@/components/AppLayout", () => ({
  AppLayout: ({ children }: any) => <div>{children}</div>,
}));

const printing = vi.hoisted(() => ({ frames: [] as string[] }));
vi.mock("@/lib/club-print", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/club-print")>()),
  printInHiddenFrame: (html: string) => printing.frames.push(html),
}));

function renderCoach() {
  const location = memoryLocation({ path: "/community/club/7/coach", record: true });
  render(
    <Router hook={location.hook}>
      <ClubCoachModeration />
    </Router>
  );
  return location;
}

const section = (name: string) => screen.getByRole("heading", { level: 3, name }).closest("section")!;

describe("Area coach del club (Corsia)", () => {
  afterEach(cleanup);
  beforeEach(() => {
    state.club = { id: 7, name: "Rari Nantes", is_member: true, member_role: "coach" };
    state.clubError = null;
    state.clubLoading = false;
    state.invites = [{ id: 1, code: "abc123", usedCount: 2, maxUses: 10 }];
    state.invitesError = null;
    state.status = { canGenerate: true, nextAvailableAt: null };
    state.workout = null;
    state.calls = {};
    printing.frames.length = 0;
    for (const refetch of Object.values(state.refetch)) refetch.mockClear();
  });

  it("senza h1: «Area coach» h2, ruolo in italiano, sezioni h3 (gare, AI e storico spenti)", () => {
    renderCoach();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Area coach" })).toBeTruthy();
    expect(screen.getByText("Rari Nantes · solo coach e staff")).toBeTruthy();
    expect(screen.getByText("Coach")).toBeTruthy();
    expect(section("Allenamenti in vasca (AI)")).toBeTruthy();
    expect(section("Inviti al club")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Convocazioni gare" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Coach AI autonomo" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Storico Oppidum" })).toBeNull();
  });

  it("genera l'allenamento con le scelte del modulo, campi con etichetta", async () => {
    renderCoach();
    const workouts = section("Allenamenti in vasca (AI)");
    expect(within(workouts).getByLabelText("Data allenamento *")).toBeTruthy();
    expect(within(workouts).getByRole("combobox", { name: "Volume" }).textContent).toBe("Medio");
    const focus = within(workouts).getByRole("group", { name: "Focus" });
    expect(within(focus).getByRole("checkbox", { name: "Tecnica" })).toBeChecked();

    const user = userEvent.setup({ delay: null });
    await user.click(within(focus).getByRole("checkbox", { name: "Soglia" }));
    await user.click(within(workouts).getByRole("button", { name: "Genera allenamento" }));
    expect(state.calls.generateDraft).toHaveLength(1);
    expect(state.calls.generateDraft[0]).toMatchObject({
      clubId: 7,
      directives: { focus: ["tecnica", "soglia"], volume: "medium", strokeMix: ["sl"], sessionMinutes: 60 },
    });
  });

  it("in attesa della prossima generazione il pulsante è spento e dice quando", () => {
    state.status = { canGenerate: false, nextAvailableAt: "2026-10-30T09:47:00.000Z" };
    renderCoach();
    const workouts = section("Allenamenti in vasca (AI)");
    expect(within(workouts).getByRole("button", { name: "Genera allenamento" })).toBeDisabled();
    expect(within(workouts).getByText(/^Generazione disponibile da ven 30 ott · \d\d:47$/)).toBeTruthy();
  });

  it("bozza: pubblica e avvisa, stampa, WhatsApp come link", async () => {
    state.workout = {
      id: 42,
      status: "draft",
      sessionDate: "2026-10-29",
      title: "Soglia",
      workoutJson: {
        title: "Soglia lunga",
        blocks: [{ phase: "main", label: "Centrale", items: [{ label: "Serie", reps: "4x100", sendoff: "1:50" }] }],
      },
    };
    renderCoach();
    const workouts = section("Allenamenti in vasca (AI)");
    expect(within(workouts).getByText("Soglia lunga")).toBeTruthy();
    expect(within(workouts).getByText(/Stato: Bozza/)).toBeTruthy();
    expect(within(workouts).getByRole("link", { name: "Condividi su WhatsApp" }).getAttribute("href")).toMatch(
      /^https:\/\/wa\.me\/\?text=/
    );

    const user = userEvent.setup({ delay: null });
    await user.click(within(workouts).getByRole("button", { name: "Pubblica e avvisa i membri" }));
    expect(state.calls.publishWorkout).toEqual([{ workoutId: 42 }]);
    await user.click(within(workouts).getByRole("button", { name: "Stampa" }));
    expect(printing.frames).toHaveLength(1);
    expect(printing.frames[0]).toContain("<h1>Soglia lunga</h1>");
  });

  it("inviti: genera, copia con un nome, errore con Riprova", async () => {
    renderCoach();
    const invites = section("Inviti al club");
    expect(within(invites).getByText(/\/community\/invite\/abc123$/)).toBeTruthy();
    expect(within(invites).getByRole("button", { name: "Copia link" })).toBeTruthy();
    await userEvent.setup({ delay: null }).click(within(invites).getByRole("button", { name: "Genera nuovo invito" }));
    expect(state.calls.createInvite).toEqual([{ clubId: 7, maxUses: 10 }]);

    cleanup();
    state.invites = undefined;
    state.invitesError = { data: { code: "INTERNAL_SERVER_ERROR" } };
    renderCoach();
    expect(screen.queryByText("Nessun invito attivo.")).toBeNull();
    await userEvent.setup({ delay: null }).click(within(section("Inviti al club")).getByRole("button", { name: "Riprova" }));
    expect(state.refetch.invites).toHaveBeenCalled();
  });

  it("un membro senza ruolo di staff torna alla pagina del club", () => {
    state.club = { ...state.club, member_role: "member" };
    const location = renderCoach();
    expect(location.history.at(-1)).toBe("/community/club/7");
    expect(screen.queryByRole("heading", { name: "Area coach" })).toBeNull();
  });

  it("caricamento, errore del club e non iscritti", async () => {
    state.clubLoading = true;
    renderCoach();
    expect(screen.getByRole("status").textContent).toContain("Caricamento dell'area coach");

    cleanup();
    state.clubLoading = false;
    state.club = undefined;
    state.clubError = { data: { code: "INTERNAL_SERVER_ERROR" } };
    renderCoach();
    expect(screen.queryByText(/Devi essere iscritto/)).toBeNull();
    await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: "Riprova" }));
    expect(state.refetch.club).toHaveBeenCalled();

    cleanup();
    state.clubError = null;
    state.club = { id: 7, name: "Rari Nantes", is_member: false, member_role: null };
    renderCoach();
    expect(screen.getByText("Devi essere iscritto al club per accedere a quest'area.")).toBeTruthy();
  });
});
