import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
    season: {
      getCurrent: {
        useQuery: () => ({
          data: {
            progress: {
              currentLevel: 5,
              seasonXp: 1234,
            },
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
  Link: ({ href, children }: any) => <a href={href}>{children}</a>,
}));

describe("Activities UI interactions", () => {
  beforeEach(() => {
    state.activitiesData = [];
    state.toggleShareMutateCalls = [];
    state.invalidateActivities.mockReset();
    state.invalidateFeed.mockReset();
    state.invalidateUnshared.mockReset();
    state.toastSuccess.mockReset();
    state.toastError.mockReset();

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });

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
});
