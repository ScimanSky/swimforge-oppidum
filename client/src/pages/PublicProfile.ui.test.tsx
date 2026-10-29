import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import PublicProfile from "./PublicProfile";

const state = vi.hoisted(() => ({
  me: { id: 4 } as any,
  profile: null as any,
  profileError: null as any,
  profileLoading: false,
  records: [] as any[],
  recordInputs: [] as Array<{ userId: number; finaGender: string }>,
  follows: [] as unknown[],
  followError: null as unknown,
  refetch: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    auth: { me: { useQuery: () => ({ data: state.me }) } },
    community: {
      users: {
        getPublicProfile: {
          useQuery: (_input: unknown, options?: { enabled?: boolean }) => {
            const base = { refetch: state.refetch };
            if (options?.enabled === false || state.profileLoading) {
              return { ...base, data: undefined, isPending: true, isError: false, error: null };
            }
            if (state.profileError) {
              return { ...base, data: undefined, isPending: false, isError: true, error: state.profileError };
            }
            return { ...base, data: state.profile, isPending: false, isError: false, error: null };
          },
        },
        toggleFollow: {
          useMutation: (options?: { onSuccess?: () => void; onError?: (error: unknown) => void }) => ({
            mutate: (vars: unknown) => {
              state.follows.push(vars);
              if (state.followError) options?.onError?.(state.followError);
              else options?.onSuccess?.();
            },
            isPending: false,
          }),
        },
      },
    },
    records: {
      getByUser: {
        useQuery: (input: any) => {
          state.recordInputs.push(input);
          return { data: { records: state.records }, isPending: false, isError: false, refetch: vi.fn() };
        },
      },
    },
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/AppLayout", () => ({ default: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/components/DirectMessages", () => ({
  default: ({ recipientName }: { recipientName: string }) => (
    <button type="button">Messaggio a {recipientName}</button>
  ),
}));

const trpcError = (code: string, message = code) => Object.assign(new Error(message), { data: { code } });

function renderProfile(path = "/u/9") {
  const location = memoryLocation({ path, record: true });
  render(
    <Router hook={location.hook}>
      <Route path="/u/:id" component={PublicProfile} />
    </Router>
  );
}

describe("PublicProfile (Corsia)", () => {
  afterEach(cleanup);
  beforeEach(() => {
    state.me = { id: 4 };
    state.profile = {
      userId: 9,
      name: "Ada Rossi",
      username: "ada",
      avatarUrl: null,
      coverUrl: null,
      bio: "Nuoto al mattino.",
      location: "Cagliari",
      level: 12,
      totalXp: 4420,
      followerCount: 1234,
      followingCount: "9",
      isFollowing: false,
      profilePublic: true,
    };
    state.profileError = null;
    state.profileLoading = false;
    state.records = [
      {
        id: 1,
        strokeType: "freestyle",
        distanceMeters: 100,
        poolLengthMeters: 25,
        timeCs: 6512,
        source: "training",
        achievedAt: new Date(2026, 4, 3),
        finaPoints: 540,
      },
    ];
    state.recordInputs = [];
    state.follows = [];
    state.followError = null;
    state.refetch.mockClear();
    vi.mocked(toast.error).mockClear();
    localStorage.clear();
  });

  it("no h1: the name is an h2 with @username, bio, place and the numbers as metrics", () => {
    renderProfile();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    const card = screen.getByRole("region", { name: "Ada Rossi" });
    expect(within(card).getByText("@ada")).toBeInTheDocument();
    expect(within(card).getByText("Nuoto al mattino.")).toBeInTheDocument();
    expect(within(card).getByText("Cagliari")).toBeInTheDocument();
    const metrics = within(card).getAllByRole("listitem").map((item) => item.textContent);
    expect(metrics).toEqual(["12 Livello", "4.420 XP", "1.234 Follower", "9 Seguiti"]);
  });

  it("the records table of that swimmer, men's tables first and nothing saved", async () => {
    localStorage.setItem("swimforge:finaGender", "female");
    renderProfile();
    const board = screen.getByRole("region", { name: "Record personali" });
    expect(within(board).getByRole("listitem")).toHaveTextContent("Stile libero 100 m");
    expect(within(board).getByRole("listitem")).toHaveTextContent("1:05.12");
    expect(within(board).getByRole("radio", { name: "Uomini" })).toBeChecked();
    expect(state.recordInputs.every((input) => input.userId === 9)).toBe(true);

    localStorage.clear();
    await userEvent.click(within(board).getByRole("radio", { name: "Donne" }));
    expect(state.recordInputs.at(-1)?.finaGender).toBe("female");
    expect(localStorage.getItem("swimforge:finaGender")).toBeNull();
  });

  it("no records: «Nessun record pubblico.»", () => {
    state.records = [];
    renderProfile();
    expect(screen.getByText("Nessun record pubblico.")).toBeInTheDocument();
  });

  it("«Segui» follows; a failure is an Italian toast, never the bare code", async () => {
    renderProfile();
    await userEvent.click(screen.getByRole("button", { name: "Segui" }));
    expect(state.follows).toEqual([{ userId: 9 }]);
    expect(state.refetch).toHaveBeenCalled();

    state.followError = trpcError("FORBIDDEN");
    await userEvent.click(screen.getByRole("button", { name: "Segui" }));
    expect(toast.error).toHaveBeenCalledWith("Operazione non riuscita, riprova");
  });

  it("already followed: «Seguito»; the message button names the swimmer", () => {
    state.profile.isFollowing = true;
    renderProfile();
    expect(screen.getByRole("button", { name: "Seguito" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Messaggio a Ada Rossi" })).toBeInTheDocument();
  });

  it("your own profile, or auth.me still loading: no «Segui» nor «Messaggio»", () => {
    state.me = { id: 9 };
    renderProfile();
    expect(screen.queryByRole("button", { name: "Segui" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Messaggio/ })).toBeNull();
    cleanup();

    state.me = undefined;
    renderProfile();
    expect(screen.queryByRole("button", { name: "Segui" })).toBeNull();
  });

  it("only a username: it is the title, without a repeated @username", () => {
    state.profile.name = null;
    renderProfile();
    expect(screen.getByRole("heading", { level: 2, name: "ada" })).toBeInTheDocument();
    expect(screen.queryByText("@ada")).toBeNull();
  });

  it("loading: an announced skeleton", () => {
    state.profileLoading = true;
    renderProfile();
    expect(screen.getByRole("status")).toHaveTextContent("Caricamento del profilo…");
  });

  it("not found, private and invalid id keep their message with a way back", () => {
    state.profileError = trpcError("NOT_FOUND", "User not found");
    renderProfile();
    expect(screen.getByText("Profilo non trovato.")).toBeInTheDocument();
    expect(screen.queryByText("User not found")).toBeNull();
    expect(screen.getByRole("link", { name: "Torna al feed" })).toHaveAttribute("href", "/home");
    cleanup();

    state.profileError = trpcError("FORBIDDEN", "Questo profilo non è pubblico");
    renderProfile();
    expect(screen.getByText("Questo profilo è privato.")).toBeInTheDocument();
    cleanup();

    state.profileError = null;
    renderProfile("/u/abc");
    expect(screen.getByText("Profilo non trovato.")).toBeInTheDocument();
  });

  it("any other error: «Riprova», not «non trovato»", async () => {
    state.profileError = trpcError("INTERNAL_SERVER_ERROR", "boom");
    renderProfile();
    expect(screen.getByRole("alert")).toHaveTextContent("Non riesco a caricare i dati");
    expect(screen.queryByText("Profilo non trovato.")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(state.refetch).toHaveBeenCalled();
  });
});
