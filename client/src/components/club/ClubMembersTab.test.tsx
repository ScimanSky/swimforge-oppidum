import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ClubMembersTab from "./ClubMembersTab";

const state = vi.hoisted(() => ({
  members: [] as any[],
  membersStatus: "success" as "success" | "loading" | "error",
  requests: [] as any[],
  approveCalls: [] as any[],
  roleCalls: [] as any[],
}));

vi.mock("@/lib/trpc", () => {
  const query = (data: () => unknown, status: () => string = () => "success") => ({
    useQuery: () =>
      status() === "loading"
        ? { data: undefined, isLoading: true, error: null }
        : status() === "error"
          ? { data: undefined, isLoading: false, error: { message: "Rete assente" } }
          : { data: data(), isLoading: false, error: null },
  });
  const mutation = (calls?: any[]) => ({
    useMutation: () => ({ mutate: (vars: any) => calls?.push(vars), isPending: false }),
  });
  return {
    trpc: {
      community: {
        clubs: {
          members: query(() => state.members, () => state.membersStatus),
          requests: query(() => state.requests),
          banned: query(() => []),
          updateMemberRole: mutation(state.roleCalls),
          banMember: mutation(),
          unbanMember: mutation(),
          approveRequest: mutation(state.approveCalls),
          rejectRequest: mutation(),
        },
      },
      useUtils: () => ({}),
    },
  };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("ClubMembersTab (Corsia)", () => {
  afterEach(cleanup);
  beforeEach(() => {
    state.members = [
      { user_id: 1, user_name: "Anna", user_username: "anna", role: "owner" },
      { user_id: 2, user_name: "Marco", role: "member" },
    ];
    state.membersStatus = "success";
    state.requests = [{ user_id: 3, user_name: "Luca" }];
    state.approveCalls.length = 0;
    state.roleCalls.length = 0;
  });

  it("mostra i ruoli in italiano e nessun titolo che ripete quello del pannello", () => {
    render(<ClubMembersTab clubId={7} />);
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    expect(screen.getByText("2 membri attivi")).toBeTruthy();
    expect(screen.getByText("Proprietario")).toBeTruthy();
    expect(screen.getByText("Membro")).toBeTruthy();
    expect(screen.queryByText("Richieste in attesa")).toBeNull();
  });

  it("per il proprietario: cambia ruolo e approva le richieste", async () => {
    const user = userEvent.setup({ delay: null });
    render(<ClubMembersTab clubId={7} isStaff isOwner />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Ruolo di Marco" }), "moderator");
    expect(state.roleCalls).toEqual([{ clubId: 7, userId: 2, role: "moderator" }]);

    const requests = screen.getByRole("heading", { level: 3, name: "Richieste in attesa" }).closest("section")!;
    await user.click(within(requests).getByRole("button", { name: "Approva" }));
    expect(state.approveCalls).toEqual([{ clubId: 7, userId: 3 }]);
  });

  it("@username solo sotto un nome; senza nome lo username è il titolo, mai un'email", () => {
    state.members = [
      { user_id: 1, user_name: "Anna", user_username: "anna", role: "owner" },
      { user_id: 5, user_name: null, user_username: "ada", role: "member" },
    ];
    render(<ClubMembersTab clubId={7} />);
    expect(screen.getByText("@anna")).toBeTruthy();
    expect(screen.getByRole("link", { name: "ada" })).toBeTruthy();
    expect(screen.queryByText("@ada")).toBeNull();
    expect(document.body.textContent).not.toMatch(/[^\s@]+@[^\s@]+\.[^\s@]+/);
  });

  it("un solo link al profilo per membro (l'avatar non è una seconda tappa)", () => {
    render(<ClubMembersTab clubId={7} isStaff />);
    const anna = screen.getByText("Anna").closest("li")!;
    expect(within(anna).getAllByRole("link").map((link) => link.textContent)).toEqual(["Anna"]);
    // Requests too: the name is the link.
    const requests = screen.getByRole("heading", { level: 3, name: "Richieste in attesa" }).closest("section")!;
    expect(within(requests).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/u/3"]);
    expect(within(requests).getByRole("link", { name: "Luca" })).toBeTruthy();
  });

  it("il numero dei membri solo a dati caricati, non «0 membri attivi»", () => {
    state.membersStatus = "loading";
    render(<ClubMembersTab clubId={7} />);
    expect(screen.getByRole("status").textContent).toContain("Caricamento dei membri");
    expect(screen.queryByText(/membri? attiv/)).toBeNull();
    cleanup();
    state.membersStatus = "error";
    render(<ClubMembersTab clubId={7} />);
    expect(screen.getByText("Rete assente")).toBeTruthy();
    expect(screen.queryByText(/membri? attiv/)).toBeNull();
  });
});
