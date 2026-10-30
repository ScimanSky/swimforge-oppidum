import { beforeEach, describe, expect, it, vi } from "vitest";

// A club the user owns with other active members blocks the account deletion until it is
// transferred: the server refuses with PRECONDITION_FAILED and an Italian message.

const m = vi.hoisted(() => ({
  getUserById: vi.fn(),
  verifyUserPassword: vi.fn(),
  deleteUserAccount: vi.fn(),
  getAccountDeletionBlockers: vi.fn(),
  sendAccountDeletionConfirmationEmail: vi.fn(),
}));

vi.mock("./_shared", async () => {
  const actual = await vi.importActual<typeof import("./_shared")>("./_shared");
  return {
    ...actual,
    db: {
      ...actual.db,
      getUserById: m.getUserById,
      verifyUserPassword: m.verifyUserPassword,
      deleteUserAccount: m.deleteUserAccount,
      getAccountDeletionBlockers: m.getAccountDeletionBlockers,
    },
  };
});
vi.mock("../_core/email", () => ({ sendAccountDeletionConfirmationEmail: m.sendAccountDeletionConfirmationEmail }));

import { AccountDeletionBlockedError } from "../account_clubs";
import { authRouter } from "./auth.router";

const caller = () =>
  authRouter.createCaller({
    user: { id: 9, email: "a@b.it" } as any,
    req: { protocol: "https", headers: {} } as any,
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as any,
  });

const blocking = [
  {
    id: 3,
    name: "Rari Nantes",
    otherActiveMembers: 2,
    members: [
      { userId: 12, name: "Giulia", username: "giulia" },
      { userId: 13, name: "Marco", username: null },
    ],
  },
];

describe("auth.deleteAccount with owned clubs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.getUserById.mockResolvedValue({ id: 9, passwordHash: null, loginMethod: "google" });
    m.getAccountDeletionBlockers.mockResolvedValue([]);
    m.deleteUserAccount.mockResolvedValue({ id: 9, email: "a@b.it", name: "A", openId: null });
    m.sendAccountDeletionConfirmationEmail.mockResolvedValue(true);
  });

  it("refuses while the user owns a club with other active members", async () => {
    m.getAccountDeletionBlockers.mockResolvedValue(blocking);
    await expect(caller().deleteAccount({})).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("«Rari Nantes»"),
    });
    expect(m.deleteUserAccount).not.toHaveBeenCalled();
  });

  it("refuses when a member joined meanwhile (the transaction finds the club still shared)", async () => {
    m.deleteUserAccount.mockRejectedValue(new AccountDeletionBlockedError([{ id: 3, name: "Rari Nantes", otherActiveMembers: 1 }]));
    await expect(caller().deleteAccount({})).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("Trasferisci la proprietà"),
    });
    expect(m.sendAccountDeletionConfirmationEmail).not.toHaveBeenCalled();
  });

  it("deletes the account when no owned club has other members", async () => {
    await expect(caller().deleteAccount({})).resolves.toMatchObject({ success: true });
    expect(m.deleteUserAccount).toHaveBeenCalledWith(9);
  });

  it("lists the blocking clubs and their members in the deletion status", async () => {
    m.getAccountDeletionBlockers.mockResolvedValue(blocking);
    await expect(caller().deleteAccountStatus()).resolves.toEqual({
      requiresPassword: false,
      loginMethod: "google",
      blockingClubs: blocking,
    });
  });
});
