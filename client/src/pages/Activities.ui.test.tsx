import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Activities from "./Activities";
import { SYNC_PROMPT_SEEN_KEY } from "@/lib/sync-share-prompt";

const state = vi.hoisted(() => ({
  activitiesData: [] as any[],
  toggleShareMutateCalls: [] as Array<{ activityId: number; share: boolean }>,
  invalidateActivities: vi.fn(),
  invalidateFeed: vi.fn(),
  invalidateUnshared: vi.fn(),
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
    activities: {
      list: {
        useQuery: () => ({
          data: state.activitiesData,
          isLoading: false,
        }),
      },
    },
    profile: {
      get: {
        useQuery: () => ({
          data: {
            level: 5,
            totalXp: 1234,
          },
        }),
      },
    },
    community: {
      toggleShare: {
        useMutation: (_opts: any) => ({
          mutate: (vars: { activityId: number; share: boolean }) => {
            state.toggleShareMutateCalls.push(vars);
          },
          isPending: false,
        }),
      },
    },
    useUtils: () => ({
      activities: {
        get: { invalidate: vi.fn() },
        list: { invalidate: state.invalidateActivities },
      },
      community: {
        feed: { invalidate: state.invalidateFeed },
        unsharedActivities: { invalidate: state.invalidateUnshared },
      },
    }),
    useContext: () => ({
      activities: {
        list: {
          invalidate: state.invalidateActivities,
        },
      },
      community: {
        feed: {
          invalidate: state.invalidateFeed,
        },
        unsharedActivities: {
          invalidate: state.invalidateUnshared,
        },
      },
    }),
  },
}));

vi.mock("@/components/AppLayout", () => ({
  default: ({ children }: any) => <div data-testid="app-layout">{children}</div>,
}));

vi.mock("@/components/social/ShareActivityPicker", () => ({
  ShareActivityPicker: ({ open, initialActivityId, onOpenChange, onShared }: any) => (
    <div data-testid="share-picker-state">
      {`open:${String(open)}|id:${initialActivityId ?? "null"}`}
      <button type="button" onClick={() => onOpenChange(false)}>
        close-picker
      </button>
      <button type="button" onClick={() => onShared?.(initialActivityId)}>
        simulate-shared
      </button>
    </div>
  ),
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: ({ checked, onCheckedChange, disabled }: any) => (
    <input
      aria-label="Condividi nel feed"
      type="checkbox"
      checked={!!checked}
      disabled={!!disabled}
      onChange={(e) => onCheckedChange?.(e.currentTarget.checked)}
    />
  ),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: any) => (open ? <div data-testid="sync-dialog">{children}</div> : null),
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
}));

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: any) => <div>{children}</div>,
  TabsList: ({ children }: any) => <div>{children}</div>,
  TabsTrigger: ({ children }: any) => <button type="button">{children}</button>,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: any) => <div>{children}</div>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children }: any) => <div>{children}</div>,
  SelectTrigger: ({ children }: any) => <button type="button">{children}</button>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: () => <div data-testid="skeleton">skeleton</div>,
}));

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

/** Viewport ≥ 1280px (selection + detail panel) or narrower (cards open `/track/:id`). */
function setViewport({ wide }: { wide: boolean }) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: wide,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

const swim = (overrides: Record<string, unknown> = {}) => ({
  id: 101,
  activityName: "Pool Session",
  distanceMeters: 2000,
  durationSeconds: 1800,
  avgPacePer100m: 90,
  activityDate: "2026-02-19T10:00:00.000Z",
  isOpenWater: false,
  xpEarned: 30,
  shareToFeed: false,
  activitySource: "manual",
  ...overrides,
});

