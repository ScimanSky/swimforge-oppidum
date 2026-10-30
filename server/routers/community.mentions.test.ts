import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

// Every composer sends the users it picked after «@»: the server keeps those still written in the
// text, stores them on the post and tells them; an edit tells only the new ones. No hashtags.

const m = vi.hoisted(() => {
  const inserted: unknown[] = [];
  const db = {
    insert: vi.fn(() => ({
      values: (values: unknown) => {
        inserted.push(values);
        return { returning: async () => [{ id: 70 }] };
      },
    })),
  };
  return {
    inserted,
    db,
    resolveMentionedUserIds: vi.fn(),
    notifyMentionedUsers: vi.fn(async () => {}),
    upsertActivityPost: vi.fn(async () => 71),
    updateOwnPost: vi.fn(),
    getOwnPostForEdit: vi.fn(),
    getClubById: vi.fn(async () => ({ id: 3, is_member: true })),
    createClubPost: vi.fn(async () => 72),
  };
});

vi.mock("../lib/mentions", () => ({
  MAX_MENTIONS_PER_POST: 10,
  resolveMentionedUserIds: m.resolveMentionedUserIds,
  notifyMentionedUsers: m.notifyMentionedUsers,
}));
vi.mock("./_shared", async () => {
  const actual = await vi.importActual<typeof import("./_shared")>("./_shared");
  return {
    ...actual,
    upsertActivityPost: m.upsertActivityPost,
    updateOwnPost: m.updateOwnPost,
    getOwnPostForEdit: m.getOwnPostForEdit,
  };
});
vi.mock("../db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../db")>()),
  getDb: vi.fn(async () => m.db),
}));
vi.mock("../db_clubs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../db_clubs")>()),
  getClubById: m.getClubById,
  createClubPost: m.createClubPost,
}));
vi.mock("../product_analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../product_analytics")>()),
  trackProductEvent: vi.fn(async () => {}),
}));

import { communityRouter } from "./community.router";

function ctx(): TrpcContext {
  return {
    user: {
      id: 42,
      openId: "mentions",
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

const caller = () => communityRouter.createCaller(ctx());

beforeEach(() => {
  vi.clearAllMocks();
  m.inserted.length = 0;
  m.resolveMentionedUserIds.mockResolvedValue([5]);
});

describe("mentions when publishing", () => {
  it("text post: keeps the mentions still in the text, stores no hashtags, tells them", async () => {
    await caller().createTextPost({ content: "Bravi @ada #nuoto", taggedUserIds: [5, 6] });
    expect(m.resolveMentionedUserIds).toHaveBeenCalledWith(42, "Bravi @ada #nuoto", [5, 6]);
    expect(m.inserted[0]).toMatchObject({ taggedUserIds: [5] });
    expect(m.inserted[0]).not.toHaveProperty("hashtags");
    expect(m.notifyMentionedUsers).toHaveBeenCalledWith({
      authorUserId: 42,
      mentionedUserIds: [5],
      postId: 70,
      clubId: null,
    });
  });

  it("shared swim: the same", async () => {
    await caller().createPost({ activityId: 9, content: "Con @ada", taggedUserIds: [5] });
    expect(m.upsertActivityPost).toHaveBeenCalledWith(42, 9, expect.objectContaining({ taggedUserIds: [5] }));
    expect(m.upsertActivityPost.mock.calls[0][2]).not.toHaveProperty("hashtags");
    expect(m.notifyMentionedUsers).toHaveBeenCalledWith(expect.objectContaining({ mentionedUserIds: [5], postId: 71 }));
  });

  it("club post: the same, linked to the club; no XP for posting", async () => {
    const answer = await caller().clubs.createPost({ clubId: 3, content: "Con @ada", taggedUserIds: [5] });
    expect(answer).toEqual({ success: true, postId: 72 });
    expect(m.createClubPost).toHaveBeenCalledWith(42, 3, expect.objectContaining({ taggedUserIds: [5] }));
    expect(m.createClubPost.mock.calls[0][2]).not.toHaveProperty("hashtags");
    expect(m.notifyMentionedUsers).toHaveBeenCalledWith({
      authorUserId: 42,
      mentionedUserIds: [5],
      postId: 72,
      clubId: 3,
    });
  });

  it("hashtags sent by an old build are ignored, not refused", async () => {
    await expect(
      caller().createTextPost({ content: "ciao", hashtags: ["nuoto"] } as never),
    ).resolves.toMatchObject({ success: true });
  });
});

describe("mentions when editing", () => {
  it("stores the mentions of the new text and tells only the new ones", async () => {
    m.resolveMentionedUserIds.mockResolvedValue([5, 8]);
    m.updateOwnPost.mockResolvedValue({ postId: 7, clubId: null, addedTaggedUserIds: [8] });
    await caller().updatePost({ postId: 7, content: "Con @ada e @carlo", taggedUserIds: [5, 8] });
    expect(m.resolveMentionedUserIds).toHaveBeenCalledWith(42, "Con @ada e @carlo", [5, 8]);
    expect(m.updateOwnPost).toHaveBeenCalledWith(42, 7, {
      content: "Con @ada e @carlo",
      mediaUrls: [],
      taggedUserIds: [5, 8],
    });
    expect(m.notifyMentionedUsers).toHaveBeenCalledWith({
      authorUserId: 42,
      mentionedUserIds: [8],
      postId: 7,
      clubId: null,
    });
  });

  it("an old build sends no ids: the post's mentions still in the text stay, nobody new is told", async () => {
    m.getOwnPostForEdit.mockResolvedValue({ id: 7, taggedUsers: [{ userId: 5 }, { userId: 6 }] });
    m.updateOwnPost.mockResolvedValue({ postId: 7, clubId: 3, addedTaggedUserIds: [] });
    await caller().updatePost({ postId: 7, content: "Solo @ada" });
    expect(m.getOwnPostForEdit).toHaveBeenCalledWith(42, { postId: 7 });
    expect(m.resolveMentionedUserIds).toHaveBeenCalledWith(42, "Solo @ada", [5, 6]);
    expect(m.updateOwnPost).toHaveBeenCalledWith(42, 7, expect.objectContaining({ taggedUserIds: [5] }));
    expect(m.notifyMentionedUsers).toHaveBeenCalledWith(expect.objectContaining({ mentionedUserIds: [], clubId: 3 }));
  });
});
