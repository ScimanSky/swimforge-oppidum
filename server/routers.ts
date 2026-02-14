// ──────────────────────────────────────────────────────────────────────
// Backward-compatible shim.
//
// The monolithic router has been split into domain-specific files under
// ./routers/*.router.ts, composed together in ./routers/index.ts.
//
// This file re-exports the appRouter and AppRouter type so that every
// existing import  `from "./routers"`  or  `from "../routers"`  keeps
// working without any changes to the rest of the codebase.
// ──────────────────────────────────────────────────────────────────────

export { appRouter } from "./routers/index";
export type { AppRouter } from "./routers/index";

// Re-export helpers that were previously defined in this file
export { checkAndAwardBadges } from "./routers/index";
export { seedBadgesAndLevels } from "./routers/index";
