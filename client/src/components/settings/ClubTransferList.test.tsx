import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClubTransferList, type BlockingClub } from "./ClubTransferList";

const state = vi.hoisted(() => ({
  calls: [] as unknown[],
  fail: null as unknown,
  pending: false,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    community: {
      clubs: {
        transferOwnership: {
          useMutation: (options: any) => ({
            isPending: state.pending,
            mutate: (vars: unknown) => {
              state.calls.push(vars);
              if (state.fail) options?.onError?.(state.fail);
              else options?.onSuccess?.({ transferred: true }, vars);
            },
          }),
        },
      },
    },
  },
}));

const clubs: BlockingClub[] = [
  {
    id: 3,
    name: "Rari Nantes",
    otherActiveMembers: 2,
    members: [
      { userId: 12, name: "Giulia", username: "giulia" },
      { userId: 13, name: null, username: "marco" },
    ],
  },
  { id: 5, name: "Swim Team", otherActiveMembers: 1, members: [{ userId: 14, name: "Ada", username: null }] },
];

describe("ClubTransferList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.calls = [];
    state.fail = null;
    state.pending = false;
  });
  afterEach(cleanup);

  it("lists the clubs that block the deletion, each with «Trasferisci a…» and its members", () => {
    render(<ClubTransferList clubs={clubs} onTransferred={vi.fn()} />);
    const region = screen.getByRole("region", { name: "Club da trasferire" });
    expect(region).toHaveTextContent("Prima di eliminare l'account trasferisci i club di cui sei proprietario");
    const select = within(region).getByRole("combobox", { name: "Trasferisci a… Rari Nantes" });
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Scegli un membro",
      "Giulia (@giulia)",
      "@marco",
    ]);
    expect(within(region).getByRole("combobox", { name: "Trasferisci a… Swim Team" })).toBeInTheDocument();
    // Nothing chosen yet: nothing to transfer.
    expect(within(region).getAllByRole("button", { name: /^Trasferisci/ })[0]).toBeDisabled();
  });

  it("asks for confirmation, then transfers to the chosen member and refreshes", async () => {
    const onTransferred = vi.fn();
    render(<ClubTransferList clubs={clubs} onTransferred={onTransferred} />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Trasferisci a… Rari Nantes" }), "12");
    await userEvent.click(screen.getByRole("button", { name: "Trasferisci «Rari Nantes»" }));

    const dialog = screen.getByRole("dialog", { name: "Trasferire il club?" });
    expect(dialog).toHaveTextContent("«Rari Nantes» passerà a Giulia (@giulia), che ne diventerà proprietario. Tu resterai amministratore.");
    expect(state.calls).toEqual([]);
    await userEvent.click(within(dialog).getByRole("button", { name: "Conferma trasferimento" }));

    expect(state.calls).toEqual([{ clubId: 3, newOwnerId: 12 }]);
    expect(toast.success).toHaveBeenCalledWith("«Rari Nantes» ora è di Giulia (@giulia).");
    expect(onTransferred).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("cancelling the confirmation transfers nothing", async () => {
    render(<ClubTransferList clubs={clubs} onTransferred={vi.fn()} />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Trasferisci a… Swim Team" }), "14");
    await userEvent.click(screen.getByRole("button", { name: "Trasferisci «Swim Team»" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Annulla" }));
    expect(state.calls).toEqual([]);
  });

  it("shows the server's Italian message when the transfer fails", async () => {
    state.fail = Object.assign(new Error("Il nuovo proprietario deve essere un membro attivo del club."), {
      data: { code: "BAD_REQUEST" },
    });
    const onTransferred = vi.fn();
    render(<ClubTransferList clubs={clubs} onTransferred={onTransferred} />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Trasferisci a… Swim Team" }), "14");
    await userEvent.click(screen.getByRole("button", { name: "Trasferisci «Swim Team»" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Conferma trasferimento" }));
    expect(toast.error).toHaveBeenCalledWith("Il nuovo proprietario deve essere un membro attivo del club.");
    // The list may be stale (the member left): refreshed anyway.
    expect(onTransferred).toHaveBeenCalled();
  });

  it("renders nothing when no club blocks the deletion", () => {
    const { container } = render(<ClubTransferList clubs={[]} onTransferred={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
