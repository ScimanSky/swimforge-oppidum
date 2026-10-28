# Fase 2 — Veste grafica «Corsia»: design (28 ottobre 2026)

Stato: **approvato dal proprietario il 28/10/2026**. Contesto: `docs/ANDROID_APP_PLAN.md` §5 Fase 2,
proposta visiva in `docs/design-proposals/claude-corsia/` (README, `tokens.json`, `renders/*.png`).

## Obiettivo
Sostituire lo stile «neon» (cinque accenti, glow, gradienti, etichette da 10px in maiuscolo,
lingua mista) con il sistema «Corsia» su **tutto il client React**, quindi sia sul sito
`swimforge.it` sia nell'app Android, e introdurre la navigazione a cinque voci con la nuova
schermata **Oggi**. Nessuna nuova funzione di allenamento: quella è la fase 3.

## 1. Decisioni del proprietario (28/10/2026)
1. **Stile unico web e app.** Il sito si apre sul Feed (resta social-first), l'app su Oggi.
2. **Gamification:** livello, XP e badge nel **profilo** (più una striscia compatta su Oggi);
   classifiche e sfide nella tab **Community** insieme ai club.
3. **Niente tavole preliminari** per le schermate non coperte da Corsia: si implementa
   seguendo le regole del sistema e si verifica nell'app tramite App Distribution.
4. **Approccio «prima i fondamentali»** (sotto), scelto tra tre alternative: riscrittura da
   zero (troppo lunga e rischiosa) e tema separato sotto flag (due stili da mantenere).

## 2. Approccio
1. **Fondamenta:** token, font, componenti e classi condivise. Tutta l'app cambia aspetto in
   un colpo senza toccare le pagine.
2. **Shell e navigazione:** barra a cinque voci, header, barra laterale desktop, hub Allena e
   Community, rotta `/today`.
3. **Schermate chiave:** Oggi (nuova), Feed, Attività e dettaglio, Profilo.
4. **Pulizia pagina per pagina** delle pagine visibili: italiano, niente maiuscolo spaziato,
   testo ≥ 12px, niente testo su foto, niente gradienti decorativi.
5. **Rinomina finale** dei nomi legacy (`electric-*`, varianti `neon`) e controllo
   automatico che ne impedisce il ritorno.

## 3. Fondamenta

### 3.1 Token (`client/src/index.css`)
I valori arrivano da `tokens.json`. Il tema scuro resta la classe `.dark` (default), il chiaro
«Cloro» è `:root`.

| Token CSS | Scuro | Chiaro «Cloro» | Ruolo Corsia |
|---|---|---|---|
| `--background` | `#0A1520` | `#F4F7F9` | fondale |
| `--card`, `--popover` | `#111E2B` | `#FFFFFF` | superficie |
| `--secondary`, `--muted`, `--card-elevated` | `#182838` | `#E7EDF2` | rialzo |
| `--border`, `--input` | `#233649` | `#DCE4EA` | bordo |
| `--foreground` | `#ECF3F8` | `#0D1B27` | testo |
| `--muted-foreground` | `#93A6B8` | `#556677` | testo secondario |
| `--primary` | `#34C6EB` | `#34C6EB` | azione (riempimento) |
| `--primary-foreground` | `#062030` | `#062030` | testo su azione |
| `--action-text` (nuovo) | `#34C6EB` | `#056A96` | azione come testo/icona |
| `--xp` (nuovo) | `#FF8B47` | `#983F0C` | XP, livello, record |
| `--success` | `#5CD6A0` | `#116846` | successo |
| `--destructive`, `--danger` | `#FF7B7B` | `#A62B2B` | errore |
| `--ring` | `#34C6EB` | `#056A96` | focus |

- Nel chiaro gli accenti come testo (azione, XP, successo, errore, avviso `#785400`, oro
  `#74570E`) sono scuriti rispetto a `tokens.json` quanto basta per superare 4.5:1 sul
  fondale, sulla superficie e sul rialzo, **anche dentro i chip colorati al 15%**; nel
  scuro l'errore passa da `#FF6B6B` a `#FF7B7B` per lo stesso motivo. Il test di contrasto
  (§6) verifica testi semplici e chip. Ogni tema dichiara `color-scheme`.
- I token derivati (alias legacy, `--sidebar-*`, …) stanno in un blocco `:root, .dark` così
  un sotto-albero `.dark` locale li ricalcola con i valori scuri.
- Il tema è applicato prima del primo disegno da `client/public/theme-init.js` (script
  esterno: la CSP vieta gli script inline), quindi niente lampo chiaro all'avvio.
