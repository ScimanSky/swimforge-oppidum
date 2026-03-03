# SwimForge 2.0 — Phase 0 Baseline Spec

- **Data:** 2026-03-02
- **Fase:** 0 (Settimana 1)
- **Scopo:** attivare misurazione affidabile prima delle fasi prodotto 2.0
- **North star:** Retention D28

## 1) Obiettivi fase 0
1. Tracciare gli eventi minimi del core loop 2.0.
2. Costruire baseline D1/D7/D28 prima dei cambi di prodotto.
3. Applicare pruning iniziale delle sezioni con basso valore percepito.
4. Bloccare criteri go/no-go per le fasi successive.

## 2) Event taxonomy minima

## Eventi obbligatori
1. `season_view`
- Trigger: apertura pagina Season.
- Source tipica: `season_page`.

2. `season_next_action_click`
- Trigger: click su CTA "Vai all'azione" nel blocco "Oggi".
- Metadata minima: `actionType`.

3. `pb_detected`
- Trigger: inserimento/aggiornamento personal record.
- Source tipica: `personal_record_insert` / `personal_record_upsert`.
- Metadata minima: `recordType`, `strokeType`, `currentValue`, `previousValue` (se disponibile).

4. `ghost_duel_create`
- Trigger: creazione sfida Ghost da feed/sessione.
- Metadata minima: `postId`.

5. `club_workout_open`
- Trigger: apertura dettaglio workout pubblicato.
- Source tipica: `club_workouts_page`, `club_workout_detail_page`.
- Metadata minima: `clubId`.

6. `club_workout_complete`
- Trigger: azione utente "Segna completato" su workout club.
- Metadata minima: `clubId`, `status`.

## Eventi estesi (supporto diagnosi loop)
1. `feed_post_create` — creazione post nel feed globale/club.
2. `feed_post_view` — apertura dettaglio post.
3. `activity_synced` — sync con nuove attività importate (Garmin/Strava).
4. `profile_pb_view` — apertura profilo pubblico altrui con sezione identità/PB.
5. `ghost_track_open` — ingresso nel tab Ghost Track.
6. `season_step_view` — visualizzazione step card Season v2.
7. `season_step_action_click` — click CTA su step card Season v2.
8. `season_weekly_action_marked` — marcatura azione settimanale eseguita da Season v2.

## Schema evento (server-side)
- Tabella: `product_engagement_events`
- Campi: `id`, `user_id`, `event_name`, `source`, `entity_type`, `entity_id`, `metadata`, `created_at`
- Indici:
  - `(user_id, created_at desc)`
  - `(event_name, created_at desc)`

## 3) KPI baseline da calcolare

## KPI primari
1. D1 retention
2. D7 retention
3. D28 retention

## KPI core loop
1. `season_view` per utente attivo (weekly)
2. CTR `season_next_action_click / season_view`
3. `% utenti con >=1 club_workout_open / settimana`
4. `% utenti con >=1 club_workout_complete / settimana`
5. `% utenti con >=1 ghost_duel_create / settimana`
6. `% utenti con >=1 pb_detected / settimana`
7. CTR `season_step_action_click / season_step_view` (solo rollout Season v2)
8. CTR `season_weekly_action_marked / season_step_action_click` (solo rollout Season v2)
9. CTR `season_weekly_action_marked / season_step_view` (solo rollout Season v2)

## 4) Query baseline (specifica)

## Finestra default
- Rolling 28 giorni, timezone UTC.

## Segmenti minimi
1. Utenti con almeno 1 activity sync negli ultimi 14 giorni.
2. Utenti membri di almeno 1 club.
3. Utenti master agonisti (se campo disponibile in profilo).

## Cohort retention
- Cohort per `registration_date`.
- Misura ritorno in app (sessione autenticata) a D1, D7, D28.

## 5) Pruning UI fase 0
1. Ridurre prominenza blocchi predictions/bets nella Season.
2. Ridurre prominenza recap video Season.
3. Mantenere fallback e compatibilita' (nessuna rottura route).

## 6) Criteri go/no-go fase 1
La Fase 1 parte solo se:
1. tracking eventi attivo in produzione,
2. baseline D1/D7/D28 disponibile,
3. dashboard KPI core loop pubblicata,
4. nessuna regressione P1 su feed/club/workouts.

## 7) Output richiesti a fine fase 0
1. Report baseline numerico (`2026-03-xx-phase-0-baseline-results.md`).
2. Snapshot KPI con trend primi 7 giorni.
3. Backlog Fase 1 prioritizzato (PB Board + Club Meets rollout).
4. Lista esplicita feature mantenute/deprecate nella UI.

## 8) Owner e cadenza
1. Product owner: validazione KPI ogni settimana.
2. Engineering owner: qualità eventi e integrità dati.
3. Cadenza review: settimanale, con decisione keep/remove ogni 2 settimane.
