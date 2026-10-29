import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ClubMembersTab from "./ClubMembersTab";

const state = vi.hoisted(() => ({
  members: [] as any[],
  requests: [] as any[],
  approveCalls: [] as any[],
  roleCalls: [] as any[],
}));

vi.mock("@/lib/trpc", () => {
  const query = (data: () => unknown) => ({
    useQuery: () => ({ data: data(), isLoading: false, error: null }),
  });
  const mutation = (calls?: any[]) => ({
    useMutation: () => ({ mutate: (vars: any) => calls?.push(vars), isPending: false }),
  });
  return {
    trpc: {
      community: {
        clubs: {
          members: query(() => state.members),
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
      { user_id: 1, user_name: "Anna", role: "owner" },
      { user_id: 2, user_name: "Marco", role: "member" },
    ];
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
});
