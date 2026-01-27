# Rollbar Free Tier Setup - SwimForge

## 📋 Overview

**Rollbar Free Tier** - Error tracking completamente gratuito

- ✅ 50,000 errori/mese gratis
- ✅ Dashboard professionale
- ✅ Integrazione GitHub
- ✅ Zero costi
- ✅ Niente hosting da pagare

---

## 🚀 Setup Rapido (10 minuti)

### Step 1: Crea Account Rollbar

1. Vai a https://rollbar.com/
2. Clicca "Sign Up"
3. Registrati con GitHub (consigliato)
4. Crea progetto "swimforge-backend"

### Step 2: Ottieni Access Token

1. Vai a Settings > Access Tokens
2. Copia il token
3. Aggiungi a GitHub Secrets: `ROLLBAR_ACCESS_TOKEN`

### Step 3: Installa Rollbar SDK

```bash
cd /home/ubuntu/swimforge-repo
pnpm add rollbar
```

### Step 4: Integra nel Server

Crea file `server/middleware/rollbar.ts`:

```typescript
import Rollbar from "rollbar";

export const rollbar = new Rollbar({
  accessToken: process.env.ROLLBAR_ACCESS_TOKEN,
  environment: process.env.NODE_ENV || "production",
  enabled: !!process.env.ROLLBAR_ACCESS_TOKEN,
  captureUncaught: true,
  captureUnhandledRejections: true,
});

export function captureError(error: Error, context?: Record<string, any>) {
  rollbar.error(error, context);
}

export function captureMessage(message: string, level: "info" | "warning" | "error" = "info") {
  rollbar[level](message);
}
```

### Step 5: Usa nel Server

```typescript
// server/_core/index.ts
import { rollbar, captureError } from "../middleware/rollbar";

app.use((err: any, req: any, res: any, next: any) => {
  captureError(err, {
    url: req.url,
    method: req.method,
  });
  res.status(500).json({ error: "Internal Server Error" });
});
```

### Step 6: Deploy

1. Aggiungi `ROLLBAR_ACCESS_TOKEN` a Render environment variables
2. Deploy
3. Controlla Rollbar dashboard per errori

---

## 📊 Rollbar Dashboard

### Visualizzazioni

1. **Dashboard:** Overview di tutti gli errori
2. **Items:** Lista dettagliata di errori
3. **Occurrences:** Singole istanze di errori
4. **Timeline:** Cronologia degli errori

### Ricerca Errori

```
# Per tipo di errore
type:TypeError

# Per URL
path:/api/trpc/activities.create

# Per severità
level:error

# Per tempo
timestamp:[2026-01-27 TO 2026-01-28]
```

---

## 🔧 Configurazione Avanzata

### Catturare Errori Personalizzati

```typescript
try {
  // ... code
} catch (error) {
  rollbar.error(error as Error, {
    userId: user.id,
    action: "create_activity",
    activityId: activity.id,
  });
}
```

### Tracciare Messaggi

```typescript
// Info
rollbar.info("User logged in", { userId: user.id });

// Warning
rollbar.warning("High memory usage", { memory: process.memoryUsage() });

// Error
rollbar.error("Database connection failed", { error: err.message });
```

### Impostare Contesto Utente

```typescript
rollbar.setPerson({
  id: user.id,
  email: user.email,
  username: user.name,
});
```

---

## 📈 Metriche Gratuite

### Free Tier Include

- ✅ 50,000 errori/mese
- ✅ 30 giorni di retention
- ✅ Grouping automatico
- ✅ Source maps
- ✅ GitHub integration
- ✅ Email notifications
- ✅ Webhook integrations

### Free Tier Escluso

- ❌ Più di 50,000 errori/mese
- ❌ Retention > 30 giorni
- ❌ Advanced analytics
- ❌ Custom retention
- ❌ SSO

---

## 🔔 Notifiche

### Email Notifications

