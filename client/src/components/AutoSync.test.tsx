import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { AutoSync } from "./AutoSync";

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ isAuthenticated: false }) }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    sync: { auto: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) } },
    useUtils: () => ({}),
  },
}));

const KEY = "swimforge:autoSync:dashboardReady";

function renderAt(path: string) {
  render(
    <Router hook={memoryLocation({ path }).hook}>
      <AutoSync />
    </Router>
  );
}

describe("AutoSync: pagine che abilitano la sincronizzazione automatica", () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it.each(["/today", "/today/", "/home", "/track", "/dashboard"])("%s la abilita", path => {
    renderAt(path);
    expect(localStorage.getItem(KEY)).toBe("1");
  });

  it("le altre pagine no", () => {
    renderAt("/settings");
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
