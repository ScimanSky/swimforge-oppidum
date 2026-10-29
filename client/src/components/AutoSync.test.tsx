import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { AutoSync } from "./AutoSync";

const state = vi.hoisted(() => ({
  isAuthenticated: false,
  mutate: vi.fn(),
  /** Paths invalidated through useUtils («statistics», «activities.list»…). */
  invalidated: [] as string[],
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ isAuthenticated: state.isAuthenticated }) }));
vi.mock("sonner", () => ({ toast: { loading: vi.fn(() => "toast"), success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/trpc", () => {
  const invalidate = (path: string) => () => {
    state.invalidated.push(path);
    return Promise.resolve();
  };
  // utils.<router>.invalidate() and utils.<router>.<procedure>.invalidate().
  const utils = new Proxy(
    {},
    {
      get: (_target, router: string) =>
        new Proxy(
          {},
          {
            get: (_t, name: string) =>
              name === "invalidate" ? invalidate(router) : { invalidate: invalidate(`${router}.${name}`) },
          },
        ),
    },
  );
  return {
    trpc: {
      sync: { auto: { useMutation: () => ({ mutate: state.mutate, isPending: false }) } },
      useUtils: () => utils,
    },
  };
});

const KEY = "swimforge:autoSync:dashboardReady";

function renderAt(path: string) {
  render(
    <Router hook={memoryLocation({ path }).hook}>
      <AutoSync />
    </Router>
  );
}

describe("AutoSync: pagine che abilitano la sincronizzazione automatica", () => {
  beforeEach(() => {
    localStorage.clear();
    state.isAuthenticated = false;
  });
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

describe("AutoSync: dopo la sincronizzazione", () => {
  beforeEach(() => {
    localStorage.clear();
    state.isAuthenticated = true;
    state.invalidated = [];
    state.mutate.mockClear();
  });
  afterEach(cleanup);

  it("aggiorna nuotate, profilo, badge, metriche di nuoto e record", () => {
    renderAt("/today");
    expect(state.mutate).toHaveBeenCalledTimes(1);
    const [, options] = state.mutate.mock.calls[0] as [unknown, { onSuccess: () => void }];

    options.onSuccess();

    expect(state.invalidated).toEqual(
      expect.arrayContaining(["activities.list", "profile.get", "badges.userBadges", "statistics", "records"]),
    );
  });
});
