import { describe, expect, it } from "vitest";
import { DEFAULT_DM_RETENTION_DAYS, DEFAULT_NOTIFICATION_RETENTION_DAYS, socialRetentionSettings } from "./social-retention";

// POST /api/cron/cleanup-social-retention (nightly, from cron-job.org): how long direct messages and
// notifications are kept. Body, query and environment can override the defaults, in that order.

describe("social retention settings", () => {
  it("keeps direct messages for a year and notifications for 90 days by default", () => {
    expect(DEFAULT_DM_RETENTION_DAYS).toBe(365);
    expect(DEFAULT_NOTIFICATION_RETENTION_DAYS).toBe(90);
    expect(socialRetentionSettings({}, {}, {})).toEqual({ dmRetentionDays: 365, notificationRetentionDays: 90, limit: 1000 });
  });

  it("takes the body first, then the query, then DM_RETENTION_DAYS and the other variables", () => {
    const env = { DM_RETENTION_DAYS: "200", NOTIFICATION_RETENTION_DAYS: "60", SOCIAL_RETENTION_BATCH_LIMIT: "500" };
    expect(socialRetentionSettings({}, {}, env)).toEqual({ dmRetentionDays: 200, notificationRetentionDays: 60, limit: 500 });
    expect(socialRetentionSettings({}, { dmRetentionDays: "120" }, env)).toMatchObject({ dmRetentionDays: 120 });
    expect(socialRetentionSettings({ dmRetentionDays: 30 }, { dmRetentionDays: "120" }, env)).toMatchObject({ dmRetentionDays: 30 });
  });

  it("falls back to the defaults on values that are not numbers", () => {
    expect(socialRetentionSettings({ dmRetentionDays: "mai" }, {}, { NOTIFICATION_RETENTION_DAYS: "x" })).toEqual({
      dmRetentionDays: 365,
      notificationRetentionDays: 90,
      limit: 1000,
    });
  });
});