- **Alias legacy** durante la transizione: `--electric-cyan` → azione, `--electric-lime` →
  successo, `--electric-coral` → errore, `--forge-orange` → XP, `--electric-violet` →
  testo secondario. `--neon-glow`, `--neon-soft`, `--forge-glow`, `--surface-glow` diventano
  `transparent`: gli aloni spariscono ovunque senza toccare i componenti.
- `--accent` diventa il rialzo (oggi è il lime): in shadcn `accent` è lo sfondo hover dei menu.
  Gli usi «lime» nelle pagine passano a `xp`, `success` o testo secondario; `text-primary`
  come testo diventa `text-action-text` (nel chiaro il riempimento `#34C6EB` non è leggibile
  come testo).
- Grafici: `--chart-1..5` = azione, `#2C8FB8`, `#5CD6A0`, `#FFB27A`, XP. Zone cardio:
  `--zone-1..5` = `#3D5770`, `#2C8FB8`, `#34C6EB`, `#FFB27A`, `#FF8B47`.
- Raggi: chip 999px, controlli 12px, card 16px, hero 18px (`--radius` = 12px).

### 3.2 Font
- `@fontsource/barlow-condensed` (600, 700) e `@fontsource/manrope` (400–700), licenza OFL,
  importati in `main.tsx`: Vite li include nel bundle, quindi funzionano offline nell'app e
  sul web senza Google Fonts.
- `--font-sans` = Manrope, `--font-display` = Barlow Condensed (Rajdhani esce).
- Scala: numero metrica 44–60px Barlow 700; titolo pagina 30px Barlow 700; titolo card
  16–17px Manrope 700; corpo 15px/1.5 Manrope 400; etichetta 12px Manrope 600 (minimo).
- Numeri tabulari (`font-variant-numeric: tabular-nums`) nelle metriche.

### 3.3 Componenti e classi condivise
- `Button`: le varianti `neon`, `outline-neon`, `ghost-neon` vengono ridefinite piatte
  (riempimento azione, contorno, testo azione), senza glow, maiuscolo e tracking. Anche
  `default` perde il glow e il sollevamento. Altezza minima 44px.
- `.surface-panel` diventa la card Corsia: fondo `--card`, bordo 1px `--border`, raggio 16px,
  niente gradiente, blur, ombra o riflesso `::before`. Le varianti in `.compact-shell` e
  `.dashboard-shell` perdono il bordo neon.
- `.glass-panel`, `.sf-social-card`, `.sf-activity-card`, `.bento-surface`, `.neon-outline`,
  `.ei-border-gradient` → superfici piatte. `.neon-gradient-text` → testo normale.
  `.ei-blob*`, `.ei-bg-grid`, `.orb-lane` → nascosti. `.sf-activity-badge` → chip XP in
  minuscolo da 12px. `.sf-wordmark` → senza maiuscolo spaziato.
- Nuovi primitivi in `client/src/components/corsia/`:
  - `Metric`: valore Barlow 700, unità più piccola in grigio, etichetta 12px. Varianti di
    colore: neutro, azione (passo), XP.
  - `SectionTabs`: sotto-schede a link (sottolineatura azione sulla voce attiva), scorrevoli
    in orizzontale su schermi stretti.
  - `Chip`: neutro, XP (`+180 XP`), successo (`Record 200m`).
  - `LevelCard` e `LevelStrip`: livello, XP al prossimo livello, barra arancio (nessun nuovo
    endpoint: la posizione in classifica resta nella pagina Classifiche).
  - `WeekBars`, `ActivityCard`: barre della settimana e card attività condivise da Oggi,
    Attività e Feed.
  - Il titolo della pagina sta nell'header della shell (Barlow 26px), non in un componente
    di pagina.

### 3.4 Date e numeri
- `lib/format.ts`: `formatSessionDate(date)` → «lun 27 ott · 10:47», `formatDayMonth(date)` →
  «27 ott», sempre `it-IT`. Le due chiamate `en-US` e le chiamate senza locale passano ai
  formatter. Separatore decimale italiano (`3,2 km`).

### 3.5 Tema chiaro e app
- Il selettore tema esce dall'header e va nel profilo (sezione «Aspetto»: Scuro, Chiaro).
- Nativo: al cambio tema `StatusBar.setStyle` e `setBackgroundColor` seguono il fondale
  (`#0A1520` o `#F4F7F9`). Lo splash resta `#0A1520`.

