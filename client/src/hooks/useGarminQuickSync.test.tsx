import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { GARMIN_CONNECT_PATH, useGarminQuickSync } from "./useGarminQuickSync";

const state = vi.hoisted(() => ({
  status: undefined as { connected: boolean } | undefined,
  fetchStatus: vi.fn(),
  mutate: vi.fn(),
  isPending: false,
  syncOptions: null as any,
  invalidateActivities: vi.fn(),
  invalidateProfile: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: any[]) => state.toastSuccess(...args),
    error: (...args: any[]) => state.toastError(...args),
  },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      garmin: { status: { fetch: state.fetchStatus } },
      activities: { list: { invalidate: state.invalidateActivities } },
      profile: { get: { invalidate: state.invalidateProfile } },
    }),
    garmin: {
      status: { useQuery: () => ({ data: state.status }) },
      sync: {
        useMutation: (options: any) => {
          state.syncOptions = options;
          return { mutate: state.mutate, isPending: state.isPending };
        },
      },
    },
  },
}));

function setup() {
  const location = memoryLocation({ path: "/today", record: true });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Router hook={location.hook}>{children}</Router>
  );
  const hook = renderHook(() => useGarminQuickSync(), { wrapper });
  return { ...hook, history: location.history! };
}

describe("useGarminQuickSync", () => {
  beforeEach(() => {
    state.status = undefined;
    state.isPending = false;
    vi.clearAllMocks();
  });
  afterEach(cleanup);

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

  it("già in corso: non riparte", async () => {
    state.status = { connected: true };
    state.isPending = true;
    const { result } = setup();
    await act(() => result.current.sync());
    expect(state.mutate).not.toHaveBeenCalled();
  });

  it("esito: toast e aggiornamento di attività e profilo", () => {
    setup();
    state.syncOptions.onSuccess({ synced: 3, detectedPbs: [{}] });
    expect(state.toastSuccess).toHaveBeenCalledWith("3 attività sincronizzate!");
    expect(state.toastSuccess).toHaveBeenCalledWith("Nuovi PB rilevati: 1");
    expect(state.invalidateActivities).toHaveBeenCalled();
    expect(state.invalidateProfile).toHaveBeenCalled();

    state.syncOptions.onSuccess({ error: "Sessione Garmin scaduta" });
    expect(state.toastError).toHaveBeenCalledWith("Sessione Garmin scaduta");

    state.syncOptions.onError(new Error("boom"));
    expect(state.toastError).toHaveBeenCalledWith(
      "Errore nella sincronizzazione: boom"
    );
  });
});
