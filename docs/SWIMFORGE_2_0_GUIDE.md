# SwimForge 2.0 — Guida Definitiva di Prodotto

## Scopo
Questo documento rende ufficiale la governance strategica della nuova versione SwimForge 2.0 e definisce quali documenti sono vincolanti per decisioni di prodotto, priorita' e delivery.

## Documenti ufficiali (source of truth)
1. Governance canonica: [2026-03-02-unified-strategy.md](/home/scima/projects/swimforge-oppidum-cloud/docs/reports/2026-03-02-unified-strategy.md)
2. Reference tecnico-strategico: [2026-03-02-product-strategy-analysis.md](/home/scima/projects/swimforge-oppidum-cloud/docs/reports/2026-03-02-product-strategy-analysis.md)

## Ruoli dei due report
1. Report unificato canonico:
   - definisce cosa facciamo e in quale ordine;
   - blocca scope, priorita', KPI e rollout;
   - e' la base decisionale per roadmap e backlog.
2. Report tecnico-strategico:
   - approfondisce razionale, benchmark, opzioni implementative;
   - supporta il design delle feature durante sviluppo;
   - non puo' cambiare sequencing/priorita' senza update esplicito del report canonico.

## Regola di precedenza
In caso di conflitto tra documenti:
1. prevale il report unificato canonico;
2. il report tecnico resta riferimento di dettaglio;
3. ogni variazione importante va registrata con revisione versionata.

## Decision lock 2.0 (non in discussione finche' non aggiornate ufficialmente)
1. Segmento prioritario: master agonisti.
2. North star: retention D28.
3. Engagement model: co-op + ranking soft.
4. Strategia delivery: deepen core loop prima di espansione.
5. Pruning policy: feature con adozione bassa vengono ridotte/spente.
6. Sequenza base:
   - Fase 0: baseline + pruning,
   - Fase 1: identita' nuotatore (PB board) + Club Meets rollout,
   - Fase 2: Season v2,
   - Fase 3: Ghost Duels 2.0,
   - Fase 4: Club Rituals,
   - Post settimana 12: CSS Hub completo e stream successivi.

## Chiarimento CSS (risoluzione incongruenza)
1. Entro le prime 12 settimane non e' previsto il CSS Hub completo.
2. E' consentito solo un indicatore preliminare (CSS-lite) per il momento Aha post-sync.
3. Il CSS Hub completo resta nel blocco post-settimana 12, come differenziatore di fase successiva.

## Regole operative per team e agenti
1. Ogni nuova epic deve dichiarare a quale fase 2.0 appartiene.
2. Ogni PR che impatta strategia deve citare i documenti ufficiali sopra.
3. Nessuna feature \"nuova\" entra in sviluppo se non rinforza direttamente il core loop.
4. Ogni 2 settimane:
   - review KPI core,
   - decisione keep/remove,
   - update changelog strategico.

## KPI minimi da monitorare sempre
1. D1, D7, D28 retention.
2. Utenti con almeno 3 accessi/settimana.
3. Completion weekly focus.
4. Partecipazione workout settimanale nei club.
5. Tasso rivincita duel.

## Come aggiornare questa guida
1. Ogni modifica deve:
   - aggiornare la data versione;
   - indicare motivazione e impatto KPI;
   - mantenere coerenza con i due report ufficiali.
2. Se cambia sequencing o priorita':
   - aggiornare prima il report canonico;
   - poi aggiornare questa guida.

## Stato attuale
- Versione guida: 1.0
- Data adozione: 2026-03-02
- Stato: attiva

