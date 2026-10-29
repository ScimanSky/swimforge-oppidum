import { afterAll, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => {
  const tx = { execute: vi.fn(async () => ({ rows: [] })) };
  const db = {
    execute: vi.fn(async () => ({ rows: [{ id: 9, email: "a@b.it", name: "A", open_id: null }] })),
    transaction: vi.fn(async (cb: (t: typeof tx) => Promise<void>) => cb(tx)),
  };
  return { tx, db, deleteFromIfExists: vi.fn(async () => true) };
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

const previousUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL = "postgres://test@localhost/test";
afterAll(() => {
  if (previousUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousUrl;
});

describe("deleteUserAccount", () => {
  it("deletes the user's push device tokens inside the transaction", async () => {
    const { deleteUserAccount } = await import("./db");
    await expect(deleteUserAccount(9)).resolves.toMatchObject({ id: 9 });
    const tables = m.deleteFromIfExists.mock.calls.map((call) => (call as unknown[])[1]);
    expect(tables).toContain("public.device_tokens");
    const call = m.deleteFromIfExists.mock.calls.find((c) => (c as unknown[])[1] === "public.device_tokens") as unknown[];
    expect(call[0]).toBe(m.tx);
  });

  it("deletes the user's club workout completions", async () => {
    const { deleteUserAccount } = await import("./db");
    await deleteUserAccount(9);
    const tables = m.deleteFromIfExists.mock.calls.map((call) => (call as unknown[])[1]);
    expect(tables).toContain("public.club_workout_completions");
  });
});
