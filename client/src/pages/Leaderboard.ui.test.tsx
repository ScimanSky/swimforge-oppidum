import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import Leaderboard from "./Leaderboard";

const state = vi.hoisted(() => ({
  rows: [] as any[],
  queries: [] as any[],
  user: { id: 4 } as any,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    leaderboard: {
      get: {
        useQuery: (input: any) => {
          state.queries.push(input);
          return { data: state.rows, isLoading: false };
        },
      },
    },
  },
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: state.user, isAuthenticated: true, loading: false }),
}));

vi.mock("@/components/AppLayout", () => ({
  AppLayout: ({ children }: any) => <div>{children}</div>,
  default: ({ children }: any) => <div>{children}</div>,
}));

// «all» + XP shape: { profile, userName }.
const row = (userId: number, totalXp: number, level = 3) => ({
  profile: { id: userId, userId, level, totalXp, avatarUrl: null },
  userName: `Nuotatore ${userId}`,
});

function renderLeaderboard() {
  render(
    <Router hook={memoryLocation({ path: "/leaderboard" }).hook}>
      <Leaderboard />
    </Router>
  );
}

describe("Classifiche (Corsia)", () => {
  afterEach(cleanup);
  beforeEach(() => {
    state.rows = [];
    state.queries.length = 0;
    state.user = { id: 4 };
  });

  it("senza h1 né pulsante indietro; stato vuoto", () => {
    renderLeaderboard();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Nessun nuotatore in classifica")).toBeTruthy();
  });

  it("podio con oro, argento e bronzo, righe con la propria evidenziata", () => {
    state.rows = [row(1, 9000), row(2, 8000), row(3, 7000), row(4, 6500, 7), row(5, 1200)];
    renderLeaderboard();

    const podium = screen.getByRole("list", { name: "Podio" });
    const places = within(podium).getAllByRole("listitem");
    expect(places).toHaveLength(3);
    expect(within(places[0]).getByText("Nuotatore 1")).toBeTruthy();
    expect(within(places[0]).getByText("9.000")).toBeTruthy();
    expect(within(places[0]).getByText("1").className).toContain("var(--gold)");

    const list = screen.getByRole("list", { name: "Classifica" });
    const mine = within(list).getByRole("link", { name: /Nuotatore 4/ });
    expect(mine.getAttribute("href")).toBe("/u/4");
    expect(mine.className).toContain("border-action-text");
    expect(mine.className).toContain("bg-raised");
    expect(within(mine).getByText("Tu")).toBeTruthy();
    expect(within(mine).getByText("Livello 7")).toBeTruthy();
    expect(within(mine).getByText("6.500")).toBeTruthy();
    const other = within(list).getByRole("link", { name: /Nuotatore 5/ });
    expect(other.className).not.toContain("border-action-text");

    const summary = screen.getByRole("region", { name: "La tua posizione" });
    expect(within(summary).getByText("4°")).toBeTruthy();
    expect(within(summary).getByText("I tuoi XP")).toBeTruthy();
  });

  it("cambia periodo e criterio con le schede", async () => {
    renderLeaderboard();
    expect(state.queries.at(-1)).toMatchObject({ orderBy: "totalXp", period: "all" });
    await userEvent.click(screen.getByRole("tab", { name: "Settimana" }));
    expect(state.queries.at(-1)).toMatchObject({ period: "week" });
    await userEvent.click(screen.getByRole("tab", { name: "Badge" }));
    expect(state.queries.at(-1)).toMatchObject({ orderBy: "badges", period: "week" });
  });

  it("periodi e badge: numeri dal database come stringhe (bigint)", async () => {
    // Flat shape of the week / month query: SUM and COUNT come back as strings.
    state.rows = [
      { id: 1, userId: 1, name: "Anna", level: "4", totalXp: "9000", periodXp: "1234", badgeCount: "3" },
      { id: 2, userId: 2, name: "Bea", level: "3", totalXp: "8000", periodXp: "800", badgeCount: "2" },
      { id: 3, userId: 3, name: "Cleo", level: "2", totalXp: "7000", periodXp: "500", badgeCount: "1" },
    ];
    renderLeaderboard();
    await userEvent.click(screen.getByRole("tab", { name: "Settimana" }));
    const podium = screen.getByRole("list", { name: "Podio" });
    const first = within(podium).getByRole("link", { name: /Anna/ });
    expect(within(first).getByText("1.234")).toBeTruthy();
    expect(within(podium).queryByText("—")).toBeNull();

    await userEvent.click(screen.getByRole("tab", { name: "Badge" }));
    const podiumBadges = screen.getByRole("list", { name: "Podio" });
    expect(within(within(podiumBadges).getByRole("link", { name: /Anna/ })).getByText("3")).toBeTruthy();
    expect(within(podiumBadges).queryByText("—")).toBeNull();
  });

  it("pagina le posizioni dopo il podio, quattro per volta", async () => {
    state.rows = Array.from({ length: 9 }, (_, i) => row(i + 10, 1000 - i * 10));
    state.user = { id: 99 };
    renderLeaderboard();
    const summary = screen.getByRole("region", { name: "La tua posizione" });
    expect(within(summary).getByText("Non sei ancora in classifica.")).toBeTruthy();
    const pages = screen.getByRole("navigation", { name: "Pagine della classifica" });
    expect(within(pages).getByText("Pagina 1 di 2")).toBeTruthy();
    await userEvent.click(within(pages).getByRole("button", { name: "Avanti" }));
    const list = screen.getByRole("list", { name: "Classifica" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByText("8")).toBeTruthy();
  });
});
