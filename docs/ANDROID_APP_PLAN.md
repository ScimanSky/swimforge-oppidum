# SwimForge Android — piano proposto (27 ottobre 2026)

Stato: **approvato il 27/10/2026** (Capacitor confermato; decisioni in §7). Nasce dal confronto fra l'inventario delle funzionalità
attuali di SwimForge e l'analisi di un'app Android concorrente orientata all'allenamento
(report locale in `docs/reports/2026-10-27-swimbox-rea.md`, non versionato).

## 1. Decisione architetturale: Capacitor sul client esistente

L'app concorrente analizzata è esattamente questo: una web app React impacchettata con
Capacitor, con il nativo usato solo per push, fotocamera, condivisione, schermo acceso,
lettura vocale e acquisti. SwimForge è già React + Vite + Tailwind con un backend tRPC
separato, quindi la strada più corta e meno rischiosa è la stessa.

| Opzione | Riuso | Tempo per una prima APK | Note |
|---|---|---|---|
| **Capacitor (consigliata)** | ~100% del client | giorni | Plugin nativi per tutto ciò che serve; stessa base per iOS |
| TWA / Bubblewrap (PWA) | 100% | ore | Niente plugin nativi, serve PWA completa (manifest, SW), push solo web |
| React Native / Expo | ~0% UI, riuso logica tRPC | settimane/mesi | Riscrittura di tutte le schermate |
| Kotlin + Compose | 0% | mesi | Riscrittura totale, doppio codice da mantenere |

Implicazioni tecniche da gestire (tutte note, nessuna bloccante):
- **Auth**: oggi il client usa cookie di sessione + cookie CSRF (`client/src/main.tsx:61`
  `credentials: "include"`, `server/routers/auth.router.ts`). Nel WebView l'origine è
  `https://localhost`, quindi i cookie sono cross-site. Soluzione: nel build nativo
  inviare il token di sessione in header `Authorization` (il server lo accetta già per
  il token Supabase in fase di login; va esteso al session token) e disattivare il
  controllo CSRF per le richieste con header. Alternativa: `CapacitorCookies` +
  `SameSite=None; Secure`.
- **Login Google**: Google rifiuta OAuth dentro i WebView. Usare il plugin Browser
  (Custom Tabs) e un deep link di ritorno (`swimforge://auth/callback` o App Link
  `https://swimforge.it/auth/callback`). Stesso schema per Strava.
- **CORS**: aggiungere `https://localhost` e `capacitor://localhost` alle origini
  consentite dal server Express.
- **Build**: `vite build` → `webDir: dist/public` (o la cartella attuale del client) →
  `npx cap sync android` → Android Studio/Gradle. JDK 17/21 e Android SDK sono già sul PC.
- **Bundle incluso nell'APK** (avvio immediato, shell offline) con aggiornamenti via Play.
  Niente caricamento remoto del sito.
- **Backend invariato** su Render; valutare un piano senza cold start, perché un'app
  nativa che resta "a caricare" 30 s al primo avvio viene disinstallata.

## 2. Stato di partenza (sintesi)

- Produzione viva: `https://swimforge.it` risponde; Supabase `swimforge-oppidum` è
  ACTIVE_HEALTHY (il progetto `SwimForge` più vecchio è INACTIVE e non è quello in uso).
