import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ActivityDetail from "./ActivityDetail";

const state = vi.hoisted(() => ({
  activity: null as any,
  isLoading: false,
  invalidateGet: vi.fn(),
  invalidateList: vi.fn(),
  invalidateFeed: vi.fn(),
  invalidateUnshared: vi.fn(),
  toggleShareCalls: [] as Array<{ activityId: number; share: boolean }>,
  toggleShareOptions: null as any,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/components/ui/switch", () => ({
  Switch: ({ id, checked, onCheckedChange, disabled }: any) => (
    <input
      id={id}
      type="checkbox"
      role="switch"
      checked={!!checked}
      disabled={!!disabled}
      onChange={e => onCheckedChange?.(e.currentTarget.checked)}
    />
  ),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    activities: {
      get: {
        useQuery: () => ({ data: state.activity, isLoading: state.isLoading }),
      },
    },
    community: {
      toggleShare: {
        useMutation: (options: any) => {
          state.toggleShareOptions = options;
          return {
            mutate: (vars: { activityId: number; share: boolean }) => {
              state.toggleShareCalls.push(vars);
            },
            isPending: false,
          };
        },
      },
    },
    useUtils: () => ({
      activities: {
        get: { invalidate: state.invalidateGet },
        list: { invalidate: state.invalidateList },
      },
      community: {
        feed: { invalidate: state.invalidateFeed },
        unsharedActivities: { invalidate: state.invalidateUnshared },
      },
    }),
  },
}));

vi.mock("wouter", () => ({
  useRoute: (pattern: string) => (pattern === "/track/:id" ? [true, { id: "5" }] : [false, null]),
  Link: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/AppLayout", () => ({
  default: ({ children }: any) => <div data-testid="app-layout">{children}</div>,
}));

vi.mock("@/components/social/ShareActivityPicker", () => ({
  ShareActivityPicker: ({ open, initialActivityId, onShared }: any) => (
    <div data-testid="share-picker-state">
      {`open:${String(open)}|id:${initialActivityId ?? "null"}`}
      <button type="button" onClick={() => onShared?.(initialActivityId)}>
        simulate-shared
      </button>
    </div>
  ),
}));

const lap = (id: number, lapIndex: number, distanceMeters: number, durationSeconds: number) => ({
  id,
  lapIndex,
  distanceMeters,
  durationSeconds,
  movingDurationSeconds: null,
  elapsedDurationSeconds: null,
  averageSpeedMps: null,
  maxSpeedMps: null,
  averageMovingSpeedMps: null,
  averageSwolf: null,
  averageStrokes: null,
  totalNumberOfStrokes: null,
  averageSwimCadence: null,
  calories: null,
  avgHeartRate: null,
  maxHeartRate: null,
  numberOfActiveLengths: distanceMeters > 0 ? 2 : 0,
  strokeType: distanceMeters > 0 ? "FREESTYLE" : null,
  startTimeGmt: null,
});

const length = (lapId: number, lengthIndex: number, durationSeconds: number) => ({
  lapId,
  lengthIndex,
  distanceMeters: 50,
  durationSeconds,
  averageSpeedMps: null,
  maxSpeedMps: null,
  averageSwolf: null,
  totalNumberOfStrokes: null,
  avgHeartRate: null,
  maxHeartRate: null,
  strokeType: "FREESTYLE",
  startTimeGmt: null,
});

const session = (overrides: Record<string, unknown> = {}) => ({
  id: 5,
  activityName: "Soglia 10×200",
  activityDate: new Date(2026, 9, 26, 10, 47),
  activitySource: "garmin",
  isOpenWater: false,
  poolLengthMeters: 25,
  distanceMeters: 3200,
  durationSeconds: 3720,
  avgPacePer100m: 112,
  avgHeartRate: 142,
  maxHeartRate: null,
  calories: 540,
  xpEarned: 180,
  shareToFeed: false,
  hrZone1Seconds: 80,
  hrZone2Seconds: 220,
  hrZone3Seconds: 380,
  hrZone4Seconds: 240,
  hrZone5Seconds: 80,
  rawData: null,
  garminLaps: [lap(11, 1, 100, 110), lap(12, 2, 100, 100), lap(13, 3, 0, 30)],
  garminLengths: [length(11, 1, 55), length(11, 2, 55), length(12, 1, 50), length(12, 2, 50)],
  ...overrides,
});

