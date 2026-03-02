# SwimForge — Report Strategico Unificato
**Data:** 2026-03-02
**Orizzonte operativo:** 12 settimane
**Obiettivo primario:** trasformare SwimForge da app interessante ad abitudine irrinunciabile per i nuotatori
**Status:** Documento canonico di governance prodotto per SwimForge 2.0
**Ruolo:** Fonte primaria per priorità, sequencing, scope lock e KPI

---

## 1. Executive Summary

SwimForge ha una base tecnica solida — tracking Garmin/Strava di qualità, club, feed, AI coach, statistiche avanzate — ma non ha ancora un **rituale d'uso inevitabile** per una community di nuotatori.

Il problema non è la quantità di feature: è che le feature esistenti non convergono in un sistema. L'utente vede molte cose, nessuna obbligatoria.

**La strategia in tre parole:** *sistema, identità, rituale.*

- **Sistema:** collegare le feature esistenti in loop settimanali chiari e misurabili.
- **Identità:** dare al nuotatore una carta d'identità digitale centrata sui suoi tempi personali, non su metriche generiche.
- **Rituale:** creare 2-3 azioni settimanali che il nuotatore fa su SwimForge per ragioni pratiche, non solo sociali.

**Principi guida:**
- Segmento prioritario: **master agonisti** (alta frequenza di allenamento, identità forte, cultura di club consolidata)
- North star metric: **Retention a 28 giorni**
- Approccio: **approfondire il core loop prima di espandersi**, ma correggere subito le lacune identitarie fondamentali
- Non aggiungere feature nuove finché quelle esistenti non sono misurate e funzionanti come sistema

---

## 2. Diagnosi del prodotto attuale

### 2.1 Asset da tenere e rafforzare

| Feature | Perché è un asset |
|---------|-------------------|
| Integrazione Garmin/Strava | Dati granulari (laps, SWOLF, HR zones, stroke rate) che pochi competitor hanno |
| Statistiche avanzate | Ben implementate, vanno solo arricchite con metriche swim-specific |
| Struttura dei Club | Modello dati ricco — la direzione è giusta, la prioritizzazione delle feature no |
| AI Coach | Differenziatore reale — va migliorato l'accesso e la personalizzazione |
| Badge e Personal Records | Il DB esiste, è sottoutilizzato nella UI |
| Club Meets (feature-flagged) | Quasi completo, solo disabilitato — va abilitato subito |

### 2.2 Feature deboli — da riformare

**Season / Battle Pass**
Il sistema Season non parla la lingua dei nuotatori. Le missioni ("nuota 3 volte questa settimana") sono generiche, il concetto di "Season" come battle pass non corrisponde alla stagione agonistica reale. Non va eliminato — va riformato come guida operativa settimanale concreta (vedi Fase 2).

**Ghost Tracks**
Il concetto è giusto, l'esecuzione è sbagliata. Confrontare due attività passate di persone diverse non genera tensione né engagement. Va trasformato in un loop sfida-rivincita ad alta frequenza (vedi Fase 3).

**Challenges**
Le tipologie attuali (total_distance / sessions / consistency / avg_pace) sono metriche da fitness app generica. Non c'è niente di specificamente legato al nuoto.

**Profilo utente**
Mostra bio, follower, badge generici. Il profilo di un nuotatore deve essere centrato sui suoi **tempi personali per stile/distanza** — questa è la sua identità. Il DB `personal_records` esiste ma è sepolto.

### 2.3 Feature da rimuovere o ridimensionare

| Feature | Azione | Motivazione |
|---------|--------|-------------|
| Activity Predictions/Bets | **Rimuovere** | Complessità alta, engagement basso, nessun benchmark di successo |
| Season Recap Video (Remotion) | **Ridimensionare** | Costo di manutenzione sproporzionato all'engagement generato |
| Ghost Tracks legacy come entrypoint | **Sostituire** | Tenere compatibilità ma non promuovere il vecchio flusso |
| Onboarding multi-step | **Semplificare** | Ridurre a: nome + piscina + connetti dispositivo — poi si scopre l'app |

