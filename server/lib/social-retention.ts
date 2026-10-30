/**
 * How long direct messages and notifications are kept (POST /api/cron/cleanup-social-retention,
 * run nightly from cron-job.org). The privacy policy says: messages 1 year, notifications 90 days.
 */
export const DEFAULT_DM_RETENTION_DAYS = 365;
export const DEFAULT_NOTIFICATION_RETENTION_DAYS = 90;
const DEFAULT_BATCH_LIMIT = 1000;

type Source = Record<string, unknown> | null | undefined;

/** Request body first, then query string, then environment, then the default. */
function pick(body: Source, query: Source, env: Source, key: string, envKey: string, fallback: number): number {
  const value = Number(body?.[key] ?? query?.[key] ?? env?.[envKey] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

export function socialRetentionSettings(body: Source, query: Source, env: Source = process.env) {
  return {
    dmRetentionDays: pick(body, query, env, "dmRetentionDays", "DM_RETENTION_DAYS", DEFAULT_DM_RETENTION_DAYS),
    notificationRetentionDays: pick(
      body,
      query,
      env,
      "notificationRetentionDays",
      "NOTIFICATION_RETENTION_DAYS",
      DEFAULT_NOTIFICATION_RETENTION_DAYS,
    ),
    limit: pick(body, query, env, "limit", "SOCIAL_RETENTION_BATCH_LIMIT", DEFAULT_BATCH_LIMIT),
  };
}
