import { beforeEach, describe, expect, it, vi } from "vitest";
import { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// Direct message reads: the stored type and metadata reach the client (a forwarded post is a
// card, not plain text), and the conversation list is one query.

const dialect = new PgDialect();

const h = vi.hoisted(() => {
  const state = { executed: [] as unknown[], results: [] as unknown[][] };
  const db = {
    select: vi.fn(() => {
      throw new Error("no query builder reads expected");
    }),
    execute: vi.fn(async (query: unknown) => {
      state.executed.push(query);
      return { rows: state.results.shift() ?? [] };
    }),
  };
  return { state, db };
});

vi.mock("./db", () => ({ getDb: async () => h.db }));
vi.mock("./push", () => ({ sendPushToUser: vi.fn() }));

import { getConversation, getRecentConversations } from "./db_social_enhanced";

const render = (query: unknown) => dialect.sqlToQuery(query as SQL);

const forwardMetadata = {
  targetType: "post",
  targetId: 42,
  ownerName: "Ada",
  previewText: "Mille metri",
  previewMediaUrl: null,
};

beforeEach(() => {
  h.state.executed.length = 0;
  h.state.results.length = 0;
  vi.clearAllMocks();
});

describe("getConversation", () => {
  it("returns the stored message type and metadata", async () => {
    h.state.results.push([
      {
        id: 2,
        senderId: 5,
        receiverId: 1,
        content: "Post inoltrato da Ada",
        messageType: "forward_post",
        metadata: forwardMetadata,
        userId: 5,
        userName: "Bea",
        createdAt: new Date("2026-10-30T10:00:00Z"),
      },
      {
        id: 1,
        senderId: 1,
        receiverId: 5,
        content: "ciao",
        messageType: "text",
        metadata: null,
        userId: 1,
        userName: "Io",
        createdAt: new Date("2026-10-30T09:00:00Z"),
      },
    ]);
    const result = await getConversation({ userId1: 1, userId2: 5 });
    const { sql } = render(h.state.executed[0]);
    expect(sql).toMatch(/dm\.message_type AS "messageType"/);
    expect(sql).toMatch(/dm\.metadata/);
    // Chronological order, each with its own type.
    expect(result.map((row) => row.message.id)).toEqual([1, 2]);
    expect(result[0].message).toMatchObject({ messageType: "text", metadata: null });
    expect(result[1].message).toMatchObject({ messageType: "forward_post", metadata: forwardMetadata });
  });

  it("reads metadata stored as a JSON string and treats unknown types as text", async () => {
    h.state.results.push([
      { id: 3, senderId: 5, receiverId: 1, content: "x", messageType: "forward_post", metadata: JSON.stringify(forwardMetadata), userId: 5 },
      { id: 4, senderId: 5, receiverId: 1, content: "y", messageType: "sticker", metadata: "{oops", userId: 5 },
    ]);
    const result = await getConversation({ userId1: 1, userId2: 5 });
    const byId = new Map(result.map((row) => [row.message.id, row.message]));
    expect(byId.get(3)).toMatchObject({ messageType: "forward_post", metadata: forwardMetadata });
    expect(byId.get(4)).toMatchObject({ messageType: "text", metadata: null });
  });
});

describe("getRecentConversations", () => {
  it("is one query: the latest message per person and their unread count", async () => {
    h.state.results.push([
      {
        id: 11,
        senderId: 6,
        receiverId: 1,
        content: "Post inoltrato da Ada",
        messageType: "forward_post",
        metadata: forwardMetadata,
        isRead: false,
        readAt: null,
        createdAt: new Date("2026-10-30T10:00:00Z"),
        otherUserId: 6,
        otherName: "Bea",
        otherUsername: "bea",
        otherAvatarUrl: "https://img/bea.jpg",
        unreadCount: "3",
      },
      {
        id: 7,
        senderId: 1,
        receiverId: 5,
        content: "ciao",
        messageType: "text",
        metadata: null,
        isRead: true,
        readAt: null,
        createdAt: new Date("2026-10-29T10:00:00Z"),
        otherUserId: 5,
        otherName: null,
        otherUsername: null,
        otherAvatarUrl: null,
        unreadCount: 0,
      },
    ]);
    const result = await getRecentConversations(1, 20);

    expect(h.db.execute).toHaveBeenCalledTimes(1);
    expect(h.db.select).not.toHaveBeenCalled();
    const { sql, params } = render(h.state.executed[0]);
    expect(sql).toMatch(/DISTINCT ON/i);
    expect(sql).toMatch(/is_read = false/i);
    expect(sql).toMatch(/LIMIT/i);
    expect(params).toContain(20);

    expect(result).toEqual([
      {
        lastMessage: {
          id: 11,
          senderId: 6,
          receiverId: 1,
          content: "Post inoltrato da Ada",
          messageType: "forward_post",
          metadata: forwardMetadata,
          isRead: false,
          readAt: null,
          createdAt: new Date("2026-10-30T10:00:00Z"),
        },
        otherUser: { id: 6, username: "Bea", profilePicture: "https://img/bea.jpg" },
        unreadCount: 3,
      },
      {
        lastMessage: {
          id: 7,
          senderId: 1,
          receiverId: 5,
          content: "ciao",
          messageType: "text",
          metadata: null,
          isRead: true,
          readAt: null,
          createdAt: new Date("2026-10-29T10:00:00Z"),
        },
        otherUser: { id: 5, username: "Utente #5", profilePicture: null },
        unreadCount: 0,
      },
    ]);
  });

  it("caps the limit at 50", async () => {
    await getRecentConversations(1, 500);
    expect(render(h.state.executed[0]).params).toContain(50);
  });
});