### 2.4 Il problema di posizionamento

SwimForge compete implicitamente con Garmin Connect (tracking) e Strava (social). La risposta alla domanda "perché devo usare SwimForge invece di Strava?" deve essere immediata e specifica.

**Il posizionamento corretto:** *"La home digitale del nuotatore — tutto quello che Strava e Garmin Connect non ti danno."*

Perché funziona: Strava tratta i nuotatori come cittadini di seconda classe (nessun segmento per il nuoto, distanza inseribile solo in multipli di 25m, heart rate HRM-Swim non sincronizzata correttamente, pace calcolata male). Questa frustrazione è documentata, attiva e irrisolta da anni. SwimForge può occupare esattamente questo spazio in Italia.

Ogni feature deve rispondere a: *"aiuta i nuotatori a migliorare i propri tempi o a connettersi con chi nuota?"* Se la risposta è no, non deve esistere.

---

## 3. Il loop di engagement che deve esistere

**Oggi un nuotatore su SwimForge fa:**
`sync Garmin → vede statistiche → posta nel feed → guarda il Season`

Questo loop non ha un *perché* specifico per un nuotatore.

**Il loop che deve esistere:**

```
Allenamento
    ↓
Sync automatico
    ↓
"Hai migliorato il tuo PB nei 100 SL: 1:04.2" [notifica identitaria]
    ↓
"Sei 3° nella sfida settimanale del club" [contesto sociale]
    ↓
"Il coach ha pubblicato l'allenamento di martedì" [ragione pratica per tornare]
    ↓
"Mancano 18 giorni alla gara — settimana di taper" [contesto agonistico]
    ↓
Marco ti ha sfidato a una rivincita sul 400 SL [tensione emotiva]
```

Ogni tocco dell'app deve avere un perché specifico per un nuotatore.

---

## 4. Piano d'azione — 12 settimane

---

### Fase 0 — Settimana 1: Misurare e potare

**Obiettivo:** Avere una baseline numerica reale prima di toccare qualsiasi cosa.

**Azioni:**

1. **Instrumentation eventi prodotto** — inserire tracking su:
   - `season_view`, `season_next_action_click`
   - `ghost_track_open`, `ghost_track_duel_create`
   - `club_workout_open`, `club_workout_complete`
   - `feed_post_create`, `feed_post_view`
   - `activity_synced`, `pb_detected`
   - `profile_pb_view` (quante volte qualcuno guarda i PR nel profilo altrui)

2. **Dashboard retention cohort** — D1, D7, D28 per coorte di registrazione

3. **Feature pruning UI** — disabilitare o nascondere nell'interfaccia:
   - Activity Predictions/Bets
   - Pulsante Season Recap Video (o ridurlo a card statica)
   - Ghost Tracks legacy come entrypoint primario

4. **KPI guardrail** — definire le soglie sotto cui una feature viene spenta (es. <5% degli utenti attivi la usa in 30 giorni)

**Deliverable:** baseline numerica, elenco feature disattivate, backlog priorizzato per Fase 1.

---

### Fase 1 — Settimane 2-4: Identità del nuotatore (PB Board)

**Obiettivo:** Dare al nuotatore una carta d'identità digitale centrata sui suoi tempi. Questa è la correzione più importante — prima di ottimizzare i loop sociali, l'utente deve trovare la sua *identità* su SwimForge.

**Il problema attuale:** Il DB `personal_records` esiste già. Non è una feature nuova — è una riorganizzazione dell'esistente che risolve la lacuna identitaria più grave del prodotto.

**Cosa costruire:**

