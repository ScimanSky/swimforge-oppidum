import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const { generateBothWorkoutsMock } = vi.hoisted(() => ({
  generateBothWorkoutsMock: vi.fn(),
}));

vi.mock("../ai_coach", () => ({
  generateBothWorkouts: generateBothWorkoutsMock,
}));

import { aiCoachRouter } from "./admin.router";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 42,
    openId: "ai-coach-generate-user",
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
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("aiCoach.generateWorkouts preconditions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns workouts payload on success", async () => {
    generateBothWorkoutsMock.mockResolvedValue({
      pool: { title: "Pool" },
      dryland: { title: "Dryland" },
      generatedAt: "2026-02-24T10:00:00.000Z",
      nextAvailableAt: "2026-03-03T10:00:00.000Z",
      canGenerate: false,
      generationBlockedReason: null,
      minActivitiesRequired: 3,
      activityCount: 8,
    });

    const caller = aiCoachRouter.createCaller(createAuthContext());
    const result = await caller.generateWorkouts();

    expect(generateBothWorkoutsMock).toHaveBeenCalledWith(42);
    expect(result).toMatchObject({
      canGenerate: false,
      minActivitiesRequired: 3,
      activityCount: 8,
    });
  });

  it("throws PRECONDITION_FAILED for users with <3 swimming activities", async () => {
    generateBothWorkoutsMock.mockRejectedValue(
      new Error("Servono almeno 3 attività di nuoto sincronizzate per generare i workout AI.")
    );

    const caller = aiCoachRouter.createCaller(createAuthContext());

    await expect(caller.generateWorkouts()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "Servono almeno 3 attività di nuoto sincronizzate per generare i workout AI.",
    });
  });

  it("throws PRECONDITION_FAILED when cooldown is active", async () => {
    generateBothWorkoutsMock.mockRejectedValue(
      new Error("Workout generation is on cooldown until 2026-03-10T09:00:00.000Z")
    );

    const caller = aiCoachRouter.createCaller(createAuthContext());

    await expect(caller.generateWorkouts()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });
});
