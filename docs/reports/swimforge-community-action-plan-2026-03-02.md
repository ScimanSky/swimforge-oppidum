# SwimForge — Report Strategico e Piano di Azione

- **Versione:** 1.0
- **Data:** 2 marzo 2026
- **Orizzonte operativo:** 10 settimane
- **Obiettivo primario:** aumentare l'uso ricorrente e la retention della community nuoto

## 1. Executive Summary
SwimForge ha una base tecnica e funzionale solida (tracking, social, club, analytics, AI coach), ma oggi il prodotto non comunica ancora un **rituale d'uso inevitabile** per una community di nuotatori.

La direzione proposta in questo report e' pragmatica:
- mantenere il valore gia' costruito,
- ridurre il rumore funzionale,
- concentrare roadmap e UX su pochi loop ad alta frequenza,
- usare club + coach-led come motore di coinvolgimento,
- misurare tutto sulla retention e non su vanity metrics.

Decisioni guida confermate:
- segmento prioritario: **master agonisti**,
- metrica north star: **Retention a 4 settimane**,
- stile engagement: **co-op + ranking soft**,
- strategia: **deepen core loop**, non espansione dispersiva.

## 2. Contesto Attuale

### 2.1 Asset gia' forti
1. Prodotto online e funzionante (`swimforge.it`) con stack coerente e moderno.
2. Infrastruttura a costo sostenibile (Oracle + Supabase free tier, monitor + cron gia' attivi).
3. Base feature ampia:
   - feed generale,
   - stories,
   - club,
   - sfide,
   - season,
   - statistiche,
   - workout AI.
4. UX/visual grade buona (non perfetta ma credibile).

### 2.2 Frizioni principali
1. **Valore disperso**: molte meccaniche non convergono in un percorso semplice.
2. **Season poco incisiva**: ricca, ma percepita banale o poco funzionale nel quotidiano.
3. **Ghost Track poco coinvolgente**: confronto tecnico presente, ma debole come tensione sociale e ritorno.
4. **Club non ancora "motore"**: manca rituale settimanale condiviso ad alta aderenza.
5. **Rischio overload**: l'utente vede tante cose, ma poche obbligate/irrinunciabili.

## 3. Obiettivi Prodotto (90 giorni)
1. **+30% retention D28** (target primario).
2. Aumentare quota utenti con **3-4 accessi/settimana**.
3. Aumentare completamento dei loop core (weekly focus, duels, club rituals).
4. Ridurre abbandono da confusione UX/funzionale.

## 4. Diagnosi di Product-Market Fit (community nuoto)
Per una community di nuotatori, la permanenza dipende da 4 leve:
1. progressione personale leggibile,
2. appartenenza a un gruppo (club/crew),
3. confronto sano e frequente,
4. routine semplice e ripetibile.

Oggi SwimForge ha componenti per tutte e 4, ma non ha ancora il "sistema" che le unisce in una routine settimanale chiarissima.

## 5. Strategia Prodotto Proposta

## 5.1 Principio centrale
Passare da "catalogo funzionalita'" a "**sistema di rituali**":
- rituale personale (weekly focus),
- rituale club (workout/contributo),
- rituale confronto (duel/rivincita).

## 5.2 Cosa togliere/subordinare
1. Spegnere o nascondere in UI feature deboli/non decisive.
2. Ridurre dashboarding ridondante senza CTA utile.
3. Evitare nuove feature "wow" se non rinforzano il core loop.

## 5.3 Cosa potenziare
1. Season come guida operativa settimanale.
2. Ghost come ciclo sfida-rivincita, non come analisi isolata.
3. Club come meccanica di accountability e status.

## 6. Piano di Azione (10 settimane)

## Fase 0 (Settimana 1) — Baseline e pruning
### Obiettivo
Stabilire misure vere e ridurre rumore.

### Azioni
1. Instrumentation minima eventi prodotto:
   - `season_view`
   - `season_next_action_click`
   - `ghost_duel_create`
   - `ghost_duel_complete`
   - `club_workout_open`
   - `club_workout_complete`
   - `feed_prompt_post_create`
2. Dashboard retention cohort D1/D7/D28.
3. Feature pruning UI di elementi deboli.
4. Definizione KPI guardrail (error rate, tempi risposta, drop-off step).

### Deliverable
- baseline numerica,
- elenco feature disattivate,
- backlog priorizzato per Fase 1.

## Fase 1 (Settimane 2-4) — Season Core Loop v2
### Obiettivo
Rendere Season una guida concreta, non una pagina informativa dispersiva.

### Nuovo modello UX
3 card principali:
1. **Focus settimanale personale** (1 obiettivo prioritario).
2. **Contributo club** (progresso cooperativo).
3. **Confronto soft** (duel/benchmark opzionale).

### Azioni
1. Ridisegno informativo della Season page con CTA unica "prossima azione".
2. Motore assegnazione weekly focus (semplice, robusto, deterministico).
3. Aggiornamento progress settimanale automatico da attivita'/interazioni.
4. Microcopy orientata ad azione reale in vasca.

### Deliverable
- Season v2 dietro feature flag,
- tracking completo conversione step->step.

## Fase 2 (Settimane 5-7) — Ghost Duels 2.0
### Obiettivo
Trasformare Ghost da confronto statico a loop ad alta ricorrenza.

### Nuovo modello
1. Duel su template comparabili (distanza/tempo/contesto omogeneo).
2. Finestra di sfida breve (es. 7 giorni).
3. Possibilita' rivincita immediata.
4. Scoring soft anti-frustrazione.

### Azioni
1. Nuovi endpoint duel-first.
2. Schermata risultato con delta chiaro e next step.
3. Ranking settimanale con componente miglioramento personale.
4. Fallback compatibilita' con flow ghost legacy.

### Deliverable
- duel loop completo,
- primi segnali di incremento ritorni settimanali.

## Fase 3 (Settimane 8-10) — Club Rituals
### Obiettivo
Fare del club il motore sociale di continuita'.

### Azioni
1. **Workout della settimana** con stato partecipazione (`fatto`, `quasi`, `saltato`).
2. Thread guidati post-workout con prompt tecnici utili.
3. Classifica club soft (partecipazione + miglioramento, non solo prestazione assoluta).
4. Digest settimanale (in-app, opzionale email).

### Deliverable
- loop club operativo e misurabile,
- retention trainata da dinamica gruppo.

## 7. Proposte API/Interface (public-facing)

## 7.1 Nuovi endpoint suggeriti
1. `season.getWeeklyFocus`
2. `season.markWeeklyAction`
3. `ghostDuels.create`
4. `ghostDuels.submitAttempt`
5. `ghostDuels.rematch`
6. `clubs.workouts.markCompletion`
7. `clubs.rituals.weeklyDigest`

## 7.2 Deprecazioni graduali
1. Flussi secondari `season.predictions.*` (se bassa adozione).
2. Flow ghost legacy come entrypoint primario (mantenuto per compatibilita').

## 7.3 Nuovi tipi dati (indicativi)
1. `WeeklyFocus`
2. `WeeklyClubContribution`
3. `GhostDuelTemplate`
4. `GhostDuelResult`
5. `WorkoutCompletionStatus`

## 8. Test e Qualita'

## 8.1 Unit
1. Assegnazione weekly focus e priorita' CTA.
2. Scoring duel con edge case (pareggio, mismatch, activity missing).
3. Calcolo contributo club settimanale.

## 8.2 Integration
1. Season flow end-to-end.
2. Duel flow create->attempt->result->rematch.
3. Club workout flow publish->complete->ranking update.

## 8.3 E2E
1. Nuovo utente: onboarding community entro 5 minuti.
2. Utente attivo: 3 accessi settimanali con azione utile evidente.
3. Coach/captain: gestione rituali club senza frizione.

## 9. KPI e Criteri di Successo

## KPI primari
1. Retention D28 (+30%).
2. % utenti con almeno 3 accessi/settimana.
3. % utenti che completano weekly focus.
4. % membri club che partecipano al workout settimanale.

## KPI secondari
1. Tasso rivincita duels.
2. Qualita' interazioni feed (commenti/reazioni significative).
3. Tempo medio alla prima azione utile dopo login.

## 10. Rollout e Risk Management
1. Feature flags per ogni modulo nuovo.
2. Rollout progressivo 10% -> 50% -> 100%.
3. Kill switch rapido per regressioni.
4. Controllo costi AI: non rendere AI obbligatoria nei loop core.

## 11. Priorita' e Capacita' Reali
Con la capacita' attuale, il piano e' sostenibile se si rispettano questi vincoli:
1. massimo 1-2 major stream in parallelo,
2. pruning continuo per evitare deriva scope,
3. decisioni quindicinali keep/remove basate su dati, non su percezione.

## 12. Decisioni aperte per prossimo confronto
1. Soglia precisa di adozione sotto cui spegnere feature legacy.
2. Formula finale del ranking soft (peso performance vs miglioramento).
3. Canale digest (solo in-app o anche email) in base a costo/beneficio.
4. Sequenza rollout per cluster utenti (club attivi vs utenza generale).

## 13. Conclusione
SwimForge non ha bisogno di "feature strane" ma di **piu' coerenza di prodotto**:
- meno dispersione,
- piu' rituali,
- piu' utilita' percepita,
- piu' dinamica club.

Il piano sopra e' orientato a trasformare l'app da interessante a realmente abituale per una community di nuotatori.
