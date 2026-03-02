import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StoryViewer } from "./StoryViewer";

const { markViewedMutateMock, reactMutateMock, invalidateMock, currentUserIdRef } = vi.hoisted(() => ({
  markViewedMutateMock: vi.fn(),
  reactMutateMock: vi.fn(),
  invalidateMock: vi.fn(),
  currentUserIdRef: { value: 7 },
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: any) => <>{children}</>,
  motion: {
    div: ({ children, initial, animate, exit, transition, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, whileHover, whileTap, initial, animate, exit, transition, ...props }: any) => (
      <button {...props}>{children}</button>
    ),
    span: ({ children, initial, animate, exit, transition, ...props }: any) => <span {...props}>{children}</span>,
  },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      community: {
        stories: {
          active: {
            invalidate: invalidateMock,
          },
        },
      },
    }),
    profile: {
      get: {
        useQuery: () => ({
          data: { userId: currentUserIdRef.value },
        }),
      },
    },
    community: {
      stories: {
        markViewed: {
          useMutation: () => ({
            mutate: markViewedMutateMock,
          }),
        },
        react: {
          useMutation: () => ({
            mutate: reactMutateMock,
            isPending: false,
          }),
        },
      },
    },
  },
}));

type Story = {
  id: number;
  mediaUrl: string | null;
  caption: string | null;
  type: string;
  expiresAt: string;
  createdAt: string;
  hasViewed: boolean;
  reactionCounts?: Record<string, number>;
  userReaction?: string | null;
  reactionsTotal?: number;
};

function textStory(overrides: Partial<Story>): Story {
  return {
    id: 1,
    mediaUrl: null,
    caption: "Story uno",
    type: "text",
    expiresAt: "2026-02-20T00:00:00.000Z",
    createdAt: "2026-02-19T00:00:00.000Z",
    hasViewed: false,
    reactionCounts: {},
    userReaction: null,
    reactionsTotal: 0,
    ...overrides,
  };
}

function renderViewer(stories: Story[], options?: { userId?: number; onClose?: () => void }) {
  currentUserIdRef.value = options?.userId ?? 7;
  const onClose = options?.onClose ?? vi.fn();
  render(
    <StoryViewer
      groups={[
        {
          userId: 99,
          userName: "Nuotatore",
          userAvatar: null,
          stories,
        },
      ]}
      initialGroupIndex={0}
      onClose={onClose}
    />
  );
  return { onClose };
}

function clickOverlayAt(clientX: number) {
  const overlay = document.body.querySelector("div.fixed.inset-0") as HTMLDivElement | null;
  if (!overlay) throw new Error("Story overlay not found");
  vi.spyOn(overlay, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 200,
    bottom: 400,
    width: 200,
    height: 400,
    toJSON: () => ({}),
  } as DOMRect);
  fireEvent.click(overlay, { clientX });
}

function hasNormalizedText(value: string) {
  const expected = value.replace(/\s+/g, " ").trim();
  return (_content: string, node: Element | null) => {
    const current = node?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    return current === expected;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("StoryViewer", () => {
  it("marks current story as viewed when not viewed yet", async () => {
    renderViewer([textStory({ id: 123, hasViewed: false })]);

    await waitFor(() => {
      expect(markViewedMutateMock).toHaveBeenCalledWith({ storyId: 123 });
    });
  });

  it("does not call markViewed for already viewed stories", async () => {
    renderViewer([textStory({ id: 124, hasViewed: true })]);

    await waitFor(() => {
      expect(markViewedMutateMock).not.toHaveBeenCalled();
    });
  });

  it("allows non-owner to react and sends the selected reaction type", async () => {
    renderViewer([textStory({ id: 200, hasViewed: true })], { userId: 7 });

    const splashButton = screen.getByText("💧").closest("button");
    expect(splashButton).not.toBeNull();
    fireEvent.click(splashButton!);

    expect(reactMutateMock).toHaveBeenCalledWith({
      storyId: 200,
      reactionType: "splash",
    });
  });

  it("closes viewer when tapping right side on last story", async () => {
    const onClose = vi.fn();
    renderViewer([textStory({ id: 300, hasViewed: true })], { onClose });

    clickOverlayAt(180);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("navigates next and previous stories with right/left taps", async () => {
    renderViewer([
      textStory({ id: 400, caption: "Prima story", hasViewed: true }),
      textStory({ id: 401, caption: "Seconda story", hasViewed: true }),
    ]);

    expect(screen.getByText(hasNormalizedText("Prima story"), { selector: "p" })).toBeInTheDocument();

    clickOverlayAt(180);
    await waitFor(() => {
      expect(screen.getByText(hasNormalizedText("Seconda story"), { selector: "p" })).toBeInTheDocument();
    });

    clickOverlayAt(20);
    await waitFor(() => {
      expect(screen.getByText(hasNormalizedText("Prima story"), { selector: "p" })).toBeInTheDocument();
    });
  });
});