- Solo web responsive: nessun Capacitor, nessuna PWA, nessuna push notification.
- Dati: solo Garmin (libreria non ufficiale, con email e password dell'utente) e Strava;
  inserimento manuale bloccato lato server.
- Molte funzioni dietro flag spenti o giudicate deboli nei report di marzo 2026:
  predizioni/scommesse, recap video Remotion, Ghost track, sfide generiche, missioni di
  stagione, meet e storia dei club, automazioni AI dei club.
- Codice morto: `Dashboard.tsx`, `SessionInsights.tsx`, `CoachDryland.tsx`, `Map.tsx`,
  `ClubDetail.tsx`, `ComponentShowcase.tsx`, `components/dashboard/*`,
  `StatisticsAccordion.tsx`.
- Obiettivi personalizzati salvati solo in localStorage; FC a riposo fissa a 60 nelle
  statistiche; club stats API non costruita; sidebar feed con mock.

## 3. Cosa togliere (proposta)

| Elemento | Azione | Perché |
|---|---|---|
| Predizioni/scommesse, recap video Remotion, "core loop v2" | rimuovere codice e flag | mai attivati, giudicati da rimuovere o ridimensionare |
| Ghost track / ghost challenges | rimuovere dall'app Android (parcheggiare il codice) | esecuzione giudicata scarsa; si può ripensare dopo |
| Stagioni a 56 giorni con battle pass, missioni, club quest | **DECISO 27/10**: tenere XP, livelli, badge e classifiche; togliere stagioni, battle pass, missioni e club quest | missioni "non specifiche per il nuoto"; complessità alta per il valore percepito |
| Sfide utente generiche | semplificare a 3 tipi (metri totali, sedute, costanza) o rinviare | troppo generiche |
| Meet, storia club, automazioni AI dei club | fuori dalla prima app Android (flag restano spenti) | 2.300 righe di router per funzioni mai attivate |
| Codice morto elencato sopra | cancellare | peso del bundle e manutenzione |
| Obiettivi in localStorage | portare su server o togliere | su mobile si perdono a ogni reinstallazione |
| Storie 24h | **DECISO 27/10**: rimuovere (UI, router e cron; le tabelle restano) | costo di mantenimento (upload mobile instabile da roadmap) |
| Blocco dell'inserimento manuale | rimuovere il blocco: attività manuale ammessa ma marcata "manuale", senza XP (o XP ridotto) e fuori classifica | sblocca chi non ha Garmin, senza rovinare le classifiche |
| Login Garmin con email/password | sostituire appena possibile (vedi fase 4) | fragile, MFA problematico, contro i termini Garmin |

## 4. Cosa aggiungere (dal concorrente, adattato a SwimForge)

Priorità P1 = nella prima app pubblicata, P2 = subito dopo, P3 = quando serve.

| # | Funzione | P | Come si innesta in SwimForge |
|---|---|---|---|
| 1 | **Sessione di allenamento personale** come oggetto: blocchi (riscaldamento, tecnica, principale, defaticamento), ripetute (n × distanza, stile, zona/andatura, recupero, attrezzo) | P1 | esiste già per i club (`club_workouts_ai`, schema blocchi); generalizzare a utente con libreria personale |
| 2 | Crea sessione: **Scrivi** (testo libero con parser "8x100 SL Z3 r20"), **Fotografa** (OCR con Gemini vision del foglio a bordo vasca), **Genera con AI** (già c'è il coach Gemini) | P1 | Gemini già integrato; fotocamera via Capacitor |
| 3 | **Calendario** con sessioni pianificate, "sposta", **"Segna come fatta"** collegando l'attività Garmin sincronizzata lo stesso giorno | P1 | chiude il cerchio piano → esecuzione → analisi |
| 4 | **Esporta PDF** della sessione da portare a bordo vasca (jsPDF) | P1 | banale e amatissimo |
| 5 | **Modalità bordo vasca**: schermo acceso (keep-awake), caratteri grandi, avanzamento serie per serie, lettura vocale (TTS) | P2 | plugin Capacitor keep-awake + text-to-speech |
| 6 | **Velocità critica (CSS)** da test 400/200 o 10', **zone** di passo e HR, **tabella andature** per zona e distanza, scala FIN A1-C3 | P1 | già pianificato come "CSS Hub" nella strategia di marzo |
| 7 | **Carico interno** (punti = tempo per zona HR pesato; SwimForge ha già il tempo nelle zone 1-5 da Garmin) con grafico 12 settimane; **recupero** (ACWR acuto/cronico) con feedback giornaliero | P2 | dati già nel DB (`time in HR zones`, training effect) |
| 8 | **Feedback post-seduta**: RPE 1-10, obiettivo raggiunto, nota | P1 | alimenta Session IQ e il coach |
| 9 | **Check-in settimanale** (30 s) → il coach AI genera la settimana successiva | P2 | estende il piano giornaliero attuale a piano settimanale |
| 10 | **Home "Oggi"**: sessione di oggi, ultima attività, carico settimana, 4 azioni rapide (Allenati ora, Pianifica, Sincronizza, Chiedi al coach). Il feed social diventa la seconda tab | P1 | **DECISO 27/10**: sì, home "Oggi" con feed in seconda tab |
| 11 | **Coach AI contestuale**: la chat sa in che schermata sei (attività, sessione, piano) e propone domande | P2 | la chat Gemini esiste, manca il contesto per schermata |
| 12 | **Push notifications** (FCM via Capacitor): sync completata, PB, promemoria sessione, DM, commenti, risposte del coach | P1 | server: Firebase Admin SDK su Render; tabella device token |
| 13 | **Condividi immagine** dell'attività (card con statistiche su foto) verso Instagram/WhatsApp | P2 | plugin Share + canvas |
| 14 | **Gare** con data, tempo target, passo target, priorità; PB collegati alla gara | P2 | estende Goals + PB Board |
| 15 | **Import file FIT/TCX/GPX** dal file picker (Garmin Connect, Apple, Coros, Polar esportano tutti FIT) | P1 | copre tutti gli orologi senza nuove integrazioni; libreria `fit-file-parser` |
| 16 | Garmin: **aggiornare python-garminconnect da 0.3.5 a 0.3.20** (login mobile riparato, MFA ripristinabile tra processi, timezone del profilo) e usare le API nuove di §4b. L'**API ufficiale** (Connect Developer Program) resta l'opzione a lungo termine | P1 | il servizio Python esiste già; vedi §4b |
| 17 | Classifica **per piscina/città** con opt-in | P3 | SwimForge ha già club e leaderboard: aggiungere "piscina" al profilo basta |
| 18 | Analisi video: variante "chiedi al coach del club" (upload 60 s, il coach del club risponde) | P3 | nessuno staff centrale; i club sì |
| 19 | Richiesta recensione in-app, sondaggio di uscita | P3 | plugin pronto |

| 20 | **Invia al Garmin**: una sessione pianificata diventa un workout strutturato sull'orologio (`upload_swimming_workout` + `schedule_workout` + `push_workout_to_device`), con obiettivi di passo relativi alla CSS (`SwimCssOffsetTarget`) | P2 | la funzione che il concorrente segna "presto disponibile" |

Fuori scope: abbonamenti/paywall, pacchetti a pagamento, articoli, Polar/Wahoo, speech-to-text.

### 4b. Novità di python-garminconnect verificate il 27/10/2026

Stato attuale: `garmin-service/requirements.txt` pinna `garminconnect==0.3.5`; il servizio usa
`login`/`resume_login` con `return_on_mfa=True`, `get_activities`, `get_activity_details`,
`get_activity_splits`, `get_activity_typed_splits`, `get_activity_hr_in_timezones`,
`get_activity_evaluation`. Immagine Docker `python:3.12-slim` (la libreria richiede
Python ≥ 3.12; dipendenza unica `curl_cffi`, niente più `garth`).

Release utili (fonte: release notes GitHub e pacchetto 0.3.20 installato in locale):

| Versione | Novità | Dove serve nel piano |
|---|---|---|
| 0.3.20 (23/10) | Login mobile di nuovo funzionante (da aprile rispondeva 429 e si cadeva sui fallback lenti); `login()` con `return_on_mfa=True` restituisce `("needs_mfa", client_state)` **serializzabile in JSON**, ripristinabile con `Garmin().resume_login(client_state, code)` anche in un altro processo o dopo un riavvio; HTTP 427 (blocco) segnalato chiaramente | Fase 0 Task 17: oggi lo stato MFA vive in memoria (`pending_mfa`) e si perde al riavvio del container |
| 0.3.19 (16/10) | 340+ metodi allineati alla web app; **timezone del profilo Garmin** per "oggi" (il server Oracle gira in UTC); `get_critical_swim_speed`/`_range`; `get_heart_rate_zones_v2` e `update_heart_rate_zones`; `get_daily_summaries`; training readiness e stato allenamento in range | #6 CSS e zone: importare i valori già calcolati da Garmin oltre a stimarli; #7 |
| 0.3.18 (15/10) | `SwimCssOffsetTarget` (passo relativo alla CSS nei workout), `create_repeat_group(skip_last_rest_step=…)`, `get_activity_images`, `py.typed` | #20 Invia al Garmin |
| 0.3.17 (29/9) | Target di intensità negli step (`PaceTarget`, `HeartRateZoneTarget`…), `get_training_four_week_load_balance`, `get_daily_training_status` (carico acuto/cronico), `get_training_load_activities` | #7 carico e recupero: usare i valori Garmin quando ci sono, stimare solo in mancanza |
| 0.3.13-0.3.16 | `get_activities(activitysubtype=…)`, `get_personal_record` documentato, `get_next_scheduled_workout`, correzioni a `resume_login` | #14 PB; #20 |
| 0.3.10-0.3.11 | Hardening token store (symlink, scritture atomiche, lock), `download_health_snapshot` | già allineato dal commit "Fix Garmin token store permissions" |

Altri metodi disponibili e utili: `get_activity_swim_details`, `get_activity_laps`,
`get_personal_records_for_activity`, `download_activity` (FIT originale per archivio e
re-import), `get_hrv_data`, `get_body_battery`, `get_sleep_data`, `get_training_readiness`,
`get_max_metrics` (VO2max), `get_devices`, `get_workouts`, `get_scheduled_workouts`.
Modello workout tipizzato (`garminconnect[workout]`, Pydantic): `SwimmingWorkout`,
`WorkoutSegment`, `ExecutableStep`, `RepeatGroup`, `create_distance_interval_step`,
`create_targeted_distance_interval_step`, `create_warmup_step`, `create_cooldown_step`,
`create_recovery_step`, `StrokeTypeModel`, `EquipmentTypeModel`.

Conseguenze per il piano:
1. La richiesta all'API ufficiale Garmin non è più urgente: la libreria è mantenuta
   attivamente (6 release in 6 settimane) e copre più di quanto serva. Resta il rischio
   dei termini d'uso Garmin e dei blocchi (427): tenere l'import FIT come rete di
   sicurezza e valutare l'API ufficiale dopo la pubblicazione.
2. Il recovery score (#7) può partire dai dati Garmin (training readiness, HRV, body
   battery, sonno, carico acuto/cronico) invece che da una stima interna.
3. "Invia al Garmin" (#20) rende la sessione SwimForge eseguibile sull'orologio, con
   ripetute e passi target: è il passo che chiude davvero il cerchio piano → vasca.


## 5. Fasi

Ogni fase finisce con: test (`pnpm check`, `pnpm test`), build APK, prova sul Pixel 8a,
commit e push. Stime in giorni di lavoro effettivo con Claude Code.

### Fase 0 — Pulizia e base mobile (2-3 giorni)
- Cancellare codice morto e funzioni rimosse (§3), togliere i flag relativi.
- Auth con header per il nativo, CORS, deep link di callback per Google e Strava.
- Obiettivi su server; FC a riposo reale; rimozione mock sidebar.
- Aggiunto il 27/10 (novità Garmin): aggiornare `garmin-service` a python-garminconnect
  0.3.20 e rendere persistente lo stato MFA (Task 17 del piano di fase 0).
- Gate di uscita: web invariata in produzione, test verdi.

### Fase 1 — Guscio Android con Capacitor (2-3 giorni)
- `@capacitor/core`, `@capacitor/android`, progetto `android/` nel repo, icona e splash,
  status bar e safe area, gestione tasto Indietro, Browser per OAuth, Share, Camera per
  post e storie, Keep-awake, Push (FCM: progetto Firebase, `google-services.json`,
  tabella `device_tokens`, invio server).
- App Links per `swimforge.it` (i link del feed aprono l'app).
- Distribuzione interna: APK diretto o Firebase App Distribution (come già fatto per
  GymBro). Aprire subito il Play Console: per gli account personali la prima
  pubblicazione richiede un test chiuso con 12 tester per 14 giorni (da verificare,
  la regola cambia).
- Gate: l'app installata sul Pixel fa login, sync Garmin, feed, DM, con push ricevuta.

### Fase 2 — Nuova veste grafica (3-4 giorni, in parallelo a 0-1)
- Base scelta: la proposta **«Corsia»** (`docs/design-proposals/claude-corsia/`, 27/10):
  un accento azzurro `#34C6EB` per le azioni, arancio `#FF8B47` solo per XP e record,
  Barlow Condensed per numeri e titoli, Manrope per il testo, niente glow né gradienti,
  mai testo su foto, tutto in italiano, tema scuro + chiaro «Cloro». L'audit incluso
  (font mai caricati, cinque accenti neon, nav duplicata, lingua mista) è corretto.
- Adattamenti obbligatori rispetto alle tavole, per coerenza con le decisioni del 27/10:
  1. la tab **Season** sparisce (stagioni rimosse): il suo contenuto utile (livello, XP al
     prossimo livello, posizione in classifica, badge, sfide) va in una tab
     **Community** insieme ai club, oppure nel profilo;
  2. la **Home** non è il feed: è la schermata **"Oggi"** (sessione di oggi, ultima
     attività, carico settimana, 4 azioni rapide); il feed diventa la seconda tab e
     perde la riga delle storie;
  3. navigazione proposta: **Oggi · Feed · + · Allena · Community**, con Allena che
     raccoglie Sessioni, Attività, Statistiche e Coach AI;
  4. mancano le tavole del cuore allenamento (fase 3): libreria/creazione sessione,
     calendario, modalità bordo vasca, velocità critica e zone: vanno disegnate con lo
     stesso sistema prima di implementarle;
  5. nell'app Capacitor i font vanno inclusi nel bundle (niente Google Fonts a runtime).
- Vincoli invariati: dark-first, contrasto alto per bordo vasca bagnato, target touch
  ≥ 48 dp, 5 tab in basso.

### Fase 3 — Cuore allenamento (5-7 giorni)
- Sessione personale (§4 #1), creazione Scrivi/Fotografa/AI (#2), calendario e
  "segna come fatta" (#3), PDF (#4), feedback post-seduta (#8), home "Oggi" (#10).
- Gate: dal Pixel creo una sessione da foto, la pianifico, nuoto con Garmin, la seduta
  viene collegata e commentata dal coach.

### Fase 4 — Fisiologia e dati (4-5 giorni)
- CSS, zone, tabella andature, scala FIN (#6); carico e recupero (#7); check-in
  settimanale e piano settimanale AI (#9); import FIT/TCX (#15); inserimento manuale
  marcato; richiesta accesso Garmin API ufficiale (#16, avviata già in fase 0).

### Fase 5 — Bordo vasca e social mobile (3-4 giorni)
- Modalità bordo vasca con TTS (#5), coach contestuale (#11), condivisione immagine
  (#13), gare e PB collegati (#14), rifinitura club base (feed, eventi, allenamenti del
  coach).
- Gate: pubblicazione nel test chiuso del Play Store.

### Fase 6 — Dopo la pubblicazione
- Garmin API ufficiale in produzione, classifica per piscina (#17), video al coach del
  club (#18), review in-app (#19), eventuale iOS con lo stesso progetto Capacitor.

Totale indicativo: 20-27 giorni di lavoro per arrivare al test chiuso.

## 6. Rischi e prerequisiti

- Render free tier e cold start: su mobile si percepisce molto più che sul web.
- Garmin: la libreria non ufficiale può rompersi in qualsiasi momento; l'import FIT è la
  rete di sicurezza, l'API ufficiale la soluzione.
- Play Store: account sviluppatore, chiave di firma (Play App Signing), privacy policy
  già presente (`PRIVACY_POLICY.md`), dichiarazione dati, test chiuso con tester.
- Firebase: nuovo progetto solo per FCM (nessun Analytics, nessun permesso pubblicità).
- Due sessioni Claude sullo stesso working tree vanno evitate; per lavoro parallelo
  usare un worktree git separato.

## 7. Decisioni prese (27/10/2026)

1. Capacitor come architettura: **sì**.
2. Gamification leggera: restano XP, livelli, badge e classifiche; via stagioni, battle
   pass, missioni e club quest.
3. Storie 24h: **rimosse**.
4. Home "Oggi" con feed social in seconda tab: **sì**.
5. Walkthrough con screenshot dell'app concorrente: rinviato a un'altra sessione.

Azione a carico del proprietario: richiedere l'accesso al Garmin Connect Developer
Program (serve un account aziendale/sviluppatore Garmin; l'approvazione richiede
settimane).
