import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => {
  const tx = { execute: vi.fn(async () => ({ rows: [] })) };
  const db = {
    execute: vi.fn(async () => ({ rows: [{ id: 9, email: "a@b.it", name: "A", open_id: null }] })),
    transaction: vi.fn(async (cb: (t: typeof tx) => Promise<void>) => cb(tx)),
  };
  const refs = { userId: 9, imageKitFileIds: ["story-file"], urls: ["https://x/clubs/1/9/a.jpg"], keepUrls: [] };
  return {
    tx,
    db,
    refs,
    order: [] as string[],
    deleteFromIfExists: vi.fn(async () => true),
    collectUserMediaRefs: vi.fn(),
    cleanupDeletedAccount: vi.fn(),
  };
});

vi.mock("pg", () => ({
  Pool: class {
    query = vi.fn(async () => ({ rows: [] }));
    end = vi.fn(async () => {});
    on = vi.fn();
  },
}));
vi.mock("drizzle-orm/node-postgres", () => ({ drizzle: () => m.db }));
vi.mock("./lib/relation-exists", () => ({ deleteFromIfExists: m.deleteFromIfExists }));
vi.mock("./account_cleanup", () => ({
  collectUserMediaRefs: m.collectUserMediaRefs,
  cleanupDeletedAccount: m.cleanupDeletedAccount,
}));

const previousUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL = "postgres://test@localhost/test";
afterAll(() => {
  if (previousUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousUrl;
});

type Call = [unknown, string, { queryChunks?: unknown[] } | undefined, string[] | undefined];
const calls = () => m.deleteFromIfExists.mock.calls as unknown as Call[];
const tables = () => calls().map((call) => call[1]);
const callFor = (table: string) => calls().find((call) => call[1] === table);

/** The WHERE clause as text, with the parameters as $n (drizzle SQL chunks). */
function whereText(table: string): string {
  const where = callFor(table)?.[2] as any;
  const flatten = (chunk: any): string => {
    if (chunk == null) return "";
    if (typeof chunk === "string") return chunk;
    if (Array.isArray(chunk?.value)) return chunk.value.join("");
    if (Array.isArray(chunk?.queryChunks)) return chunk.queryChunks.map(flatten).join("");
    return "$";
  };
  return flatten(where).replace(/\s+/g, " ");
}

describe("deleteUserAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.order.length = 0;
    m.collectUserMediaRefs.mockImplementation(async () => {
      m.order.push("collect");
      return m.refs;
    });
    m.db.transaction.mockImplementation(async (cb: (t: typeof m.tx) => Promise<void>) => {
      m.order.push("transaction");
      return cb(m.tx);
    });
    m.cleanupDeletedAccount.mockImplementation(async () => {
      m.order.push("cleanup");
    });
  });

  it("deletes the user's push device tokens inside the transaction", async () => {
    const { deleteUserAccount } = await import("./db");
    await expect(deleteUserAccount(9)).resolves.toMatchObject({ id: 9 });
    expect(tables()).toContain("public.device_tokens");
    expect(callFor("public.device_tokens")?.[0]).toBe(m.tx);
  });

  it("deletes the swims explicitly: lengths, laps and the rows pointing at them before the swims", async () => {
    const { deleteUserAccount } = await import("./db");
    await deleteUserAccount(9);
    const order = tables();
    for (const table of [
      "public.garmin_activity_lengths",
      "public.garmin_activity_laps",
      "public.ghost_challenges",
      "public.challenge_activity_log",
      "public.swimming_activities",
    ]) {
      expect(order).toContain(table);
      expect(callFor(table)?.[0]).toBe(m.tx);
    }
    const index = (table: string) => order.indexOf(table);
    expect(index("public.garmin_activity_lengths")).toBeLessThan(index("public.garmin_activity_laps"));
    expect(index("public.garmin_activity_laps")).toBeLessThan(index("public.swimming_activities"));
    expect(index("public.ghost_challenges")).toBeLessThan(index("public.swimming_activities"));
    expect(index("public.activity_ai_insights")).toBeLessThan(index("public.swimming_activities"));
    expect(whereText("public.swimming_activities")).toBe("user_id = $");
    expect(whereText("public.garmin_activity_laps")).toContain("activity_id IN (SELECT id FROM swimming_activities WHERE user_id = $)");
    expect(whereText("public.garmin_activity_lengths")).toContain("activity_id IN (SELECT id FROM swimming_activities WHERE user_id = $)");
  });

  it("deletes the product engagement events as actor and as target, before the posts they point at", async () => {
    const { deleteUserAccount } = await import("./db");
    await deleteUserAccount(9);
    const where = whereText("public.product_engagement_events");
    expect(where).toContain("user_id = $");
    expect(where).toContain("entity_type = 'user_profile' AND entity_id = $");
    expect(where).toContain("entity_type = 'social_post' AND entity_id IN (SELECT id FROM social_posts WHERE user_id = $)");
    expect(tables().indexOf("public.product_engagement_events")).toBeLessThan(tables().indexOf("public.social_posts"));
    expect(callFor("public.product_engagement_events")?.[0]).toBe(m.tx);
  });

  it("reads the media before the transaction and cleans them up (with Garmin) after it", async () => {
    const { deleteUserAccount } = await import("./db");
    await deleteUserAccount(9);
    expect(m.collectUserMediaRefs).toHaveBeenCalledWith(m.db, 9);
    expect(m.cleanupDeletedAccount).toHaveBeenCalledWith(m.refs);
    expect(m.order).toEqual(["collect", "transaction", "cleanup"]);
  });

  it("answers without waiting for the provider cleanup, which runs detached", async () => {
    m.cleanupDeletedAccount.mockImplementation(() => new Promise(() => {}));
    const { deleteUserAccount } = await import("./db");
    await expect(deleteUserAccount(9)).resolves.toMatchObject({ id: 9 });
    expect(m.cleanupDeletedAccount).toHaveBeenCalledWith(m.refs);
  });

  it("logs a failed provider cleanup instead of throwing it", async () => {
    m.cleanupDeletedAccount.mockImplementation(async () => {
      throw new Error("imagekit down");
    });
    const { deleteUserAccount } = await import("./db");
    await expect(deleteUserAccount(9)).resolves.toMatchObject({ id: 9 });
    // Let the detached rejection settle: it must not surface as an unhandled rejection.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("touches no provider when the transaction fails", async () => {
    m.db.transaction.mockRejectedValueOnce(new Error("deadlock"));
    const { deleteUserAccount } = await import("./db");
    await expect(deleteUserAccount(9)).rejects.toThrow("deadlock");
    expect(m.cleanupDeletedAccount).not.toHaveBeenCalled();
  });

  it("still deletes the account when the media cannot be read", async () => {
    m.collectUserMediaRefs.mockRejectedValueOnce(new Error("timeout"));
    const { deleteUserAccount } = await import("./db");
    await expect(deleteUserAccount(9)).resolves.toMatchObject({ id: 9 });
    expect(m.cleanupDeletedAccount).toHaveBeenCalledWith({ userId: 9, imageKitFileIds: [], urls: [], keepUrls: [] });
  });
});
