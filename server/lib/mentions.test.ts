import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const h = vi.hoisted(() => {
  const state = { executed: [] as unknown[], results: [] as unknown[][] };
  const db = {
    execute: vi.fn(async (query: unknown) => {
      state.executed.push(query);
      return { rows: state.results.shift() ?? [] };
    }),
  };
  return { state, db, createNotification: vi.fn(async () => ({ id: 1 })) };
});

vi.mock("../db", () => ({ getDb: async () => h.db }));
vi.mock("../db_social_enhanced", () => ({ createNotification: h.createNotification }));

import { notifyMentionedUsers, resolveMentionedUserIds } from "./mentions";

const render = (query: unknown) => new PgDialect().sqlToQuery(query as SQL);

beforeEach(() => {
  h.state.executed.length = 0;
  h.state.results.length = 0;
  vi.clearAllMocks();
});

describe("resolveMentionedUserIds", () => {
  it("keeps the picked users whose @username or @name is still in the text", async () => {
    h.state.results.push([
      { id: 5, name: "Ada Rossi", username: "ada" },
      { id: 6, name: "Bea", username: null },
      { id: 8, name: "Carlo", username: "carlo" },
    ]);
    // Bea was picked and then deleted from the text; Carlo is written as his name.
    const ids = await resolveMentionedUserIds(42, "Vasca con @ada e @Carlo", [5, 6, 8]);
    expect(ids).toEqual([5, 8]);
    const { params } = render(h.state.executed[0]);
    expect(params).toEqual(expect.arrayContaining([5, 6, 8]));
  });

  it("never the author, never an invalid id, at most ten; no query without ids", async () => {
    await expect(resolveMentionedUserIds(42, "@me", [42, 0, -1])).resolves.toEqual([]);
    expect(h.db.execute).not.toHaveBeenCalled();
    await expect(resolveMentionedUserIds(42, "", [5])).resolves.toEqual([]);
    expect(h.db.execute).not.toHaveBeenCalled();

    const many = Array.from({ length: 12 }, (_, index) => ({ id: index + 1, name: null, username: `u${index + 1}` }));
    h.state.results.push(many);
    const text = many.map((user) => `@${user.username}`).join(" ");
    await expect(resolveMentionedUserIds(42, text, many.map((user) => user.id))).resolves.toHaveLength(10);
  });
});

describe("notifyMentionedUsers", () => {
  it("notifies only the mentioned users who can read the post, as a mention", async () => {
    h.state.results.push([{ id: 5 }], [{ name: "Ada" }]);
    await notifyMentionedUsers({ authorUserId: 42, mentionedUserIds: [5, 6], postId: 7, clubId: null });

    const readers = render(h.state.executed[0]);
    expect(readers.sql).toMatch(/is_deleted = false/);
    expect(readers.sql).toMatch(/visibility/);
    expect(readers.sql).toMatch(/community_club_members/);
    expect(readers.sql).toMatch(/status = 'active'/);
    expect(h.createNotification).toHaveBeenCalledTimes(1);
    expect(h.createNotification).toHaveBeenCalledWith({
      userId: 5,
      type: "mention",
      title: "Ti hanno menzionato",
      message: "Ada ti ha menzionato in un post.",
      link: "/post/7",
      referenceId: 7,
      actorId: 42,
    });
  });

  it("a club post links to the club; nobody to notify asks nothing", async () => {
    h.state.results.push([{ id: 5 }], [{ name: null }]);
    await notifyMentionedUsers({ authorUserId: 42, mentionedUserIds: [5], postId: 7, clubId: 3 });
    expect(h.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ link: "/community/club/3", message: "Qualcuno ti ha menzionato in un post." }),
    );

    vi.clearAllMocks();
    await notifyMentionedUsers({ authorUserId: 42, mentionedUserIds: [], postId: 7 });
    expect(h.db.execute).not.toHaveBeenCalled();
    expect(h.createNotification).not.toHaveBeenCalled();
  });

  it("is best effort: a failure never reaches the caller", async () => {
    h.db.execute.mockRejectedValueOnce(new Error("db down"));
    await expect(
      notifyMentionedUsers({ authorUserId: 42, mentionedUserIds: [5], postId: 7 }),
    ).resolves.toBeUndefined();
  });
});
