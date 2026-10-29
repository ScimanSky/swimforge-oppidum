import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactNode } from "react";
import BadgeUnlockNotification from "./BadgeUnlockNotification";
import CookieBanner from "./CookieBanner";
import PbCelebrationNotification from "./PbCelebrationNotification";
import OnboardingFlow from "./onboarding/OnboardingFlow";
import { useBadgeNotifications } from "@/hooks/useBadgeNotifications";

const COOKIE_KEY = "swimforge:cookie-consent:v1";

const state = vi.hoisted(() => ({
  confetti: vi.fn(),
  setBulk: vi.fn(),
  consentCalls: [] as unknown[],
  pbEvents: [] as unknown[],
}));

vi.mock("canvas-confetti", () => ({ default: state.confetti }));
vi.mock("@remotion/player", () => ({ Player: () => null }));
vi.mock("./onboarding/OnboardingWelcomeComposition", () => ({
  OnboardingWelcomeComposition: () => null,
  ONBOARDING_WELCOME_DURATION_FRAMES: 30,
  ONBOARDING_WELCOME_FPS: 30,
  ONBOARDING_WELCOME_HEIGHT: 720,
  ONBOARDING_WELCOME_WIDTH: 1280,
}));
vi.mock("framer-motion", () => {
  const strip = ({ children, initial, animate, exit, transition, ...rest }: any) => <div {...rest}>{children}</div>;
  return {
    motion: new Proxy({}, { get: () => strip }),
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  };
});
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ isAuthenticated: true }) }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ consent: { list: { invalidate: vi.fn() } } }),
    auth: { me: { useQuery: () => ({ data: { id: 7, name: "Ada" } }) } },
    consent: {
      setBulk: { useMutation: () => ({ mutateAsync: state.setBulk, isPending: false }) },
      set: {
        useMutation: () => ({
          mutateAsync: async (vars: unknown) => {
            state.consentCalls.push(vars);
          },
        }),
      },
      list: { useQuery: () => ({ isLoading: false, data: { byType: {} } }) },
    },
    profile: { update: { useMutation: () => ({ mutateAsync: async () => {} }) } },
    records: {
      pendingCelebrations: { useQuery: () => ({ data: { events: state.pbEvents } }) },
      trackCelebrationAction: { useMutation: () => ({ mutate: vi.fn() }) },
    },
  },
}));

/** The new-badge popup as App mounts it: from the badge store. */
function Badges() {
  const { pendingBadges, isShowing, clearBadges } = useBadgeNotifications();
  return isShowing && pendingBadges.length > 0 ? (
    <BadgeUnlockNotification badges={pendingBadges} onComplete={clearBadges} />
  ) : null;
}

function renderApp(children: ReactNode) {
  const location = memoryLocation({ path: "/home", record: true });
  render(
    <Router hook={location.hook} searchHook={location.searchHook}>
      {children}
    </Router>
  );
}

const badge = {
  id: 1,
  code: "first_swim",
  name: "Prima vasca",
  description: "La tua prima nuotata",
  image_url: "/badges/first.png",
};

const pbEvent = {
  id: 9,
  createdAt: "2026-10-28T10:00:00Z",
  strokeType: "freestyle",
  distanceMeters: 100,
  poolLengthMeters: 25,
  source: "training",
  newTimeCs: 6512,
  previousTimeCs: 6630,
  improvementCs: 118,
};

describe("I festeggiamenti aspettano il banner dei cookie e l'onboarding", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    state.setBulk.mockResolvedValue({});
    state.consentCalls = [];
    state.pbEvents = [];
    useBadgeNotifications.setState({ pendingBadges: [], isShowing: false });
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("un badge arrivato col banner aperto compare dopo la scelta, e la scelta è salvata", async () => {
    // Tour already done: only the banner is in the way.
    localStorage.setItem("swimforge:onboarding:completed:v1:7", "1");
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp(
      <>
        <CookieBanner />
        <Badges />
      </>
    );
    act(() => useBadgeNotifications.getState().addBadges([badge]));

    expect(screen.getByRole("region", { name: "Preferenze cookie" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Complimenti!" })).toBeNull();
    expect(state.confetti).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Accetta tutti" }));

    expect(JSON.parse(localStorage.getItem(COOKIE_KEY) ?? "null")).toMatchObject({
      analytics: true,
      marketing: true,
    });
    expect(state.setBulk).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("region", { name: "Preferenze cookie" })).toBeNull();
    const dialog = await screen.findByRole("dialog", { name: "Complimenti!" });
    expect(dialog).toHaveTextContent("Prima vasca");
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(state.confetti).toHaveBeenCalled();
  });

  it("un badge arrivato durante l'onboarding compare quando il tour si chiude", async () => {
    localStorage.setItem(COOKIE_KEY, JSON.stringify({ analytics: false, marketing: false }));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp(
      <>
        <OnboardingFlow />
        <Badges />
      </>
    );
    await screen.findByRole("dialog", { name: "Benvenuto nel tour guidato" });
    act(() => useBadgeNotifications.getState().addBadges([badge]));

    expect(screen.queryByRole("dialog", { name: "Complimenti!" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Salta tour" }));

    expect(screen.queryByRole("dialog", { name: "Benvenuto nel tour guidato" })).toBeNull();
    expect(await screen.findByRole("dialog", { name: "Complimenti!" })).toHaveTextContent("Prima vasca");
  });

  it("un nuovo record aspetta il banner dei cookie, poi compare sopra tutto", async () => {
    localStorage.setItem("swimforge:onboarding:completed:v1:7", "1");
    state.pbEvents = [pbEvent];
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp(
      <>
        <CookieBanner />
        <PbCelebrationNotification />
      </>
    );

    expect(screen.queryByRole("dialog", { name: "Stile libero 100m" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Rifiuta opzionali" }));

    const dialog = await screen.findByRole("dialog", { name: "Stile libero 100m" });
    // Above the cookie banner (z-[85]) and the onboarding (z-[120]).
    expect(dialog).toHaveClass("z-[130]");
    expect(localStorage.getItem("swimforge:pbCelebration:lastSeenEventId")).toBeNull();
  });
});
