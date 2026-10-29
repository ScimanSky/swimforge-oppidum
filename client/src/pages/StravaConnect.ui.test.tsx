import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import StravaConnect from "./StravaConnect";

type MutationOptions = { onSuccess: () => void; onError: (error: { message: string }) => void };

const state = vi.hoisted(() => ({
  mutate: vi.fn(),
  options: null as MutationOptions | null,
}));

vi.mock("../lib/trpc", () => ({
  trpc: {
    strava: {
      exchangeToken: {
        useMutation: (options: MutationOptions) => {
          state.options = options;
          return { mutate: state.mutate };
        },
      },
    },
  },
}));
vi.mock("@/components/AppLayout", () => ({ AppLayout: ({ children }: any) => <div>{children}</div> }));

function renderPage(search: string) {
  window.history.replaceState({}, "", `/strava/callback${search}`);
  const location = memoryLocation({ path: "/strava/callback", record: true });
  render(
    <Router hook={location.hook}>
      <StravaConnect />
    </Router>
  );
  return location;
}

describe("StravaConnect (Corsia)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.options = null;
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("scambia il codice, poi conferma e torna alla home dopo 2 secondi", () => {
    vi.useFakeTimers();
    const location = renderPage("?code=abc");
    expect(screen.getByRole("heading", { level: 1, name: "Connessione a Strava..." })).toBeInTheDocument();
    expect(state.mutate).toHaveBeenCalledWith({ code: "abc" });

    act(() => state.options!.onSuccess());
    expect(screen.getByRole("heading", { level: 1, name: "Connesso!" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Account Strava connesso con successo!");
    expect(location.history.at(-1)).toBe("/strava/callback");

    act(() => vi.advanceTimersByTime(2000));
    expect(location.history.at(-1)).toBe("/home");
  });

  it("autorizzazione negata: errore senza scambio, con Impostazioni e Home", () => {
    const location = renderPage("?error=access_denied");
    expect(state.mutate).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 1, name: "Errore" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Autorizzazione Strava negata");

    fireEvent.click(screen.getByRole("button", { name: "Impostazioni" }));
    expect(location.history.at(-1)).toBe("/settings");
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    expect(location.history.at(-1)).toBe("/home");
  });

  it("codice mancante o scambio fallito: il messaggio dell'errore", () => {
    renderPage("");
    expect(screen.getByRole("alert")).toHaveTextContent("Codice di autorizzazione mancante");
    cleanup();

    renderPage("?code=abc");
    act(() => state.options!.onError({ message: "" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Errore durante la connessione a Strava");
  });

  it("superficie Corsia: card a token, nessun colore fisso", () => {
    renderPage("?error=access_denied");
    const card = screen.getByRole("heading", { level: 1 }).closest(".surface-panel");
    expect(card).not.toBeNull();
    expect(card!.innerHTML).not.toMatch(/backdrop-blur|text-white|bg-gray-|bg-blue-|text-orange-|oklch\(/);
  });
});
