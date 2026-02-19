# Season Hub - Audit UI/UX & Engagement

**Data:** 2026-02-17
**Scope:** `/season` page, backend season, sistema badge, Dashboard, Badges page, SeasonRecapVideo, SeasonLaunchPopup
**Obiettivo:** Identificare criticita di usabilita, information architecture, engagement e accoppiamento badge/season.

---

## 1. Mappa strutturale attuale

La pagina Season Hub contiene **8 sezioni** distribuite su 2 colonne:

| Colonna Main (5 accordion) | Sidebar (3 accordion) |
|---|---|
| Missioni Daily | Club Quest Settimanale |
| Action XP Giornaliero | Classifica Season |
| Previsione Allenamento | Badge Assegnazioni S1 |
| Missioni Weekly | |
| Reward Track | |

**Header:** nome season, level badge, tempo rimanente, mode badge, 2 MetricOrb, progress bar livello.

Tutti i contenuti sono in **accordion collapsibili** con pattern identico (titolo + sottotitolo + lista di card).

---

## 2. Criticita UI/UX

### 2.1 CRITICA - Overload informativo: troppe sezioni, tutte uguali

**Problema:** 8 accordion su una singola pagina, tutti con lo stesso pattern visivo (titolo bold + sottotitolo grigio + lista di `stream-card`). L'utente non riesce a distinguere cosa e importante, cosa e urgente, cosa e azionabile.

**Evidenza nel codice:**
- `Season.tsx:286-556` - 5 `AccordionItem` identici nella colonna main
- `Season.tsx:563-701` - altri 3 `AccordionItem` identici nella sidebar
- Solo "daily" e "club-quest" sono aperti di default, il resto e nascosto

**Impatto:** L'utente apre la pagina e vede un muro di titoli collassati. Non sa da dove cominciare. L'informazione piu rilevante (cosa devo fare ORA) e diluita in un mare di opzioni.

### 2.2 CRITICA - Nessuna gerarchia visiva tra le sezioni

**Problema:** Le 8 sezioni hanno tutte lo stesso peso visivo: bordo identico, padding identico, tipografia identica. Non c'e distinzione tra:
- Azioni urgenti (missioni daily che scadono a mezzanotte)
- Progressi passivi (leaderboard, badge assignments)
- Funzionalita avanzate (previsione allenamento)

**Proposta:** Organizzare per priorita temporale e azionabilita:
1. **Zona "Oggi"** - Missioni daily + Action XP (sempre visibili, non collapsabili)
2. **Zona "Settimana"** - Weekly missions + Club Quest (collapsabile)
3. **Zona "Season"** - Reward Track + Leaderboard + Badge (tab o sotto-navigazione)

### 2.3 ALTA - Form Previsione sepolto in un accordion

**Problema:** La feature "Previsione Allenamento" richiede 5 input (distanza, pace, durata, RPE, nota) ed e nascosta dentro un accordion che di default e chiuso. E un'azione che andrebbe fatta PRIMA di andare in piscina, ma l'utente deve:
1. Aprire la pagina Season
2. Trovare l'accordion giusto tra 5
3. Espanderlo
4. Compilare il form

**Evidenza:** `Season.tsx:352-477` - form complesso con 5 `<Input>` + 2 `<Button>` nascosto in un accordion.

**Proposta:** Spostare la Previsione in un bottone CTA dedicato nell'header o in una card prominente "Prima di nuotare..." con un dialog/bottom-sheet dedicato.

### 2.4 ALTA - Testo troppo piccolo e denso

**Problema:** L'intera pagina usa `text-[10px]` e `text-xs` (12px) per la maggior parte del contenuto. Le badge sono `text-[10px]`, i sottotitoli `text-xs`, i valori numerici nelle card `text-xs`. Su mobile questo crea un muro di testo illeggibile.

**Evidenza:**
- `Season.tsx:231-232` - Badge "Battle Pass" a `text-[10px]`
- `Season.tsx:241-247` - 3 badge inline tutte `text-[10px]`
- `Season.tsx:273-275` - label e valore progress `text-[10px]`
- Ripetuto sistematicamente in ogni sezione

