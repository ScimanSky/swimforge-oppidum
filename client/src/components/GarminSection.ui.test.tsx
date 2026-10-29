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
  toastInfo: vi.fn(),
  status: { data: { connected: true, email: "a@b.it" } } as Record<string, unknown>,
  refetchStatus: vi.fn(),
  disconnectCalls: 0,
  disconnectOptions: null as any,
  connectCalls: [] as unknown[],
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: any[]) => state.toastSuccess(...args),
    error: (...args: any[]) => state.toastError(...args),
    info: (...args: any[]) => state.toastInfo(...args),
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
        status: { useQuery: () => ({ ...state.status, refetch: state.refetchStatus }) },
        connect: {
          useMutation: () => ({ mutate: (vars: unknown) => state.connectCalls.push(vars), isPending: false }),
        },
        completeMfa: { useMutation: idleMutation },
        disconnect: {
          useMutation: (options: any) => {
            state.disconnectOptions = options;
            return { mutate: () => (state.disconnectCalls += 1), isPending: false };
          },
        },
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
    state.status = { data: { connected: true, email: "a@b.it" } };
    state.disconnectCalls = 0;
    state.connectCalls = [];
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("defaults to the last 10 swims", async () => {
    const user = userEvent.setup();
    render(<GarminSection garminConnected />);

    expect(screen.getByRole("radio", { name: "Ultime 10" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Sincronizza le ultime 10" }));

    expect(state.syncCalls).toEqual([{ daysBack: 30, maxActivities: 10 }]);
  });

  it("sends the chosen count and remembers it", async () => {
    const user = userEvent.setup();
    render(<GarminSection garminConnected />);

    await user.click(screen.getByRole("radio", { name: "Ultime 5" }));
    expect(screen.getByRole("radio", { name: "Ultime 5" })).toBeChecked();
    expect(window.localStorage.getItem(GARMIN_SYNC_COUNT_KEY)).toBe("5");

    await user.click(screen.getByRole("button", { name: "Sincronizza le ultime 5" }));
    expect(state.syncCalls).toEqual([{ daysBack: 30, maxActivities: 5 }]);
  });

  it("starts from the remembered choice", async () => {
    window.localStorage.setItem(GARMIN_SYNC_COUNT_KEY, "1");
    const user = userEvent.setup();
    render(<GarminSection garminConnected />);

    expect(screen.getByRole("radio", { name: "Ultima nuotata" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Sincronizza l'ultima nuotata" }));

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

  it("says there is nothing new when the sync imports no swims", () => {
    render(<GarminSection garminConnected />);

    state.syncOptions.onSuccess({ synced: 0, newXp: 0, detectedPbs: [] });

    expect(state.toastInfo).toHaveBeenCalledWith("Nessuna nuova nuotata da sincronizzare");
    expect(state.toastSuccess).not.toHaveBeenCalled();
  });

  it("supports the arrow keys between the choices", async () => {
    const user = userEvent.setup();
    render(<GarminSection garminConnected />);

    await user.click(screen.getByRole("radio", { name: "Ultime 10" }));
    await user.keyboard("{ArrowLeft}");

    expect(screen.getByRole("radio", { name: "Ultime 5" })).toBeChecked();
    expect(screen.getByRole("group", { name: "Quante nuotate sincronizzare" })).toBeInTheDocument();
  });

  it("disables the sync while it runs", () => {
    state.syncPending = true;
    render(<GarminSection garminConnected />);

    expect(screen.getByRole("button", { name: /Sincronizzazione/ })).toBeDisabled();
  });
});

describe("GarminSection (Corsia)", () => {
  beforeEach(() => {
    state.status = { data: { connected: true, email: "a@b.it", lastSync: "2026-10-27T09:47:00" } };
    state.disconnectCalls = 0;
    state.connectCalls = [];
    vi.clearAllMocks();
  });
  afterEach(cleanup);

  it("collegato: titolo, account, ultima sincronizzazione e «Scollega» con il suo nome", async () => {
    const user = userEvent.setup();
    render(<GarminSection garminConnected />);
    expect(screen.getByRole("region", { name: "Garmin Connect" })).toBeInTheDocument();
    expect(screen.getByText("Collegato come a@b.it")).toBeInTheDocument();
    expect(screen.getByText("Ultima sincronizzazione: mar 27 ott · 09:47")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Scollega" }));
    expect(state.disconnectCalls).toBe(1);
  });

  it("errore nello scollegamento: il messaggio del server, se in italiano", () => {
    render(<GarminSection garminConnected />);
    state.disconnectOptions.onError(Object.assign(new Error("Garmin non risponde"), { data: { code: "BAD_GATEWAY" } }));
    expect(state.toastError).toHaveBeenCalledWith("Garmin non risponde");
  });

  it("non collegato: «Collega» apre il modulo con campi etichettati", async () => {
    state.status = { data: { connected: false } };
    const user = userEvent.setup();
    render(<GarminSection garminConnected={false} />);
    expect(screen.getByText("Non collegato")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Collega" }));
    expect(screen.getByRole("dialog", { name: "Collega Garmin Connect" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Email Garmin"), "me@garmin.it");
    await user.type(screen.getByLabelText("Password Garmin"), "segreta");
    await user.click(screen.getByRole("button", { name: "Collega account" }));
    expect(state.connectCalls).toEqual([{ email: "me@garmin.it", password: "segreta" }]);
  });

  it("stato in caricamento: niente «Collega» finché non si sa", () => {
    state.status = { data: undefined, isLoading: true };
    render(<GarminSection garminConnected={false} />);
    expect(screen.getByRole("status")).toHaveTextContent("Caricamento dello stato di Garmin…");
    expect(screen.queryByRole("button", { name: "Collega" })).toBeNull();
  });

  it("stato non caricato: errore con «Riprova», niente «Collega»", async () => {
    state.status = { data: undefined, isError: true };
    const user = userEvent.setup();
    render(<GarminSection garminConnected={false} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Non riesco a caricare i dati");
    expect(screen.queryByRole("button", { name: "Collega" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Riprova" }));
    expect(state.refetchStatus).toHaveBeenCalled();
  });
});
