import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const {
  getClubMemberRoleMock,
  publishClubWorkoutMock,
  listClubWorkoutRecipientsMock,
  createNotificationMock,
} = vi.hoisted(() => ({
  getClubMemberRoleMock: vi.fn(),
  publishClubWorkoutMock: vi.fn(),
  listClubWorkoutRecipientsMock: vi.fn(),
  createNotificationMock: vi.fn(),
}));

vi.mock("../db_clubs", () => ({
  getClubMemberRole: getClubMemberRoleMock,
}));

vi.mock("../db_club_workouts", () => ({
  publishClubWorkout: publishClubWorkoutMock,
  listClubWorkoutRecipients: listClubWorkoutRecipientsMock,
}));

vi.mock("../db_social_enhanced", () => ({
  createNotification: createNotificationMock,
}));

import { communityRouter } from "./community.router";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 42,
    openId: "workout-publish-user",
    email: "coach@example.com",
    name: "Coach User",
    loginMethod: "email",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("community.clubs.workouts.coach.publish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getClubMemberRoleMock.mockResolvedValue({ role: "coach", status: "active" });
  });

  it("publishes workout and notifies active members except actor", async () => {
    publishClubWorkoutMock.mockResolvedValue({
      changed: true,
      workout: { id: 33, clubId: 10, title: "Workout martedì", status: "published" },
    });
    listClubWorkoutRecipientsMock.mockResolvedValue([
      { userId: 42 },
      { userId: 7 },
      { userId: 9 },
    ]);
    createNotificationMock.mockResolvedValue({ ok: true });

    const caller = communityRouter.createCaller(createAuthContext());
    const result = await caller.clubs.workouts.coach.publish({ workoutId: 33 });

    expect(result).toMatchObject({
      success: true,
      changed: true,
      notifiedCount: 2,
    });
    expect(createNotificationMock).toHaveBeenCalledTimes(2);
  });

  it("does not notify members when workout is already published", async () => {
    publishClubWorkoutMock.mockResolvedValue({
      changed: false,
      workout: { id: 33, clubId: 10, title: "Workout martedì", status: "published" },
    });

    const caller = communityRouter.createCaller(createAuthContext());
    const result = await caller.clubs.workouts.coach.publish({ workoutId: 33 });

    expect(result).toMatchObject({
      success: true,
      changed: false,
      notifiedCount: 0,
    });
    expect(listClubWorkoutRecipientsMock).not.toHaveBeenCalled();
    expect(createNotificationMock).not.toHaveBeenCalled();
  });
});
