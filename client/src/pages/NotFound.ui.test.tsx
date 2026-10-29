import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import NotFound from "./NotFound";

const state = vi.hoisted(() => ({ native: false }));

vi.mock("@/lib/platform", () => ({ isNativePlatform: () => state.native }));
vi.mock("@/components/AppLayout", () => ({ AppLayout: ({ children }: any) => <div>{children}</div> }));

function renderNotFound() {
  const location = memoryLocation({ path: "/non-esiste", record: true });
  render(
    <Router hook={location.hook}>
      <NotFound />
    </Router>
  );
  return location;
}

describe("NotFound (Corsia)", () => {
  afterEach(cleanup);

  it("sotto il titolo della shell: un h2, nessun h1, e il link alla home", async () => {
    state.native = false;
    const location = renderNotFound();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Pagina non trovata" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Torna alla home" }));
    expect(location.history.at(-1)).toBe("/home");
  });

  it("nell'app la home è Oggi", () => {
    state.native = true;
    renderNotFound();
    expect(screen.getByRole("link", { name: "Torna alla home" })).toHaveAttribute("href", "/today");
  });
});
