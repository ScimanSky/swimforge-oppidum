# GDPR Compliance - Piano di Implementazione

**Data:** 2026-02-17
**Scope:** Conformita GDPR (Regolamento UE 2016/679) e normativa italiana (D.Lgs 196/2003 modificato da D.Lgs 101/2018, linee guida Garante)
**Obiettivo:** Gap analysis tra stato attuale e requisiti GDPR/IT, con piano di implementazione tecnico dettagliato.

---

## 1. Stato attuale: cosa esiste gia

### Documenti legali
| Documento | Esiste | Posizione | Note |
|---|---|---|---|
| Privacy Policy | Si | `PRIVACY_POLICY.md`, `/privacy` page | In italiano, ma con lacune significative |
| Terms of Service | Si | `TERMS_OF_SERVICE.md`, `/terms` page | In italiano, eta minima 13 (sbagliata per IT) |
| Cookie Policy | NO | - | Solo 4 righe nella Privacy Policy sez. 7 |

### Meccanismi privacy esistenti
| Funzionalita | Esiste | Posizione | Note |
|---|---|---|---|
| Checkbox accettazione ToS alla registrazione | Si | `Register.tsx:293-311` | Ma il consenso NON e salvato in DB |
| Account deletion | Si | `Settings.tsx` + `db.ts:965-1087` | Incompleta: non cancella tutte le tabelle |
| Data export (JSON) | Si | `Settings.tsx` + `db.ts:868-962` | Buona copertura, mancano Garmin/Strava tokens |
| Privacy settings (profilo/attivita/classifiche) | Si | `Settings.tsx:1258-1373` | 3 toggle in `privacy_settings` JSON |
| Notification settings (incl. marketing toggle) | Si | `Settings.tsx:49-104` | 9 toggle, nessun email marketing implementato |
| Disconnect Garmin/Strava | Si | Settings page | OK |
| Cookie banner / CMP | NO | - | Nessun meccanismo di consenso cookie |
| Consenso separato dati salute | NO | - | Dati salute trattati senza consenso esplicito Art. 9 |
| Registro consensi in DB | NO | - | Nessuna tabella `user_consents` |
| Registro trattamenti (ROPA) | NO | - | Documento interno obbligatorio |
| DPIA | NO | - | Obbligatoria per dati sanitari |

---

## 2. Gap Analysis dettagliata

### 2.1 CRITICA - Dati sanitari trattati senza consenso esplicito (Art. 9 GDPR)

**Il problema piu grave.** SwimForge raccoglie e tratta dati che il GDPR classifica come "dati relativi alla salute" (Art. 9):

| Dato | Tabella | Classificazione GDPR |
|---|---|---|
| Frequenza cardiaca (avg/max) | `swimming_activities.avg_heart_rate`, `max_heart_rate` | **Dato sanitario** |
| Zone HR (zone 1-5 seconds) | `swimming_activities.hr_zone_*_seconds` | **Dato sanitario** |
| VO2 Max | `swimming_activities.vo2_max_value` | **Dato sanitario** |
| Frequenza cardiaca a riposo | `swimming_activities.resting_heart_rate` | **Dato sanitario** |
| Livello di stress | `swimming_activities.avg_stress` | **Dato sanitario** |
| Training Effect | `swimming_activities.training_effect` | **Dato sanitario** |
| Calorie bruciate | `swimming_activities.calories` | **Dato sanitario** (se derivato da dati fisiologici) |
| RPE (sforzo percepito) | `season_activity_predictions.target_rpe` | **Dato sanitario** |
| Raw data Garmin | `swimming_activities.raw_data` (JSON) | **Dato sanitario** (contiene tutti i dati fisiologici originali) |

**Requisito:** Art. 9(2)(a) richiede **consenso esplicito e specifico** per il trattamento di dati sanitari. Il consenso deve essere:
- Separato dall'accettazione dei ToS
- Specifico per i dati sanitari
- Revocabile in qualsiasi momento
- Documentato (timestamp + versione del testo)

**Cosa implementare:**

1. **Tabella `user_consents`** nel DB:
```sql
CREATE TABLE user_consents (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_type VARCHAR(64) NOT NULL,  -- 'health_data', 'garmin_sync', 'strava_sync', 'marketing', 'terms_v1', 'privacy_v1'
  consent_version VARCHAR(32) NOT NULL, -- 'v1.0', 'v1.1'
  granted BOOLEAN NOT NULL,
  granted_at TIMESTAMP,
  withdrawn_at TIMESTAMP,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, consent_type, consent_version)
);
```

2. **Flusso onboarding post-registrazione** (nuova schermata):
   - Step 1: Accettazione ToS/Privacy (gia presente, ma salvare in `user_consents`)
   - Step 2: Consenso dati salute (separato, con spiegazione chiara)
   - Step 3: Connessione Garmin/Strava (opzionale, con consenso specifico)

