import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const m = vi.hoisted(() => ({
  deleteOwnPost: vi.fn(),
  updateOwnPost: vi.fn(),
  getOwnPostForEdit: vi.fn(),
}));

vi.mock("./_shared", async () => {
  const actual = await vi.importActual<typeof import("./_shared")>("./_shared");
  return { ...actual, ...m };
});

vi.mock("../db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../db")>()),
  getDb: vi.fn(async () => null),
}));

import { communityRouter } from "./community.router";

function ctx(): TrpcContext {
  return {
    user: {
      id: 42,
      openId: "own-posts",
      email: "me@example.com",
      name: "Me",
      loginMethod: "email",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

beforeEach(() => vi.clearAllMocks());

describe("community.deletePost", () => {
  it("deletes an old post without any time limit", async () => {
    m.deleteOwnPost.mockResolvedValue({ deleted: true });
    await expect(communityRouter.createCaller(ctx()).deletePost({ postId: 7 })).resolves.toEqual({ deleted: true });
    expect(m.deleteOwnPost).toHaveBeenCalledWith(42, 7);
  });

  it("another user's post: «Puoi eliminare solo i tuoi post»", async () => {
    m.deleteOwnPost.mockRejectedValue(new Error("Cannot delete other users posts"));
    await expect(communityRouter.createCaller(ctx()).deletePost({ postId: 7 })).rejects.toThrow(
      "Puoi eliminare solo i tuoi post",
    );
  });
});

describe("community.updatePost", () => {
  it("saves text and photos of the author's post", async () => {
    m.updateOwnPost.mockResolvedValue({ postId: 7, clubId: null, addedTaggedUserIds: [] });
    const result = await communityRouter.createCaller(ctx()).updatePost({
      postId: 7,
      content: "Testo corretto",
      mediaUrls: ["https://cdn.example/a.jpg", "https://cdn.example/a.jpg"],
    });
    expect(result).toEqual({ success: true, postId: 7 });
    expect(m.updateOwnPost).toHaveBeenCalledWith(42, 7, {
      content: "Testo corretto",
      mediaUrls: ["https://cdn.example/a.jpg"],
      taggedUserIds: [],
    });
  });

  it("an empty text post: «Inserisci un testo o almeno un media.»", async () => {
    m.updateOwnPost.mockRejectedValue(new Error("Empty post"));
    await expect(
      communityRouter.createCaller(ctx()).updatePost({ postId: 7, content: "", mediaUrls: [] }),
    ).rejects.toThrow("Inserisci un testo o almeno un media.");
  });

  it("a club post after leaving the club: FORBIDDEN, deleting stays possible", async () => {
    m.updateOwnPost.mockRejectedValue(new Error("Not a club member"));
    await expect(
      communityRouter.createCaller(ctx()).updatePost({ postId: 7, content: "x" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Non fai più parte del club: puoi eliminare il post, non modificarlo.",
    });
  });

  it("a club post longer than 1000 characters: «al massimo 1000 caratteri»", async () => {
    m.updateOwnPost.mockRejectedValue(new Error("Content too long"));
    await expect(
      communityRouter.createCaller(ctx()).updatePost({ postId: 7, content: "x".repeat(1001) }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Un post del club può avere al massimo 1000 caratteri." });
  });

  it("an unexpected error does not reach the client", async () => {
    m.updateOwnPost.mockRejectedValue(new Error('column "media_urls" does not exist'));
    await expect(
      communityRouter.createCaller(ctx()).updatePost({ postId: 7, content: "x" }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "Non riesco a salvare il post. Riprova." });
  });

  it("another user's post: «Puoi modificare solo i tuoi post»", async () => {
    m.updateOwnPost.mockRejectedValue(new Error("Cannot edit other users posts"));
    await expect(
      communityRouter.createCaller(ctx()).updatePost({ postId: 7, content: "x" }),
    ).rejects.toThrow("Puoi modificare solo i tuoi post");
  });
});

describe("community.ownPost", () => {
  it("finds the post of a shared swim", async () => {
    m.getOwnPostForEdit.mockResolvedValue({ id: 7, activityId: 99, clubId: null, content: "", mediaUrls: [], taggedUsers: [] });
    await expect(communityRouter.createCaller(ctx()).ownPost({ activityId: 99 })).resolves.toMatchObject({ id: 7 });
    expect(m.getOwnPostForEdit).toHaveBeenCalledWith(42, { activityId: 99 });
  });

  it("no post: «Post non trovato»", async () => {
    m.getOwnPostForEdit.mockResolvedValue(null);
    await expect(communityRouter.createCaller(ctx()).ownPost({ postId: 8 })).rejects.toThrow("Post non trovato");
  });
});

describe("community.latestSwim", () => {
  it("the most recent swim, with whether it is already in the feed", async () => {
    const { getDb } = await import("../db");
    const execute = vi.fn(async () => ({
      rows: [{ id: 99, activity_name: "Soglia", activity_date: "2026-10-28T08:00:00Z", share_to_feed: true }],
    }));
    vi.mocked(getDb).mockResolvedValue({ execute } as never);
    await expect(communityRouter.createCaller(ctx()).latestSwim()).resolves.toEqual({
      id: 99,
      activityName: "Soglia",
      activityDate: "2026-10-28T08:00:00Z",
      shared: true,
    });
  });

  it("«shared» only with a live post: a swim marked shared whose post is gone opens the share sheet", async () => {
    const { getDb } = await import("../db");
    const execute = vi.fn(async (_query: unknown) => ({
      rows: [{ id: 99, activity_name: "Soglia", activity_date: "2026-10-28T08:00:00Z", share_to_feed: false }],
    }));
    vi.mocked(getDb).mockResolvedValue({ execute } as never);
    await expect(communityRouter.createCaller(ctx()).latestSwim()).resolves.toMatchObject({ shared: false });
    const { PgDialect } = await import("drizzle-orm/pg-core");
    const text = new PgDialect().sqlToQuery(execute.mock.calls[0][0] as never).sql;
    expect(text).toMatch(/a\.share_to_feed AND EXISTS \(\s+SELECT 1 FROM social_posts p\s+WHERE p\.activity_id = a\.id AND p\.user_id = a\.user_id AND p\.is_deleted = false/);
  });

  it("the share sheet finds that swim too (unsharedActivities with includeActivityId)", async () => {
    const { getDb } = await import("../db");
    const execute = vi.fn(async (_query: unknown) => ({ rows: [] as unknown[] }));
    execute.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 99 }] });
    vi.mocked(getDb).mockResolvedValue({ execute } as never);
    await expect(communityRouter.createCaller(ctx()).unsharedActivities({ includeActivityId: 99 })).resolves.toEqual([
      { id: 99 },
    ]);
    const { PgDialect } = await import("drizzle-orm/pg-core");
    const included = new PgDialect().sqlToQuery(execute.mock.calls[1][0] as never).sql;
    expect(included).toMatch(/a\.share_to_feed = false\s+OR NOT EXISTS/);
  });

  it("no swims yet: null", async () => {
    const { getDb } = await import("../db");
    vi.mocked(getDb).mockResolvedValue({ execute: vi.fn(async () => ({ rows: [] })) } as never);
    await expect(communityRouter.createCaller(ctx()).latestSwim()).resolves.toBeNull();
  });
});