describe("Activities UI interactions", () => {
  beforeEach(() => {
    state.activitiesData = [];
    state.toggleShareMutateCalls = [];
    state.invalidateActivities.mockReset();
    state.invalidateFeed.mockReset();
    state.invalidateUnshared.mockReset();
    state.toastSuccess.mockReset();
    state.toastError.mockReset();

    setViewport({ wide: true });

    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("calls toggleShare mutation when feed switch is changed", async () => {
    state.activitiesData = [
      {
        id: 101,
        activityName: "Pool Session",
        distanceMeters: 2000,
        durationSeconds: 1800,
        avgPacePer100m: 90,
        activityDate: "2026-02-19T10:00:00.000Z",
        isOpenWater: false,
        xpEarned: 30,
        shareToFeed: false,
        activitySource: "manual",
      },
    ];

    render(<Activities />);

    const shareSwitch = screen.getByRole("checkbox", { name: "Condividi nel feed" });
    expect(shareSwitch).not.toBeChecked();

    await userEvent.click(shareSwitch);

    expect(state.toggleShareMutateCalls).toEqual([{ activityId: 101, share: true }]);
  });

  it("opens sync prompt and handles 'Più tardi' by marking activity as seen", async () => {
    window.localStorage.setItem(SYNC_PROMPT_SEEN_KEY, "50");
    state.activitiesData = [
      {
        id: 60,
        activityName: "Nuova Sessione Garmin",
        distanceMeters: 2100,
        durationSeconds: 1900,
        avgPacePer100m: 92,
        activityDate: "2026-02-19T10:00:00.000Z",
        isOpenWater: false,
        xpEarned: 35,
        shareToFeed: false,
        activitySource: "garmin",
      },
    ];

    render(<Activities />);

    expect(await screen.findByText("Nuova attività sincronizzata")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Più tardi" }));

    await waitFor(() => {
      expect(screen.queryByText("Nuova attività sincronizzata")).not.toBeInTheDocument();
    });
    expect(window.localStorage.getItem(SYNC_PROMPT_SEEN_KEY)).toBe("60");
  });

  it("opens share picker from 'Condividi ora' and marks seen on picker close", async () => {
    window.localStorage.setItem(SYNC_PROMPT_SEEN_KEY, "10");
    state.activitiesData = [
      {
        id: 70,
        activityName: "Sessione Strava",
        distanceMeters: 2400,
        durationSeconds: 2000,
        avgPacePer100m: 95,
        activityDate: "2026-02-19T10:00:00.000Z",
        isOpenWater: false,
        xpEarned: 40,
        shareToFeed: false,
        activitySource: "strava",
      },
    ];

    render(<Activities />);

    expect(await screen.findByText("Nuova attività sincronizzata")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Condividi ora" }));

    await waitFor(() => {
      expect(screen.getByTestId("share-picker-state")).toHaveTextContent("open:true|id:70");
    });

    await userEvent.click(screen.getByRole("button", { name: "close-picker" }));
    await waitFor(() => {
      expect(screen.getByTestId("share-picker-state")).toHaveTextContent("open:false|id:null");
    });
    expect(window.localStorage.getItem(SYNC_PROMPT_SEEN_KEY)).toBe("70");
  });
  it("below 1280px cards link to the detail page and there is no side panel", () => {
    setViewport({ wide: false });
    state.activitiesData = [swim(), swim({ id: 102, activityName: "Lago", isOpenWater: true })];

    render(<Activities />);

    expect(screen.getByRole("link", { name: "Pool Session" })).toHaveAttribute("href", "/track/101");
    expect(screen.getByRole("link", { name: "Lago" })).toHaveAttribute("href", "/track/102");
    expect(screen.queryByRole("checkbox", { name: "Condividi nel feed" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Dettaglio vasche" })).not.toBeInTheDocument();
  });

  it("from 1280px selecting a card shows it in the panel, with only the metrics it has", async () => {
    state.activitiesData = [
      swim({ avgHeartRate: 142, hrZone2Seconds: 300, hrZone3Seconds: 900 }),
      swim({
        id: 102,
        activityName: "Lago di Garda",
        isOpenWater: true,
        activityDate: "2026-02-18T08:30:00.000Z",
      }),
    ];

    render(<Activities />);

    const first = screen.getByRole("button", { name: "Pool Session" });
    const second = screen.getByRole("button", { name: "Lago di Garda" });
    expect(first).toHaveAttribute("aria-current", "true");
    const panel = screen.getByRole("region", { name: "Pool Session" });
    expect(within(panel).getByText("FC media")).toBeInTheDocument();
    expect(within(panel).queryByText("FC massima")).not.toBeInTheDocument();
    expect(within(panel).queryByText("Calorie")).not.toBeInTheDocument();
    expect(within(panel).getByText("Zone cardio")).toBeInTheDocument();
    expect(within(panel).getByText((_, el) => el?.tagName === "LI" && el.textContent === "Z3 75%")).toHaveClass("font-bold");
    expect(screen.getByRole("link", { name: "Dettaglio vasche" })).toHaveAttribute("href", "/track/101");

    await userEvent.click(second);

    expect(second).toHaveAttribute("aria-current", "true");
    expect(first).not.toHaveAttribute("aria-current");
    const lake = screen.getByRole("region", { name: "Lago di Garda" });
    // No heart-rate data: neither the metric nor the zones are shown, never a «—».
    expect(within(lake).queryByText("FC media")).not.toBeInTheDocument();
    expect(within(lake).queryByText("Zone cardio")).not.toBeInTheDocument();
    expect(within(lake).queryByText("—")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dettaglio vasche" })).toHaveAttribute("href", "/track/102");
  });

  it("distances below 1 km are in metres, on the card and in the panel", () => {
    state.activitiesData = [swim({ distanceMeters: 800 })];

    render(<Activities />);

    expect(screen.getByRole("button", { name: "Pool Session" })).toHaveAccessibleDescription(
      /800 m Distanza/
    );
    expect(screen.getByRole("region", { name: "Pool Session" })).toHaveTextContent("800 m Distanza");
  });

  it("has no page title, level header or Open Water label", () => {
    state.activitiesData = [swim()];

    render(<Activities />);

    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByText(/Lv \d/)).not.toBeInTheDocument();
    expect(screen.queryByText("Open Water")).not.toBeInTheDocument();
    expect(screen.getByText("Acque libere")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Questa settimana" })).toBeInTheDocument();
  });

  it("without matchMedia (jsdom) the layout is the wide one", () => {
    Object.defineProperty(window, "matchMedia", { writable: true, configurable: true, value: undefined });
    state.activitiesData = [swim()];

    render(<Activities />);

    expect(screen.getByRole("checkbox", { name: "Condividi nel feed" })).toBeInTheDocument();
  });
});
