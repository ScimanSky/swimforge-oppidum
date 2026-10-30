import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

// Comments, splashes and reactions read or touch a post: they must follow the same
// readability rule as the post itself. A club post belongs to the active members of
// its club, a private post to its author.

const VIEWER_ID = 42;

const m = vi.hoisted(() => {
  const state = {
    post: undefined as Record<string, unknown> | undefined,
    isMember: false,
  };
  const db = {
    execute: vi.fn(async () => ({ rows: state.post ? [state.post] : [] })),
  };
  return {
    state,
    db,
    addComment: vi.fn(async () => 99),
    getComments: vi.fn(async () => [{ id: 1, content: "Bel lavoro" }]),
    toggleSplash: vi.fn(async () => ({ splashed: true })),
    getClubById: vi.fn(async (_userId: number, clubId: number) => ({ id: clubId, is_member: state.isMember })),
    togglePostReaction: vi.fn(async () => ({ reactionType: "fire" })),
    getPostReactions: vi.fn(async () => []),
    getUserPostReaction: vi.fn(async () => null),
    createNotification: vi.fn(async () => undefined),
  };
});

vi.mock("../db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../db")>()),
  getDb: async () => m.db,
}));

vi.mock("./_shared", async () => {
  const actual = await vi.importActual<typeof import("./_shared")>("./_shared");
  return {
    ...actual,
    addComment: m.addComment,
    getComments: m.getComments,
    toggleSplash: m.toggleSplash,
    invalidateUserCache: vi.fn(async () => undefined),
    invalidateLeaderboardCache: vi.fn(async () => undefined),
  };
});

vi.mock("../db_clubs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../db_clubs")>()),
  getClubById: m.getClubById,
}));

vi.mock("../db_social_enhanced", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../db_social_enhanced")>()),
  togglePostReaction: m.togglePostReaction,
  getPostReactions: m.getPostReactions,
  getUserPostReaction: m.getUserPostReaction,
  createNotification: m.createNotification,
}));

import { communityRouter } from "./community.router";

function ctx(): TrpcContext {
  return {
    user: {
      id: VIEWER_ID,
      openId: "viewer",
      email: "viewer@example.com",
      name: "Viewer",
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

const clubPost = { id: 7, user_id: 5, club_id: 3, visibility: "public", is_deleted: false };
const privatePost = { id: 8, user_id: 5, club_id: null, visibility: "private", is_deleted: false };
const publicPost = { id: 9, user_id: 5, club_id: null, visibility: "public", is_deleted: false };

beforeEach(() => {
  vi.clearAllMocks();
  m.state.post = undefined;
  m.state.isMember = false;
});

describe("club post interactions by a non-member", () => {
  beforeEach(() => {
    m.state.post = clubPost;
    m.state.isMember = false;
  });

  it("comments: forbidden, the comments are never read", async () => {
    await expect(communityRouter.createCaller(ctx()).comments({ postId: 7 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(m.getComments).not.toHaveBeenCalled();
  });

  it("addComment: forbidden, nothing is written", async () => {
    await expect(
      communityRouter.createCaller(ctx()).addComment({ postId: 7, content: "Ciao" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(m.addComment).not.toHaveBeenCalled();
  });

  it("toggleSplash: forbidden, no splash is stored", async () => {
    await expect(communityRouter.createCaller(ctx()).toggleSplash({ postId: 7 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(m.toggleSplash).not.toHaveBeenCalled();
  });

  it("reactions.list, userReaction and toggle: forbidden", async () => {
    const caller = communityRouter.createCaller(ctx());
    await expect(caller.reactions.list({ postId: 7 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.reactions.userReaction({ postId: 7 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.reactions.toggle({ postId: 7, reactionType: "fire" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(m.getPostReactions).not.toHaveBeenCalled();
    expect(m.getUserPostReaction).not.toHaveBeenCalled();
    expect(m.togglePostReaction).not.toHaveBeenCalled();
  });
});

describe("club post interactions by an active member", () => {
  beforeEach(() => {
    m.state.post = clubPost;
    m.state.isMember = true;
  });

  it("reads and writes comments and splashes", async () => {
    const caller = communityRouter.createCaller(ctx());
    await expect(caller.comments({ postId: 7 })).resolves.toEqual([{ id: 1, content: "Bel lavoro" }]);
    await expect(caller.addComment({ postId: 7, content: "Ciao" })).resolves.toMatchObject({
      success: true,
      commentId: 99,
    });
    await expect(caller.toggleSplash({ postId: 7 })).resolves.toMatchObject({ splashed: true });
    expect(m.getClubById).toHaveBeenCalledWith(VIEWER_ID, 3);
    expect(m.addComment).toHaveBeenCalledWith(VIEWER_ID, 7, "Ciao");
    expect(m.toggleSplash).toHaveBeenCalledWith(VIEWER_ID, 7);
  });
});

describe("other readability rules", () => {
  it("a private post of another user: comments, addComment and toggleSplash are forbidden", async () => {
    m.state.post = privatePost;
    const caller = communityRouter.createCaller(ctx());
    await expect(caller.comments({ postId: 8 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.addComment({ postId: 8, content: "Ciao" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.toggleSplash({ postId: 8 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(m.getComments).not.toHaveBeenCalled();
    expect(m.addComment).not.toHaveBeenCalled();
    expect(m.toggleSplash).not.toHaveBeenCalled();
  });

  it("a missing or deleted post: not found", async () => {
    const caller = communityRouter.createCaller(ctx());
    await expect(caller.comments({ postId: 404 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    m.state.post = { ...publicPost, is_deleted: true };
    await expect(caller.addComment({ postId: 9, content: "Ciao" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(m.addComment).not.toHaveBeenCalled();
  });

  it("a public post outside clubs stays open to every logged-in user", async () => {
    m.state.post = publicPost;
    const caller = communityRouter.createCaller(ctx());
    await expect(caller.comments({ postId: 9 })).resolves.toHaveLength(1);
    await expect(caller.addComment({ postId: 9, content: "Ciao" })).resolves.toMatchObject({ success: true });
    await expect(caller.toggleSplash({ postId: 9 })).resolves.toMatchObject({ splashed: true });
    expect(m.getClubById).not.toHaveBeenCalled();
  });
});

describe("XP only from swimming", () => {
  it("comments, splashes and reactions give no XP: no XP in the answer, no XP helper left", async () => {
    m.state.post = publicPost;
    const caller = communityRouter.createCaller(ctx());
    const comment = await caller.addComment({ postId: 9, content: "Ciao" });
    const splash = await caller.toggleSplash({ postId: 9 });
    const reaction = await caller.reactions.toggle({ postId: 9, reactionType: "fire" });
    for (const answer of [comment, splash, reaction]) expect(answer).not.toHaveProperty("actionXp");
    const shared = await vi.importActual<Record<string, unknown>>("./_shared");
    expect(shared).not.toHaveProperty("awardActionXp");
  });
});
