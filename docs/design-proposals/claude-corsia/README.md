# Proposta di veste grafica «Corsia» (Claude)

Proposta solo visiva per la web app mobile di SwimForge. **Non modifica il codice dell'app.** Serve per confrontarla con altre proposte, per esempio quella di Antigravity.

- Canvas interattivo originale (privato, visibile solo al proprietario): https://claude.ai/artifact/VqYcNrg6K7FxwR7h7sAwVn
- Data: 27 ottobre 2026

## Contenuto della cartella

| Percorso | Cosa contiene |
|---|---|
| `renders/*.png` | Immagini statiche di ogni tavola (2x). Partire da qui. |
| `screenshots/prima-*.png` | Screenshot dell'app attuale a 390px, avviata in locale con dati di esempio. |
| `mockups/*.dc.html` | Sorgenti HTML delle tavole, con stili inline. |
| `mockups/support.js` | Mini runtime che rende apribili i `.dc.html` in un browser normale. |
| `tokens.json` | Palette e tipografia proposte, in formato leggibile da una macchina. |

Per aprire i mockup in un browser bisogna servirli via HTTP, perché `AttivitaChiaro` carica `Attivita` con fetch:

```bash
cd docs/design-proposals/claude-corsia
npx serve .        # oppure: python3 -m http.server
# poi apri /mockups/Feed.dc.html, /mockups/Attivita.dc.html, ...
```

Tavole: `Main` (sistema visivo), `Prima` (audit), `Feed` (Home social), `Attivita`, `AttivitaChiaro`, `Sessione` (dettaglio), `Season`.

## Audit: cosa non funziona oggi

1. **Font mai caricati.** In `client/src/index.css` sono dichiarati Manrope e Rajdhani (`--font-sans`, `--font-display`), ma nessun `<link>` o `@font-face` li carica. L'app quindi usa il font di sistema.
2. **Cinque accenti neon.** Cyan, lime, corallo, arancio e viola, con alone luminoso (`--neon-glow`) su bottoni, nav e card. Nessun elemento emerge davvero.
3. **Testo sopra foto.** Le card attività hanno la foto della piscina come sfondo. Nel tema chiaro titolo, data ed etichette diventano quasi invisibili.
4. **Segmented control illeggibile.** Nel tema scuro, il filtro attivo «Tutte» è bianco su gradiente cyan→lime.
5. **Lingua mista.** «Training», «Activity Tracker», «Season Hub», «Social Home Feed» e date in formato US («Oct 27 · 10:47 AM»).
6. **Copy da desktop su mobile.** «seleziona a sinistra e analizza i dettagli a destra», mentre su mobile il dettaglio finisce sotto la lista.
7. **Etichette da 10px** in MAIUSCOLO spaziato; anelli metrica decorativi, e SWOLF vuoto mostra «—» dentro un cerchio.
8. **Tema chiaro spento.** Il fondo `oklch(0.87 0.022 232)` è grigio-azzurro e rende il contrasto basso.
9. **Navigazione duplicata.** La bottom bar in `app-shell.tsx` (Home, Training, Crea, Club, Sezioni) convive con `MobileNav.tsx` e `app/app-bottom-nav.tsx` (Social, Track, Sfide, Club, Profilo).
10. **Titoli ripetuti.** Nella Season compaiono insieme «SEASON DASHBOARD», «Season Hub» e «Season Electric Ice».

## Principi della proposta

- **Un accento per schermata.** L'azzurro `#34C6EB` è riservato alle azioni. L'arancio «forgia» `#FF8B47` appare solo per XP, livello e record. Niente glow e niente gradienti decorativi.
- **I numeri sono protagonisti.** Le metriche usano Barlow Condensed 700 con unità più piccola e in grigio. Gli anelli decorativi spariscono.
- **Mai testo su foto.** Le foto diventano miniature o banner con velo pieno.
- **Leggibilità.** Il testo non scende mai sotto i 12px, le etichette sono in minuscolo, il contrasto è almeno 4.5:1 e i target touch sono di almeno 44px.
- **Tutto in italiano.** Si usa «Allenamento», «Acque libere» e date come «lun 27 ott · 10:47».
- **Navigazione unica a 5 voci.** Home, Allenamento, **+** (registra/crea), Season, Club. Il profilo si raggiunge dall'avatar in alto. Dentro «Allenamento» ci sono le sotto-schede Sessioni, Obiettivi, Statistiche e Coach AI, al posto del menu «Sezioni».

## Palette e tipografia

Valori completi in `tokens.json`.

| Ruolo | Scuro | Chiaro «Cloro» |
|---|---|---|
| Fondale | `#0A1520` | `#F4F7F9` |
| Superficie (card) | `#111E2B` | `#FFFFFF` |
| Rialzo | `#182838` | `#E7EDF2` |
| Bordo | `#233649` | `#DCE4EA` |
| Testo | `#ECF3F8` | `#0D1B27` |
| Testo secondario | `#93A6B8` | `#556677` |
| Azione (riempimento) | `#34C6EB` su testo `#062030` | `#34C6EB` su testo `#062030` |
| Azione (testo/icona) | `#34C6EB` | `#0577A8` |
| XP / forgia | `#FF8B47` | `#C2500F` |
| Successo | `#5CD6A0` | — |
| Errore | `#FF6B6B` | — |

Tipografia:

- **Barlow Condensed** 600/700 per titoli di pagina e numeri.
- **Manrope** 400–700 per testo e interfaccia: corpo 15px, titoli card 17px, etichette 12px.

Entrambi i font sono su Google Fonts.

## Note per chi deve confrontare o implementare

- La proposta si appoggia ai token esistenti (`--background`, `--card`, `--primary`, `--accent`…), quindi gran parte del cambio passa da `client/src/index.css`. Vanno anche caricati davvero i font e ridotte le classi «neon» e «glow».
- I dati nelle schermate sono di esempio.
