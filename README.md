# SwimForge Oppidum

SwimForge Oppidum is a social + analytics web app for swimmers.
It combines training tracking, social feed/stories/clubs, and AI coach features.

## Stack
- Frontend: React + Vite + TypeScript
- Backend: Node.js + Express + tRPC
- Database: PostgreSQL (Supabase recommended)
- ORM/Migrations: Drizzle
- Integrations: Garmin service, Strava, Gemini, ImageKit, Cloudinary

## Core Features
- Activity tracking (pool/open-water) with share-to-feed flow
- Social feed, stories, reactions, comments, direct messages, clubs
- XP, badges, records, and seasonal engagement mechanics
- AI coach chat and AI-generated insights

## Local Development

Prerequisites:
- Node.js 20+
- pnpm
- PostgreSQL (local or Supabase)

Setup:
```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Quality gates:
```bash
pnpm check
pnpm test
```

Database migrations:
```bash
pnpm db:generate
pnpm db:migrate
```

Migration policy:
- Canonical migration chain: `drizzle/0000_*.sql` ... `drizzle/00xx_*.sql`
- Legacy/manual SQL scripts are archived in `db/legacy-sql/` and are **not** part of the default migrate flow.

Optional demo seed:
- `docs/sample-data/seed.sql`

## Monorepo Layout
- `client/`: UI and pages
- `server/`: API and business logic
- `drizzle/`: schema and SQL migrations
- `shared/`: shared constants/types
- `garmin-service/`: Python microservice for Garmin sync

## Operations
- Deploy guide: `DEPLOYMENT.md`
- Self-hosting: `docs/SELF_HOST.md`
- Security policy: `SECURITY.md`
- Contribution flow: `CONTRIBUTING.md`

## License
Apache-2.0
