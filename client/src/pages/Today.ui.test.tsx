import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { resetGarminQuickSyncForTests } from "@/hooks/useGarminQuickSync";
import Today from "./Today";

const MONDAY_SWIM = {
  id: 1,
  activityName: "Soglia del lunedì",
  activityDate: new Date(2026, 9, 26, 7, 30),
  distanceMeters: 3200,
  durationSeconds: 3720,
  avgPacePer100m: 116,
  avgHeartRate: null,
  xpEarned: 180,
  isOpenWater: false,
  poolLengthMeters: 25,
};
const WEDNESDAY_SWIM = {
  ...MONDAY_SWIM,
  id: 2,
  activityName: "Tecnica del mercoledì",
  activityDate: new Date(2026, 9, 28, 12, 15),
  distanceMeters: 2400,
  durationSeconds: 3000,
  xpEarned: 120,
};
const LAST_WEEK_SWIM = {
  ...MONDAY_SWIM,
  id: 3,
  activityName: "Lunga della settimana scorsa",
  activityDate: new Date(2026, 9, 20, 7, 30),
  distanceMeters: 5000,
};

const state = vi.hoisted(() => ({
  activities: { data: [] as any[] | undefined, isLoading: false, isError: false },
  profile: undefined as any,
  insights: [] as any[],
  garminConnected: true as boolean | undefined,
  refetchActivities: vi.fn(),
  refetchProfile: vi.fn(),
  syncMutate: vi.fn(),
  syncOptions: null as any,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn() },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      garmin: { status: { fetch: async () => ({ connected: state.garminConnected }) } },
      activities: { list: { invalidate: vi.fn() } },
      profile: { get: { invalidate: vi.fn() } },
      activityInsights: { list: { invalidate: vi.fn() } },
    }),
    activities: {
      list: {
        useQuery: () => ({ ...state.activities, refetch: state.refetchActivities }),
      },
    },
    profile: {
      get: {
        useQuery: () => ({ data: state.profile, refetch: state.refetchProfile }),
      },
    },
    activityInsights: {
      list: { useQuery: () => ({ data: state.insights }) },
    },
    garmin: {
      status: {
        useQuery: () => ({
          data: state.garminConnected === undefined ? undefined : { connected: state.garminConnected },
        }),
      },
      sync: {
        useMutation: (options: any) => {
          state.syncOptions = options;
          return { mutate: state.syncMutate, isPending: false };
        },
      },
    },
  },
}));

vi.mock("@/components/AppLayout", () => ({
  default: ({ children }: any) => <div data-testid="app-layout">{children}</div>,
}));

function renderToday() {
  const location = memoryLocation({ path: "/today", record: true });
  render(
    <Router hook={location.hook}>
      <Today />
    </Router>
  );
  return location.history!;
}