**PB Board nel profilo pubblico**
- Griglia tempi personali per ogni combinazione stile/distanza: 50/100/200/400/800/1500 × SL/DO/RA/FA + 100/200 RI, in vasca corta (25m) e vasca lunga (50m)
- PB inseribili manualmente (da gara ufficiale) o estratti automaticamente dalle attività Garmin sincronizzate
- Due categorie distinte: *PB da gara ufficiale* e *PB da allenamento* — i nuotatori sanno che sono diversi
- FINA Points automatici (formula pubblica) per contestualizzare il tempo: "Il tuo 200 dorso vale 520 punti FINA" permette confronto equo tra stili e categorie masters

**Club PB Leaderboard**
- Nuovo tab nel club (o sezione nel tab Stats esistente): "Chi è il più veloce nei 100 SL nel nostro club?"
- Filtri per categoria masters (5-year age bands), per stile, per distanza
- Leaderboard separata per vasca corta e vasca lunga

**Notifica PB automatica**
- Al termine di ogni sync Garmin: se viene rilevato un PB, notifica schermo intero celebrativa
- Questa è la notifica più emozionante che può ricevere un nuotatore — e la più condivisibile nel feed
- "Hai migliorato il tuo PB nei 100 dorso di 0.8 secondi!" con bottone "Condividi nel feed"

**Nuovi endpoint:**
- `records.setManual(stroke, distance, poolLength, timeCs, source)` — inserimento manuale da gara
- `records.getByUser(userId)` — PB board pubblica
- `records.clubLeaderboard(clubId, stroke, distance, poolLength, masterCategory?)` — classifica club
- `records.finaPoints(stroke, distance, timeCs, gender, birthYear)` — calcolo punti FINA

**Deliverable:** PB Board visibile nel profilo pubblico e privato, leaderboard nei club, notifica PB automatica da sync.

---

### Fase 2 — Settimane 4-6: Season come guida operativa

**Obiettivo:** Trasformare Season da "pagina informativa dispersiva" a "guida settimanale concreta". Non si cambia il concept, si cambia la struttura.

**Il nuovo modello UX — 3 card principali:**

1. **Focus settimanale personale** — 1 obiettivo prioritario assegnato automaticamente in base ai dati dell'utente ("questa settimana: 2 sessioni threshold pace" o "consolida: mantieni frequenza 3x/settimana")
2. **Contributo club** — progresso cooperativo del club nella settimana (workout condivisi, distanza collettiva, sfide attive)
3. **Confronto soft** — duel attivo o benchmark opzionale con un compagno di club

**Principi del weekly focus:**
- 1 solo obiettivo per settimana, non 5 missioni
- Formulato in linguaggio del nuoto, non in linguaggio gamification ("nuota 2 sessioni a ritmo soglia" non "completa 2 missioni allenamento")
- CTA unica evidente: "Prossima azione" che porta direttamente all'azione rilevante
- Aggiornamento progress automatico da attività sincronizzate — niente input manuale

**Cosa rimane del Season attuale:** XP, badge, livelli rimangono come strato sottile di reward. Non spariscono, ma non sono la narrativa principale.

**Nuovi endpoint:**
- `season.getWeeklyFocus` — focus assegnato per la settimana corrente
- `season.markWeeklyAction(actionType)` — segnala completamento azione (automatico da sync)
- `season.getClubContribution(clubId)` — progresso cooperativo del club

**Deliverable:** Season page v2 dietro feature flag, tracking completo conversione step→step.

---

### Fase 3 — Settimane 6-8: Ghost Duels 2.0

**Obiettivo:** Trasformare Ghost Tracks da confronto storico e passivo a loop sfida-rivincita ad alta frequenza.

**Il modello corretto:**

Non si confrontano due attività passate di due persone diverse. Si lancia una sfida attiva su una distanza/stile specifico, con finestra temporale breve e possibilità di rivincita immediata.

**Come funziona:**

