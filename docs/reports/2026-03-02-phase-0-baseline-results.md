# Phase 0 Baseline Results

- Data report: 2026-03-03
- Finestra baseline: ultime 12 settimane coorti, ultimi 28 giorni core-loop
- Stato: compilato con query su Supabase (snapshot iniziale a basso volume)
- Query pack: [phase-0-baseline-queries.sql](/home/scima/projects/swimforge-oppidum-cloud/docs/analytics/phase-0-baseline-queries.sql)
- Runbook: [phase-0-dashboard-runbook.md](/home/scima/projects/swimforge-oppidum-cloud/docs/analytics/phase-0-dashboard-runbook.md)

## Retention
- D1 exact: `8.33%`
- D7 exact: `16.67%`
- D28 exact: `16.67%`
- D7 rolling: `41.67%`
- D28 rolling: `41.67%`

## Core-loop (latest available week: 2026-03-02)
- WAU: `1`
- season_view_per_wau: `1.000`
- season_next_action_ctr_pct: `0.00%`
- season_step_action_ctr_pct: `n/a` (Season v2 funnel event non ancora presente nello snapshot 2026-03-03)
- season_weekly_mark_from_click_ctr_pct: `n/a` (evento introdotto dopo baseline snapshot)
- season_weekly_mark_from_step_view_ctr_pct: `n/a` (evento introdotto dopo baseline snapshot)
- pct_users_club_workout_open: `0.00%`
- pct_users_club_workout_complete: `0.00%`
- pct_users_ghost_duel_create: `0.00%`
- pct_users_pb_detected: `0.00%`

## Segment health
- all_users active_28d: `8.33%`
- synced_14d active_28d: `50.00%`
- club_members active_28d: `14.29%`
- masters active_28d: `0.00%`
- masters_and_club active_28d: `0.00%`

## Data quality
- unknown events: `pass` (0)
- null checks: `pass` (0/0/0)
- daily event continuity: `fail` (solo `season_view` presente negli ultimi 7 giorni)

## Output SQL raw da incollare

### 1) Retention (cohort table)

```sql
-- Eseguire sezione 2 del file phase-0-baseline-queries.sql
```

Risultato:

```text
WEIGHTED_SUMMARY
cohort_size=12
d1_exact_pct=8.33
d7_exact_pct=16.67
d28_exact_pct=16.67
d7_rolling_pct=41.67
d28_rolling_pct=41.67
```

### 2) Weekly core-loop (8 weeks)

```sql
-- Eseguire sezione 3 del file phase-0-baseline-queries.sql
```

Risultato:

```text
week_start=2026-03-02
wau=1
season_view_per_wau=1.000
season_next_action_ctr_pct=0.00
season_step_action_ctr_pct=n/a
season_weekly_mark_from_click_ctr_pct=n/a
season_weekly_mark_from_step_view_ctr_pct=n/a
pct_users_club_workout_open=0.00
pct_users_club_workout_complete=0.00
pct_users_ghost_duel_create=0.00
pct_users_pb_detected=0.00
```

### 3) Segment breakdown

```sql
-- Eseguire sezione 4 del file phase-0-baseline-queries.sql
```

Risultato:

```text
all_users active_28d_pct=8.33
synced_14d active_28d_pct=50.00
club_members active_28d_pct=14.29
masters active_28d_pct=0.00
masters_and_club active_28d_pct=0.00
```

### 4) Data quality checks

```sql
-- Eseguire sezione 5 del file phase-0-baseline-queries.sql
```

Risultato:

```text
unknown_events=[]
null_checks={null_user_id:0, empty_event_name:0, null_created_at:0}
last_7d_events=[{day:2026-03-02,event_name:season_view,events:1,users:1}]
```

## Decisioni (review bisettimanale)
- Keep/remove list: `predictions/recap mantenute dietro flag (default OFF), nessuna rottura route rilevata`
- Re-prioritizzazione backlog Fase 1: `PB Board + Club Meets pilot confermati come prossimo stream`
- Rischi bloccanti per go/no-go: `volumi eventi ancora troppo bassi per interpretazione KPI robusta`

## Note operative
1. In questa macchina `DATABASE_URL` non è configurata, ma i KPI sono stati estratti via connessione Supabase MCP.
2. Snapshot con campione ridotto (12 utenti, 1 evento settimanale core-loop): usare come baseline tecnica iniziale, non come baseline statistica definitiva.
3. Ripetere il refresh report ogni lunedì con lo stesso query pack; congelare decisioni di prodotto finché `daily event continuity` non passa.