describe("Oggi", () => {
  beforeEach(() => {
    // Wednesday 28 October 2026, 18:00 (only Date is faked: user-event keeps real timers).
    vi.useFakeTimers({ now: new Date(2026, 9, 28, 18), toFake: ["Date"] });
    state.activities = {
      data: [MONDAY_SWIM, WEDNESDAY_SWIM, LAST_WEEK_SWIM],
      isLoading: false,
      isError: false,
    };
    state.profile = {
      level: 12,
      totalXp: 4420,
      currentLevelXp: 4000,
      nextLevelXp: 5000,
      xpToNextLevel: 580,
    };
    state.insights = [];
    state.garminConnected = true;
    vi.clearAllMocks();
  });
  afterEach(() => {
    // The Garmin sync guard is shared module state: reset whatever a test left running.
    act(() => resetGarminQuickSyncForTests());
    cleanup();
    vi.useRealTimers();
  });

  it("data di oggi come sottotitolo e nessun h1 (il titolo è nell'header)", () => {
    renderToday();
    expect(screen.getByText("mer 28 ott")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });

  it("settimana: 3200 m lun + 2400 m mer = «5,6» km e «2 nuotate», XP della settimana", () => {
    renderToday();
    const week = screen.getByRole("region", { name: "Questa settimana" });
    expect(within(week).getByText("5,6")).toBeInTheDocument();
    expect(within(week).getByText("km")).toBeInTheDocument();
    expect(within(week).getByText("2 nuotate")).toBeInTheDocument();
    expect(within(week).getByText("+300 XP")).toBeInTheDocument();
  });

  it("ultima nuotata: la card dell'attività del mercoledì, link al dettaglio", () => {
    renderToday();
    const card = screen.getByRole("link", { name: "Tecnica del mercoledì" });
    expect(card).toHaveAttribute("href", "/track/2");
    expect(screen.queryByRole("link", { name: "Soglia del lunedì" })).toBeNull();
  });

  it("riassunto del coach solo se riguarda l'ultima nuotata", () => {
    state.insights = [{ activity_id: 1, summary: "Ottimo ritmo costante." }];
    renderToday();
    expect(screen.queryByText("Ottimo ritmo costante.")).toBeNull();
    cleanup();

    state.insights = [{ activity_id: "2", summary: "Bracciata più lunga nel finale." }];
    renderToday();
    expect(screen.getByText("Bracciata più lunga nel finale.")).toHaveClass("line-clamp-3");
    // The teaser opens the full analysis in Coach AI → Analisi.
    const coachLink = screen.getByRole("link", { name: /Analisi del coach.*Leggi tutto/ });
    expect(coachLink).toHaveAttribute("href", "/coach?tab=session-iq");
  });

  it("striscia livello: «Livello 12» e «580 XP», link al profilo", () => {
    renderToday();
    expect(screen.getByText("Livello 12")).toBeInTheDocument();
    expect(screen.getByText("580 XP")).toBeInTheDocument();
    expect(screen.getByText("Livello 12").closest("a")).toHaveAttribute("href", "/profile");
  });

  it("azioni rapide: Sincronizza Garmin, Nuovo post, Coach AI, Obiettivi", async () => {
    const onCreatePost = vi.fn();
    window.addEventListener("swimforge:open-create-post", onCreatePost);
    renderToday();
    expect(screen.getByRole("link", { name: "Coach AI" })).toHaveAttribute("href", "/coach");
    expect(screen.getByRole("link", { name: "Obiettivi" })).toHaveAttribute("href", "/goals");

    await userEvent.click(screen.getByRole("button", { name: "Nuovo post" }));
    expect(onCreatePost).toHaveBeenCalledTimes(1);
    window.removeEventListener("swimforge:open-create-post", onCreatePost);

    await userEvent.click(screen.getByRole("button", { name: "Sincronizza Garmin" }));
    expect(state.syncMutate).toHaveBeenCalledWith({ daysBack: 7 });
  });

  it("Garmin non collegato: «Collega Garmin» porta alle connessioni", () => {
    state.garminConnected = false;
    renderToday();
    expect(screen.getByRole("link", { name: "Collega Garmin" })).toHaveAttribute(
      "href",
      "/settings?tab=connections"
    );
    expect(screen.queryByRole("button", { name: "Sincronizza Garmin" })).toBeNull();
  });

  it("nessuna attività: «Ancora nessuna nuotata» con la sincronizzazione, una volta sola", async () => {
    state.activities.data = [];
    renderToday();
    expect(screen.getByText("Ancora nessuna nuotata")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Questa settimana" })).toBeNull();
    expect(screen.queryByText("Ultima nuotata")).toBeNull();
    // Only the card button: the quick action becomes «Attività».
    expect(screen.getAllByRole("button", { name: "Sincronizza Garmin" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Attività" })).toHaveAttribute("href", "/track");
  });

  it("nessuna attività e Garmin non collegato: un solo «Collega Garmin»", () => {
    state.activities.data = [];
    state.garminConnected = false;
    renderToday();
    expect(screen.getAllByRole("link", { name: "Collega Garmin" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Attività" })).toHaveAttribute("href", "/track");
  });

  it("con nuotate le azioni rapide tengono Garmin, non «Attività»", () => {
    renderToday();
    expect(screen.queryByRole("link", { name: "Attività" })).toBeNull();
  });

  it("caricamento: scheletri annunciati come stato, niente stato vuoto", () => {
    state.activities = { data: undefined, isLoading: true, isError: false };
    renderToday();
    expect(screen.getByRole("status")).toHaveTextContent("Caricamento…");
    expect(screen.queryByText("Ancora nessuna nuotata")).toBeNull();
  });

  it("durante la sincronizzazione il pulsante resta focalizzabile (aria-disabled)", async () => {
    renderToday();
    const button = screen.getByRole("button", { name: "Sincronizza Garmin" });
    await userEvent.click(button);
    const syncing = screen.getByRole("button", { name: "Sincronizzazione…" });
    expect(syncing).not.toBeDisabled();
    expect(syncing).toHaveAttribute("aria-disabled", "true");
    expect(syncing).toHaveFocus();
    await userEvent.click(syncing);
    expect(state.syncMutate).toHaveBeenCalledTimes(1);
  });

  it("il giorno dopo (lunedì) la settimana riparte da zero e la data si aggiorna", () => {
    renderToday();
    expect(within(screen.getByRole("region", { name: "Questa settimana" })).getByText("5,6")).toBeInTheDocument();

    // The app comes back to the foreground on Monday 2 November.
    vi.setSystemTime(new Date(2026, 10, 2, 8));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const week = screen.getByRole("region", { name: "Questa settimana" });
    expect(within(week).queryByText("5,6")).toBeNull();
    expect(within(week).getByText("0 nuotate")).toBeInTheDocument();
    expect(screen.getByText("lun 2 nov")).toBeInTheDocument();
  });

  it("errore: messaggio e «Riprova» rilancia le query", async () => {
    state.activities = { data: undefined, isLoading: false, isError: true };
    renderToday();
    expect(screen.getByRole("alert")).toHaveTextContent("Non riesco a caricare i dati");
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(state.refetchActivities).toHaveBeenCalledTimes(1);
    expect(state.refetchProfile).toHaveBeenCalledTimes(1);
  });
});
