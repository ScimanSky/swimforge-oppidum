import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const {
  getClubMemberRoleMock,
  getClubWorkoutGenerationStatusMock,
  createClubWorkoutDraftFromGenerationMock,
  generateClubPoolWorkoutPlanMock,
} = vi.hoisted(() => ({
  getClubMemberRoleMock: vi.fn(),
  getClubWorkoutGenerationStatusMock: vi.fn(),
  createClubWorkoutDraftFromGenerationMock: vi.fn(),
  generateClubPoolWorkoutPlanMock: vi.fn(),
}));

vi.mock("../db_clubs", () => ({
  getClubMemberRole: getClubMemberRoleMock,
}));

vi.mock("../db_club_workouts", () => ({
  getClubWorkoutGenerationStatus: getClubWorkoutGenerationStatusMock,
  createClubWorkoutDraftFromGeneration: createClubWorkoutDraftFromGenerationMock,
}));

vi.mock("../club_workouts_ai", () => ({
  generateClubPoolWorkoutPlan: generateClubPoolWorkoutPlanMock,
}));

import { communityRouter } from "./community.router";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 42,
    openId: "workout-cooldown-user",
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

function baseDirectives() {
  return {
    focus: ["tecnica"] as const,
    volume: "medium" as const,
    intensity: "mixed" as const,
    strokeMix: ["sl"] as const,
    equipment: [] as const,
    sessionMinutes: 60 as const,
    notes: null,
  };
}

