import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import Community from "./Community";

const state = vi.hoisted(() => ({
  clubs: [] as any[],
  clubQueries: [] as any[],
  suggested: [] as any[],
  followCalls: [] as any[],
  createCalls: [] as any[],
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    community: {
      clubs: {
        list: {
          useQuery: (input: any) => {
            state.clubQueries.push(input);
            return { data: state.clubs, isLoading: false, refetch: vi.fn() };
          },
        },
        create: {
          useMutation: () => ({
            mutate: (vars: any) => state.createCalls.push(vars),
            isPending: false,
          }),
        },
      },
      users: {
        suggested: { useQuery: () => ({ data: state.suggested, isLoading: false }) },
        search: { useQuery: () => ({ data: [], isLoading: false }) },
        toggleFollow: {
          useMutation: () => ({
            mutate: (vars: any) => state.followCalls.push(vars),
            isPending: false,
          }),
        },
      },
    },
    useUtils: () => ({}),
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock("@/components/AppLayout", () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));

const club = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Club ${id}`,
  description: `Descrizione ${id}`,
  visibility: "public",
  member_count: 12,
  is_member: false,
  ...extra,
});

function renderCommunity() {
  render(
    <Router hook={memoryLocation({ path: "/home/community" }).hook}>
      <Community />
    </Router>
  );
}

describe("Community · Club (Corsia)", () => {
  afterEach(cleanup);
  beforeEach(() => {
    state.clubs = [];
    state.clubQueries.length = 0;
    state.suggested = [];
    state.followCalls.length = 0;
    state.createCalls.length = 0;
  });

  it("non ha un h1 né la navigazione verso le classifiche", () => {
    renderCommunity();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Club" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Trova nuotatori" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /classifica/i })).toBeNull();
    expect(screen.getByText("Nessun club trovato.")).toBeTruthy();
  });

  it("mostra i club con stato, membri e collegamento, e pagina a sei per volta", async () => {
    state.clubs = [
      club(1, { is_member: true, member_count: 1 }),
      club(2, { visibility: "invite", member_status: "pending" }),
      ...[3, 4, 5, 6, 7].map(id => club(id)),
    ];
    renderCommunity();
    const first = screen.getByRole("heading", { level: 3, name: "Club 1" }).closest("li")!;
    expect(within(first).getByText("Membro")).toBeTruthy();
    expect(within(first).getByText(/1 membro · Pubblico/)).toBeTruthy();
    expect(within(first).getByRole("link", { name: "Apri Club 1" }).getAttribute("href")).toBe(
      "/community/club/1"
    );
    const second = screen.getByRole("heading", { level: 3, name: "Club 2" }).closest("li")!;
    expect(within(second).getByText("In attesa")).toBeTruthy();
    expect(within(second).getByText(/12 membri · Privato/)).toBeTruthy();

    const pages = screen.getByRole("navigation", { name: "Pagine dei club" });
    expect(within(pages).getByText("Pagina 1 di 2")).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 3, name: "Club 7" })).toBeNull();
    await userEvent.click(within(pages).getByRole("button", { name: "Avanti" }));
    expect(screen.getByRole("heading", { level: 3, name: "Club 7" })).toBeTruthy();
  });

  it("passa a «I miei» e cerca i club", async () => {
    renderCommunity();
    await userEvent.click(screen.getByRole("tab", { name: "I miei" }));
    expect(state.clubQueries.at(-1)).toMatchObject({ scope: "mine" });
    await userEvent.type(screen.getByRole("searchbox", { name: "Cerca club" }), "rari");
    expect(state.clubQueries.at(-1)).toMatchObject({ scope: "mine", search: "rari" });
  });

  it("segue un nuotatore suggerito", async () => {
    state.suggested = [
      { userId: 5, username: "marta", level: 4, isFollowing: false },
      { userId: 6, name: "Luca", isFollowing: true },
    ];
    renderCommunity();
    const people = screen.getByRole("region", { name: "Trova nuotatori" });
    expect(within(people).getByText("@marta · Livello 4")).toBeTruthy();
    expect(within(people).getByRole("button", { name: "Seguito" })).toBeDisabled();
    await userEvent.click(within(people).getByRole("button", { name: "Segui" }));
    expect(state.followCalls).toEqual([{ userId: 5 }]);
  });

  it("crea un club dal dialogo", async () => {
    renderCommunity();
    await userEvent.click(screen.getByRole("button", { name: "Crea club" }));
    const dialog = screen.getByRole("dialog");
    const submit = within(dialog).getByRole("button", { name: "Crea club" });
    expect(submit).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText("Nome club"), "Rari Nantes");
    await userEvent.click(submit);
    expect(state.createCalls).toEqual([
      expect.objectContaining({ name: "Rari Nantes", visibility: "public", isPrivate: false }),
    ]);
  });
});
