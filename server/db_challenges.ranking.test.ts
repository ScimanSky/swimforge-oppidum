import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// avg_pace is seconds per 100 m: lower is better. The live ranking and both winner
// paths (completeChallenge and the completeChallenges cron) must rank it fastest
// first, put participants without a result last, and agree with each other.

type Rows = { rows: unknown[] };

const m = vi.hoisted(() => {
  const state = {
    executed: [] as unknown[],
    respond: (_query: unknown): { rows: unknown[] } => ({ rows: [] }),
    challengeRow: undefined as Record<string, unknown> | undefined,
  };
  const execute = vi.fn(async (query: unknown) => {
    state.executed.push(query);
    return state.respond(query);
  });
  const selectChain: any = {
    from: vi.fn(() => selectChain),
    where: vi.fn(() => selectChain),
    limit: vi.fn(async () => (state.challengeRow ? [state.challengeRow] : [])),
  };
  const tx = { execute };
  const db = {
    execute,
    select: vi.fn(() => selectChain),
    transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
  };
  return { state, db };
});

vi.mock("./db", () => ({ getDb: async () => m.db }));

const dialect = new PgDialect();
const render = (query: unknown) => dialect.sqlToQuery(query as SQL).sql;
const executedTexts = () => m.state.executed.map(render);
const findQuery = (needle: RegExp) => {
  const text = executedTexts().find((t) => needle.test(t));
  expect(text, `no executed query matches ${needle}`).toBeDefined();
  return text as string;
};

const ALL_OBJECTIVES = [
  "total_distance",
  "total_sessions",
  "consistency",
  "avg_pace",
  "total_time",
  "longest_session",
] as const;
const HIGHER_IS_BETTER = ALL_OBJECTIVES.filter((o) => o !== "avg_pace");

function respondWith(objective: string, winnerRows: unknown[] = []) {
  m.state.respond = (query: unknown): Rows => {
    const text = render(query);
    if (/pg_try_advisory_xact_lock/.test(text)) return { rows: [{ acquired: true }] };
    if (/FROM challenges\s+WHERE status = 'active'\s+AND end_date < NOW\(\)/.test(text)) {
      return {
        rows: [{ id: 7, name: "Sfida pace", objective, badge_name: null, badge_image_url: null }],
      };
    }
    if (/SELECT \* FROM challenges WHERE id =/.test(text)) {
      return {
        rows: [
          {
            id: 7,
            objective,
            type: "both",
            start_date: new Date("2026-10-01T00:00:00Z"),
            end_date: new Date("2026-10-08T00:00:00Z"),
          },
        ],
      };
    }
    if (/SELECT objective FROM challenges WHERE id =/.test(text)) return { rows: [{ objective }] };
    if (/SELECT user_id, current_progress\s+FROM challenge_participants/.test(text)) {
      return { rows: winnerRows };
    }
    return { rows: [] };
  };
}

beforeEach(() => {
  m.state.executed.length = 0;
  m.state.challengeRow = undefined;
  m.state.respond = () => ({ rows: [] });
  vi.clearAllMocks();
});

describe("challengeRankingOrderBy", () => {
  it("ranks avg_pace fastest (lowest) first, without a result last", async () => {
    const { challengeRankingOrderBy } = await import("./db_challenges");
    const text = render(challengeRankingOrderBy("avg_pace"));
    expect(text).toBe(
      `CASE WHEN "current_progress" > 0 THEN 0 ELSE 1 END ASC, "current_progress" ASC, "joined_at" ASC, "user_id" ASC`,
    );
  });

  it.each(HIGHER_IS_BETTER)("ranks %s highest first, without a result last", async (objective) => {
    const { challengeRankingOrderBy } = await import("./db_challenges");
    const text = render(challengeRankingOrderBy(objective));
    expect(text).toBe(
      `CASE WHEN "current_progress" > 0 THEN 0 ELSE 1 END ASC, "current_progress" DESC, "joined_at" ASC, "user_id" ASC`,
    );
  });

  it("qualifies the columns with a table alias when given", async () => {
    const { challengeRankingOrderBy } = await import("./db_challenges");
    const text = render(challengeRankingOrderBy("avg_pace", "cp"));
    expect(text).toBe(
      `CASE WHEN "cp"."current_progress" > 0 THEN 0 ELSE 1 END ASC, "cp"."current_progress" ASC, "cp"."joined_at" ASC, "cp"."user_id" ASC`,
    );
  });
});

