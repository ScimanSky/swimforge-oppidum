import { beforeEach, describe, expect, it, vi } from "vitest";

// Transferring a club: only its owner, only to another active member. The new owner gets the
// owner role, the old one stays as admin (until they delete their account, if that is the goal).

const m = vi.hoisted(() => ({
  club: null as null | { owner_id: number },
  target: null as null | { status: string; role: string },
  statements: [] as string[],
  transaction: vi.fn(),
}));

function sqlText(query: any): string {
  const flatten = (chunk: any): string => {
    if (chunk == null) return "";
    if (Array.isArray(chunk?.value)) return chunk.value.join("");
    if (Array.isArray(chunk?.queryChunks)) return chunk.queryChunks.map(flatten).join("");
    return "$";
  };
  return flatten(query).replace(/\s+/g, " ").trim();
}

vi.mock("./db", () => {
  const tx = {
    execute: async (query: unknown) => {
      const text = sqlText(query);
      if (text.startsWith("SELECT owner_id FROM community_clubs")) return { rows: m.club ? [m.club] : [] };
      if (text.startsWith("SELECT status, role FROM community_club_members")) return { rows: m.target ? [m.target] : [] };
      m.statements.push(text);
      return { rows: [] };
    },
  };
  m.transaction.mockImplementation(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx));
  return { getDb: async () => ({ transaction: m.transaction }) };
});
vi.mock("./user_presence", () => ({ ensureUserPresenceSchema: async () => {}, getOnlineIntervalSql: () => "" }));

import { transferClubOwnership } from "./db_clubs";

describe("transferClubOwnership", () => {
  beforeEach(() => {
    m.club = { owner_id: 9 };
    m.target = { status: "active", role: "member" };
    m.statements.length = 0;
  });

  it("makes the member the owner and the old owner an admin, in one transaction", async () => {
    await expect(transferClubOwnership(9, 3, 12)).resolves.toEqual({ transferred: true, clubId: 3, ownerId: 12 });
    expect(m.transaction).toHaveBeenCalled();
    expect(m.statements).toEqual([
      "UPDATE community_clubs SET owner_id = $, updated_at = now() WHERE id = $",
      "UPDATE community_club_members SET role = 'owner' WHERE club_id = $ AND user_id = $",
      "UPDATE community_club_members SET role = 'admin' WHERE club_id = $ AND user_id = $",
    ]);
  });

  it("locks the club row while checking the owner", async () => {
    const execute = vi.fn();
    m.transaction.mockImplementationOnce(async (cb: (t: { execute: typeof execute }) => Promise<unknown>) => {
      execute.mockImplementation(async (query: unknown) => {
        const text = sqlText(query);
        if (text.startsWith("SELECT owner_id")) return { rows: [{ owner_id: 9 }] };
        if (text.startsWith("SELECT status")) return { rows: [{ status: "active", role: "member" }] };
        return { rows: [] };
      });
      return cb({ execute });
    });
    await transferClubOwnership(9, 3, 12);
    expect(sqlText(execute.mock.calls[0][0])).toBe("SELECT owner_id FROM community_clubs WHERE id = $ FOR UPDATE");
  });

  it("refuses anyone but the owner", async () => {
    await expect(transferClubOwnership(10, 3, 12)).rejects.toThrow("Forbidden");
    expect(m.statements).toEqual([]);
  });

  it("refuses a club that does not exist", async () => {
    m.club = null;
    await expect(transferClubOwnership(9, 3, 12)).rejects.toThrow("Club not found");
  });

  it("refuses a target that is not an active member", async () => {
    for (const target of [null, { status: "pending", role: "member" }, { status: "banned", role: "member" }, { status: "left", role: "admin" }]) {
      m.target = target;
      await expect(transferClubOwnership(9, 3, 12)).rejects.toThrow("Target not an active member");
    }
    expect(m.statements).toEqual([]);
  });

  it("refuses a transfer to oneself", async () => {
    await expect(transferClubOwnership(9, 3, 9)).rejects.toThrow("Target not an active member");
  });
});