## 4. Navigazione e shell (`components/app/app-shell.tsx`)
- **Barra in basso** (mobile web e app), cinque voci: **Oggi** `/today` · **Feed** `/home` ·
  **+** · **Allena** `/track` · **Community** `/home/community`. Il «+» è un pulsante pieno
  azione al centro. Voce attiva: icona e testo colore azione, nessun gradiente. Etichette
  12px. Altezza 64px.
- Il menu «Sezioni» e la lista `quickAccessItems` a nove voci spariscono.
- **Header:** pulsante indietro sulle pagine di dettaglio, titolo della pagina (logo su Feed),
  campanella notifiche, messaggi, avatar con menu: Profilo, Impostazioni, Moderazione (solo
  admin), Esci.
- **Desktop (≥ 1024px):** barra laterale con le stesse cinque voci (il «+» come pulsante
  «Crea»); l'avatar resta nell'header; niente gradienti, voce attiva con fondo rialzo.
- **Shell persistente:** montata una volta sopra le rotte autenticate (le pagine continuano a
  usare `<AppLayout>`, che dentro la shell non disegna nulla); il caricamento di una pagina
  mostra un indicatore nel contenuto, la barra in basso non sparisce.
- **Indietro:** torna nella cronologia solo se la voce precedente è dell'app (indice salvato
  nello stato della cronologia); altrimenti va alla pagina padre, così da un link esterno non
  si esce dal sito.
- **Il «+»** apre un foglio dal basso: Nuovo post, Messaggio, Bozza IA del post, Sincronizza
  Garmin.
- **Hub con sotto-schede** (`SectionTabs` sotto il `PageHeader`):
  - Allena: Attività `/track` · Obiettivi `/goals` · Statistiche `/profile/performance` ·
    Coach AI `/coach`. `/track/:id` resta sotto Allena.
  - Community: Club `/home/community` · Classifiche `/leaderboard` · Sfide `/challenges`.
  - I badge si raggiungono dal profilo (`/badges` resta come pagina).
- **Rotte:** nuova `/today`. Su nativo `postLoginPath()` e la rotta `/` portano a `/today`;
  sul web restano `/home` e la landing pubblica. Nessuna rotta esistente cambia indirizzo
  (link, push e deep link continuano a funzionare).
- Titoli in italiano: «Feed», «Allena», «Attività», «Obiettivi», «Statistiche», «Coach AI»,
  «Community», «Classifiche», «Sfide», «Badge», «Profilo», «Impostazioni», «Messaggi».

## 5. Schermate

### 5.1 Oggi (`/today`, nuova)
Dall'alto:
1. Sotto il titolo «Oggi» dell'header, la data (es. «mer 29 ott»).
2. **Questa settimana:** km totali (Barlow), numero di nuotate, XP della settimana in arancio,
   barre per giorno lun–dom con oggi evidenziato. Dati: `activities.list` filtrato sulla
   settimana corrente (lunedì–domenica, ora locale).
3. **Ultima nuotata:** card attività (§5.3) con quattro metriche e, se c'è, la prima riga del
   commento del coach; tocco → dettaglio.
4. **Striscia livello:** «Livello 12 · 580 XP al 13» con barra arancio; tocco → profilo.
   Dati: `profile.get`.
5. **Azioni rapide** (griglia 2×2): Sincronizza Garmin, Nuovo post, Coach AI, Obiettivi.
- Stati vuoti: Garmin non collegato → card «Collega Garmin» al posto delle azioni; nessuna
  attività → invito a sincronizzare. Caricamento con scheletri, errori con riprova.
- La card «Sessione di oggi» arriva in fase 3; nessun segnaposto ora.

### 5.2 Feed (`/home`)
Come la tavola `renders/Feed.png`, senza la riga delle storie: sotto-schede Per te · Seguiti ·
Club, post con avatar, testo, card attività compatta (tre `Metric`), chip record, reazioni,
commenti, condivisione. Foto e video del post restano media a tutta larghezza senza testo
sovrapposto.

### 5.3 Allena · Attività (`/track`, `/track/:id`)
- Lista come `renders/Attivita.png`: card «Questa settimana» in testa, filtro segmentato
  Tutte · Vasca · Acque libere (attivo = fondo testo chiaro su scuro, leggibile), card
  attività con icona onde (vasca azzurra, acque libere verde), titolo, data, luogo/vasca, chip
  XP, quattro metriche (distanza, durata, passo /100 in azione, FC media). La foto di sfondo
  diventa al più una miniatura 48px.
