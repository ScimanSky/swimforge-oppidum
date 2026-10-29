import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import CookieBanner, { openCookiePreferencesPanel } from "./CookieBanner";

const KEY = "swimforge:cookie-consent:v1";

const state = vi.hoisted(() => ({
  me: null as null | { id: number },
  setBulk: vi.fn(),
  pending: false,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    auth: { me: { useQuery: () => ({ data: state.me }) } },
    consent: {
      setBulk: { useMutation: () => ({ mutateAsync: state.setBulk, isPending: state.pending }) },
    },
  },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

function renderBanner() {
  render(
    <Router hook={memoryLocation({ path: "/home" }).hook}>
      <CookieBanner />
    </Router>
  );
}

const stored = () => JSON.parse(window.localStorage.getItem(KEY) ?? "null");

describe("CookieBanner (Corsia)", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    state.me = null;
    state.pending = false;
    state.setBulk.mockResolvedValue({});
  });

  it("alla prima visita: una regione con titolo, tre scelte e il link alla policy", () => {
    renderBanner();
    expect(screen.getByRole("region", { name: "Preferenze cookie" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accetta tutti" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rifiuta opzionali" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Personalizza" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("link", { name: "Cookie Policy" })).toHaveAttribute("href", "/cookies");
  });

  it("tutto in italiano: categorie e testo senza termini inglesi", async () => {
    renderBanner();
    const banner = screen.getByRole("region", { name: "Preferenze cookie" });
    expect(banner).toHaveTextContent("cookie opzionali (analitici e di marketing) solo con il tuo consenso");
    await userEvent.click(screen.getByRole("button", { name: "Personalizza" }));
    expect(screen.getByRole("switch", { name: "Funzionali" })).toHaveAccessibleDescription(
      "Preferenze dell'interfaccia (tema, barra laterale)"
    );
    expect(screen.getByRole("switch", { name: "Cookie analitici" })).toBeInTheDocument();
    expect(banner).not.toHaveTextContent(/analytics|sidebar/i);
  });

  it("già scelto: non compare", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ analytics: false, marketing: false }));
    renderBanner();
    expect(screen.queryByRole("region", { name: "Preferenze cookie" })).toBeNull();
  });

  it("senza account: salva sul dispositivo e chiude", async () => {
    renderBanner();
    await userEvent.click(screen.getByRole("button", { name: "Rifiuta opzionali" }));
    expect(stored()).toMatchObject({ necessary: true, functional: false, analytics: false, marketing: false });
    expect(state.setBulk).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Preferenze cookie" })).toBeNull();
  });

  it("personalizza: interruttori con nome, salva anche sull'account", async () => {
    state.me = { id: 7 };
    renderBanner();
    await userEvent.click(screen.getByRole("button", { name: "Personalizza" }));
    expect(screen.getByRole("switch", { name: "Necessari" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Cookie analitici" })).toHaveAccessibleDescription(
      "Misure aggregate di utilizzo"
    );
    await userEvent.click(screen.getByRole("switch", { name: "Cookie analitici" }));
    await userEvent.click(screen.getByRole("button", { name: "Salva preferenze" }));

    expect(state.setBulk).toHaveBeenCalledWith({
      items: [
        { consentType: "cookie_analytics", granted: true },
        { consentType: "marketing_communications", granted: false },
      ],
    });
    expect(stored()).toMatchObject({ functional: true, analytics: true, marketing: false });
    expect(screen.queryByRole("region", { name: "Preferenze cookie" })).toBeNull();
  });

  it("salvataggio sull'account fallito: lo dice e resta aperto per riprovare", async () => {
    state.me = { id: 7 };
    state.setBulk.mockRejectedValue(Object.assign(new Error("Forbidden"), { data: { code: "FORBIDDEN" } }));
    renderBanner();
    await userEvent.click(screen.getByRole("button", { name: "Accetta tutti" }));

    expect(toast.error).toHaveBeenCalledWith("Impossibile salvare le preferenze sul tuo account. Riprova.");
    expect(screen.getByRole("region", { name: "Preferenze cookie" })).toBeInTheDocument();
    expect(stored()).toMatchObject({ analytics: true, marketing: true });
  });

  it("si riapre da Impostazioni con la personalizzazione aperta", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ functional: true, analytics: true, marketing: false }));
    renderBanner();
    act(() => openCookiePreferencesPanel());
    expect(screen.getByRole("switch", { name: "Cookie analitici" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Marketing" })).not.toBeChecked();
  });
});
