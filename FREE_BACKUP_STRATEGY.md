# Free Database Backup Strategy - SwimForge

## 📋 Overview

Strategie **completamente gratuite** per backup del database Supabase.

---

## 🚀 Opzione 1: Supabase Built-in Backups (GRATUITO)

### Configurazione

1. Vai a Supabase Dashboard
2. Settings > Backups
3. Abilita "Automated backups"
4. **Piano Free:** Backup settimanali (7 giorni retention)

### Limitazioni Piano Free

- ✅ Backup settimanali automatici
- ✅ Retention 7 giorni
- ❌ Niente PITR (Point-in-Time Recovery)
- ❌ Niente backup giornalieri

### Upgrade a Pro (opzionale)

- Pro: $25/mese → Backup giornalieri + 30 giorni retention
- Business: $599/mese → PITR + 30 giorni retention

---

## 🚀 Opzione 2: pg_dump Automatico (GRATUITO)

### Setup Script

Crea file `scripts/backup-database.sh`:

```bash
#!/bin/bash

# Database credentials
DB_HOST="${DATABASE_URL#*@}" # Extract host from connection string
DB_USER="postgres"
DB_NAME="postgres"
BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/swimforge_$DATE.sql.gz"

# Create backup directory
mkdir -p $BACKUP_DIR

# Dump database
pg_dump \
  -h $DB_HOST \
  -U $DB_USER \
  -d $DB_NAME \
  | gzip > $BACKUP_FILE

# Log
echo "[$(date)] Backup created: $BACKUP_FILE" >> $BACKUP_DIR/backup.log

# Keep only last 30 backups
find $BACKUP_DIR -name "swimforge_*.sql.gz" -type f | \
  sort -r | \
  tail -n +31 | \
  xargs -r rm

echo "[$(date)] Old backups cleaned" >> $BACKUP_DIR/backup.log
```

### Cron Job (Linux)

```bash
# Backup ogni giorno alle 2 AM
0 2 * * * /home/ubuntu/swimforge-repo/scripts/backup-database.sh
```

### GitHub Actions (Gratuito)

Crea file `.github/workflows/backup.yml`:

```yaml
name: Database Backup

on:
  schedule:
    - cron: '0 2 * * *'  # Ogni giorno alle 2 AM UTC

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Backup Database
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
        run: |
          # Install PostgreSQL client
          sudo apt-get install -y postgresql-client
          
          # Create backup
          pg_dump $DATABASE_URL | gzip > backup_$(date +%Y%m%d).sql.gz
          
      - name: Upload to GitHub Releases
        uses: softprops/action-gh-release@v1
        with:
          files: backup_*.sql.gz
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## 🚀 Opzione 3: S3 Backup Gratuito (AWS Free Tier)

### AWS Free Tier

- ✅ 5 GB storage gratuito per 12 mesi
- ✅ 20,000 GET requests gratuiti
- ✅ 2,000 PUT requests gratuiti

### Setup

1. Crea account AWS
2. Vai a S3
3. Crea bucket: `swimforge-backups`
4. Configura lifecycle policy:
   - Delete after 90 days

### Script di Backup

```bash
#!/bin/bash

# Backup database
pg_dump $DATABASE_URL | gzip > backup.sql.gz

# Upload to S3
aws s3 cp backup.sql.gz s3://swimforge-backups/backup_$(date +%Y%m%d).sql.gz

# Clean local
rm backup.sql.gz
```

### GitHub Actions con S3

```yaml
- name: Upload to S3
  env:
    AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
    AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
  run: |
    aws s3 cp backup_*.sql.gz s3://swimforge-backups/
```

---

## 🚀 Opzione 4: Google Drive Backup (Gratuito)

### Setup

1. Crea Google Service Account
2. Scarica JSON key
3. Condividi Google Drive folder con account

### Script

```bash
#!/bin/bash

# Backup database
pg_dump $DATABASE_URL | gzip > backup_$(date +%Y%m%d).sql.gz

# Upload to Google Drive
gdrive upload backup_*.sql.gz --parent FOLDER_ID

