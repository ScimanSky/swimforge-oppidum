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
  storyGroups: [] as any[],
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
      stories: {
        active: {
          useQuery: () => ({
            data: mockState.storyGroups,
          }),
        },
      },
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
          data: [],
          isLoading: false,
          isFetching: false,
        }),
      },
    },
  },
}));

vi.mock("@/components/AppLayout", () => ({
  default: ({ headerSlot, children }: any) => (
    <div>
      <div data-testid="app-header-slot">{headerSlot}</div>
      <div data-testid="app-content">{children}</div>
    </div>
  ),
}));

vi.mock("@/components/social/StoryAvatar", () => ({
  StoryAvatar: ({ userId, userName, isCurrentUser, onClick }: any) => (
    <button
      type="button"
      data-testid={`story-avatar-${userId}`}
      data-current={isCurrentUser ? "yes" : "no"}
      onClick={onClick}
    >
      {userName}
    </button>
  ),
}));

vi.mock("@/components/social/StoryViewer", () => ({
  StoryViewer: ({ groups, initialGroupIndex }: any) => (
    <div data-testid="story-viewer-state">{`open:${initialGroupIndex}:groups:${groups.length}`}</div>
  ),
}));

vi.mock("@/components/social/StoryCreator", () => ({
  StoryCreator: ({ open }: any) => <div data-testid="story-creator-state">{open ? "open" : "closed"}</div>,
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

describe("SocialFeed mobile stories behavior", () => {
  beforeEach(() => {
    mockState.profile = {
      userId: 1,
      username: "Me",
      avatarUrl: null,
      preferences: { autoplayVideos: false },
    };
    mockState.storyGroups = [];
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("opens StoryCreator when current user has placeholder avatar with no stories", async () => {
    mockState.storyGroups = [
      {
        userId: 10,
        userName: "Alice",
        userAvatar: null,
        stories: [{ hasViewed: false }],
      },
    ];

    render(<SocialFeed />);

    expect(screen.getByTestId("story-creator-state")).toHaveTextContent("closed");
    await userEvent.click(screen.getByTestId("story-avatar-1"));

    await waitFor(() => {
      expect(screen.getByTestId("story-creator-state")).toHaveTextContent("open");
    });
  });

  it("opens StoryViewer with index from displayed story order", async () => {
    mockState.storyGroups = [
      {
        userId: 20,
        userName: "Bob",
        userAvatar: null,
        stories: [{ hasViewed: true }],
      },
      {
        userId: 10,
        userName: "Alice",
        userAvatar: null,
        stories: [{ hasViewed: false }],
      },
    ];

    render(<SocialFeed />);
    await userEvent.click(screen.getByTestId("story-avatar-20"));

    await waitFor(() => {
      expect(screen.getByTestId("story-viewer-state")).toHaveTextContent("open:2:groups:3");
    });
  });

  it("opens StoryViewer for current user when current user already has stories", async () => {
    mockState.storyGroups = [
      {
        userId: 1,
        userName: "Me",
        userAvatar: null,
        stories: [{ hasViewed: true }],
      },
      {
        userId: 10,
        userName: "Alice",
        userAvatar: null,
        stories: [{ hasViewed: false }],
      },
    ];

    render(<SocialFeed />);

    await userEvent.click(screen.getByTestId("story-avatar-1"));

    await waitFor(() => {
      expect(screen.getByTestId("story-viewer-state")).toHaveTextContent("open:0:groups:2");
    });
    expect(screen.getByTestId("story-creator-state")).toHaveTextContent("closed");
  });
});
