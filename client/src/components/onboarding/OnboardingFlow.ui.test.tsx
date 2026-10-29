import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactNode } from "react";
import OnboardingFlow from "./OnboardingFlow";
import { isOnboardingCompletedLocally, setOnboardingIdentityLocally } from "@/lib/onboarding";

const state = vi.hoisted(() => ({
  consentCalls: [] as unknown[],
  profileUpdates: [] as unknown[],
  players: [] as Array<Record<string, unknown>>,
  stills: [] as Array<Record<string, unknown>>,
}));

vi.mock("@remotion/player", () => ({
  Player: (props: Record<string, unknown>) => {
    state.players.push(props);
    return null;
  },
  Thumbnail: (props: Record<string, unknown>) => {
    state.stills.push(props);
    return null;
  },
}));
vi.mock("./OnboardingWelcomeComposition", () => ({
  OnboardingWelcomeComposition: () => null,
  ONBOARDING_WELCOME_DURATION_FRAMES: 30,
  ONBOARDING_WELCOME_FPS: 30,
  ONBOARDING_WELCOME_HEIGHT: 720,
  ONBOARDING_WELCOME_WIDTH: 1280,
  ONBOARDING_WELCOME_STILL_FRAME: 12,
}));
// No animations in jsdom: steps swap at once.
vi.mock("framer-motion", () => {
  const strip = ({ children, initial, animate, exit, transition, ...rest }: any) => <div {...rest}>{children}</div>;
  return {
    motion: new Proxy({}, { get: () => strip }),
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  };
});
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ consent: { list: { invalidate: vi.fn() } } }),
    auth: { me: { useQuery: () => ({ data: { id: 7, name: "Ada" } }) } },
    consent: {
      set: {
        useMutation: () => ({
          mutateAsync: vi.fn(async (vars: unknown) => {
            state.consentCalls.push(vars);
          }),
        }),
      },
      list: { useQuery: () => ({ isLoading: false, data: { byType: {} } }) },
    },
    profile: {
      update: {
        useMutation: () => ({
          mutateAsync: vi.fn(async (vars: unknown) => {
            state.profileUpdates.push(vars);
          }),
        }),
      },
    },
  },
}));

function renderAt(path: string) {
  const location = memoryLocation({ path, record: true });
  render(
    <Router hook={location.hook} searchHook={location.searchHook}>
      <OnboardingFlow />
    </Router>
  );
  return location;
}

async function finishIntro() {
  await act(() => vi.advanceTimersByTimeAsync(3000));
}

describe("OnboardingFlow (Corsia): dialoghi accessibili", () => {
  beforeEach(() => {
    localStorage.clear();
    state.consentCalls = [];
    state.profileUpdates = [];
    state.players = [];
    state.stills = [];
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("il video di benvenuto parte da solo", async () => {
    renderAt("/home");
    await screen.findByRole("dialog", { name: "Benvenuto nel tour guidato" });
    await vi.waitFor(() => expect(state.players.at(-1)).toMatchObject({ autoPlay: true }));
    expect(state.stills).toEqual([]);
  });

  it("con il movimento ridotto: un fotogramma fermo al posto del video, e si parte subito", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    renderAt("/home");
    await screen.findByRole("dialog", { name: "Benvenuto nel tour guidato" });

    expect(screen.getByRole("button", { name: "Inizia tour interattivo" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Attendi la fine dell'intro…" })).toBeNull();
    await vi.waitFor(() => expect(state.stills.at(-1)).toMatchObject({ frameToDisplay: 12 }));
    expect(state.players).toEqual([]);
  });

  it("il benvenuto è un dialogo con titolo; si parte solo a fine intro", async () => {
    renderAt("/home");
    const dialog = await screen.findByRole("dialog", { name: "Benvenuto nel tour guidato" });
    expect(dialog).toHaveAccessibleDescription("Un video rapido e poi una guida interattiva sui punti chiave dell'app.");
    expect(screen.getByRole("button", { name: "Attendi la fine dell'intro…" })).toBeDisabled();
    await finishIntro();
    expect(screen.getByRole("button", { name: "Inizia tour interattivo" })).toBeEnabled();
  });

  it("Esc sul benvenuto vale «Salta tour»: tour segnato come fatto", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderAt("/home");
    await screen.findByRole("dialog", { name: "Benvenuto nel tour guidato" });
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(isOnboardingCompletedLocally("7")).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(0));
    // Saved once: not again by the sync effect that sees the local flag.
    expect(state.consentCalls).toEqual([
      { consentType: "product_onboarding_tour", granted: true, consentVersion: "v1.0" },
    ]);
  });

  it("configurazione: a ogni scelta il titolo del passo successivo prende il fuoco", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderAt("/home");
    await screen.findByRole("dialog", { name: "Benvenuto nel tour guidato" });
    await finishIntro();
    await user.click(screen.getByRole("button", { name: "Inizia tour interattivo" }));

    expect(screen.getByRole("dialog", { name: "Configura il tuo profilo" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Configurazione" })).toHaveAttribute("aria-valuenow", "1");
    await user.click(screen.getByRole("button", { name: /Atleta/ }));
    expect(screen.getByRole("heading", { name: "Stile preferito" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Rana" }));
    expect(screen.getByRole("heading", { name: "Tipo di vasca" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "50m — vasca lunga" }));

    expect(state.profileUpdates).toEqual([{ preferredStroke: "breaststroke", preferredPoolLengthMeters: 50 }]);
    expect(await screen.findByRole("dialog", { name: "Navigazione principale" })).toBeInTheDocument();
  });

  it("tour: passo dopo passo in un dialogo, Chiudi lo termina", async () => {
    setOnboardingIdentityLocally({ role: "athlete", completed: true }, "7");
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderAt("/home");
    await screen.findByRole("dialog", { name: "Benvenuto nel tour guidato" });
    await finishIntro();
    await user.click(screen.getByRole("button", { name: "Inizia tour interattivo" }));

    const first = screen.getByRole("dialog", { name: "Navigazione principale" });
    expect(first).toHaveTextContent("Passo 1 di 8");
    expect(screen.getByRole("button", { name: "Indietro" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Avanti" }));
    expect(screen.getByRole("dialog", { name: "Crea contenuti" })).toHaveTextContent("Passo 2 di 8");

    await user.click(screen.getByRole("button", { name: "Chiudi" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(isOnboardingCompletedLocally("7")).toBe(true);
  });

  it("ultimo passo per l'atleta: la prima nuotata, con i +50 XP", async () => {
    setOnboardingIdentityLocally({ role: "athlete", completed: true }, "7");
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const location = renderAt("/home");
    await screen.findByRole("dialog", { name: "Benvenuto nel tour guidato" });
    await finishIntro();
    await user.click(screen.getByRole("button", { name: "Inizia tour interattivo" }));
    for (let step = 0; step < 7; step++) await user.click(screen.getByRole("button", { name: "Avanti" }));
    await user.click(screen.getByRole("button", { name: "Fine" }));

    const last = screen.getByRole("dialog", { name: "Registra la tua prima nuotata" });
    expect(last).toHaveTextContent("+50 XP");
    await user.click(screen.getByRole("button", { name: "Vai alle attività" }));
    expect(location.history.at(-1)).toBe("/track");
  });
});
