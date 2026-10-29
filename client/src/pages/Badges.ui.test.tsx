import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import Badges from "./Badges";

const state = vi.hoisted(() => ({
  badges: [] as any[],
  definitions: [] as any[],
  userAchievements: [] as any[],
  pending: false,
  error: false,
  refetch: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    badges: {
      progress: {
        useQuery: () =>
          state.pending
            ? { data: undefined, isPending: true, isLoading: true, refetch: state.refetch }
            : state.error
              ? { data: undefined, isPending: false, isError: true, refetch: state.refetch }
              : { data: state.badges, isLoading: false, refetch: state.refetch },
      },
      getAchievementBadgeDefinitions: {
        useQuery: () => ({ data: state.definitions, isLoading: false }),
      },
      getUserAchievementBadges: { useQuery: () => ({ data: state.userAchievements }) },
    },
  },
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: true, loading: false }),
}));

vi.mock("@/components/AppLayout", () => ({
  AppLayout: ({ children }: any) => <div>{children}</div>,
}));

const badge = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  code: "dist_1km",
  name: `Badge ${id}`,
  description: `Descrizione ${id}`,
  category: "distance",
  rarity: "common",
  earned: false,
  progress: 0,
  ...extra,
});

const play = vi.fn(() => Promise.resolve());
const originalPlay = HTMLMediaElement.prototype.play;

describe("Badge (Corsia)", () => {
  beforeAll(() => {
    HTMLMediaElement.prototype.play = play;
  });
  afterAll(() => {
    HTMLMediaElement.prototype.play = originalPlay;
  });
  afterEach(cleanup);
  beforeEach(() => {
    play.mockClear();
    state.badges = [];
    state.definitions = [];
    state.userAchievements = [];
    state.pending = false;
    state.error = false;
    state.refetch.mockClear();
  });

  it("in caricamento: scheletri, non «0 di 0»", () => {
    state.pending = true;
    render(<Badges />);
    expect(screen.getByRole("status").textContent).toContain("Caricamento");
    expect(screen.queryByText("di 0")).toBeNull();
    expect(screen.queryByText("Nessun badge in questa categoria.")).toBeNull();
  });

  it("errore: messaggio breve e Riprova", async () => {
    state.error = true;
    render(<Badges />);
    expect(screen.getByText("Non riesco a caricare i dati")).toBeTruthy();
    expect(screen.queryByText("di 0")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(state.refetch).toHaveBeenCalled();
  });

  it("chiudendo il dettaglio con Esc il fuoco torna sul badge", async () => {
    const user = userEvent.setup({ delay: null });
    state.badges = [badge(1), badge(2, { progress: 40 })];
    render(<Badges />);
    const tile = screen.getByRole("button", { name: "Badge 2, da sbloccare, 40%" });
    await user.click(tile);
    expect(screen.getByRole("dialog", { name: "Badge 2" })).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(tile);
  });

  it("se il badge sparisce mentre il dettaglio è aperto, il fuoco va sulla categoria", async () => {
    const user = userEvent.setup({ delay: null });
    state.badges = [badge(1), badge(2, { progress: 40 })];
    const { rerender } = render(<Badges />);
    await user.click(screen.getByRole("button", { name: "Badge 2, da sbloccare, 40%" }));
    // A refetch drops badge 2 (its tile unmounts) while the dialog is open.
    state.badges = [badge(1)];
    rerender(<Badges />);
    expect(screen.queryByRole("button", { name: /Badge 2/ })).toBeNull();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Tutti" }));
  });

  it("senza h1 né tema scuro forzato; collezione e categorie in italiano", () => {
    state.badges = [badge(1, { earned: true, earnedAt: "2026-10-12" }), badge(2), badge(3), badge(4)];
    const { container } = render(<Badges />);
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(container.querySelector(".dark")).toBeNull();
    expect(container.querySelector("style")).toBeNull();
    const collection = screen.getByRole("region", { name: "Collezione" });
    expect(within(collection).getByText("Badge sbloccati")).toBeTruthy();
    expect(within(collection).getByText("di 4")).toBeTruthy();
    expect(within(collection).getByText("25%")).toBeTruthy();
    for (const name of ["Tutti", "Distanza", "Acque libere", "Imprese"]) {
      expect(screen.getByRole("tab", { name })).toBeTruthy();
    }
  });

  it("mostra l'immagine dei badge sbloccati e il lucchetto con progresso per gli altri", () => {
    state.badges = [
      badge(1, { earned: true }),
      badge(2, { progress: 40 }),
    ];
    render(<Badges />);
    const grid = screen.getByRole("list", { name: "Badge" });
    const earned = within(grid).getByRole("button", { name: "Badge 1" });
    expect(earned.querySelector("img")?.getAttribute("src")).toBe("/badges_new/first_km.png");
    const locked = within(grid).getByRole("button", { name: "Badge 2, da sbloccare, 40%" });
    expect(locked.querySelector("img")).toBeNull();
    expect(locked.querySelector('[data-slot="progress"]')).toBeTruthy();
  });

  it("filtra per categoria", async () => {
    state.badges = [badge(1), badge(2, { category: "open_water" })];
    state.definitions = [{ id: 9, name: "Capitano", description: "", iconUrl: "/x.png" }];
    state.userAchievements = [{ badgeId: 9, awardedAt: "2026-10-01" }];
    render(<Badges />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    await userEvent.click(screen.getByRole("tab", { name: "Acque libere" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Badge 2, da sbloccare" })).toBeTruthy();
    await userEvent.click(screen.getByRole("tab", { name: "Imprese" }));
    expect(screen.getByRole("button", { name: "Capitano" })).toBeTruthy();
  });

  it("apre il dettaglio: sbloccato con data e suono, bloccato con progresso", async () => {
    state.badges = [
      badge(1, { earned: true, earnedAt: "2026-10-12T10:00:00Z", rarity: "legendary" }),
      badge(2, { progress: 40 }),
    ];
    render(<Badges />);
    await userEvent.click(screen.getByRole("button", { name: "Badge 1" }));
    let dialog = screen.getByRole("dialog", { name: "Badge 1" });
    expect(within(dialog).getByText("Leggendario")).toBeTruthy();
    expect(within(dialog).getByText("Sbloccato il 12 ott 2026")).toBeTruthy();
    expect(play).toHaveBeenCalledTimes(1);
    await userEvent.click(within(dialog).getByRole("button", { name: "Chiudi" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Badge 2, da sbloccare, 40%" }));
    dialog = screen.getByRole("dialog", { name: "Badge 2" });
    expect(within(dialog).getByText("40%")).toBeTruthy();
    expect(within(dialog).getByRole("progressbar", { name: "Progresso: Badge 2" })).toBeTruthy();
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("pagina a dieci badge per volta", async () => {
    state.badges = Array.from({ length: 12 }, (_, i) => badge(i + 1));
    render(<Badges />);
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    const pages = screen.getByRole("navigation", { name: "Pagine dei badge" });
    await userEvent.click(within(pages).getByRole("button", { name: "Avanti" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});
