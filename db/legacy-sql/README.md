# Legacy SQL Archive

This folder contains historical/manual SQL scripts that were previously stored in root paths or in `drizzle/migrations/`.

## Status
- Archived for traceability.
- Not used by the default migration workflow.

## Canonical migration flow
Use only:
- `drizzle/00xx_*.sql`
- `pnpm db:generate`
- `pnpm db:migrate`

## When to use archived scripts
Only for explicitly planned maintenance tasks (recovery, one-off backfill, audit verification), never as part of normal deploy.
