# SwimForge — Analisi Strategica di Prodotto
**Data:** 2026-03-02
**Autore:** Claude (Sonnet 4.6)
**Scope:** Analisi completa del prodotto attuale + raccomandazioni strategiche per engagement e retention
**Status:** Documento tecnico-strategico di riferimento per SwimForge 2.0
**Ruolo:** Companion operativo del piano canonico; in caso di conflitto su priorità/timing prevale il report unificato canonico

---

## Premessa metodologica

Questo report si basa su:
1. **Analisi completa del codebase** — tutti i file di schema, router tRPC, pagine, componenti
2. **Benchmark competitivo** — SwimWarrior, Swimcloud, Swim.com, MySwimPro, FORM, Commit Swimming
3. **Ricerca su engagement/retention** — meccaniche Strava, Peloton, psicologia delle fitness app

---

## 1. Diagnosi: Il problema fondamentale

SwimForge ha molte feature ma non ha una **narrativa di prodotto** chiara. Un nuotatore che arriva non capisce immediatamente *perché* questo prodotto esiste e cosa lo rende diverso da Garmin Connect o Strava.

Il problema più profondo è l'identità: SwimForge è stato costruito come **"fitness social app"** quando dovrebbe essere una **"swimming community platform"**. La differenza non è semantica — cambia le priorità di ogni singola feature.

### Il modello mentale sbagliato

| Come è costruito oggi | Come lo vive un nuotatore |
|----------------------|---------------------------|
| Attività → sync → statistiche generiche | Allenamento → "a che % del mio CSS ero?" |
| Season con XP e battle pass | Preparazione a una gara specifica |
| Ghost Tracks come confronto storico | Sfida diretta con un compagno di club |
| Profilo con bio e follower | Carta d'identità con i miei tempi personali |
| Challenges generiche (distanza/sessioni) | Classifica per gara/stile nel club |

**L'insight centrale:** I nuotatori hanno un'identità basata sui **tempi per distanza/stile**. Dire "sono un 1:02 nei 100 sl" è equivalente a dire "corro la maratona in 3h30". Strava funziona per i runner perché le *route* sono geograficamente comparabili. Il nuoto in corsia non ha questo — le corsie sembrano tutte uguali. Il differenziatore deve essere il **tempo personale** come identità e la **corsia del club** come comunità.

---

## 2. Inventario dell'esistente: valutazione onesta

### ✅ Cosa funziona bene — da tenere e rafforzare

**Integrazione Garmin/Strava**
È il punto di forza tecnico. I dati acquisiti (laps, lengths, HR zones, SWOLF, stroke rate, VO2max, training effect) sono granulari e corretti. Pochi concorrenti hanno questa qualità di dati. Il problema non è la raccolta ma la *presentazione* e il *significato* dato ai dati.

**Pagina Statistiche**
La sezione `/profile/performance` con timeline, performance analysis e advanced metrics (accordion) è ben implementata. Va mantenuta e potenziata con dati swim-specific (CSS, zone di allenamento).

**Struttura dei Club**
Il modello dati è ricco (eventi, announcement, gallery, workouts, meet, documents). La struttura è giusta, la prioritizzazione delle feature è sbagliata (i workout del coach sono nascosti in un tab, non sono il centro del club).

**AI Coach**
Il coaching conversazionale e i workout generati sono un differenziatore reale. Va migliorato l'accesso (cooldown 7 giorni arbitrario) e la personalizzazione sul CSS del nuotatore.

**Badges e Personal Records**
Il database ha tutto il necessario. Il problema è che i PR sono sepolti, non sono la presentazione primaria del profilo.

---

### ⚠️ Cosa è debole o fuori posto — da cambiare

**Season / Battle Pass**

Il sistema Season è un clone di Fortnite/Duolingo applicato al nuoto. I problemi:
- Le missioni ("nuota 3 volte questa settimana") non parlano la lingua dei nuotatori
- Il concetto di "Season" come periodo gamificato non corrisponde alla stagione agonistica reale
- Le "Activity Predictions/Bets" sono troppo gimmicky — pochi utenti scommetteranno sul proprio allenamento
- Il "Season Recap Video" (Remotion) è costoso da mantenere per l'engagement che genera
- Il "Club Quest" è interessante ma perso in un sistema troppo complesso

