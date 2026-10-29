import { beforeEach, describe, expect, it, vi } from "vitest";
import { Column, is, sql, SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// Endpoints that show other users (feed, comments, club members, DMs, public
// profiles, search, meets) must never hand their email, or any part of it, to a
// regular user (GDPR).

const dialect = new PgDialect();

const m = vi.hoisted(() => {
  const state = {
    selections: [] as unknown[],
    wheres: [] as unknown[],
    executed: [] as unknown[],
    selectResults: [] as unknown[][],
    executeResults: [] as unknown[][],
  };
  const makeChain = () => {
    const chain: any = {};
    for (const method of ["from", "innerJoin", "leftJoin", "groupBy", "orderBy", "limit", "offset"]) {
      chain[method] = vi.fn(() => chain);
    }
    chain.where = vi.fn((condition: unknown) => {
      state.wheres.push(condition);
      return chain;
    });
    chain.then = (resolve: (rows: unknown[]) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(state.selectResults.shift() ?? []).then(resolve, reject);
    return chain;
  };
  const db = {
    select: vi.fn((selection?: unknown) => {
      state.selections.push(selection);
      return makeChain();
    }),
    execute: vi.fn(async (query: unknown) => {
      state.executed.push(query);
      return { rows: state.executeResults.shift() ?? [] };
    }),
  };
  return { state, db };
});

vi.mock("./db", () => ({ getDb: async () => m.db }));
vi.mock("./user_presence", () => ({
  ensureUserPresenceSchema: async () => {},
  getOnlineIntervalSql: () => sql`now()`,
}));

function render(query: unknown): string {
  return dialect.sqlToQuery(query as SQL).sql;
}

function selectionColumns(selection: unknown): { keys: string[]; columns: string[] } {
  const keys: string[] = [];
  const columns: string[] = [];
  const visit = (value: unknown) => {
    if (is(value, Column)) {
      columns.push(value.name);
      return;
    }
    if (is(value, SQL)) return;
    if (value && typeof value === "object") {
      const tableColumns = (value as any)[Symbol.for("drizzle:Columns")];
      if (tableColumns) {
        for (const col of Object.values(tableColumns)) visit(col);
        return;
      }
      for (const [key, nested] of Object.entries(value)) {
        keys.push(key);
        visit(nested);
      }
    }
  };
  visit(selection);
  return { keys, columns };
}

function expectNoEmailInSelections() {
  for (const selection of m.state.selections) {
    const { keys, columns } = selectionColumns(selection);
    expect(keys).not.toContain("email");
    expect(columns).not.toContain("email");
  }
}

beforeEach(() => {
  m.state.selections.length = 0;
  m.state.wheres.length = 0;
  m.state.executed.length = 0;
  m.state.selectResults.length = 0;
  m.state.executeResults.length = 0;
});

describe("feed and comments", () => {
  it("social feed and comments never read users.email and expose the username", async () => {
    const { getSocialFeed, getComments } = await import("./db_social");
    await getSocialFeed(1, { scope: "global" });
    await getComments(7);
    expect(m.state.executed).toHaveLength(2);
    for (const query of m.state.executed) {
      const text = render(query);
      expect(text).not.toMatch(/email/i);
      expect(text).toMatch(/AS user_username/);
    }
  });
});

describe("clubs", () => {
  it("member lists (active, pending, banned) and the club feed never read users.email", async () => {
    const { listClubMembers, listClubMembersByStatus, getClubFeed } = await import("./db_clubs");
    await listClubMembers(3);
    await listClubMembersByStatus(3, "pending");
    await listClubMembersByStatus(3, "banned");
    await getClubFeed(1, 3);
    expect(m.state.executed).toHaveLength(4);
    for (const query of m.state.executed) {
      const text = render(query);
      expect(text).not.toMatch(/email/i);
      expect(text).toMatch(/AS user_username/);
    }
  });
});

describe("direct messages", () => {
  it("a conversation derives the sender name from name/username, never from the email", async () => {
    const { getConversation } = await import("./db_social_enhanced");
    m.state.executeResults.push([
      { id: 1, senderId: 5, receiverId: 1, content: "ciao", userId: 5, userName: "", userUsername: "squalo" },
      { id: 2, senderId: 6, receiverId: 1, content: "ehi", userId: 6, userName: null, userUsername: null },
    ]);
    const result: any = await getConversation({ userId1: 1, userId2: 5 });
    expect(render(m.state.executed[0])).not.toMatch(/email/i);
    const json = JSON.stringify(result);
    expect(json).not.toMatch(/email/i);
    const usernames = (result.messages ?? result).map((row: any) => row.sender.username);
    expect(usernames).toContain("squalo");
    expect(usernames).toContain("Utente #6");
  });

  it("the conversation list selects no email and falls back to the username", async () => {
    const { getRecentConversations } = await import("./db_social_enhanced");
    const now = new Date();
    m.state.selectResults.push(
      [
        { id: 10, senderId: 5, receiverId: 1, content: "a", isRead: true, readAt: null, createdAt: now },
        { id: 11, senderId: 1, receiverId: 6, content: "b", isRead: true, readAt: null, createdAt: now },
      ],
      [],
      [
        { id: 5, name: "  ", username: "squalo", profilePicture: null },
        { id: 6, name: null, username: null, profilePicture: null },
      ],
    );
    const result: any[] = await getRecentConversations(1);
    expectNoEmailInSelections();
    expect(JSON.stringify(result)).not.toMatch(/email/i);
    const names = result.map((row) => row.otherUser.username);
    expect(names).toEqual(["squalo", "Utente #6"]);
  });
});

describe("public profiles and search", () => {
  it("getUserPublicProfile never selects or returns the email", async () => {
    const { getUserPublicProfile } = await import("./db_public_profiles");
    m.state.selectResults.push(
      [{ userId: 5, name: "Ada", username: "ada", privacySettings: null }],
      [{ count: 2 }],
      [{ count: 3 }],
      [],
      [],
    );
    const profile = await getUserPublicProfile({ viewerUserId: 1, targetUserId: 5 });
    expectNoEmailInSelections();
    expect(profile).not.toBeNull();
    expect(Object.keys(profile!)).not.toContain("email");
  });

  it("searchUsers does not match nor rank users by email", async () => {
    const { searchUsers } = await import("./db_public_profiles");
    await searchUsers(1, "mario@example.com");
    expectNoEmailInSelections();
    expect(m.state.wheres.length).toBeGreaterThan(0);
    for (const where of m.state.wheres) expect(render(where)).not.toMatch(/email/i);
  });
});

describe("club meets", () => {
  const meet = { id: 9, clubId: 3, status: "published" };
  const entryRow = () => ({
    entry: { id: 1, status: "pending" },
    eventId: 2,
    eventLabel: "100 SL",
    user: { id: 5, name: "Ada", email: "ada@example.com", username: "ada", lastName: "Lovelace", avatarUrl: null },
  });
  const resultRow = () => ({
    result: { id: 1, athleteName: "Ada", athleteEmail: "ada@example.com", rank: 1 },
    event: { id: 2, label: "100 SL", programOrder: 1 },
    user: { id: 5, name: "Ada", email: "ada@example.com", username: "ada", avatarUrl: null },
    importBatch: null,
  });

  it("a regular member sees meet entries and results without emails", async () => {
    const { listClubMeetEntries, listMeetResults } = await import("./db_club_meets");
    m.state.selectResults.push([meet], [{ role: "member", status: "active" }], [], [entryRow()]);
    const entries: any = await listClubMeetEntries({ userId: 1, meetId: 9 });
    expect(entries.isStaff).toBe(false);
    // The key stays (null) so the response type is the same for staff and members.
    expect(JSON.stringify(entries.entries)).not.toContain("ada@example.com");
    expect(entries.entries[0].user.email).toBeNull();
    expect(entries.entries[0].user.username).toBe("ada");

    m.state.selectResults.push([meet], [{ role: "member", status: "active" }], [resultRow()]);
    const results: any = await listMeetResults({ userId: 1, meetId: 9 });
    expect(JSON.stringify(results.rows)).not.toContain("ada@example.com");
    expect(results.rows[0].result.athleteEmail).toBeNull();
    expect(results.rows[0].user.email).toBeNull();
    expect(results.rows[0].result.athleteName).toBe("Ada");
  });

  it("club staff still get the emails needed for the meet roster export", async () => {
    const { listClubMeetEntries, listMeetResults } = await import("./db_club_meets");
    m.state.selectResults.push([meet], [{ role: "coach", status: "active" }], [], [entryRow()]);
    const entries: any = await listClubMeetEntries({ userId: 1, meetId: 9 });
    expect(entries.isStaff).toBe(true);
    expect(entries.entries[0].user.email).toBe("ada@example.com");

    m.state.selectResults.push([meet], [{ role: "owner", status: "active" }], [resultRow()]);
    const results: any = await listMeetResults({ userId: 1, meetId: 9 });
    expect(results.rows[0].result.athleteEmail).toBe("ada@example.com");
  });

  it("meet stats leaderboard never reads emails", async () => {
    const { getMeetStats } = await import("./db_club_meets");
    m.state.selectResults.push([meet], [{ role: "member", status: "active" }]);
    await getMeetStats({ userId: 1, meetId: 9 });
    expect(m.state.executed.length).toBeGreaterThan(0);
    for (const query of m.state.executed) expect(render(query)).not.toMatch(/email/i);
  });
});
