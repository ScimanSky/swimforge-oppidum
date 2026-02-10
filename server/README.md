# SwimForge Backend (tRPC + Express)

This folder contains the SwimForge backend, implemented in TypeScript.

## Architecture

- `server/_core/index.ts`: main entrypoint. Creates the HTTP server and mounts the API.
- `server/routers.ts`: tRPC router definition (API surface).
- `server/db.ts` + `drizzle/`: database access layer (Drizzle ORM).
- `server/garmin.ts` / `server/strava.ts`: external integrations.
- `server/lib/`: shared backend utilities (cache, crypto, fetch helpers, etc.).
- `server/middleware/`: Express middleware (logging, security, validation).

## Development

- Typecheck: `pnpm check`
- Build: `pnpm build`
- Tests: `pnpm test`

## Adding A New Endpoint

1. Define input/output in `server/routers.ts` using `zod` schemas.
2. Keep business logic in a dedicated module under `server/` or `server/lib/`.
3. Prefer shared helpers (cache/logger/etc.) instead of duplicating logic.
4. Add/extend tests under `server/*.test.ts` when behavior is non-trivial.

## API Docs (TypeDoc)

Generate static API docs:

```bash
pnpm docs:generate
```

Output is generated into `docs/api/` (not committed by default).