*Cosa fare:* Ridurre il Season a uno strato sottile di progressione. L'XP e i badge rimangono utili come sistema di reward, ma non devono essere la feature prominente. La stagione agonistica reale deve diventare la narrativa.

**Ghost Tracks**

Il concetto è giusto, l'esecuzione è sbagliata. Confrontare due attività *già avvenute* di due persone diverse non genera tensione né engagement. È retrospettivo e passivo. Nessuno apre l'app per vedere che Marco ha nuotato meglio 3 giorni fa.

*Cosa fare:* Riprogettare come "Sfide Aperte" (vedi sezione 3).

**Challenges attuali**

Le tipologie attuali (total_distance / sessions / consistency / avg_pace / total_time / longest_session) sono metriche da fitness app generica. Un ciclista o un podista farebbero le stesse sfide. Non c'è niente di specificamente legato al nuoto.

*Cosa fare:* Aggiungere challenge per distanza/stile specifici, con classifica per categoria masters.

**Profilo utente**

Oggi mostra: avatar, bio, follower, badge, stats generiche. Un nuotatore competitivo (anche amatoriale) si identifica con i suoi **tempi personali per gara/stile**. Questo deve essere la prima cosa visibile nel profilo.

*Cosa fare:* La sezione Personal Records (esiste nel DB) deve diventare la carta d'identità. Visibile immediatamente nel profilo pubblico.

**Club Meets (feature-flagged)**

Questa feature è quasi completa ma è spenta di default. Per i club agonistici la gestione delle convocazioni e dei risultati di gara è una feature *essenziale*, non opzionale. Va abilitata e promossa.

---

### ❌ Cosa eliminare o ridimensionare drasticamente

- **Activity Predictions/Bets** — Rimozione. Complessità alta, engagement basso.
- **Season Recap Video (Remotion)** — Ridimensionamento. Bella idea, costo di manutenzione sproporzionato all'uso effettivo. Sostituire con un semplice recap testuale/grafico.
- **Onboarding multi-step complesso** — Semplificare. Gli utenti vogliono vedere il prodotto subito, non compilare profili. Raccogliere solo nome + piscina + sync del dispositivo nel primo accesso.

---

## 3. Cosa aggiungere: priorità per engagement reale

### PRIORITÀ ALTA — Quick wins con impatto immediato

---

#### A. PB Board — Bacheca Tempi Personali *(la killer feature mancante)*

**Perché è la killer feature:** Ogni nuotatore, dal principiante al master, ha tempi personali che vuole migliorare. La community si forma attorno alla corsa al PB. SwimWarrior ha costruito un intero sistema di ranking su questo concetto e ottiene alta retention proprio perché tocca l'identità del nuotatore.

**Cosa costruire:**
- Sezione profilo con PB per ogni combinazione stile/distanza: 50/100/200/400/800/1500 × SL/DO/RA/FA + 100/200 RI, in vasca corta (25m) e lunga (50m)
- PB inseribili manualmente (da gara ufficiale) o estratti automaticamente dalle attività Garmin sincronizzate
- **FINA Points automatici** (formula pubblica) — permette di confrontare tempi tra stili diversi e categorie masters. "Il tuo 200 dorso vale 520 punti FINA" è contestualizzazione potente
- **Club PB Leaderboard** sul tab Stats del club: "Chi è il più veloce nei 100 SL nel nostro club?" con filtro per categoria masters
- **Notifica PB**: "Hai migliorato il tuo PB nei 100 dorso di 0.8 secondi!" — questa è la notifica più emozionante per un nuotatore, e la più condivisibile nel feed

**Impatto atteso:** Alta condivisibilità nel feed, forte engagement nei club, identità dell'utente legata alla piattaforma.

**Complessità implementativa:** Bassa. Il database `personal_records` esiste già. Va arricchito con i campi vasca corta/lunga e il calcolo FINA points (algoritmo pubblico).

---

#### B. Sfide Aperte (riprogettazione Ghost Tracks)

**Il problema attuale:** Il ghost track confronta due attività passate. Non c'è tensione, non c'è aspettativa.

**Il modello corretto:** Una sfida aperta su una distanza specifica, attiva per N giorni. Il dato arriva automaticamente dal sync Garmin/Strava.

