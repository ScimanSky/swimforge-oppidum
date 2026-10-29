# Proposte social approvate: piano a lotti (29 ottobre 2026)

Il 29/10/2026 il proprietario ha approvato tutte le 20 proposte dell'analisi della parte social.
La pagina con le decisioni è https://claude.ai/artifact/KPTHpAB6p18LfY3zvSLKYE: proposte nella
collezione `proposals`, decisioni e note in `decisions`.

La proposta 1 (falle di privacy) era già corretta in produzione con la PR #30.

I lotti partono dopo il rilascio della fase 2, su rami nuovi da `main`. Ogni lotto segue lo
stesso flusso del resto del progetto:
1. design breve se serve;
2. implementazione con test;
3. revisione e correzioni;
4. PR, merge, deploy e controllo da fuori.

## Note del proprietario
- **4.** Sostituire la «Bozza IA» con «Condividi l'ultima nuotata».
- **17.** L'importazione dei risultati delle gare master (nuotosardegna) deve restare; il resto
  del codice spento può sparire. Va chiarito dove mostrare i risultati: profilo, club o entrambi.
- **18.** Il Club AI può generare un'immagine a settimana.
- **20.** Servono dal proprietario il titolare del trattamento e i contatti per privacy e assistenza.
- **21.** Togliere Strava.

## Lotto 1: rapide (S), circa 2 giorni
2. Eliminare un proprio post quando si vuole e poterlo modificare; un solo pulsante
   «Condividi» per la nuotata.
3. «Segna completato» degli allenamenti di club salvato davvero, con «fatto da N su M» per il
   coach. Il collegamento automatico alla nuotata Garmin viene dopo.
4. «Condividi l'ultima nuotata» al posto della «Bozza IA» nel «+».
5. XP solo dal nuoto, un solo calcolo del livello e un solo titolo; ricalcolo una tantum dei
   livelli.
6. Card della nuotata con il passo di Garmin e il bollino dei record fatti in quella nuotata.
   Il bollino «passo soglia migliorato» arriva con le metriche già rilasciate.
7. Ruolo «Coach» assegnabile, negli inviti e nei membri; link «Area coach» e bollino in
   italiano nel club.
10. Meno richieste: chat solo in tempo reale con controllo di riserva ogni 60 s, lista
    conversazioni con una query, niente aggiornamento automatico delle classifiche, niente
    presenza online, inoltri come card.
15. Menzioni con «@» che suggeriscono, collegano e avvisano; tolti il selettore separato e gli
    hashtag.
21. Togliere Strava: client, server, impostazioni, informativa.

## Lotto 2: sicurezza e coerenza (M), circa 3-4 giorni
8. Moderazione: blocca utente, segnalazione e cancellazione dei commenti, segnalazione nei
   club con rimozione da parte dello staff, «Rimuovi post» nella gestione delle segnalazioni.
   Requisito per il Play Store.
9. Interruttori di privacy e notifiche applicati davvero; tolti quelli senza funzione.
11. Reazioni: un solo «Bravo» con l'elenco di chi l'ha dato; conteggi nella query del feed;
    splash eliminati; migrazione delle reazioni esistenti.
14. Profilo pubblico con «Nuotate condivise», follower e seguiti; km del mese e sedute al
    posto di livello e XP.

## Lotto 3: lavori grossi (M), circa 5-6 giorni
12. Sessioni di club ricorrenti con avviso, promemoria, allenamento del coach collegato e
    presenze automatiche dalla nuotata Garmin.
13. Un solo feed e un solo tipo di post («Pubblica in: Tutti / Club X»); schede Seguiti · Club ·
    Tutti.
16. Classifica «Progressi» su adesione (passo soglia, efficienza, costanza) e sfide di 3 tipi
    completabili da tutti, anche nei club.
17. Codice spento in un ramo archivio, tranne l'importazione dei risultati delle gare master;
    interfaccia minima per revoca invito, cancella PDF e annunci, oppure eliminarli.
18. Club AI: riepilogo settimanale con dati veri, andature personali con le zone A1–C3, al
    massimo un'immagine generata a settimana.

## Lotto 4: con la fase 3
19. «Sessioni condivise»: un post può contenere un allenamento, con «Salva nelle mie sessioni», «Invia al
    Garmin», «fatta» collegata alla nuotata.

## Proposta 20: informativa privacy
Va fatta appena arrivano i dati del titolare e i contatti. Elenco reale dei fornitori:
- server Oracle;
- Supabase (database e storage);
- Google Gemini (coach);
- Firebase (notifiche);
- Upstash Redis (cache);
- Garmin;
- eventualmente Anthropic per il confronto dei modelli del coach.

Indicare cosa tratta ciascuno e dove, e i dati sanitari del coach con il loro consenso. Il
testo va riletto dal proprietario, meglio se anche da un consulente.
