import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Settings from "./Settings";
import { GARMIN_SYNC_COUNT_KEY } from "@/lib/garmin-sync-count";

const state = vi.hoisted(() => ({
  syncCalls: [] as Array<Record<string, unknown>>,
  syncOptions: null as any,
  toastSuccess: vi.fn(),
  toastInfo: vi.fn(),
}));

vi.mock("wouter", () => ({
  // wouter 3: the pathname comes from useLocation, the query from useSearch (see useSettingsTab).
  useLocation: () => ["/settings", vi.fn()],
  useSearch: () => "onboarding=1&tab=connections",
  Link: ({ children }: any) => <a>{children}</a>,
}));
vi.mock("sonner", () => ({
  toast: {
    success: (...args: any[]) => state.toastSuccess(...args),
    error: vi.fn(),
    info: (...args: any[]) => state.toastInfo(...args),
  },
}));
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
    useMutation: (options: any) => {
      if (path === "garmin.sync") state.syncOptions = options;
      return {
        mutate: (vars: Record<string, unknown>) => {
          if (path === "garmin.sync") state.syncCalls.push(vars);
        },
        mutateAsync: vi.fn(),
        isPending: false,
      };
    },
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
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("syncs the last 10 swims by default", async () => {
    const user = userEvent.setup();
    render(<Settings />);

    expect(screen.getByRole("radio", { name: "Ultime 10" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Sincronizza le ultime 10" }));

    expect(state.syncCalls).toEqual([{ daysBack: 30, maxActivities: 10 }]);
  });

  it("uses the remembered choice and stores a new one", async () => {
    window.localStorage.setItem(GARMIN_SYNC_COUNT_KEY, "5");
    const user = userEvent.setup();
    render(<Settings />);

    expect(screen.getByRole("radio", { name: "Ultime 5" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "Ultima nuotata" }));
    expect(window.localStorage.getItem(GARMIN_SYNC_COUNT_KEY)).toBe("1");

    await user.click(screen.getByRole("button", { name: "Sincronizza l'ultima nuotata" }));
    expect(state.syncCalls).toEqual([{ daysBack: 30, maxActivities: 1 }]);
  });

  it("says there is nothing new when the sync imports no swims", () => {
    render(<Settings />);

    state.syncOptions.onSuccess({ synced: 0, newXp: 0, detectedPbs: [] });

    expect(state.toastInfo).toHaveBeenCalledWith("Nessuna nuova nuotata da sincronizzare");
    expect(state.toastSuccess).not.toHaveBeenCalled();
  });

  it("still announces the imported swims", () => {
    render(<Settings />);

    state.syncOptions.onSuccess({ synced: 2, newXp: 0, detectedPbs: [] });

    expect(state.toastSuccess).toHaveBeenCalledWith("2 attività sincronizzate!");
  });
});