**Come funziona:**
1. Utente A posta: *"Sfido chiunque nel club a battere il mio 400 SL: 4:58.3 — aperta 14 giorni"*
2. Tutti i membri del club che nuotano un 400 SL in quei 14 giorni appaiono automaticamente in classifica live (il sistema filtra le attività sincronizzate per distanza ± 5% e stile)
3. La sfida è visibile nel feed del club con classifica aggiornata in tempo reale
4. Fine sfida: classifica definitiva, badge per chi ha vinto/battuto il tempo, post automatico nel feed
5. Variante "Club Record": il coach lancia una sfida sul record del club per una distanza specifica

**Perché funziona:** Ogni volta che un membro va in piscina durante una sfida attiva, ha un motivo specifico per aprire l'app prima e dopo l'allenamento. Questo è il loop di retention di Strava: convertire ogni 2 minuti di app in 1 ora di attività fisica.

**Complessità implementativa:** Media. Il database `ghost_challenges` va riprogettato con campi `targetDistanceM`, `targetStroke`, `openUntil`, `clubId`. Il matching delle attività è un filtro SQL semplice.

---

#### C. Abilitare Club Meets

**Perché è urgente:** La feature esiste al 90%, è solo feature-flagged. Per qualsiasi club agonistico (anche amatoriale serio), la gestione di:
- Convocazioni per le gare
- Raccolta iscrizioni per evento
- Pubblicazione risultati
- Storico dei tempi per atleta

...è una funzione che *sostituisce* email, fogli Excel e WhatsApp. Un club che può fare tutto questo su SwimForge ha un motivo forte per portare tutta la squadra sulla piattaforma.

**Cosa fare:** Abilitare la feature, testare con un club pilota, raccogliere feedback, documentare il workflow per i coach.

---

### PRIORITÀ MEDIA — Features che costruiscono la community nel tempo

---

#### D. CSS Hub — Critical Swim Speed come centro del training

**Perché è importante:** Il Critical Swim Speed è il "threshold pace" del nuoto. MySwimPro lo ha, FORM lo usa, SwimSwam ne parla. È il parametro più utile per allenare in modo intelligente. SwimForge ha tutti i dati Garmin necessari per calcolarlo ma non lo fa.

**Formula CSS:** `CSS = (D2 - D1) / (T2 - T1)` dove D1=distanza breve, T1=tempo breve, D2=distanza lunga, T2=tempo lunga. Tipicamente 400m e 200m (o 1500m e 400m).

**Cosa costruire:**
- Test CSS suggerito con istruzioni (400m a massimo sforzo + 5min recupero + 200m a massimo sforzo)
- CSS calcolato e salvato nel profilo, aggiornabile con nuovi test
- Zone di allenamento derivate automaticamente: aerobico (>CSS+20s/100m), threshold (CSS±5s), VO2max (<CSS-5s), red-mist (<CSS-10s)
- Nell'activity detail: "Questa sessione — 68% aerobico, 24% soglia, 8% VO2max" (calcolato dal pace per lunghezza dalla Garmin lap data)
- Nell'AI Coach: workout generate *in funzione del CSS personale*, non generiche
- Nel profilo pubblico: "CSS: 1:28/100m" come metrica di riferimento

**Complessità implementativa:** Media. I dati per il calcolo ci sono. Richiede: nuovo campo `css_pace_cs` nel profilo, logica di calcolo, UI nel profilo e activity detail.

---

#### E. Lane Buddy — Trova chi nuota al tuo orario e piscina

**Perché manca:** Il problema numero 1 dei nuotatori solitari è trovare qualcuno con cui allenarsi. È un problema locale e ricorrente che si ripresenta ogni settimana. Risolverlo crea engagement settimanale garantito.

**Come funziona (versione semplice, senza over-engineering):**
- Nel profilo: campo "Nuoto a [piscina]" (testo libero o ricerca da database piscine italiane) + "di solito [giorni/orari]" (checkbox multipla)
- Nel feed locale: sezione "Nuotano nella tua piscina" con avatar degli utenti che hanno la stessa piscina
- Bottone "Proponi sessione insieme" → messaggio diretto all'altro utente con data/ora suggerita
- Niente di più complesso — non serve un sistema di booking, solo discovery + DM

**Perché funziona:** Trasforma SwimForge da app di tracking a piattaforma di organizzazione della vita del nuotatore. Se organizzi un allenamento tramite SwimForge, torni sull'app prima, durante e dopo.

