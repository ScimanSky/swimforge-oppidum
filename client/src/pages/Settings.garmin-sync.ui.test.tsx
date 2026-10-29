import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Settings from "./Settings";
import { GARMIN_SYNC_COUNT_KEY } from "@/lib/garmin-sync-count";

const state = vi.hoisted(() => ({ syncCalls: [] as Array<Record<string, unknown>> }));

vi.mock("wouter", () => ({
  useLocation: () => ["/settings?onboarding=1&tab=connections", vi.fn()],
  Link: ({ children }: any) => <a>{children}</a>,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/components/AppLayout", () => ({ default: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/components/GarminSection", () => ({ default: () => null }));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { signOut: vi.fn() } } }));
vi.mock("@/lib/push", () => ({ registerPushToken: vi.fn(), unregisterPushToken: vi.fn() }));

vi.mock("@/lib/trpc", () => {
  const queryData: Record<string, unknown> = {
    "garmin.status": { connected: true },
    "consent.list": [],
    "activities.list": [],
  };
  const procedure = (path: string): any => ({
    useQuery: () => ({ data: queryData[path], isLoading: false, refetch: vi.fn() }),
    useMutation: () => ({
      mutate: (vars: Record<string, unknown>) => {
        if (path === "garmin.sync") state.syncCalls.push(vars);
      },
      mutateAsync: vi.fn(),
      isPending: false,
    }),
    invalidate: vi.fn(),
  });
  const utils: any = new Proxy({}, { get: () => new Proxy({}, { get: () => procedure("utils") }) });
  return {
    trpc: new Proxy(
      {},
      {
        get: (_target, router: string) => {
          if (router === "useUtils" || router === "useContext") return () => utils;
          return new Proxy({}, { get: (_t, name: string) => procedure(`${router}.${name}`) });
        },
      },
    ),
  };
});

describe("Settings onboarding Garmin sync", () => {
  beforeEach(() => {
    state.syncCalls = [];
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("syncs the last 10 swims by default", async () => {
    render(<Settings />);

    expect(screen.getByRole("radio", { name: "Ultime 10" })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Sincronizza le ultime 10" }));

    expect(state.syncCalls).toEqual([{ daysBack: 30, maxActivities: 10 }]);
  }, 15000);

  it("uses the remembered choice and stores a new one", async () => {
    window.localStorage.setItem(GARMIN_SYNC_COUNT_KEY, "5");
    render(<Settings />);

    expect(screen.getByRole("radio", { name: "Ultime 5" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "Ultima nuotata" }));
    expect(window.localStorage.getItem(GARMIN_SYNC_COUNT_KEY)).toBe("1");

    await userEvent.click(screen.getByRole("button", { name: "Sincronizza l'ultima nuotata" }));
    expect(state.syncCalls).toEqual([{ daysBack: 30, maxActivities: 1 }]);
  }, 15000);
});
