# OpenTelemetry + Jaeger Setup - SwimForge

## 📋 Overview

OpenTelemetry + Jaeger è una soluzione **completamente gratuita e self-hosted** per:
- ✅ Error tracking
- ✅ Performance monitoring
- ✅ Distributed tracing
- ✅ Zero costi

**vs Sentry:**
- Sentry: Trial 14 giorni, poi a pagamento
- OpenTelemetry + Jaeger: Gratuito per sempre

---

## 🚀 Architecture

```
SwimForge App
    ↓
OpenTelemetry SDK
    ↓
Jaeger Collector (self-hosted)
    ↓
Jaeger Backend
    ↓
Jaeger UI (Dashboard)
```

---

## 📦 Installazione Dipendenze

```bash
cd /home/ubuntu/swimforge-repo

# Installa OpenTelemetry packages
pnpm add @opentelemetry/api \
         @opentelemetry/sdk-node \
         @opentelemetry/auto-instrumentations-node \
         @opentelemetry/sdk-trace-node \
         @opentelemetry/exporter-trace-jaeger \
         @opentelemetry/sdk-metrics \
         @opentelemetry/exporter-metrics-prometheus \
         @opentelemetry/resources \
         @opentelemetry/semantic-conventions
```

---

## 🔧 Configurazione OpenTelemetry

### File: `server/middleware/telemetry.ts`

```typescript
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { JaegerExporter } from "@opentelemetry/exporter-trace-jaeger";
import { BasicTracerProvider, BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { PrometheusExporter } from "@opentelemetry/exporter-metrics-prometheus";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";

/**
 * Initialize OpenTelemetry with Jaeger exporter
 */
export function initializeTelemetry() {
  const jaegerExporter = new JaegerExporter({
    host: process.env.JAEGER_HOST || "localhost",
    port: parseInt(process.env.JAEGER_PORT || "6831"),
  });

  const tracerProvider = new BasicTracerProvider({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: "swimforge-backend",
      [SemanticResourceAttributes.SERVICE_VERSION]: process.env.APP_VERSION || "1.0.0",
    }),
  });

  tracerProvider.addSpanProcessor(new BatchSpanProcessor(jaegerExporter));

  const sdk = new NodeSDK({
    traceExporter: jaegerExporter,
    instrumentations: [getNodeAutoInstrumentations()],
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: "swimforge-backend",
    }),
  });

  sdk.start();
  console.log("[Telemetry] OpenTelemetry initialized");

  return sdk;
}

/**
 * Shutdown telemetry gracefully
 */
export async function shutdownTelemetry(sdk: NodeSDK) {
  await sdk.shutdown();
  console.log("[Telemetry] OpenTelemetry shutdown complete");
}
```

### Integrazione nel Server

```typescript
// server/_core/index.ts
import { initializeTelemetry, shutdownTelemetry } from "../middleware/telemetry";

async function startServer() {
  // Initialize telemetry FIRST
  const telemetrySdk = initializeTelemetry();

  // ... rest of server setup

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    await shutdownTelemetry(telemetrySdk);
    process.exit(0);
  });
}
```

---

## 🐳 Deploy Jaeger su Render

### Opzione 1: Docker (Consigliato)

1. Vai a Render Dashboard
2. Clicca "New +" > "Web Service"
3. Seleziona "Docker"
4. Repository: `jaegertracing/all-in-one`
5. Configura:
   - **Name:** swimforge-jaeger
   - **Port:** 16686 (UI), 6831 (UDP)
   - **Memory:** 512 MB
   - **Disk:** 1 GB

### Opzione 2: Render Blueprint

Crea file `render.yaml`:

```yaml
services:
  - type: web
    name: swimforge-jaeger
    image: jaegertracing/all-in-one:latest
    ports:
      - port: 16686
        expose: true
      - port: 6831
        protocol: udp
    env:
      - key: COLLECTOR_ZIPKIN_HTTP_PORT
        value: "9411"
```

---

## 📊 Jaeger UI

### Accesso

```
https://swimforge-jaeger.onrender.com/
```

### Visualizzazioni

1. **Service List:** Tutti i servizi monitorati
2. **Traces:** Tracce complete delle richieste
3. **Metrics:** Performance metrics
4. **Logs:** Log aggregati

### Ricerca Tracce

```
# Per errore
status:error

# Per latenza alta
duration > 1s

# Per servizio
service:swimforge-backend

# Per operazione
operation:POST /api/trpc/activities.create
```

---

## 🔍 Instrumentazione Personalizzata

### Tracciare Errori

```typescript
import { trace } from "@opentelemetry/api";

const tracer = trace.getTracer("swimforge-backend");

try {
  // ... code
} catch (error) {
  const span = tracer.startSpan("error");
  span.recordException(error as Error);
  span.setStatus({ code: SpanStatusCode.ERROR });
  span.end();
}
```

### Tracciare Operazioni Lunghe

