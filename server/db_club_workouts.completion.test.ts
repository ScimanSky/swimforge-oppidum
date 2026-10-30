import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// «Segna completato» is stored: the athlete sees and undoes their own completion, the coach
// sees «fatto da N su M» and who did it.

const dialect = new PgDialect();
const render = (query: unknown) => dialect.sqlToQuery(query as SQL);

const m = vi.hoisted(() => {
  const state = {
    role: "member",
    completions: new Map<number, string>(), // userId -> completed_at
    activeMembers: 5,
    published: true,
  };
  const executed: string[] = [];
  const db = {
    // assertReadableRole: select().from().where().limit()
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => [{ role: state.role, status: "active" }] }),
      }),
    }),
    execute: vi.fn(async (_query: unknown) => ({ rows: [] as unknown[] })),
  };
  return { state, executed, db };
});

vi.mock("./db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./db")>()),
  getDb: async () => m.db,
}));

import { getClubWorkoutCompletion, setClubWorkoutCompletion } from "./db_club_workouts";

const ME = 42;

beforeEach(() => {
  m.state.role = "member";
  m.state.completions = new Map();
  m.state.published = true;
  m.executed.length = 0;
  m.db.execute.mockImplementation(async (query: unknown) => {
    const { sql: text, params } = render(query);
    m.executed.push(text);
    if (text.includes("FROM club_pool_workouts")) return { rows: m.state.published ? [{ id: 3 }] : [] };
    if (text.startsWith("\n      INSERT INTO club_workout_completions") || text.includes("INSERT INTO club_workout_completions")) {
      const userId = Number(params[2]);
      if (!m.state.completions.has(userId)) m.state.completions.set(userId, "2026-10-29T07:30:00.000Z");
      return { rows: [] };
    }
    if (text.includes("DELETE FROM club_workout_completions")) {
      m.state.completions.delete(Number(params[0]));
      return { rows: [] };
    }
    if (text.includes("SELECT completed_at FROM club_workout_completions")) {
      const at = m.state.completions.get(Number(params[0]));
      return { rows: at ? [{ completed_at: at }] : [] };
    }
    if (text.includes("JOIN users u ON u.id = c.user_id")) {
      return {
        rows: [...m.state.completions].map(([userId, at]) => ({
          user_id: userId,
          completed_at: at,
          name: userId === ME ? "Marta Rossi" : "Luca Bianchi",
          username: null,
          avatar_url: null,
        })),
      };
    }
    if (text.includes("COUNT(*)::int AS total")) {
      expect(text).toMatch(/login_method, ''\) <> 'bot'/);
      return { rows: [{ total: m.state.activeMembers }] };
    }
    return { rows: [] };
  });
});

describe("club workout completion", () => {
  it("the athlete marks it done, sees it, and can undo it", async () => {
    const done = await setClubWorkoutCompletion({ userId: ME, clubId: 1, workoutId: 3, completed: true });
    expect(done).toMatchObject({ completed: true, completedAt: "2026-10-29T07:30:00.000Z", coach: null });

    const again = await setClubWorkoutCompletion({ userId: ME, clubId: 1, workoutId: 3, completed: true });
    expect(again.completedAt).toBe("2026-10-29T07:30:00.000Z");
    expect(m.executed.some((t) => /ON CONFLICT \(user_id, workout_id\) DO NOTHING/.test(t))).toBe(true);

    const undone = await setClubWorkoutCompletion({ userId: ME, clubId: 1, workoutId: 3, completed: false });
    expect(undone).toMatchObject({ completed: false, completedAt: null });
  });

  it("a member does not see who else did it", async () => {
    m.state.completions.set(7, "2026-10-29T06:00:00.000Z");
    const state = await getClubWorkoutCompletion({ userId: ME, clubId: 1, workoutId: 3 });
    expect(state.coach).toBeNull();
  });

  it("the coach sees «fatto da N su M» and the list", async () => {
    m.state.role = "coach";
    m.state.completions.set(7, "2026-10-29T06:00:00.000Z");
    const state = await getClubWorkoutCompletion({ userId: ME, clubId: 1, workoutId: 3 });
    expect(state.coach).toEqual({
      completedCount: 1,
      memberCount: 5,
      members: [{ userId: 7, name: "Luca Bianchi", username: null, avatarUrl: null, completedAt: "2026-10-29T06:00:00.000Z" }],
    });
  });

  it("a coach of another club cannot read a workout of a club it does not own (404)", async () => {
    m.state.role = "coach";
    m.state.published = false; // workout 3 is not a published workout of club 1
    m.state.completions.set(7, "2026-10-29T06:00:00.000Z");
    await expect(getClubWorkoutCompletion({ userId: ME, clubId: 1, workoutId: 3 })).rejects.toThrow("Workout not found");
    expect(m.executed.some((t) => t.includes("FROM club_workout_completions"))).toBe(false);
  });

  it("both completion reads are limited to the club", async () => {
    m.state.role = "coach";
    await getClubWorkoutCompletion({ userId: ME, clubId: 1, workoutId: 3 });
    const reads = m.executed.filter((t) => t.includes("FROM club_workout_completions"));
    expect(reads).toHaveLength(2);
    for (const text of reads) expect(text).toMatch(/club_id = \$\d+/);
    expect(m.executed.filter((t) => t.includes("FROM club_pool_workouts"))).toHaveLength(1);
  });

  it("only published workouts of that club", async () => {
    m.state.published = false;
    await expect(setClubWorkoutCompletion({ userId: ME, clubId: 1, workoutId: 3, completed: true })).rejects.toThrow(
      "Workout not found",
    );
  });
});
