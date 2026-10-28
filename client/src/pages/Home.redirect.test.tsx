import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./Home";

const state = vi.hoisted(() => ({
  auth: { isAuthenticated: false, loading: false },
  native: false,
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => state.auth }));
vi.mock("@/lib/platform", () => ({ isNativePlatform: () => state.native }));

describe("Home (/): redirect per piattaforma", () => {
  const originalLocation = window.location;
  const replace = vi.fn();

  beforeEach(() => {
    state.auth = { isAuthenticated: false, loading: false };
    state.native = false;
    replace.mockReset();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, replace },
    });
  });
  afterEach(() => {
    cleanup();
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });

  it("web, autenticato: va al feed", () => {
    state.auth = { isAuthenticated: true, loading: false };
    render(<Home />);
    expect(replace).toHaveBeenCalledWith("/home");
  });

  it("app, autenticato: va a Oggi", () => {
    state.native = true;
    state.auth = { isAuthenticated: true, loading: false };
    render(<Home />);
    expect(replace).toHaveBeenCalledWith("/today");
  });

  it("app, non autenticato: va al login, niente landing", () => {
    state.native = true;
    render(<Home />);
    expect(replace).toHaveBeenCalledWith("/login");
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
  });

  it("web, non autenticato: mostra la landing pubblica", () => {
    render(<Home />);
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("in caricamento non decide nulla", () => {
    state.native = true;
    state.auth = { isAuthenticated: false, loading: true };
    render(<Home />);
    expect(replace).not.toHaveBeenCalled();
  });
});
