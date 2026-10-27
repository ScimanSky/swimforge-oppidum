import { beforeEach, describe, expect, it, vi } from "vitest";

const g = vi.hoisted(() => ({
  listUserGoals: vi.fn(),
  createUserGoal: vi.fn(),
  updateUserGoal: vi.fn(),
  deleteUserGoal: vi.fn(),
}));

vi.mock("../db_goals", () => g);

import { goalsRouter } from "./goals.router";

const ctx = { user: { id: 42 } as any, req: { protocol: "https", headers: {} } as any, res: {} as any };

describe("goals router", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists the caller's goals", async () => {
    g.listUserGoals.mockResolvedValue([{ id: 1 }]);
    expect(await goalsRouter.createCaller(ctx).list()).toEqual([{ id: 1 }]);
    expect(g.listUserGoals).toHaveBeenCalledWith(42);
  });

  it("creates with trimmed title", async () => {
    g.createUserGoal.mockResolvedValue({ id: 2 });
    await goalsRouter.createCaller(ctx).create({ title: "  8 km  ", category: "distance", targetValue: 8, unit: "km" });
    expect(g.createUserGoal).toHaveBeenCalledWith(42, { title: "8 km", category: "distance", targetValue: 8, unit: "km" });
  });

  it("rejects create with INTERNAL_SERVER_ERROR when the database is unavailable", async () => {
    g.createUserGoal.mockResolvedValue(null);
    await expect(
      goalsRouter.createCaller(ctx).create({ title: "8 km", category: "distance", targetValue: 8, unit: "km" }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "Database non disponibile" });
  });

  it("rejects an empty title", async () => {
    await expect(
      goalsRouter.createCaller(ctx).create({ title: "  ", category: "distance", targetValue: null, unit: null }),
    ).rejects.toThrow();
  });

  it("updates only the caller's goal and strips extra fields", async () => {
    g.updateUserGoal.mockResolvedValue({ id: 7 });
    await goalsRouter.createCaller(ctx).update({ id: 7, userId: 99, title: " t " } as any);
    expect(g.updateUserGoal).toHaveBeenCalledWith(42, 7, { title: "t" });
  });

  it("deletes only the caller's goal", async () => {
    g.deleteUserGoal.mockResolvedValue(true);
    await goalsRouter.createCaller(ctx).remove({ id: 9 });
    expect(g.deleteUserGoal).toHaveBeenCalledWith(42, 9);
  });

  it("rejects remove with NOT_FOUND when the goal does not exist", async () => {
    g.deleteUserGoal.mockResolvedValue(false);
    await expect(goalsRouter.createCaller(ctx).remove({ id: 9 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
