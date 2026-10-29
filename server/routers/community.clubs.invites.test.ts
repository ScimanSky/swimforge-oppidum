import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const { listClubInvitesMock } = vi.hoisted(() => ({ listClubInvitesMock: vi.fn() }));

vi.mock("../db_clubs", () => ({ listClubInvites: listClubInvitesMock }));

import { communityRouter } from "./community.router";

function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 42,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
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

describe("community.clubs.invites", () => {
  beforeEach(() => {
    listClubInvitesMock.mockReset();
  });

  it("returns the counters in camelCase, as the client reads them", async () => {
    const createdAt = new Date("2026-10-29T08:00:00.000Z");
    // Raw SQL rows: snake_case, counters may come back as strings.
    listClubInvitesMock.mockResolvedValue([
      {
        id: 3,
        code: "abc123",
        role: "member",
        status: "active",
        max_uses: 10,
        used_count: "2",
        expires_at: null,
        created_at: createdAt,
      },
    ]);

    const invites = await communityRouter.createCaller(createAuthContext()).clubs.invites({ clubId: 7 });

    expect(listClubInvitesMock).toHaveBeenCalledWith(42, 7);
    expect(invites).toEqual([
      {
        id: 3,
        code: "abc123",
        role: "member",
        status: "active",
        maxUses: 10,
        usedCount: 2,
        expiresAt: null,
        createdAt,
      },
    ]);
  });
});
