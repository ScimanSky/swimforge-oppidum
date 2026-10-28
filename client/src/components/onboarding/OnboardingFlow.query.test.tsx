import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import OnboardingFlow from "./OnboardingFlow";
import { setOnboardingCompletedLocally } from "@/lib/onboarding";

vi.mock("@remotion/player", () => ({ Player: () => null }));
vi.mock("./OnboardingWelcomeComposition", () => ({
  OnboardingWelcomeComposition: () => null,
  ONBOARDING_WELCOME_DURATION_FRAMES: 30,
  ONBOARDING_WELCOME_FPS: 30,
  ONBOARDING_WELCOME_HEIGHT: 720,
  ONBOARDING_WELCOME_WIDTH: 1280,
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
  const location = memoryLocation({ path, searchPath });
  render(
    <Router hook={location.hook} searchHook={location.searchHook}>
      <OnboardingFlow />
    </Router>
  );
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