1. Utente A lancia un duel: "Sfido Marco sul 400 SL — hai 7 giorni" (oppure: sfida aperta al club)
2. Il sistema registra il tempo di riferimento di A dalla sua ultima attività Garmin con quel segmento
3. Quando B sincronizza un'attività che contiene quel segmento nei 7 giorni, appare automaticamente nella classifica del duel
4. Niente inserimento manuale — il matching è automatico dal sync
5. Fine finestra: risultato chiaro con delta esplicito ("Marco: +3.2 secondi")
6. **Rivincita immediata** — bottone "Rivincita" che lancia immediatamente un nuovo duel invertito. Questo è il meccanismo chiave per il loop ad alta frequenza.

**Varianti:**
- *Duel 1v1:* sfida diretta tra due utenti
- *Club Open:* chiunque nel club può partecipare — classifica live aggiornata a ogni sync
- *Coach Record:* il coach pubblica il record del club su una distanza — chiunque può tentare di batterlo

**Scoring anti-frustrazione:**
- La classifica del club mostra sia la posizione assoluta che il miglioramento personale rispetto all'ultimo tentativo
- Un nuotatore lento che migliora di 5 secondi ha visibilità, non solo chi vince in assoluto

**Nuovi endpoint:**
- `duels.create(targetUserId?, clubId?, stroke, distanceM, windowDays)` — lancia duel
- `duels.submitResult(duelId, activityId)` — aggancia attività sync al duel (o automatico)
- `duels.rematch(duelId)` — crea duel invertito immediato
- `duels.list(scope: personal|club)` — lista duels attivi e completati
- `duels.leaderboard(duelId)` — classifica live con delta e miglioramento personale

**Deliverable:** loop duel completo con rematch, primi segnali di incremento ritorni settimanali.

---

### Fase 4 — Settimane 9-11: Club Rituals

**Obiettivo:** Fare del club il motore sociale di continuità settimanale.

**Workout della settimana con stato partecipazione**

Il coach pubblica l'allenamento (già esiste in `club_pool_workouts`). Ogni membro del club vede nella home del club:
- L'allenamento della settimana con struttura completa
- Tre stati: **Fatto** / **Quasi** / **Saltato** — selezionabili dopo il sync (o manualmente)
- Contatore: "7 su 12 membri hanno fatto l'allenamento questa settimana"
- Dopo aver segnato "Fatto": prompt automatico "Come è andata?" con 3 opzioni rapide (ottimo / nella media / difficile) + campo commento opzionale

**Thread guidato post-workout**
- Quando un membro segna "Fatto", il sistema crea automaticamente un post nel feed del club con il tag dell'allenamento
- Prompt tecnico automatico come commento iniziale del coach: "Come è andato il main set? Che ritmo avete tenuto sulle ripetute da 200?"
- Questo non richiede che il coach sia attivo — il prompt è configurabile per ogni allenamento

**Classifica club soft settimanale**
- Basata su: partecipazione (50%) + miglioramento personale rispetto alla settimana precedente (50%)
- Non solo chi nuota di più o più veloce — questo esclude chi è appena iniziato
- Visibile nel tab Club, aggiornata ogni domenica sera

**Digest settimanale in-app**
- Ogni lunedì: notifica "La settimana del club" con: partecipazione complessiva, chi ha migliorato il PB, l'allenamento della settimana, duels attivi
- Email opzionale per chi la abilita (già infrastruttura Resend disponibile)

**Nuovi endpoint:**
- `clubs.workouts.markCompletion(workoutId, status, rating?, comment?)` — stato partecipazione
- `clubs.workouts.participationStats(workoutId)` — stats partecipazione
- `clubs.rituals.weeklyDigest(clubId)` — payload per digest settimanale
- `clubs.leaderboard.soft(clubId, weekOf)` — classifica soft settimanale

**Deliverable:** loop club operativo e misurabile, retention trainata da dinamica di gruppo.

---

### Fase parallela (nessun sviluppo richiesto) — Abilitare Club Meets

**La feature è già costruita al 90% e disabilitata tramite feature flag (`CLUB_MEETS_V1_ENABLED`).**

