import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import OnboardingFlow from "./OnboardingFlow";
import { setOnboardingCompletedLocally, setOnboardingIdentityLocally } from "@/lib/onboarding";

vi.mock("@remotion/player", () => ({ Player: () => null, Thumbnail: () => null }));
vi.mock("./OnboardingWelcomeComposition", () => ({
  OnboardingWelcomeComposition: () => null,
  ONBOARDING_WELCOME_DURATION_FRAMES: 30,
  ONBOARDING_WELCOME_FPS: 30,
  ONBOARDING_WELCOME_HEIGHT: 720,
  ONBOARDING_WELCOME_WIDTH: 1280,
  ONBOARDING_WELCOME_STILL_FRAME: 12,
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ consent: { list: { invalidate: vi.fn() } } }),
    auth: { me: { useQuery: () => ({ data: { id: 7, name: "Ada" } }) } },
    consent: {
      set: { useMutation: () => ({ mutateAsync: vi.fn(async () => {}) }) },
      list: {
        useQuery: () => ({
          isLoading: false,
          data: { byType: { product_onboarding_tour: { granted: true } } },
        }),
      },
    },
  },
}));

function renderAt(path: string, searchPath = "") {
  const location = memoryLocation({ path, searchPath, record: true });
  render(
    <Router hook={location.hook} searchHook={location.searchHook}>
      <OnboardingFlow />
    </Router>
  );
  return location;
}

describe("OnboardingFlow: parametri nella query", () => {
  beforeEach(() => {
    localStorage.clear();
    setOnboardingCompletedLocally(true, "7");
  });
  afterEach(cleanup);

  it("?onboarding=1 riapre il benvenuto anche a tour già fatto", async () => {
    renderAt("/goals", "onboarding=1");
    expect(await screen.findByText("Benvenuto nel tour guidato")).toBeInTheDocument();
  });

  it("?tour=1 riapre il benvenuto", async () => {
    renderAt("/home", "tour=1");
    expect(await screen.findByText("Benvenuto nel tour guidato")).toBeInTheDocument();
  });

  it("senza parametri, a tour fatto, non mostra nulla", () => {
    renderAt("/goals");
    expect(screen.queryByText("Benvenuto nel tour guidato")).not.toBeInTheDocument();
  });
});

describe("OnboardingFlow: «Rivedi il tour» a tour già fatto", () => {
  beforeEach(() => {
    localStorage.clear();
    setOnboardingCompletedLocally(true, "7");
    setOnboardingIdentityLocally({ role: "athlete", completed: true }, "7");
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  async function startFromWelcome(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByRole("dialog", { name: "Benvenuto nel tour guidato" });
    await act(() => vi.advanceTimersByTimeAsync(3000));
    await user.click(screen.getByRole("button", { name: "Inizia tour interattivo" }));
  }

  it("dalla home (?onboarding=1): dopo il video il tour resta aperto fino alla fine", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const location = renderAt("/home", "onboarding=1");
    await startFromWelcome(user);

    expect(await screen.findByRole("dialog", { name: "Navigazione principale" })).toHaveTextContent("Passo 1 di 8");
    expect(location.history.at(-1)).toBe("/home");
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(screen.getByRole("dialog", { name: "Navigazione principale" })).toBeInTheDocument();

    for (let step = 0; step < 7; step++) await user.click(screen.getByRole("button", { name: "Avanti" }));
    await user.click(screen.getByRole("button", { name: "Fine" }));
    expect(screen.getByRole("dialog", { name: "Registra la tua prima nuotata" })).toBeInTheDocument();
  });

  it("da un'altra pagina (evento di Impostazioni): porta alla home e fa tutto il tour", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const location = renderAt("/settings", "tab=preferences");
    act(() => {
      window.dispatchEvent(new CustomEvent("swimforge:onboarding:start"));
    });
    await startFromWelcome(user);

    expect(await screen.findByRole("dialog", { name: "Navigazione principale" })).toBeInTheDocument();
    expect(location.history.at(-1)).toBe("/home");
    await act(() => vi.advanceTimersByTimeAsync(1000));
    await user.click(screen.getByRole("button", { name: "Avanti" }));
    expect(screen.getByRole("dialog", { name: "Crea contenuti" })).toHaveTextContent("Passo 2 di 8");

    // Closing it takes the user back where they started.
    await user.click(screen.getByRole("button", { name: "Chiudi" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(location.history.at(-1)).toBe("/settings?tab=preferences");
  });
});
