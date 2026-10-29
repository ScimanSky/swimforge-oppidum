import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GarminSection from "./GarminSection";
import { GARMIN_SYNC_COUNT_KEY } from "@/lib/garmin-sync-count";

const state = vi.hoisted(() => ({
  syncCalls: [] as Array<Record<string, unknown>>,
  syncOptions: null as any,
  syncPending: false,
  invalidateActivities: vi.fn(),
  invalidateProfile: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: any[]) => state.toastSuccess(...args),
    error: (...args: any[]) => state.toastError(...args),
    info: vi.fn(),
  },
}));

vi.mock("framer-motion", () => ({
  motion: { div: ({ children }: any) => <div>{children}</div> },
}));

vi.mock("@/lib/trpc", () => {
  const idleMutation = () => ({ mutate: vi.fn(), isPending: false });
  return {
    trpc: {
      useUtils: () => ({
        garmin: { status: { invalidate: vi.fn() } },
        activities: { list: { invalidate: state.invalidateActivities } },
        profile: { get: { invalidate: state.invalidateProfile } },
      }),
      garmin: {
        status: { useQuery: () => ({ data: { connected: true, email: "a@b.it" } }) },
        connect: { useMutation: idleMutation },
        completeMfa: { useMutation: idleMutation },
        disconnect: { useMutation: idleMutation },
        sync: {
          useMutation: (options: any) => {
            state.syncOptions = options;
            return {
              mutate: (vars: Record<string, unknown>) => state.syncCalls.push(vars),
              isPending: state.syncPending,
            };
          },
        },
      },
    },
  };
});

describe("GarminSection sync count", () => {
  beforeEach(() => {
    state.syncCalls = [];
    state.syncPending = false;
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("defaults to the last 10 swims", async () => {
    render(<GarminSection garminConnected />);

    expect(screen.getByRole("radio", { name: "Ultime 10" })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Sincronizza le ultime 10" }));

    expect(state.syncCalls).toEqual([{ daysBack: 30, maxActivities: 10 }]);
  });

  it("sends the chosen count and remembers it", async () => {
    render(<GarminSection garminConnected />);

    await userEvent.click(screen.getByRole("radio", { name: "Ultime 5" }));
    expect(screen.getByRole("radio", { name: "Ultime 5" })).toBeChecked();
    expect(window.localStorage.getItem(GARMIN_SYNC_COUNT_KEY)).toBe("5");

    await userEvent.click(screen.getByRole("button", { name: "Sincronizza le ultime 5" }));
    expect(state.syncCalls).toEqual([{ daysBack: 30, maxActivities: 5 }]);
  });

  it("starts from the remembered choice", async () => {
    window.localStorage.setItem(GARMIN_SYNC_COUNT_KEY, "1");
    render(<GarminSection garminConnected />);

    expect(screen.getByRole("radio", { name: "Ultima nuotata" })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Sincronizza l'ultima nuotata" }));

    expect(state.syncCalls).toEqual([{ daysBack: 30, maxActivities: 1 }]);
  });

  it("keeps the same toasts and invalidations on success", () => {
    render(<GarminSection garminConnected />);

    state.syncOptions.onSuccess({ synced: 3, newXp: 0, detectedPbs: [{}, {}] });

    expect(state.toastSuccess).toHaveBeenCalledWith("3 attività sincronizzate!");
    expect(state.toastSuccess).toHaveBeenCalledWith("Nuovi PB rilevati: 2");
    expect(state.invalidateActivities).toHaveBeenCalled();
    expect(state.invalidateProfile).toHaveBeenCalled();
  });

  it("disables the sync while it runs", () => {
    state.syncPending = true;
    render(<GarminSection garminConnected />);

    expect(screen.getByRole("button", { name: /Sincronizzazione/ })).toBeDisabled();
  });
});
