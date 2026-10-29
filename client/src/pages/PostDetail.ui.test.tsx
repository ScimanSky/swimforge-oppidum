import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import PostDetail from "./PostDetail";

const state = vi.hoisted(() => ({
  post: null as any,
  error: null as any,
  loading: false,
  enabled: [] as Array<boolean | undefined>,
  refetch: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    profile: { get: { useQuery: () => ({ data: { userId: 4, preferences: { autoplayVideos: "false" } } }) } },
    community: {
      postById: {
        // Like TanStack Query: a disabled query has no data and stays pending.
        useQuery: (_input: unknown, options?: { enabled?: boolean }) => {
          state.enabled.push(options?.enabled);
          const base = { refetch: state.refetch };
          if (options?.enabled === false || state.loading) return { ...base, data: undefined, isPending: true, isError: false, error: null };
          if (state.error) return { ...base, data: undefined, isPending: false, isError: true, error: state.error };
          return { ...base, data: state.post, isPending: false, isError: false, error: null };
        },
      },
    },
  },
}));
vi.mock("@/components/AppLayout", () => ({ default: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/components/social/FeedPost", () => ({
  default: ({ post, currentUserId, autoplayVideos }: any) => (
    <article aria-label={`Post di ${post.user_name}`}>
      {post.content} · utente {currentUserId} · autoplay {String(autoplayVideos)}
    </article>
  ),
}));

const trpcError = (code: string) => Object.assign(new Error(code), { data: { code } });

function renderPost(path = "/post/5") {
  const location = memoryLocation({ path, record: true });
  render(
    <Router hook={location.hook}>
      <PostDetail />
    </Router>
  );
}

describe("PostDetail (Corsia)", () => {
  afterEach(cleanup);
  beforeEach(() => {
    state.post = { id: 5, user_name: "Ada", content: "Che nuotata!" };
    state.error = null;
    state.loading = false;
    state.enabled = [];
    state.refetch.mockClear();
  });

  it("shows the post as in the feed, without a page title or a back button of its own", () => {
    renderPost();
    expect(screen.getByRole("article", { name: "Post di Ada" })).toHaveTextContent("Che nuotata! · utente 4 · autoplay false");
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.queryByRole("button", { name: /Indietro/ })).toBeNull();
  });

  it("loading: an announced skeleton", () => {
    state.loading = true;
    renderPost();
    expect(screen.getByRole("status")).toHaveTextContent("Caricamento del post…");
  });

  it("not found and not visible keep their message, never the bare code", () => {
    state.error = trpcError("NOT_FOUND");
    renderPost();
    expect(screen.getByText("Post non trovato.")).toBeInTheDocument();
    expect(screen.queryByText("NOT_FOUND")).toBeNull();
    expect(screen.getByRole("link", { name: "Torna al feed" })).toHaveAttribute("href", "/home");
    cleanup();

    state.error = trpcError("FORBIDDEN");
    renderPost();
    expect(screen.getByText("Questo post non è visibile per te.")).toBeInTheDocument();
    expect(screen.queryByText("FORBIDDEN")).toBeNull();
  });

  it("an invalid id is «non trovato» without asking the server", () => {
    renderPost("/post/abc");
    expect(screen.getByText("Post non trovato.")).toBeInTheDocument();
    expect(state.enabled.every((enabled) => enabled === false)).toBe(true);
  });

  it("any other error: «Riprova»", async () => {
    state.error = trpcError("INTERNAL_SERVER_ERROR");
    renderPost();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(state.refetch).toHaveBeenCalled();
  });
});
