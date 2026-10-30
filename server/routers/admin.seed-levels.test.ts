import { beforeEach, describe, expect, it, vi } from "vitest";

// level_thresholds is the only level table (seeded by supabase-init.sql): the admin seed must
// never rewrite it with a different copy from the code.

const m = vi.hoisted(() => ({
  db: {
    createLevelThreshold: vi.fn(async () => undefined),
    getBadgeDefinitionsCount: vi.fn(async () => 5),
    createBadgeDefinition: vi.fn(async () => undefined),
  } as Record<string, ReturnType<typeof vi.fn>>,
}));

vi.mock("./_shared", async () => {
  const actual = await vi.importActual<typeof import("./_shared")>("./_shared");
  return { ...actual, db: m.db };
});

import { seedBadgesAndLevels } from "./admin.router";

beforeEach(() => vi.clearAllMocks());

describe("seedBadgesAndLevels", () => {
  it("does not touch the level thresholds", async () => {
    await seedBadgesAndLevels();
    expect(m.db.createLevelThreshold).not.toHaveBeenCalled();
  });
});
