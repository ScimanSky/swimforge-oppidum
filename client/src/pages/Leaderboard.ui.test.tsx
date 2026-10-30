import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import Leaderboard from "./Leaderboard";

const state = vi.hoisted(() => ({
  rows: [] as any[],
  queries: [] as any[],
  options: [] as any[],
  user: { id: 4 } as any,
  pending: false,
  error: false,
  refetch: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    leaderboard: {
      get: {
        useQuery: (input: any, options?: any) => {
          state.queries.push(input);
          state.options.push(options);
          if (state.pending) return { data: undefined, isPending: true, isLoading: true, refetch: state.refetch };
          if (state.error) return { data: undefined, isPending: false, isError: true, refetch: state.refetch };
          return { data: state.rows, isLoading: false, isPending: false, refetch: state.refetch };
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
    state.options.length = 0;
    state.user = { id: 4 };
    state.pending = false;
    state.error = false;
    state.refetch.mockClear();
  });

  it("is fetched on opening and on returning to the app, never on a timer", () => {
    state.rows = [row(4, 100)];
    renderLeaderboard();
    expect(state.options.length).toBeGreaterThan(0);
    for (const options of state.options) expect(options?.refetchInterval).toBeFalsy();
  });

  it("in caricamento: scheletri, non lo stato vuoto", () => {
    state.pending = true;
    renderLeaderboard();
    expect(screen.getByRole("status").textContent).toContain("Caricamento");
    expect(screen.queryByText("Nessun nuotatore in classifica")).toBeNull();
  });

  it("errore: messaggio breve e Riprova", async () => {
    state.error = true;
    renderLeaderboard();
    expect(screen.getByText("Non riesco a caricare i dati")).toBeTruthy();
    expect(screen.queryByText("Nessun nuotatore in classifica")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(state.refetch).toHaveBeenCalled();
  });

  it("pari merito: stessa posizione (1, 1, 3) su podio e righe", () => {
    state.rows = [row(1, 900), row(2, 900), row(3, 700), row(4, 700), row(5, 100)];
    renderLeaderboard();
    const podium = screen.getByRole("list", { name: "Podio" });
    expect(within(within(podium).getByRole("link", { name: /Nuotatore 1/ })).getByText("1")).toBeTruthy();
    expect(within(within(podium).getByRole("link", { name: /Nuotatore 2/ })).getByText("1")).toBeTruthy();
    expect(within(within(podium).getByRole("link", { name: /Nuotatore 3/ })).getByText("3")).toBeTruthy();
    expect(within(podium).getAllByRole("listitem").map((place) => place.getAttribute("value"))).toEqual(["1", "1", "3"]);
    const list = screen.getByRole("list", { name: "Classifica" });
    const mine = within(list).getByRole("link", { name: /Nuotatore 4/ });
    expect(within(mine).getByText("3")).toBeTruthy();
    expect(mine.closest("li")!.getAttribute("value")).toBe("3");
    const summary = screen.getByRole("region", { name: "La tua posizione" });
    expect(within(summary).getByText("3°")).toBeTruthy();
  });

  it("lunedì, tutti a zero: nessun podio, nessuna posizione né medaglia", async () => {
    state.rows = Array.from({ length: 50 }, (_, i) => ({ ...row(i + 1, 9000 - i), periodXp: 0 }));
    renderLeaderboard();
    await userEvent.click(screen.getByRole("tab", { name: "Settimana" }));
    expect(screen.queryByRole("list", { name: "Podio" })).toBeNull();
    const list = screen.getByRole("list", { name: "Classifica" });
    for (const item of within(list).getAllByRole("listitem")) {
      expect(within(item).getByText("Senza posizione")).toBeTruthy();
      // No position number (the value column says «0»).
      expect(within(item).queryAllByText(/^[1-9]\d*$/)).toEqual([]);
      expect(item.hasAttribute("value")).toBe(false);
    }
    const summary = screen.getByRole("region", { name: "La tua posizione" });
    expect(within(summary).getByText("—")).toBeTruthy();
    expect(within(summary).queryByText(/°$/)).toBeNull();
  });

  it("chi è a zero non sale sul podio e resta senza posizione, dopo i classificati", async () => {
    state.rows = [
      { ...row(1, 9000), periodXp: 500 },
      { ...row(2, 8000), periodXp: 300 },
      ...Array.from({ length: 48 }, (_, i) => ({ ...row(i + 3, 7000 - i), periodXp: 0 })),
    ];
    renderLeaderboard();
    await userEvent.click(screen.getByRole("tab", { name: "Settimana" }));
    const podium = screen.getByRole("list", { name: "Podio" });
    const places = within(podium).getAllByRole("listitem");
    expect(places.map((place) => place.getAttribute("value"))).toEqual(["1", "2"]);
    expect(within(podium).queryByRole("link", { name: /Nuotatore 3/ })).toBeNull();
    const list = screen.getByRole("list", { name: "Classifica" });
    expect(within(list).getAllByRole("listitem")[0].textContent).toContain("Nuotatore 3");
    const third = within(list).getByRole("link", { name: /Nuotatore 3/ });
    expect(within(third).getByText("Senza posizione")).toBeTruthy();
    expect(within(third).queryAllByText(/^[1-9]\d*$/)).toEqual([]);
    // I am user 4, at 0 XP this week: no position for me either.
    const summary = screen.getByRole("region", { name: "La tua posizione" });
    expect(within(summary).getByText("—")).toBeTruthy();
    expect(within(summary).queryByText(/°$/)).toBeNull();
  });

  it("con 50 nuotatori dice onestamente «tra i primi 50»", () => {
    state.rows = Array.from({ length: 50 }, (_, i) => row(i + 10, 5000 - i));
    state.user = { id: 999 };
    renderLeaderboard();
    const summary = screen.getByRole("region", { name: "La tua posizione" });
    expect(within(summary).getByText("Primi in classifica")).toBeTruthy();
    expect(within(summary).getByText("Non sei ancora tra i primi 50.")).toBeTruthy();
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
    const positions = () =>
      within(screen.getByRole("list", { name: "Classifica" }))
        .getAllByRole("listitem")
        .map((item) => item.getAttribute("value"));
    expect(positions()).toEqual(["4", "5", "6", "7"]);
    await userEvent.click(within(pages).getByRole("button", { name: "Avanti" }));
    // Every item carries the visible rank as its list position.
    expect(positions()).toEqual(["8", "9"]);
    expect(within(screen.getByRole("list", { name: "Classifica" })).getByText("8")).toBeTruthy();
  });

  it("torna alla prima pagina cambiando periodo", async () => {
    state.rows = Array.from({ length: 9 }, (_, i) => ({ ...row(i + 10, 1000 - i * 10), periodXp: 90 - i }));
    renderLeaderboard();
    const pages = screen.getByRole("navigation", { name: "Pagine della classifica" });
    await userEvent.click(within(pages).getByRole("button", { name: "Avanti" }));
    expect(within(pages).getByText("Pagina 2 di 2")).toBeTruthy();
    await userEvent.click(screen.getByRole("tab", { name: "Mese" }));
    expect(screen.getByText("Pagina 1 di 2")).toBeTruthy();
  });
});