**Proposta:** Aumentare la gerarchia tipografica. I valori chiave (XP, livello, % completamento) devono essere almeno `text-base` o `text-lg`. Usare icone e colore al posto di testo dove possibile.

### 2.5 ALTA - Lingue miste IT/EN confuse

**Problema:** La pagina mescola costantemente italiano e inglese senza logica coerente:

| Italiano | Inglese |
|---|---|
| Missioni Daily | Action XP Giornaliero |
| Progressione livello | Progress cap |
| Riscatta / Riscattata | Reward Track |
| Obiettivi rapidi giornalieri | Battle Pass |
| Classifica Season | Club Quest Settimanale |

**Impatto:** L'utente italiano non-tecnico non capisce "Action XP", "RPE", "Reward Track", "Battle Pass". L'utente internazionale non capisce "Riscatta", "Missioni".

**Proposta:** Scegliere UNA lingua primaria (italiano, dato il target) e usare l'inglese solo per termini gaming universali (XP, Level). Esempio: "Traccia Ricompense" invece di "Reward Track", "Sfida Giornaliera" invece di "Action XP Giornaliero".

### 2.6 MEDIA - Preview troncate senza "Mostra tutto"

**Problema:** Ogni sezione mostra un sottoinsieme dei dati (`dailyPreview.slice(0,3)`, `rewardsPreview.slice(0,4)`, `leaderboardPreview.slice(0,5)`) ma non c'e nessun indicatore di quanti elementi mancano ne un bottone "Mostra tutti".

**Evidenza:** `Season.tsx:192-197` - 6 variabili `*Preview` che tagliano i dati.

**Impatto:** L'utente non sa se ha 3 missioni daily o 10. Non sa se la leaderboard ha 5 persone o 50.

### 2.7 MEDIA - Sidebar identica al main content

**Problema:** La sidebar (`Season.tsx:561-710`) usa lo stesso identico pattern visivo della colonna principale (accordion con stream-card). Non c'e differenziazione tra contenuto primario e secondario.

**Proposta:** La sidebar dovrebbe avere un layout piu compatto e widget-style (mini leaderboard con avatar, badge grid con thumbnails, quest progress ring).

### 2.8 MEDIA - Nessun feedback visivo per azioni completate

**Problema:** Quando una missione viene completata, l'unico indicatore e il cambio di variante del Badge da `outline` a `neon`. Non c'e:
- Animazione di completamento
- Effetto confetti/sparkle
- Suono (come nella pagina Badges che ha 12 suoni diversi)
- Separazione visiva tra missioni complete e incomplete

**Evidenza:** `Season.tsx:303` - unico indicatore: `variant={mission.completed ? "neon" : "outline"}`.
Per confronto, `Badges.tsx:197-211` ha 12 file audio per le animazioni badge unlock.

**Proposta:** Aggiungere animazioni di completamento (checkmark animato, glow effect, micro-celebrazione).

### 2.9 BASSA - Nessun empty state significativo

**Problema:** Gli empty state sono stringhe generiche:
- "Nessun club attivo. Entra in un club per sbloccare la quest settimanale."
- "Classifica non disponibile."
- "Nessuna previsione registrata."

**Proposta:** Empty state con illustrazione/icona, CTA chiara, e spiegazione del beneficio (es. "Crea la tua prima previsione per guadagnare fino a 120 XP bonus per allenamento").

### 2.10 BASSA - MetricOrb nel header non interattivo

**Problema:** I 2 MetricOrb (Level Season e Missioni) nell'header sono puramente informativi. Non sono cliccabili, non scrollano alla sezione rilevante, non aprono un dettaglio. Occupano spazio prezioso senza essere azionabili.

**Proposta:** Renderli cliccabili (click su "Missioni" scrolla alle daily, click su "Level" apre il reward track) oppure ridurli a inline badges per liberare spazio header.

---

## 3. Criticita Engagement

### 3.1 CRITICA - Nessun senso di urgenza o scadenza

