import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { TrpcContext } from "../_core/context";

// Forwarding copies a post's text and media into a direct message. A club post belongs
// to the active members of its club: it may reach only recipients who are members too,
// whatever visibility the row stores (club posts are stored as "public").

const SENDER_ID = 42;
const OWNER_ID = 5;
const CLUB_ID = 3;
const dialect = new PgDialect();
const render = (query: unknown) => dialect.sqlToQuery(query as SQL);

const m = vi.hoisted(() => {
  const state = {
    post: undefined as Record<string, unknown> | undefined,
    clubMemberIds: new Set<number>(),
  };
  const db = { execute: vi.fn() };
  return {
    state,
    db,
    getClubById: vi.fn(async (_userId: number, clubId: number) => ({ id: clubId, is_member: true })),
    sendDirectMessage: vi.fn(async (input: { receiverId: number }) => ({ id: input.receiverId })),
  };
});

vi.mock("../db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../db")>()),
  getDb: async () => m.db,
}));
vi.mock("../db_clubs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../db_clubs")>()),
  getClubById: m.getClubById,
}));
vi.mock("../db_social_enhanced", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../db_social_enhanced")>()),
  sendDirectMessage: m.sendDirectMessage,
}));

import { communityRouter } from "./community.router";

function respond(query: unknown) {
  const { sql: text, params } = render(query);
  const post = m.state.post;
  if (/SELECT id, user_id, club_id, visibility, is_deleted/.test(text)) {
    return { rows: post ? [{ ...post, is_deleted: false }] : [] };
  }
  if (/FROM social_posts p\s+JOIN users u/.test(text)) {
    return { rows: post ? [{ ...post, owner_name: "Ada" }] : [] };
  }
  if (/SELECT id, name\s+FROM users/.test(text)) {
    return { rows: params.map((id) => ({ id, name: `Utente ${id}` })) };
  }
  if (/FROM community_club_members/.test(text)) {
    const [clubId, userId] = params as number[];
    const member = clubId === Number(post?.club_id) && m.state.clubMemberIds.has(userId);
    return { rows: member ? [{ "?column?": 1 }] : [] };
  }
  return { rows: [] };
}

function ctx(): TrpcContext {
  return {
    user: {
      id: SENDER_ID,
      openId: "sender",
      email: "sender@example.com",
      name: "Sender",
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

const clubPost = {
  id: 7,
  user_id: OWNER_ID,
  club_id: CLUB_ID,
  content: "Allenamento segreto del club",
  media_url: "https://cdn.example.com/club.jpg",
  visibility: "public",
  activity_id: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  m.db.execute.mockImplementation(async (query: unknown) => respond(query));
  m.state.post = undefined;
  m.state.clubMemberIds = new Set([SENDER_ID, OWNER_ID]);
});

describe("messages.forward of a club post", () => {
  it("refuses a recipient who is not an active member of the club, sending nothing", async () => {
    m.state.post = clubPost;
    await expect(
      communityRouter.createCaller(ctx()).messages.forward({ targetType: "post", targetId: 7, recipientIds: [77] }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringMatching(/membri del club/),
    });
    expect(m.sendDirectMessage).not.toHaveBeenCalled();
  });

  it("delivers only to recipients who are active members and reports the others as blocked", async () => {
    m.state.post = clubPost;
    m.state.clubMemberIds.add(78);
    const result = await communityRouter
      .createCaller(ctx())
      .messages.forward({ targetType: "post", targetId: 7, recipientIds: [77, 78] });

    expect(m.sendDirectMessage).toHaveBeenCalledTimes(1);
    expect(m.sendDirectMessage).toHaveBeenCalledWith(expect.objectContaining({ receiverId: 78 }));
    expect(result.deliveredCount).toBe(1);
    expect(result.blockedRecipients).toEqual([
      expect.objectContaining({ userId: 77, reason: expect.stringMatching(/membri del club/) }),
    ]);
  });
});

describe("messages.forward of a post outside clubs", () => {
  it("still forwards a public post to any recipient", async () => {
    m.state.post = { ...clubPost, club_id: null, content: "Post pubblico" };
    const result = await communityRouter
      .createCaller(ctx())
      .messages.forward({ targetType: "post", targetId: 7, recipientIds: [77] });

    expect(result.deliveredCount).toBe(1);
    expect(m.sendDirectMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        receiverId: 77,
        metadata: expect.objectContaining({ previewText: "Post pubblico" }),
      }),
    );
  });
});
