import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import Challenges from "./Challenges";

const state = vi.hoisted(() => ({
  challenges: [] as any[],
  leaderboard: [] as any[],
  joinCalls: [] as any[],
  leaveCalls: [] as any[],
  createCalls: [] as any[],
}));

const mutation = vi.hoisted(() => (calls: any[]) => () => ({
  mutate: (vars: any) => calls.push(vars),
  isPending: false,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    profile: { get: { useQuery: () => ({ data: { userId: 4, level: 5, totalXp: 8420 } }) } },
    activities: { list: { useQuery: () => ({ data: [] }) } },
    badges: { userBadges: { useQuery: () => ({ data: [{ id: 1 }, { id: 2 }] }) } },
    challenges: {
      list: { useQuery: () => ({ data: state.challenges, refetch: vi.fn() }) },
      create: { useMutation: mutation(state.createCalls) },
      join: { useMutation: mutation(state.joinCalls) },
      leave: { useMutation: mutation(state.leaveCalls) },
    },
    leaderboard: { get: { useQuery: () => ({ data: state.leaderboard }) } },
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/components/AppLayout", () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));

const challenge = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Sfida ${id}`,
  description: `Descrizione ${id}`,
  status: "active",
  isParticipant: false,
  objective: "total_distance",
  participantCount: 3,
  end_date: new Date(Date.now() + 3 * 86400000).toISOString(),
  ...extra,
});

function renderChallenges() {
  render(
    <Router hook={memoryLocation({ path: "/challenges" }).hook}>
      <Challenges />
    </Router>
  );
}

describe("Sfide (Corsia)", () => {
  afterEach(cleanup);
  beforeEach(() => {
    state.challenges = [];
    state.leaderboard = [];
    state.joinCalls.length = 0;
    state.leaveCalls.length = 0;
    state.createCalls.length = 0;
  });

  it("senza h1 né titolo ripetuto; riepilogo con metriche e schede in italiano", () => {
    renderChallenges();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Sfide" })).toBeNull();
    const summary = screen.getByRole("region", { name: "Riepilogo" });
    expect(within(summary).getByText("8.420")).toBeTruthy();
    expect(within(summary).getByText("XP totali")).toBeTruthy();
    expect(within(summary).getByText("Giorni di fila")).toBeTruthy();
    for (const name of [/Attive/, "Disponibili", "Concluse", "Classifica"]) {
      expect(screen.getByRole("tab", { name })).toBeTruthy();
    }
    expect(screen.getByText(/Nessuna sfida attiva/)).toBeTruthy();
  });

  it("mostra una sfida attiva con progresso e la abbandona", async () => {
    state.challenges = [
      challenge(7, {
        isParticipant: true,
        current_progress: 3200,
        leaderboard: [{ progress: 6400 }],
      }),
    ];
    renderChallenges();
    expect(screen.getByRole("tab", { name: /Attive/ }).textContent).toContain("(1)");
    const card = screen.getByRole("heading", { level: 3, name: "Sfida 7" }).closest("li")!;
    expect(within(card).getByText("Attiva")).toBeTruthy();
    expect(within(card).getByText("Distanza totale")).toBeTruthy();
    expect(within(card).getByText("3 partecipanti")).toBeTruthy();
    expect(within(card).getByText("Mancano 3 giorni")).toBeTruthy();
    expect(within(card).getByText("3,2")).toBeTruthy();
    expect(within(card).getByRole("progressbar", { name: "Progresso: Sfida 7" })).toBeTruthy();
    expect(within(card).getByRole("link", { name: "Dettagli: Sfida 7" }).getAttribute("href")).toBe(
      "/challenges/7"
    );
    await userEvent.click(within(card).getByRole("button", { name: "Abbandona" }));
    expect(state.leaveCalls).toEqual([{ challengeId: 7 }]);
  });

  it("partecipa a una sfida disponibile", async () => {
    state.challenges = [challenge(9, { objective: "avg_pace" })];
    renderChallenges();
    await userEvent.click(screen.getByRole("tab", { name: "Disponibili" }));
    const card = screen.getByRole("heading", { level: 3, name: "Sfida 9" }).closest("li")!;
    expect(within(card).getByText("Passo medio")).toBeTruthy();
    await userEvent.click(within(card).getByRole("button", { name: "Partecipa: Sfida 9" }));
    expect(state.joinCalls).toEqual([{ challengeId: 9 }]);
  });

  it("classifica con oro in testa e la propria riga evidenziata", async () => {
    state.leaderboard = [
      { userId: 1, name: "Anna", totalXp: 900, totalDistanceMeters: 12000, avatarUrl: null },
      { userId: 4, name: "Marta", totalXp: 800, totalDistanceMeters: 0 },
    ];
    renderChallenges();
    await userEvent.click(screen.getByRole("tab", { name: "Classifica" }));
    const list = screen.getByRole("list", { name: "Classifica" });
    const anna = within(list).getByRole("link", { name: /Anna/ });
    expect(within(anna).getByText("1").className).toContain("var(--gold)");
    expect(within(anna).getByText("12 km")).toBeTruthy();
    const marta = within(list).getByRole("link", { name: /Marta/ });
    expect(marta.className).toContain("border-action-text");
    expect(within(marta).getByText("Tu")).toBeTruthy();
  });

  it("crea una sfida dal dialogo", async () => {
    renderChallenges();
    await userEvent.click(screen.getByRole("button", { name: "Crea sfida" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Nome sfida"), "Sprint");
    await userEvent.click(within(dialog).getByRole("button", { name: "Crea sfida" }));
    expect(state.createCalls).toEqual([
      expect.objectContaining({ name: "Sprint", type: "pool", objective: "total_distance", duration: "1_week" }),
    ]);
  });
});
