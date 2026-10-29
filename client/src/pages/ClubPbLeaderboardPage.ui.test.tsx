import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import ClubPbLeaderboardPage from "./ClubPbLeaderboardPage";

const state = vi.hoisted(() => ({
  club: null as any,
  clubError: null as any,
  rows: [] as any[] | undefined,
  rowsError: null as any,
  pending: false,
  inputs: [] as any[],
  refetch: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    community: {
      clubs: {
        get: {
          useQuery: () => {
            if (state.clubError) return { data: undefined, isPending: false, isError: true, error: state.clubError, refetch: state.refetch };
            return { data: state.club, isPending: false, isError: false, error: null, refetch: state.refetch };
          },
        },
      },
    },
    records: {
      clubLeaderboard: {
        useQuery: (input: any) => {
          state.inputs.push(input);
          const base = { refetch: state.refetch };
          if (state.pending) return { ...base, data: undefined, isPending: true, isError: false, error: null };
          if (state.rowsError) return { ...base, data: undefined, isPending: false, isError: true, error: state.rowsError };
          return { ...base, data: { leaderboard: state.rows }, isPending: false, isError: false, error: null };
        },
      },
    },
  },
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 5 }, isAuthenticated: true, loading: false }),
}));
vi.mock("@/components/AppLayout", () => ({
  AppLayout: ({ children }: any) => <div>{children}</div>,
}));

// The server sends the fastest first, with its own rank = index + 1 even on equal times.
const row = (userId: number, timeCs: number, extra: Record<string, unknown> = {}) => ({
  rank: userId,
  userId,
  displayName: `Nuotatore ${userId}`,
  avatarUrl: null,
  masterCategory: null,
  timeCs,
  achievedAt: "2026-03-14T10:00:00.000Z",
  ...extra,
});

function renderPage() {
  render(
    <Router hook={memoryLocation({ path: "/community/club/7/pb" }).hook}>
      <ClubPbLeaderboardPage />
    </Router>
  );
}

const ranking = () =>
  screen.getByRole("list", { name: "Stile libero 100 m · vasca 25 m" });

describe("Record del club (Corsia)", () => {
  afterEach(cleanup);
  beforeEach(() => {
    state.club = { id: 7, name: "Rari Nantes", is_member: true };
    state.clubError = null;
    state.rows = [];
    state.rowsError = null;
    state.pending = false;
    state.inputs.length = 0;
    state.refetch.mockClear();
  });

  it("senza h1: filtri con etichetta e classifica dell'evento scelto", () => {
    state.rows = [row(1, 6532)];
    renderPage();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Record del club" })).toBeTruthy();
    expect(screen.getByText("Rari Nantes")).toBeTruthy();
    for (const [name, value] of [
      ["Stile", "Stile libero"],
      ["Distanza", "100 m"],
      ["Vasca", "25 m"],
      ["Fonte", "Allenamento"],
    ]) {
      expect(screen.getByRole("combobox", { name }).textContent).toBe(value);
    }
    expect(screen.getByText("Tempi di allenamento")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Allenamenti del club" }).getAttribute("href")).toBe(
      "/community/club/7/workouts"
    );
  });

  it("tempi uguali condividono la posizione, chi non ha un tempo non ne ha una", () => {
    state.rows = [
      row(1, 6532, { masterCategory: "M35" }),
      row(5, 6532),
      row(3, 7010),
      row(4, 0),
    ];
    renderPage();
    const items = within(ranking()).getAllByRole("listitem");
    expect(items.map((item) => item.getAttribute("value"))).toEqual(["1", "1", "3", null]);
    expect(within(items[0]).getByText("1:05.32")).toBeTruthy();
    expect(within(items[0]).getByText("M35 · 14 mar 2026")).toBeTruthy();
    expect(within(items[1]).getByText("1")).toBeTruthy();
    expect(within(items[1]).getByText("Tu")).toBeTruthy();
    expect(within(items[2]).getByText("3")).toBeTruthy();
    expect(within(items[3]).getByText("Senza posizione")).toBeTruthy();
    expect(within(items[0]).getByRole("link").getAttribute("href")).toBe(
      `/u/1?from=${encodeURIComponent("/community/club/7/pb")}`
    );
  });

  it("molti record: venti per pagina", async () => {
    state.rows = Array.from({ length: 25 }, (_, index) => row(index + 10, 6000 + index * 10));
    renderPage();
    expect(within(ranking()).getAllByRole("listitem")).toHaveLength(20);
    await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: "Avanti" }));
    expect(within(ranking()).getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText("Pagina 2 di 2")).toBeTruthy();
  });

  it("la categoria master filtra la richiesta, entro i 32 caratteri del server", async () => {
    renderPage();
    const input = screen.getByRole("textbox", { name: "Categoria master" });
    expect(input.getAttribute("maxlength")).toBe("32");
    await userEvent.setup({ delay: null }).type(input, "M35");
    expect(state.inputs.at(-1)).toMatchObject({ clubId: 7, masterCategory: "M35", source: "training" });
    expect(screen.getByText("Tempi di allenamento · categoria M35")).toBeTruthy();
  });

  it("in caricamento: scheletri, non «Nessun record»", () => {
    state.pending = true;
    renderPage();
    expect(screen.getByRole("status").textContent).toContain("Caricamento della classifica");
    expect(screen.queryByText("Nessun record per questi filtri.")).toBeNull();
  });

  it("vuota: lo dice; un errore si riprova e non diventa «Nessun record»", async () => {
    renderPage();
    expect(screen.getByText("Nessun record per questi filtri.")).toBeTruthy();

    cleanup();
    state.rows = undefined;
    state.rowsError = { data: { code: "INTERNAL_SERVER_ERROR" } };
    renderPage();
    expect(screen.queryByText("Nessun record per questi filtri.")).toBeNull();
    await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: "Riprova" }));
    expect(state.refetch).toHaveBeenCalled();
  });

  it("solo per i membri del club", () => {
    state.club = { id: 7, name: "Rari Nantes", is_member: false };
    renderPage();
    expect(screen.getByText("Iscriviti al club per vedere i suoi record.")).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
