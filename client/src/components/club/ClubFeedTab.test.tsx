import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ClubFeedTab from "./ClubFeedTab";

const state = vi.hoisted(() => ({
  posts: [] as any[],
  feedStatus: "success" as "success" | "loading" | "error",
  createCalls: [] as any[],
  refetch: vi.fn(),
}));

vi.mock("@/lib/trpc", () => {
  const query = (data: () => unknown, status: () => string = () => "success") => ({
    useQuery: () =>
      status() === "loading"
        ? { data: undefined, isLoading: true, isError: false, refetch: state.refetch }
        : status() === "error"
          ? { data: undefined, isLoading: false, isError: true, error: { message: "Rete" }, refetch: state.refetch }
          : { data: data(), isLoading: false, isError: false, refetch: state.refetch },
  });
  const mutation = (calls?: any[]) => ({
    useMutation: () => ({
      mutate: (vars: any) => calls?.push(vars),
      mutateAsync: async (vars: any) => {
        calls?.push(vars);
        return {};
      },
      isPending: false,
    }),
  });
  return {
    trpc: {
      community: {
        clubs: {
          feed: query(() => state.posts, () => state.feedStatus),
          createPost: mutation(state.createCalls),
        },
        users: { search: query(() => []) },
        comments: query(() => []),
        addComment: mutation(),
        deletePost: mutation(),
        postImageKitAuth: mutation(),
        cloudinaryVideoAuth: mutation(),
      },
      profile: { get: query(() => ({ userId: 1, preferences: null })) },
      useUtils: () => ({}),
    },
  };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@/components/PostReactions", () => ({ default: () => null }));
vi.mock("@/lib/social-content", () => ({
  extractFirstUrl: () => null,
  LinkPreviewCard: () => null,
  normalizeTagSearchQuery: (value: string) => value.trim(),
  renderSocialText: (value: string) => value,
}));

describe("ClubFeedTab (Corsia)", () => {
  afterEach(cleanup);
  beforeEach(() => {
    state.posts = [];
    state.feedStatus = "success";
    state.createCalls.length = 0;
    state.refetch.mockClear();
  });

  it("invita a unirsi se non sei membro", () => {
    render(<ClubFeedTab clubId={7} isMember={false} />);
    expect(screen.getByText("Unisciti al club per vedere il feed.")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Testo del post" })).toBeNull();
  });

  it("pubblica un post e mostra i post del club come card", async () => {
    state.posts = [
      {
        id: 10,
        user_id: 1,
        user_name: "Anna",
        content: "Bella sessione",
        created_at: new Date().toISOString(),
        comment_count: 2,
        hashtags: ["soglia"],
      },
    ];
    const user = userEvent.setup({ delay: null });
    render(<ClubFeedTab clubId={7} isMember />);

    await user.type(screen.getByRole("textbox", { name: "Testo del post" }), "Ciao club");
    await user.click(screen.getByRole("button", { name: "Pubblica" }));
    expect(state.createCalls).toMatchObject([{ clubId: 7, content: "Ciao club" }]);

    const post = screen.getByText("Bella sessione").closest("article")!;
    expect(within(post).getByText("Anna")).toBeTruthy();
    expect(within(post).getByRole("button", { name: "Commenti: 2" })).toBeTruthy();
    expect(within(post).getByRole("button", { name: "Elimina post" })).toBeTruthy();
  });

  it("in caricamento: scheletri, non «Nessun post ancora.»", () => {
    state.feedStatus = "loading";
    render(<ClubFeedTab clubId={7} isMember />);
    expect(screen.getByRole("status").textContent).toContain("Caricamento dei post");
    expect(screen.queryByText("Nessun post ancora.")).toBeNull();
  });

  it("errore del feed: messaggio breve e Riprova, non «Nessun post ancora.»", async () => {
    state.feedStatus = "error";
    render(<ClubFeedTab clubId={7} isMember />);
    expect(screen.getByText("Non riesco a caricare i dati")).toBeTruthy();
    expect(screen.queryByText("Nessun post ancora.")).toBeNull();
    await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: "Riprova" }));
    expect(state.refetch).toHaveBeenCalled();
  });
});
