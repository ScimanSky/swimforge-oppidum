import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { AppRoutes } from "./App";

vi.mock("./components/app/ShellRoutes", () => ({
  default: () => <header data-testid="shell">shell</header>,
}));
vi.mock("./pages/Privacy", () => ({ default: () => <p>privacy</p> }));
vi.mock("./pages/Login", () => ({ default: () => <p>login</p> }));

function renderAt(path: string) {
  render(
    <Router hook={memoryLocation({ path }).hook}>
      <AppRoutes />
    </Router>
  );
}

describe("AppRoutes: pagine pubbliche e shell", () => {
  afterEach(cleanup);

  it.each([
    ["/privacy", "privacy"],
    ["/login", "login"],
  ])("%s è pubblica: niente shell", async (path, text) => {
    renderAt(path);
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.queryByTestId("shell")).not.toBeInTheDocument();
  });

  it.each(["/today", "/goals", "/community/club/3", "/non-esiste"])("%s va nella shell", async path => {
    renderAt(path);
    expect(await screen.findByTestId("shell")).toBeInTheDocument();
  });
});
