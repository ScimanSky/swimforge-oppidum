# Security Policy - SwimForge Oppidum

## Reporting a Vulnerability

Se scopri una vulnerabilità di sicurezza in SwimForge Oppidum, **NON** creare un GitHub Issue pubblico. 

Invece, invia un email a: **security@swimforge-oppidum.dev** con le seguenti informazioni:

### Informazioni Richieste:
- **Titolo:** Breve descrizione della vulnerabilità
- **Descrizione:** Dettagli tecnici della vulnerabilità
- **Passi per Riprodurla:** Step-by-step per replicare il problema
- **Impatto Potenziale:** Quali dati/sistemi potrebbero essere compromessi
- **Suggerimenti di Fix:** (Opzionale) Proposte di soluzione
- **Versione Interessata:** Quale versione di SwimForge è affetta

### Timeframe di Risposta:
- **Acknowledgment:** Entro 48 ore
- **Fix:** Entro 7 giorni (per vulnerabilità critiche)
- **Disclosure:** Entro 90 giorni dal fix (disclosure responsabile)

### Esempio di Email:
```
Subject: [SECURITY] SQL Injection in User Profile Endpoint

Body:
Titolo: SQL Injection in /api/profile endpoint
Descrizione: Il parametro 'user_id' non è sanitizzato...
Passi: 1. Registrati 2. Vai a /api/profile?user_id=1' OR '1'='1
Impatto: Accesso non autorizzato ai dati di altri utenti
Fix Suggerito: Usare Zod validation su tutti gli input
Versione: 1.0.0
```

---

## Supported Versions

| Versione | Supportata | Data Fine Supporto | Note |
|----------|-----------|-------------------|------|
| 1.0.x    | ✅ Sì     | 2026-12-31        | Production |
| 0.9.x    | ⚠️ Limitato | 2026-06-30        | Legacy - solo fix critici |
| < 0.9    | ❌ No     | N/A               | Non supportato |

---

## Security Best Practices

### Per Sviluppatori

1. **Gestione Secrets**
   - Usa variabili d'ambiente per tutti i secrets
   - Mai committare `.env` o credenziali nel repo
   - Ruota secrets ogni 90 giorni
   - Usa `openssl rand -base64 32` per generare secrets forti

2. **Input Validation**
   - Valida TUTTI gli input con Zod schema
   - Usa prepared statements per query SQL
   - Implementa rate limiting su endpoint pubblici
   - Sanitizza output per prevenire XSS

3. **Authentication & Authorization**
   - Usa JWT con scadenza (15 minuti)
   - Implementa refresh token (7 giorni)
   - Verifica permessi su OGNI endpoint
   - Usa bcrypt per hashing password (min 12 rounds)

4. **HTTPS & TLS**
   - Usa HTTPS su tutti gli endpoint
   - Configura HSTS header
   - Usa certificati SSL/TLS validi
   - Disabilita TLS < 1.2

5. **Database Security**
   - Usa least privilege per database user
   - Abilita SSL per connessioni database
   - Implementa backup crittografati
   - Monitora query anomale

6. **Dependency Management**
   - Mantieni dipendenze aggiornate
   - Usa `npm audit` regolarmente
   - Abilita Dependabot su GitHub
   - Rivedi changelog prima di aggiornare

7. **Logging & Monitoring**
   - Loga tutti gli accessi non autorizzati
   - Monitora pattern di errore anomali
   - Implementa alerting per attività sospette
   - Mantieni audit log per 90 giorni

### Per Utenti

1. **Account Security**
   - Usa password forte (min 12 caratteri)
   - Abilita 2FA quando disponibile
   - Non condividere credenziali
   - Logout da dispositivi pubblici

2. **Data Privacy**
   - Leggi la Privacy Policy
   - Controlla le impostazioni di privacy
   - Non condividere dati personali sensibili
   - Richiedi cancellazione dati se necessario

3. **Segnalazione Problemi**
   - Segnala vulnerabilità via email di sicurezza
   - Non condividere vulnerabilità pubblicamente
   - Aspetta il fix prima di disclosure

---

## Security Headers

SwimForge implementa i seguenti security headers:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'
Referrer-Policy: strict-origin-when-cross-origin
```

---

## Vulnerability Disclosure Timeline

### Esempio di Timeline Responsabile:

1. **Giorno 1:** Ricevi segnalazione vulnerabilità
2. **Giorno 2:** Conferma e inizio investigazione
3. **Giorno 7:** Fix sviluppato e testato
4. **Giorno 8:** Deploy fix in produzione
5. **Giorno 9:** Notifica ricercatore che fix è live
6. **Giorno 90:** Ricercatore può pubblicare disclosure

---

## Compliance

SwimForge Oppidum si impegna a mantenere conformità con:

- ✅ **OWASP Top 10** - Protezione da vulnerabilità comuni
- ✅ **GDPR** - Protezione dati personali (EU)
- ✅ **CCPA** - Protezione dati personali (California)
- ✅ **PCI DSS** - Se gestisce pagamenti (Stripe)
- ✅ **ISO 27001** - Gestione della sicurezza informatica

---

## Contacts

- **Security Email:** security@swimforge-oppidum.dev
- **GitHub Issues:** Per bug non-security
- **Discord:** Community support
- **Website:** https://swimforge-oppidum.dev

---

## Changelog Sicurezza

### v1.0.0 (2026-01-27)
- ✅ Aggiunto UNIQUE constraint su ai_coach_workouts
- ✅ Implementato input validation con Zod
- ✅ Aggiunto rate limiting
- ✅ Configurato CORS esplicitamente
- ✅ Integrato Sentry per error tracking

---

**Ultima Aggiornamento:** 27 Gennaio 2026  
**Prossima Revisione:** 27 Aprile 2026