**Problema:** Le missioni daily scadono a mezzanotte e le weekly a fine settimana, ma non c'e NESSUN indicatore visivo di urgenza:
- Nessun countdown per le daily
- Nessun "2 giorni rimasti" per le weekly
- Nessuna notifica per missioni quasi completate (es. "Ti manca 1 sessione!")
- Il timer season nell'header (es. "32g 14h") non trasmette urgenza

**Impatto:** L'utente non ha motivo di tornare oggi piuttosto che domani. Le daily si resettano silenziosamente.

**Proposta:**
- Aggiungere countdown visivo per le daily ("Scade tra 6h")
- Banner/toast per missioni al 75%+ di completamento ("Ancora 1 azione per completare!")
- Indicatore "giorno della settimana" per le weekly (es. progress dots Lun-Dom)
- Colore urgenza (amber/red) quando mancano meno di 4h alla scadenza daily

### 3.2 CRITICA - Nessun meccanismo di streak

**Problema:** Non esiste alcun tracking di continuita. Un utente che completa missioni daily per 7 giorni consecutivi non riceve nessun beneficio rispetto a uno che lo fa 1 giorno su 7.

**Impatto:** Nessun incentivo a tornare il giorno dopo. Il sistema non premia la costanza, che e il comportamento piu prezioso in un'app fitness.

**Proposta:**
- **Daily streak counter** visibile nell'header (icona fiamma + numero)
- **Moltiplicatore XP** per streak (x1.2 dopo 3 giorni, x1.5 dopo 7, x2 dopo 14)
- **Streak shield** (1 skip gratuito a settimana) per ridurre l'ansia da streak
- Badge dedicati ai milestone di streak (7, 14, 30 giorni)
- Streak visibile nel profilo e nella leaderboard

### 3.3 CRITICA - Reward track monotona (solo badge)

**Problema:** Tutti e 12 i reward del battle pass sono badge (`BATTLE_PASS_REWARDS` in `season.ts:137-222`). Non c'e varieta nella tipologia di ricompense.

**Evidenza:**
```
Lv3: Badge  | Lv5: Badge  | Lv8: Badge  | Lv10: Badge
Lv14: Badge | Lv18: Badge | Lv20: Badge | Lv24: Badge
Lv28: Badge | Lv32: Badge | Lv36: Badge | Lv40: Badge
```

**Impatto:** Dopo i primi 2-3 badge, l'utente perde interesse perche "e sempre la stessa cosa". I badge non hanno utilita funzionale.

**Proposta:** Diversificare le ricompense:
- **Titoli** visualizzabili nel profilo ("Architetto del Ritmo", "Veterano Season 1")
- **Cornici avatar** esclusive per livello
- **Boost XP temporanei** (24h di x1.5 XP)
- **Slot extra previsione** (sblocca 4a previsione)
- **Temi/colori profilo** stagionali
- **XP bonus** maggiorato ai livelli intermedi (non solo rarity-based)
- Badge SOLO per i livelli milestone (10, 20, 30, 40)

### 3.4 ALTA - Leaderboard nascosta e statica

**Problema:** La leaderboard e sepolta in un accordion nella sidebar, mostra solo 5 entry, e non evidenzia la posizione dell'utente corrente.

**Evidenza:** `Season.tsx:636-666` - accordion "Classifica Season" con 5 entry senza highlight dell'utente. Il backend `getSeasonLeaderboard()` non ritorna la posizione dell'utente corrente.

**Impatto:** La competizione sociale, che e il motore di engagement #1 nei sistemi a season, e praticamente invisibile.

**Proposta:**
- Mostrare la posizione dell'utente SEMPRE (anche se e #47, mostrare #46, #47, #48)
- Widget leaderboard compatto nell'header con il rank personale
- Notifica "Sei stato superato da X" o "Hai superato X"
- Mini-leaderboard del club (competizione intra-club)
- Aggiungere un endpoint `getMySeasonRank(userId)` al backend

### 3.5 ALTA - Action XP cap troppo basso e opaco

**Problema:** Il cap giornaliero di Action XP e 90 (circa 6-10 azioni social). Il breakdown per tipo di azione non e visibile all'utente:
- Comment: 16 XP | Splash: 10 XP | Reaction: 8 XP | RSVP: 12 XP | Club post: 20 XP

