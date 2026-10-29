import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

// clubs.weeklyStats returns post/member counts and the next event's title: for clubs
// that are not public it must stay visible to members only, like clubs.members.

const { getClubByIdMock, getClubWeeklyStatsMock } = vi.hoisted(() => ({
  getClubByIdMock: vi.fn(),
  getClubWeeklyStatsMock: vi.fn(),
}));

vi.mock("../db_clubs", () => ({
  getClubById: getClubByIdMock,
  getClubWeeklyStats: getClubWeeklyStatsMock,
}));

import { communityRouter } from "./community.router";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 42,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "email",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const STATS = {
  posts_this_week: 3,
  active_members: 2,
  total_members: 9,
  next_event: { id: 5, title: "Allenamento segreto", startTime: "2026-11-02T18:00:00Z", eventType: "training" },
};

function club(visibility: string, isPrivate: boolean, isMember: boolean) {
  return { id: 12, visibility, is_private: isPrivate, is_member: isMember };
}

describe("community.clubs.weeklyStats access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getClubWeeklyStatsMock.mockResolvedValue(STATS);
  });

  it("is NOT_FOUND when the club does not exist", async () => {
    getClubByIdMock.mockResolvedValue(null);
    const caller = communityRouter.createCaller(createAuthContext());

    await expect(caller.clubs.weeklyStats({ clubId: 12 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(getClubByIdMock).toHaveBeenCalledWith(42, 12);
    expect(getClubWeeklyStatsMock).not.toHaveBeenCalled();
  });

  it.each([
    ["private", true],
    ["private", false],
    ["invite", true],
    ["invite", false],
    // Inconsistent legacy row: still treated as private, like clubs.get does.
    ["public", true],
  ])("is FORBIDDEN for a non-member (visibility=%s, is_private=%s)", async (visibility, isPrivate) => {
    getClubByIdMock.mockResolvedValue(club(visibility, isPrivate, false));
    const caller = communityRouter.createCaller(createAuthContext());

    await expect(caller.clubs.weeklyStats({ clubId: 12 })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Devi iscriverti al club per vedere le statistiche.",
    });
    expect(getClubWeeklyStatsMock).not.toHaveBeenCalled();
  });

  it.each([
    ["private", true],
    ["invite", true],
    ["public", false],
  ])("returns the stats to a member (visibility=%s, is_private=%s)", async (visibility, isPrivate) => {
    getClubByIdMock.mockResolvedValue(club(visibility, isPrivate, true));
    const caller = communityRouter.createCaller(createAuthContext());

    await expect(caller.clubs.weeklyStats({ clubId: 12 })).resolves.toEqual(STATS);
    expect(getClubWeeklyStatsMock).toHaveBeenCalledWith(12);
  });

  it("keeps a public club's stats readable by non-members", async () => {
    getClubByIdMock.mockResolvedValue(club("public", false, false));
    const caller = communityRouter.createCaller(createAuthContext());

    await expect(caller.clubs.weeklyStats({ clubId: 12 })).resolves.toEqual(STATS);
  });
});
