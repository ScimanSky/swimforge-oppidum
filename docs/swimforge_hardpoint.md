'''
# Hardpoint Tecnico: SwimForge

**Autore**: Manus AI
**Data**: 24 Gennaio 2026
**Versione**: 1.0

---

## 1. Introduzione al Progetto

### 1.1. Cos'è SwimForge?

**SwimForge** è un'applicazione web e mobile gamificata, progettata specificamente per la community di nuotatori. L'obiettivo primario del progetto è trasformare l'allenamento solitario del nuoto in un'esperienza sociale, competitiva e motivante. Sincronizzando i dati direttamente dai dispositivi Garmin, SwimForge offre agli atleti una piattaforma centralizzata per tracciare le proprie performance, analizzare i progressi, e confrontarsi con amici e altri nuotatori attraverso un sistema di sfide e classifiche.

L'applicazione si rivolge a un vasto pubblico di nuotatori, dagli amatori che cercano una motivazione extra ai professionisti che desiderano uno strumento avanzato per monitorare i propri allenamenti in modo più coinvolgente. SwimForge non è solo un aggregatore di dati, ma un vero e proprio ecosistema sociale che incoraggia la costanza, premia i risultati e costruisce una community basata sulla passione per il nuoto.

### 1.2. Missione e Obiettivi

La missione di SwimForge è **rendere ogni nuotata un'avventura**. Gli obiettivi principali del progetto sono:

- **Motivare**: Fornire strumenti di gamification (badge, livelli XP, sfide) per incentivare gli utenti a nuotare più spesso e a superare i propri limiti.
- **Connettere**: Creare una piattaforma dove i nuotatori possono interagire, competere in modo sano e condividere i propri successi, superando l'isolamento tipico di questo sport.
- **Analizzare**: Offrire dashboard intuitive e statistiche dettagliate per aiutare gli utenti a comprendere le proprie performance e a identificare aree di miglioramento.
- **Premiare**: Riconoscere e celebrare i traguardi raggiunti attraverso un sistema di ricompense virtuali (badge, XP) che aumentano il senso di appartenenza e il prestigio all'interno della community.

---

''')) # Inizio del documento hardpoint. La prossima sezione sarà sulle funzionalità utente. 游泳的乐趣！ (Il divertimento del nuoto!) 🏊‍♂️✨. L

## 2. Funzionalità Utente e User Journey

SwimForge offre un'esperienza utente completa e coinvolgente, che accompagna il nuotatore dal momento della registrazione fino al raggiungimento dei suoi obiettivi più ambiziosi. L'interfaccia è progettata per essere intuitiva e accessibile, sia su desktop che su mobile.

### 2.1. User Journey

1.  **Registrazione e Onboarding**: L'utente si registra e collega il proprio account Garmin. I dati storici vengono sincronizzati per calcolare il livello XP iniziale e assegnare i primi badge.
2.  **Dashboard Personale**: L'utente atterra sulla sua dashboard, dove ha una visione d'insieme delle sue statistiche, delle sfide attive e degli ultimi badge guadagnati.
3.  **Esplorazione Sfide**: L'utente naviga nella sezione "Sfide", dove può vedere tutte le sfide attive create dalla community. Può filtrare per tipo di obiettivo e unirsi a quelle che lo interessano.
4.  **Partecipazione e Competizione**: Una volta iscritto a una sfida, l'utente nuota e sincronizza le sue attività con Garmin. Il progresso nella sfida viene aggiornato automaticamente. Può controllare la leaderboard in tempo reale per vedere la sua posizione.
5.  **Guadagno di Badge e XP**: Ogni attività, ogni sfida completata e ogni traguardo raggiunto fanno guadagnare all'utente XP e badge. I badge sono di due tipi: **badge achievement** (per traguardi specifici) e **badge profilo** (che rappresenta il livello di esperienza dell'utente).
6.  **Analisi Performance**: L'utente può analizzare le sue attività passate, visualizzare grafici e statistiche dettagliate per monitorare i suoi miglioramenti nel tempo.