3. **Funzionamento degradato senza consenso salute:**
   - Se l'utente non acconsente ai dati sanitari, l'app funziona ma senza HR, calorie, VO2max, stress
   - Sync Garmin importa solo distanza, durata, pace, stile (non i dati fisiologici)

4. **Pagina gestione consensi** in Settings:
   - Mostrare tutti i consensi attivi con data
   - Toggle per revocare ciascuno
   - Conseguenze chiare della revoca

### 2.2 CRITICA - Cookie banner assente (Linee Guida Garante 10/06/2021)

**Stato attuale:** Zero meccanismi di consenso cookie. L'app usa:

| Cookie/Storage | Tipo | Consenso necessario? |
|---|---|---|
| `app_session_id` (httpOnly JWT) | Strettamente necessario | No |
| `sidebar_state` (document.cookie, 7 giorni) | Funzionale (preferenza UI) | **Si** (non strettamente necessario) |
| Supabase auth tokens (localStorage) | Strettamente necessario | No |
| `theme` (localStorage) | Funzionale | No (preferenza UX essenziale) |
| `manus-runtime-user-info` (localStorage) | **Problematico** | **Si** - contiene email e dati utente |
| `swimforge:*` keys (localStorage) | Funzionali | No (preferenze UX) |
| Google Fonts (CDN) | **Terza parte** | **Si** - Google riceve IP utente |

**Requisiti Garante (Provvedimento n. 231/2021):**

1. Banner di primo livello con:
   - Descrizione breve degli scopi dei cookie
   - Link alla cookie policy completa
   - Pulsante "Accetta tutti"
   - Pulsante "Rifiuta tutti" **con stessa prominenza** di "Accetta" (no dark pattern)
   - Link "Personalizza" per scelte granulari
   - Identita del titolare del trattamento

2. Secondo livello (pannello preferenze):
   - Categorie: Necessari (non disattivabili), Funzionali, Analytics, Profilazione
   - Per ogni cookie: nome, scopo, durata, prima/terza parte
   - Nessun checkbox pre-selezionato
   - Pulsante "Salva preferenze"

3. Regole Garante:
   - Lo scroll NON vale come consenso
   - Il cookie wall e vietato (non bloccare l'accesso se l'utente rifiuta)
   - Non richiedere nuovamente il consenso per almeno 6 mesi
   - Link persistente nel footer per riaprire le preferenze cookie

**Cosa implementare:**

1. **Componente `<CookieBanner />`** montato alla root dell'app
2. **Cookie policy separata** (documento dedicato, non sezione della Privacy Policy)
3. **Eliminare `manus-runtime-user-info`** da localStorage (sostituire con in-memory state o sessione server-side)
4. **Self-hostare i font** invece di caricarli da Google CDN (elimina il trasferimento di IP a Google)
5. **Registro consensi cookie** (localStorage per lo stato + server per audit)

### 2.3 CRITICA - Account deletion incompleta (Art. 17 GDPR)

**Stato attuale:** `deleteUserAccount()` in `db.ts:965-1087` gestisce esplicitamente solo:
- story_views, story_reactions, stories (+ pulizia ImageKit)
- social_hidden_posts, social_post_reports
- Riga `users` (cascade FK per `swimmer_profiles`, `swimming_activities`)

**Tabelle NON gestite esplicitamente:**

| Tabella | Dati personali | Rischio |
|---|---|---|
| `garmin_tokens` | Email Garmin, token OAuth crittografati | **ALTO** - token OAuth restano in DB |
| `strava_tokens` | Token OAuth, athlete ID, username | **ALTO** - token OAuth restano in DB |
| `xp_transactions` | Storico XP con descrizioni che referenziano azioni utente | MEDIO |
| `user_badges` | Badge guadagnati | BASSO |
| `personal_records` | Record personali di nuoto | MEDIO |
| `weekly_stats` | Statistiche settimanali | MEDIO |
| `ai_insights_cache` | Cache insights AI | BASSO |
| `activity_ai_insights` | Insights AI per attivita | MEDIO |
| `ai_coach_workouts` | Piani allenamento AI | MEDIO |
| `community_club_members` | Appartenenza club | BASSO |
| `club_announcements` | Annunci creati dall'utente | BASSO |
| `post_reactions` | Reazioni ai post | BASSO |
| `direct_messages` | **Messaggi privati** | **ALTO** |
| `user_notifications` | Notifiche | BASSO |
| `event_attendees` | Partecipazione eventi | BASSO |
| `season_activity_predictions` | Previsioni allenamento con target RPE | MEDIO |
| `season_club_quest_claims` | Riscatti quest club | BASSO |
| Post media su ImageKit | Immagini/video dei post | **ALTO** - file restano su ImageKit |
| Avatar/cover su Supabase Storage | Foto profilo | **ALTO** - file restano nello storage |

