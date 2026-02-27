# SwimForge Oppidum - Oracle Cloud Deployment (ARM)

This guide deploys the full app stack on an Oracle Cloud ARM instance (`VM.Standard.A1.Flex`) using Docker Compose.

## What moves from Render to Oracle
- Main app (frontend + backend): Oracle VM
- Garmin microservice: Oracle VM
- TLS + reverse proxy: Caddy in Docker
- Database: keep Supabase PostgreSQL (recommended)

## 1) Oracle VM prerequisites
1. Create the VM with Ubuntu 22.04/24.04 ARM.
2. Assign a public IP.
3. In VCN Security List / NSG, allow inbound:
   - `22/tcp` (SSH)
   - `80/tcp` (HTTP)
   - `443/tcp` (HTTPS)
4. Point DNS `A` record (example `app.example.com`) to the VM public IP.

## 2) Install Docker on the VM
```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

## 3) Prepare project and env
```bash
git clone <your-repo-url> swimforge-oppidum-cloud
cd swimforge-oppidum-cloud
cp .env.oracle.example .env.oracle
```

Update `.env.oracle`:
- Set `DOMAIN` and `ACME_EMAIL`
- Set all required app secrets (`DATABASE_URL`, `JWT_SECRET`, `SUPABASE_*`, `CRON_SECRET`, `TOKEN_ENCRYPTION_KEY`, integrations)
- Set `ALLOWED_ORIGINS=https://<your-domain>`
- Keep `GARMIN_SERVICE_SECRET` populated (used by both app and garmin service)
- Configure local text AI:
  - `LLM_PROVIDER=local`
  - `LOCAL_LLM_BASE_URL=http://ollama:11434/v1`
  - `LOCAL_LLM_MODEL=qwen3:8b`
  - `LOCAL_LLM_FALLBACK_MODEL=qwen3:4b`
  - `LOCAL_LLM_API_KEY=ollama`
- Keep `OPENAI_API_KEY` active only for image features (club branding / club AI post images)
- Set Strava bridge envs:
  - `STRAVA_SERVICE_URL`
  - `STRAVA_SERVICE_SECRET`

### Strava service options
This repository includes the Garmin microservice code, but not the Strava microservice runtime code.

- Option A (fastest migration): keep Strava service on Render for now
  - `STRAVA_SERVICE_URL=https://swimforge-strava-service.onrender.com` (or your Render URL)
  - `STRAVA_SERVICE_SECRET=<same secret configured in Render Strava service>`
- Option B (full Oracle migration): deploy Strava microservice from its own repository, then point:
  - `STRAVA_SERVICE_URL=https://<your-strava-domain>` (or internal URL if in same Docker network)
  - `STRAVA_SERVICE_SECRET=<shared secret>`

## 4) Run DB migrations
Run before first production start:
```bash
docker compose --env-file .env.oracle -f docker-compose.oracle.yml run --rm app pnpm db:migrate
```

## 5) Start services
```bash
docker compose --env-file .env.oracle -f docker-compose.oracle.yml up -d --build
```

Services started:
- `app` on internal port `3000`
- `garmin` on internal port `8000`
- `ollama` on internal port `11434` (local text LLM runtime)
- `caddy` on `80/443` with automatic TLS

Garmin session tokens are persisted in Docker volume `garmin_tokens`.
Ollama model data is persisted in Docker volume `ollama_data`.

## 6) Pull local LLM models
Run once after first startup:
```bash
docker compose --env-file .env.oracle -f docker-compose.oracle.yml exec ollama ollama pull qwen3:8b
docker compose --env-file .env.oracle -f docker-compose.oracle.yml exec ollama ollama pull qwen3:4b
docker compose --env-file .env.oracle -f docker-compose.oracle.yml exec ollama curl -s http://127.0.0.1:11434/api/tags
```

## 7) Verify
```bash
docker compose -f docker-compose.oracle.yml ps
docker compose -f docker-compose.oracle.yml logs -f app
curl -I https://<your-domain>/health
curl -I https://<your-domain>/ready
```

## 8) Configure cron jobs (on VM)
Create `crontab -e` entries:
```cron
*/10 * * * * curl -fsS -X POST "https://<your-domain>/api/cron/complete-challenges" -H "Authorization: Bearer <CRON_SECRET>" > /dev/null
0 2 * * * curl -fsS -X POST "https://<your-domain>/api/cron/evaluate-skill-level" -H "Authorization: Bearer <CRON_SECRET>" > /dev/null
15 2 * * * curl -fsS -X POST "https://<your-domain>/api/cron/cleanup-expired-stories" -H "Authorization: Bearer <CRON_SECRET>" > /dev/null
30 2 * * * curl -fsS -X POST "https://<your-domain>/api/cron/cleanup-social-retention" -H "Authorization: Bearer <CRON_SECRET>" > /dev/null
```

## 9) Update flow (after new commits)
```bash
git pull
docker compose --env-file .env.oracle -f docker-compose.oracle.yml run --rm app pnpm db:migrate
docker compose --env-file .env.oracle -f docker-compose.oracle.yml up -d --build
```

## Troubleshooting
- TLS certificate not issued:
  - confirm DNS `A` record points to VM
  - confirm ports `80` and `443` are open in Oracle networking
- `503` on `/ready`:
  - verify `DATABASE_URL`
  - if `REDIS_URL` is set, ensure Redis is reachable
- Garmin disconnected after restarts:
  - ensure `garmin_tokens` volume exists and container starts without mount errors
