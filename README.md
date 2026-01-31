# SwimForge Oppidum — social + analytics platform for swim activities (OSS)

SwimForge Oppidum is a gamified, social swim platform that unifies activity data (Garmin/Strava), computes advanced metrics, and delivers AI-assisted coaching insights. It is designed as a provider-agnostic monorepo with a modern React UI, a Node/Express API, and a PostgreSQL backend.

## Overview
SwimForge helps swimmers track pool and open-water sessions, earn XP and badges, and compare progress with friends. A metrics engine calculates performance/consistency indexes, while the AI layer generates coaching insights and training plans. The community hub enables sharing sessions, giving "Splash" kudos, and forming clubs.

## Key Features
- Ingestion of raw swim activities (Garmin/Strava)
- Unified data model + normalization layer
- Advanced metrics engine (pace, efficiency, load, zones)
- AI coaching insights (session & global)
- Gamification: badges, XP, levels
- Social hub + clubs + async challenges

## Current Status
- OK Garmin integration via third‑party provider
- OK Strava integration works for maintainer (dev mode)
- Pending: Strava multi‑user approval
- OK raw data storage + basic metrics
- Roadmap: metrics engine v1, test coverage, docs improvements

## Provider Constraints & Mitigation
- Strava: dev mode, multi‑user pending approval
- Garmin: strict APIs; integration via third‑party provider
- Mitigation: provider‑agnostic architecture + demo dataset + planned FIT/TCX/GPX import

## Quickstart (Dev)
**Prereqs**
- Node.js 20+ (Render uses 22.x)
- pnpm (or npm)
- PostgreSQL (Supabase recommended)

**Steps**
1) Install dependencies
```bash
pnpm install
```
2) Create env file
```bash
cp .env.example .env.local
```
3) Start dev server
```bash
pnpm dev
```

**Demo / Without providers**
- Use the sample dataset in `docs/sample-data/`.
- Run `docs/sample-data/seed.sql` in Supabase SQL editor to insert a demo user and 2 activities.

## Architecture (Monorepo)
- `client/` React + Vite frontend (Tailwind, wouter)
- `server/` Node/Express + tRPC API
- `drizzle/` schema + migrations
- `garmin-service/` Python microservice for Garmin data
- `shared/` shared types/helpers

## Roadmap
See `docs/ROADMAP.md`.

## Contributing
See `CONTRIBUTING.md`.

## License
Apache-2.0

## Security
See `SECURITY.md`.

## How grant credits help

Cline credits would be used primarily to accelerate refactors, improve test coverage, expand documentation/examples, and streamline contributor onboarding, while keeping quality gates enforced via CI and manual review.
