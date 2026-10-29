import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import ChallengeDetail from "./ChallengeDetail";

const state = vi.hoisted(() => ({
  challenge: undefined as any,
  isLoading: false,
  error: null as any,
  refetch: vi.fn(),
  ids: [] as number[],
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    challenges: {
      getById: {
        useQuery: ({ id }: { id: number }) => {
          state.ids.push(id);
          if (state.isLoading) return { data: undefined, isLoading: true, isPending: true, refetch: state.refetch };
          if (state.error) return { data: undefined, isError: true, error: state.error, refetch: state.refetch };
          return { data: state.challenge, isLoading: false, refetch: state.refetch };
        },
      },
    },
  },
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 4 }, isAuthenticated: true, loading: false }),
}));

vi.mock("@/components/AppLayout", () => ({
  AppLayout: ({ children }: any) => <div>{children}</div>,
}));

function renderDetail() {
  render(
    <Router hook={memoryLocation({ path: "/challenges/12" }).hook}>
      <Route path="/challenges/:id">
        <ChallengeDetail />
      </Route>
    </Router>
  );
}

describe("Sfida (Corsia)", () => {
  afterEach(cleanup);
  beforeEach(() => {
    state.isLoading = false;
    state.error = null;
    state.refetch.mockClear();
    state.ids.length = 0;
    state.challenge = {
      id: 12,
      name: "Ottobre in vasca",
      description: "Chi nuota di più",
      status: "pending",
      type: "pool",
      objective: "total_distance",
      duration: "1_month",
      start_date: "2026-10-01",
      end_date: "2026-10-31",
      participants: [
        { userId: 1, username: "anna", progress: 12500 },
        { userId: 4, username: "marta", progress: 3200, profileBadgeUrl: "/badges/b.png", profileBadgeName: "Delfino", profileBadgeLevel: 3 },
        { userId: 5, username: "luca", progress: 0 },
      ],
    };
  });

  it("senza h1 né pulsante indietro: nome come h2, chip e metriche", () => {
    renderDetail();
    expect(state.ids.at(-1)).toBe(12);
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    const info = screen.getByRole("region", { name: "Ottobre in vasca" });
    for (const text of ["In arrivo", "Vasca", "1 mese", "Distanza totale", "Partecipanti", "Miglior risultato"]) {
      expect(within(info).getByText(text)).toBeTruthy();
    }
    expect(within(info).getByText("12,5")).toBeTruthy();
    // Average of 12,5 + 3,2 + 0 km.
    expect(within(info).getByText("5,2")).toBeTruthy();
  });

  it("classifica con podio, link ai profili e la propria riga evidenziata", () => {
    renderDetail();
    const ranking = screen.getByRole("list", { name: "Classifica" });
    const rows = within(ranking).getAllByRole("link");
    expect(rows.map(row => row.getAttribute("href"))).toEqual(["/u/1", "/u/4", "/u/5"]);
    expect(within(rows[0]).getByText("1").className).toContain("var(--gold)");
    expect(within(rows[2]).getByText("3").className).toContain("bg-xp/15");
    expect(rows[1].className).toContain("border-action-text");
    expect(within(rows[1]).getByText("Tu")).toBeTruthy();
    expect(within(rows[1]).getByAltText("Delfino")).toBeTruthy();
    expect(within(rows[2]).getByText("0")).toBeTruthy();
  });

  it("stati di caricamento e sfida assente", () => {
    state.isLoading = true;
    renderDetail();
    expect(screen.getByRole("status").textContent).toContain("Caricamento");
    expect(screen.queryByText("Sfida non trovata")).toBeNull();
    cleanup();
    state.isLoading = false;
    state.challenge = null;
    renderDetail();
    expect(screen.getByText("Sfida non trovata")).toBeTruthy();
    cleanup();
    state.error = { message: "Challenge not found", data: { code: "NOT_FOUND" } };
    renderDetail();
    expect(screen.getByText("Sfida non trovata")).toBeTruthy();
  });

  it("errore di rete: messaggio breve e Riprova", async () => {
    state.error = { message: "Failed to fetch", data: undefined };
    renderDetail();
    expect(screen.getByText("Non riesco a caricare i dati")).toBeTruthy();
    expect(screen.queryByText("Sfida non trovata")).toBeNull();
    await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: "Riprova" }));
    expect(state.refetch).toHaveBeenCalled();
  });

  it("badge del profilo senza nome o livello: mai «undefined»", () => {
    state.challenge.participants = [
      { userId: 1, username: "anna", progress: 10, profileBadgeUrl: "/b.png" },
    ];
    renderDetail();
    const img = screen.getByAltText("Badge");
    expect(img.getAttribute("title")).toBe("Badge");
    expect(img.getAttribute("title")).not.toContain("undefined");
  });

  it("pari merito: stessa posizione", () => {
    state.challenge.participants = [
      { userId: 1, username: "anna", progress: 5000 },
      { userId: 2, username: "bea", progress: 5000 },
      { userId: 3, username: "cleo", progress: 100 },
    ];
    renderDetail();
    const rows = within(screen.getByRole("list", { name: "Classifica" })).getAllByRole("link");
    expect(rows.map((row) => row.querySelector('[data-slot="badge"], span')?.textContent)).toEqual(["1", "1", "3"]);
  });

  it("sfida sul passo: vince il più basso, chi non ha nuotato in fondo", () => {
    state.challenge.objective = "avg_pace";
    state.challenge.participants = [
      { userId: 5, username: "luca", progress: 0 },
      { userId: 1, username: "anna", progress: 120 },
      { userId: 4, username: "marta", progress: 98 },
    ];
    renderDetail();
    const info = screen.getByRole("region", { name: "Ottobre in vasca" });
    const best = within(info).getByText("Miglior risultato").parentElement!;
    expect(best.textContent).toContain("1:38");
    const average = within(info).getByText("Media del gruppo").parentElement!;
    expect(average.textContent).toContain("1:49");
    const rows = within(screen.getByRole("list", { name: "Classifica" })).getAllByRole("link");
    expect(rows.map((row) => row.getAttribute("href"))).toEqual(["/u/4", "/u/1", "/u/5"]);
  });
});
