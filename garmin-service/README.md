# SwimForge Garmin Connect Microservice

Microservizio Python per l'integrazione con Garmin Connect.

## Funzionalità

- **Autenticazione OAuth** con Garmin Connect
- **Sincronizzazione attività** di nuoto
- **Parsing dati** (distanza, tempo, stile, vasche, SWOLF, frequenza cardiaca)
- **API RESTful** per comunicazione con il backend principale

## Requisiti

- Python 3.11+
- Account Garmin Connect

## Installazione Locale

```bash
# Crea virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# oppure: venv\Scripts\activate  # Windows

# Installa dipendenze
pip install -r requirements.txt

# Avvia il servizio
uvicorn main:app --reload --port 8000
```

## Variabili d'Ambiente

| Variabile | Descrizione | Default |
|-----------|-------------|---------|
| `GARMIN_SERVICE_SECRET` | Chiave segreta per autenticazione API | `swimforge-garmin-secret-key` |
| `MAIN_API_URL` | URL del backend principale SwimForge | `http://localhost:3000` |
| `PORT` | Porta del servizio | `8000` |

## API Endpoints

### Autenticazione

#### POST /auth/login
Autentica un utente con Garmin Connect.

```json
{
  "user_id": "123",
  "email": "user@example.com",
  "password": "garmin_password"
}
```

#### POST /auth/logout?user_id=123
Disconnette l'utente da Garmin Connect.

#### GET /auth/status/{user_id}
Verifica lo stato di connessione.

### Attività

#### GET /activities/swimming/{user_id}?days_back=30
Recupera le attività di nuoto degli ultimi N giorni.

#### POST /sync
Sincronizza le attività con SwimForge.

```json
{
  "user_id": "123",
  "days_back": 30
}
```

## Deploy su Render

1. Crea un nuovo Web Service su Render
2. Connetti il repository GitHub
3. Seleziona la directory `garmin-service`
4. Configura le variabili d'ambiente
5. Deploy!

## Sicurezza

- Tutte le API richiedono header `X-API-Key` con la chiave segreta
- Le credenziali Garmin sono usate solo per l'autenticazione iniziale
- I token di sessione sono memorizzati in memoria (usa Redis in produzione)
- Le password non vengono mai salvate

## Struttura Dati Attività

```json
{
  "activity_id": "12345678",
  "activity_name": "Pool Swimming",
  "start_time": "2024-01-15T08:30:00",
  "distance_meters": 3500,
  "duration_seconds": 5400,
  "pool_length": 25,
  "stroke_type": "freestyle",
  "avg_pace_per_100m": 154,
  "calories": 450,
  "avg_heart_rate": 145,
  "max_heart_rate": 165,
  "swolf_score": 42,
  "laps_count": 140,
  "is_open_water": false
}
```