**Evidenza:** `season_engagement.ts:24-30` - regole XP. `Season.tsx:322-335` - mostra solo 3 numeri generici (Oggi, Rimanenti, In attesa) senza alcun breakdown.

**Impatto:** L'utente non sa COME guadagnare Action XP. Vede solo "Oggi: 24 / Rimanenti: 66" senza capire cosa fare per avanzare. Il cap basso significa che dopo poche azioni non c'e piu incentivo.

**Proposta:**
- Mostrare breakdown azioni con XP per tipo (icone: commento 16XP, reaction 8XP, etc.)
- Suggerire l'azione piu remunerativa disponibile ("Scrivi un post nel club: +20 XP")
- Considerare un cap piu alto (150-200) o un cap progressivo che scala con il livello season

### 3.6 ALTA - Previsione Allenamento: troppo complessa, poco gratificante

**Problema:** La feature richiede di inserire fino a 4 metriche numeriche tecniche (distanza in metri, pace in sec/100m, durata in minuti, RPE 1-10). Dopo l'allenamento, l'utente deve tornare alla pagina, trovare l'accordion, e cliccare "Valuta ultima".

**Loop attuale:** Form 5 campi -> Nuota -> Torna in app -> Apri accordion -> Clicca "Valuta" -> Leggi score

**Evidenza:**
- `Season.tsx:370-447` - 4 `<Input type="number">` + 1 `<Input>` testo + 2 bottoni
- `season_engagement.ts:459-569` - valutazione manuale via mutation, non automatica
- `AutoSync.tsx` invalida `season.getCurrent` ma NON valuta le previsioni pendenti

**Proposta:**
- **Semplificare:** 1-2 slider invece di 4 input numerici (es. "Quanto vuoi nuotare?" slider da Leggero a Intenso)
- **Auto-valutazione:** dopo il sync dell'attivita in `AutoSync.tsx`, valutare automaticamente la previsione pendente e mostrare un toast celebrativo
- **Quick prediction:** un bottone "Prevedo 2km oggi" con preset basati sullo storico dell'utente
- **Gamificare:** mostrare "Precisione media: 72%" e sfidare a migliorarla

### 3.7 ALTA - Recap Video sottoutilizzato come engagement tool

**Problema:** Il Season Recap Video (`SeasonRecapComposition.tsx`) e una feature visivamente ricca (4 scene animate, 16 secondi, 1280x720) ma e relegato a un piccolo bottone "Recap video" nell'header. Non e condivisibile, non genera FOMO, non ha un momento di trigger naturale.

**Evidenza:**
- `Season.tsx:235` - unico punto di accesso: `<SeasonRecapDialog triggerLabel="Recap video" />`
- `SeasonRecapComposition.tsx` - video bello ma non scaricabile/condivisibile
- Nessun trigger automatico (es. fine settimana, raggiungimento livello, fine season)

**Proposta:**
- Generare un recap automatico a fine settimana con notifica "Il tuo recap settimanale e pronto!"
- Aggiungere bottone "Condividi" che esporta il video o un'immagine statica
- Trigger recap al raggiungimento di un nuovo livello
- Recap di fine season come celebrazione

### 3.8 MEDIA - Club Quest senza pressione sociale

**Problema:** La Club Quest mostra numeri assoluti (RSVP 2/5, Interazioni 3/8, Membri attivi 1/3) ma non mostra CHI sta contribuendo e chi no.

**Evidenza:** `Season.tsx:573-631` - mostra solo aggregati numerici, nessun avatar o nome membro. `season_engagement.ts:647-735` - il backend calcola `userActions` per utente ma non espone i contributori.

**Impatto:** Non c'e pressione sociale positiva. L'utente non vede che il suo compagno di club ha gia fatto 3 azioni e lui 0.

**Proposta:**
- Mostrare avatar dei membri che hanno contribuito questa settimana
- "Mario ha portato il team a 60%!" - feed di contribuzioni
- Notifica "Il tuo club e al 80%! Manca poco, fai un'azione!"
- Esporre top contributori dal backend

### 3.9 MEDIA - Nessun "next best action" suggerito

