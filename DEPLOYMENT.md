# SwimForge Oppidum - Deployment Guide

This guide reflects the current production architecture used by this repository.

## Target Architecture
- Main app (frontend + backend): Render Web Service (Node)
- Database: Supabase PostgreSQL
- Garmin microservice: Render Web Service (Python)

## 1. Provision Supabase
1. Create a Supabase project.
2. Copy the PostgreSQL connection string.
3. Run base SQL (`supabase-init.sql`) if your environment is empty.

Required DB env:
- `DATABASE_URL`

## 2. Deploy Garmin Service (Render)
1. Create a Render Web Service from this repo.
2. Set `Root Directory` to `garmin-service`.
3. Build command:
   ```bash
   pip install -r requirements.txt
   ```
4. Start command:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port $PORT
   ```
5. Configure env:
   - `GARMIN_SERVICE_SECRET`

Save the deployed URL, used later as `GARMIN_SERVICE_URL` in the main app.

## 3. Deploy Main App (Render)
1. Create a Render Web Service from this repo root.
2. Build command:
   ```bash
   pnpm install --frozen-lockfile && pnpm build
   ```
3. Start command:
   ```bash
   pnpm start
   ```

## 4. Main App Environment Variables
Set at least:

Core:
- `NODE_ENV=production`
- `DATABASE_URL`
- `JWT_SECRET`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Integrations:
- `GARMIN_SERVICE_URL`
- `GARMIN_SERVICE_SECRET`
- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `GEMINI_API_KEY`

Media:
- `IMAGEKIT_PUBLIC_KEY`
- `IMAGEKIT_PRIVATE_KEY`
- `IMAGEKIT_URL_ENDPOINT`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

Security and cron:
- `CRON_SECRET`
- `TOKEN_ENCRYPTION_KEY` (64-char hex prefixed with `hex:`)
- `ALLOWED_ORIGINS` (comma-separated allowed origins)

Optional but recommended:
- `REDIS_URL`
- `REDIS_REQUIRED_FOR_READY` (`true` = Redis critico per `/ready`, `false` = `/ready` dipende solo dal DB)
- `REDIS_RATE_LIMIT_MODE` (`memory` fail-open distribuito, `block` fail-closed)
- `ROLLBAR_ACCESS_TOKEN`
- `DEPLOY_TARGET` (`render` on Render, `oracle` on Oracle)
- `APP_RELEASE` (commit SHA or release tag)
- `ROLLBAR_SERVER_HOST` (override detected host in Rollbar payload)
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `ENABLE_SWAGGER=false` (or set true with `SWAGGER_USERNAME` and `SWAGGER_PASSWORD`)

Use `.env.example` as the reference checklist.

## 5. Migrations
Migrations are not auto-applied at runtime.

Before/after deploy (depending on your release flow), run:
```bash
pnpm db:validate
pnpm db:generate
pnpm db:migrate
```

For production, run migrations against production `DATABASE_URL` from a trusted environment.

Important:
- Use only the canonical Drizzle migration chain under `drizzle/`.
- Keep Drizzle metadata aligned (`drizzle/meta/_journal.json` + latest `*_snapshot.json`) via `pnpm db:validate`.
- Do not execute scripts from `db/legacy-sql/` unless you are performing a controlled recovery/backfill task.

## 6. Post-Deploy Smoke Checks
1. `GET /health` and `GET /ready`
2. Login and open Dashboard
3. Feed load + create post
4. Story create/view
5. AI coach chat request
6. Garmin status endpoint from UI

## 7. Cron Endpoints
Cron routes require `Authorization: Bearer <CRON_SECRET>`.

Available cron endpoints:
- `POST /api/cron/complete-challenges`
- `POST /api/cron/evaluate-skill-level`
- `POST /api/cron/cleanup-expired-stories`
- `POST /api/cron/cleanup-social-retention`
- `POST /api/cron/club-ai/tick`

`/api/cron/club-ai/tick` operational behavior:
- Requires `CLUB_AI_AUTOMATION_ENABLED=true`
- Returns `503` when automation is disabled or no club config is enabled (to surface misconfiguration in monitors)

## 8. Troubleshooting
- `401 Unauthorized` on cron: wrong/missing bearer token.
- `503 CRON_SECRET not configured`: set `CRON_SECRET`.
- Media upload/signature errors: verify ImageKit/Cloudinary env values exactly.
- AI fallback responses: verify `GEMINI_API_KEY`.
- DB connection errors: verify `DATABASE_URL` and network access from Render.
- Redis degraded mode: check logs `redis:policy`, `redis:degraded_mode`, `rate-limit:fail_open_memory_fallback`, `rate-limit:fail_closed_block`.
