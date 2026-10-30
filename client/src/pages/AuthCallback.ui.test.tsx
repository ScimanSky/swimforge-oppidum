import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import AuthCallback from "./AuthCallback";

const state = vi.hoisted(() => ({
  getSession: vi.fn(),
  exchange: vi.fn(),
  setSession: vi.fn(),
  sync: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: state.getSession,
      exchangeCodeForSession: state.exchange,
      setSession: state.setSession,
    },
  },
}));
vi.mock("@/lib/trpc", () => ({
  trpc: { useUtils: () => ({ client: { auth: { syncSupabaseUser: { mutate: vi.fn() } } } }) },
}));
// A hash as the target: jsdom follows it (it cannot load another document), so the redirect shows.
vi.mock("@/lib/auth-sync", () => ({
  postLoginPath: (isNew: boolean) => (isNew ? "#onboarding" : "#home"),
  afterSyncPath: (o: { isNewUser: boolean; needsLegalAcceptance?: boolean }) =>
    o.needsLegalAcceptance ? "#consenso" : o.isNewUser ? "#onboarding" : "#home",
  LEGAL_ACCEPTANCE: { terms: true, privacy: true, minimumAge: true },
  LEGAL_ACCEPTANCE_METADATA_KEY: "swimforge_legal_acceptance",
  syncSupabaseSession: state.sync,
}));
vi.mock("@/components/AppLayout", () => ({ AppLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const session = { access_token: "t", user: { id: "u" } };

function renderCallback(search = "") {
  window.history.replaceState({}, "", `/auth/callback${search}`);
  const location = memoryLocation({ path: "/auth/callback", record: true });
  const { unmount } = render(
    <Router hook={location.hook}>
      <AuthCallback />
    </Router>
  );
  return Object.assign(location, { unmount });
}

describe("AuthCallback (Corsia)", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    state.getSession.mockResolvedValue({ data: { session } });
    state.sync.mockResolvedValue({ isNewUser: false });
    window.location.hash = "";
  });

  it("mostra l'attesa, poi completa l'accesso e va alla home", async () => {
    renderCallback("?code=abc");
    expect(screen.getByRole("heading", { level: 1, name: "Accesso in corso…" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 1, name: "Accesso completato" })).toBeInTheDocument();
    expect(state.sync).toHaveBeenCalledWith(session, expect.any(Function));
    await vi.waitFor(() => expect(window.location.hash).toBe("#home"), { timeout: 2000 });
  });

  it("primo accesso con Google senza Termini accettati: va al passo di accettazione", async () => {
    state.sync.mockResolvedValue({ isNewUser: true, needsLegalAcceptance: true });
    const location = renderCallback("?code=abc");
    await vi.waitFor(() => expect(location.history.at(-1)).toBe("#consenso"));
    expect(screen.queryByRole("heading", { level: 1, name: "Accesso completato" })).toBeNull();
  });

  it("link di conferma aperto in un altro browser: email confermata, vai al login", async () => {
    vi.useFakeTimers();
    state.getSession.mockResolvedValue({ data: { session: null } });
    state.exchange.mockResolvedValue({
      data: { session: null },
      error: { message: "PKCE code verifier not found in storage" },
    });
    renderCallback("?code=abc");
    await act(() => vi.advanceTimersByTimeAsync(5000));

    expect(screen.getByRole("heading", { level: 1, name: "Email confermata" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Vai al login" })).toHaveAttribute("href", "/login");
    expect(state.sync).not.toHaveBeenCalled();
  });

  it("sessione non sincronizzata: errore in italiano, mai il testo del server", async () => {
    state.sync.mockRejectedValue(new Error("Failed to create user"));
    renderCallback("?code=abc");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Accesso non riuscito");
    expect(alert).toHaveTextContent("Accesso non riuscito. Riprova.");
    expect(screen.queryByText(/Failed to create user/)).toBeNull();
    expect(screen.getByRole("link", { name: "Vai al login" })).toBeInTheDocument();
  });

  it("errore di Supabase: messaggio italiano, poi torna al login", async () => {
    vi.useFakeTimers();
    state.setSession.mockResolvedValue({
      data: { session: null },
      error: { code: "otp_expired", message: "Email link is invalid or has expired" },
    });
    const location = renderCallback("#access_token=a&refresh_token=b");
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(screen.getByRole("alert")).toHaveTextContent("Il link è scaduto: richiedine uno nuovo.");
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(location.history.at(-1)).toBe("/login");
  });

  it("lasciata la pagina prima dei 3 secondi: nessun ritorno al login dopo", async () => {
    vi.useFakeTimers();
    state.setSession.mockResolvedValue({
      data: { session: null },
      error: { code: "otp_expired", message: "Email link is invalid or has expired" },
    });
    const location = renderCallback("#access_token=a&refresh_token=b");
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByRole("alert")).toBeInTheDocument();

    location.unmount();
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(location.history).toEqual(["/auth/callback"]);
  });

  it("lasciata la pagina mentre aspetta la sessione: nessun ritorno al login dopo", async () => {
    vi.useFakeTimers();
    state.getSession.mockResolvedValue({ data: { session: null } });
    const location = renderCallback();
    location.unmount();
    // The wait for the session runs out after the page is gone: no timer may start then.
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(location.history).toEqual(["/auth/callback"]);
  });
});
