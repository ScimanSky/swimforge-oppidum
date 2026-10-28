import type { NextFunction, Request, Response } from "express";

/**
 * Default CORS origins when ALLOWED_ORIGINS is not set.
 * `https://app.swimforge.it` is the origin of the Android app's WebView (Capacitor
 * serves the bundle locally under that hostname); it is same-site with the website.
 * Production sets ALLOWED_ORIGINS explicitly in `.env.oracle`: keep the public
 * origin first there (server/db_club_meets.ts uses the first entry for email links).
 */
export const DEFAULT_ALLOWED_ORIGINS: readonly string[] = [
  "https://swimforge-frontend.onrender.com",
  "https://swimforge.it",
  "https://www.swimforge.it",
  "https://app.swimforge.it",
];

/** Origins compare as scheme://host[:port]: trimmed, lowercase, no trailing slash. */
export function normalizeOrigin(value: string): string {
  return value.trim().toLowerCase().replace(/\/+$/, "");
}

export function parseAllowedOrigins(raw: string | undefined): string[] {
  const entries = (raw ?? "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
  return entries.length > 0 ? Array.from(new Set(entries)) : [...DEFAULT_ALLOWED_ORIGINS];
}

/**
 * A missing Origin header is only treated as allowed outside production
 * (for CORS headers purposes; requests without Origin are never rejected).
 */
export function isOriginAllowed(
  origin: string | undefined,
  allowedOrigins: readonly string[],
  isProduction: boolean,
): boolean {
  if (!origin) return !isProduction;
  const normalized = normalizeOrigin(origin);
  return allowedOrigins.some((entry) => normalizeOrigin(entry) === normalized);
}

export type OriginRejection = { origin: string; method: string; path: string };

/**
 * Rejects cross-origin requests (preflight included) whose Origin header is not
 * allowed with 403 `{ error: "origin_not_allowed" }`, instead of letting the CORS
 * middleware raise an error that ends up as a 500. Requests without an Origin
 * header (navigation, curl, health checks) pass through untouched.
 */
export function createOriginGuard(options: {
  getAllowedOrigins: () => readonly string[];
  onReject?: (info: OriginRejection) => void;
}) {
  return function originGuard(req: Request, res: Response, next: NextFunction) {
    const origin = req.headers.origin;
    if (!origin || isOriginAllowed(origin, options.getAllowedOrigins(), true)) {
      next();
      return;
    }
    options.onReject?.({ origin, method: req.method, path: req.path });
    res.status(403).json({ error: "origin_not_allowed" });
  };
}