**Problema:** L'utente apre la pagina Season e deve capire da solo cosa fare. Non c'e nessuna guida contestuale tipo "La cosa piu impattante che puoi fare ora e...".

**Proposta:** Aggiungere una card "Prossima azione" in cima alla pagina che suggerisce l'azione con il miglior ROI in XP:
- Se ha una daily quasi completata: "Completa la missione X per +60 XP"
- Se non ha fatto azioni social: "Scrivi un commento nel feed per +16 XP"
- Se il club quest e al 90%: "Fai un'azione nel club per sbloccare 180 XP per tutti"
- Se ha una previsione pendente e un'attivita sync: "Valuta la tua previsione"

### 3.10 MEDIA - Nessun meccanismo di "loss aversion"

**Problema:** Il sistema mostra solo guadagni ("hai fatto X, guadagni Y"). Non c'e mai il senso di "stai perdendo qualcosa":
- Non c'e "Ieri hai perso 60 XP di daily non completate"
- Non c'e "Questa settimana hai perso 180 XP di weekly"
- Non c'e "Il tuo streak di 5 giorni si interrompe se non nuoti oggi"

**Proposta:** Aggiungere indicatori di opportunita mancata con tono motivazionale (non punitivo):
- "Ieri avresti potuto guadagnare 155 XP" (daily non completate)
- "Proteggi il tuo streak di 5 giorni!" (se il giorno sta per finire)

---

## 4. Criticita Sistema Badge / Season

### 4.1 CRITICA - Doppia identita dei badge: Reward vs Assignment

**Problema:** Il sistema Season ha **due concetti di badge paralleli** che confondono l'utente:

1. **Battle Pass Rewards** (`BATTLE_PASS_REWARDS` in `season.ts:137-222`): 12 badge che si sbloccano raggiungendo un livello specifico (Lv3, Lv5, Lv8...) e si "riscattano" manualmente per ottenere XP bonus.

2. **Badge Assignments** (`SEASON_BADGE_ASSIGNMENTS` in `season.ts:231-328`): 12 badge che si ottengono completando obiettivi specifici (8 sessioni tecniche, 7 giornate zone, etc.).

**I codici sono GLI STESSI** (S1-BDG-001 a S1-BDG-012) ma il significato e diverso:
- S1-BDG-005 nel Reward Track: "si sblocca al Lv3 e lo riscatti per 50 XP"
- S1-BDG-005 nelle Assignments: "completa 4 sessioni con cadenza controllata"

**Impatto:** L'utente vede lo stesso badge in 2 posti diversi con 2 significati diversi. Non capisce se lo ha gia ottenuto, se deve riscattarlo, o se deve completare l'obiettivo.

### 4.2 CRITICA - Season Hub mostra badge senza progress, Badges page li mostra con progress

**Problema:** Le stesse `badgeAssignments` vengono mostrate in 2 pagine con informazioni diverse:

| | Season Hub (`Season.tsx:677-698`) | Badges Page (`Badges.tsx:144-176`) |
|---|---|---|
| Nome | Si | Si |
| Obiettivo | Si | Si (come `description`) |
| Codice | Si | No |
| Rarita | Si | Si |
| **Progresso %** | **NO** | **Si** (calcolato da `seasonStats`) |
| **Valore attuale/target** | **NO** | **Si** (es. 5/14) |
| **Stato earned** | **NO** | **Si** |
| **Immagine** | Si (10x10) | Si (32x36, con glow effect) |

**Evidenza:**
- `season.ts:782`: ritorna `badgeAssignments: SEASON_BADGE_ASSIGNMENTS` - dati STATICI, nessun progress
- `Badges.tsx:144-176`: il frontend RICALCOLA il progress dai `seasonStats` + `progress.currentLevel`

**Impatto:** Nel Season Hub i badge appaiono come lista statica senza indicazione di quanto manca. Nella pagina Badges la stessa info e presentata meglio con progress bar. L'utente deve andare in un'altra pagina per capire a che punto e.

