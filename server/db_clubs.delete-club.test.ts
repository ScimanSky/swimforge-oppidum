import { beforeEach, describe, expect, it, vi } from "vitest";

// Deleting a club removes its rows explicitly, posts included: the social_posts.club_id foreign
// key only sets null, which would surface the club's posts in the public feed.

const m = vi.hoisted(() => ({
  ownerId: 9 as number | null,
  deleteClubRows: vi.fn(async () => {}),
  tx: { execute: vi.fn() },
}));

vi.mock("./db", () => ({
  getDb: async () => ({ transaction: async (cb: (tx: typeof m.tx) => Promise<unknown>) => cb(m.tx) }),
}));
vi.mock("./account_clubs", () => ({ deleteClubRows: m.deleteClubRows }));
vi.mock("./user_presence", () => ({ ensureUserPresenceSchema: async () => {}, getOnlineIntervalSql: () => "" }));

import { deleteClub } from "./db_clubs";

describe("deleteClub", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.ownerId = 9;
    m.tx.execute.mockImplementation(async () => ({ rows: m.ownerId === null ? [] : [{ owner_id: m.ownerId }] }));
  });

  it("deletes the club and all its rows, posts included, in the same transaction", async () => {
    await expect(deleteClub(9, 3)).resolves.toEqual({ success: true });
    expect(m.deleteClubRows).toHaveBeenCalledWith(m.tx, [3]);
  });

  it("refuses anyone but the owner", async () => {
    await expect(deleteClub(10, 3)).rejects.toThrow("Forbidden");
    expect(m.deleteClubRows).not.toHaveBeenCalled();
  });

  it("refuses a club that does not exist", async () => {
    m.ownerId = null;
    await expect(deleteClub(9, 3)).rejects.toThrow("Club not found");
  });
});
