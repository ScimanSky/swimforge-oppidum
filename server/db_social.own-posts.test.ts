import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// The author can delete or edit their own post at any time: a deleted post disappears for
// everyone (soft delete, every read filters is_deleted), an edit keeps the post where it is.

const dialect = new PgDialect();
const render = (query: unknown) => dialect.sqlToQuery(query as SQL);

const m = vi.hoisted(() => {
  const executed: unknown[] = [];
  const db = {
    execute: vi.fn(async (query: unknown): Promise<{ rows: unknown[] }> => {
      executed.push(query);
      return { rows: [] };
    }),
  };
  return { executed, db };
});

vi.mock("./db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./db")>()),
  getDb: async () => m.db,
}));

import { deleteOwnPost, setActivityShare, updateOwnPost } from "./db_social";

function respondWith(handler: (text: string, params: unknown[]) => { rows: unknown[] }) {
  m.db.execute.mockImplementation(async (query: unknown) => {
    m.executed.push(query);
    const { sql: text, params } = render(query);
    return handler(text, params);
  });
}

const OLD_POST = {
  id: 7,
  user_id: 42,
  activity_id: 99,
  club_id: null,
  is_deleted: false,
  tagged_user_ids: [],
  created_at: new Date("2026-01-01T10:00:00Z"),
};

beforeEach(() => {
  m.executed.length = 0;
  vi.clearAllMocks();
});

describe("deleteOwnPost", () => {
  it("deletes a post of months ago: no time window", async () => {
    respondWith((text) => (text.includes("SELECT") ? { rows: [OLD_POST] } : { rows: [] }));

    await expect(deleteOwnPost(42, 7)).resolves.toEqual({ deleted: true });

    const statements = m.executed.map((q) => render(q).sql);
    expect(statements.some((s) => /UPDATE social_posts SET is_deleted = true/.test(s))).toBe(true);
    // The swim goes back to «not shared», so «Condividi» shows again.
    expect(statements.some((s) => /UPDATE swimming_activities SET share_to_feed = false/.test(s))).toBe(true);
  });

  it("refuses another user's post", async () => {
    respondWith((text) => (text.includes("SELECT") ? { rows: [{ ...OLD_POST, user_id: 5 }] } : { rows: [] }));
    await expect(deleteOwnPost(42, 7)).rejects.toThrow("Cannot delete other users posts");
  });

  it("a post already deleted is not found", async () => {
    respondWith((text) => (text.includes("SELECT") ? { rows: [{ ...OLD_POST, is_deleted: true }] } : { rows: [] }));
    await expect(deleteOwnPost(42, 7)).rejects.toThrow("Post not found");
  });
});

describe("updateOwnPost", () => {
  it("saves the new text and photos of an old post", async () => {
    respondWith((text) => (text.includes("SELECT") ? { rows: [OLD_POST] } : { rows: [] }));

    const result = await updateOwnPost(42, 7, {
      content: "Nuovo testo",
      mediaUrls: ["https://cdn.example/a.jpg"],
    });

    expect(result).toMatchObject({ postId: 7 });
    const update = m.executed.map((q) => render(q)).find((q) => q.sql.includes("UPDATE social_posts"));
    expect(update?.params).toContain("Nuovo testo");
    expect(update?.params).toContain("https://cdn.example/a.jpg");
    // An edit does not move the post up in the feed.
    expect(update?.sql).not.toMatch(/created_at/);
  });

  it("an activity post without text or photos keeps the default caption", async () => {
    respondWith((text) =>
      text.includes("SELECT")
        ? { rows: [{ ...OLD_POST, activity_is_open_water: false }] }
        : { rows: [] },
    );
    await updateOwnPost(42, 7, { content: "  ", mediaUrls: [] });
    const update = m.executed.map((q) => render(q)).find((q) => q.sql.includes("UPDATE social_posts"));
    expect(update?.params).toContain("Allenamento in piscina");
  });

  it("a text post cannot become empty", async () => {
    respondWith((text) => (text.includes("SELECT") ? { rows: [{ ...OLD_POST, activity_id: null }] } : { rows: [] }));
    await expect(updateOwnPost(42, 7, { content: "", mediaUrls: [] })).rejects.toThrow("Empty post");
  });

  it("refuses another user's post", async () => {
    respondWith((text) => (text.includes("SELECT") ? { rows: [{ ...OLD_POST, user_id: 5 }] } : { rows: [] }));
    await expect(updateOwnPost(42, 7, { content: "x", mediaUrls: [] })).rejects.toThrow(
      "Cannot edit other users posts",
    );
  });
});

describe("setActivityShare", () => {
  it("sharing again a removed post brings back its text and photos", async () => {
    respondWith((text) => {
      if (text.includes("FROM swimming_activities")) return { rows: [{ id: 99 }] };
      if (text.includes("FROM social_posts")) return { rows: [{ id: 7, is_deleted: true }] };
      return { rows: [] };
    });

    await setActivityShare(42, 99, true);

    const statements = m.executed.map((q) => render(q).sql);
    const restore = statements.find((s) => s.includes("UPDATE social_posts"));
    expect(restore).toMatch(/is_deleted = false/);
    // Content and media are not overwritten.
    expect(restore).not.toMatch(/content =/);
    expect(restore).not.toMatch(/media_urls =/);
  });
});