### 2.2. Funzionalità Principali

| Funzionalità | Descrizione | Stato Attuale |
| :--- | :--- | :--- |
| **Sincronizzazione Garmin** | Sincronizzazione automatica delle attività di nuoto da Garmin Connect. | ✅ **Implementato** |
| **Dashboard Personale** | Visione d'insieme di statistiche, sfide attive, badge recenti e livello XP. | ✅ **Implementato** |
| **Sistema di Sfide** | Creazione e partecipazione a sfide basate su vari obiettivi (distanza, tempo, ecc.). Include leaderboard in tempo reale. | ✅ **Implementato** |
| **Sistema di Badge** | Assegnazione di badge per traguardi specifici (es. "Nuota 10km totali") e badge profilo basati su livelli XP. | ✅ **Implementato** |
| **Livelli XP** | Sistema di progressione basato su punti esperienza guadagnati tramite attività e badge. | ✅ **Implementato** |
| **Classifica Globale** | Leaderboard generale basata su XP totali o altre metriche. | ⬜️ **Da implementare** |
| **Notifiche** | Notifiche per eventi importanti (nuovo partecipante a una sfida, sfida in scadenza, ecc.). | ⬜️ **Da implementare** |

---

## 3. Architettura Tecnica e Stack Tecnologico

SwimForge è costruito su uno stack tecnologico moderno e robusto, progettato per garantire scalabilità, performance e una user experience fluida. L'architettura è basata su un modello **monorepo** gestito con `pnpm workspaces`, che permette di mantenere frontend, backend e codice condiviso in un unico repository, semplificando la gestione delle dipendenze e il deployment.

### 3.1. Stack Tecnologico

| Componente | Tecnologia | Motivazione |
| :--- | :--- | :--- |
| **Frontend** | React (con Vite), TypeScript, Tailwind CSS | Sviluppo rapido, UI reattiva, type safety e styling efficiente. |
| **Backend** | Node.js, Express, tRPC | API leggere e performanti, con type safety end-to-end grazie a tRPC. |
| **Database** | PostgreSQL (gestito da Supabase) | Database relazionale potente e affidabile, con le funzionalità aggiuntive di Supabase (Auth, Storage, ecc.). |
| **ORM** | Drizzle ORM | ORM leggero e performante, con un'ottima integrazione con TypeScript e PostgreSQL. |
| **Deployment** | Render | Piattaforma di cloud hosting che semplifica il deployment di applicazioni full-stack, con build e deploy automatici da GitHub. |
| **Autenticazione** | Gestita dal backend con JWT | Controllo completo sul flusso di autenticazione e maggiore flessibilità rispetto a soluzioni di terze parti. |

### 3.2. Flusso dei Dati

1.  **Sincronizzazione Garmin**: Un webhook riceve le notifiche da Garmin Connect. Il backend recupera i dati delle nuove attività e li salva nel database PostgreSQL.
2.  **Interazione Utente**: Il frontend React comunica con il backend tramite tRPC, inviando richieste per recuperare dati (es. lista sfide, profilo utente) o per eseguire azioni (es. unirsi a una sfida).
3.  **Logica di Business**: Il backend Node.js gestisce tutta la logica di business: calcolo progresso sfide, assegnazione badge, aggiornamento XP, ecc.
4.  **Accesso al Database**: Il backend utilizza Drizzle ORM per interagire con il database PostgreSQL, garantendo query sicure e performanti.

---

## 4. Implementazione Dettagliata dei Sistemi Principali

### 4.1. Sistema di Sfide

Il sistema di sfide è il cuore dell'esperienza di SwimForge. È stato progettato per essere flessibile, scalabile e completamente automatizzato.

