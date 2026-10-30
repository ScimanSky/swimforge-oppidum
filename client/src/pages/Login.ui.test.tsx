import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import Login from "./Login";

const state = vi.hoisted(() => ({
  signIn: vi.fn(),
  sync: vi.fn(),
  googleNative: vi.fn(),
  oauth: vi.fn(),
  native: false,
  toggleTheme: vi.fn(),
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ isAuthenticated: false, loading: false }) }));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { signInWithPassword: state.signIn, signInWithOAuth: state.oauth } },
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
vi.mock("@/lib/native-auth", () => ({ startNativeGoogleLogin: state.googleNative }));
vi.mock("@/lib/platform", () => ({ isNativePlatform: () => state.native }));
vi.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "dark", toggleTheme: state.toggleTheme, switchable: true }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderLogin() {
  render(
    <Router hook={memoryLocation({ path: "/login" }).hook}>
      <Login />
    </Router>
  );
}

describe("Login (Corsia)", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    state.native = false;
    state.signIn.mockResolvedValue({ data: { session: null }, error: null });
    state.sync.mockResolvedValue({ isNewUser: false });
  });

  it("titolo h1, campi con etichetta e autocompletamento, password mostrabile", async () => {
    renderLogin();
    expect(screen.getByRole("heading", { level: 1, name: "Accedi" })).toBeInTheDocument();
    const email = screen.getByLabelText("Email");
    expect(email).toHaveAttribute("autocomplete", "email");
    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("autocomplete", "current-password");
    expect(password).toHaveAttribute("type", "password");

    const toggle = screen.getByRole("button", { name: "Mostra password" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(password).toHaveAttribute("type", "text");

    expect(screen.getByRole("link", { name: "Password dimenticata?" })).toHaveAttribute("href", "/forgot-password");
    expect(screen.getByRole("link", { name: "Registrati" })).toHaveAttribute("href", "/register");
    expect(screen.getByRole("button", { name: "Passa al tema chiaro" })).toBeInTheDocument();
  });

  it("campi vuoti: errori sotto i campi, letti con il campo, fuoco sul primo", async () => {
    renderLogin();
    await userEvent.click(screen.getByRole("button", { name: "Accedi" }));

    const email = screen.getByLabelText("Email");
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAccessibleDescription("Inserisci l'email.");
    expect(screen.getByLabelText("Password")).toHaveAccessibleDescription("Inserisci la password.");
    expect(email).toHaveFocus();
    expect(state.signIn).not.toHaveBeenCalled();

    await userEvent.type(email, "ada");
    expect(email).not.toHaveAttribute("aria-invalid");
    await userEvent.click(screen.getByRole("button", { name: "Accedi" }));
    expect(email).toHaveAccessibleDescription("Inserisci un'email valida, ad esempio nome@esempio.it.");
  });

  it("credenziali sbagliate: messaggio in italiano annunciato, nessun testo inglese", async () => {
    state.signIn.mockResolvedValue({
      data: { session: null },
      error: { code: "invalid_credentials", message: "Invalid login credentials" },
    });
    renderLogin();
    await userEvent.type(screen.getByLabelText("Email"), "ada@swimforge.it");
    await userEvent.type(screen.getByLabelText("Password"), "sbagliata");
    await userEvent.click(screen.getByRole("button", { name: "Accedi" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Email o password non corretti.");
    expect(screen.queryByText(/Invalid login/)).toBeNull();
    expect(state.signIn).toHaveBeenCalledWith({ email: "ada@swimforge.it", password: "sbagliata" });
    expect(state.sync).not.toHaveBeenCalled();
  });

  it("accesso riuscito: sincronizza la sessione e va alla home; pulsante disattivato durante l'attesa", async () => {
    let resolve!: (value: unknown) => void;
    state.signIn.mockReturnValue(new Promise(r => (resolve = r)));
    window.location.hash = "";
    renderLogin();
    await userEvent.type(screen.getByLabelText("Email"), "ada@swimforge.it");
    await userEvent.type(screen.getByLabelText("Password"), "segreta123");
    await userEvent.click(screen.getByRole("button", { name: "Accedi" }));

    expect(screen.getByRole("button", { name: "Accesso…" })).toBeDisabled();
    resolve({ data: { session: { access_token: "t", user: { id: "u" } } }, error: null });
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith("Login effettuato con successo!"));
    expect(state.sync).toHaveBeenCalledWith(
      { access_token: "t", user: { id: "u" } },
      expect.any(Function),
      { email: "ada@swimforge.it" }
    );
    await vi.waitFor(() => expect(window.location.hash).toBe("#home"));
  });

  it("sessione non sincronizzata: messaggio italiano, non quello del server", async () => {
    state.signIn.mockResolvedValue({ data: { session: { access_token: "t", user: { id: "u" } } }, error: null });
    state.sync.mockRejectedValue(new Error("Failed to create user"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderLogin();
    await userEvent.type(screen.getByLabelText("Email"), "ada@swimforge.it");
    await userEvent.type(screen.getByLabelText("Password"), "segreta123");
    await userEvent.click(screen.getByRole("button", { name: "Accedi" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Accesso non riuscito. Riprova.");
    expect(screen.getByRole("button", { name: "Accedi" })).toBeEnabled();
  });

  it("nell'app Google apre il Custom Tab nativo", async () => {
    state.native = true;
    state.googleNative.mockResolvedValue(undefined);
    renderLogin();
    await userEvent.click(screen.getByRole("button", { name: "Continua con Google" }));
    expect(state.googleNative).toHaveBeenCalledTimes(1);
    expect(state.oauth).not.toHaveBeenCalled();
  });
});