**Proposta:**
- Il backend `getCurrentSeasonState()` dovrebbe ritornare `badgeAssignments` GIA arricchite con `current`, `target`, `progress`, `earned` (come fa il frontend in Badges.tsx)
- Eliminare la duplicazione di logica di calcolo progress tra frontend (Badges.tsx:150-159) e nessuno (Season.tsx che non lo calcola affatto)

### 4.3 ALTA - Badge nella Season Hub appaiono come lista piatta, non come collection

**Problema:** Nel Season Hub (`Season.tsx:668-701`), i badge season sono mostrati come lista verticale di card con testo. Nella pagina Badges (`Badges.tsx:454-549`), gli stessi badge sono una griglia responsive con immagini grandi, effetti 3D hover, glow per rarita, e animazione unlock.

**Impatto:** La presentazione nel Season Hub non comunica il valore collezionistico dei badge. Non c'e il "effetto vitrina" che motiva a collezionarli.

**Proposta:**
- Sostituire la lista con una griglia visiva compatta (4-6 colonne di thumbnail badge)
- Badge earned con glow colorato per rarita, locked in grayscale
- Click apre dettaglio con progress (riutilizzare il modal gia presente in Badges.tsx)

### 4.4 ALTA - Tre query season attive contemporaneamente nel BadgeUnlockWatcher

**Problema:** Il `BadgeUnlockWatcher` (`BadgeUnlockWatcher.tsx:54-59`) esegue una query `season.getCurrent` con `refetchInterval: 30_000` che gira in background su OGNI pagina dell'app (e montato alla root in App.tsx). Insieme alle query della pagina Season stessa e del Dashboard, ci sono fino a **3 polling paralleli** sullo stesso endpoint.

**Evidenza:**
- `BadgeUnlockWatcher.tsx:54-59` - polling 30s globale
- `Season.tsx:52-57` - polling 30s sulla pagina Season
- `Dashboard.tsx` - polling sulla Dashboard
- Tutti interrogano `season.getCurrent` che fa **6 query SQL in parallelo** (`season.ts:724-731`)

**Impatto:** Carico inutile sul backend. Con 100 utenti attivi, sono 200+ query/minuto solo per il season state, di cui 2/3 ridondanti.

**Proposta:** Centralizzare il polling in un unico hook `useSeasonState()` condiviso, o usare React Query shared cache (che gia avviene se la staleTime e rispettata, ma i 3 componenti hanno `refetchOnMount: "always"` che bypassa la cache).

### 4.5 MEDIA - Season Launch Popup non collegato ai badge

**Problema:** Il `SeasonLaunchPopup` (`SeasonLaunchPopup.tsx`) annuncia "12 badge Season" come selling point ma:
- Non mostra un'anteprima dei badge
- Non spiega come ottenerli
- Il CTA "Entra nella Season" porta al Season Hub dove i badge sono sepolti nell'ultimo accordion della sidebar

**Proposta:** Aggiungere una preview grid dei badge nel popup, con rarita visibile, per creare desiderio collezionistico fin dal primo momento.

### 4.6 MEDIA - Immagini badge mappate S1 -> S2 senza spiegazione

**Problema:** In `seasonBadgeImages.ts`, tutti i codici S1-BDG-* puntano ai file S2-BDG-*.png. Il commento dice "Season 1 codes now render the newer S2 visual pack". Questo significa che le immagini sono state aggiornate ma i codici interni no.

**Evidenza:** `seasonBadgeImages.ts:1-3`:
```
"S1-BDG-001": "S2-BDG-001.png",  // S1 code -> S2 image
```

**Impatto:** Confusione per il developer. Se si aggiunge una Season 2 con codici S2-BDG-*, i codici collidono con le immagini gia usate dalla Season 1. Nessun impatto utente diretto, ma debito tecnico.

### 4.7 BASSA - Nessun badge per engagement sociale

**Problema:** Dei 12 badge season assignments, la distribuzione per metrica e:
- `cadenceControlSessions`: 3 badge (S1-BDG-001, S1-BDG-005, S1-BDG-012)
- `socialActions`: 3 badge (S1-BDG-003, S1-BDG-007, S1-BDG-009)
- `zoneBalanceDays`: 2 badge (S1-BDG-002, S1-BDG-006)
- `sessions`: 1 badge (S1-BDG-011)
- `strokeVariety`: 1 badge (S1-BDG-008)
- `eventRsvps`: 1 badge (S1-BDG-010)
- `seasonLevel`: 1 badge (S1-BDG-004)

