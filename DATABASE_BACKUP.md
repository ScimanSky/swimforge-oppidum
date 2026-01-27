# Database Backup Strategy - SwimForge

## 📋 Overview

Questo documento descrive come configurare backup automatici per il database Supabase di SwimForge.

## 🚀 Setup Rapido (10 minuti)

### Step 1: Accedi a Supabase Dashboard

1. Vai a https://app.supabase.com/
2. Seleziona il progetto "swimforge"

### Step 2: Abilita Backups Automatici

1. Vai a **Settings > Backups**
2. Verifica che "Automated backups" sia **ON**
3. Seleziona la frequenza:
   - **Daily** (consigliato per produzione)
   - **Weekly**
   - **Monthly**

### Step 3: Configura Backup Retention

1. Imposta "Backup retention" a **30 giorni** (minimo)
2. Questo mantiene gli ultimi 30 giorni di backup

### Step 4: Abilita Point-in-Time Recovery (PITR)

1. Vai a **Settings > Backups**
2. Abilita "Point-in-Time Recovery"
3. Seleziona il periodo: **7 giorni** (consigliato)

---

## 📊 Backup Strategy

### Backup Automatici

| Tipo | Frequenza | Retention | Scopo |
|------|-----------|-----------|-------|
| Daily | Ogni giorno | 30 giorni | Recovery da errori |
| Weekly | Ogni settimana | 12 settimane | Recovery da problemi prolungati |
| Monthly | Manuale | 1 anno | Compliance e archivio |

### Point-in-Time Recovery (PITR)

**Cos'è?** Recupera il database a qualsiasi momento negli ultimi 7 giorni.

**Quando usarlo?**
- Eliminazione accidentale di dati
- Corruzione database
- Rollback di migrazioni fallite

**Come usarlo:**
1. Vai a **Settings > Backups > Point-in-Time Recovery**
2. Seleziona la data/ora desiderata
3. Clicca "Recover"

---

## 🔄 Backup Manuali

### Esportare il Database

```bash
# Scarica il backup in formato SQL
pg_dump -h db.supabase.co \
  -U postgres \
  -d postgres \
  -F c > swimforge_backup_$(date +%Y%m%d).dump
```

### Importare il Database

```bash
# Ripristina da un backup
pg_restore -h db.supabase.co \
  -U postgres \
  -d postgres \
  -v swimforge_backup_20260127.dump
```

---

## 🔐 Backup Offsite

### Opzione 1: AWS S3

```bash
# Scarica backup e carica su S3
aws s3 cp swimforge_backup.dump s3://swimforge-backups/
```

### Opzione 2: Google Cloud Storage

```bash
# Scarica backup e carica su GCS
gsutil cp swimforge_backup.dump gs://swimforge-backups/
```

### Opzione 3: Azure Blob Storage

```bash
# Scarica backup e carica su Azure
az storage blob upload \
  --account-name swimforgebackups \
  --container-name backups \
  --name swimforge_backup.dump \
  --file swimforge_backup.dump
```

---

## 📋 Checklist Backup

### Settimanale

- [ ] Verifica che i backup automatici siano completati
- [ ] Controlla il Supabase dashboard
- [ ] Verifica retention policy

### Mensile

- [ ] Esporta un backup manuale
- [ ] Carica su offsite storage
- [ ] Testa il restore su un database di staging

### Annuale

- [ ] Audit della backup strategy
- [ ] Aggiorna la documentazione
- [ ] Testa il disaster recovery

---

## 🚨 Disaster Recovery

### Scenario 1: Perdita di Dati Accidentale

**Tempo di Recovery:** < 1 ora

1. Vai a **Settings > Backups > Point-in-Time Recovery**
2. Seleziona l'ora prima della perdita
3. Clicca "Recover"
4. Verifica i dati

### Scenario 2: Database Corrotto

**Tempo di Recovery:** 1-2 ore

1. Vai a **Settings > Backups**
2. Seleziona il backup più recente prima della corruzione
3. Clicca "Restore"
4. Verifica l'integrità dei dati

### Scenario 3: Attacco Ransomware

**Tempo di Recovery:** 2-4 ore

1. Isola il database (disconnetti le applicazioni)
2. Vai a **Settings > Backups**
3. Ripristina da un backup pulito (> 7 giorni fa)
4. Verifica che non ci siano dati compromessi

---

## 📊 Monitoraggio

### Verificare lo Status dei Backup

```sql
-- Connettiti a Supabase e esegui:
SELECT * FROM pg_stat_user_tables
ORDER BY last_vacuum DESC;
```

### Controllare la Dimensione del Database

```bash
# Via Supabase CLI
supabase db pull --dry-run

# Via psql
psql -h db.supabase.co -U postgres -c "SELECT pg_size_pretty(pg_database_size('postgres'));"
```

---

## 🔐 Sicurezza dei Backup

### Crittografia

- ✅ Supabase cripta i backup in transit (SSL/TLS)
- ✅ Supabase cripta i backup at rest (AES-256)

### Accesso

- ✅ Solo i membri del team possono accedere ai backup
- ✅ Usa role-based access control (RBAC)

### Audit

- ✅ Tutti gli accessi ai backup sono loggati
- ✅ Monitora i backup logs per attività sospette

---

## 💰 Costi

| Piano | Backup Automatici | PITR | Costo |
|------|------------------|------|-------|
| Free | No | No | $0 |
| Pro | Sì (7 giorni) | No | $25/mese |
| Business | Sì (30 giorni) | Sì (7 giorni) | $599/mese |

**Raccomandazione per SwimForge:** Piano Business (per PITR)

---

## 📚 Risorse

- [Supabase Backups Documentation](https://supabase.com/docs/guides/database/backups)
- [Point-in-Time Recovery](https://supabase.com/docs/guides/database/backups#point-in-time-recovery)
- [Disaster Recovery Planning](https://supabase.com/docs/guides/database/backups#disaster-recovery)

---

## ✅ Checklist Configurazione

- [ ] Backup automatici abilitati
- [ ] Frequenza impostata a Daily
- [ ] Retention impostato a 30 giorni
- [ ] PITR abilitato (7 giorni)
- [ ] Backup offsite configurato
- [ ] Disaster recovery plan documentato
- [ ] Team notificato

---

**Ultimo aggiornamento:** 2026-01-27
**Versione:** 1.0.0
