import { describe, expect, it } from "vitest";
import { dmRetentionNote } from "./dm-retention";

describe("direct message retention note", () => {
  it("says one year for the default 365 days", () => {
    expect(dmRetentionNote(365)).toBe("I messaggi vengono eliminati automaticamente dal server dopo 1 anno.");
  });

  it("counts the days otherwise", () => {
    expect(dmRetentionNote(30)).toBe("I messaggi vengono eliminati automaticamente dal server dopo 30 giorni.");
  });
});
