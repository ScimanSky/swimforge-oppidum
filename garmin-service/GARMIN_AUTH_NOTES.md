# Garmin Authentication Notes

Riferimento: `python-garminconnect` **0.3.20** (23 ottobre 2026), pinnata in
`requirements.txt` insieme a `curl_cffi>=0.15.0`.

## Libreria

- **Niente più `garth`.** È stata rimossa in 0.3.0. Il login e il refresh dei
  token sono fatti dalla libreria stessa (`garminconnect.client`), con
  `curl_cffi` per i fingerprint TLS dei browser. Senza `curl_cffi` restano solo
  le strategie `requests`, quasi sempre bloccate da Cloudflare.
- **Python ≥ 3.12** (l'immagine Docker usa `python:3.12-slim`).
- Il login prova in cascata più strategie (mobile, widget SSO, portal web, con
  e senza `curl_cffi`) e accetta un token solo se l'API lo riconosce valido. La
  strategia "portal" aspetta 10-20 s prima di inviare le credenziali, quindi un
  login completo può durare decine di secondi.
- Il percorso di login mobile restituiva 429 da aprile fino alla 0.3.19; è
  risolto in 0.3.20.
- "Oggi" (`calendarDate`) per gli endpoint giornalieri segue il fuso orario del
  profilo Garmin, non quello del server. Il servizio calcola da sé gli
  intervalli delle attività, quindi non ne è influenzato.
- I vecchi token `garth` (`oauth1_token.json`/`oauth2_token.json`) non sono
  convertibili: serve un nuovo login con email e password. Il server Node li
  riconosce dal prefisso `garth:` e chiede di ricollegare l'account.

## Token store

Una directory per utente sotto `TOKEN_STORE_DIR` (default `/tmp/garmin_tokens`,
su Oracle `/data/tokens` nel volume `garmin_tokens`):

```
<TOKEN_STORE_DIR>/            0700
  <user_id>/                  0700
    garmin_tokens.json        0600  {"di_token", "di_refresh_token", "di_client_id"}
    mfa_state.bin             0600  stato MFA in attesa, cifrato (solo durante un login MFA)
```

- I login successivi usano `Garmin().login(tokenstore=str(<user_id dir>))`: la
  libreria legge `garmin_tokens.json`, rinnova il token se sta per scadere e lo
  riscrive lì.
- Dopo un login con credenziali o un `resume_login()` il servizio scrive i
  token con `client.client.dump(<dir>)`: con `return_on_mfa=True` né `login()`
  né `resume_login()` salvano il token store da soli.
- Il contenuto di `garmin_tokens.json` è il `token_data` restituito al server
  Node (che lo salva cifrato nel DB con prefisso `garmin:`) e rimandato a
  `POST /auth/restore` dopo un riavvio.
- **Migrazione automatica:** il vecchio layout a file singolo
  `<TOKEN_STORE_DIR>/<user_id>.json` (stesso JSON) viene spostato in
  `<user_id>/garmin_tokens.json` al primo accesso a quell'utente.
- `user_id` deve corrispondere a `^[A-Za-z0-9_-]{1,64}$` (altrimenti 400), perché
  diventa un nome di directory.

## MFA in due passi, anche tra processi diversi

1. `POST /auth/login` crea `Garmin(email, password, return_on_mfa=True)` e chiama
   `login()`. Se serve l'MFA la libreria restituisce
   `("needs_mfa", client_state)`: un dict serializzabile in JSON che contiene i
   **cookie di sessione SSO di Garmin**, da trattare come una password.
2. Il servizio tiene l'istanza in memoria (`pending_mfa`) e, se è configurata
   `GARMIN_STATE_KEY`, scrive anche
   `Fernet({"state": client_state, "created_at": now})` in
   `<user_id>/mfa_state.bin` (0600). Lo stato non viene mai scritto nei log.
3. `POST /auth/mfa` usa l'istanza in memoria; se non c'è (riavvio del container),
   decifra `mfa_state.bin` e, se ha meno di 600 s, chiama
   `Garmin().resume_login(client_state, code)` su una **nuova** istanza: la
   libreria ricostruisce il login in sospeso da `client_state`.
4. Il file viene cancellato a login riuscito, a scadenza, su rate limit/blocco,
   a un nuovo `/auth/login`, a `/auth/logout` e da `cleanup_expired_mfa()`
   (chiamato da `/health`, `/auth/login` e `/auth/mfa-status`), che elimina i file
   più vecchi di 10 minuti anche senza la voce in memoria.
5. Un codice errato lascia in piedi la sessione: si può riprovare entro i 10
   minuti.

`/auth/mfa-status/{user_id}` considera anche lo stato su disco, così dopo un
riavvio l'app mostra ancora il campo per il codice.

### GARMIN_STATE_KEY

Chiave Fernet (32 byte, base64 url-safe) usata solo per `mfa_state.bin`.
Il servizio non aveva una chiave di cifratura propria, e non riusa
`TOKEN_ENCRYPTION_KEY` del server Node. Generarla con:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Se manca o non è valida il servizio parte comunque, con un warning, e tiene lo
stato MFA solo in memoria (perso a ogni riavvio). Cambiare la chiave invalida
solo gli eventuali login MFA in corso.

## Errori di Garmin

| Caso | Risposta del servizio |
|------|-----------------------|
| HTTP **427** (Garmin blocca il login automatico) | `403` "Garmin ha bloccato il login automatico, riprova più tardi" + cooldown per l'utente. Nessun nuovo tentativo automatico. |
| HTTP 429, oppure tutte le strategie rate-limited/bloccate (`HTTP 429/427` nel messaggio riassuntivo della libreria) | `429` con `Retry-After` e cooldown di `GARMIN_RATE_LIMIT_COOLDOWN_SECONDS` (default 900 s). |
| Credenziali errate | `401` |
| Codice MFA errato | `401` (la sessione MFA resta valida) |

Il 427 non va ritentato in loop: ogni tentativo prolunga il blocco e può far
limitare l'account. La libreria lo solleva come
`GarminConnectTooManyRequestsError` con messaggio `"... returned 427"` (o con
la risposta HTTP 427 come causa); il servizio lo riconosce da lì.

## Test

```bash
pip install -r requirements.txt pytest
python -m pytest -q
```

`test_mfa_state.py` copre cifratura, scadenza e blob corrotti;
`test_auth_flow.py` prova gli endpoint con un `Garmin` finto (nessuna chiamata
di rete, nessun login reale).