**Complessità implementativa:** Bassa. Campo piscina nel profilo + filtro nel feed. Niente new infrastruttura.

---

#### F. Race Prep Mode — Countdown alla gara con suggerimenti di periodizzazione

**Perché è importante:** I nuotatori competitivi si allenano in cicli verso le gare. Questa è la loro narrativa naturale — non "questa settimana ho nuotato 15km" ma "mancano 4 settimane alla regionale, sono nella fase di build".

**Come funziona:**
- Utente inserisce una gara target con data e gare obiettivo (es. "Regionali Master, 14 aprile, 100SL + 200DO")
- App mostra conto alla rovescia e, in base alla distanza temporale, suggerisce la fase: base (>10 settimane), build (6-10 settimane), peak (3-6 settimane), taper (1-2 settimane)
- Il taper suggerito riduce il volume del 20-40% con indicazioni pratiche ("questa settimana max 6 sessioni, intensità alta ma volume basso")
- Dopo la gara: inserimento risultato → confronto con PB → analisi "ha funzionato il taper?"
- Nel feed del club: "3 atleti gareggiano domenica prossima" — widget di supporto con reaction di incoraggiamento

**Complessità implementativa:** Media. Richiede nuovo modello dati `race_goals` (target_date, events, club_meet_id optional). La logica di periodizzazione è basata su regole semplici, non ML.

---

#### G. Workout Community — Library condivisa di allenamenti

**Il gap attuale:** I Club Workouts sono generati dall'AI e visibili solo ai membri del club. Non esiste un meccanismo per condividere allenamenti tra la community più ampia.

**Come funziona:**
- Chiunque (coach o atleta avanzato) può pubblicare un allenamento strutturato (warm-up, main set, drill set, cool-down) con distanze, intensità, recupero e note pedagogiche
- Gli allenamenti pubblicati sono visibili in una sezione "Library" — searchable per focus (tecnica, velocità, resistenza, open water), stile, volume totale
- Quando esegui un allenamento dalla library, puoi postare i tuoi risultati linkati all'allenamento originale
- Contatore "X nuotatori hanno eseguito questo allenamento" — social proof che costruisce credibilità per i coach
- Rating 1-5 stelle dopo l'esecuzione
- I migliori allenamenti (per rating/esecuzioni) emergono in una sezione "Classici"

**Perché funziona:** Crea un motivo per aprire l'app *prima* di andare in piscina (cerco l'allenamento del giorno), non solo dopo. I coach hanno un incentivo a condividere — vedono la loro reputazione crescere.

**Complessità implementativa:** Media. Struttura dati simile ai club_pool_workouts già esistenti. Va aggiunta la visibilità pubblica, il contatore esecuzioni e il rating.

---

### PRIORITÀ BASSA — Miglioramenti a lungo termine

---

#### H. Masters Swimming — Segmentazione per categoria d'età

Il database ha già `masterCategory` nel profilo. Va sfruttato:
- Filtro per categoria nella PB Board del club ("25-29", "30-34", ecc.)
- Leaderboard globale di SwimForge per categoria masters
- FINA Points age-adjusted per comparazione equa tra categorie

#### I. Open Water — Comunità separata

