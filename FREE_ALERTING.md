# Free Alerting Strategy - SwimForge

## 📋 Overview

Soluzioni **completamente gratuite** per alerting e monitoraggio.

---

## 🚀 Opzione 1: Render Built-in Alerts (GRATUITO)

### Configurazione

1. Vai a Render Dashboard
2. Seleziona servizio
3. Settings > Notifications
4. Abilita:
   - [ ] Deploy started
   - [ ] Deploy succeeded
   - [ ] Deploy failed
   - [ ] Service unhealthy
   - [ ] Service recovered

### Email Notifications

- ✅ Gratuito
- ✅ Illimitato
- ✅ Automatico

---

## 🚀 Opzione 2: Discord Webhooks (GRATUITO)

### Setup Discord Webhook

1. Crea server Discord (gratuito)
2. Crea canale #alerts
3. Settings > Webhooks > New Webhook
4. Copia URL

### GitHub Actions con Discord

Crea file `.github/workflows/alerts.yml`:

```yaml
name: Alerts

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Notify Discord
        uses: sarisia/actions-status-discord@v1
        if: always()
        with:
          webhook_url: ${{ secrets.DISCORD_WEBHOOK }}
          status: ${{ job.status }}
          title: "Build Status"
          description: "Commit: ${{ github.sha }}"
```

### Render Webhook

1. Vai a Render Dashboard
2. Settings > Webhooks
3. Aggiungi Discord webhook URL
4. Seleziona eventi

---

## 🚀 Opzione 3: Slack Webhooks (GRATUITO)

### Setup Slack Webhook

1. Crea workspace Slack (gratuito)
2. Vai a api.slack.com
3. Create New App > From scratch
4. Incoming Webhooks > Add New Webhook to Workspace
5. Copia URL

### GitHub Actions con Slack

```yaml
- name: Notify Slack
  uses: slackapi/slack-github-action@v1
  with:
    webhook-url: ${{ secrets.SLACK_WEBHOOK }}
    payload: |
      {
        "text": "🚀 Deploy completato!",
        "blocks": [
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": "*Deployment Status*\nCommit: ${{ github.sha }}\nBranch: ${{ github.ref }}"
            }
          }
        ]
      }
```

---

## 🚀 Opzione 4: Telegram Alerts (GRATUITO)

### Setup Telegram Bot

1. Apri Telegram
2. Cerca @BotFather
3. Crea nuovo bot: `/newbot`
4. Copia token

### GitHub Actions con Telegram

```yaml
- name: Notify Telegram
  uses: appleboy/telegram-action@master
  with:
    to: ${{ secrets.TELEGRAM_CHAT_ID }}
    token: ${{ secrets.TELEGRAM_TOKEN }}
    message: |
      🚀 Deploy Notification
      Status: ${{ job.status }}
      Commit: ${{ github.sha }}
```

---

## 🚀 Opzione 5: Email Alerts (GRATUITO)

### GitHub Actions con Email

```yaml
- name: Send Email Alert
  uses: dawidd6/action-send-mail@v3
  with:
    server_address: smtp.gmail.com
    server_port: 465
    username: ${{ secrets.EMAIL_USERNAME }}
    password: ${{ secrets.EMAIL_PASSWORD }}
    subject: "SwimForge Deploy Alert"
    to: team@swimforge.com
    from: alerts@swimforge.com
    body: |
      Deploy Status: ${{ job.status }}
      Commit: ${{ github.sha }}
      Branch: ${{ github.ref }}
```

---

## 🚀 Opzione 6: Uptime Monitoring (GRATUITO)

### UptimeRobot (Gratuito)

1. Vai a https://uptimerobot.com/
2. Registrati (gratuito)
3. Crea monitor:
   - URL: https://swimforge-frontend.onrender.com/health
   - Interval: 5 minuti
   - Alert: Email

### Configurazione Health Check

```typescript
// server/_core/index.ts
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: "connected",
  });
});
```

---

## 🚀 Opzione 7: Error Tracking Gratuito

### Rollbar Free Tier

- ✅ 50,000 errori/mese gratis
- ✅ Dashboard professionale
- ✅ Integrazione GitHub

### Setup

```bash
pnpm add rollbar

# server/middleware/rollbar.ts
import Rollbar from "rollbar";

export const rollbar = new Rollbar({
  accessToken: process.env.ROLLBAR_ACCESS_TOKEN,
  environment: process.env.NODE_ENV,
  enabled: !!process.env.ROLLBAR_ACCESS_TOKEN,
});
```

---

## 📊 Confronto Opzioni

