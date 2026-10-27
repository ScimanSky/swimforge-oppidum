import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SocialFeed from "./SocialFeed";

const mockState = vi.hoisted(() => ({
  profile: {
    userId: 1,
    username: "Me",
    avatarUrl: null,
    preferences: { autoplayVideos: false },
  } as any,
  feedPosts: [] as any[],
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    profile: {
      get: {
        useQuery: () => ({
          data: mockState.profile,
        }),
      },
    },
    community: {
      users: {
        followStarter: {
          useQuery: () => ({
            data: null,
            isLoading: false,
          }),
        },
      },
      feed: {
        useQuery: () => ({
          data: mockState.feedPosts,
          isLoading: false,
          isFetching: false,
        }),
      },
    },
  },
}));

vi.mock("@/components/AppLayout", () => ({
  default: ({ children }: any) => <div data-testid="app-content">{children}</div>,
}));

vi.mock("@/components/social/CreatePostSheet", () => ({
  CreatePostSheet: ({ open }: any) => <div data-testid="create-post-sheet-state">{open ? "open" : "closed"}</div>,
}));

vi.mock("@/components/social/FeedSubTabs", () => ({
  default: ({ tab, onChange }: any) => (
    <div>
      <button type="button" onClick={() => onChange("perte")}>
        tab-perte-{tab}
      </button>
      <button type="button" onClick={() => onChange("seguiti")}>
        tab-seguiti-{tab}
      </button>
    </div>
  ),
}));

vi.mock("@/components/social/FeedPost", () => ({
  default: () => <div data-testid="feed-post">post</div>,
}));

vi.mock("@/components/social/FeedSkeleton", () => ({
  default: () => <div data-testid="feed-skeleton">loading</div>,
}));

vi.mock("@/components/social/FeedSidebar", () => ({
  default: () => <div data-testid="feed-sidebar">sidebar</div>,
}));

vi.mock("@/components/social/FollowStarterCard", () => ({
  default: () => <div data-testid="follow-starter-card">starter</div>,
}));

vi.mock("wouter", () => ({
  Link: ({ href, children }: any) => <a href={href}>{children}</a>,
}));

describe("SocialFeed mobile behavior", () => {
  beforeEach(() => {
    mockState.profile = {
      userId: 1,
      username: "Me",
      avatarUrl: null,
      preferences: { autoplayVideos: false },
    };
    mockState.feedPosts = [];
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("opens CreatePostSheet from the empty 'Per te' call to action", async () => {
    render(<SocialFeed />);

    expect(screen.getByTestId("create-post-sheet-state")).toHaveTextContent("closed");
    await userEvent.click(screen.getByRole("button", { name: "Condividi la prima sessione" }));

    await waitFor(() => {
      expect(screen.getByTestId("create-post-sheet-state")).toHaveTextContent("open");
    });
  });

  it("shows the follow empty state on the 'Seguiti' tab", async () => {
    render(<SocialFeed />);

    await userEvent.click(screen.getByText("tab-seguiti-perte"));

    await waitFor(() => {
      expect(screen.getByText("Segui altri nuotatori")).toBeInTheDocument();
    });
  });

  it("renders feed posts when the feed has data", () => {
    mockState.feedPosts = [
      { id: 1, created_at: "2026-10-27T10:00:00.000Z" },
      { id: 2, created_at: "2026-10-26T10:00:00.000Z" },
    ];

    render(<SocialFeed />);

    expect(screen.getAllByTestId("feed-post")).toHaveLength(2);
  });
});
