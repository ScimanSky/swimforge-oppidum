# Contributing to SwimForge Oppidum

Thanks for your interest in contributing! This repo is a monorepo with a React/Vite client, Node/Express API, and a Supabase/Postgres backend.

## Quickstart
1) Fork and clone:
```bash
git clone https://github.com/ScimanSky/swimforge-oppidum.git
cd swimforge-oppidum
```
2) Install deps:
```bash
pnpm install
```
3) Create env file:
```bash
cp .env.example .env.local
```
4) Run dev:
```bash
pnpm dev
```

## Branching & PRs
- Create a feature branch: `git checkout -b feat/your-topic`
- Keep PRs focused and small
- Include screenshots for UI changes

## Commit Conventions
Use clear, scoped commits. Example:
- `feat: add club list UI`
- `fix: handle null HR values`
- `docs: update quickstart`

## Tests / Lint
Run before PR if relevant:
```bash
pnpm test
pnpm check
```

## Providers (Strava / Garmin)
- **Strava** is currently in dev mode (single maintainer). Multi‑user approval is pending.
- **Garmin** is accessed via a third‑party provider due to strict API policy.

### Adding a provider connector (high level)
1) Add client for provider in `server/` (or new service)
2) Normalize activity data into `swimming_activities`
3) Wire tokens/refresh + mapping in `server/strava.ts` or new file
4) Add minimal tests

### Proposing a new metric
1) Add calculation in `server/db_statistics.ts` or metrics module
2) Add tests (if possible) under `tests/`
3) Update docs/README with definition

## Secrets & Env
- Never commit secrets.
- Use `.env.example` with placeholders only.
- Do not include real API tokens in PRs.

## Code of Conduct
We follow the Contributor Covenant. See `CODE_OF_CONDUCT.md`.
