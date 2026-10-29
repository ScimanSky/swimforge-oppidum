import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import Home from "./Home";

const state = vi.hoisted(() => ({
  auth: { isAuthenticated: false, loading: false },
  native: false,
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => state.auth }));
vi.mock("@/lib/platform", () => ({ isNativePlatform: () => state.native }));

function renderHome() {
  const location = memoryLocation({ path: "/", record: true });
  render(
    <Router hook={location.hook}>
      <Home />
    </Router>
  );
  return location.history;
}

describe("Home (/): redirect per piattaforma", () => {
  beforeEach(() => {
    state.auth = { isAuthenticated: false, loading: false };
    state.native = false;
  });
  afterEach(cleanup);

  // History of one entry: "/" was replaced, the back button cannot return to it.
  it("web, autenticato: va al feed", () => {
    state.auth = { isAuthenticated: true, loading: false };
    expect(renderHome()).toEqual(["/home"]);
  });

  it("app, autenticato: va a Oggi", () => {
    state.native = true;
    state.auth = { isAuthenticated: true, loading: false };
    expect(renderHome()).toEqual(["/today"]);
  });

  it("app, non autenticato: va al login, niente landing", () => {
    state.native = true;
    expect(renderHome()).toEqual(["/login"]);
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
  });

  it("web, non autenticato: mostra la landing pubblica", () => {
    expect(renderHome()).toEqual(["/"]);
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("in caricamento non decide nulla", () => {
    state.native = true;
    state.auth = { isAuthenticated: false, loading: true };
    expect(renderHome()).toEqual(["/"]);
  });
});
