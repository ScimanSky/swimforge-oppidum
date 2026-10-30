import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const m = vi.hoisted(() => ({
  setClubWorkoutCompletion: vi.fn(),
  getClubWorkoutCompletion: vi.fn(),
  trackProductEvent: vi.fn(),
}));

vi.mock("../db_club_workouts", () => ({
  setClubWorkoutCompletion: m.setClubWorkoutCompletion,
  getClubWorkoutCompletion: m.getClubWorkoutCompletion,
}));
vi.mock("../product_analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../product_analytics")>()),
  trackProductEvent: m.trackProductEvent,
}));

import { communityRouter } from "./community.router";

function ctx(): TrpcContext {
  return {
    user: {
      id: 42,
      openId: "athlete",
      email: "a@example.com",
      name: "Atleta",
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

const DONE = { completed: true, completedAt: "2026-10-29T07:30:00.000Z", coach: null };

beforeEach(() => {
  vi.clearAllMocks();
  m.setClubWorkoutCompletion.mockResolvedValue(DONE);
});

describe("community.clubs.workouts.markCompleted", () => {
  it("stores the completion and returns it", async () => {
    const result = await communityRouter.createCaller(ctx()).clubs.workouts.markCompleted({ clubId: 1, workoutId: 3, completed: true });
    expect(m.setClubWorkoutCompletion).toHaveBeenCalledWith({ userId: 42, clubId: 1, workoutId: 3, completed: true });
    expect(result).toMatchObject({ success: true, workoutId: 3, completed: true });
    expect(m.trackProductEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: "club_workout_complete" }));
  });

  it("older app builds (completionStatus «completed») store it too", async () => {
    await communityRouter.createCaller(ctx()).clubs.workouts.markCompleted({ clubId: 1, workoutId: 3, completionStatus: "completed" });
    expect(m.setClubWorkoutCompletion).toHaveBeenCalledWith(expect.objectContaining({ completed: true }));
  });

  it("undo removes it", async () => {
    m.setClubWorkoutCompletion.mockResolvedValue({ completed: false, completedAt: null, coach: null });
    await communityRouter.createCaller(ctx()).clubs.workouts.markCompleted({ clubId: 1, workoutId: 3, completed: false });
    expect(m.setClubWorkoutCompletion).toHaveBeenCalledWith(expect.objectContaining({ completed: false }));
    expect(m.trackProductEvent).not.toHaveBeenCalled();
  });

  it("a workout of another club: NOT_FOUND", async () => {
    m.setClubWorkoutCompletion.mockRejectedValue(new Error("Workout not found"));
    await expect(
      communityRouter.createCaller(ctx()).clubs.workouts.markCompleted({ clubId: 1, workoutId: 99, completed: true }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("an unexpected error does not reach the client", async () => {
    m.setClubWorkoutCompletion.mockRejectedValue(new Error('relation "club_workout_completions" does not exist'));
    const error = await communityRouter
      .createCaller(ctx())
      .clubs.workouts.markCompleted({ clubId: 1, workoutId: 3, completed: true })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "Impossibile salvare il completamento. Riprova." });
  });

  it("not a member: FORBIDDEN", async () => {
    m.setClubWorkoutCompletion.mockRejectedValue(new Error("Forbidden"));
    await expect(
      communityRouter.createCaller(ctx()).clubs.workouts.markCompleted({ clubId: 1, workoutId: 3, completed: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("community.clubs.workouts.completion", () => {
  it("a workout of another club: NOT_FOUND", async () => {
    m.getClubWorkoutCompletion.mockRejectedValue(new Error("Workout not found"));
    await expect(
      communityRouter.createCaller(ctx()).clubs.workouts.completion({ clubId: 1, workoutId: 99 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("an unexpected error does not reach the client", async () => {
    m.getClubWorkoutCompletion.mockRejectedValue(new Error("connection terminated unexpectedly"));
    const error = await communityRouter
      .createCaller(ctx())
      .clubs.workouts.completion({ clubId: 1, workoutId: 3 })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "Impossibile leggere il completamento. Riprova." });
  });
});