describe("community.clubs.workouts.coach cooldown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getClubMemberRoleMock.mockResolvedValue({ role: "coach", status: "active" });
  });

  it("generationStatus returns canGenerate=true when no recent run exists", async () => {
    getClubWorkoutGenerationStatusMock.mockResolvedValue({
      canGenerate: true,
      nextAvailableAt: null,
      lastGeneratedAt: null,
      scope: "club_date",
      sessionDate: "2026-03-03",
    });

    const caller = communityRouter.createCaller(createAuthContext());
    const result = await caller.clubs.workouts.coach.generationStatus({
      clubId: 10,
      sessionDate: "2026-03-03",
    });

    expect(getClubWorkoutGenerationStatusMock).toHaveBeenCalledWith({
      userId: 42,
      clubId: 10,
      sessionDate: "2026-03-03",
    });
    expect(result).toEqual({
      canGenerate: true,
      nextAvailableAt: null,
      lastGeneratedAt: null,
      scope: "club_date",
      sessionDate: "2026-03-03",
    });
  });

  it("generateDraft succeeds on first attempt and returns cooldown payload", async () => {
    getClubWorkoutGenerationStatusMock.mockResolvedValue({
      canGenerate: true,
      nextAvailableAt: null,
      lastGeneratedAt: null,
      scope: "club_date",
      sessionDate: "2026-03-03",
    });

    generateClubPoolWorkoutPlanMock.mockResolvedValue({
      plan: {
        title: "Allenamento vasca 2026-03-03",
        description: "Generato AI",
        totalDistance: "2800m",
        estimatedDuration: "60 min",
        blocks: [
          { phase: "warmup", label: "Warmup", items: [{ label: "300m sciolti" }] },
          { phase: "activation", label: "Activation", items: [{ label: "4x50 tecnica" }] },
          { phase: "main", label: "Main", items: [{ label: "6x100 SL" }] },
          { phase: "cooldown", label: "Cooldown", items: [{ label: "200m easy" }] },
        ],
        coachNotes: ["nota"],
      },
      status: "success",
      provider: "gemini",
      model: "gemini-2.5-flash",
      promptVersion: "club_pool_workout_v1",
      rawResponse: "{}",
      error: null,
    });

    createClubWorkoutDraftFromGenerationMock.mockResolvedValue({
      workout: { id: 501, title: "Allenamento vasca 2026-03-03", status: "draft" },
      run: { id: 701, status: "success" },
      cooldown: {
        canGenerate: false,
        nextAvailableAt: "2026-03-04T09:00:00.000Z",
        lastGeneratedAt: "2026-03-03T09:00:00.000Z",
        scope: "club_date",
        sessionDate: "2026-03-03",
      },
    });

    const caller = communityRouter.createCaller(createAuthContext());
    const result = await caller.clubs.workouts.coach.generateDraft({
      clubId: 10,
      sessionDate: "2026-03-03",
      directives: baseDirectives(),
    });

    expect(generateClubPoolWorkoutPlanMock).toHaveBeenCalledWith({
      sessionDate: "2026-03-03",
      directives: baseDirectives(),
    });
    expect(createClubWorkoutDraftFromGenerationMock).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.cooldown).toMatchObject({
      canGenerate: false,
      scope: "club_date",
      sessionDate: "2026-03-03",
    });
  });

  it("generateDraft blocks when cooldown is active on same date", async () => {
    getClubWorkoutGenerationStatusMock.mockResolvedValue({
      canGenerate: false,
      nextAvailableAt: "2026-03-04T09:00:00.000Z",
      lastGeneratedAt: "2026-03-03T09:00:00.000Z",
      scope: "club_date",
      sessionDate: "2026-03-03",
    });

    const caller = communityRouter.createCaller(createAuthContext());

    await expect(
      caller.clubs.workouts.coach.generateDraft({
        clubId: 10,
        sessionDate: "2026-03-03",
        directives: baseDirectives(),
      })
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });

    expect(generateClubPoolWorkoutPlanMock).not.toHaveBeenCalled();
    expect(createClubWorkoutDraftFromGenerationMock).not.toHaveBeenCalled();
  });

  it("generateDraft remains allowed for a different sessionDate in the same club", async () => {
    getClubWorkoutGenerationStatusMock.mockImplementation(async ({ sessionDate }: { sessionDate: string }) => {
      if (sessionDate === "2026-03-03") {
        return {
          canGenerate: false,
          nextAvailableAt: "2026-03-04T09:00:00.000Z",
          lastGeneratedAt: "2026-03-03T09:00:00.000Z",
          scope: "club_date",
          sessionDate,
        };
      }
      return {
        canGenerate: true,
        nextAvailableAt: null,
        lastGeneratedAt: null,
        scope: "club_date",
        sessionDate,
      };
    });

    generateClubPoolWorkoutPlanMock.mockResolvedValue({
      plan: {
        title: "Allenamento vasca 2026-03-05",
        description: "Generato AI",
        totalDistance: "3000m",
        estimatedDuration: "60 min",
        blocks: [
          { phase: "warmup", label: "Warmup", items: [{ label: "300m sciolti" }] },
          { phase: "activation", label: "Activation", items: [{ label: "4x50 tecnica" }] },
          { phase: "main", label: "Main", items: [{ label: "8x100 SL" }] },
          { phase: "cooldown", label: "Cooldown", items: [{ label: "200m easy" }] },
        ],
        coachNotes: [],
      },
      status: "success",
      provider: "gemini",
      model: "gemini-2.5-flash",
      promptVersion: "club_pool_workout_v1",
      rawResponse: "{}",
      error: null,
    });

    createClubWorkoutDraftFromGenerationMock.mockResolvedValue({
      workout: { id: 777, title: "Allenamento vasca 2026-03-05", status: "draft" },
      run: { id: 888, status: "success" },
      cooldown: {
        canGenerate: false,
        nextAvailableAt: "2026-03-06T09:00:00.000Z",
        lastGeneratedAt: "2026-03-05T09:00:00.000Z",
        scope: "club_date",
        sessionDate: "2026-03-05",
      },
    });

    const caller = communityRouter.createCaller(createAuthContext());
    const result = await caller.clubs.workouts.coach.generateDraft({
      clubId: 10,
      sessionDate: "2026-03-05",
      directives: baseDirectives(),
    });

    expect(result.success).toBe(true);
    expect(result.cooldown).toMatchObject({
      scope: "club_date",
      sessionDate: "2026-03-05",
    });
    expect(generateClubPoolWorkoutPlanMock).toHaveBeenCalledTimes(1);
  });

  it("generateDraft is allowed again on same sessionDate when cooldown is already expired", async () => {
    getClubWorkoutGenerationStatusMock.mockResolvedValue({
      canGenerate: true,
      nextAvailableAt: null,
      lastGeneratedAt: "2026-03-01T09:00:00.000Z",
      scope: "club_date",
      sessionDate: "2026-03-03",
    });

    generateClubPoolWorkoutPlanMock.mockResolvedValue({
      plan: {
        title: "Allenamento vasca 2026-03-03",
        description: "Nuova generazione dopo cooldown",
        totalDistance: "3000m",
        estimatedDuration: "60 min",
        blocks: [
          { phase: "warmup", label: "Warmup", items: [{ label: "300m sciolti" }] },
          { phase: "activation", label: "Activation", items: [{ label: "4x50 tecnica" }] },
          { phase: "main", label: "Main", items: [{ label: "8x100 SL" }] },
          { phase: "cooldown", label: "Cooldown", items: [{ label: "200m easy" }] },
        ],
        coachNotes: [],
      },
      status: "success",
      provider: "gemini",
      model: "gemini-2.5-flash",
      promptVersion: "club_pool_workout_v1",
      rawResponse: "{}",
      error: null,
    });

    createClubWorkoutDraftFromGenerationMock.mockResolvedValue({
      workout: { id: 999, title: "Allenamento vasca 2026-03-03", status: "draft" },
      run: { id: 1001, status: "success" },
      cooldown: {
        canGenerate: false,
        nextAvailableAt: "2026-03-04T09:00:00.000Z",
        lastGeneratedAt: "2026-03-03T09:00:00.000Z",
        scope: "club_date",
        sessionDate: "2026-03-03",
      },
    });

    const caller = communityRouter.createCaller(createAuthContext());
    const result = await caller.clubs.workouts.coach.generateDraft({
      clubId: 10,
      sessionDate: "2026-03-03",
      directives: baseDirectives(),
    });

    expect(result.success).toBe(true);
    expect(generateClubPoolWorkoutPlanMock).toHaveBeenCalledTimes(1);
    expect(createClubWorkoutDraftFromGenerationMock).toHaveBeenCalledTimes(1);
  });
});
