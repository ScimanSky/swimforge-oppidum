# SwimForge Oppidum - Oracle Cloud Deployment (ARM)

Questa guida descrive il percorso **ufficiale** di deploy Oracle:
- GitHub Actions (`Deploy Oracle`)
- script versionato nel repository: `deploy/swimforge-deploy.sh`
- build/runtime tramite `docker-compose.oracle.yml`

## Architettura target
- Main app (frontend + backend): Oracle VM
- Garmin microservice: Oracle VM
- TLS + reverse proxy: Caddy in Docker
- Database: Supabase PostgreSQL (raccomandato)

## 1) Prerequisiti VM Oracle
1. Crea una VM Ubuntu 22.04/24.04 ARM (`VM.Standard.A1.Flex`).
2. Assegna IP pubblico.
3. Apri ingress in VCN/NSG:
   - `22/tcp` (SSH)
   - `80/tcp` (HTTP)
   - `443/tcp` (HTTPS)
4. Punta il record DNS `A` (es. `app.example.com`) all'IP pubblico.

## 2) Installa Docker sulla VM
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

## 3) Clona repository e prepara env
```bash
git clone <your-repo-url> swimforge-oppidum
cd swimforge-oppidum
cp .env.oracle.example .env.oracle
```

Aggiorna `.env.oracle` con almeno:
- Core: `DATABASE_URL`, `DB_SSL_REJECT_UNAUTHORIZED`, `DB_SSL_ALLOW_INSECURE_FALLBACK`, `DB_SSL_CA_CERT_BASE64`, `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Security: `CRON_SECRET`, `TOKEN_ENCRYPTION_KEY`, `ALLOWED_ORIGINS`, `OAUTH_ALLOWED_REDIRECT_ORIGINS`
- Integrations: `GARMIN_SERVICE_SECRET`, `STRAVA_SERVICE_URL`, `STRAVA_SERVICE_SECRET`, `OPENAI_API_KEY` (se usato)
- Garmin hardening (opzionale, raccomandato): `GARMIN_CORS_ALLOW_ORIGINS`, `GARMIN_CORS_ALLOW_CREDENTIALS=false`
- Oracle ingress: `DOMAIN`, `ACME_EMAIL`

TLS DB raccomandato:
- target finale: `DB_SSL_REJECT_UNAUTHORIZED=true` con `DB_SSL_CA_CERT_BASE64` valorizzato
- transitorio anti-downtime: `DB_SSL_ALLOW_INSECURE_FALLBACK=true` (fallback automatico solo su errori certificato)

Note Garmin service:
- in Oracle compose il container `garmin` non pubblica porte host (solo `expose: 8000` su rete Docker interna).
- mantenere `GARMIN_CORS_ALLOW_ORIGINS` vuoto se il microservizio non viene chiamato dal browser.

## 4) Verifica integrità asset deploy (obbligatorio)
Esegui prima del primo deploy:
```bash
test -f Dockerfile
test -f docker-compose.oracle.yml
test -f deploy/swimforge-deploy.sh
test -x deploy/swimforge-deploy.sh
```

Verifica tracking Git:
```bash
git ls-files Dockerfile deploy/swimforge-deploy.sh docker-compose.oracle.yml
```

## 5) One-time bootstrap server
Esegui una sola volta sulla VM:
```bash
cd /home/ubuntu/projects/swimforge-oppidum
git pull --ff-only origin main
chmod +x deploy/swimforge-deploy.sh
```

Opzione raccomandata per deprecare script globale:
```bash
sudo tee /usr/local/bin/swimforge-deploy.sh >/dev/null <<'SH'
#!/usr/bin/env bash
set -euo pipefail
exec /home/ubuntu/projects/swimforge-oppidum/deploy/swimforge-deploy.sh "$@"
SH
sudo chmod +x /usr/local/bin/swimforge-deploy.sh
```

## 6) Deploy ufficiale via GitHub Actions
Workflow: `.github/workflows/deploy-oracle.yml`

Secrets richiesti:
- `ORACLE_HOST`
- `ORACLE_PORT`
- `ORACLE_USER`
- `ORACLE_SSH_KEY`

Il workflow esegue da remoto:
```bash
bash /home/ubuntu/projects/swimforge-oppidum/deploy/swimforge-deploy.sh
```

## 7) Esecuzione manuale (fallback operativo)
```bash
bash /home/ubuntu/projects/swimforge-oppidum/deploy/swimforge-deploy.sh
```

## 8) Migrazioni DB
Prima del primo avvio produzione:
```bash
docker compose --env-file .env.oracle -f docker-compose.oracle.yml run --rm app pnpm db:migrate
```

In update ordinari, integrare la migrazione nel runbook operativo prima del `up -d --build`.

## 9) Verifiche post-deploy
```bash
docker compose --env-file .env.oracle -f docker-compose.oracle.yml ps
docker compose --env-file .env.oracle -f docker-compose.oracle.yml logs -f app
curl -I https://<your-domain>/ready
curl -I https://<your-domain>/health
curl -I https://<your-domain>/health/deep
```

Interpretazione endpoint:
- `/ready`: availability primaria (dipendenze critiche: DB + Redis configurato).
- `/health`: stato operativo con semantica `healthy|degraded|unhealthy` (HTTP 200 se core è up, anche se integrazioni opzionali sono degradate).
- `/health/deep`: deep-check strict (HTTP 503 se Garmin o Storage sono giù).

## 10) Monitoraggio UptimeRobot (raccomandato)
Configura due monitor separati:
1. Primario availability
   - URL: `https://<your-domain>/ready`
   - expected status: `200`
   - severità: alta (incident)
2. Secondario deep diagnostics
   - URL: `https://<your-domain>/health/deep`
   - expected status: `200`
   - severità: warning/non-blocking

## 11) Cron jobs (VM)
```cron
*/10 * * * * curl -fsS -X POST "https://<your-domain>/api/cron/complete-challenges" -H "Authorization: Bearer <CRON_SECRET>" > /dev/null
0 2 * * * curl -fsS -X POST "https://<your-domain>/api/cron/evaluate-skill-level" -H "Authorization: Bearer <CRON_SECRET>" > /dev/null
15 2 * * * curl -fsS -X POST "https://<your-domain>/api/cron/cleanup-expired-stories" -H "Authorization: Bearer <CRON_SECRET>" > /dev/null
30 2 * * * curl -fsS -X POST "https://<your-domain>/api/cron/cleanup-social-retention" -H "Authorization: Bearer <CRON_SECRET>" > /dev/null
```

## Troubleshooting
- Certificati TLS non emessi:
  - verifica DNS `A` record
  - verifica aperture `80/443` su Oracle networking
- `503` su `/ready`:
  - verifica `DATABASE_URL`
  - se `REDIS_URL` è configurata, verifica raggiungibilità Redis
- `503` su `/health/deep` ma `/ready` è `200`:
  - impatto non bloccante sulla disponibilità core
  - verificare integrazioni `GARMIN_SERVICE_URL` e/o storage Supabase
- Garmin disconnesso dopo restart:
  - verifica volume `garmin_tokens`
- deploy fallisce su lock:
  - attendi rilascio lock `/tmp/swimforge-deploy.lock` o verifica processi deploy concorrenti
