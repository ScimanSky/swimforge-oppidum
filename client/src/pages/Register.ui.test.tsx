import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import Register from "./Register";

const state = vi.hoisted(() => ({
  signUp: vi.fn(),
  sync: vi.fn(),
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ isAuthenticated: false, loading: false }) }));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { signUp: state.signUp, signInWithOAuth: vi.fn() } },
}));
vi.mock("@/lib/trpc", () => ({
  trpc: { useUtils: () => ({ client: { auth: { syncSupabaseUser: { mutate: vi.fn() } } } }) },
}));
// A hash as the target: jsdom follows it (it cannot load another document), so the redirect shows.
vi.mock("@/lib/auth-sync", () => ({
  postLoginPath: (isNew: boolean) => (isNew ? "#onboarding" : "#home"),
  syncSupabaseSession: state.sync,
}));
vi.mock("@/lib/public-url", () => ({ publicSiteUrl: (path: string) => `https://swimforge.it${path}` }));
vi.mock("@/lib/native-auth", () => ({ startNativeGoogleLogin: vi.fn() }));
vi.mock("@/lib/platform", () => ({ isNativePlatform: () => false }));
vi.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn(), switchable: true }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// The Radix checkbox measures itself; jsdom has no ResizeObserver.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

function renderRegister() {
  render(
    <Router hook={memoryLocation({ path: "/register" }).hook}>
      <Register />
    </Router>
  );
}

async function fillValidForm() {
  await userEvent.type(screen.getByLabelText("Nome"), "Ada");
  await userEvent.type(screen.getByLabelText("Cognome"), "Lovelace");
  await userEvent.type(screen.getByLabelText("Email"), "ada@swimforge.it");
  await userEvent.type(screen.getByLabelText("Password"), "segreta123");
  await userEvent.click(screen.getByRole("checkbox"));
}

describe("Register (Corsia)", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    state.signUp.mockResolvedValue({ data: { session: null }, error: null });
    state.sync.mockResolvedValue({ isNewUser: true });
  });

  it("un solo passo: h1, campi con etichetta e autocompletamento", () => {
    renderRegister();
    expect(screen.getByRole("heading", { level: 1, name: "Crea account" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nome")).toHaveAttribute("autocomplete", "given-name");
    expect(screen.getByLabelText("Cognome")).toHaveAttribute("autocomplete", "family-name");
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "email");
    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("autocomplete", "new-password");
    expect(password).toHaveAccessibleDescription("Almeno 8 caratteri.");
    expect(screen.getByRole("checkbox", { name: /Accetto i Termini di Servizio e la Privacy Policy/ })).not.toBeChecked();
    expect(screen.queryByText("Livello Esperienza")).toBeNull();
    expect(screen.getByRole("button", { name: "Passa al tema scuro" })).toBeInTheDocument();
  });

  it("errori sotto i campi, fuoco sul primo, niente registrazione", async () => {
    renderRegister();
    await userEvent.type(screen.getByLabelText("Nome"), "Ada");
    await userEvent.type(screen.getByLabelText("Password"), "corta");
    await userEvent.click(screen.getByRole("button", { name: "Crea account" }));

    expect(screen.getByLabelText("Cognome")).toHaveFocus();
    expect(screen.getByLabelText("Cognome")).toHaveAccessibleDescription("Inserisci il cognome.");
    expect(screen.getByLabelText("Email")).toHaveAccessibleDescription("Inserisci l'email.");
    expect(screen.getByLabelText("Password")).toHaveAccessibleDescription(
      "La password deve avere almeno 8 caratteri. Almeno 8 caratteri."
    );
    expect(screen.getByRole("checkbox")).toHaveAccessibleDescription(
      "Accetta i Termini di Servizio e la Privacy Policy per continuare."
    );
    expect(state.signUp).not.toHaveBeenCalled();
  });

  it("registrazione con conferma via email: mostra dove l'abbiamo mandata", async () => {
    renderRegister();
    await fillValidForm();
    await userEvent.click(screen.getByRole("button", { name: "Crea account" }));

    expect(state.signUp).toHaveBeenCalledWith({
      email: "ada@swimforge.it",
      password: "segreta123",
      options: {
        emailRedirectTo: "https://swimforge.it/auth/callback",
        data: { full_name: "Ada Lovelace", name: "Ada Lovelace" },
      },
    });
    expect(await screen.findByRole("heading", { level: 1, name: "Controlla la tua email" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("ada@swimforge.it");
    expect(screen.getByRole("link", { name: "Vai al login" })).toHaveAttribute("href", "/login");
  });

  it("registrazione con sessione immediata: sincronizza e va all'onboarding", async () => {
    state.signUp.mockResolvedValue({ data: { session: { access_token: "t", user: { id: "u" } } }, error: null });
    window.location.hash = "";
    renderRegister();
    await fillValidForm();
    await userEvent.click(screen.getByRole("button", { name: "Crea account" }));

    await vi.waitFor(() => expect(window.location.hash).toBe("#onboarding"));
    expect(state.sync).toHaveBeenCalledWith(
      { access_token: "t", user: { id: "u" } },
      expect.any(Function),
      { email: "ada@swimforge.it", name: "Ada Lovelace" }
    );
  });

  it("email già registrata: messaggio italiano annunciato", async () => {
    state.signUp.mockResolvedValue({
      data: { session: null },
      error: { code: "user_already_exists", message: "User already registered" },
    });
    renderRegister();
    await fillValidForm();
    await userEvent.click(screen.getByRole("button", { name: "Crea account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Esiste già un account con questa email: accedi.");
    expect(screen.getByRole("button", { name: "Crea account" })).toBeEnabled();
  });
});
