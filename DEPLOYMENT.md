# SwimForge Oppidum - Deployment Guide

> **Production runs on an Oracle VM** (`swimforge.it`). Server setup: `docs/ORACLE_DEPLOYMENT.md`.

## Target Architecture
- Oracle VM, docker compose (`docker-compose.oracle.yml`, env in `.env.oracle` on the host):
  - `app`: Node server (frontend + backend), port 3000 internal;
  - `garmin`: Python microservice (`garmin-service/`), port 8000 internal, tokens in the `garmin_tokens` volume;
  - `caddy`: reverse proxy and TLS on 80/443 (`deploy/Caddyfile`);
  - `ollama`: optional local LLM (profile `local-llm`).
- Database: Supabase PostgreSQL (`DATABASE_URL`).
- `docker-compose.yml` in the repo root is only a local Postgres for development.

## 1. Provision Supabase
1. Create a Supabase project.
2. Copy the PostgreSQL connection string.
3. Run base SQL (`supabase-init.sql`) if your environment is empty.

Required DB env: `DATABASE_URL`.

## 2. Deploy
Every push to `main` deploys (`.github/workflows/deploy-oracle.yml`, also runnable by hand with `workflow_dispatch`). Never push unfinished work to `main`: use a branch.

The workflow connects over SSH (secrets `ORACLE_HOST`, `ORACLE_PORT`, `ORACLE_USER`, `ORACLE_SSH_KEY`) and runs `deploy/swimforge-deploy.sh` on the host, which:
1. takes a lock (a second concurrent deploy waits and retries, up to 30 times);
2. `git pull --ff-only origin main`;
3. `docker compose -f docker-compose.oracle.yml up -d --build app garmin` (Caddy is not rebuilt), with `APP_RELEASE` / `APP_COMMIT_SHA` set to the commit;
4. checks `https://swimforge.it/ready`, then `/health/deep` (the latter does not fail the deploy).

Warning: the workflow can report success while the app crash-loops (its retry polls `http://127.0.0.1/ready`, which Caddy answers with a 308). After every deploy check from outside:
```bash
curl -fsS https://swimforge.it/ready
curl -fsS https://swimforge.it/health/deep
```
`/ready` depends on the database (and on Redis when `REDIS_REQUIRED_FOR_READY=true`); `/health/deep` also fails when an optional integration is down.

## 3. Main App Environment Variables
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
- `DEPLOY_TARGET` (`oracle`, set by the deploy script)
- `APP_RELEASE` (commit SHA, set by the deploy script)
- `ROLLBAR_SERVER_HOST` (override detected host in Rollbar payload)
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `ENABLE_SWAGGER=false` (or set true with `SWAGGER_USERNAME` and `SWAGGER_PASSWORD`)

Use `.env.example` as the reference checklist.

## 4. Migrations
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

## 5. Post-Deploy Smoke Checks
1. `GET /ready` and `GET /health/deep` from outside (`https://swimforge.it`)
2. Login and open Dashboard
3. Feed load + create post
4. AI coach chat request
5. Garmin status endpoint from UI

## 6. Cron Endpoints
Cron routes require `Authorization: Bearer <CRON_SECRET>`.

Available cron endpoints:
- `POST /api/cron/complete-challenges`
- `POST /api/cron/evaluate-skill-level`
- `POST /api/cron/cleanup-social-retention`
- `POST /api/cron/club-ai/tick`

`/api/cron/club-ai/tick` operational behavior:
- Requires `CLUB_AI_AUTOMATION_ENABLED=true`
- Returns `503` when automation is disabled or no club config is enabled (to surface misconfiguration in monitors)

## 7. Troubleshooting
- `401 Unauthorized` on cron: wrong/missing bearer token.
- `503 CRON_SECRET not configured`: set `CRON_SECRET`.
- Media upload/signature errors: verify ImageKit/Cloudinary env values exactly.
- AI fallback responses: verify `GEMINI_API_KEY`.
- DB connection errors: verify `DATABASE_URL` and network access from the Oracle VM.
- Redis degraded mode: check logs `redis:policy`, `redis:degraded_mode`, `rate-limit:fail_open_memory_fallback`, `rate-limit:fail_closed_block`.
