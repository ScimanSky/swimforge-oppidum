# SwimForge — Product Strategy Unified Report (V2)

- **Data:** 2026-03-02
- **Versione:** 2.0 (unificazione report Claude + report operativo)
- **Scopo:** consolidare una direzione unica, decision-ready, prima dell'esecuzione

## 1) Executive Summary
SwimForge ha una base tecnica molto buona e un set funzionale ricco, ma oggi soffre di un problema di prodotto classico: **feature breadth alta, core loop debole**.

La sintesi strategica e operativa e':
1. Portare il prodotto da "social fitness app" a **"home digitale del nuotatore"**.
2. Rendere il loop principale inevitabile: **allenamento -> confronto -> contributo club -> prossima azione**.
3. Ridurre feature dispersive e potenziare poche meccaniche ad alto impatto retention.
4. Consegnare in 10 settimane con capacita' realistica (1-2 stream major in parallelo).

## 2) Fonti e metodo
Questo report unifica:
- [Analisi strategica estesa](/home/scima/projects/swimforge-oppidum-cloud/docs/reports/2026-03-02-product-strategy-analysis.md)
- [Piano operativo 10 settimane](/home/scima/projects/swimforge-oppidum-cloud/docs/reports/swimforge-community-action-plan-2026-03-02.md)

Criterio di unificazione: mantenere solo decisioni coerenti con:
1. segmento primario (master agonisti),
2. north star retention D28,
3. budget/infra attuali,
4. time-to-value reale.

## 3) Diagnosi unificata (consenso)

## 3.1 Cosa funziona
1. Data acquisition e integrazioni (Garmin/Strava) sono solide.
2. Statistiche e activity detail hanno buona profondita'.
3. Struttura club e social e' gia' ampia.
4. AI coach/workout e' un differenziatore concreto.

## 3.2 Cosa non funziona ancora
1. **Narrativa prodotto frammentata**: l'utente non vede subito il "perche'".
2. **Season dispersiva**: utile ma non guida il comportamento ricorrente.
3. **Ghost Track passivo**: basso senso di sfida viva e rivincita.
4. **Club sotto-utilizzato come motore retention**: manca rituale settimanale forte.
5. **Troppa competizione tra feature** per attenzione dell'utente.

## 3.3 Insight guida
Per un nuotatore, identita' e motivazione passano da:
1. tempi personali (PB),
2. benchmark di performance rilevanti (es. CSS),
3. appartenenza al club,
4. confronti frequenti e comparabili.

## 4) Decisioni strategiche definitive

## 4.1 Posizionamento
SwimForge deve essere percepito come:
**"La piattaforma dove i nuotatori si allenano, si confrontano e migliorano i propri tempi"**.

## 4.2 North star e guardrail
- **North star:** Retention D28
- **Guardrail:** stabilita', costi AI, latenza API, semplicità UX

## 4.3 Strategia di delivery
- Deepen core loop (no feature sprawl)
- Pruning attivo di elementi deboli
- Co-op + ranking soft
- Rollout progressivo con feature flag

## 5) Cosa eliminare/ridimensionare/subordinare

## 5.1 Riduzioni immediate
1. Ridurre prominenza Battle Pass/Season "decorativa".
2. Mettere in stato deprecato le parti a basso uso di `season.predictions.*`.
3. Ridimensionare `Season Recap Video` a recap leggero (testo/card).
4. Semplificare onboarding iniziale al minimo necessario.

## 5.2 Mantenere ma riposizionare
1. XP/Badge: da feature primaria a reward layer.
2. Ghost legacy: mantenere compatibilita', ma non come main flow.

## 6) Priorita' prodotto unificate (impatto vs complessita')

## Tier 1 (Subito: alto impatto, basso rischio)
1. **PB Board** nel profilo (tempi personali centrali + notifica PB)
2. **Abilitazione Club Meets** dove gia' pronta
3. **Season Core Loop v2** (3 card + next action)

## Tier 2 (Subito dopo)
1. **Ghost Duels 2.0 / Sfide Aperte**
2. **CSS Hub** (profilo + activity detail + AI personalization)
3. **Club Rituals** (workout settimanale + contributo)

## Tier 3 (Post-MVP loop)
1. Lane Buddy
2. Race Prep Mode
3. Workout Community Library
4. Masters segmentation avanzata

## 7) Roadmap integrata (10 settimane)

## Fase 0 — Settimana 1 (Baseline + Pruning)
### Deliverable
1. Event tracking base del core loop.
2. Dashboard D1/D7/D28 + funnel azioni principali.
3. Spegnimento UI feature deboli/non prioritarie.
4. Documento di metriche target per fase.

