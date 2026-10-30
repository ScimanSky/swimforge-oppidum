import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => {
  const tx = { execute: vi.fn(async (_query?: unknown) => ({ rows: [] as unknown[] })) };
  const db = {
    execute: vi.fn(async (_query?: unknown) => ({ rows: [{ id: 9, email: "a@b.it", name: "A", open_id: null }] as unknown[] })),
    transaction: vi.fn(async (cb: (t: typeof tx) => Promise<void>) => cb(tx)),
  };
  const refs = { userId: 9, imageKitFileIds: ["story-file"], urls: ["https://x/clubs/1/9/a.jpg"], keepUrls: [] };
  return {
    tx,
    db,
    refs,
    order: [] as string[],
    /** Everything the transaction does, in order: «delete:<table>» or «sql:<statement>». */
    steps: [] as string[],
    ownedClubs: [] as Array<{ id: number; name: string; other_members: number }>,
    creatorColumnsNullable: true,
    /** Other active members seen once the clubs are locked (someone joined after the first check). */
    membersUnderLock: undefined as number | undefined,
    deleteFromIfExists: vi.fn(async (_tx: unknown, _table: string, _where?: unknown, _deps?: string[]) => true),
    relationExists: vi.fn(async () => true),
    collectUserMediaRefs: vi.fn(),
    cleanupDeletedAccount: vi.fn(),
    reportAccountCleanupFailure: vi.fn(),
  };
});

vi.mock("pg", () => ({
  Pool: class {
    query = vi.fn(async () => ({ rows: [] }));
    end = vi.fn(async () => {});
    on = vi.fn();
  },
}));
vi.mock("drizzle-orm/node-postgres", () => ({ drizzle: () => m.db }));
vi.mock("./lib/relation-exists", () => ({ deleteFromIfExists: m.deleteFromIfExists, relationExists: m.relationExists }));
vi.mock("./account_cleanup", () => ({
  collectUserMediaRefs: m.collectUserMediaRefs,
  cleanupDeletedAccount: m.cleanupDeletedAccount,
  reportAccountCleanupFailure: m.reportAccountCleanupFailure,
}));

const previousUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL = "postgres://test@localhost/test";
afterAll(() => {
  if (previousUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousUrl;
});

type Call = [unknown, string, { queryChunks?: unknown[] } | undefined, string[] | undefined];
const calls = () => m.deleteFromIfExists.mock.calls as unknown as Call[];
const tables = () => calls().map((call) => call[1]);
const callFor = (table: string) => calls().find((call) => call[1] === table);

/** A drizzle SQL as text, with the parameters as $ (drizzle SQL chunks). */
function sqlText(query: any): string {
  const flatten = (chunk: any): string => {
    if (chunk == null) return "";
    if (typeof chunk === "string") return chunk;
    if (Array.isArray(chunk?.value)) return chunk.value.join("");
    if (Array.isArray(chunk?.queryChunks)) return chunk.queryChunks.map(flatten).join("");
    return "$";
  };
  return flatten(query).replace(/\s+/g, " ").trim();
}

/** The WHERE clause as text, with the parameters as $n (drizzle SQL chunks). */
function whereText(table: string): string {
  return sqlText(callFor(table)?.[2]);
}

/** Every WHERE clause used on `table`, in order. */
const wheresFor = (table: string) => calls().filter((call) => call[1] === table).map((call) => sqlText(call[2]));
const step = (prefix: string) => m.steps.findIndex((entry) => entry.startsWith(prefix));

describe("deleteUserAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.order.length = 0;
    m.collectUserMediaRefs.mockImplementation(async () => {
      m.order.push("collect");
      return m.refs;
    });
    m.db.transaction.mockImplementation(async (cb: (t: typeof m.tx) => Promise<void>) => {
      m.order.push("transaction");
      return cb(m.tx);
    });
    m.cleanupDeletedAccount.mockImplementation(async () => {
      m.order.push("cleanup");
    });
    m.steps.length = 0;
    m.ownedClubs = [];
    m.creatorColumnsNullable = true;
    m.membersUnderLock = undefined;
    m.deleteFromIfExists.mockImplementation(async (_tx: unknown, table: string) => {
      m.steps.push(`delete:${table}`);
      return true;
    });
    m.db.execute.mockImplementation(async (query: unknown) => {
      if (/FROM community_clubs/.test(sqlText(query))) return { rows: m.ownedClubs };
      return { rows: [{ id: 9, email: "a@b.it", name: "A", open_id: null }] };
    });
    m.tx.execute.mockImplementation(async (query: unknown) => {
      const text = sqlText(query);
      if (text === "SELECT id FROM users WHERE id = $ FOR UPDATE") {
        m.steps.push("lock:user");
        return { rows: [{ id: 9 }] };
      }
      if (/FROM community_clubs/.test(text) && /FOR UPDATE/.test(text)) {
        m.steps.push("lock:clubs");
        return { rows: m.ownedClubs.map(({ id, name }) => ({ id, name })) };
      }
      if (/FROM community_club_members/.test(text) && /GROUP BY club_id/.test(text)) {
        m.steps.push("count:members");
        return {
          rows: m.ownedClubs.map((club) => ({ club_id: club.id, other_members: m.membersUnderLock ?? club.other_members })),
        };
      }
      if (/information_schema\.columns/.test(text)) {
        return { rows: [{ is_nullable: m.creatorColumnsNullable ? "YES" : "NO" }] };
      }
      m.steps.push(`sql:${text}`);
      return { rows: [] };
    });
  });

  it("deletes the user's push device tokens inside the transaction", async () => {
    const { deleteUserAccount } = await import("./db");
    await expect(deleteUserAccount(9)).resolves.toMatchObject({ id: 9 });
    expect(tables()).toContain("public.device_tokens");
    expect(callFor("public.device_tokens")?.[0]).toBe(m.tx);
  });

  it("deletes the swims explicitly: lengths, laps and the rows pointing at them before the swims", async () => {
    const { deleteUserAccount } = await import("./db");
    await deleteUserAccount(9);
    const order = tables();
    for (const table of [
      "public.garmin_activity_lengths",
      "public.garmin_activity_laps",
      "public.ghost_challenges",
      "public.challenge_activity_log",
      "public.swimming_activities",
    ]) {
      expect(order).toContain(table);
      expect(callFor(table)?.[0]).toBe(m.tx);
    }
    const index = (table: string) => order.indexOf(table);
    expect(index("public.garmin_activity_lengths")).toBeLessThan(index("public.garmin_activity_laps"));
    expect(index("public.garmin_activity_laps")).toBeLessThan(index("public.swimming_activities"));
    expect(index("public.ghost_challenges")).toBeLessThan(index("public.swimming_activities"));
    expect(index("public.activity_ai_insights")).toBeLessThan(index("public.swimming_activities"));
    expect(whereText("public.swimming_activities")).toBe("user_id = $");
    expect(whereText("public.garmin_activity_laps")).toContain("activity_id IN (SELECT id FROM swimming_activities WHERE user_id = $)");
    expect(whereText("public.garmin_activity_lengths")).toContain("activity_id IN (SELECT id FROM swimming_activities WHERE user_id = $)");
  });

  it("deletes the product engagement events as actor and as target, before the posts they point at", async () => {
    const { deleteUserAccount } = await import("./db");
    await deleteUserAccount(9);
    const where = whereText("public.product_engagement_events");
    expect(where).toContain("user_id = $");
    expect(where).toContain("entity_type = 'user_profile' AND entity_id = $");
    expect(where).toContain("entity_type = 'social_post' AND entity_id IN (SELECT id FROM social_posts WHERE user_id = $)");
    expect(tables().indexOf("public.product_engagement_events")).toBeLessThan(tables().indexOf("public.social_posts"));
    expect(callFor("public.product_engagement_events")?.[0]).toBe(m.tx);
  });

  it("reads the media before the transaction and cleans them up (with Garmin) after it", async () => {
    const { deleteUserAccount } = await import("./db");
    await deleteUserAccount(9);
    expect(m.collectUserMediaRefs).toHaveBeenCalledWith(m.db, 9, []);
    expect(m.cleanupDeletedAccount).toHaveBeenCalledWith({ ...m.refs, deletedClubIds: [] });
    expect(m.order).toEqual(["collect", "transaction", "cleanup"]);
  });

  it("answers without waiting for the provider cleanup, which runs detached", async () => {
    m.cleanupDeletedAccount.mockImplementation(() => new Promise(() => {}));
    const { deleteUserAccount } = await import("./db");
    await expect(deleteUserAccount(9)).resolves.toMatchObject({ id: 9 });
    expect(m.cleanupDeletedAccount).toHaveBeenCalledWith({ ...m.refs, deletedClubIds: [] });
  });

  it("logs a failed provider cleanup instead of throwing it", async () => {
    m.cleanupDeletedAccount.mockImplementation(async () => {
      throw new Error("imagekit down");
    });
    const { deleteUserAccount } = await import("./db");
    await expect(deleteUserAccount(9)).resolves.toMatchObject({ id: 9 });
    // Let the detached rejection settle: it must not surface as an unhandled rejection.
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Reported (error level and Rollbar), never thrown.
    expect(m.reportAccountCleanupFailure).toHaveBeenCalledWith(
      "account:external_cleanup_failed",
      expect.any(String),
      expect.objectContaining({ userId: 9, message: "imagekit down" }),
    );
  });

  it("touches no provider when the transaction fails", async () => {
    m.db.transaction.mockRejectedValueOnce(new Error("deadlock"));
    const { deleteUserAccount } = await import("./db");
    await expect(deleteUserAccount(9)).rejects.toThrow("deadlock");
    expect(m.cleanupDeletedAccount).not.toHaveBeenCalled();
  });

  it("still deletes the account when the media cannot be read", async () => {
    m.collectUserMediaRefs.mockRejectedValueOnce(new Error("timeout"));
    const { deleteUserAccount } = await import("./db");
    await expect(deleteUserAccount(9)).resolves.toMatchObject({ id: 9 });
    expect(m.cleanupDeletedAccount).toHaveBeenCalledWith({ userId: 9, imageKitFileIds: [], urls: [], keepUrls: [], deletedClubIds: [] });
  });

  describe("clubs and challenges of the deleted user", () => {
    it("refuses while the user owns a club with other active members, deleting nothing", async () => {
      m.ownedClubs = [
        { id: 3, name: "Rari Nantes", other_members: 4 },
        { id: 4, name: "Solo", other_members: 0 },
      ];
      const { deleteUserAccount, AccountDeletionBlockedError } = await import("./db");
      const error = await deleteUserAccount(9).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(AccountDeletionBlockedError);
      expect((error as InstanceType<typeof AccountDeletionBlockedError>).clubs).toEqual([
        { id: 3, name: "Rari Nantes", otherActiveMembers: 4 },
      ]);
      expect(tables()).toEqual([]);
      expect(m.steps.some((entry) => entry.includes("DELETE FROM users"))).toBe(false);
      expect(m.cleanupDeletedAccount).not.toHaveBeenCalled();
    });

    it("locks the user row first: a concurrent transfer to the user or a new club of theirs waits, then fails its foreign key", async () => {
      m.ownedClubs = [{ id: 4, name: "Solo", other_members: 0 }];
      const { deleteUserAccount } = await import("./db");
      await deleteUserAccount(9);
      expect(sqlText(m.tx.execute.mock.calls[0][0])).toBe("SELECT id FROM users WHERE id = $ FOR UPDATE");
      expect(m.steps[0]).toBe("lock:user");
    });

    it("refuses when a member joined between the first check and the lock, deleting nothing", async () => {
      m.ownedClubs = [{ id: 4, name: "Solo", other_members: 0 }];
      m.membersUnderLock = 1;
      const { deleteUserAccount, AccountDeletionBlockedError } = await import("./db");
      await expect(deleteUserAccount(9)).rejects.toBeInstanceOf(AccountDeletionBlockedError);
      expect(tables()).toEqual([]);
      expect(m.steps.some((entry) => entry.includes("DELETE FROM users"))).toBe(false);
    });

    it("locks the owned clubs, then counts the other active members in a statement of its own", async () => {
      m.ownedClubs = [{ id: 4, name: "Solo", other_members: 0 }];
      const { deleteUserAccount } = await import("./db");
      await deleteUserAccount(9);
      const texts = m.tx.execute.mock.calls.map((call) => sqlText(call[0]));
      const lock = texts.findIndex((text) => /FROM community_clubs/.test(text) && /FOR UPDATE/.test(text));
      expect(texts[lock]).toBe("SELECT id, name FROM community_clubs WHERE owner_id = $ ORDER BY id FOR UPDATE");
      // Its own snapshot, taken once the club rows are locked: a member who joined meanwhile counts.
      expect(texts[lock + 1]).toBe(
        "SELECT club_id, COUNT(*)::int AS other_members FROM community_club_members WHERE club_id IN ($) AND user_id <> $ AND status = 'active' GROUP BY club_id",
      );
      expect(m.steps.slice(0, 3)).toEqual(["lock:user", "lock:clubs", "count:members"]);
    });

    it("deletes a club with no other members explicitly, with its posts, before the user row", async () => {
      m.ownedClubs = [{ id: 4, name: "Solo", other_members: 0 }];
      const { deleteUserAccount } = await import("./db");
      await expect(deleteUserAccount(9)).resolves.toMatchObject({ id: 9 });
      const users = step("sql:DELETE FROM users");
      expect(users).toBeGreaterThan(-1);
      const club = step("delete:public.community_clubs");
      expect(club).toBeGreaterThan(-1);
      expect(club).toBeLessThan(users);
      expect(whereText("public.community_clubs")).toBe("id IN ($)");
      // The club's posts (whoever wrote them) go with the club: never into the public feed.
      expect(wheresFor("public.social_posts")).toContain("club_id IN ($)");
      expect(wheresFor("public.post_reactions")).toContain("post_id IN (SELECT id FROM social_posts WHERE club_id IN ($))");
      for (const table of [
        "public.community_club_members",
        "public.community_club_invites",
        "public.club_events",
        "public.club_announcements",
        "public.club_media",
      ]) {
        expect(wheresFor(table)).toContain("club_id IN ($)");
      }
      expect(wheresFor("public.event_attendees")).toContain("event_id IN (SELECT id FROM club_events WHERE club_id IN ($))");
      // Every member's «Segna completato» of the club's workouts, before the workouts.
      expect(wheresFor("public.club_workout_completions")).toContain("club_id IN ($)");
      expect(m.steps.indexOf("delete:public.club_workout_completions")).toBeLessThan(
        m.steps.indexOf("delete:public.club_pool_workouts"),
      );
      expect(m.steps.indexOf("delete:public.event_attendees")).toBeLessThan(m.steps.indexOf("delete:public.club_events"));
      // Its logo and cover are not kept on the providers, and its whole folder goes after the commit.
      expect(m.collectUserMediaRefs).toHaveBeenCalledWith(m.db, 9, [4]);
      expect(m.cleanupDeletedAccount).toHaveBeenCalledWith({ ...m.refs, deletedClubIds: [4] });
    });

    it("keeps the challenges the user created, with the creator set to null", async () => {
      const { deleteUserAccount } = await import("./db");
      await deleteUserAccount(9);
      expect(tables()).not.toContain("public.challenges");
      const release = step("sql:UPDATE challenges SET creator_id = NULL WHERE creator_id = $");
      expect(release).toBeGreaterThan(-1);
      expect(release).toBeLessThan(step("sql:DELETE FROM users"));
      // Events and invites of the user outlive the account too.
      expect(step("sql:UPDATE club_events SET creator_id = NULL WHERE creator_id = $")).toBeGreaterThan(-1);
      expect(step("sql:UPDATE community_club_invites SET inviter_id = NULL WHERE inviter_id = $")).toBeGreaterThan(-1);
    });

    it("keeps the reports the user only handled as a moderator, without the moderator", async () => {
      const { deleteUserAccount } = await import("./db");
      await deleteUserAccount(9);
      const where = whereText("public.social_post_reports");
      expect(where).toContain("reporter_user_id = $");
      expect(where).toContain("post_id IN (SELECT id FROM social_posts WHERE user_id = $)");
      expect(where).not.toContain("handled_by");
      const release = step("sql:UPDATE social_post_reports SET handled_by = NULL WHERE handled_by = $");
      expect(release).toBeGreaterThan(-1);
      expect(release).toBeLessThan(step("sql:DELETE FROM users"));
    });

    it("disables the club AI automations that post as the user", async () => {
      const { deleteUserAccount } = await import("./db");
      await deleteUserAccount(9);
      const disable = step("sql:UPDATE club_ai_automation_configs SET enabled = false, updated_at = NOW() WHERE actor_user_id = $");
      expect(disable).toBeGreaterThan(-1);
      expect(disable).toBeLessThan(step("sql:DELETE FROM users"));
      expect(tables()).not.toContain("public.club_ai_automation_configs");
    });

    it("does not null a creator column that is still NOT NULL (migration 0036 not run yet)", async () => {
      m.creatorColumnsNullable = false;
      const { deleteUserAccount } = await import("./db");
      await expect(deleteUserAccount(9)).resolves.toMatchObject({ id: 9 });
      expect(m.steps.some((entry) => entry.startsWith("sql:UPDATE challenges"))).toBe(false);
    });

    it("deletes even the clubs with members when asked to (the dev launch reset)", async () => {
      m.ownedClubs = [{ id: 3, name: "Rari Nantes", other_members: 4 }];
      const { deleteUserAccount } = await import("./db");
      await expect(deleteUserAccount(9, { ownedClubs: "delete" })).resolves.toMatchObject({ id: 9 });
      expect(whereText("public.community_clubs")).toBe("id IN ($)");
    });
  });

  it("deletes the user's club workout completions, in every club", async () => {
    const { deleteUserAccount } = await import("./db");
    await deleteUserAccount(9);
    expect(wheresFor("public.club_workout_completions")).toEqual(["user_id = $"]);
    expect(step("delete:public.club_workout_completions")).toBeLessThan(step("sql:DELETE FROM users"));
  });

  it("deletes the user's archived social XP, through the helper that skips a missing table", async () => {
    // The archive exists only after scripts/sql/2026-10-30-remove-social-xp.sql has run:
    // deleteFromIfExists checks to_regclass first (server/lib/relation-exists.ts).
    const { deleteUserAccount } = await import("./db");
    await deleteUserAccount(9);
    expect(wheresFor("public.xp_transactions_social_removed")).toEqual(["user_id = $"]);
    expect(step("delete:public.xp_transactions_social_removed")).toBeLessThan(step("sql:DELETE FROM users"));
  });

  it("deletes the user's presence row once (the table stays, nothing writes it any more)", async () => {
    const { deleteUserAccount } = await import("./db");
    await deleteUserAccount(9);
    expect(tables().filter((table) => table === "public.user_presence")).toHaveLength(1);
  });
});