- Dettaglio come `renders/Sessione.png`: data e fonte, titolo Barlow, chip XP e record,
  griglia 2×3 di metriche, passo per ripetuta (barre con linea obiettivo quando esiste),
  zone cardio con la palette `--zone-*`, pulsanti «Condividi nel feed» e coach AI. I grafici
  esistenti restano, ricolorati; spariscono gli anelli decorativi e il «—» nei cerchi.

### 5.4 Allena · Obiettivi, Statistiche, Coach AI
Pulizia (§5.7) sotto l'header e le sotto-schede della shell; nessun cambio di funzione.

### 5.5 Community · Club, Classifiche, Sfide
Pulizia sotto l'header e le sotto-schede della shell. Le pagine del singolo club ricevono
la pulizia generale.

### 5.6 Profilo (`/profile`)
In testa `LevelCard` (come la card livello di `renders/Season.png`, senza stagione né
missioni), poi anteprima badge (griglia, «Vedi tutti» → `/badges`), dati personali, accessi
a Statistiche e Impostazioni, sezione Aspetto (§3.5).

### 5.7 Pulizia generale (tutte le pagine visibili)
- Tutto in italiano (via etichette inglesi residue: «Training», «Activity Tracker»,
  «Challenges», «Leaderboard», «Statistics», «Badges», «Social Home Feed», …).
- Etichette in minuscolo (sentence case), niente `uppercase` con tracking largo.
- Testo minimo 12px (`text-[9px|10px|11px]` → `text-xs`).
- Niente testo sopra foto; niente gradienti decorativi; un solo accento per schermata.
- Copy da desktop corretto su mobile («seleziona a sinistra…»).
- Le pagine dietro flag spenti (gare e storico club) ricevono solo i token, non il passaggio
  manuale.

## 6. Controlli automatici
- **Test «design-lint»** (vitest) che scansiona `client/src/**/*.tsx`: vieta
  `text-[9px]`, `text-[10px]`, `text-[11px]`, `neon-glow`, `neon-soft`, `forge-glow`,
  `shadow-[0_0_` e, dopo la rinomina, `electric-` e le varianti `neon`. Eccezioni solo con
  allowlist esplicita nel test.
- **Test di contrasto** sui token: testo e testo secondario su fondale, superficie e rialzo
  ≥ 4.5:1 in entrambi i temi; testo su azione ≥ 4.5:1; azione come testo ≥ 4.5:1 su fondale.
- I test UI esistenti (`Activities.ui.test.tsx`, `SocialFeed.mobile.test.tsx`,
  `CreatePostSheet.mobile.test.tsx`) vengono aggiornati alle nuove etichette.

## 7. App Android
- Safe area: nessun `viewport-fit=cover`. Capacitor 8 (plugin SystemBars, `insetsHandling`
  «css» di default) tiene la WebView dentro le barre di sistema, come oggi. Verifica sul
  Pixel 8a con navigazione a gesti.
- Build di prova dal branch con `pnpm android:distribute` (versionCode crescente) dopo ogni
  gruppo di lavoro visibile.

## 8. Rilascio e verifica
- Branch `android/phase-2`, una sola PR verso `main` (il merge aggiorna anche il sito).
- Prima del merge: `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm build:native`,
  **avvio locale di `node dist/index.js`** con variabili fittizie e risposta 200 di `/healthz`
  e `/` (lezione dell'hotfix del 28/10), screenshot a 390px e 1280px delle schermate
  principali nei due temi, prova sul Pixel tramite App Distribution, review finale.
- Dopo il merge: deploy Oracle e controllo esterno `https://swimforge.it/ready`.

## 9. Fuori ambito
- Cuore allenamento (sessioni pianificate, calendario, bordo vasca, CSS e zone): tavole e
  codice all'inizio della fase 3 con questo sistema.
- Obiettivo settimanale in km («12,7 su 15»): arriva con il check-in settimanale (fase 4).
- Nuove funzioni social, animazioni nuove, icona dell'app.

## 10. Rischi
- **Regressioni visive** in pagine poco usate: le fondamenta cambiano tutto in un colpo;
  mitigazione con screenshot e passaggio manuale sulle pagine visibili.
- **Testo da 12px minimo** può rompere layout stretti (chip, tabelle): da verificare a 390px.
- **Tema chiaro**: oggi poco curato; i token Cloro e il test di contrasto lo rendono
  leggibile, ma le pagine con colori fissi (`text-white`, `bg-black/…`) vanno ripulite.
- **Tempi:** 3–4 giorni di lavoro degli agenti come da piano; il passaggio manuale si
  limita alle pagine raggiungibili dalla navigazione.