**Cosa implementare:**

1. **Completare `deleteUserAccount()`** con cancellazione esplicita di tutte le tabelle (non affidarsi a CASCADE che potrebbe non essere configurato)
2. **Revocare token Garmin/Strava** prima della cancellazione (API call per revocare l'accesso)
3. **Cancellare media da ImageKit** (post images/videos, non solo stories)
4. **Cancellare avatar/cover da Supabase Storage**
5. **Grace period 30 giorni** con soft-delete (disattivare account, poi cancellare dopo 30 giorni)
6. **Email di conferma** con riepilogo di cosa verra cancellato e timeline

### 2.4 CRITICA - Consenso registrazione non persistito (Art. 7(1) GDPR)

**Stato attuale:** `Register.tsx:293-311` mostra checkbox "Accetto i Termini di Servizio e la Privacy Policy" ma:
- Il flag `acceptedTerms` e solo uno state React locale
- Non viene salvato in nessuna tabella del DB
- Non c'e timestamp, versione del documento, IP, user agent
- Non c'e modo di dimostrare QUANDO e COSA l'utente ha accettato

**Art. 7(1):** "Qualora il trattamento sia basato sul consenso, il titolare del trattamento deve essere in grado di **dimostrare** che l'interessato ha prestato il proprio consenso."

**Cosa implementare:**
- Al momento della registrazione, creare record in `user_consents` con:
  - `consent_type: 'terms_v1'` e `consent_type: 'privacy_v1'`
  - `granted: true`
  - `granted_at: NOW()`
  - `ip_address` e `user_agent` dalla request
  - `consent_version` che referenzia la versione del documento

### 2.5 ALTA - Privacy Policy con lacune significative

**Lacune rispetto ai requisiti Art. 13/14 GDPR:**

| Requisito Art. 13 | Presente? | Note |
|---|---|---|
| Identita e contatti del titolare | Parziale | Solo email generica, manca indirizzo fisico e PEC |
| Contatti DPO | NO | Placeholder `[Da inserire se applicabile]` |
| Finalita e base giuridica per OGNI trattamento | NO | Elenca finalita ma non la base giuridica specifica |
| Legittimi interessi perseguiti | NO | Non menzionati |
| Destinatari/categorie | Parziale | Lista provider ma incompleta (manca ImageKit, Resend, Rollbar) |
| Trasferimenti extra-UE e garanzie | Parziale | Menziona SCCs ma cita "Privacy Shield" (invalidato nel 2020!) |
| Periodi di conservazione per OGNI categoria | NO | Solo "finche account e attivo" generico |
| Tutti i diritti dell'interessato | Parziale | Manca diritto alla limitazione, diritto di proporre reclamo al Garante con contatti |
| Processo decisionale automatizzato | NO | AI Insights potrebbe qualificarsi |
| Se il conferimento e obbligatorio/volontario | NO | Non specificato |
| Menzione specifica dati sanitari e base Art. 9 | NO | HR, VO2max etc. non menzionati come categoria speciale |
| Contatti del Garante | NO | Obbligatorio menzionare il diritto di reclamo al Garante |

**Provider mancanti dalla Privacy Policy:**

| Provider | Tipo | Dati condivisi |
|---|---|---|
| ImageKit | Processor | Immagini/video utente (stories, post, avatar) |
| Resend | Processor | Email utente (per email transazionali) |
| Rollbar | Processor | Errori server (possono contenere IP, percorsi request) |
| Google Fonts CDN | Terza parte | IP utente ad ogni caricamento pagina |
| Open-Meteo | Terza parte | Query meteo (non dati personali diretti) |

**Errori nella Privacy Policy attuale:**
- Sez. 9: Menziona "Privacy Shield" che e stato invalidato dalla CGUE (Schrems II, luglio 2020)
- Sez. 3.2: Menziona "Manus OAuth" (non piu usato, sostituito da Supabase)
- Sez. 3.2: Menziona "TiDB Cloud" (non piu usato, sostituito da Supabase/PostgreSQL)
- Sez. 10: Eta minima 13 anni (deve essere **14** per l'Italia, Art. 2-quinquies Codice Privacy)

### 2.6 ALTA - Cookie Policy inesistente

La Privacy Policy sez. 7 menziona cookie in 4 righe generiche. Il Garante italiano richiede una **cookie policy separata e dettagliata**.

**Cosa implementare:**

Creare `COOKIE_POLICY.md` e pagina `/cookies` con:

1. **Inventario completo** di tutti i cookie e storage mechanisms:
```
Cookie strettamente necessari:
- app_session_id: sessione autenticazione, httpOnly, durata sessione, prima parte
- sb-*: token Supabase auth, localStorage, durata sessione, prima parte

Storage funzionale:
- theme: preferenza tema, localStorage, permanente, prima parte
- swimforge:*: preferenze UI, localStorage, permanente, prima parte

Cookie funzionali (consenso richiesto):
- sidebar_state: stato sidebar, document.cookie, 7 giorni, prima parte

Risorse terze parti:
- Google Fonts: caricamento font, IP trasmesso a Google (da eliminare self-hostando)
```

2. **Istruzioni** per gestione cookie nei principali browser
3. **Link** alle cookie policy dei terzi (Google, Supabase)
4. **Meccanismo** per revocare il consenso (link persistente nel footer)

### 2.7 ALTA - Eta minima errata (Art. 2-quinquies Codice Privacy)

**Stato attuale:**
- ToS sez. 3: "Avere almeno **13 anni**"
- Privacy Policy sez. 10: "utenti di eta inferiore a **13 anni**"
- `Register.tsx`: Nessun age gate implementato (nessun campo data di nascita obbligatorio alla registrazione)

**Requisito italiano:** Art. 2-quinquies del Codice Privacy fissa l'eta minima a **14 anni** per i servizi della societa dell'informazione. Sotto i 14 serve il consenso del genitore/tutore.

**Cosa implementare:**

1. **Aggiornare ToS e Privacy Policy** a 14 anni
2. **Age gate alla registrazione:**
   - Campo data di nascita obbligatorio
   - Se eta < 14: bloccare registrazione con messaggio "Devi avere almeno 14 anni..."
   - Se eta 14-17: registrazione consentita con nota sulle tutele aggiuntive
   - Se eta >= 18: registrazione standard
3. **Salvare `birth_date`** in `swimmer_profiles` (colonna gia esistente nello schema)
4. **Verifiche periodiche** se i dati sono coerenti

### 2.8 ALTA - Trasferimenti extra-UE senza garanzie adeguate (Art. 44-49)

**Analisi dei trasferimenti:**

| Servizio | Sede | Dati trasferiti | Meccanismo attuale | Adeguato? |
|---|---|---|---|---|
| Supabase | US (Supabase Inc.) | Auth, DB (se region EU) | Nessun DPA firmato | **NO** |
| Render.com | US | Hosting app, logs | Nessun DPA firmato | **NO** |
| Garmin | US | Token OAuth, dati fitness | Nessuno | **NO** |
| Google Gemini | US | Dati allenamento anonimi | Nessuno | **Parziale** (anonimizzati) |
| ImageKit | India/US | Media utente | Nessun DPA firmato | **NO** |
| Resend | US | Email utente | Nessun DPA firmato | **NO** |
| Rollbar | US | Errori server | Nessun DPA firmato | **NO** |
| Google Fonts CDN | US | IP utente | Nessuno | **NO** |

**Cosa implementare:**

1. **Firmare DPA (Data Processing Agreement)** con:
   - Supabase (ha DPA standard disponibile)
   - Render.com (ha DPA standard disponibile)
   - ImageKit (verificare disponibilita DPA)
   - Resend (ha DPA standard disponibile)
   - Rollbar (ha DPA standard disponibile)

2. **Verificare certificazione EU-US Data Privacy Framework** per:
   - Render.com
   - ImageKit
   - Resend
   - Rollbar

   Se certificati DPF: il trasferimento e lecito (decisione di adeguatezza CE luglio 2023).
   Se NON certificati: servono SCCs (Standard Contractual Clauses) + TIA (Transfer Impact Assessment).

3. **Eliminare Google Fonts CDN** - self-hostare i font per evitare trasferimento IP a Google

4. **Documentare nella Privacy Policy** tutti i trasferimenti con relative garanzie

### 2.9 ALTA - DPIA obbligatoria non effettuata (Art. 35)

Il trattamento su larga scala di dati sanitari (frequenza cardiaca, VO2max, stress, training effect) rende obbligatoria una DPIA.

**Contenuto richiesto:**

1. Descrizione sistematica dei trattamenti
2. Valutazione necessita e proporzionalita
3. Valutazione rischi per i diritti degli interessati
4. Misure di mitigazione

**Cosa implementare:** Documento DPIA interno (vedi sezione 5 di questo report).

### 2.10 ALTA - Registro trattamenti (ROPA) assente (Art. 30)

**Art. 30:** Il titolare mantiene un registro delle attivita di trattamento. L'esenzione per le organizzazioni con meno di 250 dipendenti **NON si applica** quando si trattano dati sanitari.

**Cosa implementare:** Documento ROPA interno (vedi sezione 6 di questo report).

### 2.11 MEDIA - localStorage con dati personali non protetti

**`manus-runtime-user-info`** (`useAuth.ts:45`): Ad ogni render del componente Auth, i dati utente (inclusa email) vengono serializzati in localStorage. Problemi:
- Nessuna scadenza
- Nessuna pulizia al logout
- Accessibile da qualsiasi script sulla pagina (XSS risk)
- Non documentato nella cookie/privacy policy

**Cosa implementare:**
- Eliminare `manus-runtime-user-info` da localStorage
- Usare in-memory state (React context) o session storage (si pulisce alla chiusura tab)
- Se necessario per persistenza, usare un token opaco invece dei dati in chiaro

### 2.12 MEDIA - Privacy settings non applicate in tutte le query

**Stato attuale:** `swimmer_profiles.privacy_settings` contiene `profilePublic`, `activitiesPublic`, `showLeaderboards` ma il report `2026-02-16-full-app-analysis.md` segnala che queste impostazioni non sono applicate in tutte le query.

**Cosa implementare:**
- Audit di tutte le query che espongono dati utente ad altri utenti
- Applicare i filtri `privacySettings` in: leaderboard, profili pubblici, feed sociale, ricerca utenti
- Test per verificare che un utente con profilo privato non compaia in query pubbliche

### 2.13 MEDIA - Direct messages senza protezione adeguata

**Stato attuale:** I messaggi diretti sono salvati in chiaro nella tabella `direct_messages`. Non sono inclusi nella cancellazione esplicita dell'account.

**Cosa implementare:**
- Includere `direct_messages` nella procedura di cancellazione account
- Quando un utente cancella il proprio account, decidere la politica: cancellare i messaggi o anonimizzarli (mostrare "Utente eliminato" al destinatario)
- Considerare encryption at rest per i DM

### 2.14 BASSA - Nessun piano di risposta alle violazioni (Art. 33-34)

**Requisito:** Notifica al Garante entro 72 ore dalla scoperta di una violazione. Notifica agli interessati se rischio elevato.

**Cosa implementare:**
- Documento interno "Breach Response Plan"
- Template di notifica al Garante (via portale https://servizi.gpdp.it/databreach/s/)
- Template di notifica agli utenti
- Registro interno delle violazioni (anche quelle non notificate)
- Processo di escalation e responsabilita

### 2.15 BASSA - Nessun DPO designato (Art. 37)

**Analisi:** Un DPO e obbligatorio per il trattamento su larga scala di dati sanitari. Per un'app in fase iniziale con pochi utenti, potrebbe non essere "larga scala", ma e fortemente consigliato designarne uno (anche esterno) per:
- Dimostrare accountability
- Avere un punto di contatto per il Garante
- Gestire le richieste degli interessati

**Cosa implementare:**
- Valutare la designazione di un DPO esterno
- Se designato, notificarlo al Garante
- Inserire i contatti del DPO nella Privacy Policy

---

## 3. Piano di implementazione tecnica

### Fase 1: URGENTE - Consenso dati sanitari + Registro consensi (1-2 settimane)

**Backend:**
1. Creare tabella `user_consents` (schema Drizzle)
2. Creare endpoints tRPC:
   - `consent.grant` - registrare un consenso
   - `consent.withdraw` - revocare un consenso
   - `consent.list` - elencare consensi attivi dell'utente
3. Middleware che verifica il consenso `health_data` prima di servire dati sanitari

**Frontend:**
1. Schermata onboarding post-registrazione con consenso salute separato
2. Sezione "Gestione consensi" in Settings con toggle per ogni consenso
3. Salvare consenso ToS/Privacy alla registrazione con versione e timestamp

**Tipi di consenso da tracciare:**
- `terms_acceptance` - accettazione ToS (obbligatoria per usare il servizio)
- `privacy_policy` - presa visione Privacy Policy (obbligatoria)
- `health_data_processing` - trattamento dati sanitari (opzionale, Art. 9)
- `garmin_sync` - sincronizzazione dati Garmin (opzionale)
- `strava_sync` - sincronizzazione dati Strava (opzionale)
- `marketing_communications` - comunicazioni promozionali (opzionale)
- `cookie_analytics` - cookie analitici (opzionale, quando implementati)

### Fase 2: URGENTE - Cookie banner + Cookie policy (1 settimana)

1. Creare componente `<CookieBanner />`:
   - Primo livello: banner con Accept/Reject/Personalizza
   - Secondo livello: pannello granulare per categorie
   - Salvare scelta in `localStorage` (per stato) + `user_consents` (per audit)
   - Link persistente nel footer per riaprire preferenze

2. Creare pagina `/cookies` con cookie policy dettagliata

3. Self-hostare font Inter, Rajdhani, Geist Mono (eliminare Google Fonts CDN)

4. Eliminare `manus-runtime-user-info` da localStorage

5. Rimuovere cookie `sidebar_state` (spostare in localStorage, che non richiede consenso per preferenze funzionali)

### Fase 3: ALTA - Completare account deletion (3-5 giorni)

1. Estendere `deleteUserAccount()` con cancellazione esplicita di TUTTE le tabelle:
   ```
   Ordine di cancellazione (rispettare FK):
   1. season_activity_predictions
   2. season_club_quest_claims
   3. story_views, story_reactions, stories (+ ImageKit cleanup)
   4. post_reactions
   5. social_comments
   6. social_posts (+ ImageKit cleanup per media)
   7. social_follows
   8. social_hidden_posts, social_post_reports
   9. direct_messages
   10. user_notifications
   11. event_attendees
   12. club_announcements
   13. community_club_members
   14. club_media (+ cleanup storage)
   15. user_badges
   16. personal_records
   17. weekly_stats
   18. ai_insights_cache, activity_ai_insights
   19. ai_coach_workouts
   20. xp_transactions
   21. garmin_tokens (+ revoca token via API Garmin)
   22. strava_tokens (+ revoca token via API Strava)
   23. swimmer_profiles (+ cleanup avatar/cover da storage)
   24. user_consents
   25. users
   26. Supabase Auth user deletion
   ```

2. Implementare grace period di 30 giorni:
   - Soft-delete: impostare flag `deletion_requested_at` sul profilo
   - Disattivare l'account (non cancellare)
   - Cron job giornaliero che cancella gli account con `deletion_requested_at` > 30 giorni fa
   - Email di conferma con possibilita di annullare entro 30 giorni

### Fase 4: ALTA - Aggiornare documenti legali (1 settimana)

**Privacy Policy - riscrittura completa:**
1. Aggiungere identita completa del titolare (nome, indirizzo, PEC, P.IVA)
2. Aggiungere contatti DPO (se designato)
3. Tabella esplicita: dato -> finalita -> base giuridica -> periodo di conservazione
4. Sezione dedicata ai dati sanitari (Art. 9) con base giuridica
5. Lista completa dei destinatari/processor (aggiungere ImageKit, Resend, Rollbar)
6. Rimuovere riferimento a "Privacy Shield" (invalidato)
7. Rimuovere riferimento a "Manus OAuth" e "TiDB Cloud" (non piu usati)
8. Aggiungere contatti Garante: "Garante per la protezione dei dati personali, Piazza Venezia n. 11, 00187 Roma, www.garanteprivacy.it"
9. Aggiungere sezione processo decisionale automatizzato (AI Insights)
10. Aggiungere periodi di conservazione specifici per ogni categoria
11. Aggiungere se il conferimento e obbligatorio/volontario per ogni dato

**Terms of Service:**
1. Aggiornare eta minima da 13 a **14 anni**
2. Aggiungere riferimento al Codice del Consumo (D.Lgs 206/2005) per clausole B2C
3. Rimuovere clausola "rinuncia ad azioni collettive" (non valida in Italia per consumatori)
4. Aggiungere ADR/ODR per risoluzione controversie online (Reg. UE 524/2013)

### Fase 5: ALTA - Trasferimenti internazionali (1-2 settimane)

1. Firmare DPA con tutti i processor (Supabase, Render, ImageKit, Resend, Rollbar)
2. Verificare certificazione DPF per ciascuno
3. Se non DPF: implementare SCCs + TIA
4. Documentare tutto nella Privacy Policy aggiornata
5. Verificare che Supabase usi region EU per il database

### Fase 6: MEDIA - Age gate alla registrazione (2-3 giorni)

1. Aggiungere campo data di nascita obbligatorio a `Register.tsx`
2. Validazione frontend: bloccare se eta < 14
3. Validazione backend: verificare eta nel mutation di registrazione
4. Salvare `birth_date` in `swimmer_profiles`

### Fase 7: MEDIA - DPIA e ROPA (1 settimana, documenti interni)

1. Redigere DPIA (vedi sezione 5)
2. Redigere ROPA (vedi sezione 6)
3. Redigere Breach Response Plan
4. Redigere Legitimate Interest Assessments (per ogni trattamento basato su legittimo interesse)

### Fase 8: BASSA - Miglioramenti aggiuntivi (ongoing)

1. Audit delle privacy settings non applicate nelle query
2. Encryption at rest per direct messages
3. Data retention automation (cron job per pulizia dati oltre i periodi definiti)
4. Anonimizzazione dati in statistiche aggregate
5. Privacy dashboard utente (riepilogo visivo di tutti i dati e consensi)

---

## 4. Periodi di conservazione raccomandati

| Categoria dati | Periodo | Base giuridica | Note |
|---|---|---|---|
| Dati account (nome, email) | Durata account + 30 giorni grace | Contratto | Cancellare dopo grace period |
| Attivita nuoto (distanza, pace, stile) | Durata account | Contratto | Core del servizio |
| Dati sanitari (HR, VO2max, stress) | Durata consenso (revoca = cancellazione entro 30gg) | Consenso esplicito Art. 9 | Cancellare prontamente alla revoca |
| Post/commenti social | Durata account (o cancellazione utente) | Contratto | Utente puo cancellare singolarmente |
| Messaggi diretti | Durata account | Contratto | Cancellare alla deletion |
| Media (foto, video) | Durata account (stories: 24h) | Contratto/Consenso | Pulizia ImageKit alla deletion |
| Token Garmin/Strava | Durata connessione | Consenso | Revocare e cancellare alla disconnessione |
| Consensi registrati | 5 anni dalla revoca | Legittimo interesse (difesa legale) | Necessari per dimostrare conformita |
| Log di sicurezza/accesso | 6-12 mesi | Legittimo interesse (sicurezza) | Rotazione automatica |
| Cache AI Insights | 24 ore | Contratto | Gia implementato |
| Account cancellati | Purge entro 30 giorni | Art. 17 | Grace period poi cancellazione totale |
| Backup contenenti dati personali | Max 90 giorni | Necessita tecnica | Documentare rotazione backup |
| Dati aggregati/anonimizzati | Illimitato | Non sono dati personali | Solo se realmente anonimi |

---

## 5. Struttura DPIA (da redigere)

```
1. DESCRIZIONE DEL TRATTAMENTO
   1.1 Natura: App social fitness per nuotatori
   1.2 Ambito: Dati personali e sanitari di utenti registrati
   1.3 Contesto: App web B2C, target primario Italia
   1.4 Finalita: Gamification, tracking attivita, social, AI insights
   1.5 Flusso dati: [diagramma raccolta -> storage -> processing -> sharing -> deletion]

2. NECESSITA E PROPORZIONALITA
   2.1 Base giuridica per ogni trattamento
   2.2 Minimizzazione: quali dati sono strettamente necessari?
   2.3 Conservazione: periodi definiti e giustificati
   2.4 Qualita dei dati: meccanismi di rettifica

3. RISCHI PER GLI INTERESSATI
   3.1 Violazione dati sanitari - Probabilita: Media, Gravita: Alta
   3.2 Accesso non autorizzato a fitness data - Probabilita: Media, Gravita: Media
   3.3 Compromissione token Garmin - Probabilita: Bassa, Gravita: Alta
   3.4 Uso improprio dati social (stalking) - Probabilita: Media, Gravita: Alta
   3.5 Consenso insufficiente per dati sanitari - Probabilita: Media, Gravita: Alta
   3.6 Trasferimento dati verso US senza garanzie - Probabilita: Media, Gravita: Media
   3.7 Conservazione oltre il necessario - Probabilita: Media, Gravita: Bassa
   3.8 Minori senza consenso genitoriale - Probabilita: Media, Gravita: Media

4. MISURE DI MITIGAZIONE
   4.1 Tecniche: encryption, RLS, auth, CSP, input validation
   4.2 Organizzative: DPO, breach response plan, training
   4.3 Contrattuali: DPA con processor, SCCs
   4.4 Consenso: granulare, documentato, revocabile
```

---

## 6. Struttura ROPA (da redigere)

Per ogni attivita di trattamento, documentare:

```
ATTIVITA: Registrazione utente
- Titolare: [Nome azienda], [Indirizzo], [PEC]
- DPO: [Contatti]
- Categorie interessati: Utenti registrati
- Categorie dati: Nome, email, password hash, data nascita
- Finalita: Erogazione servizio
- Base giuridica: Art. 6(1)(b) - Contratto
- Destinatari: Supabase (auth), Render (hosting)
- Trasferimenti extra-UE: US (Supabase, Render) con DPF/SCCs
- Conservazione: Durata account + 30 giorni
- Misure sicurezza: bcrypt, HTTPS, httpOnly cookie, Supabase RLS

ATTIVITA: Sincronizzazione Garmin
- Categorie dati: Token OAuth, email Garmin, attivita nuoto, HR, VO2max, calorie
- Finalita: Importazione automatica attivita
- Base giuridica: Art. 9(2)(a) - Consenso esplicito (dati sanitari)
- Destinatari: Garmin (fonte dati), Supabase (storage)
- Conservazione: Durata connessione per token, durata account per attivita
- Misure sicurezza: AES-256-GCM per token, HTTPS

[... ripetere per ogni attivita di trattamento]
```

---

## 7. Checklist implementazione

### Prima di andare live (bloccanti)
- [ ] Consenso esplicito dati sanitari (Art. 9) con registro in DB
- [ ] Cookie banner conforme a linee guida Garante 2021
- [ ] Cookie policy separata e dettagliata
- [ ] Privacy Policy riscritta con tutte le informazioni Art. 13
- [ ] Eta minima corretta a 14 anni con age gate
- [ ] Account deletion completa (tutte le tabelle + media + token revocation)
- [ ] Registro consensi (`user_consents` table)
- [ ] DPA firmato con Supabase
- [ ] DPA firmato con Render.com
- [ ] Self-hosting font (rimuovere Google Fonts CDN)

### Entro 30 giorni dal lancio
- [ ] DPA firmato con ImageKit, Resend, Rollbar
- [ ] Verifica certificazione DPF per tutti i processor US
- [ ] DPIA completata
- [ ] ROPA completato
- [ ] Breach Response Plan documentato
- [ ] Rimuovere `manus-runtime-user-info` da localStorage
- [ ] Applicare privacy settings in tutte le query
- [ ] Terms of Service aggiornato (eta, clausole IT)
- [ ] Grace period 30 giorni per account deletion

### Entro 90 giorni
- [ ] Valutazione designazione DPO
- [ ] Data retention automation (cron job pulizia)
- [ ] Legitimate Interest Assessments documentati
- [ ] Privacy dashboard utente
- [ ] Audit sicurezza
- [ ] Test di conformita end-to-end

---

## 8. File coinvolti nell'implementazione

| File | Tipo modifica |
|---|---|
| `drizzle/schema.ts` | Aggiungere tabella `user_consents`, campo `deletion_requested_at` |
| `server/routers/auth.router.ts` | Salvare consenso alla registrazione, migliorare deletion |
| `server/db.ts` | Completare `deleteUserAccount()` con tutte le tabelle |
| `client/src/pages/Register.tsx` | Age gate, salvare consenso in DB |
| `client/src/pages/Settings.tsx` | Sezione gestione consensi, grace period deletion |
| `client/src/pages/Privacy.tsx` | Aggiornare contenuto Privacy Policy |
| `client/src/pages/Terms.tsx` | Aggiornare contenuto ToS |
| **NUOVO** `client/src/pages/CookiePolicy.tsx` | Pagina cookie policy |
| **NUOVO** `client/src/components/CookieBanner.tsx` | Banner + pannello preferenze |
| **NUOVO** `server/routers/consent.router.ts` | Endpoints gestione consensi |
| `client/src/_core/hooks/useAuth.ts` | Rimuovere `manus-runtime-user-info` |
| `client/src/components/ui/sidebar.tsx` | Spostare `sidebar_state` da cookie a localStorage |
| `client/index.html` | Rimuovere Google Fonts CDN, usare font self-hosted |
| `client/src/index.css` | Aggiornare `@font-face` per font self-hosted |
| `PRIVACY_POLICY.md` | Riscrittura completa |
| `TERMS_OF_SERVICE.md` | Aggiornamento eta, clausole IT |
| `client/src/content/legal/privacy.md` | Sincronizzare con PRIVACY_POLICY.md |
| `client/src/content/legal/terms.md` | Sincronizzare con TERMS_OF_SERVICE.md |
| **NUOVO** `client/src/content/legal/cookies.md` | Contenuto cookie policy |
| **NUOVO** `docs/internal/DPIA.md` | Documento DPIA (interno) |
| **NUOVO** `docs/internal/ROPA.md` | Registro trattamenti (interno) |
| **NUOVO** `docs/internal/breach-response-plan.md` | Piano risposta violazioni (interno) |
| `client/src/App.tsx` | Aggiungere rotta `/cookies`, onboarding consent |

---

## 9. Riferimenti normativi

| Norma | Articoli chiave |
|---|---|
| Regolamento UE 2016/679 (GDPR) | Art. 5-9, 12-23, 25, 30, 32-35, 37, 44-49 |
| D.Lgs 196/2003 (Codice Privacy) | Art. 2-ter, 2-quinquies (eta 14), 2-sexies, 2-septies, 122 (cookie), 130 (marketing) |
| D.Lgs 101/2018 | Adeguamento Codice Privacy al GDPR |
| D.Lgs 206/2005 (Codice del Consumo) | Clausole abusive B2C, ADR |
| Provvedimento Garante n. 231/2021 | Linee guida cookie (10 giugno 2021) |
| Decisione CE 2023/1795 | Adeguatezza EU-US Data Privacy Framework |
| Reg. UE 524/2013 | Risoluzione dispute online (ODR) |
| Garante portale data breach | https://servizi.gpdp.it/databreach/s/ |
| Garante contatti | Piazza Venezia 11, 00187 Roma - www.garanteprivacy.it |