describe("calculateChallengeProgress ranking", () => {
  it.each(ALL_OBJECTIVES)("%s: ranks with the shared order of the challenge's objective", async (objective) => {
    respondWith(objective);
    const { calculateChallengeProgress, challengeRankingOrderBy } = await import("./db_challenges");
    await calculateChallengeProgress(7);

    const ranking = findQuery(/ROW_NUMBER\(\)/);
    expect(ranking).toContain(`ROW_NUMBER() OVER (ORDER BY ${render(challengeRankingOrderBy(objective))})`);
  });

  it("avg_pace: a pace challenge never ranks by progress descending", async () => {
    respondWith("avg_pace");
    const { calculateChallengeProgress } = await import("./db_challenges");
    await calculateChallengeProgress(7);

    const ranking = findQuery(/ROW_NUMBER\(\)/);
    expect(ranking).not.toMatch(/current_progress"?\s+DESC/);
  });

  it("avg_pace: averages only real paces, so nobody gets a 0 that would beat every real pace", async () => {
    respondWith("avg_pace");
    const { calculateChallengeProgress } = await import("./db_challenges");
    await calculateChallengeProgress(7);

    const progress = findQuery(/AVG\(avg_pace_per_100m\)/);
    expect(progress).toMatch(/avg_pace_per_100m > 0/);
  });
});

describe("completeChallenge winner", () => {
  it("avg_pace: picks the fastest participant with a result, using the challenge row's objective", async () => {
    respondWith("avg_pace");
    const { completeChallenge, challengeRankingOrderBy } = await import("./db_challenges");
    await completeChallenge(7);

    findQuery(/SELECT objective FROM challenges WHERE id =/);
    const winner = findQuery(/SET is_winner = true/);
    expect(winner).toContain(`ORDER BY ${render(challengeRankingOrderBy("avg_pace"))}`);
    expect(winner).toMatch(/current_progress > 0/);
    expect(winner).toMatch(/LIMIT 1/);
  });

  it("total_distance: picks the highest progress with a result", async () => {
    respondWith("total_distance");
    const { completeChallenge, challengeRankingOrderBy } = await import("./db_challenges");
    await completeChallenge(7);

    const winner = findQuery(/SET is_winner = true/);
    expect(winner).toContain(`ORDER BY ${render(challengeRankingOrderBy("total_distance"))}`);
    expect(winner).toMatch(/current_progress > 0/);
  });
});

describe("completeChallenges cron winner", () => {
  it("avg_pace: selects the winner with the shared ascending order", async () => {
    respondWith("avg_pace");
    const { completeChallenges } = await import("./cron_challenges");
    const { challengeRankingOrderBy } = await import("./db_challenges");
    await completeChallenges();

    const winner = findQuery(/SELECT user_id, current_progress\s+FROM challenge_participants/);
    expect(winner).toContain(`ORDER BY ${render(challengeRankingOrderBy("avg_pace"))}`);
    expect(winner).toMatch(/LIMIT 1/);
  });

  it("total_sessions: selects the winner with the shared descending order", async () => {
    respondWith("total_sessions");
    const { completeChallenges } = await import("./cron_challenges");
    const { challengeRankingOrderBy } = await import("./db_challenges");
    await completeChallenges();

    const winner = findQuery(/SELECT user_id, current_progress\s+FROM challenge_participants/);
    expect(winner).toContain(`ORDER BY ${render(challengeRankingOrderBy("total_sessions"))}`);
  });

  it("awards nobody when the top participant has no result", async () => {
    respondWith("avg_pace", [{ user_id: 3, current_progress: 0 }]);
    const { completeChallenges } = await import("./cron_challenges");
    const result = await completeChallenges();

    expect(result).toEqual({ completed: 0, winners: 0 });
    expect(executedTexts().some((t) => /SET is_winner = true/.test(t))).toBe(false);
  });
});

describe("challenge display order", () => {
  it("getChallengeById lists participants in ranking order (the detail page shows index + 1 as rank)", async () => {
    m.state.challengeRow = {
      id: 7,
      objective: "avg_pace",
      start_date: new Date("2026-10-01T00:00:00Z"),
      end_date: new Date("2026-10-08T00:00:00Z"),
    };
    const { getChallengeById } = await import("./db_challenges_getById");
    const { challengeRankingOrderBy } = await import("./db_challenges");
    await getChallengeById(7);

    const participants = findQuery(/FROM challenge_participants cp/);
    expect(participants).toContain(`ORDER BY ${render(challengeRankingOrderBy("avg_pace", "cp"))}`);
  });

  it("getActiveChallenges orders each leaderboard by the stored rank, not by raw progress", async () => {
    const { getActiveChallenges } = await import("./db_challenges");
    await getActiveChallenges(1);

    const list = findQuery(/json_agg/);
    expect(list).not.toMatch(/ORDER BY current_progress DESC/);
    expect(list).toMatch(/ORDER BY NULLIF\(current_rank, 0\) ASC NULLS LAST, joined_at ASC, user_id ASC/);
  });
});