Per qualsiasi club agonistico (anche amatoriale serio), la gestione di convocazioni, iscrizioni per evento, pubblicazione risultati e storico tempi per atleta sostituisce email + fogli Excel + WhatsApp. Un club che fa tutto questo su SwimForge porta tutta la squadra sulla piattaforma.

**Azione:** Selezionare 1-2 club pilota disponibili a testare la feature. Abilitare il flag per quei club. Raccogliere feedback per 4 settimane. Documentare il workflow per i coach. Poi valutare rollout generale.

---

## 5. Feature a medio termine (dopo settimana 12)

Queste feature hanno alto impatto strategico ma richiedono più sviluppo. Vanno pianificate dopo aver stabilizzato il core loop.

### CSS Hub — Critical Swim Speed come centro del training

Il CSS (Critical Swim Speed) è il "threshold pace" del nuoto — l'equivalente del FTP nel ciclismo. MySwimPro lo ha, FORM lo usa, SwimSmooth lo ha reso popolare a livello globale. SwimForge ha tutti i dati Garmin necessari per calcolarlo ma non lo fa.

**Formula:** `CSS = (D2 - D1) / (T2 - T1)` dove D1=distanza breve, T1=tempo breve, D2=distanza lunga, T2=tempo lunga.

**Cosa costruire:**
- Test CSS suggerito nell'app con istruzioni: 400m a massimo sforzo + 5min recupero + 200m a massimo sforzo
- CSS calcolato automaticamente e salvato nel profilo, aggiornabile con nuovi test
- Zone di allenamento derivate: aerobico (>CSS+20s/100m), threshold (CSS±5s), VO2max (<CSS-5s), red-mist (<CSS-10s)
- Nell'activity detail: "Questa sessione — 68% aerobico, 24% soglia, 8% VO2max" (calcolato dal pace per lunghezza dai dati Garmin laps)
- Nell'AI Coach: workout generate in funzione del CSS personale, non generiche
- Nel profilo pubblico: "CSS: 1:28/100m" come metrica di riferimento

### Lane Buddy — Trova chi nuota al tuo orario e piscina

Il problema numero 1 dei nuotatori solitari è trovare qualcuno con cui allenarsi. È un problema locale e ricorrente che si ripresenta ogni settimana.

**Implementazione minimale:**
- Campo "Nuoto a [piscina]" nel profilo (testo libero o ricerca da lista piscine italiane)
- Campo "Di solito nuoto" con checkbox: Lu / Ma / Me / Gi / Ve / Sa / Do + fasce orarie (mattina/pomeriggio/sera)
- Sezione nel feed: "Nella tua piscina nuotano anche:" con avatar degli utenti con la stessa piscina
- Bottone "Proponi sessione" → apre una DM con data/ora suggerita

### Race Prep Mode — Countdown alla gara con periodizzazione

I nuotatori competitivi si allenano in cicli verso le gare. Questa è la loro narrativa naturale.

**Come funziona:**
- Inserimento gara target con data e eventi obiettivo (es. "Regionali Master, 14 aprile, 100SL + 200DO")
- App mostra fase corrente: base (>10 settimane), build (6-10 settimane), peak (3-6 settimane), taper (1-2 settimane)
- Suggerimenti di volume/intensità coerenti con la fase
- Dopo la gara: inserimento risultato, confronto con PB, analisi del ciclo
- Nel feed del club: "3 atleti gareggiano domenica prossima" con widget di supporto

### Import risultati gare ufficiali FIN

I nuotatori competitivi cercano ossessivamente i risultati ufficiali delle gare (FIN Italia, Swimphone). Nessuna app italiana aggrega questi risultati in modo sociale.

**Feature:** Integrazione con il database FIN per import automatico (o semi-automatico) dei risultati ufficiali di gara nel profilo. Due categorie distinte: PB da gara ufficiale vs PB da allenamento Garmin. Questa è la feature che trasformerebbe SwimForge da app di allenamento ad anagrafe digitale del nuotatore italiano.

---