### Eventi minimi da tracciare
- `season_view`
- `season_next_action_click`
- `pb_detected`
- `ghost_duel_create`
- `ghost_duel_complete`
- `club_workout_open`
- `club_workout_complete`

## Fase 1 — Settimane 2-4 (Core Value Reset)
### Scope
1. Season Core Loop v2 (3 card).
2. PB Board nel profilo (con distinzione training/race-ready).
3. Club Meets rollout iniziale.

### Outcome atteso
- Maggiore chiarezza della prossima azione
- Aumento del ritorno settimanale su Season/Club

## Fase 2 — Settimane 5-7 (Confronto coinvolgente)
### Scope
1. Ghost Duels 2.0 (sfide aperte a finestra temporale).
2. Ranking soft e rivincita immediata.
3. Integrazione feed/club per visibilita' della sfida.

### Outcome atteso
- Piu' frequenza di apertura app pre/post allenamento
- Loop sociale competitivo ma inclusivo

## Fase 3 — Settimane 8-10 (Performance Identity)
### Scope
1. CSS Hub (calcolo + visualizzazione + uso in coaching).
2. Club Rituals: thread post-workout guidati + digest.
3. Stabilizzazione UX e hardening.

### Outcome atteso
- Identita' performance-specific del nuotatore
- Club come motore di continuita'

## 8) API e interfacce (proposta consolidata)

## 8.1 Nuovi endpoint raccomandati
1. `season.getWeeklyFocus`
2. `season.markWeeklyAction`
3. `profiles.personalBests.get`
4. `profiles.personalBests.upsert`
5. `ghostDuels.create`
6. `ghostDuels.submitAttempt`
7. `ghostDuels.rematch`
8. `clubs.workouts.markCompletion`
9. `clubs.rituals.weeklyDigest`
10. `profiles.css.get`
11. `profiles.css.recalculate`

## 8.2 Deprecazioni graduali
1. `season.predictions.*` (keep compatibilita' temporanea)
2. `community.ghostTrack.preview/createFromPost` come entrypoint primario

## 8.3 Nuovi tipi condivisi
1. `WeeklyFocus`
2. `WeeklyAction`
3. `PersonalBestRecord`
4. `GhostDuelTemplate`
5. `GhostDuelAttempt`
6. `GhostDuelResult`
7. `CssProfile`
8. `WorkoutCompletionStatus`

## 9) KPI e criteri di successo

## KPI primari
1. Retention D28 (+30% target)
2. % utenti con 3-4 accessi/settimana
3. % utenti con almeno un loop completo settimanale
4. % membri club che completano workout rituale

## KPI secondari
1. Tasso rivincita duel
2. Tasso notifica PB -> apertura app
3. % utenti con CSS valorizzato
4. Tempo medio da login a first meaningful action

## 10) Test plan consolidato

## Unit
1. Assegnazione weekly focus
2. Scoring duel + edge case
3. Calcolo PB e dedup
4. Calcolo CSS e fallback dati

## Integration
1. Season flow end-to-end
2. Duel flow end-to-end
3. Club workout ritual flow
4. PB detection from sync flow

## E2E
1. New user first 24h aha moment
2. Club member weekly routine
3. Coach workflow workout + feedback

## 11) Rischi e mitigazioni
1. **Scope creep** -> fixed tiers + stop/go gate ogni 2 settimane.
2. **Feature debt legacy** -> deprecazione graduale con monitor usage.
3. **Costo AI** -> AI fuori dal path critico, uso asincrono/opzionale.
4. **Rischio legale integrazioni esterne (es. risultati federali)** -> validazione legale prima di ogni scraping/import.

## 12) Raccomandazioni finali
1. Unificare subito narrativa prodotto in copy e onboarding: PB + Club + Duel.
2. Non aprire nuovi stream finche' Tier 1 e Tier 2 non mostrano delta retention.
3. Fare review KPI ogni settimana, non solo review design.
4. Usare questo documento come baseline ufficiale per backlog e stime tecniche.

## 13) Decision log (fissato)
1. Segmento: master agonisti
2. North star: D28 retention
3. Engagement model: co-op + ranking soft
4. Execution model: 1-2 major stream paralleli max
5. Pruning policy: disattivare cio' che non dimostra valore

---

## Allegati di riferimento
- Strategia estesa: [2026-03-02-product-strategy-analysis.md](/home/scima/projects/swimforge-oppidum-cloud/docs/reports/2026-03-02-product-strategy-analysis.md)
- Piano operativo precedente: [swimforge-community-action-plan-2026-03-02.md](/home/scima/projects/swimforge-oppidum-cloud/docs/reports/swimforge-community-action-plan-2026-03-02.md)
