import { act, cleanup, render, screen, within } from "@testing-library/react";
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
  activities: [] as any[],
  pending: false,
  error: false,
  refetch: vi.fn(),
  // Options and pending flags of the mutations, by name.
  options: {} as Record<string, any>,
  mutating: {} as Record<string, any>,
}));

// `mutate` leaves the mutation pending (as on the network) until the test clears `state.mutating`.
const mutation = vi.hoisted(() => (name: string, calls: any[]) => (options: any) => {
  state.options[name] = options;
  return {
    mutate: (vars: any) => {
      calls.push(vars);
      state.mutating[name] = vars;
    },
    isPending: state.mutating[name] !== undefined,
    variables: state.mutating[name],
  };
});

vi.mock("@/lib/trpc", () => ({
  trpc: {
    profile: { get: { useQuery: () => ({ data: { userId: 4, level: 5, totalXp: 8420 } }) } },
    activities: { list: { useQuery: () => ({ data: state.activities }) } },
    badges: { userBadges: { useQuery: () => ({ data: [{ id: 1 }, { id: 2 }] }) } },
    challenges: {
      list: {
        useQuery: () =>
          state.pending
            ? { data: undefined, isPending: true, isLoading: true, refetch: state.refetch }
            : state.error
              ? { data: undefined, isPending: false, isError: true, refetch: state.refetch }
              : { data: state.challenges, refetch: state.refetch },
      },
      create: { useMutation: mutation("create", state.createCalls) },
      join: { useMutation: mutation("join", state.joinCalls) },
      leave: { useMutation: mutation("leave", state.leaveCalls) },
    },
    leaderboard: { get: { useQuery: () => ({ data: state.leaderboard }) } },
  },
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

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

/**
 * Radix keeps a closing dialog mounted until its exit animation ends, as in a browser. jsdom has
 * no CSS animations: the alertdialog reports one («exit» once closed) and `finishExit` ends it.
 */
function animateAlertDialogExit() {
  const original = window.getComputedStyle.bind(window);
  const spy = vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
    const styles = original(element, pseudo);
    if (!(element instanceof HTMLElement) || element.getAttribute("role") !== "alertdialog") return styles;
    return new Proxy(styles, {
      get: (target, key) => {
        if (key === "animationName") return element.dataset.state === "closed" ? "exit" : "enter";
        const value = Reflect.get(target, key, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  });
  return {
    finishExit: async () => {
      const dialog = screen.getByRole("alertdialog");
      act(() => {
        dialog.dispatchEvent(Object.assign(new Event("animationend"), { animationName: "exit" }));
      });
      // Radix restores focus in a timeout after the unmount: wait for it.
      await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    },
    restore: () => spy.mockRestore(),
  };
}

function renderChallenges() {
  const tree = () => (
    <Router hook={memoryLocation({ path: "/challenges" }).hook}>
      <Challenges />
    </Router>
  );
  const { rerender } = render(tree());
  return { rerender: () => rerender(tree()) };
}

describe("Sfide (Corsia)", () => {
  afterEach(cleanup);
  beforeEach(() => {
    state.challenges = [];
    state.leaderboard = [];
    state.joinCalls.length = 0;
    state.leaveCalls.length = 0;
    state.createCalls.length = 0;
    state.activities = [];
    state.pending = false;
    state.error = false;
    state.refetch.mockClear();
    state.mutating = {};
    toast.error.mockClear();
  });

  it("in caricamento: scheletri, non «Attive (0)» né lo stato vuoto", () => {
    state.pending = true;
    renderChallenges();
    expect(screen.getByRole("status").textContent).toContain("Caricamento");
    expect(screen.getByRole("tab", { name: /Attive/ }).textContent).not.toContain("(0)");
    expect(screen.queryByText(/Nessuna sfida attiva/)).toBeNull();
  });

  it("errore: messaggio breve e Riprova", async () => {
    state.error = true;
    renderChallenges();
    expect(screen.getByText("Non riesco a caricare i dati")).toBeTruthy();
    expect(screen.queryByText(/Nessuna sfida attiva/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(state.refetch).toHaveBeenCalled();
  });

  describe("«Serie attuale» come nel profilo (lun/mer/ven, giorni locali)", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      // Wednesday 28 October 2026, evening.
      vi.setSystemTime(new Date(2026, 9, 28, 19, 0));
    });
    afterEach(() => vi.useRealTimers());

    it("lunedì e mercoledì di fila contano 2, anche senza il martedì", () => {
      state.activities = [
        { activityDate: new Date(2026, 9, 26, 7, 0).toISOString() },
        // Just after local midnight: Wednesday, not Tuesday as in UTC.
        { activityDate: new Date(2026, 9, 28, 0, 30).toISOString() },
      ];
      renderChallenges();
      const summary = screen.getByRole("region", { name: "Riepilogo" });
      expect(within(summary).queryByText("Giorni di fila")).toBeNull();
      const streak = within(summary).getByText("Serie attuale").parentElement!;
      expect(streak.textContent).toBe("2 g Serie attuale");
    });

    it("mercoledì non ancora nuotato non interrompe la serie", () => {
      state.activities = [
        { activityDate: new Date(2026, 9, 23, 7, 0).toISOString() },
        { activityDate: new Date(2026, 9, 26, 7, 0).toISOString() },
      ];
      renderChallenges();
      const streak = within(screen.getByRole("region", { name: "Riepilogo" })).getByText("Serie attuale").parentElement!;
      expect(streak.textContent).toBe("2 g Serie attuale");
    });
  });

  it("Partecipa disattivato mentre la richiesta è in corso; errore con avviso", () => {
    state.challenges = [challenge(9), challenge(10)];
    state.mutating.join = { challengeId: 9 };
    renderChallenges();
    return userEvent.click(screen.getByRole("tab", { name: "Disponibili" })).then(() => {
      const button = screen.getByRole("button", { name: "Partecipa: Sfida 9" });
      expect(button.hasAttribute("disabled")).toBe(true);
      expect(screen.getByRole("button", { name: "Partecipa: Sfida 10" }).hasAttribute("disabled")).toBe(false);
      state.options.join.onError(new Error("Rete assente"));
      expect(toast.error).toHaveBeenCalledWith("Rete assente");
      state.options.leave.onError({ message: "" });
      expect(toast.error).toHaveBeenLastCalledWith("Impossibile abbandonare la sfida");
    });
  });

  it("Partecipa e Abbandona falliti sul server ({ success: false }): avviso d'errore", () => {
    renderChallenges();
    state.options.join.onSuccess({ success: true });
    state.options.leave.onSuccess({ success: true });
    expect(toast.error).not.toHaveBeenCalled();
    state.options.join.onSuccess({ success: false });
    expect(toast.error).toHaveBeenLastCalledWith("Impossibile partecipare alla sfida");
    state.options.leave.onSuccess({ success: false });
    expect(toast.error).toHaveBeenLastCalledWith("Impossibile abbandonare la sfida");
    // Either way the list is refreshed.
    expect(state.refetch).toHaveBeenCalledTimes(4);
  });

  it("sfida sul passo: la barra misura rispetto al passo migliore (più basso)", () => {
    state.challenges = [
      challenge(3, {
        isParticipant: true,
        objective: "avg_pace",
        current_progress: 125,
        leaderboard: [{ progress: 100 }, { progress: 125 }, { progress: 0 }],
      }),
    ];
    renderChallenges();
    const bar = screen.getByRole("progressbar", { name: "Progresso: Sfida 3" });
    // 1:40 is the best pace, mine is 2:05: 80% of the way.
    expect(bar.getAttribute("aria-valuenow")).toBe("80");
    expect(bar.getAttribute("aria-valuetext")).toBe("80%");
  });

  it("senza h1 né titolo ripetuto; riepilogo con metriche e schede in italiano", () => {
    renderChallenges();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Sfide" })).toBeNull();
    const summary = screen.getByRole("region", { name: "Riepilogo" });
    expect(within(summary).getByText("8.420")).toBeTruthy();
    expect(within(summary).getByText("XP totali")).toBeTruthy();
    expect(within(summary).getByText("Serie attuale")).toBeTruthy();
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
    // Asks first: nothing is sent until confirmed.
    expect(state.leaveCalls).toEqual([]);
    const confirm = screen.getByRole("alertdialog", { name: "Abbandonare «Sfida 7»?" });
    await userEvent.click(within(confirm).getByRole("button", { name: "Annulla" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(state.leaveCalls).toEqual([]);
    await userEvent.click(within(card).getByRole("button", { name: "Abbandona" }));
    await userEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Abbandona" })
    );
    expect(state.leaveCalls).toEqual([{ challengeId: 7 }]);
  });

  describe("fuoco e titolo del dialogo «Abbandona»", () => {
    let exit: ReturnType<typeof animateAlertDialogExit>;
    beforeEach(() => {
      exit = animateAlertDialogExit();
      state.challenges = [challenge(7, { isParticipant: true }), challenge(8, { isParticipant: true })];
    });
    afterEach(() => exit.restore());

    const openLeave = async (name: string) => {
      const card = screen.getByRole("heading", { level: 3, name }).closest("li")!;
      const opener = within(card).getByRole("button", { name: "Abbandona" });
      await userEvent.click(opener);
      return opener;
    };

    it("Annulla: il titolo resta durante la chiusura e il fuoco torna su «Abbandona»", async () => {
      renderChallenges();
      const opener = await openLeave("Sfida 7");
      await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Annulla" }));
      // Still animating out: the title keeps the challenge name.
      expect(screen.getByRole("alertdialog", { name: "Abbandonare «Sfida 7»?" })).toBeTruthy();
      await exit.finishExit();
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(document.activeElement).toBe(opener);
    });

    it("confermato: mentre la richiesta è in corso il fuoco va sulla scheda «Attive», non sul body", async () => {
      renderChallenges();
      const opener = await openLeave("Sfida 7");
      await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Abbandona" }));
      expect(screen.getByRole("alertdialog", { name: "Abbandonare «Sfida 7»?" })).toBeTruthy();
      // The card's button is disabled while the request runs.
      expect(opener.hasAttribute("disabled")).toBe(true);
      await exit.finishExit();
      expect(document.activeElement).toBe(screen.getByRole("tab", { name: /Attive/ }));
    });

    it("confermato: la scheda sparisce col refetch prima della fine dell'animazione", async () => {
      const { rerender } = renderChallenges();
      await openLeave("Sfida 7");
      await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Abbandona" }));
      state.mutating = {};
      state.challenges = [challenge(8, { isParticipant: true })];
      rerender();
      expect(screen.queryByRole("heading", { level: 3, name: "Sfida 7" })).toBeNull();
      await exit.finishExit();
      expect(document.activeElement).toBe(screen.getByRole("tab", { name: /Attive/ }));
    });
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
      { userId: 1, name: "Anna", totalXp: 900, periodXp: 300, totalDistanceMeters: 12000, avatarUrl: null },
      { userId: 4, name: "Marta", totalXp: 800, periodXp: 100, totalDistanceMeters: 0 },
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

  it("classifica settimanale: mostra gli XP della settimana, non quelli totali", async () => {
    state.leaderboard = [
      { userId: 1, name: "Anna", totalXp: 9000, periodXp: "1234", totalDistanceMeters: 0 },
      { userId: 2, name: "Bea", totalXp: 8000, periodXp: null, totalDistanceMeters: 0 },
    ];
    renderChallenges();
    await userEvent.click(screen.getByRole("tab", { name: "Classifica" }));
    expect(screen.getByText("Questa settimana")).toBeTruthy();
    const list = screen.getByRole("list", { name: "Classifica" });
    const anna = within(list).getByRole("link", { name: /Anna/ });
    expect(within(anna).getByText("1.234")).toBeTruthy();
    expect(within(anna).queryByText("9.000")).toBeNull();
    const bea = within(list).getByRole("link", { name: /Bea/ });
    expect(within(bea).getByText("0")).toBeTruthy();
    expect(within(bea).getByText("XP")).toBeTruthy();
  });

  it("classifica settimanale a zero (lunedì): nessuna posizione né medaglia", async () => {
    state.leaderboard = [
      { userId: 1, name: "Anna", periodXp: "0" },
      { userId: 2, name: "Bea", periodXp: 0 },
      { userId: 3, name: "Cleo", periodXp: null },
    ];
    renderChallenges();
    await userEvent.click(screen.getByRole("tab", { name: "Classifica" }));
    const items = within(screen.getByRole("list", { name: "Classifica" })).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(within(item).getByText("Senza posizione")).toBeTruthy();
      expect(within(item).queryAllByText(/^[1-9]\d*$/)).toEqual([]);
      expect(item.hasAttribute("value")).toBe(false);
    }
  });

  it("classifica settimanale: chi è a zero va in fondo senza posizione", async () => {
    state.leaderboard = [
      { userId: 2, name: "Bea", periodXp: 0 },
      { userId: 1, name: "Anna", periodXp: "500" },
    ];
    renderChallenges();
    await userEvent.click(screen.getByRole("tab", { name: "Classifica" }));
    const [first, second] = within(screen.getByRole("list", { name: "Classifica" })).getAllByRole("listitem");
    expect(within(first).getByText("Anna")).toBeTruthy();
    expect(first.getAttribute("value")).toBe("1");
    expect(within(first).getByText("1")).toBeTruthy();
    expect(within(second).getByText("Bea")).toBeTruthy();
    expect(within(second).getByText("Senza posizione")).toBeTruthy();
  });

  it("dopo Partecipa sull'ultima pagina non resta una pagina vuota", async () => {
    state.challenges = [1, 2, 3, 4].map((id) => challenge(id));
    const { rerender } = renderChallenges();
    await userEvent.click(screen.getByRole("tab", { name: "Disponibili" }));
    const pages = screen.getByRole("navigation", { name: "Pagine delle sfide disponibili" });
    await userEvent.click(within(pages).getByRole("button", { name: "Avanti" }));
    expect(screen.getByRole("heading", { level: 3, name: "Sfida 4" })).toBeTruthy();
    // Joined: «Sfida 4» leaves the available list, which now fits on one page.
    state.challenges = [1, 2, 3].map((id) => challenge(id)).concat(challenge(4, { isParticipant: true }));
    rerender();
    expect(screen.queryByRole("navigation", { name: "Pagine delle sfide disponibili" })).toBeNull();
    expect(screen.getByRole("heading", { level: 3, name: "Sfida 1" })).toBeTruthy();
  });

  it("classifica paginata: ogni voce porta la posizione visibile", async () => {
    state.leaderboard = [1, 2, 3, 4, 5].map((userId) => ({ userId, name: `N${userId}`, periodXp: 100 - userId }));
    renderChallenges();
    await userEvent.click(screen.getByRole("tab", { name: "Classifica" }));
    const positions = () =>
      within(screen.getByRole("list", { name: "Classifica" }))
        .getAllByRole("listitem")
        .map((item) => item.getAttribute("value"));
    expect(positions()).toEqual(["1", "2", "3", "4"]);
    await userEvent.click(screen.getByRole("button", { name: "Avanti" }));
    expect(positions()).toEqual(["5"]);
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
