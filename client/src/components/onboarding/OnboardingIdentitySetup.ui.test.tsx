import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingIdentitySetup } from "./OnboardingIdentitySetup";

const state = vi.hoisted(() => ({ motionProps: [] as Array<Record<string, unknown>> }));

// No animations in jsdom; the step props are kept to check the reduced-motion variant.
vi.mock("framer-motion", () => {
  const strip = ({ children, initial, animate, exit, transition, ...rest }: any) => {
    state.motionProps.push({ initial, animate, exit, transition });
    return <div {...rest}>{children}</div>;
  };
  return {
    motion: new Proxy({}, { get: () => strip }),
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  };
});
vi.mock("@/lib/trpc", () => ({
  trpc: { profile: { update: { useMutation: () => ({ mutateAsync: async () => {} }) } } },
}));

function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query === "(prefers-reduced-motion: reduce)",
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe("OnboardingIdentitySetup", () => {
  beforeEach(() => {
    state.motionProps = [];
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("il titolo del passo prende il fuoco una volta sola: un nuovo render non lo ruba", async () => {
    const user = userEvent.setup();
    const props = { userId: "7", onComplete: vi.fn(), onSkip: vi.fn() };
    const { rerender } = render(<OnboardingIdentitySetup {...props} />);

    await user.click(screen.getByRole("button", { name: /Atleta/ }));
    expect(screen.getByRole("heading", { name: "Stile preferito" })).toHaveFocus();

    await user.tab();
    await user.tab();
    const backstroke = screen.getByRole("button", { name: "Dorso" });
    expect(backstroke).toHaveFocus();

    // The dialog around it re-renders (a refetch, a timer): the focus stays where the user put it.
    rerender(<OnboardingIdentitySetup {...props} onSkip={vi.fn()} />);
    expect(backstroke).toHaveFocus();
  });

  it("con il movimento ridotto i passi cambiano senza scorrere", async () => {
    mockReducedMotion(true);
    const user = userEvent.setup();
    render(<OnboardingIdentitySetup userId="7" onComplete={vi.fn()} onSkip={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Atleta/ }));

    expect(screen.getByRole("heading", { name: "Stile preferito" })).toBeInTheDocument();
    const slides = state.motionProps.filter((props) => JSON.stringify(props).includes('"x"'));
    expect(slides).toEqual([]);
  });

  it("senza preferenze di movimento i passi scorrono di lato", () => {
    mockReducedMotion(false);
    render(<OnboardingIdentitySetup userId="7" onComplete={vi.fn()} onSkip={vi.fn()} />);
    expect(state.motionProps.at(-1)).toMatchObject({ initial: { opacity: 0, x: 24 } });
  });
});
