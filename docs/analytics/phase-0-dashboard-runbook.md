# SwimForge 2.0 - Phase 0 Dashboard Runbook

Date: 2026-03-03
Owner: Product + Engineering
Source spec: [Phase 0 Baseline Spec](/home/scima/projects/swimforge-oppidum-cloud/docs/reports/2026-03-02-phase-0-baseline-spec.md)
SQL pack: [phase-0-baseline-queries.sql](/home/scima/projects/swimforge-oppidum-cloud/docs/analytics/phase-0-baseline-queries.sql)

## 1) Objective
Build the Week-1 baseline and keep a weekly KPI cadence before Phase 1 rollout.

## 2) Where to run
1. Open Supabase project SQL Editor.
2. Run sections from `phase-0-baseline-queries.sql` one by one.
3. Copy outputs into a weekly snapshot file (template below).

## 3) KPI panels to publish

## Retention
1. D1 exact retention (%).
2. D7 exact retention (%).
3. D28 exact retention (%).
4. D7 rolling retention (%).
5. D28 rolling retention (%).

## Core-loop (weekly)
1. WAU from `product_engagement_events`.
2. `season_view_per_wau`.
3. `season_next_action_ctr_pct`.
4. `% users with >=1 club_workout_open`.
5. `% users with >=1 club_workout_complete`.
6. `% users with >=1 ghost_duel_create`.
7. `% users with >=1 pb_detected`.

## Season funnel v2 (weekly, Phase 1 extension)
1. `season_step_action_ctr_pct` (`season_step_action_click / season_step_view`).
2. `season_weekly_mark_from_click_ctr_pct` (`season_weekly_action_marked / season_step_action_click`).
3. `season_weekly_mark_from_step_view_ctr_pct` (`season_weekly_action_marked / season_step_view`).

## Segment health
1. Active 28d for `all_users`.
2. Active 28d for `synced_14d`.
3. Active 28d for `club_members`.
4. Active 28d for `masters`.
5. Active 28d for `masters_and_club`.

## 4) Data quality checklist (must pass)
1. Unknown event names = 0.
2. Null `user_id` / null `event_name` / null `created_at` = 0.
3. Daily volumes present for all canonical events in the last 7 days.

If one check fails: freeze KPI interpretation, fix tracking first.

## 5) Reporting cadence
1. Baseline capture: Week 1 (Phase 0).
2. Weekly update: every Monday.
3. Bi-weekly product review: keep/remove decisions every 2 weeks.

## 6) Go/No-Go gate for Phase 1
Phase 1 starts only if:
1. Tracking is stable in production (quality checklist passed).
2. Baseline D1/D7/D28 is available.
3. Weekly core-loop dashboard is published.
4. No P1 regression on feed/club/workouts.

## 7) Snapshot template
Create a file named:
`docs/reports/YYYY-MM-DD-phase-0-baseline-results.md`

Use this structure:

```md
# Phase 0 Baseline Results

## Retention
- D1 exact: X%
- D7 exact: X%
- D28 exact: X%
- D7 rolling: X%
- D28 rolling: X%

## Core-loop (last completed week)
- WAU: X
- season_view_per_wau: X
- season_next_action_ctr_pct: X%
- season_step_action_ctr_pct: X%
- season_weekly_mark_from_click_ctr_pct: X%
- season_weekly_mark_from_step_view_ctr_pct: X%
- pct_users_club_workout_open: X%
- pct_users_club_workout_complete: X%
- pct_users_ghost_duel_create: X%
- pct_users_pb_detected: X%

## Segment health
- all_users active_28d: X%
- synced_14d active_28d: X%
- club_members active_28d: X%
- masters active_28d: X%
- masters_and_club active_28d: X%

## Data quality
- unknown events: pass/fail
- null checks: pass/fail
- daily event continuity: pass/fail

## Decisions
- Keep/remove list (2-week cycle)
- Backlog updates for next phase
```

## 8) Notes on interpretation
1. `product_engagement_events` starts at Phase 0; early weeks can look low compared with historical behavior.
2. Retention query uses a canonical active-day signal that includes historical fallback (`swimming_activities`, `social_posts`) to avoid blind spots.
3. Compare week-over-week trends, not only absolute values in a single week.