# Clean
rm backup_*.sql.gz
```

---

## 🚀 Opzione 5: GitHub Releases (Gratuito)

### Vantaggi

- ✅ Gratuito
- ✅ Versionato
- ✅ Facile da scaricare
- ✅ Integrato con GitHub

### Setup

```yaml
# .github/workflows/backup.yml
- name: Create Release
  uses: softprops/action-gh-release@v1
  with:
    files: backup_*.sql.gz
    tag_name: backup-$(date +%Y%m%d)
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## 📊 Confronto Opzioni

| Opzione | Costo | Frequenza | Retention | Setup |
|---------|-------|-----------|-----------|-------|
| Supabase Free | Gratis | Settimanale | 7 giorni | 5 min |
| pg_dump | Gratis | Giornaliero | 30 giorni | 30 min |
| AWS S3 | Gratis (12 mesi) | Giornaliero | 90 giorni | 45 min |
| Google Drive | Gratis | Giornaliero | Illimitato | 45 min |
| GitHub Releases | Gratis | Giornaliero | Illimitato | 30 min |

---

## 🎯 Strategia Consigliata per SwimForge

### Tier 1: Built-in (Minimo)

```
Supabase Free Tier
↓
Backup settimanali automatici
↓
Retention 7 giorni
```

### Tier 2: Recommended (Migliore)

```
Supabase Free Tier (settimanale)
+
GitHub Actions (giornaliero)
+
GitHub Releases (storage)
↓
Backup settimanali + giornalieri
↓
Retention 30+ giorni
↓
Costo: $0
```

### Tier 3: Enterprise (Completo)

```
Supabase Free Tier (settimanale)
+
GitHub Actions (giornaliero)
+
AWS S3 (offsite)
+
Google Drive (backup)
↓
Backup settimanali + giornalieri
↓
Retention 90+ giorni
↓
Offsite redundancy
↓
Costo: $0 (AWS free tier)
```

---

## 🚀 Implementazione Rapida (10 minuti)

### Step 1: Abilita Supabase Backups

1. Vai a Supabase Dashboard
2. Settings > Backups
3. Abilita "Automated backups"

### Step 2: Crea GitHub Action

Copia il workflow `.github/workflows/backup.yml` dal file sopra

### Step 3: Configura Secrets

Aggiungi a GitHub Settings > Secrets:
- `DATABASE_URL` (da Supabase)

### Step 4: Test

1. Vai a GitHub > Actions
2. Esegui manualmente il workflow
3. Verifica che il backup sia creato

---

## 📋 Disaster Recovery

### Scenario: Database Corrotto

```bash
# 1. Scarica backup da GitHub Releases
# 2. Connettiti a Supabase
# 3. Ripristina

psql $DATABASE_URL < backup_20260127.sql
```

### Scenario: Perdita Dati

```bash
# 1. Vai a Supabase Dashboard
# 2. Settings > Backups
# 3. Ripristina da backup settimanale
```

---

## ✅ Checklist Backup Gratuito

- [ ] Supabase backups abilitati
- [ ] GitHub Actions workflow creato
- [ ] DATABASE_URL aggiunto a GitHub Secrets
- [ ] Primo backup eseguito
- [ ] Backup visibile in GitHub Releases
- [ ] Disaster recovery testato
- [ ] Team notificato

---

## 📊 Monitoraggio

### Verificare Backup

```bash
# Supabase backups
# Dashboard > Settings > Backups > View Backups

# GitHub Releases
# Repository > Releases
```

### Automatizzare Notifiche

```yaml
# Aggiungi a workflow
- name: Notify Slack
  uses: slackapi/slack-github-action@v1
  with:
    webhook-url: ${{ secrets.SLACK_WEBHOOK }}
    payload: |
      {
        "text": "Database backup completed: backup_$(date +%Y%m%d).sql.gz"
      }
```

---

## 💰 Costi Totali

| Componente | Costo |
|-----------|-------|
| Supabase Free | Gratis |
| GitHub Actions | Gratis (2000 min/mese) |
| AWS S3 (optional) | Gratis (12 mesi) |
| **Totale** | **Gratis** |

---

## 📚 Risorse

- [Supabase Backups](https://supabase.com/docs/guides/database/backups)
- [GitHub Actions](https://docs.github.com/en/actions)
- [AWS S3 Free Tier](https://aws.amazon.com/s3/pricing/)
- [PostgreSQL pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html)

---

**Ultimo aggiornamento:** 2026-01-27
**Costo:** Completamente Gratuito
**Raccomandazione:** Tier 2 (Supabase + GitHub Actions)
