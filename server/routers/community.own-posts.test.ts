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

  it("no swims yet: null", async () => {
    const { getDb } = await import("../db");
    vi.mocked(getDb).mockResolvedValue({ execute: vi.fn(async () => ({ rows: [] })) } as never);
    await expect(communityRouter.createCaller(ctx()).latestSwim()).resolves.toBeNull();
  });
});
