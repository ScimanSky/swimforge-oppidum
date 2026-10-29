import { useMediaQuery } from "./useMediaQuery";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** Whether the system asks for reduced motion right now (false where it cannot be known). */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/** prefersReducedMotion as state: re-renders when the setting changes. */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery(REDUCED_MOTION_QUERY, false);
}