-   **Creazione Sfide**: Gli utenti possono creare sfide personalizzate, definendo nome, descrizione, tipo di attività (piscina, acque libere, entrambi), obiettivo (distanza totale, numero sessioni, ecc.), e durata.
-   **Stato Sfide**: Le sfide hanno tre stati: `pending` (in attesa di iniziare), `active` (in corso), e `completed` (terminate). Un cron job aggiorna automaticamente lo stato delle sfide in base alle date di inizio e fine.
-   **Partecipazione**: Qualsiasi utente può unirsi a una sfida attiva. Il creatore della sfida viene aggiunto automaticamente come partecipante.
-   **Calcolo Progresso**: Dopo ogni sincronizzazione Garmin, il progresso di ogni partecipante viene ricalcolato, considerando solo le attività svolte nel periodo della sfida. Questo garantisce la correttezza delle classifiche.
-   **Completamento Automatico**: Un cron job orario controlla le sfide terminate, determina il vincitore (rank 1 nella leaderboard), gli assegna un badge "epic" personalizzato e 500 XP, e aggiorna lo stato della sfida a `completed`.

### 4.2. Sistema di Badge e XP

Il sistema di gamification è progettato per premiare la costanza e i risultati degli utenti.

-   **Badge Achievement**: Badge assegnati per il raggiungimento di traguardi specifici (es. "Nuota 100km totali", "Completa 10 sfide"). Ogni badge ha un requisito specifico e un valore in XP.
-   **Badge Profilo**: 7 livelli di badge profilo (Novizio, Principiante, Intermedio, Avanzato, Esperto, Maestro, Leggenda) che rappresentano il livello di esperienza dell'utente. Vengono assegnati automaticamente in base all'XP totale e sono visibili nella leaderboard delle sfide.
-   **Punti Esperienza (XP)**: Gli utenti guadagnano XP per ogni attività di nuoto (1 XP per ogni 100 metri), per ogni badge achievement guadagnato, e per aver vinto una sfida.
-   **Ricalcolo Badge**: Endpoint admin per ricalcolare tutti i badge di un utente, utile per fixare eventuali discrepanze o per assegnare badge guadagnati prima dell'implementazione di una nuova feature.

### 4.3. Sicurezza: Row Level Security (RLS)

Per garantire la sicurezza dei dati, è stato implementato Row Level Security (RLS) su tutte le tabelle sensibili nel database Supabase. Le policy RLS garantiscono che:

-   Il backend (che usa un service role) abbia accesso completo a tutti i dati.
-   Gli utenti autenticati possano solo leggere i dati, ma non modificarli direttamente dal client.
-   Gli utenti non autenticati non abbiano alcun accesso ai dati.

Questo previene accessi non autorizzati e garantisce l'integrità dei dati.

---

## 5. Diagrammi e Schema Database

### 5.1. Diagramma dell'Architettura

Il seguente diagramma illustra l'architettura full-stack di SwimForge e il flusso dei dati, dalla sincronizzazione del dispositivo Garmin all'interazione dell'utente con l'applicazione.

