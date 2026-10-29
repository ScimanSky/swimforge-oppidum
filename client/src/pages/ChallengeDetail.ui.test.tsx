import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import ChallengeDetail from "./ChallengeDetail";

const state = vi.hoisted(() => ({
  challenge: undefined as any,
  isLoading: false,
  ids: [] as number[],
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    challenges: {
      getById: {
        useQuery: ({ id }: { id: number }) => {
          state.ids.push(id);
          return { data: state.challenge, isLoading: state.isLoading };
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
    expect(screen.getByRole("status").textContent).toBe("Caricamento...");
    cleanup();
    state.isLoading = false;
    state.challenge = null;
    renderDetail();
    expect(screen.getByText("Sfida non trovata")).toBeTruthy();
  });
});
