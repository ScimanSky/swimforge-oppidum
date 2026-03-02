# Phase 0 Baseline Results

- Data report: 2026-03-02
- Finestra baseline: ultime 12 settimane coorti, ultimi 28 giorni core-loop
- Stato: da compilare con output SQL produzione
- Query pack: [phase-0-baseline-queries.sql](/home/scima/projects/swimforge-oppidum-cloud/docs/analytics/phase-0-baseline-queries.sql)
- Runbook: [phase-0-dashboard-runbook.md](/home/scima/projects/swimforge-oppidum-cloud/docs/analytics/phase-0-dashboard-runbook.md)

## Retention
- D1 exact: `TBD`
- D7 exact: `TBD`
- D28 exact: `TBD`
- D7 rolling: `TBD`
- D28 rolling: `TBD`

## Core-loop (last completed week)
- WAU: `TBD`
- season_view_per_wau: `TBD`
- season_next_action_ctr_pct: `TBD`
- pct_users_club_workout_open: `TBD`
- pct_users_club_workout_complete: `TBD`
- pct_users_ghost_duel_create: `TBD`
- pct_users_pb_detected: `TBD`

## Segment health
- all_users active_28d: `TBD`
- synced_14d active_28d: `TBD`
- club_members active_28d: `TBD`
- masters active_28d: `TBD`
- masters_and_club active_28d: `TBD`

## Data quality
- unknown events: `TBD`
- null checks: `TBD`
- daily event continuity: `TBD`

## Output SQL raw da incollare

### 1) Retention (cohort table)

```sql
-- Eseguire sezione 2 del file phase-0-baseline-queries.sql
```

Risultato:

```text
TBD
```

### 2) Weekly core-loop (8 weeks)

```sql
-- Eseguire sezione 3 del file phase-0-baseline-queries.sql
```

Risultato:

```text
TBD
```

### 3) Segment breakdown

```sql
-- Eseguire sezione 4 del file phase-0-baseline-queries.sql
```

Risultato:

```text
TBD
```

### 4) Data quality checks

```sql
-- Eseguire sezione 5 del file phase-0-baseline-queries.sql
```

Risultato:

```text
TBD
```

## Decisioni (review bisettimanale)
- Keep/remove list: `TBD`
- Re-prioritizzazione backlog Fase 1: `TBD`
- Rischi bloccanti per go/no-go: `TBD`

## Note operative
1. In questa macchina non è presente `DATABASE_URL`, quindi i KPI non sono stati precompilati automaticamente.
2. Compilare questo report direttamente dal SQL Editor Supabase usando il query pack linkato sopra.
3. Dopo compilazione, creare commit dedicato con soli valori baseline (nessuna modifica strutturale).
