# Garmin Authentication Notes

## Problema Identificato

L'errore `'str' object has no attribute 'expired'` è probabilmente legato a problemi con la gestione dei token OAuth nella libreria `garth` (dipendenza di `python-garminconnect`).

## Issues Correlati su GitHub

1. **Issue #312**: Login fails with "OAuth1 token is required for OAuth2 refresh" on MFA accounts
   - Problema con account che hanno MFA (Multi-Factor Authentication) abilitato
   - La libreria richiede token OAuth1 per il refresh di OAuth2
   
2. **Soluzione Suggerita**: 
   - Usare `uvx garth login` per testare il login in ambiente pulito
   - Salvare i token con `garth.Client.dumps()` per riutilizzarli

## Workaround Implementato

Per evitare problemi con l'autenticazione diretta, il microservizio:
1. Tenta il login con le credenziali fornite
2. Se fallisce con errori di token, restituisce un messaggio chiaro
3. Suggerisce all'utente di verificare le credenziali e disabilitare MFA se possibile

## Note Importanti

- Gli account Garmin con MFA abilitato potrebbero non funzionare correttamente
- La libreria python-garminconnect è non ufficiale e può avere problemi di compatibilità
- Garmin potrebbe bloccare tentativi di login automatizzati
