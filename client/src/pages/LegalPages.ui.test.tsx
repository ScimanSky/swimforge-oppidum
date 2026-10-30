import { createElement, type ComponentType } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import CookiePolicy from "./CookiePolicy";
import Privacy from "./Privacy";
import Terms from "./Terms";

vi.mock("@/components/AppLayout", () => ({ default: ({ children }: any) => <div>{children}</div> }));

function renderPage(page: ComponentType) {
  render(
    <Router hook={memoryLocation({ path: "/privacy" }).hook}>
      {createElement(page)}
    </Router>
  );
}

describe("Pagine legali (Corsia)", () => {
  afterEach(cleanup);

  it.each([
    [Privacy, "Privacy Policy di SwimForge", "In breve"],
    [Terms, "Termini di Servizio di SwimForge", "1. Accettazione dei Termini"],
    [CookiePolicy, "Cookie Policy di SwimForge", "1. Cosa sono i cookie"],
  ])("%#: il titolo del documento è l'h1, le sezioni sono h2", (page, title, firstSection) => {
    renderPage(page);
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual([title]);
    expect(screen.getAllByRole("heading", { level: 2 })[0]).toHaveTextContent(firstSection);
    expect(screen.getByRole("link", { name: "Torna alla home" })).toHaveAttribute("href", "/");
  });

  it("niente simboli Markdown letterali: «####» diventa un titolo e «---» una riga", () => {
    renderPage(Privacy);
    expect(screen.getByRole("heading", { level: 4, name: "Garmin Connect" })).toBeInTheDocument();
    expect(screen.queryByText(/^#+ /)).toBeNull();
    expect(screen.queryByText("---")).toBeNull();
    expect(screen.getAllByRole("separator").length).toBeGreaterThan(0);
  });
});