**Mancano completamente:**
- Badge per streak (nessuna metrica streak esiste)
- Badge per previsioni (nessun legame con il sistema predictions)
- Badge per partecipazione club quest
- Badge per posizione leaderboard

**Proposta:** Aggiungere badge che incentivino le feature meno usate:
- "Oracolo": 5 previsioni con score > 75
- "Streak Master": 14 giorni consecutivi con almeno 1 missione daily completata
- "Team Player": 4 club quest completate nella season
- "Top 10": raggiungi la top 10 della leaderboard season

---

## 5. Problemi di Information Architecture

### 5.1 Navigazione confusa sotto /season

Le rotte sotto `/season` non sono coerenti:

| Rotta | Contenuto | Relazione con Season Hub |
|---|---|---|
| `/season` | Hub principale (questa pagina) | - |
| `/season/challenges` | Sfide (pagina separata) | Link nel nav, non nel Hub |
| `/season/leaderboard` | Leaderboard (pagina separata) | Duplicata nella sidebar del Hub |
| `/season/objectives` | Redirect a Goals | Contenuto non correlato alla season |

**Problema:** La leaderboard esiste sia come accordion nella sidebar Hub sia come pagina separata. Gli objectives rimandano a Goals che non e specifico della season. Le challenges non sono linkate dal Hub.

**Proposta:** Consolidare la navigazione:
- Il Season Hub dovrebbe essere il punto di ingresso unico
- Sotto-sezioni come tab interni (Missioni | Ricompense | Classifica | Badge) invece che pagine separate
- Rimuovere i redirect inutili

### 5.2 Duplicazione Season info nel Dashboard

Il Dashboard (`Dashboard.tsx`) mostra gia: nome season, livello, 3 MetricOrb (XP, giorni, missioni), leaderboard, bottone recap. Questo crea ridondanza con il Season Hub.

**Proposta:** Il Dashboard dovrebbe mostrare un widget compatto "Season snapshot" con 1-2 metriche chiave (Level + Streak) e 1 CTA ("Vai al Season Hub") invece di duplicare meta dell'interfaccia.

### 5.3 Badge sparsi su 3 pagine senza coerenza

I badge season appaiono in 3 posti diversi con 3 presentazioni diverse:

| Pagina | Cosa mostra | Come |
|---|---|---|
| Season Hub | Badge Assignments (12) | Lista testo senza progress |
| Badges Page | Badge Assignments (12) calcolati da seasonStats | Grid con immagini, glow, progress bar, modal dettaglio |
| Season Hub | Reward Track (12) | Lista con immagine piccola + bottone riscatta |

**Proposta:**
- Unificare la visualizzazione badge in un componente riutilizzabile `<SeasonBadgeGrid />`
- Nel Season Hub mostrare una versione compatta (grid 6 colonne, thumbnail)
- Click rimanda alla pagina Badge con filtro "Season" pre-selezionato

---

## 6. Proposte di redesign riassuntive

### 6.1 Ristrutturazione pagina Season Hub (priorita 1)

Sostituire gli 8 accordion con una struttura a **3 zone + tab**:

```
[HEADER]
  Season name + Level badge + XP bar + Rank #N + Streak flame
  CTA: "Prevedi il tuo allenamento" (bottom-sheet)

[ZONA OGGI - sempre visibile, non collassabile]
  Card "Prossima azione" (suggerimento contestuale)
  Missioni daily con countdown + progress bars
  Action XP barra con breakdown per tipo azione
  Previsione pendente (se esiste) con CTA "Valuta"

[TAB: Settimana | Ricompense | Classifica | Badge]
  Settimana:
    - Weekly missions con indicatore giorno settimana
    - Club Quest con avatar contributori
  Ricompense:
    - Reward track come timeline orizzontale (stile Fortnite)
    - Badge grayed-out vs sbloccati
  Classifica:
    - Top 10 + posizione utente evidenziata
    - Mini leaderboard club
  Badge:
    - Grid collection compatta con progress overlay
    - Link "Vedi tutti" -> pagina Badge con filtro Season
```

