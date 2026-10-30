import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ inserted: [] as Array<Record<string, unknown>>, noDb: false }));

vi.mock("./db", () => {
  // No consent recorded yet.
  const select = () => {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: async () => [],
    };
    return chain;
  };
  const insert = () => ({
    values: (values: Record<string, unknown>) => {
      m.inserted.push(values);
      return {
        onConflictDoUpdate: () => ({
          returning: async () => [{ id: m.inserted.length, ...values, updatedAt: new Date() }],
        }),
      };
    },
  });
  return { getDb: async () => (m.noDb ? null : { select, insert }) };
});

import { CONSENT_TYPES, CONSENT_VERSION, recordLegalAcceptance } from "./consent";

describe("registration consents", () => {
  beforeEach(() => {
    m.inserted.length = 0;
    m.noDb = false;
  });

  it("know the «almeno 14 anni» declaration", () => {
    expect(CONSENT_TYPES).toContain("age_confirmation");
    expect(CONSENT_VERSION.age_confirmation).toBe("v1.0");
  });

  it("records Termini, Privacy and the age when the user accepts", async () => {
    await recordLegalAcceptance(8);
    expect(m.inserted.map((row) => [row.consentType, row.granted])).toEqual([
      ["terms_acceptance", true],
      ["privacy_policy", true],
      ["age_confirmation", true],
    ]);
  });

  it("throws when the acceptance could not be stored (the caller then issues no session)", async () => {
    m.noDb = true;
    await expect(recordLegalAcceptance(8)).rejects.toThrow(/not recorded/);
  });
});
