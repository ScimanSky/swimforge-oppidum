import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A club the user owns with other active members blocks the account deletion until it is
// transferred: the server refuses with PRECONDITION_FAILED and an Italian message.

const m = vi.hoisted(() => ({
  getUserById: vi.fn(),
  verifyUserPassword: vi.fn(),
  deleteUserAccount: vi.fn(),
  getAccountDeletionBlockers: vi.fn(),
  sendAccountDeletionConfirmationEmail: vi.fn(),
  deleteAuthUser: vi.fn(),
  captureError: vi.fn(),
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
vi.mock("../_core/supabase_admin", () => ({
  getSupabaseAdminClient: () => ({ auth: { admin: { deleteUser: m.deleteAuthUser } } }),
}));
vi.mock("../middleware/rollbar-init", () => ({ captureError: m.captureError }));

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

  describe("password confirmation", () => {
    const SUPABASE_ID = "3f0c1d9e-6a4b-4c2d-9e8f-1a2b3c4d5e6f";

    it("a Supabase account never needs a local password, even if the row carries one", async () => {
      m.getUserById.mockResolvedValue({ id: 9, openId: SUPABASE_ID, passwordHash: "$2a$10$someone-else", loginMethod: "google" });
      await expect(caller().deleteAccount({})).resolves.toMatchObject({ success: true });
      expect(m.verifyUserPassword).not.toHaveBeenCalled();
      await expect(caller().deleteAccountStatus()).resolves.toMatchObject({ requiresPassword: false });
    });

    it("a legacy local account (no Supabase identity) still confirms with its password", async () => {
      m.getUserById.mockResolvedValue({ id: 9, openId: null, passwordHash: "$2a$10$own", loginMethod: "email" });
      await expect(caller().deleteAccount({})).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(m.deleteUserAccount).not.toHaveBeenCalled();
      await expect(caller().deleteAccountStatus()).resolves.toMatchObject({ requiresPassword: true });
    });
  });

  describe("after the rows are gone", () => {
    const SUPABASE_ID = "3f0c1d9e-6a4b-4c2d-9e8f-1a2b3c4d5e6f";
    const never = () => new Promise<never>(() => {});

    beforeEach(() => {
      m.deleteUserAccount.mockResolvedValue({ id: 9, email: "a@b.it", name: "A", openId: SUPABASE_ID });
      m.deleteAuthUser.mockResolvedValue({ data: {}, error: null });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("deletes the Supabase Auth user", async () => {
      await expect(caller().deleteAccount({})).resolves.toEqual({ success: true, emailSent: true });
      expect(m.deleteAuthUser).toHaveBeenCalledWith(SUPABASE_ID);
      expect(m.captureError).not.toHaveBeenCalled();
    });

    it("gives up a Supabase Auth delete that never answers after 15 s, and reports it to Rollbar", async () => {
      vi.useFakeTimers();
      m.deleteAuthUser.mockReturnValue(never());
      const pending = caller().deleteAccount({});
      await vi.advanceTimersByTimeAsync(15_000);
      await expect(pending).resolves.toMatchObject({ success: true });
      expect(m.captureError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ event: "account:supabase_auth_delete_failed", userId: 9 }),
      );
    });

    it("reports a Supabase Auth delete answered with an error", async () => {
      m.deleteAuthUser.mockResolvedValue({ data: null, error: { message: "User not allowed" } });
      await expect(caller().deleteAccount({})).resolves.toMatchObject({ success: true });
      expect(m.captureError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ event: "account:supabase_auth_delete_failed", message: "User not allowed" }),
      );
    });

    it("waits at most 10 s for the confirmation email, then answers without it", async () => {
      vi.useFakeTimers();
      m.sendAccountDeletionConfirmationEmail.mockReturnValue(never());
      const pending = caller().deleteAccount({});
      await vi.advanceTimersByTimeAsync(10_000);
      await expect(pending).resolves.toEqual({ success: true, emailSent: false });
    });

    it("runs the two side by side: the answer waits at most 15 s in all", async () => {
      vi.useFakeTimers();
      m.deleteAuthUser.mockReturnValue(never());
      m.sendAccountDeletionConfirmationEmail.mockReturnValue(never());
      const pending = caller().deleteAccount({});
      let settled = false;
      void pending.then(() => (settled = true));
      await vi.advanceTimersByTimeAsync(15_000);
      expect(settled).toBe(true);
      await expect(pending).resolves.toEqual({ success: true, emailSent: false });
    });
  });
});

