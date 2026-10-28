import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const db = {
    insert: vi.fn(),
    execute: vi.fn(),
  };
  return { db, sendPushToUser: vi.fn() };
});

vi.mock("./db", () => ({ getDb: vi.fn(async () => h.db) }));
vi.mock("./push", () => ({ sendPushToUser: h.sendPushToUser }));

import { createNotification, sendDirectMessage } from "./db_social_enhanced";

function insertReturning(row: Record<string, unknown>) {
  h.db.insert.mockReturnValue({ values: () => ({ returning: async () => [row] }) });
}

describe("push hooks in db_social_enhanced", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.sendPushToUser.mockResolvedValue({ sent: 1, failed: 0 });
  });

  it("createNotification pushes to the recipient with the post url", async () => {
    insertReturning({ id: 1 });
    await createNotification({
      userId: 7,
      type: "reaction",
      title: "Nuova reazione",
      message: "Ada ha reagito 🔥 al tuo post.",
      link: "/post/55",
      referenceId: 55,
    });
    expect(h.sendPushToUser).toHaveBeenCalledWith(7, {
      title: "Nuova reazione",
      body: "Ada ha reagito 🔥 al tuo post.",
      url: "/post/55",
    });
  });

  it("createNotification does not push to the actor and keeps the in-app row unchanged", async () => {
    const values = vi.fn(() => ({ returning: async () => [{ id: 9 }] }));
    h.db.insert.mockReturnValue({ values });
    await createNotification({
      userId: 7,
      type: "comment",
      title: "Nuovo commento",
      message: "m",
      link: "/post/1",
      referenceId: 1,
      actorId: 7,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(h.sendPushToUser).not.toHaveBeenCalled();
    expect(values).toHaveBeenCalledWith({
      userId: 7,
      type: "comment",
      title: "Nuovo commento",
      message: "m",
      link: "/post/1",
      referenceId: 1,
    });
  });

  it("createNotification pushes when the actor is someone else", async () => {
    insertReturning({ id: 10 });
    await createNotification({ userId: 7, type: "mention", title: "t", message: "m", link: "/post/2", actorId: 8 });
    await vi.waitFor(() => expect(h.sendPushToUser).toHaveBeenCalledWith(7, expect.objectContaining({ url: "/post/2" })));
  });

  it("createNotification keeps non-allowlisted types in-app only", async () => {
    insertReturning({ id: 11 });
    await createNotification({ userId: 7, type: "follow", title: "Nuovo follower", message: "m", link: "/u/8", actorId: 8 });
    await createNotification({ userId: 7, type: "meet_published", title: "t", message: "m", link: "/community/club/1/meet/2" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(h.sendPushToUser).not.toHaveBeenCalled();
    expect(h.db.insert).toHaveBeenCalledTimes(2);
  });

  it("createNotification does not fail when the push fails", async () => {
    insertReturning({ id: 2 });
    h.sendPushToUser.mockRejectedValue(new Error("boom"));
    await expect(
      createNotification({ userId: 7, type: "comment", title: "t", message: "m", link: "/post/1" }),
    ).resolves.toEqual({ id: 2 });
  });

  it("sendDirectMessage pushes to the receiver with the sender name and /messages", async () => {
    insertReturning({ id: 3, senderId: 1, receiverId: 2 });
    h.db.execute.mockResolvedValue({ rows: [{ name: "Ada" }] });
    await sendDirectMessage({ senderId: 1, receiverId: 2, content: "Ciao, domani in vasca?" });
    await vi.waitFor(() =>
      expect(h.sendPushToUser).toHaveBeenCalledWith(2, {
        title: "Ada",
        body: "Ciao, domani in vasca?",
        url: "/messages",
        tag: "dm",
      }),
    );
  });

  it("sendDirectMessage never notifies the sender about their own message", async () => {
    insertReturning({ id: 4, senderId: 1, receiverId: 1 });
    h.db.execute.mockResolvedValue({ rows: [{ name: "Ada" }] });
    await sendDirectMessage({ senderId: 1, receiverId: 1, content: "nota per me" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(h.sendPushToUser).not.toHaveBeenCalled();
  });
});
