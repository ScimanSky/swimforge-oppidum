import { beforeEach, describe, expect, it, vi } from "vitest";

// «Coach» is a club role the owner can assign and an invite can carry; only owner and admin
// create coach (or moderator) invites, a moderator invites members only.

const m = vi.hoisted(() => {
  const state = { actorRole: "owner", targetRole: "member", updates: [] as unknown[], inserts: [] as unknown[] };
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ role: state.actorRole, status: "active" }],
        }),
      }),
    }),
    update: () => ({
      set: (values: unknown) => ({
        where: async () => {
          state.updates.push(values);
        },
      }),
    }),
    insert: () => ({
      values: (values: unknown) => ({
        returning: async () => {
          state.inserts.push(values);
          return [{ id: 1, code: "abc" }];
        },
      }),
    }),
  };
  return { state, db };
});

vi.mock("./db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./db")>()),
  getDb: async () => m.db,
}));

import { createClubInvite, updateMemberRole } from "./db_clubs";

beforeEach(() => {
  m.state.actorRole = "owner";
  m.state.updates = [];
  m.state.inserts = [];
});

describe("club role «coach»", () => {
  it("the owner makes a member coach", async () => {
    // The fake returns the same role for actor and target: the target must not be owner.
    m.state.actorRole = "owner";
    const select = vi.spyOn(m.db, "select");
    let call = 0;
    select.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ role: call++ === 0 ? "owner" : "member", status: "active" }],
        }),
      }),
    }));
    await expect(updateMemberRole(1, 9, 2, "coach")).resolves.toEqual({ updated: true });
    expect(m.state.updates).toEqual([{ role: "coach" }]);
    select.mockRestore();
  });

  it.each(["owner", "admin"])("%s creates a coach invite", async (role) => {
    m.state.actorRole = role;
    await createClubInvite(1, 9, { role: "coach", maxUses: 1 });
    expect(m.state.inserts[0]).toMatchObject({ role: "coach", maxUses: 1 });
  });

  it("a moderator cannot create a coach invite, only member ones", async () => {
    m.state.actorRole = "moderator";
    await expect(createClubInvite(1, 9, { role: "coach" })).rejects.toThrow("Forbidden");
    await expect(createClubInvite(1, 9, { role: "member" })).resolves.toMatchObject({ code: "abc" });
  });

  it("a coach cannot create invites", async () => {
    m.state.actorRole = "coach";
    await expect(createClubInvite(1, 9, { role: "member" })).rejects.toThrow("Forbidden");
  });
});
