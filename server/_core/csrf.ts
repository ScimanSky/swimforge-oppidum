export type CsrfDecisionInput = {
  type: "query" | "mutation" | "subscription";
  hasSessionCookie: boolean;
  hasBearer: boolean;
  env: string | undefined;
  disabled: boolean;
};

/**
 * CSRF only matters when the browser attaches credentials by itself (the session cookie).
 * A Bearer header is never attached automatically, and a cross-site fetch with a custom
 * header is blocked by the CORS preflight, so bearer-authenticated requests are exempt.
 */
export function shouldEnforceCsrf(input: CsrfDecisionInput): boolean {
  if (input.env === "test" || input.disabled) return false;
  if (input.type !== "mutation") return false;
  if (input.hasBearer) return false;
  return input.hasSessionCookie;
}
