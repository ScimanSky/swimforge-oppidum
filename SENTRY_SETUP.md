# Sentry Setup Guide - SwimForge Error Tracking

## 📋 Overview

Sentry è un servizio di error tracking che monitora tutti gli errori in produzione. Questo documento descrive come configurare Sentry per SwimForge.

## 🚀 Setup Rapido (5 minuti)

### Step 1: Crea un Account Sentry

1. Vai a https://sentry.io/
2. Registrati con GitHub (consigliato)
3. Crea una nuova organizzazione (es: "SwimForge")

### Step 2: Crea un Progetto

1. Seleziona "Create Project"
2. Scegli "Node.js" come piattaforma
3. Scegli "Express" come framework
4. Nome progetto: "swimforge-backend"
5. Clicca "Create Project"

### Step 3: Ottieni il DSN

1. Vai a Project Settings > Client Keys (DSN)
2. Copia il DSN (assomiglia a: `https://xxx@xxx.ingest.sentry.io/xxx`)

### Step 4: Configura le Variabili d'Ambiente

Aggiungi a Render Dashboard:

```
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
```

### Step 5: Deploy

1. Fai un nuovo deploy su Render
2. Gli errori inizieranno ad apparire automaticamente in Sentry

---

## 🔧 Configurazione Avanzata

### Environment Variables

```bash
# Required
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx

# Optional
SENTRY_ENVIRONMENT=production  # Default: NODE_ENV
SENTRY_RELEASE=1.0.0           # Default: unknown
SENTRY_TRACES_SAMPLE_RATE=0.1  # Default: 0.1 in production
SENTRY_PROFILES_SAMPLE_RATE=0.1 # Default: 0.1 in production
```

### Integrations

Sentry è configurato con le seguenti integrazioni:

- **Http Integration**: Traccia richieste HTTP
- **Uncaught Exception**: Cattura eccezioni non gestite
- **Unhandled Rejection**: Cattura promise rejections
- **Profiling**: Monitora performance

### Ignored Errors

I seguenti errori sono ignorati (non inviati a Sentry):

- Errori 404
- Errori CORS
- Errori da browser extensions
- Network errors non critici

---

## 📊 Monitoraggio

### Dashboard Sentry

1. Vai a https://sentry.io/organizations/swimforge/
2. Seleziona il progetto "swimforge-backend"
3. Visualizza:
   - **Issues**: Errori raggruppati
   - **Performance**: Transazioni lente
   - **Releases**: Errori per versione
   - **Alerts**: Notifiche configurate

### Impostare Alerts

1. Vai a Alerts > Create Alert Rule
2. Configura:
   - **Condition**: "An issue is seen X times in Y minutes"
   - **Action**: "Send a notification to [email]"
3. Salva

---

## 🔍 Utilizzo nel Codice

### Catturare Messaggi

```typescript
import { captureMessage } from "@/server/middleware/sentry-config";

captureMessage("User registration completed", "info", {
  userId: user.id,
  email: user.email,
});
```

### Catturare Eccezioni

```typescript
import { captureException } from "@/server/middleware/sentry-config";

try {
  // ... code
} catch (error) {
  captureException(error as Error, {
    userId: user.id,
    action: "create_activity",
  });
}
```

### Impostare Contesto Utente

```typescript
import { setUserContext, clearUserContext } from "@/server/middleware/sentry-config";

// Login
setUserContext(user.id, user.email, user.name);

// Logout
clearUserContext();
```

### Performance Monitoring

```typescript
import { startTransaction } from "@/server/middleware/sentry-config";

const transaction = startTransaction("create_activity", "http.server");
try {
  // ... code
  transaction?.finish();
} catch (error) {
  transaction?.finish("error");
  throw error;
}
```

---

## 📈 Metriche Importanti

### Error Rate

Monitora la percentuale di richieste che generano errori:

```
Error Rate = (Errori / Richieste Totali) × 100
```

**Target**: < 1% in produzione

### Response Time

Monitora il tempo medio di risposta:

```
Response Time = Tempo Totale / Numero Richieste
```

**Target**: < 200ms

### Crash Rate

Monitora la percentuale di crash:

```
Crash Rate = (Crash / Sessioni) × 100
```

**Target**: < 0.1%

---

## 🔐 Privacy & Security

### Dati Sensibili

Sentry NON invia automaticamente:
- Dati di login
- Token di autenticazione
- Password

### Configurazione Privacy

Per escludere campi sensibili:

```typescript
beforeSend(event) {
  // Rimuovi dati sensibili
  if (event.request?.headers) {
    delete event.request.headers["Authorization"];
    delete event.request.headers["Cookie"];
  }
  return event;
}
```

---

## 🚨 Troubleshooting

### Errori non Appaiono in Sentry

1. Verifica che `SENTRY_DSN` sia configurato
2. Controlla i log del server: `[Sentry] Initialized successfully`
3. Verifica che l'errore non sia nella lista "ignoreErrors"

### Troppe Notifiche

1. Aumenta la soglia di alert
2. Filtra per severity level
3. Usa "Digest" per raggruppare notifiche

### Performance Lenta

1. Riduci `SENTRY_TRACES_SAMPLE_RATE` (es: 0.05)
2. Riduci `SENTRY_PROFILES_SAMPLE_RATE` (es: 0.05)

---

## 📚 Risorse

- [Sentry Documentation](https://docs.sentry.io/)
- [Node.js Integration](https://docs.sentry.io/platforms/node/)
- [Express Integration](https://docs.sentry.io/platforms/node/guides/express/)
- [Performance Monitoring](https://docs.sentry.io/platforms/node/performance/)

---

## ✅ Checklist

- [ ] Account Sentry creato
- [ ] Progetto creato
- [ ] DSN copiato
- [ ] Variabili d'ambiente configurate su Render
- [ ] Deploy completato
- [ ] Errori appaiono in Sentry
- [ ] Alerts configurati
- [ ] Team notificato

---

**Ultimo aggiornamento:** 2026-01-27
**Versione:** 1.0.0
