import { createElement, type ComponentType } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import ForgotPassword from "./ForgotPassword";
import ResetPassword from "./ResetPassword";

const state = vi.hoisted(() => ({
  resetForEmail: vi.fn(),
  getSession: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  authListener: null as null | ((event: string, session: unknown) => void),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: state.resetForEmail,
      getSession: state.getSession,
      updateUser: state.updateUser,
      signOut: state.signOut,
      onAuthStateChange: (listener: (event: string, session: unknown) => void) => {
        state.authListener = listener;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
  },
}));
vi.mock("@/lib/public-url", () => ({ publicSiteUrl: (path: string) => `https://swimforge.it${path}` }));
vi.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "dark", toggleTheme: vi.fn(), switchable: true }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderAt(path: string, page: ComponentType) {
  render(
    <Router hook={memoryLocation({ path }).hook}>
      {createElement(page)}
    </Router>
  );
}

describe("ForgotPassword (Corsia)", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    state.resetForEmail.mockResolvedValue({ error: null });
  });

  it("email mancante: errore sotto il campo e fuoco, niente invio", async () => {
    renderAt("/forgot-password", ForgotPassword);
    expect(screen.getByRole("heading", { level: 1, name: "Password dimenticata" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Invia link" }));
    const email = screen.getByLabelText("Email");
    expect(email).toHaveFocus();
    expect(email).toHaveAccessibleDescription("Inserisci l'email.");
    expect(state.resetForEmail).not.toHaveBeenCalled();
  });

  it("invia il link e conferma dove", async () => {
    renderAt("/forgot-password", ForgotPassword);
    const email = screen.getByLabelText("Email");
    expect(email).toHaveAttribute("autocomplete", "email");
    await userEvent.type(email, " ada@swimforge.it ");
    await userEvent.click(screen.getByRole("button", { name: "Invia link" }));

    expect(state.resetForEmail).toHaveBeenCalledWith("ada@swimforge.it", {
      redirectTo: "https://swimforge.it/reset-password",
    });
    expect(await screen.findByRole("heading", { level: 1, name: "Controlla la tua email" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("ada@swimforge.it");
    expect(screen.getByRole("link", { name: "Torna al login" })).toHaveAttribute("href", "/login");
  });

  it("troppe richieste: messaggio italiano annunciato", async () => {
    state.resetForEmail.mockResolvedValue({
      error: { code: "over_email_send_rate_limit", message: "email rate limit exceeded" },
    });
    renderAt("/forgot-password", ForgotPassword);
    await userEvent.type(screen.getByLabelText("Email"), "ada@swimforge.it");
    await userEvent.click(screen.getByRole("button", { name: "Invia link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Troppe email inviate: riprova tra qualche minuto.");
  });
});

describe("ResetPassword (Corsia)", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    state.getSession.mockResolvedValue({ data: { session: { user: { id: "u" } } } });
    state.updateUser.mockResolvedValue({ error: null });
    state.signOut.mockResolvedValue({});
  });

  it("verifica il link, poi il modulo con due password distinte", async () => {
    renderAt("/reset-password", ResetPassword);
    expect(screen.getByRole("status")).toHaveTextContent("Verifica del link in corso…");
    expect(await screen.findByLabelText("Nuova password")).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByLabelText("Conferma password")).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByRole("button", { name: "Mostra password" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mostra la conferma della password" })).toBeInTheDocument();
  });

  it("link scaduto: lo dice e offre un nuovo link", async () => {
    state.getSession.mockResolvedValue({ data: { session: null } });
    renderAt("/reset-password", ResetPassword);
    expect(await screen.findByRole("heading", { level: 1, name: "Link non valido" })).toBeInTheDocument();
    expect(screen.getByText("Il link non è valido o è scaduto.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Richiedi un nuovo link" })).toHaveAttribute("href", "/forgot-password");
  });

  it("l'evento PASSWORD_RECOVERY apre il modulo", async () => {
    state.getSession.mockResolvedValue({ data: { session: null } });
    renderAt("/reset-password", ResetPassword);
    await screen.findByRole("heading", { name: "Link non valido" });
    act(() => state.authListener?.("PASSWORD_RECOVERY", { user: { id: "u" } }));
    expect(screen.getByLabelText("Nuova password")).toBeInTheDocument();
  });

  it("password corta e conferma diversa: errori sotto i campi, nessun aggiornamento", async () => {
    renderAt("/reset-password", ResetPassword);
    await userEvent.type(await screen.findByLabelText("Nuova password"), "corta");
    await userEvent.type(screen.getByLabelText("Conferma password"), "altra");
    await userEvent.click(screen.getByRole("button", { name: "Aggiorna password" }));

    const password = screen.getByLabelText("Nuova password");
    expect(password).toHaveFocus();
    expect(password).toHaveAccessibleDescription("La password deve avere almeno 8 caratteri. Almeno 8 caratteri.");
    expect(screen.getByLabelText("Conferma password")).toHaveAccessibleDescription("Le password non coincidono.");
    expect(state.updateUser).not.toHaveBeenCalled();
  });

  it("aggiorna la password ed esce", async () => {
    renderAt("/reset-password", ResetPassword);
    await userEvent.type(await screen.findByLabelText("Nuova password"), "nuova-segreta");
    await userEvent.type(screen.getByLabelText("Conferma password"), "nuova-segreta");
    await userEvent.click(screen.getByRole("button", { name: "Aggiorna password" }));

    expect(state.updateUser).toHaveBeenCalledWith({ password: "nuova-segreta" });
    await vi.waitFor(() => expect(state.signOut).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith("Password aggiornata. Effettua il login.");
  });

  it("stessa password di prima: messaggio italiano annunciato", async () => {
    state.updateUser.mockResolvedValue({ error: { code: "same_password", message: "New password should be different" } });
    renderAt("/reset-password", ResetPassword);
    await userEvent.type(await screen.findByLabelText("Nuova password"), "nuova-segreta");
    await userEvent.type(screen.getByLabelText("Conferma password"), "nuova-segreta");
    await userEvent.click(screen.getByRole("button", { name: "Aggiorna password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La nuova password deve essere diversa da quella attuale."
    );
    expect(state.signOut).not.toHaveBeenCalled();
  });
});
