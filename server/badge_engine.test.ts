import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  achievementBadgeDefinitions,
  swimmerProfiles,
  swimmingActivities,
  userAchievementBadges,
} from "../drizzle/schema";

const h = vi.hoisted(() => {
  const state = {
    definitions: [] as any[],
    owned: [] as any[],
    activities: [] as any[],
    profile: [{ userId: 7, totalDistanceMeters: 50_000, totalSessions: 30, totalTimeSeconds: 60_000 }] as any[],
    inserted: [] as any[],
  };
  const db = {
    select: vi.fn(() => {
      let table: unknown;
      const chain: any = {
        from: (t: unknown) => {
          table = t;
          return chain;
        },
        where: () => chain,
        orderBy: () => chain,
        limit: () => chain,
        then: (resolve: (rows: unknown[]) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve()
            .then(() => {
              if (table === state.tables.definitions) return state.definitions;
              if (table === state.tables.owned) return state.owned;
              if (table === state.tables.profiles) return state.profile;
              if (table === state.tables.activities) return state.activities;
              return [];
            })
            .then(resolve, reject),
      };
      return chain;
    }),
    insert: vi.fn(() => ({
      values: async (values: unknown) => {
        state.inserted.push(values);
      },
    })),
  };
  return {
    state: Object.assign(state, { tables: {} as Record<string, unknown> }),
    db,
    loadStrokeIndexProgress: vi.fn(),
  };
});

vi.mock("./db", () => ({ getDb: async () => h.db }));
vi.mock("./swim_metrics", () => ({ loadStrokeIndexProgress: h.loadStrokeIndexProgress }));

import { checkAndAwardBadges, strokeIndexGainMet } from "./badge_engine";

const EFFICIENZA_SUPREMA = {
  id: 7,
  name: "Efficienza Suprema",
  criteriaType: "stroke_index_gain",
  criteriaJson: { metric: "stroke_index", min_gain_pct: 10, min_sessions_28d: 6, min_sessions_baseline: 6 },
};
const OLD_SEI = { id: 8, name: "Vecchio SEI", criteriaType: "metric_peak", criteriaJson: { metric: "sei", operator: ">=", value: 85 } };

const summary = (overrides: Record<string, unknown> = {}) => ({
  poolLengthMeters: 25, latest: 2.3, avg28: 2.2, baseline: 2.0, deltaPct: 10, missing: null,
  n28: 6, nBaseline: 6, dps28: 2.1, dpsBaseline: 2.0, pace28: 100, paceBaseline: 100,
  ...overrides,
});

describe("strokeIndexGainMet", () => {
  const criteria = EFFICIENZA_SUPREMA.criteriaJson;

  it("needs the 28-day median at least 10% above the baseline median, with 6 swims in each window", () => {
    expect(strokeIndexGainMet(summary(), criteria)).toBe(true); // exactly +10%
    expect(strokeIndexGainMet(summary({ avg28: 2.19 }), criteria)).toBe(false);
    expect(strokeIndexGainMet(summary({ n28: 5 }), criteria)).toBe(false);
    expect(strokeIndexGainMet(summary({ nBaseline: 5 }), criteria)).toBe(false);
    expect(strokeIndexGainMet(summary({ baseline: null }), criteria)).toBe(false);
    expect(strokeIndexGainMet(summary({ avg28: null }), criteria)).toBe(false);
  });

  it("defaults to +10% and 6 swims when the criteria omit them", () => {
    expect(strokeIndexGainMet(summary(), {})).toBe(true);
    expect(strokeIndexGainMet(summary({ n28: 5 }), {})).toBe(false);
  });
});

describe("checkAndAwardBadges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.state.tables = {
      definitions: achievementBadgeDefinitions,
      owned: userAchievementBadges,
      profiles: swimmerProfiles,
      activities: swimmingActivities,
    };
    h.state.owned = [];
    h.state.inserted.length = 0;
    // Activities that the old SEI formula would have scored above 85.
    h.state.activities = [
      { id: 1, distanceMeters: 2000, durationSeconds: 1800, avgPacePer100m: 80, avgSwolf: 30, avgStrokeDistance: 250, avgStrokes: 10, avgStrokeCadence: 30, poolLengthMeters: 25 },
    ];
  });

  it("awards «Efficienza Suprema» on a real Stroke Index gain", async () => {
    h.state.definitions = [EFFICIENZA_SUPREMA];
    h.loadStrokeIndexProgress.mockResolvedValue(summary());
    expect(await checkAndAwardBadges(7)).toEqual(["Efficienza Suprema"]);
    expect(h.loadStrokeIndexProgress).toHaveBeenCalledWith(7);
    expect(h.state.inserted).toEqual([{ userId: 7, badgeId: 7 }]);
  });

  it("does not award it below +10% or with too few swims", async () => {
    h.state.definitions = [EFFICIENZA_SUPREMA];
    h.loadStrokeIndexProgress.mockResolvedValue(summary({ avg28: 2.15, n28: 4 }));
    expect(await checkAndAwardBadges(7)).toEqual([]);
    expect(h.state.inserted).toEqual([]);
  });

  it("a user who already has the badge keeps it and is not evaluated again", async () => {
    h.state.definitions = [EFFICIENZA_SUPREMA];
    h.state.owned = [{ userId: 7, badgeId: 7 }];
    expect(await checkAndAwardBadges(7)).toEqual([]);
    expect(h.loadStrokeIndexProgress).not.toHaveBeenCalled();
  });

  it("old criteria on the invented SEI, SER or TCI never award anything, and nothing crashes", async () => {
    h.state.definitions = [
      OLD_SEI,
      { ...OLD_SEI, id: 9, criteriaJson: { metric: "ser", operator: ">=", value: 0 } },
      { ...OLD_SEI, id: 10, criteriaJson: { metric: "tci", operator: ">=", value: 0 } },
      { id: 11, name: "Senza criteri", criteriaType: "metric_peak", criteriaJson: null },
    ];
    expect(await checkAndAwardBadges(7)).toEqual([]);
    expect(h.state.inserted).toEqual([]);
  });

  it("a failing Stroke Index read does not stop the other badges", async () => {
    h.state.definitions = [
      EFFICIENZA_SUPREMA,
      { id: 12, name: "Centomila", criteriaType: "aggregate_total", criteriaJson: { metric: "total_distance", operator: ">=", value: 10_000 } },
    ];
    h.loadStrokeIndexProgress.mockRejectedValue(new Error("db down"));
    expect(await checkAndAwardBadges(7)).toEqual(["Centomila"]);
  });
});
