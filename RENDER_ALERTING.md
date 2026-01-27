# Render Alerting Setup - SwimForge

## 📋 Overview

Questo documento descrive come configurare alerting su Render per monitorare lo stato dell'applicazione SwimForge.

## 🚀 Setup Rapido (5 minuti)

### Step 1: Accedi a Render Dashboard

1. Vai a https://dashboard.render.com/
2. Seleziona il servizio "swimforge-frontend"

### Step 2: Configura Notifiche Email

1. Vai a **Settings > Notifications**
2. Aggiungi email per le notifiche:
   - Email personale
   - Email team
   - Email alerts@swimforge.com

### Step 3: Abilita Notifiche di Deploy

1. Vai a **Settings > Notifications > Deploy Events**
2. Abilita:
   - [ ] Deploy started
   - [ ] Deploy succeeded
   - [ ] Deploy failed

### Step 4: Abilita Notifiche di Health

1. Vai a **Settings > Notifications > Health Events**
2. Abilita:
   - [ ] Service unhealthy
   - [ ] Service recovered

---

## 📊 Tipi di Alerts

### Deploy Alerts

| Evento | Descrizione | Azione |
|--------|-------------|--------|
| Deploy Started | Deploy iniziato | Informativo |
| Deploy Succeeded | Deploy completato | Informativo |
| Deploy Failed | Deploy fallito | **CRITICO** - Controlla i log |

### Health Alerts

| Evento | Descrizione | Azione |
|--------|-------------|--------|
| Service Unhealthy | Servizio non risponde | **CRITICO** - Riavvia il servizio |
| Service Recovered | Servizio ripristinato | Informativo |

### Performance Alerts

| Metrica | Soglia | Azione |
|---------|--------|--------|
| CPU Usage | > 80% | Scala l'istanza |
| Memory Usage | > 85% | Scala l'istanza |
| Response Time | > 5s | Ottimizza il codice |
| Error Rate | > 5% | Controlla i log di Sentry |

---

## 🔧 Configurazione Avanzata

### Health Check Personalizzato

Render esegue health check su `GET /health`:

```typescript
// server/_core/index.ts
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});
```

### Metriche Personalizzate

Esponi metriche Prometheus:

```typescript
app.get("/metrics", (req, res) => {
  res.set("Content-Type", "text/plain");
  res.send(`
# HELP swimforge_requests_total Total requests
# TYPE swimforge_requests_total counter
swimforge_requests_total 1000

# HELP swimforge_errors_total Total errors
# TYPE swimforge_errors_total counter
swimforge_errors_total 5

# HELP swimforge_response_time_ms Response time in ms
# TYPE swimforge_response_time_ms histogram
swimforge_response_time_ms_bucket{le="100"} 800
swimforge_response_time_ms_bucket{le="500"} 950
swimforge_response_time_ms_bucket{le="+Inf"} 1000
  `);
});
```

---

## 📧 Notifiche Email

### Configurare Indirizzi Email

1. Vai a **Settings > Notifications > Email**
2. Aggiungi indirizzi:
   ```
   team@swimforge.com
   ops@swimforge.com
   alerts@swimforge.com
   ```

### Filtrare Notifiche

1. Vai a **Settings > Notifications > Filters**
2. Configura:
   - Ricevi solo errori critici
   - Ricevi solo deploy failed
   - Escludi notifiche di deploy succeeded

---

## 🔔 Webhook Alerts

### Configurare Webhook Discord

1. Crea un webhook Discord nel tuo server
2. Vai a **Settings > Notifications > Webhooks**
3. Aggiungi il webhook Discord:
   ```
   https://discordapp.com/api/webhooks/xxx/yyy
   ```

### Configurare Webhook Slack

1. Crea un webhook Slack nel tuo workspace
2. Vai a **Settings > Notifications > Webhooks**
3. Aggiungi il webhook Slack:
   ```
   https://hooks.slack.com/services/xxx/yyy/zzz
   ```

### Payload Webhook

```json
{
  "service": "swimforge-frontend",
  "event": "deploy_failed",
  "timestamp": "2026-01-27T10:00:00Z",
  "message": "Deploy failed: Build error",
  "details": {
    "commit": "abc123",
    "branch": "main",
    "error": "Build failed"
  }
}
```

---

## 📊 Monitoring Dashboard

### Metriche Render

Monitora in tempo reale:

1. **CPU Usage**: Percentuale di CPU utilizzata
2. **Memory Usage**: Percentuale di memoria utilizzata
3. **Network In/Out**: Traffico di rete
4. **Requests/sec**: Richieste al secondo
5. **Response Time**: Tempo medio di risposta

### Impostare Soglie di Alert

| Metrica | Soglia | Frequenza |
|---------|--------|-----------|
| CPU | > 80% | Ogni 5 minuti |
| Memory | > 85% | Ogni 5 minuti |
| Error Rate | > 5% | Ogni 10 minuti |
| Response Time | > 5s | Ogni 10 minuti |

---

## 🚨 Escalation Policy

### Livello 1: Informativo

- Deploy started
- Deploy succeeded
- Service recovered

**Azione:** Nessuna

### Livello 2: Warning

- CPU > 70%
- Memory > 75%
- Error Rate > 2%

**Azione:** Monitora

### Livello 3: Critico

- Deploy failed
- Service unhealthy
- CPU > 90%
- Memory > 90%
- Error Rate > 10%

**Azione:** Intervento immediato

---

## 📋 Checklist Alerting

### Setup Iniziale

- [ ] Email notifiche configurate
- [ ] Deploy alerts abilitati
- [ ] Health alerts abilitati
- [ ] Webhook Discord configurato
- [ ] Webhook Slack configurato

### Monitoraggio

- [ ] Dashboard Render controllato giornalmente
- [ ] Sentry errors controllati giornalmente
- [ ] Performance metrics monitorate
- [ ] Escalation policy documentata

### Maintenance

- [ ] Indirizzi email aggiornati mensilmente
- [ ] Webhook testati mensilmente
- [ ] Soglie di alert riviste trimestralmente

---

## 🔐 Best Practices

### Notifiche Efficaci

1. **Specifiche**: Includi dettagli del problema
2. **Actionable**: Fornisci passi per risolvere
3. **Tempestive**: Invia immediatamente
4. **Accurate**: Evita falsi positivi

### Evitare Alert Fatigue

1. Imposta soglie realistiche
2. Raggruppa notifiche simili
3. Usa digest per notifiche non critiche
4. Rivedi regolarmente le soglie

---

## 📚 Risorse

- [Render Notifications](https://render.com/docs/notifications)
- [Health Checks](https://render.com/docs/health-checks)
- [Monitoring](https://render.com/docs/monitoring)
- [Webhooks](https://render.com/docs/webhooks)

---

## ✅ Checklist Configurazione

- [ ] Render dashboard accesso confermato
- [ ] Email notifiche configurate
- [ ] Deploy alerts abilitati
- [ ] Health alerts abilitati
- [ ] Webhook Discord configurato
- [ ] Webhook Slack configurato
- [ ] Health check endpoint testato
- [ ] Team notificato

---

**Ultimo aggiornamento:** 2026-01-27
**Versione:** 1.0.0
