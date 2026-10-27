# SwimForge Garmin Connect Microservice

Microservizio Python per l'integrazione con Garmin Connect.

## Funzionalità

- **Autenticazione** con Garmin Connect (`python-garminconnect` 0.3.20, MFA in due passi)
- **Sincronizzazione attività** di nuoto
- **Parsing dati** (distanza, tempo, stile, vasche, SWOLF, frequenza cardiaca)
- **API RESTful** per comunicazione con il backend principale

## Requisiti

- Python 3.12+
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

# Test (nessuna chiamata a Garmin)
pip install pytest && python -m pytest -q
```

## Variabili d'Ambiente

| Variabile | Descrizione | Default |
|-----------|-------------|---------|
| `GARMIN_SERVICE_SECRET` | Chiave segreta per autenticazione API (obbligatoria) | *(nessuno: il servizio non parte)* |
| `MAIN_API_URL` | URL del backend principale SwimForge | `http://localhost:3000` |
| `PORT` | Porta del servizio | `8000` |
| `TOKEN_STORE_DIR` | Directory dei token Garmin, una sottodirectory per utente | `/tmp/garmin_tokens` |
| `GARMIN_STATE_KEY` | Chiave Fernet (base64) per cifrare su disco lo stato MFA in attesa. Se assente, lo stato MFA resta solo in memoria | *(vuoto)* |
| `GARMIN_RATE_LIMIT_COOLDOWN_SECONDS` | Pausa per utente dopo un 429/427 di Garmin | `900` |
| `GARMIN_CORS_ALLOW_ORIGINS` | Origini browser consentite (CSV). Se vuoto, CORS disabilitato | *(vuoto)* |
| `GARMIN_CORS_ALLOW_CREDENTIALS` | Abilita credenziali CORS (`true/false`) | `false` |

Generare `GARMIN_STATE_KEY` con
`python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`.
Dettagli su token store, MFA e codici di errore in `GARMIN_AUTH_NOTES.md`.

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

Se Garmin richiede l'MFA risponde `mfa_required: true`; il codice va inviato a
`POST /auth/mfa` (`{"user_id": "123", "mfa_code": "123456"}`) entro 10 minuti,
anche se nel frattempo il servizio è stato riavviato (con `GARMIN_STATE_KEY`).
Se Garmin blocca il login (HTTP 427) la risposta è `403`.

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
- I token Garmin sono in `<TOKEN_STORE_DIR>/<user_id>/garmin_tokens.json` (0600, directory 0700)
- Lo stato MFA in attesa contiene cookie di sessione Garmin: su disco è solo cifrato (`mfa_state.bin`, 0600) e viene cancellato dopo 10 minuti
- Le password non vengono mai salvate
- CORS è disabilitato di default; abilitalo solo se necessario con allowlist esplicita

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