Gli open water swimmer sono una community distinta con esigenze diverse (acque libere, mappe, condizioni meteo, distanze non standard). Un tab dedicato in `/track` con mappa delle nuotate (già c'è routeGeojson nel modello eventi) sarebbe un differenziatore.

#### J. Heatmap di consistenza

Visualizzazione GitHub-style delle sessioni nel tempo. I nuotatori sono ossessionati dalla consistenza. "Hai nuotato ogni martedì per 12 settimane" è più significativo di "streak 84 giorni".

---

## 4. Il loop di engagement che deve esistere

Oggi un nuotatore su SwimForge fa:
`sync Garmin → vede statistiche → posta nel feed → guarda il Season`

Questo loop non ha un *perché* specifico per un nuotatore.

**Il loop che dovrebbe esistere:**

```
Allenamento
    ↓
Sync automatico
    ↓
"Hai migliorato il CSS di 1.3 sec/100m" [notifica specifica]
    ↓
"Sei entrato nella top 3 della sfida 400 SL del club" [social]
    ↓
"Mancano 18 giorni alla gara — settimana di taper, riduci volume 20%" [contesto]
    ↓
Il coach ha pubblicato l'allenamento di martedì 06:30 [ragione pratica per tornare]
    ↓
3 compagni di corsia confermano la sessione [organizzazione sociale]
```

Ogni tocco dell'app deve avere un *perché specifico per un nuotatore*.

---

## 5. Analisi competitiva sintetica

| Piattaforma | Punto di forza | Cosa manca a loro che SwimForge può fare |
|------------|----------------|------------------------------------------|
| **Garmin Connect** | Dati tecnici eccellenti | Community, club, sfide sociali |
| **Strava** | Social graph potente | Nessuna feature swim-specific |
| **MySwimPro** | Workout library + CSS | Community, club, integrazione meet |
| **SwimWarrior** | Ranking per tempi, gamification | Dati di allenamento, Garmin sync |
| **Swimcloud** | Rankings ufficiali, recruiting | Social, community club informale |
| **Swim.com** | Social + tracking combinati | Troppo USA-centrico, no Masters focus |
| **Commit Swimming** | Gestione club professionale | Nessun aspetto social/community |

**L'opportunità di SwimForge** è esattamente l'intersezione: dati tecnici di qualità (Garmin) + community reale (club, feed) + specificità del nuoto (CSS, PB per gara, meet, masters). Nessun concorrente occupa questo spazio in Italia/Europa.

---

## 6. Piano di priorità: matrice impatto/complessità

| # | Feature | Impatto engagement | Complessità | Priorità |
|---|---------|-------------------|-------------|----------|
| 1 | PB Board nel profilo (con FINA points) | ⭐⭐⭐⭐⭐ | 🟢 Bassa | **1** |
| 2 | Abilitare Club Meets | ⭐⭐⭐⭐⭐ | 🟢 Bassa (già fatto) | **1** |
| 3 | Sfide Aperte (riprogettazione Ghost Tracks) | ⭐⭐⭐⭐ | 🟡 Media | **2** |
| 4 | CSS Hub nel profilo e activity detail | ⭐⭐⭐⭐ | 🟡 Media | **2** |
| 5 | Lane Buddy — trova compagni di piscina | ⭐⭐⭐ | 🟢 Bassa | **2** |
| 6 | Race Prep Mode (countdown gara + taper) | ⭐⭐⭐⭐ | 🟡 Media | **3** |
| 7 | Workout Community (library pubblica) | ⭐⭐⭐ | 🟡 Media | **3** |
| 8 | Masters category filtering nei leaderboard | ⭐⭐⭐ | 🟢 Bassa | **3** |
| 9 | Heatmap di consistenza nel profilo | ⭐⭐ | 🟢 Bassa | **4** |
| 10 | Open Water community tab | ⭐⭐ | 🟡 Media | **4** |

---

## 7. Cosa ridurre/rimuovere

| Feature | Raccomandazione | Motivazione |
|---------|----------------|-------------|
| Activity Predictions/Bets | **Rimuovere** | Complessità alta, engagement basso, nessun benchmark di successo |
| Season Recap Video (Remotion) | **Ridimensionare** | Costo manutenzione sproporzionato. Sostituire con recap testuale/card grafica |
| Battle Pass prominence | **Downgradare** | Da feature principale a strato sottile di reward. Non sparisce, ma non è la narrativa |
| Onboarding multi-step | **Semplificare** | Ridurre a: nome + piscina + connetti dispositivo. Stop. |
| Ghost Tracks attuali | **Sostituire** | Tenere il concept ma rimpiazzare l'implementazione con Sfide Aperte |

---

## 8. Considerazioni sulla narrativa di prodotto

SwimForge ha bisogno di una frase che risponde alla domanda: *"Perché devo usare SwimForge invece di Garmin Connect?"*

**Proposta attuale (implicita):** "Un social per nuotatori con gamification"
**Proposta corretta:** "Il posto dove la community dei nuotatori italiani si allena, si sfida e migliora i propri tempi"

La differenza: la seconda proposta mette il nuotatore al centro, non la piattaforma. Ogni feature deve rispondere a "aiuta i nuotatori a migliorare i propri tempi o a connettersi con chi nuota?"

Se la risposta è no — la feature non deve esistere.

---

## 9. Opportunità di posizionamento: la lacuna di Strava

Un dato emerso dalla ricerca merita attenzione separata: **Strava non serve bene i nuotatori**, e questo è documentato, ben noto, e irrisolto da anni.

I problemi specifici di Strava con il nuoto:
- Nessun "segment" per il nuoto (i segment sono il cuore dell'engagement di Strava per ciclisti e runner)
- Dati spesso misclassificati (nuoto riconosciuto come corsa)
- Frequenza cardiaca da HRM-Swim non sincronizzata correttamente
- Pace calcolata male (elapsed time vs moving time)
- Distanza inseribile solo in multipli di 25m/25y — incompatibile con molte piscine

Il risultato: i nuotatori su Strava si sentono "cittadini di seconda classe". Questa frustrazione è documentata e attiva. SwimForge può posizionarsi esattamente come *l'app che Strava avrebbe dovuto costruire per i nuotatori*.

**Implicazione pratica:** Il messaggio di marketing non deve essere "social app per nuotatori" ma "la home digitale del nuotatore — tutto quello che Strava e Garmin Connect non ti danno". Questo è un posizionamento pulito, verificabile e differenziante.

---

## 10. Il "Momento Aha" — la prima sessione è tutto

La ricerca sulle fitness app mostra un pattern chiaro: gli utenti che non vivono un momento di valore nelle prime 24 ore non tornano. Il day-7 retention con un "aha moment" chiaro sale dal 15-20% del settore al 30%+.

**Il problema attuale di SwimForge:** Il sync Garmin funziona, le statistiche appaiono, ma non c'è un momento WOW. Non c'è una notifica emozionante, non c'è un confronto che sorprende, non c'è una scoperta inaspettata.

**Il momento aha corretto per SwimForge:** Non appena arriva il primo sync Garmin, l'app deve:
1. Rilevare automaticamente se c'è un PB in quell'attività
2. Mostrare una celebrazione schermo intero ("Nuovo PB nei 100 SL: 1:04.2 🏆")
3. Calcolare immediatamente il CSS se ci sono abbastanza dati
4. Suggerire 3 persone del club che nuotano negli stessi orari

**Il "Kudos effect" di Strava:** Strava attribuisce alta retention al ricevere social validation nelle prime 24h. Per SwimForge: quando un nuovo utente posta per la prima volta, i membri attivi del club dovrebbero ricevere una notifica "Marco ha appena registrato il suo primo allenamento — dagli il benvenuto". Questo costa zero da costruire e ha impatto alto.

---

## 11. Import risultati gare ufficiali

Un punto emerso dalla ricerca che non era nel piano originale: i nuotatori competitivi **cercano ossessivamente i risultati ufficiali delle gare** (Swimphone, Swimcloud, FIN Italia). Nessuna app italiana aggrega questi risultati in modo sociale.

**Feature specifica:** Integrazione con il database FIN (Federazione Italiana Nuoto) per:
- Import automatico dei risultati ufficiali di gara nel profilo (via scraping della pagina risultati FIN con consenso utente)
- PB da gara ufficiale vs PB da allenamento Garmin — due categorie distinte
- "Hai gareggiato in questo meet — vuoi importare i tuoi risultati?" dopo che un meet del club viene chiuso

Questa è la feature che trasformerebbe SwimForge da app di allenamento ad anagrafe digitale del nuotatore italiano.

---

## Appendice: Fonti

- SwimWarrior engagement platform: [SwimSwam](https://swimswam.com/swimwarrior-the-app-thats-making-competitive-swimming-more-fun-engaging-and-motivating/)
- Strava retention mechanics: [StriveCloud](https://www.strivecloud.io/blog/app-engagement-strava)
- Strava challenges impact (+28% DAU, 90-day retention 18%→32%): [Strava marketing analysis](https://www.latterly.org/strava-marketing-strategy/)
- Peloton community retention (+20% con tribe culture): [Tacticone case study](https://www.tacticone.co/blog/peloton-personalization-community-and-growth)
- Metriche swimmer tracking (SWOLF, CSS, pace zones): [MySwimPro](https://blog.myswimpro.com/2021/06/15/track-these-6-metrics-to-improve-your-swimming/)
- FORM Smart Goggles (real-time HUD, 2024 award): [DC Rainmaker review](https://www.dcrainmaker.com/2024/04/smart-goggles-review.html)
- Swimcloud features: [swimcloud.com](https://www.swimcloud.com/)
- Commit Swimming team management: [commitswimming.com](https://www.commitswimming.com)
