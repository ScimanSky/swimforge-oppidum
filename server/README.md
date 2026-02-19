# SwimForge Backend (tRPC + Express)

Backend service for SwimForge Oppidum, written in TypeScript.

## Entry Points
- `server/_core/index.ts`: HTTP server bootstrap, middleware, cron endpoints
- `server/routers/index.ts`: root tRPC router composition
- `server/_core/context.ts`: request context and auth context creation

## Router Organization
Main routers are split by domain:
- `server/routers/auth.router.ts`
- `server/routers/profile.router.ts`
- `server/routers/activities.router.ts`
- `server/routers/community.*.router.ts`
- `server/routers/challenges.router.ts`
- `server/routers/gameplay.router.ts`
- `server/routers/admin.router.ts`

## Data Layer
- `server/db*.ts`: business/data access modules
- `drizzle/schema.ts`: schema definitions
- `drizzle/*.sql`: migrations

## Integrations
- Garmin: `server/garmin.ts` + `garmin-service/`
- Strava: `server/strava.ts`
- AI: `server/ai_coach*.ts`, `server/ai_insights.ts`
- Media: `server/lib/imagekit.ts`, `server/lib/cloudinary.ts`

## Development Commands
- Typecheck: `pnpm check`
- Build: `pnpm build`
- Tests: `pnpm test`

## API Docs
Generate TypeDoc:
```bash
pnpm docs:generate
```
Output goes to `docs/api/`.