## 6. Il "Momento Aha" — la prima sessione è decisiva

La ricerca sulle fitness app mostra un pattern chiaro: gli utenti che non vivono un momento di valore nelle prime 24 ore non tornano. Il day-7 retention con un "aha moment" chiaro sale dal 15-20% del settore al 30%+.

**Il momento aha corretto per SwimForge:**
Non appena arriva il primo sync Garmin, l'app deve:
1. Rilevare automaticamente se c'è un PB in quell'attività
2. Mostrare celebrazione schermo intero ("Nuovo PB nei 100 SL: 1:04.2")
3. Calcolare una stima preliminare di pace di riferimento (CSS-lite) se ci sono abbastanza dati; il CSS Hub completo resta nel blocco post-settimana 12
4. Suggerire 3 persone del club/piscina che nuotano negli stessi orari

**Il "Kudos effect":** Quando un nuovo utente posta per la prima volta, i membri attivi del suo club ricevono una notifica "Marco ha appena registrato il suo primo allenamento — dagli il benvenuto". Costo: zero. Impatto sulla first-week retention: alto.

---

## 7. KPI e criteri di successo

### KPI primari

| KPI | Baseline attuale | Target 12 settimane |
|-----|-----------------|---------------------|
| Retention D28 | Da misurare (Fase 0) | +30% |
| % utenti con ≥3 accessi/settimana | Da misurare | +20 punti percentuali |
| % utenti che completano weekly focus | N/A (feature nuova) | ≥40% degli attivi |
| % membri club che partecipano al workout settimanale | Da misurare | ≥50% dei club attivi |

### KPI secondari

| KPI | Significato |
|-----|-------------|
| Tasso rivincita duels | Misura il loop emotivo — target: ≥40% dei duels completati genera rematch |
| Notifiche PB aperte | Misura l'impatto dell'identità — target: >80% open rate |
| Profile PB views | Quante volte si guarda il profilo altrui per i tempi — misura il social pull |
| Tempo alla prima azione utile dopo login | Target: <90 secondi |
| % club con almeno 1 workout pubblicato/settimana | Misura attivazione coach |

### Quando spegnere una feature

Soglia di decisione: se una feature ha adoption rate <5% degli utenti attivi dopo 30 giorni di esposizione, viene spenta o ridisegnata. Niente eccezioni per "abbiamo lavorato tanto su questa cosa".

---

## 8. Analisi competitiva sintetica

| Piattaforma | Punto di forza | Gap che SwimForge può coprire |
|------------|----------------|-------------------------------|
| Garmin Connect | Dati tecnici eccellenti | Community, club, sfide sociali |
| Strava | Social graph potente | Nessuna feature swim-specific — nuotatori come "secondi" |
| MySwimPro | Workout library + CSS | Community, club, integrazione meet |
| SwimWarrior | Ranking per tempi, gamification | Dati di allenamento, Garmin sync |
| Swimcloud | Rankings ufficiali | Social, community club informale |
| Swim.com | Social + tracking | Troppo USA-centrico, no Masters focus EU |
| Commit Swimming | Gestione club professionale | Nessun aspetto social/community |

**L'opportunità di SwimForge** è l'intersezione di: dati tecnici di qualità (Garmin) + community reale (club, feed) + specificità del nuoto (CSS, PB per gara, meet, masters) + focus Italia/Europa. Nessun competitor occupa questo spazio.

---

## 9. Rollout e risk management

1. **Feature flags per ogni modulo nuovo** — niente deploy diretto in produzione
2. **Rollout progressivo:** 10% → 50% → 100% con pausa di osservazione tra ogni step
3. **Kill switch rapido** per regressioni di retention o errori critici
4. **AI non obbligatoria nei loop core** — il loop settimanale deve funzionare senza dipendenza da AI per non creare costi variabili legati all'engagement
5. **Massimo 1-2 stream in parallelo** — la capacità attuale non permette di più senza degradare qualità
6. **Decisioni quindicinali keep/remove** basate su dati di instrumentation, non su percezione