1. Vai a Settings > Notifications
2. Abilita "Email"
3. Configura regole:
   - Nuovo errore critico
   - Errore ricorrente
   - Errore in produzione

### Webhook Notifications

1. Vai a Settings > Webhooks
2. Aggiungi webhook Discord/Slack
3. Seleziona eventi

### GitHub Integration

1. Vai a Settings > GitHub
2. Connetti repository
3. Crea issue automaticamente per errori critici

---

## 📊 Monitoraggio

### Metriche Importanti

| Metrica | Target |
|---------|--------|
| Error Rate | < 1% |
| Unique Errors | < 50/giorno |
| Error Response Time | < 100ms |
| Unresolved Errors | < 10 |

### Dashboard Personalizzato

1. Vai a Dashboard
2. Clicca "Customize"
3. Aggiungi widget:
   - Error rate
   - Top errors
   - Error timeline
   - Deployment tracking

---

## 🚨 Gestione Errori

### Triage Errori

1. Vai a Items
2. Seleziona errore
3. Clicca "Resolve" o "Ignore"
4. Aggiungi commento

### Tracking Risoluzione

1. Crea issue GitHub
2. Rollbar traccia automaticamente
3. Quando issue è chiusa, errore è risolto

---

## 📚 Integrazione GitHub Actions

### Notificare Deploy

```yaml
# .github/workflows/deploy.yml
- name: Notify Rollbar Deploy
  uses: rollbar/github-deploy-action@2.1.1
  with:
    environment: production
    version: ${{ github.sha }}
    status: succeeded
  env:
    ROLLBAR_ACCESS_TOKEN: ${{ secrets.ROLLBAR_ACCESS_TOKEN }}
```

### Tracciare Build Errors

```yaml
- name: Capture Build Error
  if: failure()
  run: |
    curl https://api.rollbar.com/api/1/item \
      -X POST \
      -H "Content-Type: application/json" \
      -d '{
        "access_token": "${{ secrets.ROLLBAR_ACCESS_TOKEN }}",
        "data": {
          "environment": "ci",
          "level": "error",
          "body": {
            "message": {
              "body": "Build failed"
            }
          }
        }
      }'
```

---

## 🔐 Sicurezza

### Dati Sensibili

Rollbar NON cattura automaticamente:
- Password
- Token di autenticazione
- Dati di carte di credito

### Configurare Scrubbing

```typescript
const rollbar = new Rollbar({
  scrubFields: ["password", "token", "creditCard"],
  scrubPaths: ["request.headers.Authorization"],
});
```

---

## 📋 Checklist Setup

- [ ] Account Rollbar creato
- [ ] Progetto creato
- [ ] Access token copiato
- [ ] SDK installato
- [ ] Middleware creato
- [ ] Server integrato
- [ ] ROLLBAR_ACCESS_TOKEN aggiunto a Render
- [ ] Deploy completato
- [ ] Errore di test catturato
- [ ] Notifiche configurate

---

## 🚀 Prossimi Step

1. **Implementare Rollbar** (10 minuti)
2. **Testare error tracking** (5 minuti)
3. **Configurare notifiche** (5 minuti)
4. **Integrare GitHub** (5 minuti)

**Totale:** ~25 minuti

---

## 📚 Risorse

- [Rollbar Documentation](https://docs.rollbar.com/)
- [Node.js SDK](https://docs.rollbar.com/docs/nodejs)
- [GitHub Integration](https://docs.rollbar.com/docs/github)
- [Pricing](https://rollbar.com/pricing/)

---

## 💰 Costi

| Piano | Errori/mese | Costo |
|-------|------------|-------|
| Free | 50,000 | $0 |
| Pro | 500,000 | $49/mese |
| Business | Illimitato | Custom |

**Per SwimForge:** Free tier è sufficiente

---

**Ultimo aggiornamento:** 2026-01-27
**Costo:** Completamente Gratuito
**Errori/mese:** 50,000 (gratis)
