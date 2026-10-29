/** tRPC codes a retry cannot change: the answer is shown at once («Club non trovato»). */
const FINAL_CODES = new Set(["NOT_FOUND", "FORBIDDEN", "UNAUTHORIZED", "BAD_REQUEST"]);
/** TanStack Query's default for the rest (network, server errors): up to 3 retries. */
const MAX_RETRIES = 3;

/**
 * Default `retry` of the app's queries. TanStack Query retries every failure three times with
 * a growing delay, so a missing club or a members-only page took about 7 s to say so.
 * `failureCount` is the number of retries so far (0 before the first).
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  const code = (error as { data?: { code?: unknown } | null } | null | undefined)?.data?.code;
  if (typeof code === "string" && FINAL_CODES.has(code)) return false;
  return failureCount < MAX_RETRIES;
}
