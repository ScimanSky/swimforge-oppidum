# SwimForge Oppidum - Guida al Deployment

Questa guida spiega come deployare SwimForge Oppidum su:
- **Vercel** (Frontend + Backend Node.js)
- **Supabase** (Database PostgreSQL)
- **Render** (Microservizio Python per Garmin)

---

## 1. Setup Supabase (Database)

### 1.1 Crea un progetto Supabase
1. Vai su [supabase.com](https://supabase.com) e accedi
2. Crea un nuovo progetto
3. Scegli una regione vicina ai tuoi utenti
4. Imposta una password sicura per il database (salvala!)

### 1.2 Ottieni la Connection String
1. Vai in **Project Settings** > **Database**
2. Scorri fino a **Connection string** > **URI**
3. Copia la stringa e sostituisci `[YOUR-PASSWORD]` con la password del database

Esempio:
```
postgresql://postgres:TuaPassword123@db.wpnxaadvyxmhlcgdobla.supabase.co:5432/postgres
```

### 1.3 Inizializza il Database
1. Vai in **SQL Editor** nel pannello Supabase
2. Copia e incolla il contenuto del file `supabase-init.sql`
3. Clicca **Run** per eseguire lo script

---

## 2. Deploy su Render (Microservizio Garmin)

### 2.1 Crea un nuovo Web Service
1. Vai su [render.com](https://render.com) e accedi
2. Clicca **New** > **Web Service**
3. Connetti il repository GitHub: `ScimanSky/swimforge-oppidum`
4. Configura:
   - **Name**: `swimforge-garmin-service`
   - **Root Directory**: `garmin-service`
   - **Runtime**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`

### 2.2 Configura le Environment Variables
Aggiungi queste variabili in Render:
- `GARMIN_SERVICE_SECRET`: Una chiave segreta (es. `swimforge-garmin-secret-2024`)

### 2.3 Deploy
1. Clicca **Create Web Service**
2. Attendi il completamento del deploy
3. Copia l'URL del servizio (es. `https://swimforge-garmin-service.onrender.com`)

---

## 3. Deploy su Vercel (Frontend + Backend)

### 3.1 Importa il Progetto
1. Vai su [vercel.com](https://vercel.com) e accedi
2. Clicca **Add New** > **Project**
3. Importa da GitHub: `ScimanSky/swimforge-oppidum`

### 3.2 Configura il Build
- **Framework Preset**: Other
- **Build Command**: `pnpm build`
- **Output Directory**: `dist`
- **Install Command**: `pnpm install`

### 3.3 Configura le Environment Variables
Aggiungi queste variabili in Vercel:

| Variable | Valore |
|----------|--------|
| `DATABASE_URL` | La connection string di Supabase |
| `JWT_SECRET` | Una stringa casuale sicura (32+ caratteri) |
| `VITE_APP_ID` | `swimforge-oppidum` |
| `VITE_APP_TITLE` | `SwimForge Oppidum` |
| `NODE_ENV` | `production` |
| `GARMIN_SERVICE_URL` | URL del servizio Render |
| `GARMIN_SERVICE_SECRET` | La stessa chiave usata in Render |
| `STRAVA_SERVICE_SECRET` | La stessa chiave usata nel servizio Strava |
| `TOKEN_ENCRYPTION_KEY` | Chiave 32 byte per cifrare token |
| `ENABLE_SWAGGER` | Abilita Swagger in produzione | `true` (solo se necessario) |

### 3.4 Deploy
1. Clicca **Deploy**
2. Attendi il completamento
3. L'app sarà disponibile all'URL fornito da Vercel

---

## 4. Verifica il Deployment

### 4.1 Test Database
1. Apri l'app su Vercel
2. Prova a registrarti/accedere
3. Verifica che il profilo venga creato correttamente

### 4.2 Test Garmin Integration
1. Vai nel tuo profilo
2. Prova a collegare Garmin Connect
3. Verifica che la sincronizzazione funzioni

---

## Troubleshooting

### Errore "Database connection failed"
- Verifica che `DATABASE_URL` sia corretto
- Assicurati che la password non contenga caratteri speciali non escapati
- Controlla che SSL sia abilitato (aggiungere `?sslmode=require` se necessario)

---

## Migrazioni Database (workflow consigliato)

Le migrazioni **non** vengono più eseguite automaticamente a runtime.

Quando aggiungi nuove migrazioni:
1. Genera migrazione (se usi Drizzle)
   ```
   pnpm db:generate
   ```
2. Applica migrazioni al DB (una tantum)
   ```
   DATABASE_URL="..." pnpm db:migrate
   ```
3. Poi esegui il deploy dell'app.

### Errore "Garmin service unavailable"
- Verifica che il servizio Render sia attivo
- Controlla i log in Render per errori
- Verifica che `GARMIN_SERVICE_URL` e `GARMIN_SERVICE_SECRET` corrispondano
- Verifica che `STRAVA_SERVICE_SECRET` corrisponda al servizio Strava
- Verifica che `TOKEN_ENCRYPTION_KEY` sia presente (32 byte)

### Errore "Build failed" su Vercel
- Verifica che tutte le dipendenze siano nel `package.json`
- Controlla i log di build per errori specifici

---

## Variabili d'Ambiente Richieste

| Variable | Descrizione | Dove Ottenerla |
|----------|-------------|----------------|
| `DATABASE_URL` | Connection string PostgreSQL | Supabase > Settings > Database |
| `JWT_SECRET` | Chiave per firmare i JWT | Genera con `openssl rand -base64 32` |
| `GARMIN_SERVICE_URL` | URL del microservizio Python | Render dopo il deploy |
| `GARMIN_SERVICE_SECRET` | Chiave condivisa per auth | Scegli una stringa sicura |
| `STRAVA_SERVICE_SECRET` | Chiave condivisa per auth | Scegli una stringa sicura |
| `TOKEN_ENCRYPTION_KEY` | Chiave 32 byte | `openssl rand -base64 32` |
| `VITE_APP_ID` | ID dell'applicazione | `swimforge-oppidum` |
| `VITE_APP_TITLE` | Titolo visualizzato | `SwimForge Oppidum` |
| `NODE_ENV` | Ambiente di esecuzione | `production` |
