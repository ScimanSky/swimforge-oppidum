import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// In Postgres a failed statement aborts the whole transaction: every later statement
// fails and the commit rolls back, even when JavaScript catches the error. The winner
// badge comes from a `badges` table that no migration creates, so its insert must not
// be able to stop expired challenges from completing.

const dialect = new PgDialect();
const render = (query: unknown) => dialect.sqlToQuery(query as SQL).sql;

const m = vi.hoisted(() => {
  const state = {
    aborted: false,
    committed: false,
    executed: [] as string[],
    failBadgeInsert: true,
  };
  return { state, db: {} as Record<string, unknown> };
});

vi.mock("./db", () => ({ getDb: async () => m.db }));

function respond(text: string) {
  if (/pg_try_advisory_xact_lock/.test(text)) return { rows: [{ acquired: true }] };
  if (/FROM challenges\s+WHERE status = 'active'\s+AND end_date < NOW\(\)/.test(text)) {
    return { rows: [{ id: 7, name: "Sfida", objective: "total_distance", badge_name: null, badge_image_url: null }] };
  }
  if (/SELECT user_id, current_progress\s+FROM challenge_participants/.test(text)) {
    return { rows: [{ user_id: 3, current_progress: 12000 }] };
  }
  if (/UPDATE challenges\s+SET status = 'completed'/.test(text)) return { rows: [{ id: 7 }] };
  return { rows: [] };
}

/** A transaction with Postgres semantics: an error aborts it until a savepoint is rolled back. */
function makeTx() {
  const tx = {
    execute: vi.fn(async (query: unknown) => {
      const text = render(query);
      if (m.state.aborted) {
        throw new Error("current transaction is aborted, commands ignored until end of transaction block");
      }
      m.state.executed.push(text);
      if (m.state.failBadgeInsert && /INSERT INTO user_badges/.test(text)) {
        m.state.aborted = true;
        throw new Error('relation "badges" does not exist');
      }
      return respond(text);
    }),
    // Drizzle runs a nested transaction as SAVEPOINT / ROLLBACK TO SAVEPOINT.
    transaction: vi.fn(async (cb: (inner: unknown) => Promise<unknown>) => {
      const abortedBefore = m.state.aborted;
      try {
        return await cb(tx);
      } catch (error) {
        m.state.aborted = abortedBefore;
        throw error;
      }
    }),
  };
  return tx;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.state.aborted = false;
  m.state.committed = false;
  m.state.executed = [];
  m.state.failBadgeInsert = true;
  m.db.transaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
    const result = await cb(makeTx());
    // COMMIT of an aborted transaction is a ROLLBACK.
    m.state.committed = !m.state.aborted;
    if (!m.state.committed) throw new Error("transaction rolled back");
    return result;
  });
});

describe("completeChallenges winner badge", () => {
  it("completes the challenge and awards the XP when the badge insert fails", async () => {
    const { completeChallenges } = await import("./cron_challenges");
    const result = await completeChallenges();

    expect(result).toEqual({ completed: 1, winners: 1 });
    expect(m.state.committed).toBe(true);
    expect(m.state.executed.some((t) => /UPDATE challenges\s+SET status = 'completed'/.test(t))).toBe(true);
    expect(m.state.executed.some((t) => /INSERT INTO xp_transactions/.test(t))).toBe(true);
    // The winner's level comes from the shared calculation on the new total (level_thresholds).
    const xpUpdate = m.state.executed.find((t) => /total_xp = sp\.total_xp \+/.test(t));
    expect(xpUpdate).toMatch(
      /level = COALESCE\(\(SELECT max\(lt\.level\) FROM level_thresholds lt WHERE lt\.xp_required <= \(sp\.total_xp \+ \$\d+\)\), 1\)/,
    );
  });

  it("still awards the badge when the insert works", async () => {
    m.state.failBadgeInsert = false;
    const { completeChallenges } = await import("./cron_challenges");
    const result = await completeChallenges();

    expect(result).toEqual({ completed: 1, winners: 1 });
    expect(m.state.executed.some((t) => /INSERT INTO user_badges/.test(t))).toBe(true);
  });
});
