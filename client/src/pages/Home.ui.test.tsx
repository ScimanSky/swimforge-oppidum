import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import Home from "./Home";

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ isAuthenticated: false, loading: false }) }));
vi.mock("@/lib/platform", () => ({ isNativePlatform: () => false }));

function renderLanding() {
  render(
    <Router hook={memoryLocation({ path: "/" }).hook}>
      <Home />
    </Router>
  );
}

describe("Home: landing pubblica (Corsia)", () => {
  afterEach(cleanup);

  it("un h1, sezioni h2 in italiano, nessuna etichetta inglese", () => {
    renderLanding();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Nuota con dati chiari.Vinci con costanza.");
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Un solo sistema per migliorare, competere e condividere.",
      "Sincronizza. Analizza. Sfida. Club.",
      "Dalla vasca alla classifica, ogni dato produce azione.",
      "Smetti di allenarti a tentativi.",
    ]);
    for (const english of ["Final CTA", "Performance Platform", "Proof di Risultato", "Session XP", "AI Coach"]) {
      expect(screen.queryByText(english)).toBeNull();
    }
  });

  it("le azioni sono link: registrati e accedi", () => {
    renderLanding();
    const header = screen.getByRole("banner");
    expect(within(header).getByRole("link", { name: "Accedi" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Inizia ora" })).toHaveAttribute("href", "/signup");
    expect(screen.getByRole("link", { name: "Crea account" })).toHaveAttribute("href", "/signup");
    const sections = screen.getByRole("navigation", { name: "Sezioni" });
    expect(within(sections).getByRole("link", { name: "Perché SwimForge" })).toHaveAttribute("href", "#value");
  });

  it("le foto hanno un testo alternativo e le didascalie stanno sotto, non sopra", () => {
    renderLanding();
    for (const image of screen.getAllByRole("img")) {
      expect(image).toHaveAccessibleName();
    }
    expect(screen.getByText("Passo più stabile").closest("figcaption")).toBeInTheDocument();
  });

  it("i documenti legali nel piè di pagina", () => {
    renderLanding();
    const legal = screen.getByRole("navigation", { name: "Documenti legali" });
    expect(within(legal).getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(within(legal).getByRole("link", { name: "Termini" })).toHaveAttribute("href", "/terms");
    expect(within(legal).getByRole("link", { name: "Cookie" })).toHaveAttribute("href", "/cookies");
  });
});