```typescript
const span = tracer.startSpan("database_query");
span.setAttributes({
  "db.system": "postgresql",
  "db.operation": "SELECT",
  "db.sql.table": "users",
});

try {
  // ... database operation
  span.setStatus({ code: SpanStatusCode.OK });
} catch (error) {
  span.recordException(error as Error);
  span.setStatus({ code: SpanStatusCode.ERROR });
} finally {
  span.end();
}
```

---

## 📈 Metriche

### Metriche Automatiche

OpenTelemetry traccia automaticamente:
- HTTP request latency
- HTTP request size
- HTTP response size
- Database query duration
- Exception count

### Metriche Personalizzate

```typescript
import { metrics } from "@opentelemetry/api";

const meter = metrics.getMeter("swimforge-backend");

const activityCounter = meter.createCounter("activities_created", {
  description: "Number of activities created",
});

activityCounter.add(1, {
  userId: user.id,
  type: activity.type,
});
```

---

## 🚨 Alerting Gratuito

### Opzione 1: Jaeger Alerts (Built-in)

1. Vai a Jaeger UI
2. Crea alert per latenza alta:
   ```
   duration > 5s
   ```

### Opzione 2: Prometheus + AlertManager (Gratuito)

1. Esponi metriche Prometheus:
   ```typescript
   app.get("/metrics", (req, res) => {
     const register = new prometheus.Registry();
     res.set("Content-Type", register.contentType);
     res.end(register.metrics());
   });
   ```

2. Configura AlertManager
3. Invia notifiche a Slack/Discord

---

## 📊 Dashboard Grafana (Opzionale)

### Setup Grafana Gratuito

1. Deploy Grafana su Render
2. Connetti a Jaeger come data source
3. Crea dashboard personalizzate

```yaml
# render.yaml
services:
  - type: web
    name: swimforge-grafana
    image: grafana/grafana:latest
    ports:
      - port: 3000
```

---

## 🔐 Sicurezza

### Proteggere Jaeger UI

1. Aggiungi Basic Auth:
   ```typescript
   app.use("/jaeger", basicAuth({
     users: { admin: "password" }
   }));
   ```

2. Usa reverse proxy con SSL
3. Limita accesso per IP

---

## 📋 Variabili d'Ambiente

```bash
# Jaeger Configuration
JAEGER_HOST=swimforge-jaeger.onrender.com
JAEGER_PORT=6831
JAEGER_SAMPLER_TYPE=const
JAEGER_SAMPLER_PARAM=1

# OpenTelemetry
OTEL_SERVICE_NAME=swimforge-backend
OTEL_TRACES_EXPORTER=jaeger
OTEL_METRICS_EXPORTER=prometheus
```

---

## 📚 Comandi Utili

### Visualizzare Tracce

```bash
# Scarica tracce in JSON
curl http://jaeger-ui:16686/api/traces?service=swimforge-backend

# Filtra per errore
curl "http://jaeger-ui:16686/api/traces?service=swimforge-backend&tags=error=true"
```

### Metriche Prometheus

```bash
# Scarica metriche
curl http://swimforge-backend:9090/metrics

# Filtra per metrica
curl "http://swimforge-backend:9090/metrics" | grep "http_request_duration"
```

---

## 🚀 Deployment Checklist

- [ ] Dipendenze installate
- [ ] `telemetry.ts` creato
- [ ] Server integrato
- [ ] Jaeger deployato su Render
- [ ] Variabili d'ambiente configurate
- [ ] Tracce appaiono in Jaeger UI
- [ ] Errori tracciati correttamente
- [ ] Performance metrics visibili

---

## 📊 Monitoraggio

### Metriche Importanti

| Metrica | Target | Azione |
|---------|--------|--------|
| P95 Latency | < 500ms | Ottimizza query |
| Error Rate | < 1% | Controlla Jaeger |
| Trace Volume | < 1000/min | Riduci sample rate |

---

## 💰 Costi

| Componente | Costo |
|-----------|-------|
| OpenTelemetry SDK | Gratuito |
| Jaeger (self-hosted) | Gratuito |
| Render (512MB) | ~$12/mese |
| **Totale** | **~$12/mese** |

**vs Sentry:** Sentry Pro = $29/mese

---

## 📚 Risorse

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Jaeger Documentation](https://www.jaegertracing.io/docs/)
- [Node.js Instrumentation](https://opentelemetry.io/docs/instrumentation/js/)

---

## ✅ Checklist Setup

- [ ] Dipendenze installate
- [ ] telemetry.ts creato e integrato
- [ ] Jaeger deployato su Render
- [ ] JAEGER_HOST configurato
- [ ] Tracce visibili in Jaeger UI
- [ ] Errori tracciati
- [ ] Performance metrics visibili
- [ ] Alerting configurato

---

**Ultimo aggiornamento:** 2026-01-27
**Versione:** 1.0.0
**Costo Mensile:** ~$12 (Render)
