import { beforeEach, describe, expect, it, vi } from "vitest";

// Every path that makes someone an active member takes FOR SHARE on the club row, in the same
// transaction as the write: it waits for an account deletion that holds the club (FOR UPDATE) and
// then finds no club, or the deletion waits for it and then counts the new member.

const m = vi.hoisted(() => ({
  statements: [] as string[],
  club: { id: 3, visibility: "public", rules: null } as null | Record<string, unknown>,
  member: null as null | { id: number; status: string; role: string },
  actor: { role: "owner", status: "active" } as null | { role: string; status: string },
  transactions: 0,
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
  const execute = async (query: unknown) => {
    const text = sqlText(query);
    m.statements.push(text);
    if (/FROM community_clubs WHERE id = \$ FOR SHARE/.test(text)) return { rows: m.club ? [m.club] : [] };
    if (/FROM community_club_members WHERE club_id = \$ AND user_id = \$/.test(text)) return { rows: m.member ? [m.member] : [] };
    if (/FROM community_club_invites/.test(text)) {
      return { rows: [{ id: 1, club_id: 3, role: "member", status: "active", max_uses: 5, used_count: 0, expires_at: null }] };
    }
    if (/UPDATE community_club_invites/.test(text)) return { rows: [{ club_id: 3 }] };
    return { rows: [] };
  };
  // Drizzle builders used by acceptClubInvite and getClubMemberRole.
  const chain = (rows: unknown[]): any => {
    const c: any = { from: () => c, where: () => c, limit: async () => rows };
    return c;
  };
  const tx = {
    execute,
    select: () => chain(m.member ? [m.member] : []),
    insert: () => ({ values: async () => m.statements.push("insert member") }),
    update: () => ({ set: () => ({ where: async () => m.statements.push("update member") }) }),
  };
  const db = {
    ...tx,
    select: () => chain(m.actor ? [m.actor] : []),
    transaction: async (cb: (t: typeof tx) => Promise<unknown>) => {
      m.transactions += 1;
      m.statements.push("BEGIN");
      const result = await cb(tx);
      m.statements.push("COMMIT");
      return result;
    },
  };
  return { getDb: async () => db };
});
vi.mock("./user_presence", () => ({ ensureUserPresenceSchema: async () => {}, getOnlineIntervalSql: () => "" }));

import { acceptClubInvite, approveJoinRequest, joinClub, unbanMember } from "./db_clubs";

const LOCK = "SELECT id, visibility, rules FROM community_clubs WHERE id = $ FOR SHARE";

describe("membership writes lock the club row", () => {
  beforeEach(() => {
    m.statements.length = 0;
    m.transactions = 0;
    m.club = { id: 3, visibility: "public", rules: null };
    m.member = null;
    m.actor = { role: "owner", status: "active" };
  });

  it("join: locks the club, then writes the membership, in one transaction", async () => {
    await expect(joinClub(9, 3)).resolves.toEqual({ joined: true });
    expect(m.statements[0]).toBe("BEGIN");
    expect(m.statements[1]).toBe(LOCK);
    expect(m.statements.at(-2)).toMatch(/^INSERT INTO community_club_members/);
    expect(m.statements.at(-1)).toBe("COMMIT");
  });

  it("rejoin of a member who had left: same lock before the update", async () => {
    m.member = { id: 40, status: "left", role: "member" };
    await expect(joinClub(9, 3)).resolves.toEqual({ joined: true });
    expect(m.statements[1]).toBe(LOCK);
    expect(m.statements.at(-2)).toBe("UPDATE community_club_members SET status = $, joined_at = NOW() WHERE id = $");
  });

  it("join of a club deleted meanwhile: «Club not found», nothing written", async () => {
    m.club = null;
    await expect(joinClub(9, 3)).rejects.toThrow("Club not found");
    expect(m.statements.some((text) => /INSERT|UPDATE/.test(text))).toBe(false);
  });

  it("keeps the rules, bans and private clubs as before", async () => {
    m.club = { id: 3, visibility: "public", rules: "Regole" };
    await expect(joinClub(9, 3)).rejects.toThrow("Rules not accepted");
    m.club = { id: 3, visibility: "private", rules: null };
    await expect(joinClub(9, 3)).resolves.toEqual({ requested: true });
    m.member = { id: 40, status: "banned", role: "member" };
    await expect(joinClub(9, 3)).rejects.toThrow("Banned");
  });

  it("approving a request locks the club before activating the member", async () => {
    await expect(approveJoinRequest(1, 3, 9)).resolves.toEqual({ approved: true });
    const begin = m.statements.indexOf("BEGIN");
    expect(m.statements[begin + 1]).toBe(LOCK);
    expect(m.statements[begin + 2]).toBe(
      "UPDATE community_club_members SET status = 'active', joined_at = NOW() WHERE club_id = $ AND user_id = $ AND status = 'pending'",
    );
  });

  it("unbanning locks the club before activating the member", async () => {
    await expect(unbanMember(1, 3, 9)).resolves.toEqual({ unbanned: true });
    const begin = m.statements.indexOf("BEGIN");
    expect(m.statements[begin + 1]).toBe(LOCK);
    expect(m.statements[begin + 2]).toBe("UPDATE community_club_members SET status = 'active' WHERE club_id = $ AND user_id = $");
  });

  it("accepting an invite locks the club right after the invite", async () => {
    await expect(acceptClubInvite(9, "abc")).resolves.toEqual({ joined: true, clubId: 3 });
    const invite = m.statements.findIndex((text) => /FROM community_club_invites/.test(text));
    expect(m.statements[invite + 1]).toBe(LOCK);
  });
});
