import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import {
  resetGarminQuickSyncForTests,
  GARMIN_CONNECT_PATH,
  GARMIN_SYNC_TOAST_ID,
  useGarminQuickSync,
} from "./useGarminQuickSync";

const state = vi.hoisted(() => ({
  status: undefined as { connected: boolean } | undefined,
  fetchStatus: vi.fn(),
  mutate: vi.fn(),
  syncOptions: null as any,
  invalidateActivities: vi.fn(),
  invalidateProfile: vi.fn(),
  invalidateInsights: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastLoading: vi.fn(),
  statusOptions: null as any,
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: any[]) => state.toastSuccess(...args),
    error: (...args: any[]) => state.toastError(...args),
    loading: (...args: any[]) => state.toastLoading(...args),
  },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      garmin: { status: { fetch: state.fetchStatus } },
      activities: { list: { invalidate: state.invalidateActivities } },
      profile: { get: { invalidate: state.invalidateProfile } },
      activityInsights: { list: { invalidate: state.invalidateInsights } },
    }),
    garmin: {
      status: {
        useQuery: (_input: unknown, options: any) => {
          state.statusOptions = options;
          return { data: state.status };
        },
      },
      sync: {
        useMutation: (options: any) => {
          state.syncOptions = options;
          return { mutate: state.mutate, isPending: false };
        },
      },
    },
  },
}));

function setupTwo() {
  const location = memoryLocation({ path: "/today", record: true });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Router hook={location.hook}>{children}</Router>
  );
  // The shell («Crea») and the Today screen are mounted together.
  return renderHook(
    () => ({ shell: useGarminQuickSync(), today: useGarminQuickSync({ watchStatus: true }) }),
    { wrapper }
  );
}

function setup(options?: { watchStatus?: boolean }) {
  const location = memoryLocation({ path: "/today", record: true });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Router hook={location.hook}>{children}</Router>
  );
  const hook = renderHook(() => useGarminQuickSync(options), { wrapper });
  return { ...hook, history: location.history! };
}

describe("useGarminQuickSync", () => {
  beforeEach(() => {
    state.status = undefined;
    vi.clearAllMocks();
    state.fetchStatus.mockReset();
  });
  afterEach(() => {
    // The in-flight guard is module-level: reset whatever a test left running.
    act(() => resetGarminQuickSyncForTests());
    cleanup();
  });

  it("collegato: sincronizza gli ultimi 7 giorni", async () => {
    state.status = { connected: true };
    const { result, history } = setup();
    expect(result.current.connected).toBe(true);
    await act(() => result.current.sync());
    expect(state.mutate).toHaveBeenCalledWith({ daysBack: 7 });
    expect(history.at(-1)).toBe("/today");
  });

  it("non collegato: apre le connessioni nelle impostazioni", async () => {
    state.status = { connected: false };
    const { result, history } = setup();
    await act(() => result.current.sync());
    expect(state.mutate).not.toHaveBeenCalled();
    expect(history.at(-1)).toBe(GARMIN_CONNECT_PATH);
  });

  it("stato non ancora caricato: lo chiede prima di decidere", async () => {
    state.fetchStatus.mockResolvedValue({ connected: false });
    const { result, history } = setup();
    expect(result.current.connected).toBeUndefined();
    await act(() => result.current.sync());
    expect(state.fetchStatus).toHaveBeenCalled();
    expect(history.at(-1)).toBe(GARMIN_CONNECT_PATH);
  });

  it("stato non verificabile: avvisa e non naviga", async () => {
    state.fetchStatus.mockRejectedValue(new Error("offline"));
    const { result, history } = setup();
    await act(() => result.current.sync());
    expect(state.toastError).toHaveBeenCalled();
    expect(state.mutate).not.toHaveBeenCalled();
    expect(history.at(-1)).toBe("/today");
  });

  it("doppio tocco: una sola sincronizzazione, anche mentre verifica lo stato", async () => {
    let resolveStatus: (value: { connected: boolean }) => void = () => {};
    state.fetchStatus.mockReturnValue(
      new Promise(resolve => {
        resolveStatus = resolve;
      })
    );
    const { result } = setup();
    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.sync();
      second = result.current.sync();
    });
    resolveStatus({ connected: true });
    await act(async () => {
      await Promise.all([first, second]);
    });
    expect(state.fetchStatus).toHaveBeenCalledTimes(1);
    expect(state.mutate).toHaveBeenCalledTimes(1);

    // Still running: a third tap is ignored; once settled a new sync can start.
    await act(() => result.current.sync());
    expect(state.mutate).toHaveBeenCalledTimes(1);
    act(() => state.syncOptions.onSettled());
    await act(() => result.current.sync());
    expect(state.mutate).toHaveBeenCalledTimes(2);
  });

  it("due istanze (shell e Oggi): una sola sincronizzazione e stato condiviso", async () => {
    state.status = { connected: true };
    const { result } = setupTwo();
    await act(async () => {
      await Promise.all([result.current.shell.sync(), result.current.today.sync()]);
    });
    expect(state.mutate).toHaveBeenCalledTimes(1);
    // Started from one instance, shown as syncing by both.
    expect(result.current.shell.isPending).toBe(true);
    expect(result.current.today.isPending).toBe(true);

    await act(() => result.current.today.sync());
    expect(state.mutate).toHaveBeenCalledTimes(1);

    act(() => state.syncOptions.onSettled());
    expect(result.current.shell.isPending).toBe(false);
    expect(result.current.today.isPending).toBe(false);
    await act(() => result.current.today.sync());
    expect(state.mutate).toHaveBeenCalledTimes(2);
  });

  it("il toast di caricamento è sostituito dall'esito con lo stesso id", async () => {
    state.status = { connected: true };
    const { result } = setup();
    await act(() => result.current.sync());
    expect(state.toastLoading).toHaveBeenCalledWith("Sincronizzazione Garmin…", { id: GARMIN_SYNC_TOAST_ID });

    state.syncOptions.onSuccess({ synced: 3, detectedPbs: [{}] });
    expect(state.toastSuccess).toHaveBeenCalledWith("3 attività sincronizzate!", { id: GARMIN_SYNC_TOAST_ID });
    expect(state.toastSuccess).toHaveBeenCalledWith("Nuovi PB rilevati: 1");
    expect(state.invalidateActivities).toHaveBeenCalled();
    expect(state.invalidateProfile).toHaveBeenCalled();
    // The coach summary of the new swim (Today).
    expect(state.invalidateInsights).toHaveBeenCalled();

    state.syncOptions.onSuccess({ error: "Sessione Garmin scaduta" });
    expect(state.toastError).toHaveBeenCalledWith("Sessione Garmin scaduta", { id: GARMIN_SYNC_TOAST_ID });

    state.syncOptions.onError(new Error("boom"));
    expect(state.toastError).toHaveBeenCalledWith("Errore nella sincronizzazione: boom", {
      id: GARMIN_SYNC_TOAST_ID,
    });
  });

  it("lo stato Garmin si osserva solo dove serve", () => {
    setup();
    expect(state.statusOptions.enabled).toBe(false);
    cleanup();
    setup({ watchStatus: true });
    expect(state.statusOptions.enabled).toBe(true);
  });
});
