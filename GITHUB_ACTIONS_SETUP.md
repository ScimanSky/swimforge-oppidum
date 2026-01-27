# GitHub Actions Setup - Backup & Monitoring

## 📋 Overview

Questo documento spiega come configurare i workflow GitHub Actions per:
- ✅ Backup automatico del database (giornaliero)
- ✅ Monitoraggio uptime (ogni 30 minuti)

**Costo: $0** (incluso nel piano free di GitHub)

---

## 🔧 Setup Richiesto

### Step 1: Aggiungi DATABASE_URL a GitHub Secrets

1. Vai a: https://github.com/ScimanSky/swimforge-oppidum/settings/secrets/actions
2. Clicca **"New repository secret"**
3. Aggiungi:
   - **Name:** `DATABASE_URL`
   - **Value:** (copia da Supabase)
4. Clicca **"Add secret"**

### Come Trovare DATABASE_URL

1. Vai a Supabase Dashboard
2. Seleziona il tuo progetto
3. Vai a **Settings > Database > Connection String**
4. Copia la stringa (assomiglia a: `postgresql://user:password@host:5432/postgres`)
5. Incolla in GitHub Secrets

---

## 📦 Workflow 1: Database Backup

**File:** `.github/workflows/database-backup.yml`

### Cosa Fa

- ✅ Backup giornaliero del database (2 AM UTC)
- ✅ Compressione automatica (gzip)
- ✅ Upload su GitHub Releases
- ✅ Retention 30 giorni
- ✅ Notifiche di errore

### Schedule

```
Ogni giorno alle 2:00 AM UTC
```

### Trigger Manuale

Per fare un backup manuale:
1. Vai a: https://github.com/ScimanSky/swimforge-oppidum/actions
2. Seleziona **"Database Backup"**
3. Clicca **"Run workflow"**

### Ripristino da Backup

```bash
# 1. Scarica il backup da GitHub Releases
# 2. Decomprimi
gunzip swimforge-backup-*.sql.gz

# 3. Ripristina nel database
psql $DATABASE_URL < swimforge-backup-*.sql
```

### Monitoraggio

Controlla i backup su GitHub:
- https://github.com/ScimanSky/swimforge-oppidum/releases

---

## 📊 Workflow 2: Uptime Check

**File:** `.github/workflows/uptime-check.yml`

### Cosa Fa

- ✅ Controlla se l'app è online (ogni 30 minuti)
- ✅ Verifica endpoint `/api/trpc/auth.me`
- ✅ Crea issue su GitHub se down
- ✅ Log dello status

### Schedule

```
Ogni 30 minuti
```

### Trigger Manuale

Per fare un check manuale:
1. Vai a: https://github.com/ScimanSky/swimforge-oppidum/actions
2. Seleziona **"Uptime Check"**
3. Clicca **"Run workflow"**

### Notifiche

Quando l'app è down:
- ✅ Crea issue su GitHub
- ✅ Include link a Render Dashboard
- ✅ Include link a Rollbar Dashboard

---

## 🔍 Monitoraggio

### Backup Status

Controlla i backup:
1. Vai a: https://github.com/ScimanSky/swimforge-oppidum/releases
2. Vedi i backup giornalieri con timestamp
3. Scarica se necessario

### Uptime Status

Controlla i risultati:
1. Vai a: https://github.com/ScimanSky/swimforge-oppidum/actions
2. Seleziona **"Uptime Check"**
3. Vedi i risultati di ogni check

### Errori

Se un workflow fallisce:
1. Vai a: https://github.com/ScimanSky/swimforge-oppidum/actions
2. Clicca sul workflow fallito
3. Vedi i log di errore

---

## 📋 Checklist Setup

- [ ] DATABASE_URL aggiunto a GitHub Secrets
- [ ] Workflow database-backup.yml creato
- [ ] Workflow uptime-check.yml creato
- [ ] Primo backup eseguito manualmente
- [ ] Backup visibile su GitHub Releases
- [ ] Uptime check eseguito manualmente
- [ ] Nessun errore nei log

---

## 🆘 Troubleshooting

### Backup non funziona

**Errore:** `Connection refused`

**Soluzione:**
1. Verifica DATABASE_URL in GitHub Secrets
2. Verifica che il database è online su Supabase
3. Verifica che la stringa di connessione è corretta

### Uptime check non funziona

**Errore:** `HTTP 503`

**Soluzione:**
1. Verifica che l'app è online su Render
2. Controlla i log di Render
3. Verifica che l'endpoint `/api/trpc/auth.me` è raggiungibile

---

## 💰 Costi

| Componente | Costo |
|-----------|-------|
| GitHub Actions | $0 (free tier) |
| GitHub Releases | $0 (illimitato) |
| Backup Storage | $0 (incluso in GitHub) |
| **Totale** | **$0** |

---

## 📚 Risorse

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [GitHub Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [PostgreSQL Backup](https://www.postgresql.org/docs/current/backup.html)
- [Supabase Connection String](https://supabase.com/docs/guides/database/connecting-to-postgres)

---

**Ultimo aggiornamento:** 2026-01-27
**Costo:** Completamente Gratuito
**Backup Frequency:** Giornaliero
**Uptime Check Frequency:** Ogni 30 minuti
