import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import ActivityInsightNotification from "./ActivityInsightNotification";
import BadgeUnlockNotification from "./BadgeUnlockNotification";
import PbCelebrationNotification from "./PbCelebrationNotification";

const state = vi.hoisted(() => ({
  confetti: vi.fn(),
  pbEvents: [] as unknown[],
  insights: [] as unknown[],
  tracked: [] as unknown[],
  markSeen: [] as unknown[],
}));

vi.mock("canvas-confetti", () => ({ default: state.confetti }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ isAuthenticated: true }) }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    records: {
      pendingCelebrations: { useQuery: () => ({ data: { events: state.pbEvents } }) },
      trackCelebrationAction: { useMutation: () => ({ mutate: (vars: unknown) => state.tracked.push(vars) }) },
    },
    activityInsights: {
      pending: { useQuery: () => ({ data: state.insights }) },
      markSeen: { useMutation: () => ({ mutate: (vars: unknown) => state.markSeen.push(vars) }) },
    },
  },
}));

const badge = (id: number, name: string) => ({
  id,
  code: `code_${id}`,
  name,
  description: `Descrizione di ${name}`,
  image_url: "/badges/first.png",
});

describe("BadgeUnlockNotification (Corsia)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    state.confetti.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("un dialogo per badge, con il contatore; l'ultimo chiude", async () => {
    const onComplete = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<BadgeUnlockNotification badges={[badge(1, "Prima vasca"), badge(2, "Dieci km")]} onComplete={onComplete} />);

    const dialog = screen.getByRole("dialog", { name: "Complimenti!" });
    expect(dialog).toHaveTextContent("Badge 1 di 2");
    expect(dialog).toHaveTextContent("Prima vasca");
    expect(dialog).toHaveAccessibleDescription("Descrizione di Prima vasca");
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(state.confetti).toHaveBeenCalledWith(
      expect.objectContaining({ disableForReducedMotion: true })
    );

    await user.click(screen.getByRole("button", { name: "Prossimo badge" }));
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(screen.getByRole("dialog", { name: "Complimenti!" })).toHaveTextContent("Dieci km");

    await user.click(screen.getByRole("button", { name: "Continua" }));
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("Esc passa avanti come il tocco sullo sfondo", async () => {
    const onComplete = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<BadgeUnlockNotification badges={[badge(1, "Prima vasca")]} onComplete={onComplete} />);
    await user.keyboard("{Escape}");
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe("PbCelebrationNotification (Corsia)", () => {
  const event = (id: number) => ({
    id,
    createdAt: "2026-10-28T10:00:00Z",
    strokeType: "freestyle",
    distanceMeters: 100,
    poolLengthMeters: 25,
    source: "training",
    newTimeCs: 6512,
    previousTimeCs: 6630,
    improvementCs: 118,
  });

  beforeEach(() => {
    window.localStorage.clear();
    state.tracked = [];
  });
  afterEach(cleanup);

  it("un dialogo con il record in evidenza; Chiudi lo segna come visto", async () => {
    state.pbEvents = [event(4)];
    render(<PbCelebrationNotification />);

    const dialog = screen.getByRole("dialog", { name: "Stile libero 100m" });
    expect(dialog).toHaveTextContent("Nuovo record personale");
    expect(dialog).toHaveTextContent("Nuovo tempo");
    expect(dialog).toHaveTextContent("Da 1:06.30 a 1:05.12 (−1.18)");
    expect(state.tracked).toEqual([expect.objectContaining({ action: "open", celebrationEventId: 4 })]);

    await userEvent.click(screen.getByRole("button", { name: "Chiudi" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.localStorage.getItem("swimforge:pbCelebration:lastSeenEventId")).toBe("4");
  });

  it("condividi apre il post precompilato", async () => {
    state.pbEvents = [event(5), event(6)];
    const listener = vi.fn();
    window.addEventListener("swimforge:open-create-post", listener);
    render(<PbCelebrationNotification />);
    expect(screen.getByRole("button", { name: "Prossimo record" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Condividi nel feed" }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail.initialContent).toContain("Nuovo PB nei Stile libero 100m");
    expect(screen.queryByRole("dialog")).toBeNull();
    window.removeEventListener("swimforge:open-create-post", listener);
  });
});

describe("ActivityInsightNotification (Corsia)", () => {
  beforeEach(() => {
    state.markSeen = [];
    state.insights = [
      {
        activity_id: 31,
        activity_distance_meters: 2500,
        activity_duration_seconds: 3000,
        activity_date: "2026-10-27T08:00:00Z",
      },
      { activity_id: 32 },
    ];
  });
  afterEach(cleanup);

  function renderInsight() {
    const location = memoryLocation({ path: "/today", record: true });
    render(
      <Router hook={location.hook} searchHook={location.searchHook}>
        <ActivityInsightNotification />
      </Router>
    );
    return location;
  }

  it("dialogo con metriche e un link all'analisi che segna tutto come visto", async () => {
    const location = renderInsight();
    const dialog = screen.getByRole("dialog", { name: "Analisi della tua ultima nuotata pronta" });
    expect(dialog).toHaveTextContent("2,5 km Distanza");
    expect(dialog).toHaveTextContent("50 min Durata");
    expect(dialog).toHaveTextContent("Nuotata del 27 ott 2026");
    expect(dialog).toHaveTextContent("2 nuove analisi disponibili");

    await userEvent.click(screen.getByRole("link", { name: "Apri l'analisi" }));
    expect(location.history.at(-1)).toBe("/coach?tab=session-iq");
    expect(state.markSeen).toEqual([{ activityId: 31 }, { activityId: 32 }]);
  });

  it("Esc chiude e segna come viste", async () => {
    renderInsight();
    await userEvent.keyboard("{Escape}");
    expect(state.markSeen).toEqual([{ activityId: 31 }, { activityId: 32 }]);
  });
});
