# Self‑hosting (local)

This project can run locally with a minimal Postgres container.

## 1) Start Postgres
```bash
docker compose up -d
```

## 2) Configure env
```bash
cp .env.example .env.local
```
Set at least:
```
DATABASE_URL=postgresql://swimforge:swimforge@localhost:5432/swimforge
JWT_SECRET=change_me_long_random
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
CRON_SECRET=change_me_cron_secret
```

## 3) Run migrations / schema
If you use Drizzle migrations:
```bash
pnpm db:migrate
```

## 4) Seed demo data (optional)
```sql
-- Run docs/sample-data/seed.sql in your SQL tool
```

## 5) Start dev
```bash
pnpm dev
```

## 6) Validate local setup
```bash
pnpm check
pnpm test
```