![Diagramma dell'Architettura di SwimForge](swimforge_architecture.png)

### 5.2. Schema del Database

Lo schema del database è stato progettato per essere il più normalizzato possibile, garantendo l'integrità dei dati e l'efficienza delle query. Di seguito sono elencate le tabelle principali e le loro relazioni.

```sql
-- Tabella Utenti
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabella Profili Nuotatori
CREATE TABLE swimmer_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id),
    total_xp INT DEFAULT 0,
    profile_badge_id INT REFERENCES profile_badges(id),
    garmin_user_id VARCHAR(255) UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabella Attività di Nuoto
CREATE TABLE swimming_activities (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    garmin_activity_id BIGINT UNIQUE,
    activity_date TIMESTAMPTZ NOT NULL,
    distance_meters INT NOT NULL,
    duration_seconds INT NOT NULL,
    avg_pace_per_100m INT,
    activity_type VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabella Sfide
CREATE TABLE challenges (
    id SERIAL PRIMARY KEY,
    creator_id UUID REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    objective_type VARCHAR(50) NOT NULL, -- total_distance, total_sessions, etc.
    objective_value INT NOT NULL,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- pending, active, completed
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabella Partecipanti Sfide
CREATE TABLE challenge_participants (
    challenge_id INT REFERENCES challenges(id),
    user_id UUID REFERENCES users(id),
    progress INT DEFAULT 0,
    rank INT,
    PRIMARY KEY (challenge_id, user_id)
);

-- Tabella Badge (Achievement e Profilo)
CREATE TABLE badges (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    badge_image_url TEXT,
    badge_type VARCHAR(50) NOT NULL, -- achievement, profile, epic
    requirement_type VARCHAR(50),
    requirement_value INT,
    xp_reward INT DEFAULT 0,
    color VARCHAR(7)
);

-- Tabella Badge Utente (Badge Guadagnati)
CREATE TABLE user_badges (
    user_id UUID REFERENCES users(id),
    badge_id INT REFERENCES badges(id),
    earned_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, badge_id)
);
```

---
## 6. Endpoint API (tRPC)

SwimForge utilizza tRPC per garantire type-safety end-to-end tra frontend e backend. Di seguito sono elencati i principali endpoint API organizzati per router.

### 6.1. Router Profilo

| Endpoint | Tipo | Descrizione | Parametri |
|----------|------|-------------|-----------|
| `profile.getProfile` | Query | Recupera il profilo dell'utente autenticato | - |
| `profile.updateProfile` | Mutation | Aggiorna il profilo dell'utente | `username`, `email` |
| `profile.getUserStats` | Query | Recupera le statistiche dell'utente (distanza totale, sessioni, XP) | - |

### 6.2. Router Attività

| Endpoint | Tipo | Descrizione | Parametri |
|----------|------|-------------|-----------|
| `activities.getAll` | Query | Recupera tutte le attività di nuoto dell'utente | - |
| `activities.getById` | Query | Recupera una singola attività per ID | `activityId` |
| `activities.getRecent` | Query | Recupera le ultime N attività dell'utente | `limit` |

### 6.3. Router Badge

| Endpoint | Tipo | Descrizione | Parametri |
|----------|------|-------------|-----------|
| `badges.getAll` | Query | Recupera tutti i badge disponibili | - |
| `badges.getUserBadges` | Query | Recupera i badge guadagnati dall'utente | - |
| `badges.getProfileBadges` | Query | Recupera tutti i badge profilo (7 livelli) | - |
| `badges.getUserProfileBadge` | Query | Recupera il badge profilo corrente dell'utente | - |

### 6.4. Router Sfide

| Endpoint | Tipo | Descrizione | Parametri |
|----------|------|-------------|-----------|
| `challenges.getAll` | Query | Recupera tutte le sfide pubbliche | - |
| `challenges.getById` | Query | Recupera una sfida per ID con leaderboard | `challengeId` |
| `challenges.create` | Mutation | Crea una nuova sfida | `name`, `description`, `objectiveType`, `objectiveValue`, `startDate`, `endDate` |
| `challenges.join` | Mutation | Unisciti a una sfida | `challengeId` |
| `challenges.leave` | Mutation | Abbandona una sfida | `challengeId` |
| `challenges.getUserChallenges` | Query | Recupera le sfide a cui l'utente partecipa | - |

### 6.5. Router Admin

| Endpoint | Tipo | Descrizione | Parametri |
|----------|------|-------------|-----------|
| `admin.recalculateBadges` | Mutation | Ricalcola tutti i badge dell'utente | - |
| `admin.initializeProfileBadges` | Mutation | Inizializza i 7 badge profilo nel database | - |
| `admin.recalculateChallengeProgress` | Mutation | Ricalcola il progresso di tutte le sfide attive | - |
| `admin.completeExpiredChallenges` | Mutation | Completa manualmente le sfide scadute (normalmente fatto dal cron) | - |

---

## 7. Setup e Deployment

### 7.1. Prerequisiti

Prima di iniziare, assicurati di avere installato:

- Node.js (v22.13.0 o superiore)
- pnpm (package manager)
- Un account Supabase (per il database PostgreSQL)
- Un account Garmin Developer (per l'integrazione Garmin Connect)
- Un account Render (per il deployment)

### 7.2. Setup Locale

Per eseguire SwimForge in locale, segui questi passaggi:

```bash
# 1. Clona il repository
git clone https://github.com/your-username/swimforge-oppidum.git
cd swimforge-oppidum

# 2. Installa le dipendenze
pnpm install

# 3. Configura le variabili d'ambiente
# Crea un file .env nella root del progetto con le seguenti variabili:
# DATABASE_URL=your_supabase_database_url
# SUPABASE_URL=your_supabase_url
# SUPABASE_ANON_KEY=your_supabase_anon_key
# SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
# GARMIN_CONSUMER_KEY=your_garmin_consumer_key
# GARMIN_CONSUMER_SECRET=your_garmin_consumer_secret
# SESSION_SECRET=your_session_secret

# 4. Esegui le migrazioni del database
pnpm db:push

# 5. Avvia il server di sviluppo
pnpm dev
```

L'applicazione sarà disponibile su `http://localhost:5000`.

### 7.3. Deployment su Render

SwimForge è configurato per il deployment automatico su Render. Ogni push sul branch `main` di GitHub attiva un nuovo deployment.

**Configurazione Render:**

1. Crea un nuovo Web Service su Render collegato al tuo repository GitHub.
2. Configura le seguenti impostazioni:
   - **Build Command**: `pnpm install && pnpm build`
   - **Start Command**: `pnpm start`
   - **Environment**: Node
3. Aggiungi tutte le variabili d'ambiente necessarie (vedi sezione Setup Locale).
4. Abilita "Auto-Deploy" per il deployment automatico.

### 7.4. Configurazione Garmin Webhook

Per ricevere notifiche automatiche quando un utente sincronizza il proprio dispositivo Garmin, è necessario configurare un webhook su Garmin Developer:

1. Accedi a [Garmin Developer Portal](https://developer.garmin.com/).
2. Vai su "My Apps" e seleziona la tua applicazione.
3. Aggiungi un nuovo webhook con l'URL: `https://your-app.onrender.com/api/garmin/webhook`.
4. Seleziona gli eventi da monitorare (es. "Activity Created").

---

## 8. Troubleshooting e Manutenzione

### 8.1. Problemi Comuni

**Problema: Il timer del countdown mostra "NaNm NaNs"**

**Soluzione:** Questo problema è stato risolto nel commit `acbf946`. Assicurati di avere l'ultima versione del codice. Il bug era causato da un errore nel parsing delle date. Verifica che le date delle sfide siano nel formato corretto (`TIMESTAMPTZ`).

**Problema: I badge profilo non sono visibili nella leaderboard**

**Soluzione:** Questo problema è stato risolto nel commit `acbf946`. È stato aggiunto un fallback con `COALESCE` per assegnare il badge di livello 1 agli utenti senza badge profilo.

**Problema: Il pulsante "Unisciti" non scompare dopo aver aderito a una sfida**

**Soluzione:** Questo problema è stato risolto aggiungendo `queryClient.invalidateQueries()` dopo l'azione di join. Assicurati che la cache di React Query venga invalidata correttamente.

**Problema: Il progresso della sfida non si aggiorna dopo la sincronizzazione Garmin**

**Soluzione:** Verifica che il webhook Garmin sia configurato correttamente e che l'endpoint `/api/garmin/webhook` sia raggiungibile. Controlla i log del server per eventuali errori. Puoi anche usare l'endpoint admin `recalculateChallengeProgress` per ricalcolare manualmente il progresso.

### 8.2. Comandi di Manutenzione

SwimForge include diversi endpoint admin per la manutenzione e il debug. Questi endpoint sono accessibili dalla pagina Profilo (solo per utenti autenticati).

**Ricalcola Badge:** Ricalcola tutti i badge achievement dell'utente autenticato. Utile dopo aver aggiunto nuovi badge o per fixare discrepanze.

**Inizializza Badge Profilo:** Crea i 7 badge profilo nel database se non esistono già. Questo comando deve essere eseguito una sola volta durante il setup iniziale.

**Ricalcola Progresso Sfide:** Ricalcola il progresso di tutte le sfide attive per tutti i partecipanti. Utile se ci sono discrepanze nelle classifiche.

**Completa Sfide Scadute:** Completa manualmente tutte le sfide scadute, determina i vincitori e assegna i badge epic. Questo comando è normalmente eseguito automaticamente dal cron job orario.

### 8.3. Monitoraggio del Cron Job

Il cron job per il completamento automatico delle sfide è registrato in `/server/_core/index.ts` e viene eseguito ogni ora (`0 * * * *`). Per verificare che il cron job stia funzionando correttamente:

1. Controlla i log del server su Render.
2. Cerca messaggi come "Running challenge completion cron job" e "Cron job completed successfully".
3. Se il cron job non viene eseguito, verifica che il server sia sempre attivo (Render può mettere in sleep i servizi gratuiti dopo un periodo di inattività).

---

## 9. Roadmap e Funzionalità Future

SwimForge è un progetto in continua evoluzione. Ecco alcune funzionalità pianificate per il futuro:

**Sistema di Notifiche:** Implementare un sistema di notifiche push per avvisare gli utenti di eventi importanti (es. "Hai guadagnato un nuovo badge!", "Una sfida a cui partecipi sta per terminare!").

**Grafici di Progresso:** Aggiungere grafici interattivi (usando Chart.js) per visualizzare il progresso dell'utente nel tempo (distanza totale, sessioni, XP).

**Funzionalità "Abbandona Sfida":** Permettere agli utenti di abbandonare una sfida a cui hanno aderito. Attualmente l'endpoint esiste ma non è collegato all'UI.

**Anteprima Badge nelle Card Sfide:** Mostrare un'anteprima del badge epic che verrà assegnato al vincitore direttamente nella card della sfida.

**Notifiche Push:** Integrare un servizio di notifiche push (es. Firebase Cloud Messaging) per inviare notifiche agli utenti anche quando l'app non è aperta.

**Modalità Scura:** Implementare una modalità scura per migliorare l'esperienza utente in condizioni di scarsa illuminazione.

**Integrazione con Altri Dispositivi:** Espandere l'integrazione oltre Garmin per supportare altri dispositivi e app di fitness (es. Fitbit, Apple Watch, Strava).

---

## 10. Conclusioni

SwimForge è un'applicazione completa e robusta per il tracking e la gamification delle attività di nuoto. Grazie all'integrazione con Garmin, al sistema di sfide competitive, e al sistema di badge e XP, SwimForge offre un'esperienza coinvolgente che motiva gli utenti a migliorare costantemente le proprie performance.

L'architettura full-stack moderna, basata su React, tRPC, e Supabase, garantisce scalabilità, sicurezza e facilità di manutenzione. Il deployment automatico su Render e il cron job per il completamento delle sfide rendono SwimForge un'applicazione pronta per la produzione.

Questo documento hardpoint fornisce una panoramica completa del progetto, dalla descrizione delle funzionalità all'implementazione tecnica, e può essere utilizzato come riferimento per sviluppatori, stakeholder, e nuovi membri del team.

---

**Autore:** Manus AI  
**Data:** 24 Gennaio 2026  
**Versione:** 1.0