describe("ActivityDetail (Corsia)", () => {
  beforeEach(() => {
    state.activity = session();
    state.isLoading = false;
    state.invalidateGet.mockReset();
    state.invalidateList.mockReset();
    state.invalidateFeed.mockReset();
    state.invalidateUnshared.mockReset();
    state.toggleShareCalls = [];
    state.toggleShareOptions = null;
  });

  afterEach(() => {
    cleanup();
  });

  it("header: date, place and source, the name as h2 (no h1), XP chip", () => {
    render(<ActivityDetail />);

    expect(screen.getByText("lun 26 ott · 10:47 · Vasca 25m · Garmin")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Soglia 10×200" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.getByText("+180 XP")).toBeInTheDocument();
  });

  it("metric grid shows only the metrics with data, never a «—»", () => {
    render(<ActivityDetail />);

    for (const label of ["Distanza", "Durata", "Passo medio", "FC media", "Calorie"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getByText("Passo medio").previousElementSibling).toHaveTextContent("1:52 /100");
    expect(screen.queryByText("FC massima")).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("SWOLF joins the grid when present, in order, with dividers for a third row", () => {
    state.activity = session({ avgSwolf: 38, maxHeartRate: 171 });

    render(<ActivityDetail />);

    const grid = screen.getByTestId("session-metrics");
    const cells = Array.from(grid.children) as HTMLElement[];
    expect(cells.map(cell => cell.lastElementChild?.lastElementChild?.textContent)).toEqual([
      "Distanza",
      "Durata",
      "Passo medio",
      "SWOLF",
      "FC media",
      "FC massima",
      "Calorie",
    ]);
    expect(within(cells[3]).getByText("38")).toBeInTheDocument();
    // Three columns: a left divider except at the start of a row, a top divider from row two.
    expect(cells.map(cell => cell.classList.contains("border-l"))).toEqual([
      false, true, true, false, true, true, false,
    ]);
    expect(cells.map(cell => cell.classList.contains("border-t"))).toEqual([
      false, false, false, true, true, true, true,
    ]);
  });

  it("without heart-rate zones or lap paces the charts are not drawn", () => {
    state.activity = session({
      hrZone1Seconds: null,
      hrZone2Seconds: 0,
      hrZone3Seconds: null,
      hrZone4Seconds: null,
      hrZone5Seconds: null,
      garminLaps: [],
      garminLengths: [],
    });

    render(<ActivityDetail />);

    expect(screen.queryByText("Zone cardio")).not.toBeInTheDocument();
    expect(screen.queryByText("Passo per ripetuta")).not.toBeInTheDocument();
  });

  it("cardio zones: percentages per zone, the dominant one in bold", () => {
    render(<ActivityDetail />);

    const zones = screen.getByRole("region", { name: "Zone cardio" });
    const items = within(zones).getAllByRole("listitem");
    expect(items.map(item => item.textContent)).toEqual([
      "Z1 8%",
      "Z2 22%",
      "Z3 38%",
      "Z4 24%",
      "Z5 8%",
    ]);
    expect(items[2]).toHaveClass("font-bold");
  });

  it("pace per repeat names the fastest repeat (recovery left out)", () => {
    render(<ActivityDetail />);

    const pace = screen.getByRole("region", { name: "Passo per ripetuta" });
    expect(within(pace).getByText("Più veloce: rip. 2 · 1:40")).toBeInTheDocument();
  });

  it("the feed switch toggles sharing of this activity and refreshes it", async () => {
    render(<ActivityDetail />);

    const toggle = screen.getByRole("switch", { name: "Condividi nel feed" });
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    expect(state.toggleShareCalls).toEqual([{ activityId: 5, share: true }]);

    await state.toggleShareOptions.onSuccess(undefined, { activityId: 5, share: true });
    expect(state.invalidateGet).toHaveBeenCalledWith({ id: 5 });
    expect(state.invalidateList).toHaveBeenCalled();
    expect(state.invalidateFeed).toHaveBeenCalled();
    expect(state.invalidateUnshared).toHaveBeenCalled();
  });

  it("a shared activity can be un-shared from the switch", async () => {
    state.activity = session({ shareToFeed: true });

    render(<ActivityDetail />);

    const toggle = screen.getByRole("switch", { name: "Condividi nel feed" });
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);
    expect(state.toggleShareCalls).toEqual([{ activityId: 5, share: false }]);
  });

  it("«Condividi con foto o commento» opens the picker on this activity, only when not shared", async () => {
    render(<ActivityDetail />);

    expect(screen.getByTestId("share-picker-state")).toHaveTextContent("open:false|id:5");
    await userEvent.click(screen.getByRole("button", { name: "Condividi con foto o commento" }));
    expect(screen.getByTestId("share-picker-state")).toHaveTextContent("open:true|id:5");

    await userEvent.click(screen.getByRole("button", { name: "simulate-shared" }));
    expect(state.invalidateGet).toHaveBeenCalledWith({ id: 5 });
    expect(state.invalidateList).toHaveBeenCalled();

    cleanup();
    state.activity = session({ shareToFeed: true });
    render(<ActivityDetail />);
    expect(
      screen.queryByRole("button", { name: "Condividi con foto o commento" })
    ).not.toBeInTheDocument();
  });

  it("the coach AI button opens the coach on the session analysis", () => {
    render(<ActivityDetail />);

    expect(screen.getByRole("link", { name: "Coach AI" })).toHaveAttribute(
      "href",
      "/coach?tab=session-iq"
    );
  });

  it("laps are selectable and the repeats view lists repeats and their lengths", async () => {
    render(<ActivityDetail />);

    const second = screen.getByRole("button", { name: /Giro 2/ });
    await userEvent.click(second);
    expect(second).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Giro 2 selezionato")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Ripetute" }));
    const repeat = screen.getByRole("button", { name: /^Ripetuta 1/ });
    await userEvent.click(repeat);
    expect(repeat).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("button", { name: /Vasca 1\.2/ }).length).toBeGreaterThan(0);
  });

  it("shows the not-found state", () => {
    state.activity = null;

    render(<ActivityDetail />);

    expect(screen.getByText("Attività non trovata.")).toBeInTheDocument();
  });
});