---

## 10. Sequenza ottimale — sintesi

| Settimane | Cosa | Perché prima |
|-----------|------|-------------|
| 1 | Instrumentation + pruning | Senza baseline si lavora al buio |
| 2-4 | PB Board (profilo + club leaderboard + notifica PB) | Risolve il problema di identità — è la base su cui tutto il resto si appoggia |
| 2-4 | Abilitare Club Meets (club pilota) | Costo zero, impatto alto per club agonistici |
| 4-6 | Season v2 (weekly focus, 3 card) | Il loop settimanale diventa esplicito |
| 6-8 | Ghost Duels 2.0 (sfida + rematch) | Aggiunge tensione emotiva e frequenza di ritorno |
| 9-11 | Club Rituals (workout completion + classifica soft) | Consolida il club come motore sociale |
| 12+ | CSS Hub, Lane Buddy, Race Prep Mode, FIN import | Differenziatori a lungo termine |

---

## 11. Decisioni aperte

1. **PB da gara ufficiale vs da allenamento:** come gestire il caso in cui il PB Garmin è più veloce del PB da gara (vasca, condizioni, assenza di partenza in acqua)? Soluzione proposta: mostrare entrambi chiaramente etichettati.
2. **Formula ranking soft club:** peso partecipazione vs peso miglioramento — da definire con un test A/B nelle prime settimane di Fase 4.
3. **Digest settimanale:** solo in-app o anche email? Dipende dal costo Resend vs engagement — da misurare.
4. **Soglia di adozione Club Meets:** dopo quante settimane di test con club pilota si apre a tutti?
5. **CSS da attività Garmin vs da test dedicato:** il CSS estratto automaticamente dai dati di allenamento è meno preciso ma non richiede un test specifico. Offrire entrambe le opzioni con indicazione della confidenza.

---

## Appendice: Fonti

**Competitor analysis:**
- [SwimWarrior — Making Competitive Swimming Engaging (SwimSwam)](https://swimswam.com/swimwarrior-the-app-thats-making-competitive-swimming-more-fun-engaging-and-motivating/)
- [Swimcloud](https://www.swimcloud.com/)
- [Commit Swimming](https://www.commitswimming.com)
- [MySwimPro — Best Swim Workout App (2024)](https://blog.myswimpro.com/2024/08/16/best-swim-workout-app/)
- [FORM Smart Swim 2 — DC Rainmaker Review (2024)](https://www.dcrainmaker.com/2024/04/smart-goggles-review.html)
- [Swim.com](https://www.swim.com)

**Engagement e retention:**
- [Strava Marketing Strategy — Segments, Kudos, Clubs](https://www.latterly.org/strava-marketing-strategy/)
- [How Strava Drives App Engagement (StriveCloud)](https://www.strivecloud.io/blog/app-engagement-strava)
- [Peloton — Personalization, Community, Growth (TacticOne)](https://www.tacticone.co/blog/peloton-personalization-community-and-growth)
- [13 Strategies to Increase Fitness App Engagement (Orangesoft)](https://orangesoft.co/blog/strategies-to-increase-fitness-app-engagement-and-retention)

**Swimming culture e training:**
- [Critical Swim Speed Training Guide 2025 (TraPlaGo)](https://traplago.com/swimming/docs/intensity/critical-swim-speed)
- [Track These 6 Metrics to Improve Your Swimming (MySwimPro)](https://blog.myswimpro.com/2021/06/15/track-these-6-metrics-to-improve-your-swimming/)
- [How to Build Community in Your Masters Club (USMS)](https://www.usms.org/fitness-and-training/articles-and-videos/articles/how-to-build-a-community-in-your-masters-club)
- [Why You Need to Buddy Up for Swimming (USMS)](https://www.usms.org/fitness-and-training/articles-and-videos/articles/why-you-need-to-buddy-up-for-a-sustainable-swimming-habit)
