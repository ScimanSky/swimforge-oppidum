import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import LegalAcceptance from "./LegalAcceptance";

const state = vi.hoisted(() => ({
  getSession: vi.fn(),
  signOut: vi.fn(),
  sync: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: state.getSession, signOut: state.signOut } },
}));
vi.mock("@/lib/trpc", () => ({
  trpc: { useUtils: () => ({ client: { auth: { syncSupabaseUser: { mutate: vi.fn() } } } }) },
}));
vi.mock("@/lib/auth-sync", () => ({
  LEGAL_ACCEPTANCE: { terms: true, privacy: true, minimumAge: true },
  afterSyncPath: (o: { isNewUser: boolean }) => (o.isNewUser ? "#onboarding" : "#home"),
  syncSupabaseSession: state.sync,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn(), switchable: true }),
}));

// The Radix checkbox measures itself; jsdom has no ResizeObserver.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

const session = { access_token: "t", user: { id: "u" } };

function renderPage() {
  const location = memoryLocation({ path: "/auth/consenso", record: true });
  render(
    <Router hook={location.hook}>
      <LegalAcceptance />
    </Router>,
  );
  return location;
}

describe("LegalAcceptance (/auth/consenso)", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    state.getSession.mockResolvedValue({ data: { session } });
    state.signOut.mockResolvedValue({ error: null });
    state.sync.mockResolvedValue({ isNewUser: true, needsLegalAcceptance: false });
    window.location.hash = "";
  });

  it("asks for Termini, Privacy (with links) and the age, like the registration", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Ancora un passo" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Accetto i Termini di Servizio e la Privacy Policy/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Dichiaro di avere almeno 14 anni" })).not.toBeChecked();
    expect(screen.getByRole("link", { name: "Termini di Servizio" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
  });

  it("records nothing until both boxes are ticked", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("checkbox", { name: /Accetto i Termini/ }));
    await userEvent.click(screen.getByRole("button", { name: "Accetta e continua" }));
    expect(screen.getByRole("checkbox", { name: "Dichiaro di avere almeno 14 anni" })).toHaveAccessibleDescription(
      "Per usare SwimForge devi avere almeno 14 anni.",
    );
    expect(state.sync).not.toHaveBeenCalled();
  });

  it("with both ticked, sends the acceptance and enters the app", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("checkbox", { name: /Accetto i Termini/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Dichiaro di avere almeno 14 anni" }));
    await userEvent.click(screen.getByRole("button", { name: "Accetta e continua" }));
    await vi.waitFor(() => expect(window.location.hash).toBe("#onboarding"));
    expect(state.sync).toHaveBeenCalledWith(session, expect.any(Function), {}, { terms: true, privacy: true, minimumAge: true });
  });

  it("«Annulla» signs out and goes back to the login", async () => {
    const location = renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Annulla" }));
    expect(state.signOut).toHaveBeenCalled();
    await vi.waitFor(() => expect(location.history.at(-1)).toBe("/login"));
  });

  it("without a Google session goes back to the login", async () => {
    state.getSession.mockResolvedValue({ data: { session: null } });
    const location = renderPage();
    await vi.waitFor(() => expect(location.history.at(-1)).toBe("/login"));
  });
});
