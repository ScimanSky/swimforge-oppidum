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
5. Runtime: l'immagine Docker usa Node.js 22 (`node:22-bookworm-slim`); sulla VM serve solo Docker. Per comandi `pnpm` eseguiti fuori dal container (es. `pnpm db:migrate` dal checkout) serve Node.js 22+ (`engines.node >=22` in `package.json`).

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
- Security: `CRON_SECRET`, `TOKEN_ENCRYPTION_KEY`, `ALLOWED_ORIGINS`
- Integrations: `GARMIN_SERVICE_SECRET`, `STRAVA_SERVICE_URL`, `STRAVA_SERVICE_SECRET`, `OPENAI_API_KEY` (se usato)
- Garmin service: `GARMIN_STATE_KEY` (chiave Fernet che cifra su disco lo stato MFA pendente; vuota = solo in memoria), `GARMIN_SERVICE_TIMEOUT_MS=60000` (le strategie di login Garmin possono attendere fino a 20 s ciascuna)
- Garmin hardening (opzionale, raccomandato): `GARMIN_CORS_ALLOW_ORIGINS`, `GARMIN_CORS_ALLOW_CREDENTIALS=false`
- Gemini: `GEMINI_API_KEY`, `GEMINI_TEXT_MODEL` (default `gemini-3.8-flash`), `GEMINI_PRO_MODEL` (default `gemini-3.1-pro-preview`), `GEMINI_IMAGE_MODEL` (default `gemini-3.1-flash-image`), `GEMINI_IMAGE_PRO_MODEL` (default `gemini-3-pro-image-preview`)
- Observability (opzionale): `ROLLBAR_ACCESS_TOKEN`, `DEPLOY_TARGET=oracle`, `APP_RELEASE`, `ROLLBAR_SERVER_HOST`
- Redis policy (raccomandato esplicito): `REDIS_REQUIRED_FOR_READY=true`, `REDIS_RATE_LIMIT_MODE=memory`
- Oracle ingress: `DOMAIN`, `ACME_EMAIL`
- Origini: `ALLOWED_ORIGINS=https://swimforge.it,https://www.swimforge.it,https://app.swimforge.it` (origin pubblico per primo; `app.swimforge.it` e' l'origin dell'app Android)
- Push (app Android, consigliato): `FIREBASE_SERVICE_ACCOUNT_JSON` (base64 del JSON del service account Firebase, `base64 -w0 file.json`; vuota = push disattivate con un warning all'avvio)

Generazione `GARMIN_STATE_KEY`:
```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Note Gemini:
- i nuovi progetti Google Cloud non possono più chiamare `gemini-2.5-flash` né `gemini-3-pro-preview` (404 "no longer available to new users"): lasciare i default.
- i progetti esistenti possono mantenere `gemini-2.5-flash` impostando `GEMINI_TEXT_MODEL=gemini-2.5-flash`; `GEMINI_MODEL`/`FORGE_LLM_MODEL` restano letti come fallback legacy.

Nota CORS:
- `ALLOWED_ORIGINS` deve mantenere per primo l'origin pubblico (es. `https://swimforge.it`): `server/db_club_meets.ts` usa la prima voce per i link nelle email.
- l'app Android gira con origin `https://app.swimforge.it` (WebView Capacitor, stesso sito di `swimforge.it`): va aggiunta in coda, es. `ALLOWED_ORIGINS=https://swimforge.it,https://www.swimforge.it,https://app.swimforge.it`. `https://localhost` e `capacitor://localhost` non servono più.
- le origini non ammesse ricevono `403 {"error":"origin_not_allowed"}` (warn `security:origin_not_allowed` nei log, nessuno stack); le richieste senza header `Origin` passano.
- le risposte usano `Cross-Origin-Resource-Policy: same-site`, così l'app può caricare immagini e file statici da `https://swimforge.it`.

Push FCM (app Android):
- in Firebase Console (progetto `swimforge-oppidum`) → Impostazioni progetto → Account di servizio → "Genera nuova chiave privata" (oppure un service account dedicato con ruolo "Firebase Cloud Messaging API Admin").
- codifica il JSON su una riga e mettilo in `.env.oracle`, poi elimina il file locale:
  ```bash
  echo "FIREBASE_SERVICE_ACCOUNT_JSON=$(base64 -w0 service-account.json)" >> .env.oracle
  shred -u service-account.json
  ```
- serve la migrazione `0034_add_device_tokens` (tabella `device_tokens`); all'avvio il log mostra `push:enabled` oppure `push:disabled`/`push:invalid_config`.
- i token restituiti da FCM come non registrati o non validi vengono cancellati automaticamente.

TLS DB raccomandato:
- target finale: `DB_SSL_REJECT_UNAUTHORIZED=true` con `DB_SSL_CA_CERT_BASE64` valorizzato
- transitorio anti-downtime: `DB_SSL_ALLOW_INSECURE_FALLBACK=true` (fallback automatico solo su errori certificato)

Note Garmin service:
- in Oracle compose il container `garmin` non pubblica porte host (solo `expose: 8000` su rete Docker interna).
- mantenere `GARMIN_CORS_ALLOW_ORIGINS` vuoto se il microservizio non viene chiamato dal browser.

Policy Redis (produzione):
- `REDIS_REQUIRED_FOR_READY=true`: se Redis è configurato ma down, `/ready` ritorna `503`.
- `REDIS_RATE_LIMIT_MODE=memory`: fallback in-memory per rate limiting (fail-open distribuito, consigliato per continuità).
- alternativa hardening: `REDIS_RATE_LIMIT_MODE=block` (fail-closed, blocca traffico quando Redis non è disponibile).

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

Nota observability:
- lo script valorizza automaticamente `APP_RELEASE` (git SHA corto) per arricchire i payload Rollbar.

## 7) Esecuzione manuale (fallback operativo)
```bash
bash /home/ubuntu/projects/swimforge-oppidum/deploy/swimforge-deploy.sh
```

## 8) Migrazioni DB
L'immagine runtime contiene solo `node_modules`, `dist` e `package.json` (niente `drizzle/` né `drizzle.config.ts`), quindi `pnpm db:migrate` non può essere eseguito dentro il container `app`.
Il workflow di deploy (e `deploy/swimforge-deploy.sh`) non applica mai migrazioni: vanno applicate a mano prima del deploy che le richiede (incluso il primo avvio produzione).

Migrazioni recenti da applicare allo stesso modo di `0033` (obiettivi utente): `0034_add_device_tokens` (tabella `device_tokens`, necessaria alle push dell'app Android). Il deploy non migra mai: applicarla prima del merge/deploy che la richiede.

Procedura standard, da un checkout fidato del repository allo stesso commit che verrà deployato:
```bash
pnpm install --frozen-lockfile
DATABASE_URL='<url Supabase diretto o session pooler>' pnpm db:migrate
```
Usare la connessione diretta o il session pooler, non il transaction pooler.

Singola migrazione (alternativa manuale):
1. eseguire il contenuto di `drizzle/<NNNN>_<nome>.sql` sul database;
2. registrare la migrazione nella tabella di tracking di Drizzle:
```sql
INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
VALUES ('<sha256 del contenuto del file>', <valore "when" della voce in drizzle/meta/_journal.json>);
```
L'hash è `sha256sum drizzle/<NNNN>_<nome>.sql` (contenuto del file così com'è); `created_at` è il campo `when` della voce corrispondente nel journal.

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
30 2 * * * curl -fsS -X POST "https://<your-domain>/api/cron/cleanup-social-retention" -H "Authorization: Bearer <CRON_SECRET>" > /dev/null
*/15 6-8 * * 1,3,5 curl -fsS -X POST "https://<your-domain>/api/cron/club-ai/tick" -H "Authorization: Bearer <CRON_SECRET>" > /dev/null
```

Note `club-ai/tick`:
- richiede `CLUB_AI_AUTOMATION_ENABLED=true`
- ritorna `503` se automazione disabilitata o se non ci sono configurazioni club abilitate (per evitare falsi OK operativi)

## 12) Checklist rilascio fase 1 (app Android)
Ordine da rispettare; il merge su `main` fa partire il deploy automatico.
1. Prima del merge, su `.env.oracle` della VM: aggiornare `ALLOWED_ORIGINS` (vedi sopra, origin pubblico per primo, `https://app.swimforge.it` incluso) e aggiungere `FIREBASE_SERVICE_ACCOUNT_JSON` (base64). L'immagine usa Node 22.
2. Prima del merge: applicare la migrazione `0034_add_device_tokens` (sezione 8).
3. Supabase Dashboard: `swimforge://auth/callback` tra gli "Additional Redirect URLs" (vedi `docs/ANDROID_APP.md`).
4. Merge su `main` e attesa del deploy GitHub Actions.
5. Controllare i log (`docker compose --env-file .env.oracle -f docker-compose.oracle.yml logs app`): deve comparire `push:enabled` e non devono comparire `security:origin_not_allowed` per l'origin dell'app.
6. Smoke test dall'APK: login (email e Google), feed, immagini caricate, invio di un DM da un altro account con app chiusa (push ricevuta), logout.

## Troubleshooting
- Certificati TLS non emessi:
  - verifica DNS `A` record
  - verifica aperture `80/443` su Oracle networking
- `503` su `/ready`:
  - verifica `DATABASE_URL`
  - se `REDIS_URL` è configurata e `REDIS_REQUIRED_FOR_READY=true`, verifica raggiungibilità Redis
- `503` su `/health/deep` ma `/ready` è `200`:
  - impatto non bloccante sulla disponibilità core
  - verificare integrazioni `GARMIN_SERVICE_URL` e/o storage Supabase
- Redis degradato:
  - controlla eventi log: `redis:policy`, `redis:degraded_mode`, `rate-limit:fail_open_memory_fallback`, `rate-limit:fail_closed_block`
- Garmin disconnesso dopo restart:
  - verifica volume `garmin_tokens`
- deploy fallisce su lock:
  - attendi rilascio lock `/tmp/swimforge-deploy.lock` o verifica processi deploy concorrenti
