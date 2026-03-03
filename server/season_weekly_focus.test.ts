import { describe, expect, it } from "vitest";
import { resolveSeasonWeeklyFocus } from "./season_engagement";

function mission(title: string, completed: boolean, xpReward = 40) {
  return { title, completed, xpReward };
}

describe("resolveSeasonWeeklyFocus", () => {
  it("prioritizes first incomplete daily mission", () => {
    const focus = resolveSeasonWeeklyFocus({
      dailyMissions: [mission("Daily A", true), mission("Daily B", false, 25)],
      weeklyMissions: [mission("Weekly A", false, 70)],
      actionXpRemaining: 80,
      pendingPredictions: 2,
      predictionsEnabled: true,
    });

    expect(focus.actionType).toBe("daily");
    expect(focus.body).toContain("Daily B");
  });

  it("falls back to action xp when all daily missions are complete", () => {
    const focus = resolveSeasonWeeklyFocus({
      dailyMissions: [mission("Daily A", true)],
      weeklyMissions: [mission("Weekly A", false)],
      actionXpRemaining: 32,
      pendingPredictions: 2,
      predictionsEnabled: true,
    });

    expect(focus.actionType).toBe("action_xp");
    expect(focus.body).toContain("32 XP");
  });

  it("skips predictions when predictions are disabled", () => {
    const focus = resolveSeasonWeeklyFocus({
      dailyMissions: [mission("Daily A", true)],
      weeklyMissions: [mission("Weekly A", false, 90)],
      actionXpRemaining: 0,
      pendingPredictions: 3,
      predictionsEnabled: false,
    });

    expect(focus.actionType).toBe("weekly");
    expect(focus.body).toContain("Weekly A");
  });

  it("uses prediction step before weekly mission when enabled", () => {
    const focus = resolveSeasonWeeklyFocus({
      dailyMissions: [mission("Daily A", true)],
      weeklyMissions: [mission("Weekly A", false)],
      actionXpRemaining: 0,
      pendingPredictions: 1,
      predictionsEnabled: true,
    });

    expect(focus.actionType).toBe("prediction");
    expect(focus.body).toContain("1 previsione");
  });

  it("returns explore when everything else is completed", () => {
    const focus = resolveSeasonWeeklyFocus({
      dailyMissions: [mission("Daily A", true)],
      weeklyMissions: [mission("Weekly A", true)],
      actionXpRemaining: 0,
      pendingPredictions: 0,
      predictionsEnabled: true,
    });

    expect(focus.actionType).toBe("explore");
  });
});