### 6.2 Unificare sistema badge Season/Reward (priorita 2)

- Backend: arricchire `badgeAssignments` con `current`, `target`, `progress`, `earned`
- Creare componente condiviso `<SeasonBadgeGrid />` usato da Season Hub e Badges page
- Distinguere visivamente Reward Track (sblocchi per livello) da Assignments (sblocchi per obiettivo)
- Risolvere la doppia identita S1-BDG-* (reward vs assignment)

### 6.3 Sistema Streak (priorita 3)

- Aggiungere campo `currentStreak` / `longestStreak` calcolato dalle daily missions
- Mostrare streak nell'header Season + profilo + leaderboard
- Moltiplicatore XP per streak attivo
- Badge milestone streak (7, 14, 30 giorni)
- Streak shield: 1 skip gratuito a settimana

### 6.4 Semplificazione Previsioni (priorita 4)

- Quick prediction con preset ("Leggero / Medio / Intenso") basati sullo storico
- Auto-valutazione post-sync in `AutoSync.tsx`
- Storico con trend di precisione visibile
- Badge "Oracolo" per previsioni accurate

### 6.5 Reward diversificati (priorita 5)

- Introdurre titoli, cornici avatar, boost XP nel battle pass
- Badge solo per milestone (non per ogni livello)
- XP bonus variabile (non solo legato alla rarity)

### 6.6 Social & competition layer (priorita 6)

- Leaderboard prominente con posizione utente
- Club Quest con avatar contributori e feed contribuzioni
- Notifiche "Sei stato superato" / "Il tuo club e quasi al traguardo"
- Recap video condivisibile e con trigger automatici

### 6.7 Ottimizzazione polling (priorita 7)

- Centralizzare season polling in un hook condiviso
- Rimuovere `refetchOnMount: "always"` dove non necessario
- Considerare websocket per aggiornamenti real-time

---

## 7. Metriche di successo suggerite

| Metrica | Stato attuale stimato | Target |
|---|---|---|
| Tempo medio su pagina Season | Basso (bounce da overload) | +40% |
| Daily mission completion rate | Basso (no urgenza) | +60% |
| Prediction feature adoption | Molto basso (form complesso) | +200% |
| Ritorno giornaliero a Season Hub | Basso (no streak) | +80% |
| Club Quest completion rate | Medio (no social pressure) | +30% |
| Reward claim rate | Medio | +20% |
| Badge collection awareness | Basso (nascosti in sidebar) | +100% |
| Recap video views | Molto basso (bottone nascosto) | +300% |

---

## 8. File coinvolti

| File | Ruolo | Tipo modifica |
|---|---|---|
| `client/src/pages/Season.tsx` | Pagina principale | Redesign completo |
| `client/src/pages/Badges.tsx` | Pagina badge | Dedup logica season badge |
| `client/src/components/BadgeUnlockWatcher.tsx` | Watcher globale | Ottimizzare polling |
| `client/src/components/SeasonLaunchPopup.tsx` | Popup lancio | Badge preview, onboarding |
| `client/src/components/video/SeasonRecapComposition.tsx` | Video recap | Trigger automatici, share |
| `client/src/components/video/SeasonRecapDialog.tsx` | Dialog recap | Rendere piu accessibile |
| `client/src/lib/seasonBadgeImages.ts` | Mapping immagini | Risolvere S1->S2 confusion |
| `server/season.ts` | Backend core | Arricchire badge con progress, streak, diversificare reward |
| `server/season_engagement.ts` | Backend engagement | Auto-eval predictions, esporre contributori club quest |
| `server/routers/gameplay.router.ts` | API endpoints | Nuovi endpoint (streak, rank, contributori) |
| `client/src/pages/Dashboard.tsx` | Dashboard | Widget season compatto |
| `client/src/components/AutoSync.tsx` | Sync attivita | Auto-valutazione previsioni |
| `client/src/App.tsx` | Rotte | Consolidare /season/* |