| Opzione | Costo | Canali | Setup | Affidabilità |
|---------|-------|--------|-------|--------------|
| Render Built-in | Gratis | Email | 5 min | ⭐⭐⭐⭐ |
| Discord | Gratis | Discord | 10 min | ⭐⭐⭐⭐ |
| Slack | Gratis | Slack | 10 min | ⭐⭐⭐⭐⭐ |
| Telegram | Gratis | Telegram | 10 min | ⭐⭐⭐⭐ |
| Email | Gratis | Email | 15 min | ⭐⭐⭐ |
| UptimeRobot | Gratis | Email | 5 min | ⭐⭐⭐⭐ |
| Rollbar | Gratis (50k) | Web | 15 min | ⭐⭐⭐⭐⭐ |

---

## 🎯 Strategia Consigliata per SwimForge

### Tier 1: Minimo (Gratuito)

```
Render Built-in Alerts
+
UptimeRobot
↓
Email notifications
↓
Uptime monitoring
```

### Tier 2: Recommended (Gratuito)

```
Render Built-in Alerts
+
Discord Webhooks
+
UptimeRobot
+
Rollbar (50k errors/mese)
↓
Email + Discord
↓
Uptime monitoring
↓
Error tracking
```

### Tier 3: Complete (Gratuito)

```
Render Built-in Alerts
+
Discord Webhooks
+
Slack Webhooks
+
Telegram Alerts
+
UptimeRobot
+
Rollbar
+
OpenTelemetry + Jaeger
↓
Multi-channel notifications
↓
Uptime monitoring
↓
Error tracking
↓
Performance monitoring
```

---

## 🚀 Setup Rapido (15 minuti)

### Step 1: Render Alerts

1. Vai a Render Dashboard
2. Settings > Notifications
3. Aggiungi email
4. Abilita Deploy alerts

### Step 2: Discord Webhook

1. Crea server Discord
2. Crea webhook
3. Aggiungi a GitHub Secrets: `DISCORD_WEBHOOK`
4. Copia workflow `.github/workflows/alerts.yml`

### Step 3: UptimeRobot

1. Vai a https://uptimerobot.com/
2. Registrati
3. Crea monitor per `/health` endpoint
4. Imposta alert email

### Step 4: Test

1. Fai un push su main
2. Verifica Discord notification
3. Verifica Render email
4. Verifica UptimeRobot

---

## 📋 Alert Types

### Deploy Alerts

```
✅ Deploy started
✅ Deploy succeeded
❌ Deploy failed → CRITICO
```

### Health Alerts

```
✅ Service healthy
❌ Service unhealthy → CRITICO
✅ Service recovered
```

### Performance Alerts

```
⚠️ High CPU (> 80%)
⚠️ High Memory (> 85%)
❌ High Error Rate (> 5%) → CRITICO
❌ High Latency (> 5s) → CRITICO
```

### Uptime Alerts

```
✅ Service up
❌ Service down → CRITICO
✅ Service recovered
```

---

## 🔧 Configurazione Avanzata

### Alert Routing

```yaml
# .github/workflows/alerts.yml
jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Notify on Failure
        if: failure()
        uses: sarisia/actions-status-discord@v1
        with:
          webhook_url: ${{ secrets.DISCORD_WEBHOOK }}
          status: failure
          
      - name: Notify on Success
        if: success()
        uses: sarisia/actions-status-discord@v1
        with:
          webhook_url: ${{ secrets.DISCORD_WEBHOOK }}
          status: success
```

### Escalation Policy

```
Livello 1 (Info):
- Deploy started
- Deploy succeeded
- Service recovered
→ Discord

Livello 2 (Warning):
- High CPU
- High Memory
→ Discord + Email

Livello 3 (Critical):
- Deploy failed
- Service unhealthy
- High error rate
→ Discord + Email + Slack + Telegram
```

---

## ✅ Checklist Alerting Gratuito

- [ ] Render alerts configurati
- [ ] Discord webhook creato
- [ ] GitHub Actions workflow aggiunto
- [ ] UptimeRobot monitor creato
- [ ] Health check endpoint testato
- [ ] Primo alert ricevuto
- [ ] Escalation policy documentata
- [ ] Team notificato

---

## 📊 Monitoraggio

### Dashboard Alerts

- **Render:** Settings > Notifications
- **Discord:** Server #alerts
- **Slack:** Channel #alerts
- **UptimeRobot:** Dashboard
- **Rollbar:** Dashboard

---

## 💰 Costi Totali

| Componente | Costo |
|-----------|-------|
| Render Built-in | Gratis |
| Discord | Gratis |
| Slack | Gratis |
| Telegram | Gratis |
| UptimeRobot | Gratis |
| Rollbar (50k) | Gratis |
| **Totale** | **Gratis** |

---

## 📚 Risorse

- [Render Notifications](https://render.com/docs/notifications)
- [Discord Webhooks](https://discord.com/developers/docs/resources/webhook)
- [Slack API](https://api.slack.com/)
- [UptimeRobot](https://uptimerobot.com/)
- [Rollbar](https://rollbar.com/)

---

**Ultimo aggiornamento:** 2026-01-27
**Costo:** Completamente Gratuito
**Raccomandazione:** Tier 2 (Render + Discord + UptimeRobot + Rollbar)
